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
import { buildProtectionOrders, verifyEntryFill } from './v2/scripts/demo_protection.js';
import { reconcileDemoState } from './v2/scripts/demo_reconciliation.js';
import { monitorProtectionState } from './v2/scripts/demo_monitoring.js';
import { buildRecoveryPlan } from './v2/scripts/demo_recovery.js';
import { summarizeDemoDryRun } from './v2/scripts/demo_cycle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const fetchBinance = fetch;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
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
const PAPER_INTERVAL_MS = 60_000;
const EXECUTION_INTERVAL_MS = 5_000;
const PAPER_STALE_AFTER_MS = 15 * 60_000;
const PAPER_POLL_TIMEOUT_MS = 10_000;
const PAPER_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT'];
const DB_PATH = path.join(__dirname, 'jev.db');
const KEY_PATH = path.join(__dirname, '.jev-master-key');
const isProduction = process.env.NODE_ENV === 'production';
const isHttps = process.env.HTTPS === 'true';
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
  run('CREATE TABLE IF NOT EXISTS sessions (sid_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
  run('CREATE TABLE IF NOT EXISTS trade_amounts (user_id INTEGER PRIMARY KEY, amount_usdt REAL NOT NULL, updated_at TEXT NOT NULL)');
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
  botStates.set(sid, false);
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: isHttps, maxAge: 86400000, path: '/' };
  res.cookie('sid', sid, cookieOptions);
  res.cookie('csrf', csrfToken, { ...cookieOptions, httpOnly: false });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(req.cookies.sid);
  run('DELETE FROM sessions WHERE sid_hash = ?', [sessionHash(req.cookies.sid || '')]);
  botStates.delete(req.cookies.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

function parseTradeAmount(body) {
  const amountUsdt = Number(body?.amountUsdt);
  return Number.isFinite(amountUsdt) && amountUsdt > 0 ? amountUsdt : null;
}
app.get('/api/trade-amount', auth, (req, res) => {
  const row = get('SELECT amount_usdt, updated_at FROM trade_amounts WHERE user_id = ?', [req.userId]);
  res.json(row ? { ok: true, configured: true, amountUsdt: Number(row.amount_usdt), updatedAt: row.updated_at } : { ok: true, configured: false, warning: 'Trade amount is optional' });
});
app.put('/api/trade-amount', auth, (req, res) => {
  const amountUsdt = parseTradeAmount(req.body);
  if (!amountUsdt) return res.status(400).json({ ok: false, error: 'Enter a positive USDT amount' });
  run('INSERT OR REPLACE INTO trade_amounts VALUES (?,?,?)', [req.userId, amountUsdt, new Date().toISOString()]);
  res.json({ ok: true, configured: true, amountUsdt });
});app.get('/api/me', auth, (req, res) => {
  const u = get('SELECT id, username FROM users WHERE id = ?', [req.userId]);
  res.json(u || {});
});

async function readClosedCandleWatermark() {
  const now = Date.now();
  const signatures = {};
  for (const symbol of PAPER_SYMBOLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAPER_POLL_TIMEOUT_MS);
    try {
      const url = BINANCE_DATA_BASE + '/fapi/v1/klines?symbol=' + encodeURIComponent(symbol) + '&interval=5m&limit=2';
      const response = await fetchBinance(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error(data?.msg || 'Candle poll failed');
      const latest = data.filter(row => Number(row[6]) < now).at(-1);
      if (!latest) throw new Error('No closed 5m candle: ' + symbol);
      const age = now - Number(latest[6]);
      if (age < 0 || age > PAPER_STALE_AFTER_MS) throw new Error('Stale 5m candle: ' + symbol);
      signatures[symbol] = Number(latest[6]);
    } finally { clearTimeout(timeout); }
  }
  return signatures;
}
function startMarketObserver() {
  if (marketObservers.has('global')) return marketObservers.get('global');
  const observer = { timer: null, watermark: {}, error: null, last_polled_at: null };
  const poll = async () => { try { observer.watermark = await readClosedCandleWatermark(); observer.last_polled_at = Date.now(); observer.error = null; } catch (error) { observer.error = error?.name === 'AbortError' ? 'candle_poll_timeout' : (error?.message || 'candle_poll_failed'); } };
  observer.timer = setInterval(poll, PAPER_INTERVAL_MS);
  marketObservers.set('global', observer);
  poll();
  return observer;
}
function stopPaperRunner(sid, error = null) {
  const runner = botRunners.get(sid);
  if (!runner) return;
  if (runner.timer) clearInterval(runner.timer);
  runner.timer = null;
  runner.running = false;
  if (error) runner.error = error;
  botRunners.delete(sid);
}
async function runPaperCycle(sid) {
  const runner = botRunners.get(sid);
  if (!runner || runner.running) return;
  runner.running = true;
  runner.last_started_at = Date.now();
  try {
    await new Promise((resolve, reject) => execFile(process.env.PYTHON || 'python', [path.join(__dirname, 'v2', 'scripts', 'binance_demo_paper_pipeline.py')], { cwd: __dirname, timeout: 90_000, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 1_000_000 }, error => error ? reject(error) : resolve()));
    runner.error = null;
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8'));
    demoCycleSummaries.set(sid, { ...summarizeDemoDryRun(artifact), observedAt: new Date().toISOString() });
    runner.cycles += 1;
  } catch (error) {
    runner.error = error?.message || 'paper_cycle_failed';
    runner.last_error_at = Date.now();
  } finally { runner.running = false; runner.last_finished_at = Date.now(); }
}
function startPaperRunner(sid) {
  const existing = botRunners.get(sid);
  if (existing?.timer) return existing;
  const runner = existing || { timer: null, running: false, cycles: 0, error: null, last_started_at: null, last_finished_at: null };
  runner.error = null;
  runner.timer = setInterval(() => runPaperCycle(sid), PAPER_INTERVAL_MS);
  botRunners.set(sid, runner);
  runPaperCycle(sid);
  return runner;
}app.get('/api/bot/status', auth, (req, res) => {
  const runner = botRunners.get('global');
  const observer = marketObservers.get('global');
  res.json({ ok: true, enabled: botStates.get(req.cookies.sid) === true, observing: Boolean(observer?.timer), running: Boolean(runner?.running), cycles: runner?.cycles || 0, error: runner?.error || null, observer_error: observer?.error || null, last_started_at: runner?.last_started_at || null, last_finished_at: runner?.last_finished_at || null, last_polled_at: observer?.last_polled_at || null, watermark: observer?.watermark || {}, mode: 'paper_observation', demoCycle: demoCycleSummaries.get('global') || null, demoExecution: demoExecutionSummaries.get(req.cookies.sid) || null, ordersEnabled: process.env.DEMO_EXECUTION_ENABLED === 'true' });
});

app.post('/api/bot/toggle', auth, (req, res) => {
  const enabled = req.body?.enabled === true;
  if (enabled && !get('SELECT id FROM api_keys WHERE user_id = ? AND exchange = ? AND status = ?', [req.userId, 'binanceTestnet', 'connected'])) return res.status(400).json({ ok:false, error:'Connected Binance Demo account required before BOT ON' });
  botStates.set(req.cookies.sid, enabled);
  if (enabled) startExecutionRunner(req.cookies.sid); else stopExecutionRunner(req.cookies.sid);
  const runner = botRunners.get('global');
  const observer = marketObservers.get('global');
  res.json({ ok: true, enabled, observing: Boolean(observer?.timer), running: Boolean(runner?.running), cycles: runner?.cycles || 0, mode: 'paper_observation', demoCycle: demoCycleSummaries.get('global') || null, demoExecution: demoExecutionSummaries.get(req.cookies.sid) || null, ordersEnabled: process.env.DEMO_EXECUTION_ENABLED === 'true' });
});
app.get('/api/binance-demo/live-readiness', auth, async (req, res) => {
  const blockers = [];
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  const tradeAmount = get('SELECT amount_usdt FROM trade_amounts WHERE user_id = ?', [req.userId]);
  if (!keyRow) blockers.push('CONNECTED_DEMO_KEY_REQUIRED');
  if (process.env.DEMO_EXECUTION_ENABLED !== 'true') blockers.push('DEMO_EXECUTION_FLAG_DISABLED');
  if (blockers.length) return res.json({ ok: true, ready: false, demoOnly: true, blockers, ordersSent: false, withdrawalsSent: false });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    const signed = async (apiPath, params = {}) => {
      const query = new URLSearchParams({ ...params, recvWindow: '5000', timestamp: String(Date.now()) });
      const queryString = query.toString();
      const response = await fetchBinance(EXCHANGES.binanceTestnet.base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secret, queryString), { headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(10000) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.msg || 'Binance Demo readiness failed'); return data;
    };
    const [exchangeInfo, account, positions, income] = await Promise.all([fetchBinance(EXCHANGES.binanceTestnet.base + '/fapi/v1/exchangeInfo').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.msg || 'exchangeInfo failed'); return d; }), signed('/fapi/v2/account'), signed('/fapi/v2/positionRisk'), signed('/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })]);
    const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => PAPER_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
    const balances = (account.assets || []).filter(x => x.asset === 'USDT').map(x => ({ asset: x.asset, availableBalance: Number(x.availableBalance) }));
    const executionPolicy = { tradeAmountUsdt: Number(tradeAmount?.amount_usdt) };
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8'));
    const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
        const candidates = (artifact.execution_candidates || []).map(candidate => { const sizing = sizeCandidate(candidate, executionPolicy, balances[0] || {}, filters[candidate.symbol]); return { candidate, sizing, precision: validateCandidatePrecision(candidate, sizing, filters[candidate.symbol]) }; });
    if (!candidates.some(x => x.sizing.status === 'SIZED' && x.precision === 'VALID')) blockers.push('NO_VALID_SERVER_SIZED_CANDIDATE');
    blockers.push('PROTECTIVE_ORDER_VERIFICATION_REQUIRED');
    blockers.push('POSITION_MONITORING_REQUIRED');
    res.json({ ok: true, ready: blockers.length === 0, demoOnly: true, blockers, candidateCount: candidates.length, validCandidateCount: candidates.filter(x => x.sizing.status === 'SIZED' && x.precision === 'VALID').length, ordersSent: false, withdrawalsSent: false });
  } catch (error) { res.status(502).json({ ok: false, ready: false, demoOnly: true, blockers: ['BINANCE_DEMO_READINESS_FAILED'], error: error.message, ordersSent: false, withdrawalsSent: false }); }
});app.get('/api/binance-demo/execution-preflight', auth, async (req, res) => {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  const tradeAmount = get('SELECT amount_usdt FROM trade_amounts WHERE user_id = ?', [req.userId]);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Connected Binance Demo key required' });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    const signed = async (apiPath, params = {}) => {
      const query = new URLSearchParams({ ...params, recvWindow: '5000', timestamp: String(Date.now()) });
      const queryString = query.toString();
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
      let r; try { r = await fetchBinance(EXCHANGES.binanceTestnet.base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secret, queryString), { headers: { 'X-MBX-APIKEY': apiKey }, signal: controller.signal }); } finally { clearTimeout(timeout); }
      const data = await r.json(); if (!r.ok) throw new Error(data?.msg || 'Binance Demo request failed'); return data;
    };
    const [exchangeInfo, account, positions, income] = await Promise.all([fetchBinance(EXCHANGES.binanceTestnet.base + '/fapi/v1/exchangeInfo').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.msg || 'exchangeInfo failed'); return d; }), signed('/fapi/v2/account'), signed('/fapi/v2/positionRisk'), signed('/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })]);
    const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => PAPER_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { status: x.status, quantityPrecision: x.quantityPrecision, pricePrecision: x.pricePrecision, filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
    const balances = (account.assets || []).filter(x => ['USDT', 'USDC'].includes(x.asset)).map(x => ({ asset: x.asset, walletBalance: Number(x.walletBalance), availableBalance: Number(x.availableBalance), unrealizedProfit: Number(x.unrealizedProfit) }));
    const openPositions = positions.filter(x => Number(x.positionAmt) !== 0).map(x => ({ symbol: x.symbol, positionAmt: Number(x.positionAmt), entryPrice: Number(x.entryPrice), unrealizedProfit: Number(x.unRealizedProfit), isolated: x.marginType === 'isolated' }));
    const executionPolicy = { tradeAmountUsdt: Number(tradeAmount?.amount_usdt) };
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8'));
    const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
        const candidates = (artifact.execution_candidates || []).map(candidate => { const normalized = normalizeCandidatePrices(candidate, filters[candidate.symbol]); const sizing = sizeCandidate(normalized, executionPolicy, balances.find(x => x.asset === 'USDT') || {}, filters[candidate.symbol]); return { ...candidate, normalized, sizing, precisionValidation: validateCandidatePrecision(normalized, sizing, filters[candidate.symbol]) }; });
    res.json({ ok: true, demoOnly: true, tradeAmountUsdt: executionPolicy.tradeAmountUsdt, balances, openPositions, dailyPnl: Number(dailyPnl), filters, candidates, ordersSent: false, withdrawalsSent: false });
  } catch { res.status(502).json({ ok: false, demoOnly: true, error: 'Demo execution preflight failed' }); }
});
app.get('/api/binance-demo/reconciliation', auth, async (req, res) => {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [req.userId]);
  if (!keyRow) return res.status(400).json({ ok: false, error: 'Connected Binance Demo key required' });
  try {
    const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
    const signed = async (apiPath, params = {}) => {
      const query = new URLSearchParams({ ...params, recvWindow: '5000', timestamp: String(Date.now()) });
      const queryString = query.toString();
      const response = await fetchBinance(EXCHANGES.binanceTestnet.base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secret, queryString), { headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.msg || 'Binance Demo reconciliation failed');
      return data;
    };
    const [positions, ordersBySymbol] = await Promise.all([signed('/fapi/v2/positionRisk'), Promise.all(PAPER_SYMBOLS.map(symbol => signed('/fapi/v1/openOrders', { symbol }))) ]);
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8'));
    const reconciliation = reconcileDemoState(artifact.execution_candidates || [], ordersBySymbol.flat(), positions);
    const monitoring = monitorProtectionState(artifact.execution_candidates || [], ordersBySymbol.flat(), positions);
    res.json({ ok: true, demoOnly: true, observedAt: new Date().toISOString(), ordersSent: false, withdrawalsSent: false, monitoring, ...reconciliation });
  } catch (error) { res.status(502).json({ ok: false, demoOnly: true, error: error.message || 'Demo reconciliation failed' }); }
});app.post('/api/binance-demo/recovery-plan', auth, (req, res) => {
  const plan = buildRecoveryPlan(req.body?.candidate, req.body?.sizing, req.body?.precisionValidation, req.body?.monitoring);
  res.status(plan.status === 'PLAN_ONLY' || plan.status === 'NO_ACTION' ? 200 : 409).json({ ok: plan.status === 'PLAN_ONLY' || plan.status === 'NO_ACTION', demoOnly: true, plan, ordersSent: false, withdrawalsSent: false });
});app.post('/api/binance-demo/protection-plan', auth, (req, res) => {
  const fill = verifyEntryFill(req.body?.exchangeOrder);
  const plan = fill.filled ? buildProtectionOrders(req.body?.candidate, req.body?.sizing, req.body?.precisionValidation) : { status: 'WAITING_ENTRY_FILL', orders: [] };
  res.status(plan.status === 'READY_AFTER_ENTRY_FILL' ? 200 : 409).json({ ok: plan.status === 'READY_AFTER_ENTRY_FILL', demoOnly: true, fill, plan, ordersSent: false, withdrawalsSent: false });
});
async function loadServerExecutionCandidate(userId, candidateId) {
  const keyRow = get("SELECT * FROM api_keys WHERE id = (SELECT id FROM api_keys WHERE user_id = ? AND exchange = 'binanceTestnet' AND status = 'connected' ORDER BY id DESC LIMIT 1)", [userId]);
  const tradeAmountRow = get('SELECT amount_usdt FROM trade_amounts WHERE user_id = ?', [userId]);
  if (!keyRow) return { error: 'Connected Binance Demo key required' };
  const apiKey = decryptSecret(keyRow.api_key), secret = decryptSecret(keyRow.secret_key);
  const signed = async (apiPath, params = {}) => {
    const query = new URLSearchParams({ ...params, recvWindow: '5000', timestamp: String(Date.now()) });
    const queryString = query.toString();
    const response = await fetchBinance(EXCHANGES.binanceTestnet.base + apiPath + '?' + queryString + '&signature=' + binanceSignature(secret, queryString), { headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.msg || 'Binance Demo execution preflight failed');
    return data;
  };
  const [exchangeInfo, account, positions, income] = await Promise.all([
    fetchBinance(EXCHANGES.binanceTestnet.base + '/fapi/v1/exchangeInfo', { signal: AbortSignal.timeout(10000) }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data?.msg || 'exchangeInfo failed'); return data; }),
    signed('/fapi/v2/account'), signed('/fapi/v2/positionRisk'),
    signed('/fapi/v1/income', { incomeType: 'REALIZED_PNL', startTime: String(Date.now() - 24 * 60 * 60 * 1000), limit: '1000' })
  ]);
  const filters = Object.fromEntries(exchangeInfo.symbols.filter(x => PAPER_SYMBOLS.includes(x.symbol)).map(x => [x.symbol, { filters: x.filters.filter(f => ['LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType)) }]));
  const balance = (account.assets || []).find(x => x.asset === 'USDT');
  const settings = { tradeAmountUsdt: Number(tradeAmountRow?.amount_usdt) };
  const dailyPnl = Array.isArray(income) ? income.reduce((total, row) => total + Number(row.income || 0), 0) : 0;
    const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8'));
  const candidate = (artifact.execution_candidates || []).find(x => x.client_order_id === candidateId);
  if (!candidate) return { error: 'Execution candidate not found' };

  const normalized = normalizeCandidatePrices(candidate, filters[candidate.symbol]);
  const sizing = sizeCandidate(normalized, settings, balance || {}, filters[candidate.symbol]);
  const precision = validateCandidatePrecision(normalized, sizing, filters[candidate.symbol]);
  return { apiKey, secret, signed, candidate: normalized, sizing, precision, positions, settings };
}
async function executeDemoCandidate(req, res) {
  try {
    const candidateId = String(req.body?.clientOrderId || '');
    const context = await loadServerExecutionCandidate(req.userId, candidateId);
    if (context.error) return res.status(context.error === 'Execution candidate not found' ? 404 : 400).json({ ok: false, demoOnly: true, error: context.error, ordersSent: false, withdrawalsSent: false });
    const { candidate, sizing, precision, signed } = context;
    const order = buildDemoEntryOrder(candidate, sizing, precision);
    if (sizing.status !== 'SIZED') return res.status(409).json({ ok: false, demoOnly: true, reason: sizing.status, order, ordersSent: false, withdrawalsSent: false });
    const enabled = process.env.DEMO_EXECUTION_ENABLED === 'true';
    const permission = demoExecutionGate({ botEnabled: botStates.get(req.cookies.sid) === true, ordersEnabled: enabled, protectiveOrdersReady: true, riskStatus: 'ALLOWED', demoExecutionEnabled: enabled });
    if (!permission.allowed) return res.status(409).json({ ok: false, demoOnly: true, ...permission, order, ordersSent: false, withdrawalsSent: false });
    let existing = null;
    try { existing = await signed('GET', '/fapi/v1/order', { symbol: candidate.symbol, origClientOrderId: candidate.client_order_id }); } catch {}
    if (existing?.status === 'FILLED') return res.json({ ok: true, demoOnly: true, idempotent: true, status: 'ENTRY_ALREADY_FILLED', entry: existing, ordersSent: true, withdrawalsSent: false });
    if (existing && ['NEW', 'PARTIALLY_FILLED'].includes(existing.status)) return res.status(409).json({ ok: false, demoOnly: true, status: 'ENTRY_ALREADY_OPEN', entry: existing, ordersSent: true, withdrawalsSent: false });
    const entry = await signed('POST', '/fapi/v1/order', { symbol: candidate.symbol, side: candidate.side, type: 'LIMIT', timeInForce: 'GTC', quantity: sizing.quantity, price: sizing.price, newClientOrderId: candidate.client_order_id });
    let current = entry;
    for (let i = 0; i < 5 && !['FILLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(current.status); i++) { await new Promise(resolve => setTimeout(resolve, 1000)); current = await signed('GET', '/fapi/v1/order', { symbol: candidate.symbol, orderId: String(entry.orderId) }); }
    if (current.status !== 'FILLED') {
      const canceled = await signed('DELETE', '/fapi/v1/order', { symbol: candidate.symbol, orderId: String(entry.orderId) });
      return res.status(409).json({ ok: false, demoOnly: true, status: 'ENTRY_NOT_FILLED_CANCELED', entry: canceled, ordersSent: true, withdrawalsSent: false });
    }
    const protectionOrders = buildProtectionOrders(candidate, sizing, precision).orders;
    const protection = [];
    try {
      for (const protective of protectionOrders) protection.push(await signed('POST', '/fapi/v1/order', { symbol: protective.symbol, side: protective.side, type: protective.type, stopPrice: protective.stopPrice, closePosition: protective.closePosition, workingType: protective.workingType, newClientOrderId: protective.clientOrderId }));
    } catch (error) {
      await Promise.all(protection.map(order => signed('DELETE', '/fapi/v1/order', { symbol: candidate.symbol, orderId: String(order.orderId) }).catch(() => null)));
      return res.status(502).json({ ok: false, demoOnly: true, status: 'PROTECTION_FAILED', entry: current, error: error.message, ordersSent: true, withdrawalsSent: false });
    }
    const openOrders = await signed('GET', '/fapi/v1/openOrders', { symbol: candidate.symbol });
    const protectedIds = new Set(openOrders.map(order => order.clientOrderId));
    const protectionVerified = protectionOrders.every(order => protectedIds.has(order.clientOrderId));
    if (!protectionVerified) return res.status(502).json({ ok: false, demoOnly: true, status: 'PROTECTION_VERIFICATION_FAILED', entry: current, protection, ordersSent: true, withdrawalsSent: false });
    res.json({ ok: true, demoOnly: true, status: 'FILLED_PROTECTED', entry: current, protection, protectionVerified: true, ordersSent: true, withdrawalsSent: false });
  } catch (error) { res.status(502).json({ ok: false, demoOnly: true, error: error.message || 'Binance Demo execution failed', ordersSent: false, withdrawalsSent: false }); }
}
app.post('/api/binance-demo/execute-candidate', auth, executeDemoCandidate);

async function runExecutionCycle(sid) {
  if (botStates.get(sid) !== true) return;
  let artifact;
  try { artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json'), 'utf8')); } catch (error) {
    demoExecutionSummaries.set(sid, { status: 'ARTIFACT_UNAVAILABLE', error: error.message, updatedAt: new Date().toISOString() });
    return;
  }
  for (const candidate of (artifact.execution_candidates || [])) {
    if (botStates.get(sid) !== true) return;
    const key = sid + ":" + candidate.client_order_id;
    if (!candidate.client_order_id || executionAttempts.has(key)) continue;
    executionAttempts.set(key, true);
    let payload;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { payload = body; return this; } };
    await executeDemoCandidate({ userId: sessions.get(sid), cookies: { sid }, body: { clientOrderId: candidate.client_order_id } }, response);
    demoExecutionSummaries.set(sid, { ...(payload || { ok: false, error: 'empty_executor_response' }), clientOrderId: candidate.client_order_id, updatedAt: new Date().toISOString() });
    if (!payload?.ordersSent && payload?.status !== 'ENTRY_NOT_FILLED_CANCELED') executionAttempts.delete(key);
  }
}

function startExecutionRunner(sid) {
  const key = "execution:" + sid;
  if (botRunners.get(key)?.timer) return botRunners.get(key);
  const runner = { timer: null, running: false };
  const tick = async () => {
    if (runner.running || botStates.get(sid) !== true) return;
    runner.running = true;
    try { await runExecutionCycle(sid); } finally { runner.running = false; }
  };
  runner.timer = setInterval(tick, EXECUTION_INTERVAL_MS);
  botRunners.set(key, runner);
  tick();
  return runner;
}

function stopExecutionRunner(sid) {
  const key = "execution:" + sid;
  const runner = botRunners.get(key);
  if (runner?.timer) clearInterval(runner.timer);
  botRunners.delete(key);
}app.get('/api/v2/status', auth, (req, res) => {
  const artifactPath = path.join(__dirname, 'v2', 'artifacts', 'BINANCE_DEMO_PAPER_PIPELINE.json');
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    res.json({ ok: true, workflow: '1H Bias → 15M MarketStructureBot → 5M ConfirmationBot → SelectionBot → SetupBot', activeSetups: ['fvg_context', 'ob_context'], artifact });
  } catch {
    res.status(503).json({ ok: false, error: 'V2 paper artifact unavailable' });
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
startMarketObserver();
startPaperRunner('global');

app.get('/api/chart/candles', auth, async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = String(req.query.interval || '5m');
  const limit = Math.min(200, Math.max(30, Number(req.query.limit) || 120));
  if (!PAPER_SYMBOLS.includes(symbol) || !['1h', '15m', '5m'].includes(interval)) return res.status(400).json({ error: 'Unsupported chart request' });
  try {
    const candles = await fetchBinanceCandles(symbol, interval, limit);
    res.json({ ok: true, symbol, interval, candles });
  } catch (error) {
    res.status(502).json({ ok: false, symbol, error: error.message });
  }
});
app.get('/api/chart/tickers', auth, async (req, res) => {
  try {
    const query = encodeURIComponent(JSON.stringify(PAPER_SYMBOLS));
    const response = await fetchBinance(BINANCE_DATA_BASE + '/fapi/v1/ticker/price?symbols=' + query);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error(data?.msg || 'Ticker request failed');
    res.json({ ok: true, prices: Object.fromEntries(data.map(row => [row.symbol, Number(row.price)])), updated_at: Date.now() });
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
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
    res.status(401).json({ ok: false, exchange, status: 'rejected', error: e.message });
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

app.delete('/api/keys/:id', auth, (req, res) => {
  run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [Number(req.params.id), req.userId]);
  res.json({ ok: true });
});

app.post('/api/binance-demo/order-test', auth, async (req, res) => {
  const { keyId, symbol, side, type = 'LIMIT', quantity, price, timeInForce = 'GTC' } = req.body || {};
  const allowedSymbols = new Set(PAPER_SYMBOLS);
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
app.post('/api/binance-demo/order', auth, async (req, res) => {
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

app.post('/api/binance-demo/cancel', auth, async (req, res) => {
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

app.get('/api/history', auth, (req, res) => {
  const date = req.query.date;
  let sql = 'SELECT * FROM trade_history WHERE user_id = ?';
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
  res.json({ ok: true, observer: Boolean(observer?.timer), observer_error: observer?.error || null, ordersEnabled: false });
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
initDb().then(() => {
  server = app.listen(PORT, () => console.log('JEV Trading Bot running on http://localhost:' + PORT));
}).catch(e => {
  console.error('DB init failed:', e);
  process.exit(1);
});






















