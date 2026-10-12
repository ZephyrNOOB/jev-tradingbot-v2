export function reconcileDemoState(candidates = [], openOrders = [], positions = []) {
  const candidateIds = new Set(candidates.map(x => x.client_order_id).filter(Boolean));
  const managedOrders = openOrders.filter(order => candidateIds.has(order.clientOrderId) || candidateIds.has(String(order.clientOrderId || '').replace(/_(?:sl|tp)$/, '')));
  const unmanagedOrders = openOrders.filter(order => !managedOrders.includes(order)).map(order => ({ orderId: String(order.orderId || ''), clientOrderId: order.clientOrderId || null, symbol: order.symbol, status: 'UNMANAGED_ORDER' }));
  const managedSymbols = new Set(candidates.map(x => x.symbol));
  const unmanagedPositions = positions.filter(position => Number(position.positionAmt) !== 0 && !managedSymbols.has(position.symbol)).map(position => ({ symbol: position.symbol, positionAmt: String(position.positionAmt), status: 'UNMANAGED_POSITION' }));
  const pendingCandidates = candidates.filter(candidate => !openOrders.some(order => order.clientOrderId === candidate.client_order_id) && !positions.some(position => position.symbol === candidate.symbol && Number(position.positionAmt) !== 0)).map(candidate => ({ clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'NOT_ON_EXCHANGE' }));
  return { status: unmanagedOrders.length || unmanagedPositions.length ? 'REVIEW_REQUIRED' : 'RECONCILED', managedOrders, unmanagedOrders, unmanagedPositions, pendingCandidates };
}
