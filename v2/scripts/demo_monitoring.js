export function readinessBlockers(monitoring = []) {
  return monitoring.some(item => ['ENTRY_FILLED_NO_PROTECTION', 'PROTECTION_INCOMPLETE'].includes(item.status))
    ? ['PROTECTIVE_ORDER_VERIFICATION_REQUIRED', 'POSITION_MONITORING_REQUIRED']
    : [];
}

export function monitorProtectionState(candidates = [], openOrders = [], positions = []) {
  return candidates.map(candidate => {
    const position = positions.find(item => item.symbol === candidate.symbol && Number(item.positionAmt) !== 0);
    if (!position) return { clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'NO_OPEN_POSITION' };
    const prefix = candidate.client_order_id + '_';
    const protective = new Set(openOrders.filter(order => String(order.clientOrderId || '').startsWith(prefix)).map(order => String(order.clientOrderId)));
    const hasSl = protective.has(prefix + 'sl');
    const hasTp = protective.has(prefix + 'tp');
    return { clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: hasSl && hasTp ? 'HEALTHY' : hasSl || hasTp ? 'PROTECTION_INCOMPLETE' : 'ENTRY_FILLED_NO_PROTECTION', hasSl, hasTp };
  });
}
