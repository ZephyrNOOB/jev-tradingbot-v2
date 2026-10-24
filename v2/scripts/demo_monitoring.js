export function readinessBlockers(monitoring = []) {
  const blockers = [];
  if (monitoring.some(item => ['ENTRY_FILLED_NO_PROTECTION', 'PROTECTION_INCOMPLETE'].includes(item.status))) blockers.push('PROTECTIVE_ORDER_VERIFICATION_REQUIRED', 'POSITION_MONITORING_REQUIRED');
  if (monitoring.some(item => item.status === 'ENTRY_PENDING_FILL')) blockers.push('ENTRY_PENDING_FILL');
  if (monitoring.some(item => item.status === 'BLOCKED_MISSING_PROVENANCE')) blockers.push('BLOCKED_MISSING_PROVENANCE');
  return [...new Set(blockers)];
}

export function monitorProtectionState(candidates = [], openOrders = [], positions = []) {
  return candidates.map(candidate => {
    const position = positions.find(item => item.symbol === candidate.symbol && Number(item.positionAmt) !== 0);
    const entry = openOrders.find(item => item.symbol === candidate.symbol && String(item.clientOrderId || '') === candidate.client_order_id);
    if (!position && entry && ['NEW', 'PARTIALLY_FILLED'].includes(String(entry.status || ''))) return { clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'ENTRY_PENDING_FILL', entryStatus: entry.status, orderId: String(entry.orderId || '') };
    if (!position) return { clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'NO_OPEN_POSITION' };
    const prefix = candidate.client_order_id + '_';
    const protective = new Set(openOrders.filter(order => String(order.clientOrderId || '').startsWith(prefix)).map(order => String(order.clientOrderId)));
    const hasSl = protective.has(prefix + 'sl');
    const hasTp = protective.has(prefix + 'tp');
    return { clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: hasSl && hasTp ? 'HEALTHY' : hasSl || hasTp ? 'PROTECTION_INCOMPLETE' : 'ENTRY_FILLED_NO_PROTECTION', hasSl, hasTp };
  });
}
