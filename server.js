import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { execFile } from 'node:child_process';
import { sizeCandidate, validateCandidatePrecision, normalizeCandidatePrices } from './v2/scripts/execution_sizing.js';
import { buildDemoEntryOrder, canSendDemoEntry, demoExecutionGate } from './v2/scripts/demo_entry_executor.js';
import { buildProtectionOrders, verifyEntryFill, buildEmergencyCloseOrder } from './v2/scripts/demo_protection.js';
import { reconcileDemoState, selectReconciliationCandidates } from './v2/scripts/demo_reconciliation.js';
import { monitorProtectionState, readinessBlockers } from './v2/scripts/demo_monitoring.js';
import { buildRecoveryPlan } from './v2/scripts/demo_recovery.js';
import { summarizeDemoDryRun } from './v2/scripts/demo_cycle.js';
import { validateCandidateFreshness } from './v2/scripts/candidate_freshness.js';
import { runStartupRecovery as selectAndRunStartupRecovery } from './v2/scripts/startup_recovery.js';
import { startBinanceMarketStream, getBinanceStreamPrices, getBinanceStreamCandles, getBinanceStreamState, onClosedCandle } from './v2/scripts/binance_market_stream.js';
import { startBinanceUserStream, stopBinanceUserStream, getBinanceUserStreamState } from './v2/scripts/binance_user_stream.js';
import { closeReasonFromClientOrderId } from './v2/scripts/telegram_execution.js';
import { restorePendingLifecycle } from './v2/scripts/pending_lifecycle_recovery.js';
import { findActiveSessionId } from './v2/scripts/recovery_session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
let binanceCircuitOpenUntil = 0;
let binanceRateLimitReason = null;
let binanceServerTimeOffsetMs = 0;
let binanceServerTimeSyncedAt = 0;
async function syncBinanceServerTime(force = false) {
  if (!force && Date.now() - binanceServerTimeSyncedAt < 30_000) return binanceServerTimeOffsetMs;
  const started = Date.now();
  const response = await fetchBinance(EXCHANGES.binanceTestnet.base + '/fapi/v1/time', { signal: AbortSignal.timeout(5_000) });
  const data = await response.json();
  if (!response.ok || !Number.isFinite(Number(data.serverTime))) throw new Error('BINANCE_SERVER_TIME_UNAVAILABLE');
  const midpoint = started + Math.floor((Date.now() - started) / 2);
  binanceServerTimeOffsetMs = Number(data.serverTime) - midpoint;
  binanceServerTimeSyncedAt = Date.now();
  return binanceServerTimeOffsetMs;
}
function binanceTimestamp() { return Date.now() + binanceServerTimeOffsetMs; }
async function signedBinanceRequest(apiKey, secret, method, apiPath, params = {}) {
  await syncBinanceServerTime();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const query = new URLSearchParams({ ...params, recvWindow: '10000', timestamp: String(binanceTimestamp()) });
    const queryString = query.toString();
    const response = await fetchBinance(EXCHANGES.binanceTestnet.base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secret, queryString), { method, headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (response.ok) return data;
    if (response.status === 400 && /timestamp.*(?:recvWindow|ahead of the server)|outside of the recvWindow/i.test(data?.msg || text)) {
      await syncBinanceServerTime(true);
      continue;
    }
    throw new Error(`BINANCE_${method}_${apiPath}_${response.status}: ${data?.msg || text.slice(0, 300) || 'empty response'}`);
  }
  throw new Error(`BINANCE_${method}_${apiPath}_TIMESTAMP_SYNC_FAILED`);
}
async function fetchBinance(url, options = {}) {
  if (Date.now() < binanceCircuitOpenUntil) throw new Error(binanceRateLimitReason || 'Binance request circuit open');
  const response = await fetch(url, options);
  if (response.status === 418 || response.status === 429) {
    const text = await response.clone().text();
    const match = text.match(/(?:banned until|retryAfter["': ]+)(\d{10,13})/i);
    binanceCircuitOpenUntil = Number(match?.[1] || 0) > Date.now() ? Number(match[1]) : Date.now() + 60_000;
    binanceRateLimitReason = `Binance rate limit ${response.status}; circuit open until ${new Date(binanceCircuitOpenUntil).toISOString()}`;
  }
  return response;
}
const BINANCE_PUBLIC_HEADERS = { accept: 'application/json', 'user-agent': 'JEV-Trading-Bot/1.0' };

let exchangeInfoCache = null;
let exchangeInfoPromise = null;
async function fetchExchangeInfo() {
  if (exchangeInfoCache && Date.now() - exchangeInfoCache.at < 300_000) return exchangeInfoCache.data;
  if (exchangeInfoPromise) return exchangeInfoPromise;
  let lastError;
  exchangeInfoPromise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchBinance(EXCHANGES.binanceTestnet.base + '/fapi/v1/exchangeInfo', { headers: BINANCE_PUBLIC_HEADERS, signal: AbortSignal.timeout(10_000) });
        const data = await response.json();
        if (response.ok && Array.isArray(data.symbols)) { exchangeInfoCache = { at: Date.now(), data }; return data; }
        lastError = new Error(data?.msg || `exchangeInfo HTTP ${response.status}`);
      } catch (error) { lastError = error; }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
    throw lastError || new Error('exchangeInfo failed');
  })();
  try { return await exchangeInfoPromise; } finally { exchangeInfoPromise = null; }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://www.okx.ac https://okx.ac; img-src 'self' data:; frame-ancestors 'none'");
  if (isHttps) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !['/api/login', '/api/register'].includes(req.path)) return csrf(req, res, next);
  next();
});

// ponytail: single-process memory session store. upgrade to Redis when multi-instance needed.
const sessions = new Map();
const botStates = new Map();
const botRunners = new Map();
const demoCycleSummaries = new Map();
const demoExecutionSummaries = new Map();
const executionAttempts = new Map();
const marketObservers = new Map();
const MARKET_INTERVAL_MS = 15 * 60_000;
const EXECUTION_INTERVAL_MS = 5_000;
const telegramSent = new Set();
const telegramInFlight = new Set();
const telegramExecutionQueues = new Map();
function queueTelegramExecution(userId, work) {
  const previous = telegramExecutionQueues.get(userId) || Promise.resolve();
  const next = previous.catch(() => {}).then(work).finally(() => {
    if (telegramExecutionQueues.get(userId) === next) telegramExecutionQueues.delete(userId);
  });
  telegramExecutionQueues.set(userId, next);
  return next;
}
async function sendTelegram(text, dedupKey, userId) {
  const configured = userId ? get('SELECT * FROM telegram_connections WHERE user_id = ?', [userId]) : null;
  const token = configured?.bot_token_encrypted ? decryptSecret(configured.bot_token_encrypted) : null;
  const chatId = configured?.chat_id || null;
  const durableSent = dedupKey && get('SELECT sent_at FROM telegram_notifications WHERE user_id = ? AND dedup_key = ?', [userId, dedupKey]);
  if (!configured || Number(configured.enabled) !== 1 || !token || !chatId || (dedupKey && (durableSent || telegramSent.has(dedupKey) || telegramInFlight.has(dedupKey)))) return false;
  if (dedupKey) telegramInFlight.add(dedupKey);
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      if (dedupKey) telegramInFlight.delete(dedupKey);
      return false;
    }
    if (dedupKey) {
      run('INSERT OR IGNORE INTO telegram_notifications (user_id, dedup_key, sent_at) VALUES (?, ?, ?)', [userId, dedupKey, Date.now()]);
      telegramSent.add(dedupKey);
      telegramInFlight.delete(dedupKey);
    }
    return true;
  } catch {
    if (dedupKey) telegramInFlight.delete(dedupKey);
    return false;
  }
}
function notifyTelegramExecution(event, userId) {
  const order = event?.o;
  if (event?.e !== 'ORDER_TRADE_UPDATE' || order?.X !== 'FILLED' || !order?.i) return;
  queueTelegramExecution(userId, async () => {
    const closeReason = closeReasonFromClientOrderId(order.c);
    if (closeReason) {
      await sendTelegram(
        'JEV CLOSE\nPair: ' + (order.s || '-') + '\nReason: ' + closeReason +
        '\nOrderID: ' + order.i + '\nPrice: ' + (order.ap || '-') +
        '\nQty: ' + (order.z || '-') + '\nStatus: CLOSED',
        'CLOSE:' + order.s + ':' + order.i + ':' + closeReason, userId
      );
      return;
    }
    const key = 'EXEC:' + order.s + ':' + order.i + ':FILLED';
    await sendTelegram(
      'JEV EXECUTION\nPair: ' + (order.s || '-') + '\nSide: ' + (order.S || '-') +
      '\nOrderID: ' + order.i + '\nPrice: ' + (order.ap || '-') +
      '\nQty: ' + (order.z || '-') + '\nStatus: FILLED', key, userId
    );
  });
}

async function protectFilledEvent(userId, candidate) {
  if (!candidate?.client_order_id || !candidate.symbol || !Number.isFinite(Number(candidate.sl)) || !Number.isFinite(Number(candidate.tp))) return { protectionVerified: false, status: 'BLOCKED_MISSING_PROVENANCE' };
  const keyRow = get("SELECT * FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1", [userId]);
  if (!keyRow) return { protectionVerified: false, status: 'CONNECTED_DEMO_KEY_REQUIRED' };
  const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
  const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
  const expected = buildProtectionOrders(candidate, { status: 'SIZED', quantity: String(candidate.quantity || '0'), price: String(candidate.entry) }, 'VALID').orders;
  const positions = await signed('GET', '/fapi/v2/positionRisk', { symbol: candidate.symbol });
  if (!positions.some(item => Number(item.positionAmt) !== 0)) return { protectionVerified: false, status: 'ENTRY_PENDING_FILL' };
  const existing = await signed('GET', '/fapi/v1/openAlgoOrders', { symbol: candidate.symbol });
  const ids = new Set(existing.map(item => item.clientAlgoId || item.clientOrderId));
  for (const order of expected) if (!ids.has(order.clientOrderId.slice(0, 36))) await signed('POST', '/fapi/v1/algoOrder', { symbol: order.symbol, side: order.side, algoType: 'CONDITIONAL', type: order.type, triggerPrice: order.stopPrice, closePosition: 'true', workingType: order.workingType, clientAlgoId: order.clientOrderId.slice(0, 36) });
  const verified = new Set((await signed('GET', '/fapi/v1/openAlgoOrders', { symbol: candidate.symbol })).map(item => item.clientAlgoId || item.clientOrderId));
  const protectionVerified = expected.every(order => verified.has(order.clientOrderId.slice(0, 36)));
  markLifecycleProtection(userId, candidate.client_order_id, protectionVerified ? 'VERIFIED' : 'PENDING');
  return { protectionVerified, status: protectionVerified ? 'FILLED_PROTECTED' : 'FILLED_PROTECTION_PENDING' };
}
function recordExchangeOrderUpdate(userId, event) {
  const order = event?.o;
  if (event?.e !== 'ORDER_TRADE_UPDATE' || !order?.i) return;
  const clientOrderId = String(order.c || '');
  const status = String(order.X || '');
  const rootClientOrderId = clientOrderId.replace(/_(?:sl|tp|ec)$/i, '');
  const lifecycle = get('SELECT * FROM execution_lifecycles WHERE user_id = ? AND thesis_key = ?', [userId, rootClientOrderId]);
  let candidateProvenance = null;
  try {
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    candidateProvenance = (artifact.execution_candidates || []).find(item => item.client_order_id === rootClientOrderId) || null;
  } catch {}
  if (!candidateProvenance && lifecycle?.candidate_json) { try { candidateProvenance = JSON.parse(lifecycle.candidate_json); } catch {} }
  const now = Date.now();
  if (status === 'FILLED' && /_(?:sl|tp|ec)$/i.test(clientOrderId)) {
    const closeReason = closeReasonFromClientOrderId(clientOrderId);
    run('INSERT INTO execution_lifecycles (user_id,thesis_key,symbol,client_order_id,entry_order_id,entry_status,position_status,protection_status,exit_order_id,close_reason,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,thesis_key) DO UPDATE SET exit_order_id=excluded.exit_order_id,position_status=\'CLOSED\',close_reason=excluded.close_reason,updated_at=excluded.updated_at,completed_at=excluded.completed_at', [userId, lifecycle?.thesis_key || rootClientOrderId, order.s, lifecycle?.client_order_id || rootClientOrderId, lifecycle?.entry_order_id || '', lifecycle?.entry_status || 'FILLED', 'CLOSED', 'VERIFIED', String(order.i), closeReason, now, now]);
    run('UPDATE trade_history SET status=\'CLOSED\',close_reason=?,exit_order_id=?,completed_at=? WHERE user_id=? AND client_order_id=? AND status != \'CLOSED\'', [closeReason, String(order.i), now, userId, rootClientOrderId]);
    return;
  }
  if (status === 'FILLED' && clientOrderId && !/_ec$/i.test(clientOrderId)) {
    if (!candidateProvenance) return 'BLOCKED_MISSING_PROVENANCE';
    const provenance = { ...candidateProvenance, entry_order_id: String(order.i) };
    if (lifecycle?.position_status === 'CLOSED' || lifecycle?.completed_at != null) return false;
    run('INSERT INTO execution_lifecycles (user_id,thesis_key,symbol,client_order_id,entry_order_id,entry_status,position_status,protection_status,updated_at,candidate_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,thesis_key) DO UPDATE SET entry_order_id=excluded.entry_order_id,entry_status=excluded.entry_status,position_status=\'OPEN\',updated_at=excluded.updated_at,candidate_json=COALESCE(execution_lifecycles.candidate_json, excluded.candidate_json) WHERE execution_lifecycles.position_status != \'CLOSED\' AND execution_lifecycles.completed_at IS NULL', [userId, clientOrderId, order.s, clientOrderId, String(order.i), 'FILLED', 'OPEN', 'PENDING', now, JSON.stringify(provenance)]);
    if (!get('SELECT id FROM trade_history WHERE user_id = ? AND order_id = ?', [userId, String(order.i)])) {
      run('INSERT INTO trade_history (user_id,inst_id,side,pos_side,size,price,fee,funding_rate,slippage,pnl,ts,raw_json,client_order_id,order_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [userId, order.s || provenance.symbol, String(order.S || provenance.side || '').toLowerCase(), order.ps || '', Number(order.z || order.q || provenance.quantity || 0), Number(order.ap || order.p || provenance.entry || 0), 0, 0, 0, 0, Number(order.T || order.E || now), JSON.stringify({ event, provenance }), clientOrderId, String(order.i), 'FILLED']);
    }
    run('UPDATE trade_history SET entry_order_id=?, thesis_key=? WHERE user_id=? AND order_id=?', [String(order.i), clientOrderId, userId, String(order.i)]);
    let filledCandidate = candidateProvenance;
    if (!filledCandidate && lifecycle?.candidate_json) { try { filledCandidate = JSON.parse(lifecycle.candidate_json); } catch {} }
    if (filledCandidate) protectFilledEvent(userId, filledCandidate).catch(() => markLifecycleProtection(userId, clientOrderId, 'PENDING'));
    return true;
  }
  return true;
}
let marketCandleUnsubscribe = null;
const LIVE_DEMO_STALE_AFTER_MS = 15 * 60_000;
const MARKET_POLL_TIMEOUT_MS = 10_000;
const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT'];
const DB_PATH = path.join(__dirname, 'jev.db');
const KEY_PATH = path.join(__dirname, '.jev-master-key');
const isProduction = process.env.NODE_ENV === 'production';
const isHttps = process.env.HTTPS === 'true';
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'runtime.json'), 'utf8'));
const demoExecutionEnabled = runtimeConfig.demoExecutionEnabled === true;
const unattendedDemoExecutionEnabled = runtimeConfig.unattendedDemoExecutionEnabled === true;
let db;

function loadMasterKey() {
  if (process.env.JEV_MASTER_KEY) {
    const key = Buffer.from(process.env.JEV_MASTER_KEY, 'base64');
    if (key.length !== 32) throw new Error('JEV_MASTER_KEY must be base64-encoded 32 bytes');
    return key;
  }
  if (isProduction) throw new Error('JEV_MASTER_KEY required in production');
  if (fs.existsSync(KEY_PATH)) return fs.readFileSync(KEY_PATH);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}
const masterKey = loadMasterKey();

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return iv.toString('base64') + ':' + cipher.getAuthTag().toString('base64') + ':' + encrypted.toString('base64');
}

function decryptSecret(value) {
  const [iv64, tag64, data64] = String(value).split(':');
  if (!iv64 || !tag64 || !data64) throw new Error('Invalid encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64')), decipher.final()]).toString('utf8');
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }
function sessionHash(sid) { return crypto.createHash('sha256').update(sid).digest('hex'); }
const loginAttempts = new Map();
const apiAttempts = new Map();
function rateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const item = map.get(key);
  if (!item || now - item.start >= windowMs) { map.set(key, { start: now, count: 1 }); return true; }
  item.count += 1;
  return item.count <= max;
}
function clientIp(req) { return req.ip || req.socket.remoteAddress || 'unknown'; }

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT)');
  run('CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, exchange TEXT DEFAULT \'okx\', api_key TEXT, secret_key TEXT, passphrase TEXT, label TEXT, created_at TEXT, encrypted INTEGER DEFAULT 0, status TEXT DEFAULT \'unknown\', verified_at TEXT)');
  try { run('ALTER TABLE api_keys ADD COLUMN encrypted INTEGER DEFAULT 0'); } catch {}
  try { run('ALTER TABLE api_keys ADD COLUMN exchange TEXT DEFAULT \'okx\''); } catch {}
  try { run('ALTER TABLE api_keys ADD COLUMN status TEXT DEFAULT \'unknown\''); } catch {}
  try { run('ALTER TABLE api_keys ADD COLUMN verified_at TEXT'); } catch {}
  migrateApiKeys();
  run('CREATE TABLE IF NOT EXISTS trade_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, inst_id TEXT, side TEXT, pos_side TEXT, size REAL, price REAL, fee REAL, funding_rate REAL, slippage REAL, pnl REAL, ts INTEGER, raw_json TEXT)');
  try { run('ALTER TABLE trade_history ADD COLUMN client_order_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN order_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN setup_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN structure_event_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN status TEXT DEFAULT \'FILLED\''); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN trade_id TEXT'); } catch {}
  try { run('CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_history_trade_id ON trade_history(user_id, trade_id) WHERE trade_id IS NOT NULL AND trade_id != \'\''); } catch {}
  run('CREATE TABLE IF NOT EXISTS sessions (sid_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
  run('CREATE TABLE IF NOT EXISTS trade_amounts (user_id INTEGER PRIMARY KEY, amount_usdt REAL NOT NULL, leverage INTEGER NOT NULL DEFAULT 1, margin_mode TEXT NOT NULL DEFAULT \'ISOLATED\', updated_at TEXT NOT NULL)');
  try { run("ALTER TABLE trade_amounts ADD COLUMN leverage INTEGER NOT NULL DEFAULT 1"); } catch {}
  try { run("ALTER TABLE trade_amounts ADD COLUMN margin_mode TEXT NOT NULL DEFAULT 'ISOLATED'"); } catch {}
  run('CREATE TABLE IF NOT EXISTS telegram_connections (user_id INTEGER PRIMARY KEY, bot_token_encrypted TEXT NOT NULL, chat_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'unknown\', verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  run('CREATE TABLE IF NOT EXISTS telegram_notifications (user_id INTEGER NOT NULL, dedup_key TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (user_id, dedup_key))');
  run('CREATE TABLE IF NOT EXISTS execution_lifecycles (user_id INTEGER NOT NULL, thesis_key TEXT NOT NULL, symbol TEXT NOT NULL, client_order_id TEXT NOT NULL, entry_order_id TEXT, entry_status TEXT NOT NULL, position_status TEXT NOT NULL, protection_status TEXT NOT NULL DEFAULT \'UNKNOWN\', exit_order_id TEXT, close_reason TEXT, updated_at INTEGER NOT NULL, completed_at INTEGER, candidate_json TEXT, PRIMARY KEY (user_id, thesis_key))');
  try { run('ALTER TABLE execution_lifecycles ADD COLUMN candidate_json TEXT'); } catch {}
  run('CREATE INDEX IF NOT EXISTS idx_execution_lifecycles_symbol_status ON execution_lifecycles(user_id, symbol, position_status)');
  try { run('ALTER TABLE execution_lifecycles ADD COLUMN protection_status TEXT NOT NULL DEFAULT \'UNKNOWN\''); } catch {}
  try { run('ALTER TABLE execution_lifecycles ADD COLUMN completed_at INTEGER'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN close_reason TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN exit_order_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN completed_at INTEGER'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN entry_order_id TEXT'); } catch {}
  try { run('ALTER TABLE trade_history ADD COLUMN thesis_key TEXT'); } catch {}
}

function migrateApiKeys() {
  for (const row of all('SELECT id, api_key, secret_key, passphrase, encrypted FROM api_keys')) {
    if (Number(row.encrypted) === 1) continue;
    run('UPDATE api_keys SET api_key=?, secret_key=?, passphrase=?, encrypted=1 WHERE id=?', [encryptSecret(row.api_key), encryptSecret(row.secret_key), encryptSecret(row.passphrase), row.id]);
  }
}

function csrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const token = req.get('x-csrf-token');
  if (!token || !req.cookies.csrf || token !== req.cookies.csrf) return res.status(403).json({ error: 'CSRF validation failed' });
  next();
}

function auth(req, res, next) {
  const sid = req.cookies.sid;
  if (!sid) return res.status(401).json({ error: 'Unauthorized' });
  const row = get('SELECT user_id, expires_at FROM sessions WHERE sid_hash = ?', [sessionHash(sid)]);
  if (!row || Number(row.expires_at) <= Date.now()) { sessions.delete(sid); return res.status(401).json({ error: 'Unauthorized' }); }
  sessions.set(sid, Number(row.user_id));
  req.userId = Number(row.user_id);
  next();
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Invalid input' });
  const hash = await bcrypt.hash(password, 12);
  try {
    run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    res.json({ ok: true });
  } catch { res.status(409).json({ error: 'Username exists' }); }
});

app.post('/api/login', async (req, res) => {
  if (!rateLimit(loginAttempts, clientIp(req), 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many login attempts' });
  const { username, password } = req.body;
  const row = get('SELECT * FROM users WHERE username = ?', [String(username || '').slice(0, 64)]);
  if (!row || !(await bcrypt.compare(String(password || ''), row.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
  const sid = newToken();
  const csrfToken = newToken();
  const expiresAt = Date.now() + 86400000;
  sessions.set(sid, row.id);
  run('INSERT INTO sessions (sid_hash, user_id, expires_at) VALUES (?, ?, ?)', [sessionHash(sid), row.id, expiresAt]);
  if (!botStates.has(row.id)) botStates.set(row.id, false);
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: isHttps, maxAge: 86400000, path: '/' };
  res.cookie('sid', sid, cookieOptions);
  res.cookie('csrf', csrfToken, { ...cookieOptions, httpOnly: false });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(req.cookies.sid);
  run('DELETE FROM sessions WHERE sid_hash = ?', [sessionHash(req.cookies.sid || '')]);
  res.clearCookie('sid');
  res.json({ ok: true });
});

function parseTradeSettings(body) {
  const amountUsdt = Number(body?.amountUsdt);
  const leverage = Number(body?.leverage);
  const marginMode = String(body?.marginMode || '').toUpperCase();
  return Number.isFinite(amountUsdt) && amountUsdt > 0 && Number.isInteger(leverage) && leverage >= 1 && leverage <= 125 && ['CROSS', 'ISOLATED'].includes(marginMode)
    ? { amountUsdt, leverage, marginMode } : null;
}
app.get('/api/trade-amount', auth, (req, res) => {
  const row = get('SELECT amount_usdt, leverage, margin_mode, updated_at FROM trade_amounts WHERE user_id = ?', [req.userId]);
  res.json(row ? { ok: true, configured: true, amountUsdt: Number(row.amount_usdt), leverage: Number(row.leverage), marginMode: row.margin_mode, updatedAt: row.updated_at } : { ok: true, configured: false, warning: 'Trade settings are optional' });
});
app.put('/api/trade-amount', auth, (req, res) => {
  const settings = parseTradeSettings(req.body);
  if (!settings) return res.status(400).json({ ok: false, error: 'Enter valid USDT amount, leverage 1-125, and Cross or Isolated margin mode' });
  run('INSERT OR REPLACE INTO trade_amounts (user_id, amount_usdt, leverage, margin_mode, updated_at) VALUES (?,?,?,?,?)', [req.userId, settings.amountUsdt, settings.leverage, settings.marginMode, new Date().toISOString()]);
  res.json({ ok: true, configured: true, ...settings });
});
app.get('/api/me', auth, (req, res) => {
  const u = get('SELECT id, username FROM users WHERE id = ?', [req.userId]);
  res.json(u || {});
});

async function readClosedCandleWatermark() {
  const now = Date.now();
  const signatures = {};
  for (const symbol of SUPPORTED_SYMBOLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MARKET_POLL_TIMEOUT_MS);
    try {
      const url = BINANCE_DATA_BASE + '/fapi/v1/klines?symbol=' + encodeURIComponent(symbol) + '&interval=5m&limit=2';
      const response = await fetchBinance(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.msg || 'Candle poll failed');
      const latest = data.filter(row => Number(row[6]) < now).at(-1);
      if (!latest) throw new Error('No closed 5m candle: ' + symbol);
      const age = now - Number(latest[6]);
      if (age < 0 || age > LIVE_DEMO_STALE_AFTER_MS) throw new Error('Stale 5m candle: ' + symbol);
      signatures[symbol] = Number(latest[6]);
    } finally { clearTimeout(timeout); }
  }
  return signatures;
}
function startMarketObserver() {
  if (marketObservers.has('global')) return marketObservers.get('global');
  const observer = { timer: null, watermark: {}, error: null, last_polled_at: null };
  const poll = async () => { try { observer.watermark = await readClosedCandleWatermark(); observer.last_polled_at = Date.now(); observer.error = null; } catch (error) { observer.error = error?.name === 'AbortError' ? 'candle_poll_timeout' : (error?.message || 'candle_poll_failed'); } };
  observer.timer = setInterval(poll, MARKET_INTERVAL_MS);
  marketObservers.set('global', observer);
  poll();
  return observer;
}
function stopLiveDemoRunner(sid, error = null) {
  const runner = botRunners.get(sid);
  if (!runner) return;
  if (runner.timer) clearInterval(runner.timer);
  runner.timer = null;
  runner.running = false;
  if (error) runner.error = error;
  botRunners.delete(sid);
}
async function runLiveDemoWorkflowCycle(sid) {
  const runner = botRunners.get(sid);
  if (!runner || runner.running) return;
  runner.running = true;
  runner.last_started_at = Date.now();
  try {
    await new Promise((resolve, reject) => execFile(process.env.PYTHON || 'python', [path.join(__dirname, 'v2', 'scripts', 'binance_demo_live_pipeline.py')], { cwd: __dirname, timeout: 90_000, windowsHide: true, shell: false, maxBuffer: 1_000_000 }, error => error ? reject(error) : resolve()));
    runner.error = null;
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    demoCycleSummaries.set(sid, { ...summarizeDemoDryRun(artifact), observedAt: new Date().toISOString() });
    runner.cycles += 1;
  } catch (error) {
    runner.error = error?.message || 'live_demo_workflow_cycle_failed';
    runner.last_error_at = Date.now();
  } finally { runner.running = false; runner.last_finished_at = Date.now(); }
}
function startLiveDemoWorkflowRunner(sid) {
  const existing = botRunners.get(sid);
  if (existing?.timer) return existing;
  const runner = existing || { timer: null, running: false, cycles: 0, error: null, last_started_at: null, last_finished_at: null };
  runner.error = null;
  runner.timer = setInterval(() => runLiveDemoWorkflowCycle(sid), MARKET_INTERVAL_MS);
  botRunners.set(sid, runner);
  runLiveDemoWorkflowCycle(sid);
  return runner;
}
function persistClosedCandle(candle) {
  const cachePath = path.join(__dirname, 'v2', 'artifacts', 'MARKET_CANDLE_CACHE.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}
  const key = `${candle.symbol}:${candle.interval}`;
  const rows = Array.isArray(cache[key]) ? cache[key] : [];
  const row = { open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, taker_buy_volume: candle.takerBuyVolume || 0, open_time: candle.openTime, close_time: candle.closeTime };
  cache[key] = [...rows.filter(item => Number(item.open_time) !== candle.openTime), row].sort((a, b) => a.open_time - b.open_time).slice(-500);
  const tmp = `${cachePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, cachePath);
}
function startMarketStructureStreamTrigger() {
  if (marketCandleUnsubscribe) return;
  marketCandleUnsubscribe = onClosedCandle(candle => {
    persistClosedCandle(candle);
    if (candle.interval !== '15m') return;
    runLiveDemoWorkflowCycle('global');
  });
}
app.get('/api/bot/status', auth, (req, res) => {
  const runner = botRunners.get('execution:' + req.userId) || botRunners.get('global');
    const observer = marketObservers.get('global');
    const executionSummaries = [...demoExecutionSummaries.entries()].filter(([key]) => key.startsWith(req.userId + ':') || key.startsWith('recovery:' + req.userId + ':')).map(([, value]) => value);
    res.json({ ok: true, enabled: botStates.get(req.userId) === true, observing: Boolean(observer?.timer), running: Boolean(runner?.running), cycles: runner?.cycles || 0, error: runner?.error || null, observer_error: observer?.error || null, last_started_at: runner?.last_started_at || null, last_finished_at: runner?.last_finished_at || null, last_polled_at: observer?.last_polled_at || null, watermark: observer?.watermark || {}, mode: 'demo_execution', marketStream: getBinanceStreamState(), demoCycle: demoCycleSummaries.get('global') || null, demoExecution: executionSummaries, ordersEnabled: demoExecutionEnabled });
});

app.post('/api/bot/toggle', auth, async (req, res) => {
  const enabled = req.body?.enabled === true;
  if (enabled) {
    const key = get("SELECT * FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1", [req.userId]);
    if (key) startBinanceUserStream(String(req.userId), decryptSecret(key.api_key), event => {
      if (event?.e === 'ORDER_TRADE_UPDATE') {
        const lifecycleUpdateAccepted = recordExchangeOrderUpdate(req.userId, event);
        demoExecutionSummaries.set(String(req.userId), { status: event.o?.X || 'ORDER_UPDATE', symbol: event.o?.s, orderId: event.o?.i, clientOrderId: event.o?.c, updatedAt: new Date().toISOString() });
        if (lifecycleUpdateAccepted !== false) notifyTelegramExecution(event, req.userId);
      }
    }).catch(() => null);
  } else stopBinanceUserStream(String(req.userId));

  if (enabled && !get('SELECT id FROM api_keys WHERE user_id = ? AND exchange = ? AND status = ?', [req.userId, 'binanceTestnet', 'connected'])) return res.status(400).json({ ok:false, error:'Connected Binance Demo account required before BOT ON' });
  botStates.set(req.userId, enabled);
  if (enabled) startExecutionRunner(req.userId); else stopExecutionRunner(req.userId);
  const runner = botRunners.get('execution:' + req.userId) || botRunners.get('global');
  const observer = marketObservers.get('global');
  res.json({ ok: true, enabled, observing: Boolean(observer?.timer), running: Boolean(runner?.running), cycles: runner?.cycles || 0, last_started_at: runner?.last_started_at || null, last_finished_at: runner?.last_finished_at || null, error: runner?.error || null, mode: 'demo_execution', marketStream: getBinanceStreamState(), demoCycle: demoCycleSummaries.get('global') || null, demoExecution: demoExecutionSummaries.get(req.userId) || null, ordersEnabled: demoExecutionEnabled });
});
app.get('/api/binance-demo/live-readiness', auth, async (req, res) => {
  const blockers = [];
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  const tradeAmount = get('SELECT amount_usdt, leverage, margin_mode FROM trade_amounts WHERE user_id = ?', [req.userId]);
  if (!keyRow) blockers.push('CONNECTED_DEMO_KEY_REQUIRED');
  if (!demoExecutionEnabled) blockers.push('DEMO_EXECUTION_FLAG_DISABLED');
  if (blockers.length) return res.json({ ok: true, ready: false, executionMode: 'LIVE_DEMO', demoOnly: true, blockers, ordersSent: null, withdrawalsSent: null });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    startBinanceUserStream(String(req.userId), apiKey, event => {
      if (event?.e === 'ORDER_TRADE_UPDATE') {
        const lifecycleUpdateAccepted = recordExchangeOrderUpdate(req.userId, event);
        demoExecutionSummaries.set(String(req.userId), { status: event.o?.X || 'ORDER_UPDATE', symbol: event.o?.s, orderId: event.o?.i, clientOrderId: event.o?.c, updatedAt: new Date().toISOString() });
        if (lifecycleUpdateAccepted !== false) notifyTelegramExecution(event, req.userId);
      }
    }).catch(() => null);
    const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
    const [exchangeInfo, account, positions, income] = await Promise.all([fetchExchangeInfo(), signed('GET', '/fapi/v2/account'), signed('GET', '/fapi/v2/positionRisk'), signed('GET', '/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })]);
    const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => SUPPORTED_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
    const balances = (account.assets || []).filter(x => x.asset === 'USDT').map(x => ({ asset: x.asset, availableBalance: Number(x.availableBalance) }));
    const executionPolicy = { tradeAmountUsdt: Number(tradeAmount?.amount_usdt), leverage: Number(tradeAmount?.leverage || 1), marginMode: tradeAmount?.margin_mode || 'ISOLATED' };
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
    reconcileManualClosedLifecycles(req.userId, positions);
    const artifactFreshness = validateCandidateFreshness(artifact, artifact.execution_candidates?.[0]);
    if (!artifactFreshness.ok) blockers.push(artifactFreshness.reason);
    const candidates = (artifact.execution_candidates || []).filter(candidate => !lifecycleBlocksReentry(req.userId, candidate)).map(candidate => { const freshness = validateCandidateFreshness(artifact, candidate); const normalized = normalizeCandidatePrices(candidate, filters[candidate.symbol]); const sizing = sizeCandidate(normalized, executionPolicy, balances[0] || {}, filters[candidate.symbol]); return { candidate: normalized, freshness, sizing, precision: validateCandidatePrecision(normalized, sizing, filters[candidate.symbol]) }; });
    if (!candidates.some(x => x.freshness.ok && x.sizing.status === 'SIZED' && x.precision === 'VALID')) blockers.push('NO_VALID_SERVER_SIZED_CANDIDATE');
    const openPositions = positions.filter(position => Number(position.positionAmt) !== 0);
    const openOrders = await Promise.all(SUPPORTED_SYMBOLS.map(symbol => signed('GET', '/fapi/v1/openOrders', { symbol }))).then(groups => groups.flat());
    const openAlgoOrders = await signed('GET', '/fapi/v1/openAlgoOrders');
    reconcilePendingClosedLifecycles(req.userId, openOrders);
    reconcileManualClosedLifecycles(req.userId, positions);
    const durableCandidates = all("SELECT candidate_json FROM execution_lifecycles WHERE user_id = ? AND position_status = 'OPEN' AND candidate_json IS NOT NULL", [req.userId]).flatMap(row => { try { const candidate = JSON.parse(row.candidate_json); return candidate?.client_order_id ? [candidate] : []; } catch { return []; } });
    const reconciliationCandidates = selectReconciliationCandidates(durableCandidates, openOrders, artifact.execution_candidates || []);
    const monitoring = monitorProtectionState(reconciliationCandidates, openOrders, openPositions);
    blockers.push(...readinessBlockers(monitoring));
    const reconciliation = reconcileDemoState(reconciliationCandidates, openOrders, positions, monitoring);
    blockers.push(...(reconciliation.blockers || []));
    if (reconciliation.status !== 'RECONCILED') blockers.push('RECONCILIATION_REVIEW_REQUIRED');
    const lastExecution = demoExecutionSummaries.get(String(req.userId));
    if (String(lastExecution?.status || '').includes('PROTECTION_FAILED') || String(lastExecution?.status || '').includes('PROTECTION_PENDING')) blockers.push('EXECUTION_PROTECTION_FAILURE');
    if (lastExecution?.status === 'PROTECTION_FAILED_EMERGENCY_CLOSE_FAILED') blockers.push('UNCONTAINED_EXECUTION_FAILURE');
    if (reconciliation.status !== 'RECONCILED') blockers.push('RECONCILIATION_REVIEW_REQUIRED');
    if (reconciliation.unmanagedOrders?.length || reconciliation.unmanagedPositions?.length) blockers.push('UNMANAGED_EXCHANGE_STATE');
    const uniqueBlockers = [...new Set(blockers)];
    res.json({ ok: true, ready: uniqueBlockers.length === 0, executionMode: 'LIVE_DEMO', demoOnly: true, blockers: uniqueBlockers, reconciliationStatus: reconciliation.status, userStream: getBinanceUserStreamState(String(req.userId)), candidateCount: candidates.length, validCandidateCount: candidates.filter(x => x.sizing.status === 'SIZED' && x.precision === 'VALID').length, ordersSent: null, withdrawalsSent: null });
  } catch (error) { res.status(502).json({ ok: false, ready: false, executionMode: 'LIVE_DEMO', demoOnly: true, blockers: ['BINANCE_DEMO_READINESS_FAILED'], error: error.message, ordersSent: null, withdrawalsSent: null }); }
});app.get('/api/binance-demo/execution-preflight', auth, async (req, res) => {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  const tradeAmount = get('SELECT amount_usdt, leverage, margin_mode FROM trade_amounts WHERE user_id = ?', [req.userId]);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Connected Binance Demo key required' });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
    const [exchangeInfo, account, positions, income] = await Promise.all([fetchExchangeInfo(), signed('GET', '/fapi/v2/account'), signed('GET', '/fapi/v2/positionRisk'), signed('GET', '/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })]);
    const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => SUPPORTED_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { status: x.status, quantityPrecision: x.quantityPrecision, pricePrecision: x.pricePrecision, filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
    const balances = (account.assets || []).filter(x => ['USDT', 'USDC'].includes(x.asset)).map(x => ({ asset: x.asset, walletBalance: Number(x.walletBalance), availableBalance: Number(x.availableBalance), unrealizedProfit: Number(x.unrealizedProfit) }));
    const openPositions = positions.filter(x => Number(x.positionAmt) !== 0).map(x => ({ symbol: x.symbol, positionAmt: Number(x.positionAmt), entryPrice: Number(x.entryPrice), unrealizedProfit: Number(x.unRealizedProfit), isolated: x.marginType === 'isolated' }));
    const executionPolicy = { tradeAmountUsdt: Number(tradeAmount?.amount_usdt), leverage: Number(tradeAmount?.leverage || 1), marginMode: tradeAmount?.margin_mode || 'ISOLATED' };
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
    const candidates = (artifact.execution_candidates || []).filter(candidate => !lifecycleBlocksReentry(req.userId, candidate)).map(candidate => { const freshness = validateCandidateFreshness(artifact, candidate); const normalized = normalizeCandidatePrices(candidate, filters[candidate.symbol]); const sizing = sizeCandidate(normalized, executionPolicy, balances.find(x => x.asset === 'USDT') || {}, filters[candidate.symbol]); return { ...candidate, freshness, normalized, sizing, precisionValidation: validateCandidatePrecision(normalized, sizing, filters[candidate.symbol]) }; });
    const validCandidates = candidates.filter(x => x.freshness.ok && x.sizing.status === 'SIZED' && x.precisionValidation === 'VALID');
    res.json({ ok: true, executionMode: 'LIVE_DEMO', demoOnly: true, status: validCandidates.length ? 'PREFLIGHT_READY' : 'PREFLIGHT_BLOCKED', tradeAmountUsdt: executionPolicy.tradeAmountUsdt, leverage: executionPolicy.leverage, marginMode: executionPolicy.marginMode, balances, openPositions, dailyPnl: Number(dailyPnl), filters, candidates, validCandidateCount: validCandidates.length, ordersSent: null, withdrawalsSent: null });
  } catch (error) { res.status(502).json({ ok: false, executionMode: 'LIVE_DEMO', demoOnly: true, error: error.message || 'Demo execution preflight failed', ordersSent: null, withdrawalsSent: null }); }
});
app.get('/api/binance-demo/reconciliation', auth, async (req, res) => {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Connected Binance Demo key required' });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
    const [positions, ordersBySymbol] = await Promise.all([signed('GET', '/fapi/v2/positionRisk'), Promise.all(SUPPORTED_SYMBOLS.map(symbol => signed('GET', '/fapi/v1/openOrders', { symbol }))) ]);
    reconcilePendingClosedLifecycles(req.userId, ordersBySymbol.flat());
    reconcileManualClosedLifecycles(req.userId, positions);
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    const candidates = (artifact.execution_candidates || []).filter(candidate => validateCandidateFreshness(artifact, candidate).ok && !lifecycleBlocksReentry(req.userId, candidate));
    const durableCandidates = all("SELECT candidate_json FROM execution_lifecycles WHERE user_id = ? AND position_status = 'OPEN' AND candidate_json IS NOT NULL", [req.userId]).flatMap(row => { try { const candidate = JSON.parse(row.candidate_json); return candidate?.client_order_id ? [candidate] : []; } catch { return []; } });
    const reconciliationCandidates = selectReconciliationCandidates(durableCandidates, ordersBySymbol.flat(), artifact.execution_candidates || []);
    const monitoring = monitorProtectionState(reconciliationCandidates, ordersBySymbol.flat(), positions);
    const reconciliation = reconcileDemoState(reconciliationCandidates, ordersBySymbol.flat(), positions, monitoring);
    const status = reconciliation.status === 'RECONCILED' && !readinessBlockers(monitoring).length ? 'RECONCILIATION_PASS' : 'RECONCILIATION_BLOCKED';
    res.json({ ok: true, executionMode: 'LIVE_DEMO', demoOnly: true, status, observedAt: new Date().toISOString(), ordersSent: null, withdrawalsSent: null, monitoring, ...reconciliation });
  } catch (error) { res.status(502).json({ ok: false, demoOnly: true, error: error.message || 'Demo reconciliation failed' }); }
});app.post('/api/binance-demo/recovery-plan', auth, (req, res) => {
  const plan = buildRecoveryPlan(req.body?.candidate, req.body?.sizing, req.body?.precisionValidation, req.body?.monitoring);
  res.status(plan.status === 'PLAN_ONLY' || plan.status === 'NO_ACTION' ? 200 : 409).json({ ok: plan.status === 'PLAN_ONLY' || plan.status === 'NO_ACTION', executionMode: 'LIVE_DEMO', demoOnly: true, plan, ordersSent: null, withdrawalsSent: null });
});app.post('/api/binance-demo/protection-plan', auth, (req, res) => {
  const fill = verifyEntryFill(req.body?.exchangeOrder);
  const plan = fill.filled ? buildProtectionOrders(req.body?.candidate, req.body?.sizing, req.body?.precisionValidation) : { status: 'WAITING_ENTRY_FILL', orders: [] };
  res.status(plan.status === 'READY_AFTER_ENTRY_FILL' ? 200 : 409).json({ ok: plan.status === 'READY_AFTER_ENTRY_FILL', executionMode: 'LIVE_DEMO', demoOnly: true, fill, plan, ordersSent: null, withdrawalsSent: null });
});
async function loadServerExecutionCandidate(userId, candidateId, recovery = false) {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [userId]);
  const tradeAmountRow = get('SELECT amount_usdt, leverage, margin_mode FROM trade_amounts WHERE user_id = ?', [userId]);
  if (!keyRow) return { error: 'Connected Binance Demo key required' };
  const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
  const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
  const [exchangeInfo, account, positions, income] = await Promise.all([
    fetchExchangeInfo(),
    signed('GET', '/fapi/v2/account'), signed('GET', '/fapi/v2/positionRisk'),
    signed('GET', '/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })
  ]);
  const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => SUPPORTED_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
  const balance = (account.assets || []).find(x => x.asset === 'USDT');
  const settings = { tradeAmountUsdt: Number(tradeAmountRow?.amount_usdt), leverage: Number(tradeAmountRow?.leverage || 1), marginMode: tradeAmountRow?.margin_mode || 'ISOLATED' };
  const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    let candidate = (artifact.execution_candidates || []).find(x => x.client_order_id === candidateId);
    const lifecycleRow = get('SELECT candidate_json FROM execution_lifecycles WHERE user_id = ? AND thesis_key = ?', [userId, candidateId]);
    const recoveryRow = !candidate ? get('SELECT raw_json,client_order_id,setup_id,structure_event_id FROM trade_history WHERE user_id = ? AND client_order_id = ? AND status = \'OPEN\' ORDER BY id DESC LIMIT 1', [userId, candidateId]) : null;
    if (!candidate && lifecycleRow?.candidate_json) {
      try { candidate = JSON.parse(lifecycleRow.candidate_json); } catch {}
    }
    if (!candidate && recoveryRow?.raw_json) {
      try { candidate = JSON.parse(recoveryRow.raw_json).candidate || null; } catch {}
    }
    if (!candidate) return { error: 'Execution candidate not found' };
    const currentPlan = assertCurrentActivePlan(candidateId);
    if (!currentPlan.ok && !recovery) return { error: currentPlan.error };

  const normalized = normalizeCandidatePrices(candidate, filters[candidate.symbol]);
  const sizing = sizeCandidate(normalized, settings, balance || {}, filters[candidate.symbol]);
  const precision = validateCandidatePrecision(normalized, sizing, filters[candidate.symbol]);
  return { apiKey, secret, signed, candidate: normalized, sizing, precision, positions, settings };
}
function recordFilledTrade(userId, candidate, entry) {
  const orderId = String(entry.orderId || '');
  if (!orderId || get('SELECT id FROM trade_history WHERE user_id = ? AND order_id = ?', [userId, orderId])) return;
  run('INSERT INTO trade_history (user_id,inst_id,side,pos_side,size,price,fee,funding_rate,slippage,pnl,ts,raw_json,client_order_id,order_id,trade_id,setup_id,structure_event_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [userId, candidate.symbol, String(candidate.side || '').toLowerCase(), '', Number(entry.executedQty || 0), Number(entry.avgPrice || entry.price || candidate.entry), 0, 0, 0, 0, Number(entry.updateTime || Date.now()), JSON.stringify({ entry, candidate }), candidate.client_order_id, orderId, '', candidate.setup_id || '', candidate.structure_event_id || '', 'OPEN']);
}
async function syncTradeHistory(userId) {
  const key = get("SELECT * FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1", [userId]);
  if (!key) return;
  const apiKey = decryptSecret(key.api_key), secret = decryptSecret(key.secret_key);
  const signed = (method, apiPath, params = {}) => signedBinanceRequest(apiKey, secret, method, apiPath, params);
  for (const symbol of SUPPORTED_SYMBOLS) for (const trade of await signed('GET', '/fapi/v1/userTrades', { symbol, limit: '100' })) {
    const orderId = String(trade.orderId || '');
    const tradeId = String(trade.id || trade.tradeId || '');
    if (!orderId || (tradeId ? get('SELECT id FROM trade_history WHERE user_id = ? AND trade_id = ?', [userId, tradeId]) : get('SELECT id FROM trade_history WHERE user_id = ? AND order_id = ? AND price = ? AND ts = ?', [userId, orderId, Number(trade.price), Number(trade.time || 0)]))) continue;
    const candidate = get('SELECT setup_id, structure_event_id, client_order_id FROM trade_history WHERE user_id = ? AND order_id = ? LIMIT 1', [userId, orderId]);
    run('INSERT INTO trade_history (user_id,inst_id,side,pos_side,size,price,fee,funding_rate,slippage,pnl,ts,raw_json,client_order_id,order_id,trade_id,setup_id,structure_event_id,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [userId, symbol, String(trade.side || '').toLowerCase(), trade.positionSide || '', Number(trade.qty || 0), Number(trade.price || 0), Number(trade.commission || 0), 0, 0, Number(trade.realizedPnl || 0), Number(trade.time || Date.now()), JSON.stringify(trade), candidate?.client_order_id || trade.clientOrderId || '', orderId, tradeId, candidate?.setup_id || '', candidate?.structure_event_id || '', Number(trade.realizedPnl || 0) !== 0 ? 'CLOSED' : 'OPEN']);
  }
}
function getExecutionLifecycle(userId, thesisKey) {
  return get('SELECT * FROM execution_lifecycles WHERE user_id = ? AND thesis_key = ?', [userId, thesisKey]);
}
function lifecycleBlocksReentry(userId, candidate) {
  const lifecycle = getExecutionLifecycle(userId, candidate.client_order_id);
  if (!lifecycle) return false;
  if (lifecycle.position_status === 'CLOSED' || lifecycle.completed_at != null) return true;
  if (lifecycle.position_status === 'OPEN' && lifecycle.entry_status === 'FILLED' && lifecycle.protection_status !== 'VERIFIED') return false;
  return ['NEW', 'PARTIALLY_FILLED', 'FILLED'].includes(lifecycle.entry_status) || lifecycle.position_status === 'OPEN';
}
function markLifecycleProtection(userId, thesisKey, status) {
  run('UPDATE execution_lifecycles SET protection_status=?, updated_at=? WHERE user_id=? AND thesis_key=?', [status, Date.now(), userId, thesisKey]);
}
function reconcilePendingClosedLifecycles(userId, openOrders) {
  for (const lifecycle of all("SELECT * FROM execution_lifecycles WHERE user_id = ? AND position_status = 'CLOSED' AND entry_status IN ('NEW','PARTIALLY_FILLED') AND candidate_json IS NOT NULL", [userId])) {
    const order = openOrders.find(item => String(item.clientOrderId || '') === String(lifecycle.client_order_id));
    const restored = restorePendingLifecycle(lifecycle, order);
    if (!restored) continue;
    run('UPDATE execution_lifecycles SET position_status=?, close_reason=?, completed_at=?, updated_at=? WHERE user_id=? AND thesis_key=? AND position_status=\'CLOSED\'', [restored.position_status, restored.close_reason, restored.completed_at, Date.now(), userId, lifecycle.thesis_key]);
  }
}
function reconcileManualClosedLifecycles(userId, positions) {
  const openSymbols = new Set(positions.filter(position => Number(position.positionAmt) !== 0).map(position => position.symbol));
  for (const lifecycle of all('SELECT * FROM execution_lifecycles WHERE user_id = ? AND position_status = \'OPEN\' AND entry_status = \'FILLED\'', [userId])) {
    if (openSymbols.has(lifecycle.symbol)) continue;
    const now = Date.now();
    run('UPDATE execution_lifecycles SET position_status=\'CLOSED\', close_reason=\'MANUAL\', updated_at=?, completed_at=? WHERE user_id=? AND thesis_key=? AND position_status=\'OPEN\'', [now, now, userId, lifecycle.thesis_key]);
    run('UPDATE trade_history SET status=\'CLOSED\', close_reason=\'MANUAL\', completed_at=? WHERE user_id=? AND thesis_key=? AND status != \'CLOSED\'', [now, userId, lifecycle.thesis_key]);
    queueTelegramExecution(userId, () => sendTelegram(
      'JEV CLOSE\nPair: ' + lifecycle.symbol + '\nReason: MANUAL\nStatus: CLOSED',
      'CLOSE:' + lifecycle.symbol + ':' + lifecycle.thesis_key + ':MANUAL', userId
    ));
  }
}
function assertCurrentActivePlan(candidateId) {
  const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
  const candidate = (artifact.execution_candidates || []).find(item => item.client_order_id === candidateId);
  const active = candidate && artifact.active_plan_by_symbol?.[candidate.symbol];
  if (!candidate) return { ok: false, error: 'Execution candidate not found' };
  if (!active || active.client_order_id !== candidate.client_order_id) return { ok: false, error: 'ACTIVE_PLAN_REPLACED' };
  const freshness = validateCandidateFreshness(artifact, candidate);
  return freshness.ok ? { ok: true } : { ok: false, error: freshness.reason };
}
function markCandidateInvalidated(clientOrderId, status) {
  const artifactPath = path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  let changed = false;
  for (const candidate of artifact.execution_candidates || []) {
    if (candidate.client_order_id === clientOrderId) {
      candidate.status = status;
      candidate.invalidated_at = Date.now();
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  return changed;
}
async function executeDemoCandidate(req, res) {
  try {
    const candidateId = String(req.body?.clientOrderId || '');
    const context = await loadServerExecutionCandidate(req.userId, candidateId, req.recovery === true);
    if (context.error) return res.status(context.error === 'Execution candidate not found' ? 404 : 409).json({ ok: false, demoOnly: true, error: context.error, ordersSent: false, withdrawalsSent: false });
    const { candidate, sizing, precision, signed, settings } = context;
    const recovery = req.recovery === true;
    if (!recovery && lifecycleBlocksReentry(req.userId, candidate)) return res.status(409).json({ ok: false, demoOnly: true, status: 'THESIS_LIFECYCLE_TERMINAL', reason: 'Existing lifecycle already filled/open/closed; new entry blocked', clientOrderId: candidate.client_order_id, ordersSent: false, withdrawalsSent: false });
    const lifecycle = getExecutionLifecycle(req.userId, candidate.client_order_id);
    if (recovery && !lifecycle) {
      const now = Date.now();
      run('INSERT OR IGNORE INTO execution_lifecycles (user_id,thesis_key,symbol,client_order_id,entry_status,position_status,protection_status,updated_at,candidate_json) VALUES (?,?,?,?,?,?,?,?,?)', [req.userId, candidate.client_order_id, candidate.symbol, candidate.client_order_id, 'FILLED', 'OPEN', 'PENDING', now, JSON.stringify(candidate)]);
    } else if (recovery && lifecycle && !lifecycle.candidate_json) {
      run('UPDATE execution_lifecycles SET candidate_json=?, updated_at=? WHERE user_id=? AND thesis_key=?', [JSON.stringify(candidate), Date.now(), req.userId, candidate.client_order_id]);
    }
    demoExecutionSummaries.set(String(req.userId), { status: 'PRECHECK', clientOrderId: candidate.client_order_id, leverage: settings.leverage, marginMode: settings.marginMode, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const order = buildDemoEntryOrder(candidate, sizing, precision);
    if (sizing.status !== 'SIZED') return res.status(409).json({ ok: false, demoOnly: true, reason: sizing.status, order, ordersSent: false, withdrawalsSent: false });
    const enabled = demoExecutionEnabled;
    const protectionPlan = buildProtectionOrders(candidate, sizing, precision);
    const submitProtection = protective => signed('POST', '/fapi/v1/algoOrder', { symbol: protective.symbol, side: protective.side, algoType: 'CONDITIONAL', type: protective.type, triggerPrice: protective.stopPrice, closePosition: protective.closePosition === true || protective.closePosition === 'true' ? 'true' : 'false', workingType: protective.workingType, clientAlgoId: protective.clientOrderId.slice(0, 36) });
    const listProtection = () => signed('GET', '/fapi/v1/openAlgoOrders', { symbol: candidate.symbol });
    const waitForPosition = async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const positions = await signed('GET', '/fapi/v2/positionRisk', { symbol: candidate.symbol });
        if (positions.some(position => Number(position.positionAmt) !== 0)) return true;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    };
    const ensureProtection = async () => {
      const expected = buildProtectionOrders(candidate, sizing, precision).orders;
      if (!(await waitForPosition())) return { expected, protection: [], protectionVerified: false, error: 'POSITION_NOT_VISIBLE_YET' };
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existingProtection = await listProtection();
        const existingIds = new Set(existingProtection.map(item => item.clientAlgoId || item.clientOrderId));
        const protection = [];
        try {
          for (const protective of expected) if (!existingIds.has(protective.clientOrderId.slice(0, 36))) protection.push(await submitProtection(protective));
          const verifiedIds = new Set((await listProtection()).map(item => item.clientAlgoId || item.clientOrderId));
          const protectionVerified = expected.every(item => verifiedIds.has(item.clientOrderId.slice(0, 36)));
          if (protectionVerified) markLifecycleProtection(req.userId, candidate.client_order_id, 'VERIFIED');
          else markLifecycleProtection(req.userId, candidate.client_order_id, 'PENDING');
          return { expected, protection, protectionVerified };
        } catch (error) {
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      throw lastError || new Error('PROTECTION_RETRY_EXHAUSTED');
    };
    const permission = demoExecutionGate({ botEnabled: recovery || botStates.get(req.userId) === true, ordersEnabled: enabled, protectiveOrdersReady: protectionPlan.status === 'READY_AFTER_ENTRY_FILL', riskStatus: 'ALLOWED', demoExecutionEnabled: enabled, unattendedDemoExecutionEnabled, internalRunner: req.internalRunner === true, explicitApproval: req.body?.explicitApproval === true });
        if (!permission.allowed) {
          const status = permission.reason;
          demoExecutionSummaries.set(String(req.userId), { status, authorization: 'NONE', clientOrderId: candidate.client_order_id, ordersSent: false, updatedAt: new Date().toISOString() });
          return res.status(409).json({ ok: false, demoOnly: true, ...permission, status, order, ordersSent: false, withdrawalsSent: false });
        }
        if (req.internalRunner !== true && req.body?.explicitApproval !== true) return res.status(409).json({ ok: false, demoOnly: true, status: 'EXPLICIT_APPROVAL_REQUIRED', reason: 'Every Demo order requires immediate user approval', order, ordersSent: false, withdrawalsSent: false });
    let existing = null;
    try { existing = await signed('GET', '/fapi/v1/order', { symbol: candidate.symbol, origClientOrderId: candidate.client_order_id }); }
    catch (error) {
      if (!/_(404|400):/.test(error.message) || !/Unknown order|Order does not exist/i.test(error.message)) throw error;
    }
    if (existing?.status === 'FILLED') {
      recordFilledTrade(req.userId, candidate, existing);
      const filledPlan = assertCurrentActivePlan(candidate.client_order_id);
      if (!recovery && !filledPlan.ok && filledPlan.error === 'ACTIVE_PLAN_REPLACED') {
        const emergency = buildEmergencyCloseOrder(candidate, existing.executedQty);
        let emergencyClose;
        try { emergencyClose = await signed('POST', '/fapi/v1/order', { symbol: emergency.symbol, side: emergency.side, type: emergency.type, quantity: emergency.quantity, reduceOnly: emergency.reduceOnly, newClientOrderId: emergency.clientOrderId }); }
        catch (error) { return res.status(502).json({ ok: false, demoOnly: true, status: 'FILLED_THESIS_INVALIDATED_EMERGENCY_CLOSE_FAILED', entry: existing, error: error.message, ordersSent: true, withdrawalsSent: false }); }
        return res.status(409).json({ ok: false, demoOnly: true, status: 'FILLED_THESIS_INVALIDATED_POSITION_CLOSED', entry: existing, emergencyClose, ordersSent: true, withdrawalsSent: false });
      }
      const protectionOrders = buildProtectionOrders(candidate, sizing, precision).orders;
      const protection = [];
      try { for (const protective of protectionOrders) protection.push(await submitProtection(protective)); }
      catch (error) {
        markLifecycleProtection(req.userId, candidate.client_order_id, 'PENDING');
        return res.status(202).json({ ok: false, demoOnly: true, status: 'FILLED_PROTECTION_PENDING', entry: existing, protection, protectionVerified: false, error: error.message, ordersSent: true, withdrawalsSent: false });
      }
      const openOrders = await listProtection();
      const protectionVerified = protectionOrders.every(order => openOrders.some(open => (open.clientAlgoId || open.clientOrderId) === order.clientOrderId));
      if (!protectionVerified) {
        markLifecycleProtection(req.userId, candidate.client_order_id, 'PENDING');
        return res.status(202).json({ ok: false, demoOnly: true, status: 'FILLED_PROTECTION_PENDING', entry: existing, protection, protectionVerified: false, ordersSent: true, withdrawalsSent: false });
      }
      demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_PROTECTED', orderId: existing.orderId, clientOrderId: candidate.client_order_id, protectionVerified: true, updatedAt: new Date().toISOString() });
      return res.json({ ok: true, demoOnly: true, idempotent: true, status: 'FILLED_PROTECTED', entry: existing, protection, protectionVerified: true, ordersSent: true, withdrawalsSent: false });
    }
    if (existing && ['NEW', 'PARTIALLY_FILLED'].includes(existing.status)) {
      try {
        const ensured = await ensureProtection();
        demoExecutionSummaries.set(String(req.userId), { status: ensured.protectionVerified ? 'ENTRY_ALREADY_OPEN_PROTECTED' : 'ENTRY_OPEN_PROTECTION_PENDING', orderId: existing.orderId, clientOrderId: candidate.client_order_id, protectionVerified: ensured.protectionVerified, updatedAt: new Date().toISOString() });
        return res.status(409).json({ ok: false, demoOnly: true, status: ensured.protectionVerified ? 'ENTRY_ALREADY_OPEN_PROTECTED' : 'ENTRY_OPEN_PROTECTION_PENDING', entry: existing, protection: ensured.protection, protectionVerified: ensured.protectionVerified, ordersSent: true, withdrawalsSent: false });
      } catch (error) {
        return res.status(409).json({ ok: false, demoOnly: true, status: 'ENTRY_OPEN_PROTECTION_PENDING', entry: existing, protectionVerified: false, error: error.message, ordersSent: true, withdrawalsSent: false });
      }
    }
    demoExecutionSummaries.set(String(req.userId), { status: 'ORDER_SUBMIT', clientOrderId: candidate.client_order_id, leverage: settings.leverage, marginMode: settings.marginMode, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    try { await signed('POST', '/fapi/v1/marginType', { symbol: candidate.symbol, marginType: settings.marginMode === 'CROSS' ? 'CROSSED' : 'ISOLATED' }); } catch (error) { if (!/No need to change margin type/i.test(error.message)) throw error; }
    await signed('POST', '/fapi/v1/leverage', { symbol: candidate.symbol, leverage: String(settings.leverage) });
    run('INSERT INTO execution_lifecycles (user_id,thesis_key,symbol,client_order_id,entry_order_id,entry_status,position_status,protection_status,updated_at,candidate_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,thesis_key) DO UPDATE SET updated_at=excluded.updated_at,candidate_json=excluded.candidate_json', [req.userId, candidate.client_order_id, candidate.symbol, candidate.client_order_id, null, 'SUBMITTING', 'PENDING', 'PENDING', Date.now(), JSON.stringify(candidate)]);
    const entry = await signed('POST', '/fapi/v1/order', { symbol: candidate.symbol, side: candidate.side, type: 'LIMIT', timeInForce: 'GTC', quantity: sizing.quantity, price: sizing.price, newClientOrderId: candidate.client_order_id });
    run('UPDATE execution_lifecycles SET entry_order_id=?, entry_status=?, position_status=\'OPEN\', updated_at=?, candidate_json=? WHERE user_id=? AND thesis_key=?', [String(entry.orderId), entry.status || 'NEW', Date.now(), JSON.stringify(candidate), req.userId, candidate.client_order_id]);
    let protectionState = { protection: [], protectionVerified: false };
    try { protectionState = await ensureProtection(); } catch (error) { protectionState.error = error.message; }
    demoExecutionSummaries.set(String(req.userId), { status: entry.status || 'ORDER_SENT', orderId: entry.orderId, clientOrderId: candidate.client_order_id, protectionVerified: protectionState.protectionVerified, protectionError: protectionState.error || null, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    let current = entry;
    while (!['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(current.status)) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      current = await signed('GET', '/fapi/v1/order', { symbol: candidate.symbol, orderId: String(entry.orderId) });
      if (current.status === 'FILLED') break;
      const livePlan = assertCurrentActivePlan(candidate.client_order_id);
      if (!livePlan.ok && livePlan.error === 'ACTIVE_PLAN_REPLACED') {
        const canceled = await signed('DELETE', '/fapi/v1/order', { symbol: candidate.symbol, orderId: String(entry.orderId) });
        markCandidateInvalidated(candidate.client_order_id, 'ACTIVE_PLAN_REPLACED');
        demoExecutionSummaries.set(String(req.userId), { status: 'ACTIVE_PLAN_REPLACED', symbol: candidate.symbol, orderId: entry.orderId, clientOrderId: candidate.client_order_id, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cancelReason: 'CONFIRMED_STRUCTURE_REPLACED' });
        return res.status(409).json({ ok: false, demoOnly: true, status: 'ACTIVE_PLAN_REPLACED', entry: canceled, candidateStatus: 'ACTIVE_PLAN_REPLACED', cancelReason: 'CONFIRMED_STRUCTURE_REPLACED', ordersSent: true, withdrawalsSent: false });
      }
    }
    if (current.status !== 'FILLED') {
      demoExecutionSummaries.set(String(req.userId), { status: current.status || 'ENTRY_TERMINAL', symbol: candidate.symbol, orderId: entry.orderId, clientOrderId: candidate.client_order_id, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cancelReason: null });
      return res.status(409).json({ ok: false, demoOnly: true, status: current.status || 'ENTRY_TERMINAL', entry: current, candidateStatus: current.status || 'ENTRY_TERMINAL', cancelReason: null, ordersSent: true, withdrawalsSent: false });
    }
    recordFilledTrade(req.userId, candidate, current);
    const filledPlan = assertCurrentActivePlan(candidate.client_order_id);
    if (!recovery && !filledPlan.ok && filledPlan.error === 'ACTIVE_PLAN_REPLACED') {
      const emergency = buildEmergencyCloseOrder(candidate, current.executedQty);
      let emergencyClose;
      try {
        emergencyClose = await signed('POST', '/fapi/v1/order', { symbol: emergency.symbol, side: emergency.side, type: emergency.type, quantity: emergency.quantity, reduceOnly: emergency.reduceOnly, newClientOrderId: emergency.clientOrderId });
      } catch (error) {
        demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_THESIS_INVALIDATED_EMERGENCY_CLOSE_FAILED', orderId: current.orderId, clientOrderId: candidate.client_order_id, error: error.message, updatedAt: new Date().toISOString() });
        return res.status(502).json({ ok: false, demoOnly: true, status: 'FILLED_THESIS_INVALIDATED_EMERGENCY_CLOSE_FAILED', entry: current, error: error.message, ordersSent: true, withdrawalsSent: false });
      }
      demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_THESIS_INVALIDATED_POSITION_CLOSED', orderId: current.orderId, clientOrderId: candidate.client_order_id, emergencyClose, updatedAt: new Date().toISOString() });
      return res.status(409).json({ ok: false, demoOnly: true, status: 'FILLED_THESIS_INVALIDATED_POSITION_CLOSED', entry: current, emergencyClose, ordersSent: true, withdrawalsSent: false });
    }
    const execDedup = 'EXEC:' + candidate.symbol + ':' + current.orderId + ':FILLED';
    sendTelegram('<b>JEV EXECUTION</b>\nPair: ' + candidate.symbol + '\nSide: ' + (candidate.side || '-') + '\nOrderID: ' + current.orderId + '\nPrice: ' + (current.avgPrice || current.price || '-') + '\nQty: ' + (current.executedQty || '-') + '\nStatus: FILLED', execDedup, req.userId);
    const protectionOrdersAfterFill = buildProtectionOrders(candidate, sizing, precision).orders;
    let protectionAfterFill = [];
    let protectionVerified = false;
    try {
      const ensured = await ensureProtection();
      protectionAfterFill = ensured.protection;
      protectionVerified = ensured.protectionVerified;
    } catch (error) {
      markLifecycleProtection(req.userId, candidate.client_order_id, 'PENDING');
      demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_PROTECTION_PENDING', orderId: current.orderId, clientOrderId: candidate.client_order_id, protectionVerified: false, error: error.message, updatedAt: new Date().toISOString() });
      return res.status(202).json({ ok: false, demoOnly: true, status: 'FILLED_PROTECTION_PENDING', entry: current, protection: protectionAfterFill, protectionVerified: false, error: error.message, ordersSent: true, withdrawalsSent: false });
    }
    if (!protectionVerified) {
      markLifecycleProtection(req.userId, candidate.client_order_id, 'PENDING');
      demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_PROTECTION_PENDING', orderId: current.orderId, clientOrderId: candidate.client_order_id, protectionVerified: false, updatedAt: new Date().toISOString() });
      return res.status(202).json({ ok: false, demoOnly: true, status: 'FILLED_PROTECTION_PENDING', entry: current, protection: protectionAfterFill, protectionVerified: false, ordersSent: true, withdrawalsSent: false });
    }
    markLifecycleProtection(req.userId, candidate.client_order_id, 'VERIFIED');
    demoExecutionSummaries.set(String(req.userId), { status: 'FILLED_PROTECTED', orderId: current.orderId, clientOrderId: candidate.client_order_id, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString(), protectionVerified: true });
        return res.json({ ok: true, demoOnly: true, status: 'FILLED_PROTECTED', entry: current, protection: protectionAfterFill, protectionVerified: true, ordersSent: true, withdrawalsSent: false });
  } catch (error) { res.status(502).json({ ok: false, demoOnly: true, error: error.message || 'Binance Demo execution failed', ordersSent: false, withdrawalsSent: false }); }
}
app.post('/api/binance-demo/execute-candidate', auth, executeDemoCandidate);

async function recoverOpenTrade(userId, row) {
  let candidate;
  const lifecycle = row.client_order_id ? getExecutionLifecycle(userId, row.client_order_id) : null;
  try {
    if (lifecycle?.candidate_json) candidate = JSON.parse(lifecycle.candidate_json);
    if (!candidate) {
      const raw = row.candidate_json || row.raw_json || '{}';
      const parsed = JSON.parse(raw);
      candidate = parsed.candidate || parsed;
    }
  } catch { return; }
  if (!candidate?.client_order_id || !candidate?.symbol || !Number.isFinite(Number(candidate.sl)) || !Number.isFinite(Number(candidate.tp))) {
    demoExecutionSummaries.set(`recovery:${userId}:${candidate?.symbol || 'UNKNOWN'}`, { status: 'BLOCKED_MISSING_PROVENANCE', symbol: candidate?.symbol || null, clientOrderId: candidate?.client_order_id || null, updatedAt: new Date().toISOString() });
    return;
  }
  const key = 'recovery:' + userId + ':' + candidate.client_order_id;
  if (executionAttempts.has(key)) return;
  executionAttempts.set(key, true);
  let payload;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { payload = body; return this; } };
  const sid = findActiveSessionId(sessions, botStates, userId);
  if (!sid) { executionAttempts.delete(key); return; }
  await executeDemoCandidate({ userId, recovery: true, cookies: { sid }, body: { clientOrderId: candidate.client_order_id, explicitApproval: true } }, response);
  if (!payload?.protectionVerified) executionAttempts.delete(key);
}
async function runExecutionCycle(userId) {
  if (botStates.get(userId) !== true) return;
  const lifecycleRows = all('SELECT candidate_json, client_order_id FROM execution_lifecycles WHERE user_id = ? AND entry_status = \'FILLED\' AND position_status = \'OPEN\' AND candidate_json IS NOT NULL', [userId]);
  const tradeRows = all('SELECT raw_json, client_order_id FROM trade_history WHERE user_id = ? AND status = \'OPEN\' AND raw_json IS NOT NULL', [userId]);
  const recoveryRows = [...lifecycleRows, ...tradeRows].filter(row => {
    const lifecycle = row.client_order_id ? getExecutionLifecycle(userId, row.client_order_id) : null;
    return lifecycle?.position_status === 'OPEN';
  });
  await Promise.allSettled(recoveryRows.map(row => recoverOpenTrade(userId, row)));
  let artifact;
  try { artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8')); } catch (error) {
    demoExecutionSummaries.set(sid, { status: 'ARTIFACT_UNAVAILABLE', error: error.message, updatedAt: new Date().toISOString() });
    return;
  }
  if (artifact.status !== 'PASS' || !Number.isFinite(Number(artifact.server_time)) || Date.now() - Number(artifact.server_time) > LIVE_DEMO_STALE_AFTER_MS) {
    demoExecutionSummaries.set(sid, { status: 'ARTIFACT_STALE', updatedAt: new Date().toISOString() });
    return;
  }
  const executions = (artifact.execution_candidates || []).map(async candidate => {
    const freshness = validateCandidateFreshness(artifact, candidate);
    if (!freshness.ok || candidate.status !== 'APPROVED_FOR_EXECUTION') return;
    const planDedup = 'PLAN:' + candidate.symbol + ':' + candidate.client_order_id;
    sendTelegram('JEV PLAN READY\nPair: ' + candidate.symbol + '\nSetup: ' + (candidate.setup_id || '-') + '\nSide: ' + (candidate.side || '-') + '\nEntry: ' + (candidate.entry || '-') + '\nSL: ' + (candidate.sl || '-') + '\nTP: ' + (candidate.tp || '-') + '\nStatus: APPROVED\nExecution: runner submitting to Binance', planDedup, userId);
    if (botStates.get(userId) !== true) return;
    const key = userId + ":" + candidate.client_order_id;
    const prior = demoExecutionSummaries.get(key);
    if (!candidate.client_order_id || lifecycleBlocksReentry(userId, candidate) || (executionAttempts.has(key) && ['FILLED_PROTECTED', 'PROTECTION_FAILED_POSITION_CLOSED', 'PROTECTION_FAILED_EMERGENCY_CLOSE_FAILED'].includes(prior?.status))) return;
    executionAttempts.set(key, true);
    let payload;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { payload = body; return this; } };
    const sid = findActiveSessionId(sessions, botStates, userId);
    if (!sid) { executionAttempts.delete(key); return; }
    await executeDemoCandidate({ userId, cookies: { sid }, internalRunner: true, body: { clientOrderId: candidate.client_order_id } }, response);
    demoExecutionSummaries.set(key, { ...(payload || { ok: false, error: 'empty_executor_response' }), symbol: candidate.symbol, clientOrderId: candidate.client_order_id, attemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    if (!payload?.ordersSent && payload?.status !== 'ENTRY_ALREADY_OPEN') executionAttempts.delete(key);
  });
  await Promise.allSettled(executions);
}

async function runStartupRecovery() {
  const rows = all("SELECT user_id, candidate_json, client_order_id, entry_status, position_status FROM execution_lifecycles WHERE entry_status = 'FILLED' AND position_status = 'OPEN' AND candidate_json IS NOT NULL");
  await runStartupRecoveryRows(rows);
}
async function runStartupRecoveryRows(rows) {
  await selectAndRunStartupRecovery(rows, recoverOpenTrade);
}

function startExecutionRunner(userId) {
  const key = "execution:" + userId;
  if (botRunners.get(key)?.timer) return botRunners.get(key);
  const runner = { timer: null, running: false, cycles: 0, error: null, last_started_at: null, last_finished_at: null };
  const tick = async () => {
    if (runner.running || botStates.get(userId) !== true) return;
    runner.running = true;
    runner.last_started_at = Date.now();
    try { await runExecutionCycle(userId); runner.cycles += 1; runner.error = null; }
    catch (error) { runner.error = error?.message || 'execution_cycle_failed'; runner.last_error_at = Date.now(); }
    finally { runner.running = false; runner.last_finished_at = Date.now(); }
  };
  runner.timer = setInterval(tick, EXECUTION_INTERVAL_MS);
  botRunners.set(key, runner);
  tick();
  return runner;
}

function stopExecutionRunner(userId) {
  const key = "execution:" + userId;
  const runner = botRunners.get(key);
  if (runner?.timer) clearInterval(runner.timer);
  botRunners.delete(key);
}app.get('/api/v2/status', auth, (req, res) => {
  const artifactPath = path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json');
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    res.json({ ok: true, workflow: '1H Bias → 15M MarketStructureBot → 5M ConfirmationBot → SelectionBot → SetupBot', activeSetups: ['fvg_context', 'ob_context', 'liquidity_sweep_reversal', 'breaker_block', 'rbs_sbr_continuation'], artifact });
  } catch {
    res.status(503).json({ ok: false, error: 'V2 Live Demo workflow artifact unavailable' });
  }
});
const EXCHANGES = {
  okx: { name: 'OKX', base: 'https://www.okx.ac', verifyPath: '/api/v5/account/balance', passphrase: true },
  binance: { name: 'Binance Futures', base: 'https://fapi.binance.com', verifyPath: '/fapi/v2/account', passphrase: false },
  // Keep the legacy id for stored API-key rows; Binance's current Futures demo/testnet REST base is demo-fapi.
  binanceTestnet: { name: 'Binance Futures Demo', base: 'https://demo-fapi.binance.com', verifyPath: '/fapi/v2/account', passphrase: false }
};
const BINANCE_DEMO_FUTURES_BASE = 'https://demo-fapi.binance.com';
const BINANCE_DATA_BASE = BINANCE_DEMO_FUTURES_BASE;
startBinanceMarketStream();
startMarketObserver();
startMarketStructureStreamTrigger();
startLiveDemoWorkflowRunner('global');

app.get('/api/chart/candles', auth, async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = String(req.query.interval || '5m');
  const limit = Math.min(500, Math.max(30, Number(req.query.limit) || 120));
  if (!SUPPORTED_SYMBOLS.includes(symbol) || !['1h', '15m', '5m'].includes(interval)) return res.status(400).json({ error: 'Unsupported chart request' });
  try {
    const candles = await fetchBinanceCandles(symbol, interval, limit);
    res.json({ ok: true, symbol, interval, candles });
  } catch (error) {
    res.status(502).json({ ok: false, symbol, error: error.message });
  }
});
app.get('/api/chart/structure', auth, (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(symbol)) return res.status(400).json({ ok: false, error: 'Unsupported chart symbol' });
  try {
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_LIVE_PIPELINE.json'), 'utf8'));
    const symbolState = artifact.symbols?.[symbol] || {};
    const from = Number(req.query.from);
    const to = Number(req.query.to);
    const inWindow = value => !Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(Number(value)) || (Number(value) >= from && Number(value) <= to);
    const events = (symbolState.recent_events || []).map(event => ({
      event_id: event.event_id,
      kind: event.kind,
      side: event.side,
      bias: event.bias,
      confirmation: event.confirmation,
      selection: event.selection,
      selection_reason: event.selection_reason || null,
      selection_method: event.selection_method || null,
      primary_owner: event.primary_owner || null,
      eligible_setup_candidates: event.eligible_setup_candidates || [],
      contributing_contexts: event.contributing_contexts || [],
      setup_strength_profiles: event.setup_strength_profiles || [],
      setup_eligibility_ledger: event.setup_eligibility_ledger || [],
      structure_layer: event.structure_layer || null,
      level_classification: event.level_classification || null,
      pool_id: event.pool_id || null,
      sweep_level: event.sweep_level || null,
      sweep_extreme: event.sweep_extreme || null,
      structure_index: Number.isFinite(Number(event.structure_index)) ? Number(event.structure_index) : null,
      event_time: Number.isFinite(Number(event.event_time)) ? Number(event.event_time) : null,
      source_times: Array.isArray(event.source_times) ? event.source_times : [],
      broken_level: Number.isFinite(Number(event.broken_level)) ? Number(event.broken_level) : null,
      protected_level: Number.isFinite(Number(event.protected_level)) ? Number(event.protected_level) : null,
      ob_source_index: Number.isFinite(Number(event.ob_source_index)) ? Number(event.ob_source_index) : null,
      ob_zone_low: Number.isFinite(Number(event.ob_zone_low)) ? Number(event.ob_zone_low) : null,
      ob_zone_high: Number.isFinite(Number(event.ob_zone_high)) ? Number(event.ob_zone_high) : null,
      flip_level: Number.isFinite(Number(event.flip_level)) ? Number(event.flip_level) : null,
      zone_bounds: event.zone_bounds || null,
      lifecycle_state: event.lifecycle_state || null,
      mitigation_time: Number.isFinite(Number(event.mitigation_time)) ? Number(event.mitigation_time) : null,
      invalidation_time: Number.isFinite(Number(event.invalidation_time)) ? Number(event.invalidation_time) : null,
      continuation_state: event.continuation_state || null,
      parent_event_id: event.parent_event_id || null,
      source_event_ids: event.source_event_ids || [],
      event_time: Number.isFinite(Number(event.event_time)) ? Number(event.event_time) : null,
      event_price: Number.isFinite(Number(event.event_price)) ? Number(event.event_price) : null,
      pivot_index: Number.isFinite(Number(event.pivot_index)) ? Number(event.pivot_index) : null,
      pivot_time: Number.isFinite(Number(event.pivot_time)) ? Number(event.pivot_time) : null,
      pivot_price: Number.isFinite(Number(event.pivot_price)) ? Number(event.pivot_price) : null,
      break_index: Number.isFinite(Number(event.break_index)) ? Number(event.break_index) : null,
      break_time: Number.isFinite(Number(event.break_time)) ? Number(event.break_time) : null,
      break_price: Number.isFinite(Number(event.break_price)) ? Number(event.break_price) : null,
      source_times: Array.isArray(event.source_times) ? event.source_times : [],
      ob_source_time: Number.isFinite(Number(event.ob_source_time)) ? Number(event.ob_source_time) : null,
      zone_start_time: Number.isFinite(Number(event.zone_start_time)) ? Number(event.zone_start_time) : (Array.isArray(event.source_times) && event.source_times.length ? Math.min(...event.source_times.map(Number).filter(Number.isFinite)) : (Number.isFinite(Number(event.ob_source_time)) ? Number(event.ob_source_time) : Number(event.event_time))),
            zone_end_time: Number.isFinite(Number(event.zone_end_time)) ? Number(event.zone_end_time) : (Number.isFinite(Number(event.mitigation_time)) ? Number(event.mitigation_time) : (Number.isFinite(Number(event.invalidation_time)) ? Number(event.invalidation_time) : (Number.isFinite(Number(event.event_time)) ? Number(event.event_time) : null))),
      ob_source_price: Number.isFinite(Number(event.ob_source_price)) ? Number(event.ob_source_price) : null,
      live_demo_plan: event.live_demo_plan || null,
      plan_status: event.plan_status || null
    }));
    const latestId = artifact.latest_structure_event_ids?.[symbol] || null;
    const structure_visuals = events.filter(event => ['BOS', 'CHoCH_MSS', 'FVG', 'LIQUIDITY_SWEEP', 'ORDER_BLOCK', 'BREAKER_BLOCK'].includes(event.kind)).map(event => ({ event_id: event.event_id, kind: event.kind, side: event.side, structure_index: event.structure_index, structure_layer: event.structure_layer || 'SWING', line_style: event.line_style || (event.structure_layer === 'INTERNAL' ? 'DASHED' : 'SOLID'), label_size: event.label_size || (event.structure_layer === 'INTERNAL' ? 'TINY' : 'SMALL'), ob_layer: event.ob_layer || (event.structure_layer === 'INTERNAL' ? 'INTERNAL' : 'SWING'), event_time: event.event_time, event_price: event.event_price, pivot_index: event.pivot_index, pivot_time: event.pivot_time, pivot_price: event.pivot_price, break_index: event.break_index, break_time: event.break_time, break_price: event.break_price, source_times: event.source_times, ob_source_time: event.ob_source_time, zone_start_time: event.zone_start_time, zone_end_time: event.zone_end_time, mitigation_time: event.mitigation_time, invalidation_time: event.invalidation_time, ob_source_price: event.ob_source_price, broken_level: event.broken_level, protected_level: event.protected_level, ob_source_index: event.ob_source_index, ob_zone_low: event.ob_zone_low, ob_zone_high: event.ob_zone_high, flip_level: event.flip_level, zone_bounds: event.zone_bounds, sweep_level: event.sweep_level, lifecycle_state: event.lifecycle_state, source_event_ids: event.source_event_ids }));
    const swing_visuals = (symbolState.swing_visuals || []).map(swing => ({ label: swing.label, kind: swing.kind, index: swing.index, price: swing.price, time: Number.isFinite(Number(swing.time)) ? Math.floor(Number(swing.time) / 1000) : null })).filter(swing => Number.isFinite(swing.time) && Number.isFinite(Number(swing.price)) && inWindow(swing.time));
    const active_candidates = (artifact.execution_candidates || []).filter(candidate =>
      candidate.symbol === symbol &&
      candidate.status === 'APPROVED_FOR_EXECUTION' &&
      artifact.active_plan_by_symbol?.[symbol]?.client_order_id === candidate.client_order_id
    );
    res.json({ ok: true, source: 'JEV MarketStructureBot workflow', artifact_status: artifact.status, server_time: artifact.server_time, symbol, latest_structure_event_id: latestId, latest_confirmed_structure_event_id: artifact.latest_confirmed_structure_event_ids?.[symbol] || null, latest_closed_candle: symbolState.latest_closed_candle || {}, events, structure_visuals, swing_visuals, active_candidates });
  } catch (error) { res.status(503).json({ ok: false, error: 'Authoritative structure unavailable' }); }
});
app.get('/api/chart/tickers', auth, async (req, res) => {
  const streamPrices = getBinanceStreamPrices();
  if (Object.keys(streamPrices).length) return res.json({ ok: true, prices: streamPrices, updated_at: getBinanceStreamState().updatedAt, source: 'websocket' });
  try {
    const query = encodeURIComponent(JSON.stringify(SUPPORTED_SYMBOLS));
    const response = await fetchBinance(BINANCE_DATA_BASE + '/fapi/v1/ticker/price?symbols=' + query);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error(data?.msg || 'Ticker request failed');
    res.json({ ok: true, prices: Object.fromEntries(data.map(row => [row.symbol, Number(row.price)])), updated_at: Date.now() });
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
});
app.get('/macro-news', auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 10);
  try {
    const url = `https://www.financecalendar.com/wp-json/fc/v1/calendar?from=${today}&to=${end}&impact=high&limit=8`;
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'JEV-Trading-Bot/1.0' }, signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.events)) throw new Error('Macro calendar unavailable');
    const events = payload.events.filter(event => event && typeof event.time_utc === 'string').slice(0, 8).map(event => ({
      title: event.title || event.name || 'Unnamed event',
      time_utc: event.time_utc,
      currency: event.currency || 'SOURCE NOT PROVIDED',
      impact: event.impact || 'SOURCE NOT PROVIDED',
      forecast: event.forecast ?? event.consensus ?? 'NOT PROVIDED',
      previous: event.previous ?? event.prior ?? 'NOT PROVIDED',
      actual: event.actual ?? 'NOT RELEASED',
      source: event.url || 'https://www.financecalendar.com/',
      source_name: 'financecalendar.com',
      data_status: 'VERIFIED'
    }));
    res.json({ ok: true, source: 'financecalendar.com', source_url: 'https://www.financecalendar.com/api/', fetched_at: new Date().toISOString(), from: today, to: end, events });
  } catch {
    res.status(503).json({ ok: false, status: 'DATA_UNAVAILABLE', source: 'financecalendar.com' });
  }
});
app.get('/api/exchanges', auth, (req, res) => {
  res.json(Object.entries(EXCHANGES).map(([id, x]) => ({ id, name: x.name, passphrase: x.passphrase })));
});

function okxHeaders(apiKey, secretKey, passphrase, method, requestPath, body = '') {
  const timestamp = new Date().toISOString();
  const prehash = timestamp + method + requestPath + body;
  return { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': crypto.createHmac('sha256', secretKey).update(prehash).digest('base64'), 'OK-ACCESS-TIMESTAMP': timestamp, 'OK-ACCESS-PASSPHRASE': passphrase, 'Content-Type': 'application/json' };
}

function binanceSignature(secretKey, query) { return crypto.createHmac('sha256', secretKey).update(query).digest('hex'); }

async function verifyExchange(exchange, apiKey, secretKey, passphrase) {
  if (exchange === 'okx') {
    const requestPath = '/api/v5/account/balance';
    const r = await fetch(EXCHANGES.okx.base + requestPath, { headers: okxHeaders(apiKey, secretKey, passphrase, 'GET', requestPath) });
    const data = await r.json();
    if (data.code !== '0') throw new Error(data.msg || 'OKX credential rejected');
    return { status: 'connected', detail: 'Account balance permission verified' };
  }
  if (exchange === 'binance' || exchange === 'binanceTestnet') {
    const timestamp = Date.now();
    const query = 'timestamp=' + timestamp + '&recvWindow=5000';
    const base = EXCHANGES[exchange].base;
    const r = await fetchBinance(base + '/fapi/v2/account?' + query + '&signature=' + binanceSignature(secretKey, query), { headers: { 'X-MBX-APIKEY': apiKey } });
    const data = await r.json();
    if (!r.ok || data.code) throw new Error(data.msg || 'Binance credential rejected');
    return { status: 'connected', detail: 'Futures account permission verified' };
  }
  throw new Error('Unsupported exchange');
}

app.post('/api/keys', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 30, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  const { exchange = 'okx', apiKey, secretKey, passphrase = '', label } = req.body;
  if (!EXCHANGES[exchange] || ![apiKey, secretKey].every(v => typeof v === 'string' && v.length >= 1 && v.length <= 256) || (exchange === 'okx' && (!passphrase || passphrase.length > 256))) return res.status(400).json({ error: 'Invalid fields' });
  try {
    const result = await verifyExchange(exchange, apiKey, secretKey, passphrase);
    run('INSERT INTO api_keys (user_id, exchange, api_key, secret_key, passphrase, label, created_at, encrypted, status, verified_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.userId, exchange, encryptSecret(apiKey), encryptSecret(secretKey), encryptSecret(passphrase), String(label || 'default').slice(0, 64), new Date().toISOString(), 1, result.status, new Date().toISOString()]);
    res.json({ ok: true, exchange, status: result.status, detail: result.detail });
  } catch (e) {
    res.status(422).json({ ok: false, exchange, status: 'rejected', error: e.message });
  }
});

app.get('/api/keys', auth, (req, res) => {
  const rows = all('SELECT id, exchange, label, created_at, status, verified_at FROM api_keys WHERE user_id = ?', [req.userId]);
  res.json(rows);
});

app.post('/api/keys/:id/verify', auth, async (req, res) => {
  const row = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId]);
  if (!row) return res.status(404).json({ error: 'API key not found' });
  try {
    const result = await verifyExchange(row.exchange || 'okx', decryptSecret(row.api_key), decryptSecret(row.secret_key), decryptSecret(row.passphrase));
    run('UPDATE api_keys SET status=?, verified_at=? WHERE id=? AND user_id=?', [result.status, new Date().toISOString(), row.id, req.userId]);
    res.json({ ok: true, exchange: row.exchange, status: result.status, detail: result.detail });
  } catch (e) {
    run('UPDATE api_keys SET status=?, verified_at=? WHERE id=? AND user_id=?', ['rejected', new Date().toISOString(), row.id, req.userId]);
    res.status(401).json({ ok: false, exchange: row.exchange, status: 'rejected', error: e.message });
  }
});

async function verifyTelegram(token, chatId, sendTest = false) {
  const meResponse = await fetch('https://api.telegram.org/bot' + token + '/getMe', { signal: AbortSignal.timeout(10_000) });
  const me = await meResponse.json().catch(() => null);
  if (!meResponse.ok || me?.ok !== true) throw new Error('Invalid Telegram bot token');
  if (sendTest) {
    const message = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'JEV Telegram connected — test message' }), signal: AbortSignal.timeout(10_000) });
    const result = await message.json().catch(() => null);
    if (!message.ok || result?.ok !== true) throw new Error(result?.description || 'Telegram chat ID rejected');
  }
  return me.result;
}
app.get('/api/telegram', auth, (req, res) => {
  const row = get('SELECT chat_id, enabled, status, verified_at, updated_at FROM telegram_connections WHERE user_id = ?', [req.userId]);
  res.json(row ? { ok: true, configured: true, ...row, enabled: Number(row.enabled) === 1 } : { ok: true, configured: false });
});
app.post('/api/telegram', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':telegram:' + req.userId, 10, 15 * 60 * 1000)) return res.status(429).json({ ok: false, error: 'Too many Telegram attempts' });
  const token = String(req.body?.botToken || '').trim();
  const chatId = String(req.body?.chatId || '').trim();
  const enabled = req.body?.enabled === true;
  if (token.length < 1 || token.length > 256 || chatId.length < 1 || chatId.length > 128) return res.status(400).json({ ok: false, error: 'Telegram token and chat ID are required' });
  try {
    await verifyTelegram(token, chatId, true);
    const now = new Date().toISOString();
    run('INSERT OR REPLACE INTO telegram_connections (user_id, bot_token_encrypted, chat_id, enabled, status, verified_at, created_at, updated_at) VALUES (?,?,?,?,?,?,COALESCE((SELECT created_at FROM telegram_connections WHERE user_id = ?),?),?)', [req.userId, encryptSecret(token), chatId, enabled ? 1 : 0, 'connected', now, req.userId, now, now]);
    res.json({ ok: true, configured: true, enabled, status: 'connected', verifiedAt: now });
  } catch (error) { res.status(422).json({ ok: false, status: 'rejected', error: error.message }); }
});
app.post('/api/telegram/test', auth, async (req, res) => {
  const row = get('SELECT * FROM telegram_connections WHERE user_id = ?', [req.userId]);
  if (!row) return res.status(404).json({ ok: false, error: 'Telegram is not configured' });
  try { await verifyTelegram(decryptSecret(row.bot_token_encrypted), row.chat_id, true); run('UPDATE telegram_connections SET status=?, verified_at=?, updated_at=? WHERE user_id=?', ['connected', new Date().toISOString(), new Date().toISOString(), req.userId]); res.json({ ok: true, status: 'connected' }); }
  catch (error) { run('UPDATE telegram_connections SET status=?, updated_at=? WHERE user_id=?', ['rejected', new Date().toISOString(), req.userId]); res.status(422).json({ ok: false, status: 'rejected', error: error.message }); }
});
app.put('/api/telegram', auth, (req, res) => {
  const enabled = req.body?.enabled === true;
  const row = get('SELECT id FROM telegram_connections WHERE user_id = ?', [req.userId]);
  if (!row) return res.status(404).json({ ok: false, error: 'Telegram is not configured' });
  run('UPDATE telegram_connections SET enabled=?, updated_at=? WHERE user_id=?', [enabled ? 1 : 0, new Date().toISOString(), req.userId]);
  res.json({ ok: true, enabled });
});
app.delete('/api/telegram', auth, (req, res) => { run('DELETE FROM telegram_connections WHERE user_id=?', [req.userId]); res.json({ ok: true }); });

app.delete('/api/keys/:id', auth, (req, res) => {
  run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId]);
  res.json({ ok: true });
});

app.post('/api/binance-demo/order-test-disabled', auth, async (req, res) => {
  const { keyId, symbol, side, type = 'LIMIT', quantity, price, timeInForce = 'GTC' } = req.body || {};
  const allowedSymbols = new Set(SUPPORTED_SYMBOLS);
  if (Number(keyId) <= 0 || !allowedSymbols.has(String(symbol).toUpperCase()) || !['BUY', 'SELL'].includes(side) || type !== 'LIMIT' || timeInForce !== 'GTC') {
    return res.status(400).json({ ok: false, error: 'Only Binance Demo LIMIT GTC order tests are allowed' });
  }
  const qty = Number(quantity), limitPrice = Number(price);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0) return res.status(400).json({ ok: false, error: 'Invalid quantity or price' });
  const keyRow = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND exchange = ?', [Number(keyId), req.userId, 'binanceTestnet']);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Binance Demo key not found' });
  try {
    const query = new URLSearchParams({ symbol: String(symbol).toUpperCase(), side, type, timeInForce, quantity: String(quantity), price: String(price), recvWindow: '5000', timestamp: String(Date.now()) });
    const queryString = query.toString();
    const url = EXCHANGES.binanceTestnet.base + '/fapi/v1/order/test?' + queryString + '&signature=' + binanceSignature(decryptSecret(keyRow.secret_key), queryString);
    const response = await fetchBinance(url, { method: 'POST', headers: { 'X-MBX-APIKEY': decryptSecret(keyRow.api_key) } });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json({ ok: response.ok, testOnly: true, symbol: String(symbol).toUpperCase(), side, type, quantity: qty, price: limitPrice, exchangeResponse: data });
  } catch {
    res.status(502).json({ ok: false, testOnly: true, error: 'Binance Demo order test failed' });
  }
});
app.post('/api/binance-demo/order-disabled', auth, async (req, res) => {
  const { keyId, symbol, side, quantity, price } = req.body || {};
  if (Number(keyId) <= 0 || String(symbol).toUpperCase() !== 'BTCUSDT' || side !== 'BUY') return res.status(400).json({ ok: false, error: 'Only BTCUSDT Demo BUY orders are allowed' });
  const qty = Number(quantity), limitPrice = Number(price);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 0.003 || !Number.isFinite(limitPrice) || limitPrice <= 0 || qty * limitPrice > 250) return res.status(400).json({ ok: false, error: 'Order exceeds Demo test safety limits' });
  const keyRow = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND exchange = ?', [Number(keyId), req.userId, 'binanceTestnet']);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Binance Demo key not found' });
  try {
    const query = new URLSearchParams({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', quantity: String(quantity), price: String(price), recvWindow: '5000', timestamp: String(Date.now()) });
    const queryString = query.toString();
    const url = EXCHANGES.binanceTestnet.base + '/fapi/v1/order?' + queryString + '&signature=' + binanceSignature(decryptSecret(keyRow.secret_key), queryString);
    const response = await fetchBinance(url, { method: 'POST', headers: { 'X-MBX-APIKEY': decryptSecret(keyRow.api_key) } });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json({ ok: response.ok, demoOnly: true, exchangeResponse: data });
  } catch { res.status(502).json({ ok: false, demoOnly: true, error: 'Binance Demo order failed' }); }
});

app.post('/api/binance-demo/cancel-disabled', auth, async (req, res) => {
  const { keyId, symbol = 'BTCUSDT', orderId } = req.body || {};
  if (Number(keyId) <= 0 || String(symbol).toUpperCase() !== 'BTCUSDT' || !Number.isInteger(Number(orderId)) || Number(orderId) <= 0) return res.status(400).json({ ok: false, error: 'Invalid Demo cancel request' });
  const keyRow = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND exchange = ?', [Number(keyId), req.userId, 'binanceTestnet']);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Binance Demo key not found' });
  try {
    const query = new URLSearchParams({ symbol: 'BTCUSDT', orderId: String(orderId), recvWindow: '5000', timestamp: String(Date.now()) });
    const queryString = query.toString();
    const url = EXCHANGES.binanceTestnet.base + '/fapi/v1/order?' + queryString + '&signature=' + binanceSignature(decryptSecret(keyRow.secret_key), queryString);
    const response = await fetchBinance(url, { method: 'DELETE', headers: { 'X-MBX-APIKEY': decryptSecret(keyRow.api_key) } });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json({ ok: response.ok, demoOnly: true, exchangeResponse: data });
  } catch { res.status(502).json({ ok: false, demoOnly: true, error: 'Binance Demo cancel failed' }); }
});
app.post('/api/exchanges/:exchange/request', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 60, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  const exchange = req.params.exchange;
  const method = String(req.body.method || 'GET').toUpperCase();
  const apiPath = req.body.path;
  const keyId = Number(req.body.keyId);
  const keyRow = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ? AND exchange = ?', [keyId, req.userId, exchange]);
  if (!keyRow || !EXCHANGES[exchange]) return res.status(400).json({ error: 'Exchange key not found' });
  if (method !== 'GET' || typeof apiPath !== 'string' || !apiPath.startsWith('/')) return res.status(400).json({ error: 'Invalid request' });
  try {
    const apiKey = decryptSecret(keyRow.api_key);
    const secretKey = decryptSecret(keyRow.secret_key);
    let url;
    let headers = {};
    if (exchange === 'okx') {
      if (!apiPath.startsWith('/api/v5/')) return res.status(400).json({ error: 'Invalid OKX path' });
      url = EXCHANGES.okx.base + apiPath;
      headers = okxHeaders(apiKey, secretKey, decryptSecret(keyRow.passphrase), method, apiPath);
    } else if (exchange === 'binance' || exchange === 'binanceTestnet') {
      if (!apiPath.startsWith('/fapi/')) return res.status(400).json({ error: 'Invalid Binance Futures path' });
      const query = new URLSearchParams(req.body.query || {});
      query.set('timestamp', String(Date.now()));
      query.set('recvWindow', '5000');
      const queryString = query.toString();
      url = EXCHANGES[exchange].base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secretKey, queryString);
      headers = { 'X-MBX-APIKEY': apiKey };
    } else return res.status(400).json({ error: 'Unsupported exchange' });
      const response = await fetchBinance(url, { method, headers });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Exchange request failed' });
  }
});

app.post('/api/okx', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 60, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests' });
  const { method, path: apiPath, body: reqBody, keyId } = req.body;
  if (!['GET', 'POST'].includes(String(method || '').toUpperCase()) || typeof apiPath !== 'string' || !apiPath.startsWith('/api/v5/') || apiPath.includes('..') || apiPath.includes('://')) return res.status(400).json({ error: 'Invalid OKX request' });
  const keyRow = get('SELECT * FROM api_keys WHERE id = ? AND user_id = ?', [Number(keyId), req.userId]);
  if (!keyRow) return res.status(400).json({ error: 'API key not found' });
  const timestamp = new Date().toISOString();
  const signPath = apiPath;
  const bodyStr = reqBody ? JSON.stringify(reqBody) : '';
  const prehash = timestamp + method.toUpperCase() + signPath + bodyStr;
  const headers = {
    'OK-ACCESS-KEY': decryptSecret(keyRow.api_key),
    'OK-ACCESS-SIGN': crypto.createHmac('sha256', decryptSecret(keyRow.secret_key)).update(prehash).digest('base64'),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': decryptSecret(keyRow.passphrase),
    'Content-Type': 'application/json'
  };
  const url = 'https://www.okx.ac' + signPath;
  const opts = { method: method.toUpperCase(), headers };
  if (bodyStr && method.toUpperCase() !== 'GET') opts.body = bodyStr;
  try {
    const r = await fetch(url, opts);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/history', auth, (req, res) => {
  const { trades } = req.body;
  if (!Array.isArray(trades)) return res.status(400).json({ error: 'trades array required' });
  for (const t of trades) {
    run('INSERT INTO trade_history (user_id,inst_id,side,pos_side,size,price,fee,funding_rate,slippage,pnl,ts,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.userId, t.instId, t.side, t.posSide||'', t.size||0, t.price||0, t.fee||0, t.fundingRate||0, t.slippage||0, t.pnl||0, t.ts||Date.now(), JSON.stringify(t)]);
  }
  res.json({ ok: true, count: trades.length });
});

app.get('/api/history', auth, async (req, res) => {
  try { await syncTradeHistory(req.userId); } catch {}
  const date = req.query.date;
  let sql = "SELECT * FROM trade_history WHERE user_id = ? AND status = 'CLOSED'";
  const params = [req.userId];
  if (date) {
    const start = new Date(date + 'T00:00:00').getTime();
    const end = start + 86400000;
    sql += ' AND ts >= ? AND ts < ?';
    params.push(start, end);
  }
  sql += ' ORDER BY ts DESC LIMIT 500';
  res.json(all(sql, params));
});

function normalizeBinance(rows) {
  return rows.map(r => ({ ts: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) })).sort((a, b) => a.ts - b.ts);
}

async function fetchBinanceCandles(symbol, interval, limit) {
  const url = BINANCE_DATA_BASE + '/fapi/v1/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=' + limit;
  const r = await fetchBinance(url), data = await r.json();
  if (!r.ok || !Array.isArray(data)) throw new Error(data.msg || 'Binance candle request failed');
  return normalizeBinance(data);
}
app.get('/healthz', (req, res) => {
  const observer = marketObservers.get('global');
  res.json({ ok: true, observer: Boolean(observer?.timer), observer_error: observer?.error || null, ordersEnabled: demoExecutionEnabled });
});
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.path.endsWith('.html') && !['/index.html', '/dashboard.html', '/exchange.html', '/history.html'].includes(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3700;
let server;
function shutdown() {
  for (const observer of marketObservers.values()) if (observer.timer) clearInterval(observer.timer);
  for (const runner of botRunners.values()) if (runner.timer) clearInterval(runner.timer);
  if (server) server.close(() => process.exit(0)); else process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
initDb().then(async () => {
  await runStartupRecovery();
  server = app.listen(PORT, () => console.log('JEV Trading Bot running on http://localhost:' + PORT));
}).catch(e => {
  console.error('DB init failed:', e);
  process.exit(1);
});






















