export const CANDIDATE_FRESHNESS = 15 * 60 * 1000;

export function validateCandidateFreshness(artifact, candidate, now = Date.now()) {
  if (!artifact || !Number.isFinite(Number(artifact.server_time))) return { ok: false, reason: 'ARTIFACT_TIME_MISSING' };
  const age = now - Number(artifact.server_time);
  if (age < 0 || age > CANDIDATE_FRESHNESS) return { ok: false, reason: 'ARTIFACT_STALE' };
  if (artifact.status !== 'PASS') return { ok: false, reason: 'PIPELINE_NOT_PASS' };
  if (candidate?.status !== 'APPROVED_FOR_EXECUTION') return { ok: false, reason: 'CANDIDATE_NOT_APPROVED' };
  if (!candidate?.structure_event_id) return { ok: false, reason: 'NO_ACTIVE_STRUCTURE' };
  const latestConfirmed = artifact.latest_confirmed_structure_event_ids?.[candidate.symbol];
  if (!latestConfirmed) return { ok: false, reason: 'NO_LATEST_CONFIRMED_STRUCTURE' };
  if (latestConfirmed !== candidate.structure_event_id) return { ok: false, reason: 'STRUCTURE_EVENT_REPLACED' };
  return { ok: true, ageMs: age };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  const artifact = { status: 'PASS', server_time: 1000, latest_structure_event_ids: { BTCUSDT: 'e2' }, latest_confirmed_structure_event_ids: { BTCUSDT: 'e2' } };
  const candidate = { symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', structure_event_id: 'e2' };
  if (!validateCandidateFreshness(artifact, candidate, 2000).ok) throw new Error('freshness self-check failed');
}
