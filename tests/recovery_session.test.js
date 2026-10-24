import test from 'node:test';
import assert from 'node:assert/strict';
import { findActiveSessionId } from '../v2/scripts/recovery_session.js';

test('recovery uses active session ID, not user ID, for bot state lookup', () => {
  const sessions = new Map([['sid-42', 42], ['sid-7', 7]]);
  const botStates = new Map([['sid-42', true], ['sid-7', false]]);
  assert.equal(findActiveSessionId(sessions, botStates, 42), 'sid-42');
  assert.equal(findActiveSessionId(sessions, botStates, 7), null);
  assert.notEqual(findActiveSessionId(sessions, botStates, 42), '42');
});
