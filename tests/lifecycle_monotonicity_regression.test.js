import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('existing lifecycle UPDATE preserves verified protection status', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf("if (status === 'FILLED' && clientOrderId && !/_ec$/i.test(clientOrderId))"), source.indexOf("    if (!get('SELECT id"));
  assert.match(update, /protection_status=execution_lifecycles\.protection_status/);
});

test('late entry FILLED event cannot reopen CLOSED lifecycle or retrigger protection', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf("if (status === 'FILLED' && clientOrderId && !/_ec$/i.test(clientOrderId))"), source.indexOf('let marketCandleUnsubscribe'));
  assert.match(update, /position_status != \\\'CLOSED\\\'/);
  assert.match(update, /lifecycle\?\.position_status === 'CLOSED'/);
});

test('manual reconciliation updates history linked by client order ID', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /trade_history SET status=\\'CLOSED\\'/);
  assert.match(reconcile, /client_order_id/);
  assert.match(reconcile, /exit_order_id/);
});

test('manual reconciliation uses exchange close fill time for completed_at', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /const completedAt = Number\(exchangeClose\.time\)/);
  assert.match(reconcile, /\[String\(exchangeClose\.orderId \|\| ''\), now, completedAt/);
  assert.match(reconcile, /\[String\(exchangeClose\.orderId \|\| ''\), completedAt/);
  assert.doesNotMatch(reconcile, /\[exchangeClose \? String\(exchangeClose\.orderId \|\| ''\) : null, now, now/);
});

test('history route reconciles manual close timestamps before selecting rows', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const history = source.slice(source.indexOf("app.get('/api/history'"), source.indexOf('function normalizeBinance'));
  assert.match(history, /await syncTradeHistory\(req\.userId\)/);
  assert.match(history, /positionRisk/);
  assert.match(history, /userTrades/);
  assert.match(history, /reconcileManualClosedLifecycles\(req\.userId, positions, exchangeTrades/);
  assert.match(history, /notify: false/);
  assert.match(history, /reconcileManualClosedLifecycles[\s\S]*?all\(sql, params\)/);
});

test('history date filter uses completed_at close timestamp', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const history = source.slice(source.indexOf("app.get('/api/history'"), source.indexOf('function normalizeBinance'));
  assert.match(history, /completed_at >= \? AND completed_at < \?/);
  assert.doesNotMatch(history, /ts >= \? AND ts < \?/);
});

test('manual reconciliation repairs stale completed_at only for closed filled lifecycles', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /position_status IN \(\'OPEN\',\'CLOSED\'\)/);
  assert.match(reconcile, /entry_status = \'FILLED\'/);
  assert.match(reconcile, /Number\.isFinite\(completedAt\)/);
  assert.match(reconcile, /lifecycle\.completed_at !== completedAt/);
  assert.match(reconcile, /SET completed_at=\?, updated_at=\?/);
  assert.match(reconcile, /SET completed_at=\?/);
});

test('manual reconciliation leaves entry timestamp and already-correct closed rows unchanged', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /entryTime = entryTrades\.reduce/);
  assert.match(reconcile, /lifecycle\.completed_at !== completedAt/);
  assert.doesNotMatch(reconcile, /entryTime\\s*=\\s*completedAt/);
});

test('manual reconciliation ignores pending entry lifecycles', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /entry_status = 'FILLED'/);
  assert.doesNotMatch(reconcile, /entry_status IN \(\\\'NEW\\\',\\\'PARTIALLY_FILLED\\\'\)/);
  assert.match(reconcile, /tradesBySymbol/);
  assert.match(reconcile, /entry_order_id/);
});
