import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('FILLED User Stream requires exact client-order or lifecycle provenance', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('function recordExchangeOrderUpdate'), source.indexOf('let marketCandleUnsubscribe'));
  assert.doesNotMatch(update, /active_plan_by_symbol/);
  assert.doesNotMatch(update, /: \{ symbol: order\.s, client_order_id: clientOrderId/);
  assert.match(update, /if \(!candidateProvenance\) return 'BLOCKED_MISSING_PROVENANCE'/);
  assert.match(update, /lifecycle\?\.candidate_json/);
});
