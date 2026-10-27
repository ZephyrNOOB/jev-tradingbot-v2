import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('SL/TP FILLED notification skips EXECUTION and sends CLOSE only', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const notify = source.slice(source.indexOf('function notifyTelegramExecution'), source.indexOf('async function protectFilledEvent'));
  assert.match(notify, /const closeReason = closeReasonFromClientOrderId\(order\.c\);/);
  assert.match(notify, /if \(closeReason\) \{[\s\S]*?formatClose\(/);
  assert.doesNotMatch(notify, /if \(!closeReason\)[\s\S]*?JEV EXECUTION/);
  assert.doesNotMatch(notify, /JEV CLOSE/);
  assert.match(notify, /formatExecution\(/);
});

test('emergency-close FILLED persists terminal close and sends one EMERGENCY CLOSE notification', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const update = source.slice(source.indexOf('function recordExchangeOrderUpdate'), source.indexOf('let marketCandleUnsubscribe'));
  assert.match(update, /_ec/);
  assert.match(update, /position_status=\\'CLOSED\\'/);
  assert.match(update, /close_reason/);
  const notify = source.slice(source.indexOf('function notifyTelegramExecution'), source.indexOf('async function protectFilledEvent'));
  assert.match(notify, /formatClose\(\{ symbol: order\.s, reason: closeReason/);
  assert.match(notify, /CLOSE:' \+ order\.s \+ ':' \+ order\.i \+ ':' \+ closeReason/);
});

test('manual reconciliation close uses verified exchange fill fields', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const reconcile = source.slice(source.indexOf('function reconcileManualClosedLifecycles'), source.indexOf('function assertCurrentActivePlan'));
  assert.match(reconcile, /const exchangeClose = closeQty \+ 1e-12 >= entryQty \? closeTrades\[closeTrades\.length - 1\] : null/);
  assert.match(reconcile, /formatClose\(\{ symbol: lifecycle\.symbol, reason: 'MANUAL', orderId: exchangeClose\.orderId, price: exchangeClose\.price, qty: exchangeClose\.qty \}\)/);
});
