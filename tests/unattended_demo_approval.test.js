import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoExecutionGate } from '../v2/scripts/demo_entry_executor.js';

test('unattended Demo authorization fails closed by default', () => {
  const permission = demoExecutionGate({
    botEnabled: true,
    ordersEnabled: true,
    protectiveOrdersReady: true,
    riskStatus: 'ALLOWED',
    demoExecutionEnabled: true,
    unattendedDemoExecutionEnabled: false,
    internalRunner: true
  });
  assert.deepEqual(permission, { allowed: false, reason: 'APPROVAL_REQUIRED' });
});

test('explicitly authorized unattended Demo mode passes gate without secrets', () => {
  const permission = demoExecutionGate({
    botEnabled: true,
    ordersEnabled: true,
    protectiveOrdersReady: true,
    riskStatus: 'ALLOWED',
    demoExecutionEnabled: true,
    unattendedDemoExecutionEnabled: true,
    internalRunner: true
  });
  assert.deepEqual(permission, { allowed: true, authorization: 'UNATTENDED_DEMO_AUTHORIZED' });
  assert.equal(JSON.stringify(permission).includes('secret'), false);
  assert.equal(JSON.stringify(permission).includes('apiKey'), false);
});

test('runner delegates approval to runtime gate instead of faking user approval', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /internalRunner: true, body: \{ clientOrderId: candidate\.client_order_id \}/);
  assert.match(source, /'APPROVAL_REQUIRED'/);
  assert.match(source, /unattendedDemoExecutionEnabled/);
});
