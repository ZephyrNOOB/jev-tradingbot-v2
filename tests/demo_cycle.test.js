import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDemoDryRun } from '../v2/scripts/demo_cycle.js';
import { validateCandidateFreshness } from '../v2/scripts/candidate_freshness.js';

test('dry-run summarizes candidates without treating them as fills', () => {
  const result = summarizeDemoDryRun({ execution_candidates: [
    { client_order_id: 'jev_1', symbol: 'BTCUSDT', sizing: { status: 'SIZED' }, precisionValidation: 'VALID' },
    { client_order_id: 'jev_2', symbol: 'ETHUSDT', sizing: { status: 'REJECTED_BELOW_MIN_QTY' }, precisionValidation: 'REJECTED_BELOW_MIN_QTY' }
  ] });
  assert.equal(result.status, 'PAPER_ONLY');
  assert.equal(result.candidateCount, 2);
  assert.equal(result.readyCount, 1);
    assert.equal(result.filledCount, 0);
});
