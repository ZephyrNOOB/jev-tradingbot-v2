export const DEMO_ENTRY_DISABLED_REASON = 'Protective SL/TP and recovery are not ready';

export function buildDemoEntryOrder(candidate, sizing, precisionValidation) {
  if (sizing?.status !== 'SIZED') return { status: sizing?.status || 'REJECTED_NOT_SIZED' };
  if (precisionValidation !== 'VALID') return { status: precisionValidation || 'REJECTED_PRECISION' };
  if (!candidate?.client_order_id || !['BUY', 'SELL'].includes(candidate.side)) return { status: 'REJECTED_INVALID_CANDIDATE' };
  return { status: 'READY_FOR_LIVE_DEMO', clientOrderId: candidate.client_order_id, symbol: candidate.symbol, side: candidate.side, type: 'LIMIT', timeInForce: 'GTC', quantity: sizing.quantity, price: sizing.price };
}

export function canSendDemoEntry({ botEnabled, ordersEnabled, protectiveOrdersReady, riskStatus = 'ALLOWED' }) {
  if (riskStatus !== 'ALLOWED') return { allowed: false, reason: riskStatus };
  if (!botEnabled) return { allowed: false, reason: 'BOT_OFF' };
  if (!ordersEnabled) return { allowed: false, reason: 'ORDERS_DISABLED' };
  if (!protectiveOrdersReady) return { allowed: false, reason: DEMO_ENTRY_DISABLED_REASON };
  return { allowed: true };
}

export function demoExecutionGate(input) {
  const permission = canSendDemoEntry(input);
  if (!permission.allowed) return permission;
  if (input.demoExecutionEnabled !== true) return { allowed: false, reason: 'DEMO_EXECUTION_FLAG_DISABLED' };
  return { allowed: true };
}
