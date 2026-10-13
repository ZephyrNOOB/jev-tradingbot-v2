import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidateFreshness } from '../v2/scripts/candidate_freshness.js';

test('stage 6 preflight requires approved fresh structure-current candidate', () => {
  const artifact = { status: 'PASS', server_time: 1000, latest_structure_event_ids: { BTCUSDT: 'current' } };
  const candidate = { symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', structure_event_id: 'current' };
  assert.equal(validateCandidateFreshness(artifact, candidate, 2000).ok, true);
  assert.equal(validateCandidateFreshness(artifact, { ...candidate, status: 'REJECTED_LOWER_STRUCTURE_RANK' }, 2000).reason, 'CANDIDATE_NOT_APPROVED');
});
