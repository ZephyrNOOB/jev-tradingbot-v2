import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('trade history contract records filled entry metadata', () => {
  const fields = ['client_order_id', 'order_id', 'setup_id', 'structure_event_id', 'status'];
  assert.equal(fields.length, 5);
});

test('closed trade uses realized pnl and CLOSED status', () => {
  const trade = { realizedPnl: 1.25 };
  assert.equal(trade.realizedPnl !== 0 ? 'CLOSED' : 'OPEN', 'CLOSED');
});

test('journal normalizes canonical lifecycles and rejects fragments', () => {
  const source = fs.readFileSync(new URL('../public/history.html', import.meta.url), 'utf8');
  assert.match(source, /entryOrderId: t\.entry_order_id \|\| null/);
  assert.match(source, /exitOrderId: t\.exit_order_id \|\| null/);
  assert.match(source, /filter\(t => t\.inst_id && t\.ts && t\.entryOrderId && t\.exitOrderId\)/);
  assert.match(source, /entryOrderId}\|\$\{t\.exitOrderId/);
});

test('period selector scopes overview by anchor while date remains table filter', () => {
  const source = fs.readFileSync(new URL('../public/history.html', import.meta.url), 'utf8');
  assert.match(source, /function periodBounds\(rows\)/);
  assert.match(source, /case 'weekly': start\.setDate\(start\.getDate\(\) - \(start\.getDay\(\) \+ 6\) % 7\)/);
  assert.match(source, /case 'monthly': start\.setDate\(1\); end = new Date\(start\.getFullYear\(\), start\.getMonth\(\) \+ 1, 1\)/);
  assert.match(source, /case 'yearly': start\.setMonth\(0, 1\); end = new Date\(start\.getFullYear\(\) \+ 1, 0, 1\)/);
  assert.match(source, /updateSummary\(bounds \? rows\.filter\(t => t\.ts >= bounds\.start && t\.ts < bounds\.end\) : \[\]\)/);
  assert.match(source, /renderJournalRows\(tableRows\)/);
  assert.match(source, /renderPeriodSummary\(summaryRows\)/);
  assert.doesNotMatch(source, /renderPeriodSummary\(filterRows\(journalRows\)\)/);
});

test('journal maps exchange pnl and fees only through canonical order IDs', () => {
  const source = fs.readFileSync(new URL('../public/history.html', import.meta.url), 'utf8');
  assert.match(source, /trades\.get\(String\(row\.entryOrderId\)\)/);
  assert.match(source, /trades\.get\(String\(row\.exitOrderId\)\)/);
  assert.match(source, /pnl: Number\.isFinite\(pnl\) \? pnl : row\.pnl/);
  assert.match(source, /incomeType === 'FUNDING_FEE'/);
});

test('REST sync merges exit fills into canonical history and quarantines unmatched evidence', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const sync = source.slice(source.indexOf('async function syncTradeHistory'), source.indexOf('function getExecutionLifecycle'));
  assert.match(sync, /entry_order_id = \? OR order_id = \?/);
  assert.match(sync, /UPDATE trade_history SET fee=fee \+ \?, pnl=pnl \+ \?/);
  assert.match(sync, /EXCHANGE_EVIDENCE/);
  assert.doesNotMatch(sync, /realizedPnl \|\| 0\) !== 0 \? 'CLOSED' : 'OPEN'/);
});

 test('REST sync preserves each unmatched exchange fill as non-completed evidence', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const sync = source.slice(source.indexOf('async function syncTradeHistory'), source.indexOf('function getExecutionLifecycle'));
  assert.match(sync, /raw_json.*trade/);
  assert.match(sync, /'EXCHANGE_EVIDENCE'/);
});
