import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { execFile } from 'node:child_process';

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
const PAPER_INTERVAL_MS = 60_000;
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
  if (!sid || !sessions.has(sid)) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = sessions.get(sid);
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
  sessions.set(sid, row.id);
  botStates.set(sid, false);
  startPaperRunner(sid);
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: isHttps, maxAge: 86400000, path: '/' };
  res.cookie('sid', sid, cookieOptions);
  res.cookie('csrf', csrfToken, { ...cookieOptions, httpOnly: false });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(req.cookies.sid);
  botStates.delete(req.cookies.sid);
  const runner = botRunners.get(req.cookies.sid);
  if (runner) { clearInterval(runner.timer); botRunners.delete(req.cookies.sid); }
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
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
function stopPaperRunner(sid, error = null) {
  const runner = botRunners.get(sid);
  if (!runner) return;
  runner.running = false;
  if (error) runner.error = error;
  botStates.set(sid, false);
}
async function runPaperCycle(sid) {
  const runner = botRunners.get(sid);
  if (!runner || runner.running) return;
  runner.running = true;
  runner.last_started_at = Date.now();
  try {
    const signatures = await readClosedCandleWatermark();
    const changed = PAPER_SYMBOLS.some(symbol => runner.watermark[symbol] !== signatures[symbol]);
    runner.last_polled_at = Date.now();
    runner.watermark = signatures;
    if (!changed) return;
    await new Promise((resolve, reject) => execFile(process.env.PYTHON || 'python', [path.join(__dirname, 'v2', 'scripts', 'binance_demo_paper_pipeline.py')], { cwd: __dirname, timeout: 90_000, windowsHide: true, maxBuffer: 1_000_000 }, error => error ? reject(error) : resolve()));
    runner.error = null;
    runner.cycles += 1;
  } catch (error) {
    stopPaperRunner(sid, error?.name === 'AbortError' ? 'candle_poll_timeout' : (error?.message || 'paper_cycle_failed'));
  } finally {
    runner.running = false;
    runner.last_finished_at = Date.now();
  }
}
function startPaperRunner(sid) {
  const existing = botRunners.get(sid);
  if (existing?.timer) return existing;
  const runner = existing || { timer: null, running: false, cycles: 0, error: null, watermark: {}, last_started_at: null, last_finished_at: null, last_polled_at: null };
  runner.error = null;
  runner.timer = setInterval(() => runPaperCycle(sid), PAPER_INTERVAL_MS);
  botRunners.set(sid, runner);
  runPaperCycle(sid);
  return runner;
}
app.get('/api/bot/status', auth, (req, res) => {
  const runner = botRunners.get(req.cookies.sid);
  res.json({ ok: true, enabled: botStates.get(req.cookies.sid) === true, running: Boolean(runner?.running), cycles: runner?.cycles || 0, error: runner?.error || null, last_started_at: runner?.last_started_at || null, last_finished_at: runner?.last_finished_at || null, last_polled_at: runner?.last_polled_at || null, watermark: runner?.watermark || {}, mode: 'paper_observation', ordersEnabled: false });
});

app.post('/api/bot/toggle', auth, (req, res) => {
  const enabled = req.body?.enabled === true;
  botStates.set(req.cookies.sid, enabled);
  startPaperRunner(req.cookies.sid);
  const runner = botRunners.get(req.cookies.sid);
  res.json({ ok: true, enabled, running: Boolean(runner?.running), cycles: runner?.cycles || 0, mode: 'paper_observation', ordersEnabled: false });
});
app.get('/api/v2/status', auth, (req, res) => {
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

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) continue;
    if (prev === null) prev = values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period;
    else prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function runBacktest(candles, cfg) {
  const closes = candles.map(c => c.close);
  const fast = ema(closes, cfg.fast);
  const slow = ema(closes, cfg.slow);
  const feeRate = cfg.feeBps / 10000;
  const slipRate = cfg.slippageBps / 10000;
  let balance = cfg.initialBalance;
  let position = null;
  let wins = 0, losses = 0, grossProfit = 0, grossLoss = 0;
  let peak = balance, maxDrawdown = 0;
  const trades = [], equity = [];

  function closePosition(exitPrice, exitTs, reason) {
    const side = position.side;
    const gross = side === 'LONG' ? (exitPrice - position.entry) * position.qty : (position.entry - exitPrice) * position.qty;
    const fees = (position.entry * position.qty + exitPrice * position.qty) * feeRate;
    const slippage = (position.entry * position.qty + exitPrice * position.qty) * slipRate;
    const net = gross - fees - slippage;
    balance += net;
    if (net > 0) { wins++; grossProfit += net; } else { losses++; grossLoss += Math.abs(net); }
    trades.push({ side, entryTime: position.entryTs, exitTime: exitTs, entry: position.entry, exit: exitPrice, qty: position.qty, gross, fees, slippage, net, reason });
    position = null;
  }

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (position) {
      const reverseLong = position.side === 'LONG' && fast[i - 1] !== null && slow[i - 1] !== null && fast[i - 1] < slow[i - 1] && fast[i] >= slow[i];
      const reverseShort = position.side === 'SHORT' && fast[i - 1] !== null && slow[i - 1] !== null && fast[i - 1] > slow[i - 1] && fast[i] <= slow[i];
      if (reverseLong || reverseShort) closePosition(c.open, c.ts, 'crossover');
    }
    if (!position && fast[i - 1] !== null && slow[i - 1] !== null && fast[i] !== null && slow[i] !== null) {
      const longSignal = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
      const shortSignal = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      if (longSignal || shortSignal) {
        const entry = c.close * (longSignal ? 1 + slipRate : 1 - slipRate);
        position = { side: longSignal ? 'LONG' : 'SHORT', entry, entryTs: c.ts, qty: cfg.positionSize / entry };
      }
    }
    const mark = position ? balance + (position.side === 'LONG' ? (c.close - position.entry) : (position.entry - c.close)) * position.qty : balance;
    peak = Math.max(peak, mark);
    maxDrawdown = Math.max(maxDrawdown, peak ? (peak - mark) / peak * 100 : 0);
    equity.push({ ts: c.ts, value: mark });
  }
  if (position) closePosition(candles[candles.length - 1].close, candles[candles.length - 1].ts, 'end');
  const netPnl = balance - cfg.initialBalance;
  return { summary: { initialBalance: cfg.initialBalance, finalBalance: balance, netPnl, netPnlPct: netPnl / cfg.initialBalance * 100, trades: trades.length, wins, losses, winRate: trades.length ? wins / trades.length * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0), maxDrawdown }, trades, equity };
}

function normalizeOkx(rows) {
  return rows.map(r => ({ ts: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) })).sort((a, b) => a.ts - b.ts);
}
function normalizeBinance(rows) {
  return rows.map(r => ({ ts: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) })).sort((a, b) => a.ts - b.ts);
}

app.post('/api/backtest/run', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many backtests' });
  const { exchange = 'okx', symbol = 'BTC-USDT-SWAP', timeframe = '15m', limit = 1000, initialBalance = 1000, feeBps = 5, slippageBps = 2, fast = 9, slow = 21, positionSize = 1000 } = req.body;
  const nLimit = Math.min(5000, Math.max(100, Number(limit)));
  const f = Math.max(2, Math.min(100, Number(fast))), s = Math.max(f + 1, Math.min(300, Number(slow)));
  if (!['okx', 'binance'].includes(exchange)) return res.status(400).json({ error: 'Unsupported exchange' });
  try {
    let candles, source;
    if (exchange === 'okx') {
      const url = 'https://www.okx.ac/api/v5/market/candles?instId=' + encodeURIComponent(symbol) + '&bar=' + encodeURIComponent(timeframe) + '&limit=' + nLimit;
      const r = await fetch(url); const d = await r.json();
      if (!r.ok || d.code !== '0') throw new Error(d.msg || 'OKX candle request failed');
      candles = normalizeOkx(d.data); source = url;
    } else {
      const url = BINANCE_DATA_BASE + '/fapi/v1/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + encodeURIComponent(timeframe) + '&limit=' + nLimit;
      const r = await fetchBinance(url); const d = await r.json();
      if (!r.ok || !Array.isArray(d)) throw new Error(d.msg || 'Binance candle request failed');
      candles = normalizeBinance(d); source = url;
    }
    if (candles.length < s + 5) return res.status(422).json({ error: 'Not enough candles', received: candles.length });
    const result = runBacktest(candles, { initialBalance: Number(initialBalance), feeBps: Number(feeBps), slippageBps: Number(slippageBps), fast: f, slow: s, positionSize: Number(positionSize) });
    res.json({ ok: true, engine: 'EMA crossover baseline v1', exchange, symbol, timeframe, candles: candles.length, source, config: { initialBalance: Number(initialBalance), feeBps: Number(feeBps), slippageBps: Number(slippageBps), fast: f, slow: s, positionSize: Number(positionSize) }, ...result });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

function sma(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function atr(candles, period = 14) {
  const tr = candles.map((c, i) => i ? Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)) : c.high - c.low);
  return sma(tr, period);
}

function highest(candles, end, lookback, field) {
  let value = -Infinity;
  for (let i = Math.max(0, end - lookback); i < end; i++) value = Math.max(value, candles[i][field]);
  return value;
}

function lowest(candles, end, lookback, field) {
  let value = Infinity;
  for (let i = Math.max(0, end - lookback); i < end; i++) value = Math.min(value, candles[i][field]);
  return value;
}

function nearestIndex(candles, ts) {
  let lo = 0, hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].ts <= ts) lo = mid + 1; else hi = mid - 1;
  }
  return Math.max(0, hi);
}

function completedIndex(candles, ts, intervalMs) {
  const i = nearestIndex(candles, ts);
  return i >= 0 && candles[i].ts + intervalMs <= ts ? i : i - 1;
}

function confirmedSwing(candles, k, side, left = 2, right = 2) {
  if (k < left || k + right >= candles.length) return false;
  const value = candles[k][side === 'high' ? 'high' : 'low'];
  for (let n = 1; n <= left; n++) if (side === 'high' ? value <= candles[k - n].high : value >= candles[k - n].low) return false;
  for (let n = 1; n <= right; n++) if (side === 'high' ? value <= candles[k + n].high : value >= candles[k + n].low) return false;
  return true;
}

function latestConfirmedSwing(candles, end, side, lookback = 40) {
  for (let k = end - 2; k >= Math.max(2, end - lookback); k--) if (confirmedSwing(candles, k, side)) return { index: k, price: candles[k][side === 'high' ? 'high' : 'low'] };
  return null;
}

function detectFvg(candles, k) {
  if (k < 2) return null;
  const a = candles[k - 2], c = candles[k];
  if (a.high < c.low) return { direction: 'bull', low: a.high, high: c.low, index: k };
  if (a.low > c.high) return { direction: 'bear', low: c.high, high: a.low, index: k };
  return null;
}

function latestConfirmedSwingBeyond(candles, end, side, price, lookback = 80) {
  for (let k = end - 2; k >= Math.max(2, end - lookback); k--) {
    if (confirmedSwing(candles, k, side)) {
      const level = candles[k][side === 'high' ? 'high' : 'low'];
      if (side === 'high' ? level > price : level < price) return { index: k, price: level };
    }
  }
  return null;
}

function detectOrderBlock(candles, k, direction, atrValue) {
  const impulse = candles[k];
  const body = Math.abs(impulse.close - impulse.open);
  if (!atrValue || body < atrValue * 0.3) return null;
  for (let n = k - 1; n >= Math.max(0, k - 3); n--) {
    const c = candles[n];
    if (direction === 'bull' && c.close < c.open) return { direction, low: c.low, high: c.high, index: n };
    if (direction === 'bear' && c.close > c.open) return { direction, low: c.low, high: c.high, index: n };
  }
  return null;
}

function regimeSignals(c5, c15, c1h, cfg) {
  const close5 = c5.map(x => x.close), e20 = ema(close5, 20), a5 = atr(c5, 14);
  const e1f = ema(c1h.map(x => x.close), 20), e1s = ema(c1h.map(x => x.close), 50);
  const e15 = ema(c15.map(x => x.close), 20), a15 = atr(c15, 14);
  const signals = [], lastSignalByStructure = new Set();
  for (let i = 60; i < c5.length - 1; i++) {
    const j = completedIndex(c15, c5[i].ts, 15 * 60 * 1000), h = completedIndex(c1h, c5[i].ts, 60 * 60 * 1000);
    if (j < 20 || h < 50 || !e20[i] || !a5[i] || !e1f[h] || !e1s[h] || !e15[j] || !a15[j]) continue;
    const bull = c1h[h].close > e1s[h] && e1f[h] > e1s[h];
    const bear = c1h[h].close < e1s[h] && e1f[h] < e1s[h];
    const swingHigh = cfg.mode === 'smc' ? latestConfirmedSwing(c15, j, 'high') : null, swingLow = cfg.mode === 'smc' ? latestConfirmedSwing(c15, j, 'low') : null;
    if (cfg.mode === 'smc' && (!swingHigh || !swingLow)) continue;
    const priorHigh = cfg.mode === 'smc' ? swingHigh.price : highest(c15, j, 10, 'high'), priorLow = cfg.mode === 'smc' ? swingLow.price : lowest(c15, j, 10, 'low');
    const bosUp = c15[j].close > priorHigh, bosDown = c15[j].close < priorLow;
    const sweepLong = c15[j].low < priorLow && c15[j].close > priorLow;
    const sweepShort = c15[j].high > priorHigh && c15[j].close < priorHigh;
    const fvg = cfg.mode === 'smc' ? detectFvg(c15, j) : null, obBull = cfg.mode === 'smc' ? detectOrderBlock(c15, j, 'bull', a15[j]) : null, obBear = cfg.mode === 'smc' ? detectOrderBlock(c15, j, 'bear', a15[j]) : null;
    const body15 = Math.abs(c15[j].close - c15[j].open), range15 = c15[j].high - c15[j].low;
    const displacement = body15 >= a15[j] * cfg.minDisplacementAtr && range15 > 0 && body15 / range15 >= cfg.minBodyPct;
    const lowerWick = Math.min(c15[j].open, c15[j].close) - c15[j].low;
    const upperWick = c15[j].high - Math.max(c15[j].open, c15[j].close);
    const sweepLongValid = sweepLong && lowerWick / Math.max(range15, 1e-12) >= cfg.minWickPct;
    const sweepShortValid = sweepShort && upperWick / Math.max(range15, 1e-12) >= cfg.minWickPct;
    const pullLong = c5[i].low <= e20[i] && c5[i].close > e20[i] && c5[i].close > c5[i - 1].close;
    const pullShort = c5[i].high >= e20[i] && c5[i].close < e20[i] && c5[i].close < c5[i - 1].close;
    const longSetup = bull && ((sweepLongValid && pullLong) || (bosUp && displacement && pullLong));
    const shortSetup = bear && ((sweepShortValid && pullShort) || (bosDown && displacement && pullShort));
    let side = null, reason = '', setupType = cfg.mode, event = null;
    if (cfg.mode === 'trend') {
      if (bull && pullLong && c15[j].close > e15[j]) { side = 'LONG'; reason = '1H trend + 5M pullback'; }
      if (bear && pullShort && c15[j].close < e15[j]) { side = 'SHORT'; reason = '1H trend + 5M pullback'; }
    } else if (cfg.mode === 'smc') {
      if (longSetup) { side = 'LONG'; reason = sweepLongValid ? 'SSL wick sweep + pullback' : 'BOS + displacement + pullback'; setupType = sweepLongValid ? 'sweep' : 'bos'; event = { swingHigh, swingLow, fvg: fvg && fvg.direction === 'bull' ? fvg : null, orderBlock: obBull, inducement: Boolean(sweepLongValid && bosUp), sweepExtreme: sweepLongValid ? c15[j].low : null, stopLevel: sweepLongValid ? c15[j].low : swingLow.price, targetLevel: latestConfirmedSwingBeyond(c15, j, 'high', c15[j].close)?.price || null }; }
      if (shortSetup) { side = 'SHORT'; reason = sweepShortValid ? 'BSL wick sweep + pullback' : 'BOS + displacement + pullback'; setupType = sweepShortValid ? 'sweep' : 'bos'; event = { swingHigh, swingLow, fvg: fvg && fvg.direction === 'bear' ? fvg : null, orderBlock: obBear, inducement: Boolean(sweepShortValid && bosDown), sweepExtreme: sweepShortValid ? c15[j].high : null, stopLevel: sweepShortValid ? c15[j].high : swingHigh.price, targetLevel: latestConfirmedSwingBeyond(c15, j, 'low', c15[j].close)?.price || null }; }
    } else if (cfg.mode === 'range') {
      const rangeHigh = highest(c5, i, 48, 'high'), rangeLow = lowest(c5, i, 48, 'low');
      const mid = (rangeHigh + rangeLow) / 2;
      if (c5[i].low <= rangeLow && c5[i].close > rangeLow && c5[i].close < mid) { side = 'LONG'; reason = 'range lower rejection'; }
      if (c5[i].high >= rangeHigh && c5[i].close < rangeHigh && c5[i].close > mid) { side = 'SHORT'; reason = 'range upper rejection'; }
    }
    if (side) {
      const structureKey = side + ':' + j;
      const poi = event && (event.fvg || event.orderBlock);
      if (cfg.mode === 'smc' && (!poi || !event.stopLevel || !event.targetLevel)) continue;
      if (cfg.mode !== 'smc' || !lastSignalByStructure.has(structureKey)) {
        const entryZone = poi ? { low: poi.low, high: poi.high } : null;
        const entryLevel = entryZone ? (entryZone.low + entryZone.high) / 2 : null;
        signals.push({ i, side, reason, type: setupType, event, poi, entryZone, entryLevel, atr: a5[i] });
        if (cfg.mode === 'smc') lastSignalByStructure.add(structureKey);
      }
    }
  }
  return signals;
}

function runMultiTfBacktest(c5, c15, c1h, cfg) {
  const signals = regimeSignals(c5, c15, c1h, cfg), fee = cfg.feeBps / 10000, slip = cfg.slippageBps / 10000;
  let balance = cfg.initialBalance, position = null, peak = balance, maxDrawdown = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  const riskFraction = cfg.riskPct / 100, maxNotional = cfg.maxNotionalPct / 100 * cfg.initialBalance;
  const trades = [], equity = [], byType = {};
  function close(exit, ts, reason) {
    const gross = position.side === 'LONG' ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty;
    const costs = (position.entry * position.qty + exit * position.qty) * (fee + slip);
    const net = gross - costs; balance = Math.max(0, balance + net);
    if (net > 0) { wins++; grossProfit += net; } else grossLoss += Math.abs(net);
    const trade = { side: position.side, type: position.type, entry: position.entry, exit, entryTime: position.ts, exitTime: ts, gross, fees: costs / 2, slippage: costs / 2, net, reason: reason || position.reason, stopLevel: position.sl, targetLevel: position.tp, entryModel: position.entryModel, stopModel: position.stopModel, targetModel: position.targetModel };
    trades.push(trade);
    const stats = byType[position.type] || (byType[position.type] = { trades: 0, wins: 0, netPnl: 0, grossProfit: 0, grossLoss: 0 });
    stats.trades++; stats.netPnl += net;
    if (net > 0) { stats.wins++; stats.grossProfit += net; } else stats.grossLoss += Math.abs(net);
    position = null;
  }
  const byIndex = new Map(signals.map(s => [s.i, s]));
  for (let i = 60; i < c5.length; i++) {
    const c = c5[i];
    if (position) {
      const stopHit = position.side === 'LONG' ? c.low <= position.sl : c.high >= position.sl;
      const targetHit = position.side === 'LONG' ? c.high >= position.tp : c.low <= position.tp;
      if (stopHit || targetHit) close(stopHit ? position.sl : position.tp, c.ts, stopHit && targetHit ? 'stop-first' : (stopHit ? 'stop' : 'target'));
    }
    if (!position && byIndex.has(i - 1)) {
      const s = byIndex.get(i - 1);
      const touched = s.entryZone && c.low <= s.entryZone.high && c.high >= s.entryZone.low;
      if (cfg.mode === 'smc' && !touched) continue;
      const entry = cfg.mode === 'smc' ? s.entryLevel * (s.side === 'LONG' ? 1 + slip : 1 - slip) : c.open * (s.side === 'LONG' ? 1 + slip : 1 - slip);
      const structural = cfg.mode === 'smc' ? s.event.stopLevel : (s.side === 'LONG' ? entry - s.atr * cfg.slAtr : entry + s.atr * cfg.slAtr);
      const buffer = cfg.mode === 'smc' ? s.atr * cfg.slBufferAtr : 0;
      const sl = cfg.mode === 'smc' ? (s.side === 'LONG' ? structural - buffer : structural + buffer) : structural;
      const target = cfg.mode === 'smc' ? s.event.targetLevel : null;
      const risk = Math.abs(entry - sl), reward = target ? (s.side === 'LONG' ? target - entry : entry - target) : risk * cfg.rr;
      const rr = risk > 0 ? reward / risk : 0;
      if (cfg.mode === 'smc' && (risk <= 0 || reward <= 0 || rr < cfg.minRR)) continue;
      const riskCash = Math.max(0, balance) * riskFraction, qtyByRisk = risk > 0 ? riskCash / risk : 0, qtyByCap = maxNotional / entry;
      const qty = Math.min(qtyByRisk, qtyByCap);
      if (qty > 0 && balance > 0) position = { side: s.side, type: s.type, entry, qty, sl, tp: cfg.mode === 'smc' ? target : entry + (s.side === 'LONG' ? risk * cfg.rr : -risk * cfg.rr), ts: c.ts, reason: s.reason, entryModel: s.event.entryModel, stopModel: s.event.stopModel, targetModel: s.event.targetModel, entryReason: s.reason + ' | POI retest', stopReason: cfg.mode === 'smc' ? (s.type === 'sweep' ? 'sweep_extreme_invalidated' : 'structural_swing_invalidated') : 'atr_stop', targetReason: cfg.mode === 'smc' ? 'confirmed_opposing_swing' : 'rr_target' };
    }
    const mark = position ? balance + (position.side === 'LONG' ? c.close - position.entry : position.entry - c.close) * position.qty : balance;
    peak = Math.max(peak, mark); maxDrawdown = Math.max(maxDrawdown, peak ? (peak - mark) / peak * 100 : 0); equity.push({ ts: c.ts, value: mark });
  }
  if (position) close(c5[c5.length - 1].close, c5[c5.length - 1].ts, 'end');
  const netPnl = balance - cfg.initialBalance;
  for (const stats of Object.values(byType)) { stats.losses = stats.trades - stats.wins; stats.winRate = stats.trades ? stats.wins / stats.trades * 100 : 0; stats.profitFactor = stats.grossLoss ? stats.grossProfit / stats.grossLoss : (stats.grossProfit ? Infinity : 0); }
  return { summary: { initialBalance: cfg.initialBalance, finalBalance: balance, netPnl, netPnlPct: netPnl / cfg.initialBalance * 100, trades: trades.length, wins, losses: trades.length - wins, winRate: trades.length ? wins / trades.length * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0), maxDrawdown }, byType, trades, equity };
}

async function fetchBinanceCandles(symbol, interval, limit) {
  const url = BINANCE_DATA_BASE + '/fapi/v1/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=' + limit;
  const r = await fetchBinance(url), data = await r.json();
  if (!r.ok || !Array.isArray(data)) throw new Error(data.msg || 'Binance candle request failed');
  return normalizeBinance(data);
}

function readLocalCandles(symbol, interval, limit) {
  const file = path.join(__dirname, 'data', symbol + '-' + interval + '.csv');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const rows = lines.slice(1).map(line => line.split(',')).filter(row => row.length >= 6);
  const candles = rows.map(row => ({ ts: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) })).filter(c => Number.isFinite(c.ts) && Number.isFinite(c.close));
  return candles.slice(-limit);
}

async function loadAblationCandles(symbol, interval, limit) {
  return readLocalCandles(symbol, interval, limit) || fetchBinanceCandles(symbol, interval, Math.min(1500, limit));
}

app.post('/api/backtest/ablation', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 5, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many ablation runs' });
  const { symbol = 'BTCUSDT', limit = 52596, initialBalance = 1000, riskPct = 0.5, maxNotionalPct = 100, feeBps = 4, slippageBps = 2, slAtr = 1.2, rr = 1.5, minDisplacementAtr = 0.3 } = req.body;
  const nLimit = Math.min(60000, Math.max(200, Number(limit)));
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({ error: 'Invalid Binance symbol' });
  try {
    const [c5, c15, c1h] = await Promise.all([loadAblationCandles(symbol, '5m', nLimit), loadAblationCandles(symbol, '15m', nLimit), loadAblationCandles(symbol, '1h', nLimit)]);
    const cfg = { initialBalance: Number(initialBalance), riskPct: Math.min(5, Math.max(0.05, Number(riskPct))), maxNotionalPct: Math.min(100, Math.max(1, Number(maxNotionalPct))), feeBps: Number(feeBps), slippageBps: Number(slippageBps), slAtr: Number(slAtr), rr: Number(rr), minDisplacementAtr: Number(minDisplacementAtr), minBodyPct: 0.45, minWickPct: 0.6, slBufferAtr: 0.1, minRR: 1.0, signalCooldownMs: 60 * 60 * 1000 };
    const modes = ['trend', 'smc', 'range'];
    const results = Object.fromEntries(modes.map(mode => [mode, runMultiTfBacktest(c5, c15, c1h, { ...cfg, mode })]));
    res.json({ ok: true, engine: 'JEV regime/SMC ablation v1', dataSource: readLocalCandles(symbol, '5m', 1) ? 'local-csv' : BINANCE_DATA_BASE, exchange: 'binance-futures', symbol, timeframes: ['1h', '15m', '5m'], candles: { '1h': c1h.length, '15m': c15.length, '5m': c5.length }, config: cfg, results });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

function setupRegistry() {
  return ['fvg_mitigation', 'ob_retest', 'ob_fvg', 'choch', 'sweep_mss', 'breaker', 'mitigation', 'rbs_sbr', 'turtle_soup'];
}

function buildSetupSignals(c5, c15, c1h, cfg, setupType) {
  const e1f = ema(c1h.map(x => x.close), 20), e1s = ema(c1h.map(x => x.close), 50);
  const a15 = atr(c15, 14), zones = [], signals = [], used = new Set(), structureCache = cfg._structureCache || new Map();
  for (let i = 60; i < c5.length - 1; i++) {
    const j = completedIndex(c15, c5[i].ts, 15 * 60 * 1000), h = completedIndex(c1h, c5[i].ts, 60 * 60 * 1000);
    if (j < 20 || h < 50 || !e1f[h] || !e1s[h] || !a15[j]) continue;
    const bull = c1h[h].close > e1s[h] && e1f[h] > e1s[h], bear = c1h[h].close < e1s[h] && e1f[h] < e1s[h];
    if (j >= 2 && a15[j] > 0) {
      const fvg = detectFvg(c15, j), body = Math.abs(c15[j].close - c15[j].open), displacement = body >= a15[j] * cfg.minDisplacementAtr;
      if (fvg && displacement) zones.push({ ...fvg, type: 'fvg', created: j, expires: j + 32, status: 'fresh', touches: 0, invalidated: false, source: j });
      const obBull = detectOrderBlock(c15, j, 'bull', a15[j]), obBear = detectOrderBlock(c15, j, 'bear', a15[j]);
      if (obBull && bull) zones.push({ ...obBull, type: 'ob', created: j, expires: j + 32, status: 'fresh', touches: 0, invalidated: false, source: j });
      if (obBear && bear) zones.push({ ...obBear, type: 'ob', created: j, expires: j + 32, status: 'fresh', touches: 0, invalidated: false, source: j });
    }
    for (const z of zones) {
      if (j <= z.created || j > z.expires || z.invalidated || z.status === 'mitigated' || z.status === 'expired') continue;
      const structureInvalid = z.direction === 'bull' ? c15[j].close < z.low : c15[j].close > z.high;
      if (structureInvalid) { z.status = 'invalidated'; z.invalidated = true; continue; }
      if (j >= z.expires) { z.status = 'expired'; continue; }
      const touch = c5[i].low <= z.high && c5[i].high >= z.low;
      if (!touch) continue;
      const key = setupType + ':' + z.type + ':' + z.created + ':' + (bull ? 'L' : 'S');
      if (used.has(key)) continue;
      const overlap = z.type === 'fvg' && zones.some(o => o !== z && o.type === 'ob' && o.direction === z.direction && o.created >= z.created - 3 && o.created <= z.created + 3 && o.low <= z.high && o.high >= z.low);
      const match = setupType === 'fvg_mitigation' && z.type === 'fvg' || setupType === 'ob_retest' && z.type === 'ob' || setupType === 'ob_fvg' && overlap;
      const rejectionLong = c5[i].close > c5[i].open && c5[i].close > c5[i - 1].close, rejectionShort = c5[i].close < c5[i].open && c5[i].close < c5[i - 1].close;
      const direction = z.direction === 'bull' ? 'LONG' : 'SHORT';
      const trigger = direction === 'LONG' ? rejectionLong : rejectionShort;
      const strongRejection = direction === 'LONG' ? rejectionLong && (c5[i].close - z.low) >= (z.high - z.low) * 0.35 : rejectionShort && (z.high - c5[i].close) >= (z.high - z.low) * 0.35;
      z.status = strongRejection ? 'mitigated' : 'touched'; z.touches = (z.touches || 0) + 1; z.mitigated = strongRejection;
      const structureKey = j + ':' + h;
      if (!structureCache.has(structureKey)) structureCache.set(structureKey, marketStructureBot(c15, c1h, c5[i].ts));
      const structure = structureCache.get(structureKey);
      const structureLong = structure.bias === 'BULLISH' || structure.structure?.chochBull === true;
      const structureShort = structure.bias === 'BEARISH' || structure.structure?.chochBear === true;
      const currentSweep = direction === 'LONG' ? Boolean(structure.liquidity?.sweepSSL) : Boolean(structure.liquidity?.sweepBSL);
      let recentSweep = currentSweep;
      if (setupType === 'sweep_mss' && !recentSweep) {
        for (let sk = Math.max(40, j - 8); sk < j; sk++) {
          const sweepTs = c15[sk].ts + 15 * 60 * 1000;
          const ss = marketStructureBot(c15, c1h, sweepTs);
          const swept = direction === 'LONG' ? Boolean(ss.liquidity?.sweepSSL) : Boolean(ss.liquidity?.sweepBSL);
          if (swept) { recentSweep = true; break; }
        }
      }
      const sweep = recentSweep;
      const aligned = (bull && direction === 'LONG') || (bear && direction === 'SHORT');
      const currentChoch = direction === 'LONG' ? structure.structure?.chochBull : structure.structure?.chochBear;
      const failedOb = z.type === 'ob' && ((direction === 'LONG' && c15[j].close > z.high) || (direction === 'SHORT' && c15[j].close < z.low));
      const breaker = setupType === 'breaker' && failedOb && sweep && trigger;
      const mitigation = setupType === 'mitigation' && failedOb && !sweep && trigger;
      const flip = setupType === 'rbs_sbr' && trigger && aligned && ((direction === 'LONG' && c15[j].close > z.high) || (direction === 'SHORT' && c15[j].close < z.low));
      const turtle = setupType === 'turtle_soup' && sweep && trigger;
      const allowed = setupType === 'choch' ? trigger && (direction === 'LONG' ? structure.structure?.chochBull : structure.structure?.chochBear) && structure.confidence >= 75 : setupType === 'sweep_mss' ? trigger && sweep && (currentChoch || (direction === 'LONG' ? structureLong : structureShort)) : setupType === 'breaker' ? breaker : setupType === 'mitigation' ? mitigation && aligned && z.touches === 1 : setupType === 'rbs_sbr' ? flip : setupType === 'turtle_soup' ? turtle : match && trigger && aligned && (direction === 'LONG' ? structureLong : structureShort);
      if (!allowed) continue;
      const swing = latestConfirmedSwingBeyond(c15, j, direction === 'LONG' ? 'high' : 'low', c5[i].close);
      if (!swing) continue;
      const zone = setupType === 'ob_fvg' ? (() => {
        const ob = zones.find(o => o.type === 'ob' && o.direction === z.direction && o.created >= z.created - 3 && o.created <= z.created + 3 && o.low <= z.high && o.high >= z.low);
        return ob ? { low: Math.max(z.low, ob.low), high: Math.min(z.high, ob.high) } : { low: z.low, high: z.high };
      })() : { low: z.low, high: z.high };
      const atr5 = atr(c5, 14)[i] || a15[j];
      const sweepExtreme = direction === 'LONG' ? Math.min(c15[j].low, zone.low) : Math.max(c15[j].high, zone.high);
      let entryModel = 'zone_midpoint', stopModel = 'zone_far_edge', targetModel = 'opposing_confirmed_swing';
      const atr15 = a15[j] || atr5;
      const structureStopBuffer = atr15 * 0.1;
      let entryLevel = (zone.low + zone.high) / 2, stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer;
      if (setupType === 'fvg_mitigation') { entryModel = 'fvg_consequent_encroachment'; entryLevel = (zone.low + zone.high) / 2; stopModel = 'fvg_far_edge'; }
      if (setupType === 'ob_retest') { entryModel = 'ob_body_midpoint'; entryLevel = (c15[z.source].open + c15[z.source].close) / 2; stopModel = 'ob_extreme'; stopLevel = direction === 'LONG' ? c15[z.source].low - structureStopBuffer : c15[z.source].high + structureStopBuffer; }
      if (setupType === 'ob_fvg') { entryModel = 'ob_fvg_overlap_ce'; entryLevel = (zone.low + zone.high) / 2; stopModel = 'combined_zone_far_edge'; stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer; }
      if (setupType === 'choch') { entryModel = 'post_choch_poi_retest'; stopModel = 'protected_swing_invalidation'; const protectedLevel = direction === 'LONG' ? (structure.protectedLow?.price || structure.swingLow?.price || zone.low) : (structure.protectedHigh?.price || structure.swingHigh?.price || zone.high); stopLevel = direction === 'LONG' ? protectedLevel - structureStopBuffer : protectedLevel + structureStopBuffer; if ((direction === 'LONG' && stopLevel >= entryLevel) || (direction === 'SHORT' && stopLevel <= entryLevel)) { stopModel = 'choch_zone_invalidation_fallback'; stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer; } targetModel = 'opposing_confirmed_swing'; }
      if (setupType === 'sweep_mss') { entryModel = 'post_sweep_poi_retest'; stopModel = 'sweep_extreme'; stopLevel = direction === 'LONG' ? sweepExtreme - structureStopBuffer : sweepExtreme + structureStopBuffer; }
      if (setupType === 'rbs_sbr') { entryModel = 'polarity_flip_retest'; entryLevel = direction === 'LONG' ? zone.high : zone.low; stopModel = 'flipped_level_invalidation'; stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer; targetModel = 'opposing_confirmed_swing'; }
      if (setupType === 'breaker') { entryModel = 'breaker_flip_retest'; stopModel = 'breaker_invalidation'; stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer; targetModel = 'opposing_confirmed_swing'; }
      if (setupType === 'mitigation') { entryModel = 'failed_ob_retest'; stopModel = 'failed_ob_invalidation'; stopLevel = direction === 'LONG' ? zone.low - structureStopBuffer : zone.high + structureStopBuffer; targetModel = 'opposing_confirmed_swing'; }
      if (setupType === 'turtle_soup') { entryModel = 'reclaim_close'; entryLevel = c5[i].close; stopModel = 'failed_breakout_extreme'; stopLevel = direction === 'LONG' ? c15[j].low - structureStopBuffer : c15[j].high + structureStopBuffer; targetModel = 'range_opposite_liquidity'; }
      const evidence = { bias: structure.bias, state: structure.state, confidence: structure.confidence, structure: structure.structure, liquidity: structure.liquidity, fvg: Boolean(structure.fvg), orderBlock: Boolean(structure.orderBlock), inducement: Boolean(structure.inducement), aligned, sweep, trigger, failedOb, poiType: z.type, poiStatus: z.status, touchCount: z.touches, poiAgeBars: j - z.created }; const entryReason = setupType + ': ' + (direction === 'LONG' ? 'bullish' : 'bearish') + ' ' + structure.state + '; ' + (failedOb ? 'failed-OB' : 'POI') + '; ' + (sweep ? 'liquidity-sweep' : 'no-sweep') + '; trigger-rejection; ' + (aligned ? 'HTF-aligned' : 'HTF-not-aligned'); used.add(key); signals.push({ i, side: direction, type: setupType, reason: entryReason, entryReason, evidence, event: { stopLevel, targetLevel: swing.price, entryModel, stopModel, targetModel, sweepExtreme }, entryZone: zone, entryLevel, atr: atr5, poi: { sourceIndex: z.source, createdIndex: z.created, expiresIndex: z.expires, ageBars: j - z.created, touchCount: z.touches, status: z.status, direction: z.direction, zoneType: z.type } });
    }
  }
  return signals;
}

function runSetupArm(c5, signals, cfg) {
  let balance = cfg.initialBalance, peak = balance, maxDrawdown = 0, wins = 0, grossProfit = 0, grossLoss = 0, position = null;
  const trades = [];
  const byIndex = new Map(signals.map(s => [s.i, s]));
  function close(exit, ts, reason) { const gross = position.side === 'LONG' ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty; const costs = (position.entry * position.qty + exit * position.qty) * ((cfg.feeBps + cfg.slippageBps) / 10000); const net = gross - costs; balance = Math.max(0, balance + net); if (net > 0) { wins++; grossProfit += net; } else grossLoss += Math.abs(net); const risk = Math.abs(position.entry - position.sl); const maeR = risk ? position.mae / risk : 0; const mfeR = risk ? position.mfe / risk : 0; const stopClass = reason === 'stop' || reason === 'stop-first' ? (mfeR >= 0.5 ? 'profitable_then_stop' : maeR >= 1 ? 'structural_invalidation' : 'early_stop') : null; const costClass = reason === 'target' && net <= 0 ? 'target_cost_negative' : null; trades.push({ setupType: position.type, side: position.side, entry: position.entry, exit, net, gross, reason, stopClass, costClass, mae: position.mae, mfe: position.mfe, maeR, mfeR, entryModel: position.entryModel, stopModel: position.stopModel, targetModel: position.targetModel, entryReason: position.entryReason, evidence: position.evidence, stopLevel: position.sl, targetLevel: position.tp, entryTime: position.ts, exitTime: ts, poi: position.poi }); position = null; }
  for (let i = 60; i < c5.length; i++) { const c = c5[i]; if (position) { const favorable = position.side === 'LONG' ? c.high - position.entry : position.entry - c.low; const adverse = position.side === 'LONG' ? position.entry - c.low : c.high - position.entry; position.mfe = Math.max(position.mfe, favorable); position.mae = Math.max(position.mae, adverse); const sl = position.side === 'LONG' ? c.low <= position.sl : c.high >= position.sl, tp = position.side === 'LONG' ? c.high >= position.tp : c.low <= position.tp; if (sl || tp) close(sl ? position.sl : position.tp, c.ts, sl && tp ? 'stop-first' : sl ? 'stop' : 'target'); }
    if (!position && byIndex.has(i - 1)) { const s = byIndex.get(i - 1), entry = s.entryLevel * (s.side === 'LONG' ? 1 + cfg.slippageBps / 10000 : 1 - cfg.slippageBps / 10000), sl = s.event.stopLevel, risk = Math.abs(entry - sl), reward = s.side === 'LONG' ? s.event.targetLevel - entry : entry - s.event.targetLevel, qty = risk > 0 && reward / risk >= cfg.minRR ? Math.min(balance * cfg.riskPct / 100 / risk, cfg.initialBalance * cfg.maxNotionalPct / 100 / entry) : 0; if (qty > 0) position = { side: s.side, type: s.type, entry, qty, sl, tp: s.event.targetLevel, ts: c.ts, entryModel: s.event.entryModel, stopModel: s.event.stopModel, targetModel: s.event.targetModel, entryReason: s.entryReason || s.reason, evidence: s.evidence, poi: s.poi, mae: 0, mfe: 0 }; }
    const mark = position ? balance + (position.side === 'LONG' ? c.close - position.entry : position.entry - c.close) * position.qty : balance; peak = Math.max(peak, mark); maxDrawdown = Math.max(maxDrawdown, peak ? (peak - mark) / peak * 100 : 0); }
  if (position) close(c5[c5.length - 1].close, c5[c5.length - 1].ts, 'end');
  return { summary: { trades: trades.length, wins, losses: trades.length - wins, winRate: trades.length ? wins / trades.length * 100 : 0, profitFactor: grossLoss ? grossProfit / grossLoss : 0, netPnl: balance - cfg.initialBalance, maxDrawdown }, trades };
}

function marketStructureBot(c15, c1h, ts) {
  const j = completedIndex(c15, ts, 15 * 60 * 1000), h = completedIndex(c1h, ts, 60 * 60 * 1000);
  if (j < 40 || h < 55) return { state: 'unknown', confidence: 0, j, h };
  const e20 = ema(c1h.map(x => x.close), 20), e50 = ema(c1h.map(x => x.close), 50), a15 = atr(c15, 14);
  const pivots = [];
  for (let k = Math.max(2, j - 120); k <= j - 2; k++) {
    if (confirmedSwing(c15, k, 'high')) pivots.push({ side: 'high', index: k, price: c15[k].high });
    if (confirmedSwing(c15, k, 'low')) pivots.push({ side: 'low', index: k, price: c15[k].low });
  }
  pivots.sort((a, b) => a.index - b.index);
  const highs = pivots.filter(p => p.side === 'high'), lows = pivots.filter(p => p.side === 'low');
  const hi = highs.at(-1), prevHi = highs.at(-2), lo = lows.at(-1), prevLo = lows.at(-2);
  if (!hi || !prevHi || !lo || !prevLo || !a15[j]) return { state: 'unknown', confidence: 0, j, h };
  const candle = c15[j], atr15 = a15[j], range15 = candle.high - candle.low, body = Math.abs(candle.close - candle.open);
  const displacement = body >= atr15 * 0.5 && body / Math.max(range15, 1e-12) >= 0.55;
  const emaBull = c1h[h].close > e50[h] && e20[h] > e50[h], emaBear = c1h[h].close < e50[h] && e20[h] < e50[h];
  const higherHigh = hi.price > prevHi.price, higherLow = lo.price > prevLo.price, lowerHigh = hi.price < prevHi.price, lowerLow = lo.price < prevLo.price;
  const bullishLeg = higherHigh && higherLow, bearishLeg = lowerHigh && lowerLow;
  const bullishBreak = candle.close > hi.price && displacement, bearishBreak = candle.close < lo.price && displacement;
  const bosBull = bullishLeg && emaBull && bullishBreak, bosBear = bearishLeg && emaBear && bearishBreak;
  const chochBull = bearishLeg && candle.close > hi.price && displacement, chochBear = bullishLeg && candle.close < lo.price && displacement;
  const state = bosBull || (bullishLeg && emaBull && !chochBear) ? 'bull_continuation' : bosBear || (bearishLeg && emaBear && !chochBull) ? 'bear_continuation' : (chochBull || chochBear) ? 'transition' : 'range';
  const ssl = prevLo.price, bsl = prevHi.price, lowerWick = Math.min(candle.open, candle.close) - candle.low, upperWick = candle.high - Math.max(candle.open, candle.close);
  const sweepSSL = candle.low < ssl && candle.close > ssl && lowerWick / Math.max(range15, 1e-12) >= 0.6;
  const sweepBSL = candle.high > bsl && candle.close < bsl && upperWick / Math.max(range15, 1e-12) >= 0.6;
  const fvg = detectFvg(c15, j), orderBlock = displacement ? detectOrderBlock(c15, j, candle.close > candle.open ? 'bull' : 'bear', atr15) : null;
  const inducement = Boolean((sweepSSL || sweepBSL) && (chochBull || chochBear));
  const structureVotes = [bullishLeg || bearishLeg, emaBull || emaBear, bullishBreak || bearishBreak, chochBull || chochBear];
  const confidence = Math.round(structureVotes.filter(Boolean).length / structureVotes.length * 100);
  const mid = (hi.price + lo.price) / 2, premium = candle.close > mid, discount = candle.close < mid;
  const bias = state === 'bull_continuation' ? 'BULLISH' : state === 'bear_continuation' ? 'BEARISH' : state === 'transition' && chochBull ? 'BULLISH' : state === 'transition' && chochBear ? 'BEARISH' : 'NEUTRAL';
  return { state, confidence, j, h, bias, structure: { higherHigh, higherLow, lowerHigh, lowerLow, bosBull, bosBear, chochBull, chochBear, displacement, protectedHigh: bearishLeg ? hi : null, protectedLow: bullishLeg ? lo : null }, liquidity: { ssl, bsl, sweepSSL, sweepBSL }, fvg, orderBlock, inducement, swingHigh: hi, swingLow: lo, protectedHigh: bearishLeg ? hi : null, protectedLow: bullishLeg ? lo : null, premium, discount };
}

function setupBot(type, c5, c15, c1h, cfg) {
  const allowed = setupRegistry().includes(type);
  if (!allowed) return [];
  return buildSetupSignals(c5, c15, c1h, cfg, type).map(s => ({ ...s, bot: type, entryReason: s.entryReason || s.reason, stopReason: s.event.stopModel, targetReason: s.event.targetModel }));
}

function selectIntelligentSignals(c5, c15, c1h, cfg) {
  const structureCache = new Map();
  const all = setupRegistry().flatMap(type => setupBot(type, c5, c15, c1h, { ...cfg, _structureCache: structureCache }).map(s => { const key = s.i; if (!structureCache.has(key)) structureCache.set(key, marketStructureBot(c15, c1h, c5[s.i].ts)); const structure = structureCache.get(key); return { ...s, structure, regime: structure.state }; }));
  const candidateByRegime = {}, candidatesBySetup = {};
  for (const s of all) { candidateByRegime[s.regime] = (candidateByRegime[s.regime] || 0) + 1; candidatesBySetup[s.type] = (candidatesBySetup[s.type] || 0) + 1; }
  const priority = {
    bull_continuation: ['ob_fvg', 'fvg_mitigation', 'ob_retest', 'rbs_sbr', 'breaker', 'mitigation'],
    bear_continuation: ['ob_fvg', 'fvg_mitigation', 'ob_retest', 'rbs_sbr', 'breaker', 'mitigation'],
    transition: ['sweep_mss', 'breaker', 'choch', 'mitigation', 'ob_fvg'],
    range: ['turtle_soup', 'sweep_mss', 'mitigation'],
    unknown: []
  };
  const byIndex = new Map();
  for (const s of all) {
    if (s.structure.confidence < 60) continue;
    const rank = (priority[s.regime] || []).indexOf(s.type);
    if (rank < 0) continue;
    const old = byIndex.get(s.i);
    if (!old || rank < old.rank) byIndex.set(s.i, { ...s, rank, structureConfidence: s.structure.confidence });
  }
  const selected = [...byIndex.values()].sort((a, b) => a.i - b.i);
  selected.candidateByRegime = candidateByRegime;
  selected.candidatesBySetup = candidatesBySetup;
  return selected;
}

function runIntelligentBacktest(c5, c15, c1h, cfg) {
  const signals = selectIntelligentSignals(c5, c15, c1h, cfg);
  const result = runSetupArm(c5, signals, cfg), byRegime = {}, bySetup = {};
  const candidateByRegime = signals.candidateByRegime || {}, candidatesBySetup = signals.candidatesBySetup || {};
  for (const s of signals) {
    const bucket = byRegime[s.regime] || (byRegime[s.regime] = { candidates: 0, selected: 0, setups: {} });
    bucket.selected++;
    bucket.setups[s.type] = (bucket.setups[s.type] || 0) + 1;
    const setup = bySetup[s.type] || (bySetup[s.type] = { selected: 0, regime: {} });
    setup.selected++; setup.regime[s.regime] = (setup.regime[s.regime] || 0) + 1;
  }
  for (const s of setupRegistry()) bySetup[s] ||= { selected: 0, regime: {} };
  return { ...result, selection: { candidates: signals.length, selected: signals.length, byRegime, bySetup, candidateByRegime, candidatesBySetup }, architecture: { marketStructureBot: true, setupBots: setupRegistry(), delegation: 'structure bot selects setup bot; setup bot owns entry/sl/tp' } };
}

app.post('/api/backtest/structure-diagnostic', auth, async (req, res) => {
  const { symbol = 'BTCUSDT', limit = 52596 } = req.body;
  try {
    const [c15, c1h] = await Promise.all([loadAblationCandles(symbol, '15m', Number(limit)), loadAblationCandles(symbol, '1h', Number(limit))]);
    const rows = [], counts = {};
    let carriedProtectedHigh = null, carriedProtectedLow = null;
    for (let j = 240; j < c15.length - 1; j++) {
      const ts = c15[j].ts + 15 * 60 * 1000;
      const s = marketStructureBot(c15, c1h, ts);
      const raw = s.structure || {};
      const bullishShift = s.state === 'transition' && raw.chochBull;
      const bearishShift = s.state === 'transition' && raw.chochBear;
      if (s.state === 'bull_continuation') {
        if (s.swingLow) carriedProtectedLow = s.swingLow;
        if (raw.protectedLow) carriedProtectedLow = raw.protectedLow;
      }
      if (s.state === 'bear_continuation') {
        if (s.swingHigh) carriedProtectedHigh = s.swingHigh;
        if (raw.protectedHigh) carriedProtectedHigh = raw.protectedHigh;
      }
      if (bullishShift) carriedProtectedHigh = null;
      if (bearishShift) carriedProtectedLow = null;
      const structure = { ...raw, protectedHigh: carriedProtectedHigh, protectedLow: carriedProtectedLow };
      counts[s.state] = (counts[s.state] || 0) + 1;
      rows.push({ ts: c15[j].ts, state: s.state || 'unknown', confidence: Number(s.confidence || 0), bias: s.bias || 'NEUTRAL', structure, liquidity: s.liquidity || {}, fvg: s.fvg || null, orderBlock: s.orderBlock || null, inducement: Boolean(s.inducement), hasFvg: Boolean(s.fvg), hasOrderBlock: Boolean(s.orderBlock), reason: s.state === 'unknown' ? 'insufficient-confirmed-structure' : s.state === 'range' ? 'no-confirmed-directional-sequence' : s.state === 'transition' ? 'confirmed-opposite-structure-break' : 'confirmed-directional-sequence' });
    }
    res.json({ ok: true, engine: 'market-structure-diagnostic-v1', dataSource: readLocalCandles(symbol, '15m', 1) ? 'local-csv' : BINANCE_DATA_BASE, candles: { '1h': c1h.length, '15m': c15.length }, counts, rows });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/backtest/setup-diagnostic', auth, async (req, res) => {
  const { symbol = 'BTCUSDT', limit = 52596 } = req.body;
  try {
    const [c5, c15, c1h] = await Promise.all([loadAblationCandles(symbol, '5m', Number(limit)), loadAblationCandles(symbol, '15m', Number(limit)), loadAblationCandles(symbol, '1h', Number(limit))]);
    const cfg = { initialBalance: 1000, riskPct: 0.5, maxNotionalPct: 100, feeBps: 4, slippageBps: 2, minDisplacementAtr: 0.3, minRR: 1 };
    const results = {};
    for (const type of setupRegistry()) {
      const signals = buildSetupSignals(c5, c15, c1h, cfg, type);
      const trades = runSetupArm(c5, signals, cfg);
      results[type] = { candidates: signals.length, ...trades };
    }
    res.json({ ok: true, engine: 'independent-setup-diagnostic-v1', dataSource: readLocalCandles(symbol, '5m', 1) ? 'local-csv' : BINANCE_DATA_BASE, candles: { '1h': c1h.length, '15m': c15.length, '5m': c5.length }, setupRegistry: setupRegistry(), results });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/backtest/smc-intelligent', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 3, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many backtests' });
  const { symbol = 'BTCUSDT', limit = 52596, initialBalance = 1000, riskPct = 0.5, maxNotionalPct = 100, feeBps = 4, slippageBps = 2, minDisplacementAtr = 0.3, minRR = 1 } = req.body;
  const nLimit = Math.min(60000, Math.max(200, Number(limit)));
  try {
    const [c5, c15, c1h] = await Promise.all([loadAblationCandles(symbol, '5m', nLimit), loadAblationCandles(symbol, '15m', nLimit), loadAblationCandles(symbol, '1h', nLimit)]);
    const cfg = { initialBalance: Number(initialBalance), riskPct: Number(riskPct), maxNotionalPct: Number(maxNotionalPct), feeBps: Number(feeBps), slippageBps: Number(slippageBps), minDisplacementAtr: Number(minDisplacementAtr), minRR: Number(minRR) };
    const result = runIntelligentBacktest(c5, c15, c1h, cfg);
    res.json({ ok: true, engine: 'JEV structure-aware intelligent selector v1', dataSource: readLocalCandles(symbol, '5m', 1) ? 'local-csv' : BINANCE_DATA_BASE, candles: { '1h': c1h.length, '15m': c15.length, '5m': c5.length }, config: cfg, ...result });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/backtest/smc-all', auth, async (req, res) => {
  if (!rateLimit(apiAttempts, clientIp(req) + ':' + req.userId, 3, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many ablation runs' });
  const { symbol = 'BTCUSDT', limit = 52596, initialBalance = 1000, riskPct = 0.5, maxNotionalPct = 100, feeBps = 4, slippageBps = 2, minDisplacementAtr = 0.3, minRR = 1 } = req.body;
  const nLimit = Math.min(60000, Math.max(200, Number(limit)));
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({ error: 'Invalid Binance symbol' });
  try { const [c5, c15, c1h] = await Promise.all([loadAblationCandles(symbol, '5m', nLimit), loadAblationCandles(symbol, '15m', nLimit), loadAblationCandles(symbol, '1h', nLimit)]); const cfg = { initialBalance: Number(initialBalance), riskPct: Number(riskPct), maxNotionalPct: Number(maxNotionalPct), feeBps: Number(feeBps), slippageBps: Number(slippageBps), minDisplacementAtr: Number(minDisplacementAtr), minRR: Number(minRR) }; const results = {}; for (const type of setupRegistry()) { const signals = buildSetupSignals(c5, c15, c1h, cfg, type); results[type] = { candidates: signals.length, ...runSetupArm(c5, signals, cfg) }; } res.json({ ok: true, engine: 'JEV SMC multi-setup ablation v1', dataSource: readLocalCandles(symbol, '5m', 1) ? 'local-csv' : BINANCE_DATA_BASE, candles: { '1h': c1h.length, '15m': c15.length, '5m': c5.length }, setupRegistry: setupRegistry(), results }); } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3700;
initDb().then(() => {
  app.listen(PORT, () => console.log('JEV Trading Bot running on http://localhost:' + PORT));
}).catch(e => {
  console.error('DB init failed:', e);
  process.exit(1);
});
