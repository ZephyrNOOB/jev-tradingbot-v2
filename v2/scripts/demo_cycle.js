export function summarizeDemoDryRun(artifact = {}) {
  const candidates = Array.isArray(artifact.execution_candidates) ? artifact.execution_candidates : [];
  const ready = candidates.filter(candidate => candidate.sizing?.status === 'SIZED' && candidate.precisionValidation === 'VALID' && candidate.riskGuard?.status === 'ALLOWED');
  return { status: 'DRY_RUN', candidateCount: candidates.length, readyCount: ready.length, filledCount: 0, ordersSent: false, withdrawalsSent: false, candidates: ready.map(candidate => ({ clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'READY_DRY_RUN' })) };
}
