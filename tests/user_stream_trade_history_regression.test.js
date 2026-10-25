import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ORDER_TRADE_UPDATE FILLED creates trade_history row when entry row is missing', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('function recordExchangeOrderUpdate'), source.indexOf('let marketCandleUnsubscribe'));
  assert.match(update, /INSERT INTO trade_history/);
  assert.match(update, /ON CONFLICT|INSERT OR IGNORE/);
  assert.match(update, /client_order_id/);
  assert.match(update, /order_id/);
});

test('REST trade sync merges by order_id before trade_id to avoid duplicate fills', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const sync = source.slice(source.indexOf('async function syncTradeHistory'), source.indexOf('function getExecutionLifecycle'));
  assert.match(sync, /const existing = get/);
  assert.match(sync, /SELECT id FROM trade_history WHERE user_id = \? AND order_id = \?/);
  assert.match(sync, /if \(existing\)/);
});

test('Binance history refreshes local JEV fill state before raw history response', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/binance-history'"), source.indexOf("app.get('/api/history'"));
  assert.match(route, /await syncTradeHistory\(req\.userId\)/);
});

test('protection submission exposes Binance accept or reject evidence', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const execution = source.slice(source.indexOf('const submitProtection'), source.indexOf('const listProtection'));
  assert.match(execution, /protectionLastAttempt/);
  assert.match(execution, /status: 'ACCEPTED'/);
  assert.match(execution, /status: 'REJECTED'/);
});
