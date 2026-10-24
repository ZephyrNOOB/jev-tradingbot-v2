import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeCandidate, validateCandidatePrecision, normalizeCandidatePrices } from '../v2/scripts/execution_sizing.js';
import { buildDemoEntryOrder, canSendDemoEntry, demoExecutionGate } from '../v2/scripts/demo_entry_executor.js';
import { buildProtectionOrders, verifyEntryFill, buildEmergencyCloseOrder } from '../v2/scripts/demo_protection.js';
import { reconcileDemoState } from '../v2/scripts/demo_reconciliation.js';
import { monitorProtectionState, readinessBlockers } from '../v2/scripts/demo_monitoring.js';
import { buildRecoveryPlan } from '../v2/scripts/demo_recovery.js';

const filters = { filters: [
  { filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001' },
  { filterType: 'PRICE_FILTER', tickSize: '0.10' },
  { filterType: 'MIN_NOTIONAL', notional: '100' }
] };

test('sizes valid candidate and rounds Binance quantity and price', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 82898.28355 }, { tradeAmountUsdt: 200 }, { availableBalance: 1000 }, filters);
  assert.equal(result.status, 'SIZED');
  assert.equal(result.quantity, '0.002');
  assert.equal(result.price, '82960.40');
});

test('raises quantity to the next step when configured amount hits min notional after rounding', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 83656.05, sl: 83786.50 }, { tradeAmountUsdt: 50 }, { availableBalance: 1000 }, { filters: [
    { filterType: 'LOT_SIZE', minQty: '0.0001', stepSize: '0.0001' },
    { filterType: 'PRICE_FILTER', tickSize: '0.10' },
    { filterType: 'MIN_NOTIONAL', notional: '50' }
  ] });
  assert.equal(result.status, 'SIZED');
  assert.equal(result.quantity, '0.0006');
  assert.ok(Number(result.notional) >= 50);
});

test('rejects quantity below Binance minimum', () => {
  const minQtyFilters = { filters: [
    { filterType: 'LOT_SIZE', minQty: '0.010', stepSize: '0.001' },
    { filterType: 'PRICE_FILTER', tickSize: '0.10' },
    { filterType: 'MIN_NOTIONAL', notional: '100' }
  ] };
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 80000 }, { tradeAmountUsdt: 100 }, { availableBalance: 1000 }, minQtyFilters);
  assert.equal(result.status, 'REJECTED_BELOW_MIN_QTY');
});



test('validates entry, SL, TP ticks and side geometry', () => {
  const sized = { status: 'SIZED', quantity: '0.002', price: '82960.40' };
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.45, sl: 82898.20, tp: 83124.90 }, sized, filters), 'REJECTED_ENTRY_TICK');
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.40, sl: 82898.20, tp: 83124.90 }, sized, filters), 'VALID');
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.40, sl: 83000.00, tp: 83124.90 }, sized, filters), 'VALID');
});


test('entry executor stays disabled before protection exists', () => {
  const candidate = { client_order_id: 'jev_test_1', symbol: 'BTCUSDT', side: 'BUY' };
  const order = buildDemoEntryOrder(candidate, { status: 'SIZED', quantity: '0.002', price: '82960.40' }, 'VALID');
  assert.equal(order.status, 'READY_FOR_LIVE_DEMO');
  assert.equal(order.clientOrderId, 'jev_test_1');
  assert.equal(canSendDemoEntry({ botEnabled: true, ordersEnabled: false, protectiveOrdersReady: false }).reason, 'ORDERS_DISABLED');
  assert.equal(canSendDemoEntry({ botEnabled: true, ordersEnabled: true, protectiveOrdersReady: false }).allowed, false);
});

test('builds emergency close order for filled entry without protection', () => {
  const order = buildEmergencyCloseOrder({ client_order_id: 'jev_test_1', symbol: 'BTCUSDT', side: 'BUY' }, '0.002');
  assert.deepEqual(order, { clientOrderId: 'jev_test_1_ec', symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.002', reduceOnly: 'true' });
});

test('builds opposite-side SL/TP only after confirmed entry fill', () => {
  const candidate = { client_order_id: 'jev_test_1', symbol: 'BTCUSDT', side: 'BUY', sl: 82898.20, tp: 83124.90 };
  const plan = buildProtectionOrders(candidate, { status: 'SIZED', quantity: '0.002', price: '82960.40' }, 'VALID');
  assert.equal(plan.status, 'READY_AFTER_ENTRY_FILL');
  assert.deepEqual(plan.orders.map(order => [order.type, order.side]), [['STOP_MARKET', 'SELL'], ['TAKE_PROFIT_MARKET', 'SELL']]);
  assert.equal(verifyEntryFill({ status: 'NEW' }).filled, false);
  assert.deepEqual(verifyEntryFill({ status: 'FILLED', executedQty: '0.002', avgPrice: '82960.40' }), { filled: true, status: 'FILLED', quantity: '0.002', averagePrice: '82960.40' });
});

test('reconciles managed, unmanaged, and pending exchange state', () => {
  const candidates = [{ client_order_id: 'jev_1', symbol: 'BTCUSDT' }];
  const result = reconcileDemoState(candidates, [{ orderId: 7, clientOrderId: 'external_1', symbol: 'BTCUSDT' }], [{ symbol: 'BTCUSDT', positionAmt: '0' }, { symbol: 'ETHUSDT', positionAmt: '1' }]);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.unmanagedOrders[0].status, 'UNMANAGED_ORDER');
  assert.equal(result.unmanagedPositions[0].status, 'UNMANAGED_POSITION');
  assert.equal(result.pendingCandidates[0].status, 'NOT_ON_EXCHANGE');
});



test('marks filled positions without complete protection as unsafe', () => {
  const candidates = [{ client_order_id: 'jev_1', symbol: 'BTCUSDT' }];
  const position = [{ symbol: 'BTCUSDT', positionAmt: '0.002' }];
  assert.equal(monitorProtectionState(candidates, [], position)[0].status, 'ENTRY_FILLED_NO_PROTECTION');
  assert.equal(monitorProtectionState(candidates, [{ clientOrderId: 'jev_1_sl', status: 'NEW' }], position)[0].status, 'PROTECTION_INCOMPLETE');
  assert.equal(monitorProtectionState(candidates, [{ clientOrderId: 'jev_1_sl', status: 'NEW' }, { clientOrderId: 'jev_1_tp', status: 'NEW' }], position)[0].status, 'HEALTHY');
  assert.equal(monitorProtectionState(candidates, [{ clientOrderId: 'jev_1', symbol: 'BTCUSDT', orderId: 9, status: 'NEW' }], [])[0].status, 'ENTRY_PENDING_FILL');
  assert.deepEqual(readinessBlockers([{ status: 'ENTRY_PENDING_FILL' }]), ['ENTRY_PENDING_FILL']);
});

test('readiness reports protection blockers only for unsafe open positions', () => {
  assert.deepEqual(readinessBlockers([{ status: 'NO_OPEN_POSITION' }]), []);
  assert.deepEqual(readinessBlockers([{ status: 'HEALTHY' }]), []);
  assert.deepEqual(readinessBlockers([{ status: 'ENTRY_FILLED_NO_PROTECTION' }]), ['PROTECTIVE_ORDER_VERIFICATION_REQUIRED', 'POSITION_MONITORING_REQUIRED']);
});

test('recovery plans only missing protection orders and stays plan-only', () => {
  const candidate = { client_order_id: 'jev_1', symbol: 'BTCUSDT', side: 'BUY', sl: 82898.20, tp: 83124.90 };
  const sizing = { status: 'SIZED', quantity: '0.002', price: '82960.40' };
  const partial = buildRecoveryPlan(candidate, sizing, 'VALID', { status: 'PROTECTION_INCOMPLETE', hasSl: true, hasTp: false });
  assert.equal(partial.status, 'PLAN_ONLY');
  assert.deepEqual(partial.orders.map(order => order.clientOrderId), ['jev_1_tp']);
  assert.equal(buildRecoveryPlan(candidate, sizing, 'VALID', { status: 'HEALTHY', hasSl: true, hasTp: true }).status, 'NO_ACTION');
});

test('demo execution requires explicit enable flag after all safety gates', () => {
  assert.equal(demoExecutionGate({ botEnabled: true, ordersEnabled: true, protectiveOrdersReady: true, riskStatus: 'ALLOWED', demoExecutionEnabled: false }).reason, 'DEMO_EXECUTION_FLAG_DISABLED');
  assert.equal(demoExecutionGate({ botEnabled: true, ordersEnabled: true, protectiveOrdersReady: true, riskStatus: 'ALLOWED', demoExecutionEnabled: true }).allowed, true);
});

test('stage 8 gate remains valid before explicit approval is passed to executor', () => {
  assert.equal(demoExecutionGate({ botEnabled: true, ordersEnabled: true, protectiveOrdersReady: true, riskStatus: 'ALLOWED', demoExecutionEnabled: true }).allowed, true);
});

test('normalizes candidate prices to Binance tick before execution', () => {
  const f = { filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.10' }] };
  const normalized = normalizeCandidatePrices({ side: 'BUY', entry: 83073.05, sl: 83005.29095, tp: 83258.7 }, f);
  assert.deepEqual([normalized.entry, normalized.sl, normalized.tp], [83073.00, 83005.20, 83258.70]);
});


test('does not size without optional trade amount', () => {
  assert.equal(sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 82898.20 }, {}, { availableBalance: 1000 }, filters).status, 'TRADE_AMOUNT_NOT_CONFIGURED');
});
