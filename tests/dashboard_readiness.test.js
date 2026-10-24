import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8');

test('dashboard renders pipeline, exchange readiness, reconciliation, and pair blockers separately', () => {
  for (const text of ['PIPELINE', 'EXCHANGE READINESS', 'RECONCILIATION', 'readinessPairs', '/binance-demo/live-readiness', '/binance-demo/reconciliation']) {
    assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
  assert.match(html, /setInterval\(refreshReadiness, 30_000\)/);
  assert.match(html, /function refreshV2\(\)/);
});

test('readiness panel does not add execution mutations', () => {
  const section = html.slice(html.indexOf('function readinessStatus'), html.indexOf('async function init'));
  assert.doesNotMatch(section, /toggleBot|\/bot\/toggle|method:\s*['"]POST/);
});
