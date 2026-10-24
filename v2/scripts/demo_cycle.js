export function summarizeDemoDryRun(artifact = {}) {
  const candidates = Array.isArray(artifact.execution_candidates) ? artifact.execution_candidates : [];
  const ready = candidates.filter(candidate => candidate.status === 'APPROVED_FOR_EXECUTION' && candidate.sizing?.status === 'SIZED' && candidate.precisionValidation === 'VALID');
  const rejectionDiagnostics = Object.entries(artifact.symbols || {}).flatMap(([symbol, data]) => (data.recent_events || []).filter(row => row.gate_rejection).map(row => ({ symbol, gate_rejection: row.gate_rejection })));
  return { status: candidates.length ? 'LIVE_DEMO' : 'NO_TRADE', executionMode: 'LIVE_DEMO', candidateCount: candidates.length, readyCount: ready.length, filledCount: 0, ordersSent: null, withdrawalsSent: null, rejectionDiagnostics, candidates: ready.map(candidate => ({ clientOrderId: candidate.client_order_id, symbol: candidate.symbol, status: 'READY_FOR_LIVE_DEMO_EXECUTION' })) };
}
