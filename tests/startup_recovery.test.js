import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStartupRecoveryRows, runStartupRecovery } from '../v2/scripts/startup_recovery.js';

test('startup recovery selects only OPEN FILLED lifecycles with provenance', () => {
  const selected = selectStartupRecoveryRows([
    { client_order_id: 'open-filled', entry_status: 'FILLED', position_status: 'OPEN', candidate_json: '{}' },
    { client_order_id: 'open-new', entry_status: 'NEW', position_status: 'OPEN', candidate_json: '{}' },
    { client_order_id: 'closed-filled', entry_status: 'FILLED', position_status: 'CLOSED', candidate_json: '{}' },
    { client_order_id: 'open-filled-no-provenance', entry_status: 'FILLED', position_status: 'OPEN', candidate_json: null }
  ]);
  assert.deepEqual(selected.map(row => row.client_order_id), ['open-filled']);
});

test('startup recovery does not require bot toggle', async () => {
  const recovered = [];
  await runStartupRecovery([{ user_id: 7, client_order_id: 'open-filled', entry_status: 'FILLED', position_status: 'OPEN', candidate_json: '{}' }], async (userId, row) => recovered.push([userId, row.client_order_id]));
  assert.deepEqual(recovered, [[7, 'open-filled']]);
});
