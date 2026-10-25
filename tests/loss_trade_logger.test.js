import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendLossTrade } from '../v2/scripts/loss_trade_logger.js';

test('records each losing closed trade once in JSONL file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-loss-'));
  const file = path.join(dir, 'losses.jsonl');
  const trade = {
    userId: 21,
    symbol: 'BTCUSDT',
    entryOrderId: 'entry-1',
    exitOrderId: 'exit-1',
    closeReason: 'SL',
    realizedPnl: -3.5,
    lossCause: 'STOP_LOSS_TRIGGERED',
    lossExplanation: 'SL triggered at exchange because price reached SetupBot SL.',
    setupId: 'fvg_context',
    structureEventId: 'FVG-SHORT-1',
    entryTime: 1792939902992,
    exitTime: 1792939962042
  };

  assert.equal(appendLossTrade(file, trade), true);
  assert.equal(appendLossTrade(file, trade), false);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assert.deepEqual(saved, { ...trade, entryDate: '2026-10-25', entryDateTime: '2026-10-25T14:51:42.992Z', exitDate: '2026-10-25', exitDateTime: '2026-10-25T14:52:42.042Z', tradeDate: '2026-10-25' });
});
