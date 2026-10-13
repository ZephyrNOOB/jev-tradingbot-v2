import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDemoState } from '../v2/scripts/demo_reconciliation.js';
import { monitorProtectionState, readinessBlockers } from '../v2/scripts/demo_monitoring.js';

test('stage 7 reconciles only current candidates and blocks unsafe position', () => {
  const candidates = [{ client_order_id: 'jev_1', symbol: 'BTCUSDT' }];
  const positions = [{ symbol: 'BTCUSDT', positionAmt: '0.001' }];
  const monitoring = monitorProtectionState(candidates, [], positions);
  const reconciliation = reconcileDemoState(candidates, [], positions);
  assert.equal(monitoring[0].status, 'ENTRY_FILLED_NO_PROTECTION');
  assert.deepEqual(readinessBlockers(monitoring), ['PROTECTIVE_ORDER_VERIFICATION_REQUIRED', 'POSITION_MONITORING_REQUIRED']);
  assert.equal(reconciliation.status, 'RECONCILED');
});

test('stage 7 marks unknown exchange order for review', () => {
  const result = reconcileDemoState([], [{ orderId: 9, clientOrderId: 'external', symbol: 'ETHUSDT' }], []);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.unmanagedOrders[0].status, 'UNMANAGED_ORDER');
});
