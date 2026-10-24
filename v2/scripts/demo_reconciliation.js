import { readinessBlockers } from './demo_monitoring.js';

export function reconcileDemoState(candidates = [], openOrders = [], positions = [], monitoring = []) {
  const blockers = readinessBlockers(monitoring);
  const candidateIds = new Set(candidates.map(x => x.client_order_id).filter(Boolean));
  const managedOrders = openOrders.filter(order => candidateIds.has(order.clientOrderId) || candidateIds.has(String(order.clientOrderId || '').replace(/_(?:sl|tp)$/, '')));
  const unmanagedOrders = openOrders.filter(order => !managedOrders.includes(order)).map(order => ({ orderId: String(order.orderId || ''), clientOrderId: order.clientOrderId || null, symbol: order.symbol, status: 'UNMANAGED_ORDER', action: 'BLOCKED_REQUIRES_PROVENANCE_OR_CANCEL_REVIEW' }));
  const managedPositionSymbols = new Set(candidates.filter(candidate => openOrders.some(order => order.clientOrderId === candidate.client_order_id) || positions.some(position => position.symbol === candidate.symbol && Number(position.positionAmt) !== 0)).map(candidate => candidate.symbol));
  const unmanagedPositions = positions.filter(position => Number(position.positionAmt) !== 0 && !managedPositionSymbols.has(position.symbol)).map(position => ({ symbol: position.symbol, positionAmt: String(position.positionAmt), status: 'UNMANAGED_POSITION', action: 'BLOCKED_REQUIRES_LINK_OR_CONTAINMENT' }));
  const pendingCandidates = candidates.filter(candidate => !openOrders.some(order => order.clientOrderId === candidate.client_order_id) && !positions.some(position => position.symbol === candidate.symbol && Number(position.positionAmt) !== 0)).map(candidate => ({ clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'NOT_ON_EXCHANGE' }));
  const pairExposure = [
    ...unmanagedPositions,
    ...unmanagedOrders,
    ...managedOrders.filter(order => ['NEW', 'PARTIALLY_FILLED'].includes(String(order.status || ''))).map(order => ({ symbol: order.symbol, status: 'MANAGED_PENDING_ORDER', orderId: String(order.orderId || ''), clientOrderId: order.clientOrderId || null, action: 'MONITOR_PENDING_FILL' }))
  ];
  return { status: blockers.length || unmanagedOrders.length || unmanagedPositions.length ? 'REVIEW_REQUIRED' : 'RECONCILED', blockers, managedOrders, unmanagedOrders, unmanagedPositions, pendingCandidates, pairExposure };
}
