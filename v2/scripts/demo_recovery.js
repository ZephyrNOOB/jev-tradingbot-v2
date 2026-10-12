export function buildRecoveryPlan(candidate, sizing, precisionValidation, monitoring) {
  if (monitoring?.status === 'HEALTHY') return { status: 'NO_ACTION', orders: [] };
  if (!['ENTRY_FILLED_NO_PROTECTION', 'PROTECTION_INCOMPLETE'].includes(monitoring?.status)) return { status: 'REJECTED_UNSAFE_STATE', orders: [] };
  if (sizing?.status !== 'SIZED') return { status: sizing?.status || 'REJECTED_NOT_SIZED', orders: [] };
  if (precisionValidation !== 'VALID') return { status: precisionValidation || 'REJECTED_PRECISION', orders: [] };
  if (!candidate?.client_order_id || !['BUY', 'SELL'].includes(candidate.side)) return { status: 'REJECTED_INVALID_CANDIDATE', orders: [] };
  const exitSide = candidate.side === 'BUY' ? 'SELL' : 'BUY';
  const orders = [];
  if (!monitoring.hasSl) orders.push({ clientOrderId: `${candidate.client_order_id}_sl`, symbol: candidate.symbol, side: exitSide, type: 'STOP_MARKET', stopPrice: String(candidate.sl), closePosition: 'true', workingType: 'MARK_PRICE' });
  if (!monitoring.hasTp) orders.push({ clientOrderId: `${candidate.client_order_id}_tp`, symbol: candidate.symbol, side: exitSide, type: 'TAKE_PROFIT_MARKET', stopPrice: String(candidate.tp), closePosition: 'true', workingType: 'MARK_PRICE' });
  return { status: 'PLAN_ONLY', orders, ordersSent: false };
}
