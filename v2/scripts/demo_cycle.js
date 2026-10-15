export function summarizeDemoDryRun(artifact = {}) {
  const candidates = Array.isArray(artifact.execution_candidates) ? artifact.execution_candidates : [];
  const ready = candidates.filter(candidate => candidate.status === 'APPROVED_FOR_EXECUTION' || (candidate.sizing?.status === 'SIZED' && candidate.precisionValidation === 'VALID'));
  return { status: 'LIVE_DEMO', executionMode: 'READ_ONLY', candidateCount: candidates.length, readyCount: ready.length, filledCount: 0, ordersSent: null, withdrawalsSent: null, candidates: ready.map(candidate => ({ clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'READY_FOR_LIVE_DEMO_EXECUTION' })) };
}
