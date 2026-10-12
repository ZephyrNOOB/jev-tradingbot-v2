import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeCandidate, validateCandidatePrecision } from '../v2/scripts/execution_sizing.js';
import { buildDemoEntryOrder, canSendDemoEntry } from '../v2/scripts/demo_entry_executor.js';
import { buildProtectionOrders, verifyEntryFill } from '../v2/scripts/demo_protection.js';
import { reconcileDemoState } from '../v2/scripts/demo_reconciliation.js';
import { evaluateRiskLimits } from '../v2/scripts/demo_risk_guard.js';
import { monitorProtectionState } from '../v2/scripts/demo_monitoring.js';
import { buildRecoveryPlan } from '../v2/scripts/demo_recovery.js';

const filters = { filters: [
  { filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001' },
  { filterType: 'PRICE_FILTER', tickSize: '0.10' },
  { filterType: 'MIN_NOTIONAL', notional: '100' }
] };

test('sizes valid candidate and rounds Binance quantity and price', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 82898.28355 }, { riskPerTrade: 0.25, maxNotional: 200, leverage: 1 }, { availableBalance: 1000 }, filters);
  assert.equal(result.status, 'SIZED');
  assert.equal(result.quantity, '0.002');
  assert.equal(result.price, '82960.40');
});

test('rejects quantity below Binance minimum', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 80000 }, { riskPerTrade: 0.01, maxNotional: 200, leverage: 1 }, { availableBalance: 100 }, filters);
  assert.equal(result.status, 'REJECTED_BELOW_MIN_QTY');
});



test('validates entry, SL, TP ticks and side geometry', () => {
  const sized = { status: 'SIZED', quantity: '0.002', price: '82960.40' };
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.45, sl: 82898.28, tp: 83124.90 }, sized, filters), 'REJECTED_ENTRY_TICK');
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.40, sl: 82898.20, tp: 83124.90 }, sized, filters), 'VALID');
  assert.equal(validateCandidatePrecision({ side: 'BUY', entry: 82960.40, sl: 83000.00, tp: 83124.90 }, sized, filters), 'REJECTED_PRICE_RELATION');
});


test('entry executor stays disabled before protection exists', () => {
  const candidate = { client_order_id: 'jev_test_1', symbol: 'BTCUSDT', side: 'BUY' };
  const order = buildDemoEntryOrder(candidate, { status: 'SIZED', quantity: '0.002', price: '82960.40' }, 'VALID');
  assert.equal(order.status, 'READY_BUT_DISABLED');
  assert.equal(order.clientOrderId, 'jev_test_1');
  assert.equal(canSendDemoEntry({ botEnabled: true, ordersEnabled: false, protectiveOrdersReady: false }).reason, 'ORDERS_DISABLED');
  assert.equal(canSendDemoEntry({ botEnabled: true, ordersEnabled: true, protectiveOrdersReady: false }).allowed, false);
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

test('blocks new entries at position and daily-loss limits', () => {
  const policy = { maxOpenPositions: 1, maxDailyLoss: 1 };
  assert.equal(evaluateRiskLimits([{ positionAmt: '1' }], -5, { availableBalance: 100 }, policy).status, 'REJECTED_MAX_OPEN_POSITIONS');
  assert.equal(evaluateRiskLimits([], -1, { availableBalance: 100 }, policy).status, 'REJECTED_MAX_DAILY_LOSS');
  assert.equal(evaluateRiskLimits([], -0.5, { availableBalance: 100 }, policy).status, 'ALLOWED');
});

test('marks filled positions without complete protection as unsafe', () => {
  const candidates = [{ client_order_id: 'jev_1', symbol: 'BTCUSDT' }];
  const position = [{ symbol: 'BTCUSDT', positionAmt: '0.002' }];
  assert.equal(monitorProtectionState(candidates, [], position)[0].status, 'ENTRY_FILLED_NO_PROTECTION');
  assert.equal(monitorProtectionState(candidates, [{ clientOrderId: 'jev_1_sl', status: 'NEW' }], position)[0].status, 'PROTECTION_INCOMPLETE');
  assert.equal(monitorProtectionState(candidates, [{ clientOrderId: 'jev_1_sl', status: 'NEW' }, { clientOrderId: 'jev_1_tp', status: 'NEW' }], position)[0].status, 'HEALTHY');
});

test('recovery plans only missing protection orders and stays plan-only', () => {
  const candidate = { client_order_id: 'jev_1', symbol: 'BTCUSDT', side: 'BUY', sl: 82898.20, tp: 83124.90 };
  const sizing = { status: 'SIZED', quantity: '0.002', price: '82960.40' };
  const partial = buildRecoveryPlan(candidate, sizing, 'VALID', { status: 'PROTECTION_INCOMPLETE', hasSl: true, hasTp: false });
  assert.equal(partial.status, 'PLAN_ONLY');
  assert.deepEqual(partial.orders.map(order => order.clientOrderId), ['jev_1_tp']);
  assert.equal(buildRecoveryPlan(candidate, sizing, 'VALID', { status: 'HEALTHY', hasSl: true, hasTp: true }).status, 'NO_ACTION');
});
