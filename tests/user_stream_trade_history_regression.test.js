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
