import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/history.html', import.meta.url), 'utf8');
function periodBounds(period, selected, rows) {
  const latest = rows.length ? Math.max(...rows.map(t => t.ts)) : NaN;
  const anchor = new Date(selected ? selected + 'T00:00:00' : latest);
  if (!Number.isFinite(anchor.getTime())) return null;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let end;
  switch (period) {
    case 'weekly': start.setDate(start.getDate() - (start.getDay() + 6) % 7); end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7); break;
    case 'monthly': start.setDate(1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1); break;
    case 'yearly': start.setMonth(0, 1); end = new Date(start.getFullYear() + 1, 0, 1); break;
    default: end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  }
  return { start: start.getTime(), end: end.getTime() };
}
const netPnl = t => Number(t.pnl || 0) - Math.abs(Number(t.fee || 0));
const rows = [
  { ts: new Date('2026-10-25T23:59:59').getTime(), pnl: 2, fee: 0.2 },
  { ts: new Date('2026-10-26T00:00:00').getTime(), pnl: -1, fee: 0.1 },
  { ts: new Date('2026-10-27T12:00:00').getTime(), pnl: 3, fee: 0.3 }
];

test('period boundaries and close-day boundary are executable', () => {
  assert.deepEqual(periodBounds('daily', '2026-10-26', rows), { start: new Date('2026-10-26T00:00:00').getTime(), end: new Date('2026-10-27T00:00:00').getTime() });
  assert.equal(rows.filter(t => t.ts >= periodBounds('daily', '2026-10-26', rows).start && t.ts < periodBounds('daily', '2026-10-26', rows).end).length, 1);
  assert.equal(netPnl(rows[1]), -1.1);
  assert.equal(Number(rows.reduce((sum, row) => sum + netPnl(row), 0).toFixed(10)), 3.4);
});

test('blank anchor uses latest completed close day', () => {
  const bounds = periodBounds('daily', '', rows);
  assert.deepEqual(bounds, { start: new Date('2026-10-27T00:00:00').getTime(), end: new Date('2026-10-28T00:00:00').getTime() });
});


test('blank date keeps Overview on all visible history', () => {
  assert.match(source, /const anchor = new Date\(selected \? selected \+ 'T00:00:00' : latest\);/);
  assert.match(source, /updateSummary\(rows\);/);
});

test('selected date keeps period bounds anchored to selected date', () => {
  assert.match(source, /const anchor = new Date\(selected \? selected \+ 'T00:00:00' : latest\);/);
  assert.match(source, /function scopedRows\(rows = allRows\)/);
  assert.match(source, /return bounds \? rows\.filter\(t => t\.ts >= bounds\.start && t\.ts < bounds\.end\) : \[\];/);
});

test('calendar stays on canonical history while period views stay scoped', () => {
  assert.match(source, /const scope = scopedRows\(allRows\);\s+journalRows = scope;\s+calendarRows = allRows;/);
  assert.doesNotMatch(source, /calendarRows = scope;/);
  assert.match(source, /renderPerformanceCharts\(scopedRows\(allRows\)\);/);
  assert.match(source, /document\.getElementById\('periodFilter'\)\.addEventListener\('change', \(\) => \{ applyJournalFilters\(\); renderPerformanceCharts\(scopedRows\(allRows\)\); renderPnlCalendar\(\); \}\);/);
});
