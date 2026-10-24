export function restorePendingLifecycle(lifecycle, order) {
  if (!lifecycle || !order || lifecycle.entry_status === 'FILLED') return null;
  let candidate;
  try { candidate = JSON.parse(lifecycle.candidate_json || '{}'); } catch { return null; }
  const sameIdentity = lifecycle.client_order_id === order.clientOrderId && candidate.client_order_id === order.clientOrderId;
  const sameSymbol = candidate.symbol === order.symbol && lifecycle.symbol === order.symbol;
  const sameSide = String(candidate.side || '').toUpperCase() === String(order.side || '').toUpperCase();
  const samePrice = Math.abs(Number(candidate.entry) - Number(order.price)) < 1e-8;
  return sameIdentity && sameSymbol && sameSide && samePrice && ['NEW', 'PARTIALLY_FILLED'].includes(order.status)
    ? { position_status: 'OPEN', close_reason: null, completed_at: null }
    : null;
}
