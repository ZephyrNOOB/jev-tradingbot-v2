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

test('manual reconciliation ignores pending entry lifecycles', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /position_status = \\\'OPEN\\\'/);
  assert.match(reconcile, /entry_status = \\\'FILLED\\\'/);
  assert.match(reconcile, /tradesBySymbol/);
  assert.match(reconcile, /entry_order_id/);
});
