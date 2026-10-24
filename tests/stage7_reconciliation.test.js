import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDemoState, selectReconciliationCandidates } from '../v2/scripts/demo_reconciliation.js';
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

test('stage 7 readiness exposes missing provenance blocker', () => {
  assert.deepEqual(readinessBlockers([{ status: 'BLOCKED_MISSING_PROVENANCE' }]), ['BLOCKED_MISSING_PROVENANCE']);
});

test('stage 7 reconciliation exposes missing provenance blocker', () => {
  const result = reconcileDemoState([], [], [], [{ status: 'BLOCKED_MISSING_PROVENANCE' }]);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.deepEqual(result.blockers, ['BLOCKED_MISSING_PROVENANCE']);
});

test('stage 7 keeps replaced exchange order ID managed by stable client identity', () => {
  const candidates = [{ client_order_id: 'jev_f425cbf38a03b947876c9fde', symbol: 'XAUUSDT' }];
  const openOrders = [{ orderId: 608942647, clientOrderId: 'jev_f425cbf38a03b947876c9fde', symbol: 'XAUUSDT', status: 'NEW' }];
  const selected = selectReconciliationCandidates([], openOrders, candidates);
  const result = reconcileDemoState(selected, openOrders, []);
  assert.equal(result.status, 'RECONCILED');
  assert.equal(result.unmanagedOrders.length, 0);
  assert.equal(result.managedOrders[0].orderId, 608942647);
});

test('stage 7 reports pair-level provenance for unmanaged position, unmanaged order, and managed pending order', () => {
  const candidates = [{ client_order_id: 'jev_xau_1', symbol: 'XAUUSDT' }];
  const result = reconcileDemoState(candidates, [
    { orderId: 17, clientOrderId: 'external_sol', symbol: 'SOLUSDT', status: 'NEW' },
    { orderId: 23, clientOrderId: 'jev_xau_1', symbol: 'XAUUSDT', status: 'NEW' }
  ], [{ symbol: 'ETHUSDT', positionAmt: '1' }]);

  assert.deepEqual(result.pairExposure, [
    { symbol: 'ETHUSDT', status: 'UNMANAGED_POSITION', positionAmt: '1', action: 'BLOCKED_REQUIRES_LINK_OR_CONTAINMENT' },
    { symbol: 'SOLUSDT', status: 'UNMANAGED_ORDER', orderId: '17', clientOrderId: 'external_sol', action: 'BLOCKED_REQUIRES_PROVENANCE_OR_CANCEL_REVIEW' },
    { symbol: 'XAUUSDT', status: 'MANAGED_PENDING_ORDER', orderId: '23', clientOrderId: 'jev_xau_1', action: 'MONITOR_PENDING_FILL' }
  ]);
});

test('stage 7 deduplicates readiness blockers and reconciliation review', () => {
  const monitoring = [{ status: 'ENTRY_PENDING_FILL' }, { status: 'ENTRY_PENDING_FILL' }];
  assert.deepEqual(readinessBlockers(monitoring), ['ENTRY_PENDING_FILL']);
  const reconciliation = reconcileDemoState([], [], [], monitoring);
  assert.equal(reconciliation.status, 'REVIEW_REQUIRED');
  assert.deepEqual(reconciliation.blockers, ['ENTRY_PENDING_FILL']);
});

test('stage 7 blocks durable managed NEW and PARTIALLY_FILLED entries with zero position', () => {
  for (const status of ['NEW', 'PARTIALLY_FILLED']) {
    const openOrders = [{ orderId: 23, clientOrderId: 'jev_xau_1', symbol: 'XAUUSDT', type: 'LIMIT', status }];
    const candidates = selectReconciliationCandidates([], openOrders, [{ client_order_id: 'jev_xau_1', symbol: 'XAUUSDT' }]);
    const positions = [{ symbol: 'XAUUSDT', positionAmt: '0' }];
    const monitoring = monitorProtectionState(candidates, openOrders, positions);
    assert.equal(monitoring[0].status, 'ENTRY_PENDING_FILL');
    assert.deepEqual(readinessBlockers(monitoring), ['ENTRY_PENDING_FILL']);
    const reconciliation = reconcileDemoState(candidates, openOrders, positions, monitoring);
    assert.equal(reconciliation.status, 'REVIEW_REQUIRED');
    assert.deepEqual(reconciliation.blockers, ['ENTRY_PENDING_FILL']);
  }
});

test('stage 7 marks unknown exchange order for review', () => {
  const result = reconcileDemoState([], [{ orderId: 9, clientOrderId: 'external', symbol: 'ETHUSDT' }], []);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.deepEqual(result.blockers, ['UNMANAGED_ORDER:ETHUSDT']);
  assert.equal(result.unmanagedOrders[0].status, 'UNMANAGED_ORDER');
});
