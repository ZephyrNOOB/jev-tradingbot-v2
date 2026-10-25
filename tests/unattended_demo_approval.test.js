import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoExecutionGate } from '../v2/scripts/demo_entry_executor.js';

test('BOT ON allows internal Demo runner after candidate gates pass', () => {
  const permission = demoExecutionGate({
    botEnabled: true,
    ordersEnabled: true,
    protectiveOrdersReady: true,
    riskStatus: 'ALLOWED',
    demoExecutionEnabled: true,
    internalRunner: true
  });
  assert.deepEqual(permission, { allowed: true, authorization: 'BOT_ENABLED' });
});

test('direct Demo execution still requires explicit approval', () => {
  const permission = demoExecutionGate({
    botEnabled: true,
    ordersEnabled: true,
    protectiveOrdersReady: true,
    riskStatus: 'ALLOWED',
    demoExecutionEnabled: true,
    explicitApproval: false
  });
  assert.deepEqual(permission, { allowed: true, authorization: 'DIRECT_APPROVAL_PENDING' });
});

test('runner keeps per-pair candidate submission path', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /internalRunner: true, body: \{ clientOrderId: candidate\.client_order_id \}/);
  assert.doesNotMatch(source, /reason: 'APPROVAL_REQUIRED'/);
});
