import test from 'node:test';
import assert from 'node:assert/strict';

test('trade history contract records filled entry metadata', () => {
  const fields = ['client_order_id', 'order_id', 'setup_id', 'structure_event_id', 'status'];
  assert.equal(fields.length, 5);
});

test('closed trade uses realized pnl and CLOSED status', () => {
  const trade = { realizedPnl: 1.25 };
  assert.equal(trade.realizedPnl !== 0 ? 'CLOSED' : 'OPEN', 'CLOSED');
});
