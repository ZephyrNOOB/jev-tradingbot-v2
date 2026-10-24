import test from 'node:test';
import assert from 'node:assert/strict';
import { restorePendingLifecycle } from '../v2/scripts/pending_lifecycle_recovery.js';

test('restores exact XAU pending lifecycle without treating NEW as manual close', () => {
  const lifecycle = {
    symbol: 'XAUUSDT',
    client_order_id: 'jev_xau_1',
    entry_order_id: '608942647',
    entry_status: 'NEW',
    position_status: 'CLOSED',
    close_reason: 'MANUAL',
    completed_at: 123,
    candidate_json: JSON.stringify({ symbol: 'XAUUSDT', client_order_id: 'jev_xau_1', side: 'SELL', entry: 4015.46 })
  };
  const order = { symbol: 'XAUUSDT', clientOrderId: 'jev_xau_1', side: 'SELL', price: '4015.46', status: 'NEW' };
  assert.deepEqual(restorePendingLifecycle(lifecycle, order), {
    position_status: 'OPEN', close_reason: null, completed_at: null
  });
});

test('rejects same client ID when exchange side or price differs', () => {
  const lifecycle = { symbol: 'XAUUSDT', client_order_id: 'jev_xau_1', entry_status: 'NEW', position_status: 'CLOSED', candidate_json: JSON.stringify({ symbol: 'XAUUSDT', client_order_id: 'jev_xau_1', side: 'SELL', entry: 4015.46 }) };
  assert.equal(restorePendingLifecycle(lifecycle, { symbol: 'XAUUSDT', clientOrderId: 'jev_xau_1', side: 'BUY', price: '4015.46', status: 'NEW' }), null);
  assert.equal(restorePendingLifecycle(lifecycle, { symbol: 'XAUUSDT', clientOrderId: 'jev_xau_1', side: 'SELL', price: '4016.46', status: 'NEW' }), null);
});
