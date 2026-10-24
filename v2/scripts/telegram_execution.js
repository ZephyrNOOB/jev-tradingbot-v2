export function closeReasonFromClientOrderId(clientOrderId) {
  if (/_sl$/i.test(String(clientOrderId || ''))) return 'SL';
  if (/_tp$/i.test(String(clientOrderId || ''))) return 'TP';
  return null;
}

export function classifyExecutionEvent(event) {
  if (event?.e === 'ORDER_TRADE_UPDATE' && event.o?.X === 'FILLED' && event.o?.i) {
    return closeReasonFromClientOrderId(event.o.c) ? 'CLOSE_FILLED' : 'ENTRY_FILLED';
  }
  if (event?.e === 'POSITION_RECONCILIATION' && Number(event.positionAmt) === 0) return 'MANUAL_CLOSE';
  return null;
}
