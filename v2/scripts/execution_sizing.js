const decimalPlaces = value => {
  const text = String(value);
  return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1] || '').length;
};
const roundDown = (value, step) => {
  const places = decimalPlaces(step);
  return Number((Math.floor(Number(value) / Number(step) + 1e-9) * Number(step)).toFixed(places));
};
const filter = (filters, type) => (filters?.filters || []).find(item => item.filterType === type) || {};

export function sizeCandidate(candidate, settings, balance, symbolFilters) {
  const entry = Number(candidate.entry);
  const available = Number(balance?.availableBalance);
  const tradeAmount = Number(settings?.tradeAmountUsdt);
  const lot = filter(symbolFilters, 'LOT_SIZE');
  const priceFilter = filter(symbolFilters, 'PRICE_FILTER');
  const notionalFilter = filter(symbolFilters, 'NOTIONAL').minNotional
    ? filter(symbolFilters, 'NOTIONAL') : filter(symbolFilters, 'MIN_NOTIONAL');
  const stepText = String(lot.stepSize);
  const tickText = String(priceFilter.tickSize);
  const step = Number(stepText);
  const minQty = Number(lot.minQty);
  const maxQty = Number(lot.maxQty || Infinity);
  const tick = Number(tickText);
  const minNotional = Number(notionalFilter.minNotional || notionalFilter.notional || 0);
  if (!Number.isFinite(entry) || !Number.isFinite(available) || !Number.isFinite(tradeAmount) || tradeAmount <= 0 || !Number.isFinite(step) || !Number.isFinite(minQty) || !Number.isFinite(tick) || entry <= 0 || available <= 0) {
    return { status: Number.isFinite(tradeAmount) && tradeAmount > 0 ? 'REJECTED_INVALID_INPUT' : 'TRADE_AMOUNT_NOT_CONFIGURED' };
  }
  if (tradeAmount > available) return { status: 'TRADE_AMOUNT_EXCEEDS_AVAILABLE_BALANCE', tradeAmount: tradeAmount.toFixed(8), availableBalance: available.toFixed(8) };
  const price = roundDown(entry, tick);
  const places = decimalPlaces(stepText);
  const pricePlaces = decimalPlaces(tickText);
  let quantity = roundDown(tradeAmount / price, step);
  if (minNotional > 0 && quantity * price < minNotional) quantity = Math.ceil((minNotional / price) / step - Number.EPSILON) * step;
  quantity = Number(quantity.toFixed(places));
  const notional = quantity * price;
  if (quantity < minQty) return { status: 'REJECTED_BELOW_MIN_QTY', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces) };
  if (quantity > maxQty) return { status: 'REJECTED_ABOVE_MAX_QTY', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces) };
  if (minNotional > 0 && notional < minNotional) return { status: 'REJECTED_BELOW_MIN_NOTIONAL', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces), notional: notional.toFixed(8), minNotional };
  return { status: 'SIZED', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces), notional: notional.toFixed(8), tradeAmountUsdt: tradeAmount.toFixed(8) };
}

export function normalizeCandidatePrices(candidate, symbolFilters) {
  const tickText = String(filter(symbolFilters, 'PRICE_FILTER').tickSize);
  const tick = Number(tickText);
  const places = decimalPlaces(tickText);
  const round = value => Number((Math.floor(Number(value) / tick + 1e-9) * tick).toFixed(places));
  return { ...candidate, entry: round(candidate.entry), sl: round(candidate.sl), tp: round(candidate.tp) };
}

export function validateCandidatePrecision(candidate, sizing, symbolFilters) {
  if (sizing.status !== 'SIZED') return sizing.status;
  const tick = Number(filter(symbolFilters, 'PRICE_FILTER').tickSize);
  const aligned = value => Number.isFinite(Number(value)) && Math.abs(Number(value) / tick - Math.round(Number(value) / tick)) < 1e-8;
  if (Number(candidate.entry) !== Number(sizing.price)) return 'REJECTED_ENTRY_TICK';
  if (![candidate.entry, candidate.sl, candidate.tp].every(aligned)) return 'REJECTED_PRICE_TICK';
  if (!['BUY', 'SELL'].includes(candidate.side)) return 'REJECTED_INVALID_CANDIDATE';
  return 'VALID';
}