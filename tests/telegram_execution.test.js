import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExecutionEvent, closeReasonFromClientOrderId } from '../v2/scripts/telegram_execution.js';

test('only entry FILLED update emits EXECUTION', () => {
  assert.equal(classifyExecutionEvent({ e: 'ORDER_TRADE_UPDATE', o: { X: 'FILLED', i: 7, c: 'jev_entry' } }), 'ENTRY_FILLED');
  assert.equal(classifyExecutionEvent({ e: 'ORDER_TRADE_UPDATE', o: { X: 'FILLED', i: 8, c: 'jev_entry_sl' } }), 'CLOSE_FILLED');
  assert.equal(classifyExecutionEvent({ e: 'ORDER_TRADE_UPDATE', o: { X: 'NEW', i: 9, c: 'jev_entry' } }), null);
});

test('close reason comes only from exchange close order suffix', () => {
  assert.equal(closeReasonFromClientOrderId('jev_entry_sl'), 'SL');
  assert.equal(closeReasonFromClientOrderId('jev_entry_tp'), 'TP');
  assert.equal(closeReasonFromClientOrderId('jev_entry_ec'), 'EMERGENCY');
  assert.equal(closeReasonFromClientOrderId('jev_entry'), null);
});

test('manual close requires confirmed flat position', () => {
  assert.equal(classifyExecutionEvent({ e: 'POSITION_RECONCILIATION', positionAmt: '0' }), 'MANUAL_CLOSE');
  assert.equal(classifyExecutionEvent({ e: 'POSITION_RECONCILIATION', positionAmt: '0.1' }), null);
});
