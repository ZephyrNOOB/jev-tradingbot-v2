import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeCandidate } from '../v2/scripts/execution_sizing.js';

const filters = { filters: [
  { filterType: 'LOT_SIZE', minQty: '0.001', stepSize: '0.001' },
  { filterType: 'PRICE_FILTER', tickSize: '0.10' },
  { filterType: 'MIN_NOTIONAL', notional: '100' }
] };

test('sizes valid candidate and rounds Binance quantity and price', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 82898.28355 }, { riskPerTrade: 0.25, maxNotional: 200, leverage: 1 }, { availableBalance: 1000 }, filters);
  assert.equal(result.status, 'SIZED');
  assert.equal(result.quantity, '0.002');
  assert.equal(result.price, '82960.40');
});

test('rejects quantity below Binance minimum', () => {
  const result = sizeCandidate({ symbol: 'BTCUSDT', entry: 82960.45, sl: 80000 }, { riskPerTrade: 0.01, maxNotional: 200, leverage: 1 }, { availableBalance: 100 }, filters);
  assert.equal(result.status, 'REJECTED_BELOW_MIN_QTY');
});


