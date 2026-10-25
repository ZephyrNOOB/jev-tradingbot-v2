import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('late entry FILLED event cannot reopen CLOSED lifecycle or retrigger protection', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf("if (status === 'FILLED' && clientOrderId && !/_ec$/i.test(clientOrderId))"), source.indexOf('let marketCandleUnsubscribe'));
  assert.match(update, /position_status != \\\'CLOSED\\\'/);
  assert.match(update, /lifecycle\?\.position_status === 'CLOSED'/);
});

test('manual reconciliation ignores pending entry lifecycles', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /position_status = \\\'OPEN\\\'/);
  assert.match(reconcile, /entry_status = \\\'FILLED\\\'/);
  assert.match(reconcile, /tradesBySymbol/);
  assert.match(reconcile, /entry_order_id/);
});
