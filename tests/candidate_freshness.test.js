import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidateFreshness } from '../v2/scripts/candidate_freshness.js';

test('fresh approved candidate passes freshness and structure gates', () => {
  const artifact = { status: 'PASS', server_time: 1000, latest_structure_event_ids: { BTCUSDT: 'e2' } };
  const candidate = { symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', structure_event_id: 'e2' };
  assert.equal(validateCandidateFreshness(artifact, candidate, 2000).ok, true);
});

test('new unrelated structure event does not invalidate approved candidate', () => {
  const artifact = { status: 'PASS', server_time: 1000, latest_structure_event_ids: { BTCUSDT: 'e3' } };
  const candidate = { symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', structure_event_id: 'e2' };
  assert.equal(validateCandidateFreshness(artifact, candidate, 2000).ok, true);
});

test('old artifact is blocked', () => {
  const artifact = { status: 'PASS', server_time: 1000, latest_structure_event_ids: { BTCUSDT: 'e2' } };
  const candidate = { symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', structure_event_id: 'e2' };
  assert.equal(validateCandidateFreshness(artifact, candidate, 901001).reason, 'ARTIFACT_STALE');
});
