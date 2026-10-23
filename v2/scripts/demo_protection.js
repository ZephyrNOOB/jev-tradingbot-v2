export function buildProtectionOrders(candidate, sizing, precisionValidation) {
  if (sizing?.status !== 'SIZED') return { status: sizing?.status || 'REJECTED_NOT_SIZED', orders: [] };
  if (precisionValidation !== 'VALID') return { status: precisionValidation || 'REJECTED_PRECISION', orders: [] };
  if (!candidate?.client_order_id || !['BUY', 'SELL'].includes(candidate.side)) return { status: 'REJECTED_INVALID_CANDIDATE', orders: [] };
  const exitSide = candidate.side === 'BUY' ? 'SELL' : 'BUY';
  return {
    status: 'READY_AFTER_ENTRY_FILL',
    orders: [
      { clientOrderId: `${candidate.client_order_id}_sl`, symbol: candidate.symbol, side: exitSide, type: 'STOP_MARKET', stopPrice: String(candidate.sl), closePosition: 'true', workingType: 'MARK_PRICE' },
      { clientOrderId: `${candidate.client_order_id}_tp`, symbol: candidate.symbol, side: exitSide, type: 'TAKE_PROFIT_MARKET', stopPrice: String(candidate.tp), closePosition: 'true', workingType: 'MARK_PRICE' }
    ]
  };
}

export function buildEmergencyCloseOrder(candidate, quantity) {
  if (!candidate?.client_order_id || !candidate.symbol || !['BUY', 'SELL'].includes(candidate.side) || !(Number(quantity) > 0)) return null;
  return { clientOrderId: `${candidate.client_order_id.slice(-24)}_ec`, symbol: candidate.symbol, side: candidate.side === 'BUY' ? 'SELL' : 'BUY', type: 'MARKET', quantity: String(quantity), reduceOnly: 'true' };
}

export function verifyEntryFill(exchangeOrder) {
  if (!exchangeOrder || exchangeOrder.status !== 'FILLED') return { filled: false, status: exchangeOrder?.status || 'MISSING' };
  const quantity = Number(exchangeOrder.executedQty);
  const averagePrice = Number(exchangeOrder.avgPrice || exchangeOrder.price);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averagePrice) || averagePrice <= 0) return { filled: false, status: 'INVALID_FILL' };
  return { filled: true, status: 'FILLED', quantity: String(exchangeOrder.executedQty), averagePrice: String(exchangeOrder.avgPrice || exchangeOrder.price) };
}
