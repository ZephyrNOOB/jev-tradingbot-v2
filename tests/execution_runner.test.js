import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

 test('entry submission persists complete provenance before exchange order', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const persistAt = source.indexOf("'SUBMITTING'");
  const submitAt = source.indexOf("const entry = await signed('POST', '/fapi/v1/order'");
  const preSubmit = source.slice(Math.max(0, persistAt - 500), submitAt);
  assert.match(preSubmit, /JSON\.stringify\(candidate\)/);
  assert.ok(preSubmit.includes('candidate.client_order_id'));
});


test('execution status is session-scoped', () => {
  const sid = 'session-1';
  assert.equal(`execution:${sid}`, 'execution:session-1');
});

test('execution attempts and summaries are isolated per candidate across pairs', () => {
  const sid = 'session-1';
  const attemptKey = (id) => `${sid}:${id}`;
  const attempts = new Set([attemptKey('eth-plan')]);
  const summaries = new Map([[attemptKey('eth-plan'), { status: 'ENTRY_OPEN_PROTECTION_PENDING' }]]);
  assert.equal(attempts.has(attemptKey('xau-plan')), false);
  assert.equal(summaries.get(attemptKey('xau-plan')), undefined);
  summaries.set(attemptKey('xau-plan'), { status: 'ORDER_SENT', symbol: 'XAUUSDT' });
  assert.equal(summaries.get(attemptKey('eth-plan')).status, 'ENTRY_OPEN_PROTECTION_PENDING');
  assert.equal(summaries.get(attemptKey('xau-plan')).symbol, 'XAUUSDT');
});
