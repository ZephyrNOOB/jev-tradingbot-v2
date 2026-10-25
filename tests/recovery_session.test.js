import test from 'node:test';
import assert from 'node:assert/strict';
import { findActiveSessionId } from '../v2/scripts/recovery_session.js';

test('recovery resolves any active session for user-scoped BOT state', () => {
  const sessions = new Map([['sid-42a', 42], ['sid-42b', 42], ['sid-7', 7]]);
  const botStates = new Map([[42, true], [7, false]]);
  assert.equal(findActiveSessionId(sessions, botStates, 42), 'sid-42a');
  assert.equal(findActiveSessionId(sessions, botStates, 7), null);
  assert.notEqual(findActiveSessionId(sessions, botStates, 42), '42');
});

test('session login does not reset existing user-scoped BOT state', () => {
  const sessions = new Map([['sid-42', 42]]);
  const botStates = new Map([[42, true]]);
  assert.equal(findActiveSessionId(sessions, botStates, 42), 'sid-42');
});
