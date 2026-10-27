import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatPlanReady, formatExecution, formatClose } from '../v2/scripts/telegram_format.js';

const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XAUUSDT'];

test('all Telegram event formatters use stable exact lines and fallback', () => {
  for (const symbol of pairs) {
    assert.equal(formatPlanReady({ symbol, setupId: 'S1', side: 'BUY', entry: '1', sl: '2', tp: '3' }), `JEV PLAN READY\nPair: ${symbol}\nSetup: S1\nSide: BUY\nEntry: 1\nSL: 2\nTP: 3\nStatus: APPROVED\nExecution: runner submitting to Binance`);
    assert.equal(formatExecution({ symbol, side: 'BUY', orderId: '7', price: '1.5', qty: '2' }), `JEV EXECUTION\nPair: ${symbol}\nSide: BUY\nOrderID: 7\nPrice: 1.5\nQty: 2\nStatus: FILLED`);
    assert.equal(formatClose({ symbol, reason: 'SL', orderId: '8', price: '1.4', qty: '2' }), `JEV CLOSE\nPair: ${symbol}\nReason: SL\nOrderID: 8\nPrice: 1.4\nQty: 2\nStatus: CLOSED`);
  }
  assert.equal(formatClose({}), 'JEV CLOSE\nPair: -\nReason: -\nOrderID: -\nPrice: -\nQty: -\nStatus: CLOSED');
});

test('server routes every producer through formatters and contains no old Telegram format', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.equal(source.includes('formatPlanReady('), true);
  assert.equal(source.includes('formatExecution('), true);
  assert.equal(source.includes('formatClose('), true);
  assert.equal(source.includes('<b>JEV EXECUTION</b>'), false);
  assert.equal(source.includes("'JEV CLOSE\\\\n"), false);
});
