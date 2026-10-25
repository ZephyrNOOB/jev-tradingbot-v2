import fs from 'node:fs';
import path from 'node:path';

function dateParts(timestamp) {
  const date = Number(timestamp) > 0 ? new Date(Number(timestamp)) : null;
  return date && !Number.isNaN(date.getTime())
    ? { iso: date.toISOString(), date: date.toISOString().slice(0, 10) }
    : { iso: null, date: null };
}

export function appendLossTrade(file, trade) {
  if (!trade || Number(trade.realizedPnl) >= 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entryTime = dateParts(trade.entryTime);
  const exitTime = dateParts(trade.exitTime);
  const immutableTrade = {
    ...trade,
    entryDate: entryTime.date,
    entryDateTime: entryTime.iso,
    exitDate: exitTime.date,
    exitDateTime: exitTime.iso,
    tradeDate: exitTime.date || entryTime.date
  };
  const key = [immutableTrade.userId, immutableTrade.entryOrderId, immutableTrade.exitOrderId, immutableTrade.closeReason].join('|');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  if (existing.some(line => {
    try {
      const item = JSON.parse(line);
      return [item.userId, item.entryOrderId, item.exitOrderId, item.closeReason].join('|') === key || (item.tradeId && item.tradeId === immutableTrade.tradeId);
    } catch { return false; }
  })) return false;
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, JSON.stringify(immutableTrade) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return true;
}
