const decimalPlaces = value => {
  const text = String(value);
  return text.includes('e-') ? Number(text.split('e-')[1]) : (text.split('.')[1] || '').length;
};
const roundDown = (value, step) => {
  const places = decimalPlaces(step);
  return Number((Math.floor((value + Number.EPSILON) / step) * step).toFixed(places));
};
const filter = (filters, type) => (filters?.filters || []).find(item => item.filterType === type) || {};

export function sizeCandidate(candidate, policy, balance, symbolFilters) {
  const entry = Number(candidate.entry);
  const stopDistance = Math.abs(entry - Number(candidate.sl));
  const available = Number(balance?.availableBalance);
  const risk = available * Number(policy.riskPerTrade) / 100;
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
  const maxExposure = Math.min(Number(policy.maxNotional), available * Number(policy.leverage));
  if (![entry, stopDistance, available, risk, step, minQty, tick].every(Number.isFinite) || stopDistance <= 0 || available <= 0) {
    return { status: 'REJECTED_INVALID_INPUT' };
  }
  const quantity = roundDown(Math.min(risk / stopDistance, maxExposure / entry), step);
  const price = roundDown(entry, tick);
  const notional = quantity * price;
  const places = decimalPlaces(stepText);
  const pricePlaces = decimalPlaces(tickText);
  if (quantity < minQty) return { status: 'REJECTED_BELOW_MIN_QTY', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces) };
  if (quantity > maxQty) return { status: 'REJECTED_ABOVE_MAX_QTY', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces) };
  if (minNotional > 0 && notional < minNotional) return { status: 'REJECTED_BELOW_MIN_NOTIONAL', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces), notional: notional.toFixed(8), minNotional };
  return { status: 'SIZED', quantity: quantity.toFixed(places), price: price.toFixed(pricePlaces), notional: notional.toFixed(8), riskCapital: risk.toFixed(8) };
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
  if (![candidate.entry, candidate.sl, candidate.tp].every(aligned)) return 'REJECTED_PRICE_TICK';
  if (Number(candidate.entry) !== Number(sizing.price)) return 'REJECTED_ENTRY_TICK';
  const long = candidate.side === 'BUY';
  if (!['BUY', 'SELL'].includes(candidate.side) || (long ? !(candidate.sl < candidate.entry && candidate.tp > candidate.entry) : !(candidate.sl > candidate.entry && candidate.tp < candidate.entry))) return 'REJECTED_PRICE_RELATION';
  return 'VALID';
}



