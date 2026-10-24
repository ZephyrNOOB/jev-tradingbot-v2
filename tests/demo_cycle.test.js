import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDemoDryRun } from '../v2/scripts/demo_cycle.js';
import { validateCandidateFreshness } from '../v2/scripts/candidate_freshness.js';

test('empty execution candidates produce explicit no-trade status', () => {
  const result = summarizeDemoDryRun({ execution_candidates: [], symbols: { BTCUSDT: { recent_events: [{ gate_rejection: 'context_rejected' }] } } });
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.executionMode, 'LIVE_DEMO');
  assert.equal(result.candidateCount, 0);
  assert.equal(result.readyCount, 0);
  assert.deepEqual(result.rejectionDiagnostics, [{ symbol: 'BTCUSDT', gate_rejection: 'context_rejected' }]);
});

test('dry-run summarizes candidates without treating them as fills', () => {
  const result = summarizeDemoDryRun({ execution_candidates: [
    { client_order_id: 'jev_1', symbol: 'BTCUSDT', status: 'APPROVED_FOR_EXECUTION', sizing: { status: 'SIZED' }, precisionValidation: 'VALID' },
    { client_order_id: 'jev_2', symbol: 'ETHUSDT', sizing: { status: 'REJECTED_BELOW_MIN_QTY' }, precisionValidation: 'REJECTED_BELOW_MIN_QTY' }
  ] });
  assert.equal(result.status, 'LIVE_DEMO');
  assert.equal(result.candidateCount, 2);
  assert.equal(result.readyCount, 1);
    assert.equal(result.filledCount, 0);
});
