import test from 'node:test';
import assert from 'node:assert/strict';

function selectActivePlan(artifact, symbol) {
  const candidate = (artifact.execution_candidates || []).find(item => item.symbol === symbol && item.status === 'APPROVED_FOR_EXECUTION');
  return artifact.active_plan_by_symbol?.[symbol]?.client_order_id === candidate?.client_order_id ? candidate : null;
}

test('active plan registry allows current plan only', () => {
  const artifact = { execution_candidates: [{ symbol: 'BTCUSDT', client_order_id: 'new', status: 'APPROVED_FOR_EXECUTION' }], active_plan_by_symbol: { BTCUSDT: { client_order_id: 'new' } } };
  assert.equal(selectActivePlan(artifact, 'BTCUSDT')?.client_order_id, 'new');
});

test('registry mismatch blocks candidate', () => {
  const artifact = { execution_candidates: [{ symbol: 'BTCUSDT', client_order_id: 'old', status: 'APPROVED_FOR_EXECUTION' }], active_plan_by_symbol: { BTCUSDT: { client_order_id: 'new' } } };
  assert.equal(selectActivePlan(artifact, 'BTCUSDT'), null);
});
