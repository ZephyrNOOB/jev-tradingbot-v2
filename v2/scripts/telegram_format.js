const field = value => value === undefined || value === null || value === '' ? '-' : String(value);

export function formatPlanReady({ symbol, setupId, side, entry, sl, tp } = {}) {
  return `JEV PLAN READY\nPair: ${field(symbol)}\nSetup: ${field(setupId)}\nSide: ${field(side)}\nEntry: ${field(entry)}\nSL: ${field(sl)}\nTP: ${field(tp)}\nStatus: APPROVED\nExecution: runner submitting to Binance`;
}

export function formatExecution({ symbol, side, orderId, price, qty } = {}) {
  return `JEV EXECUTION\nPair: ${field(symbol)}\nSide: ${field(side)}\nOrderID: ${field(orderId)}\nPrice: ${field(price)}\nQty: ${field(qty)}\nStatus: FILLED`;
}

export function formatClose({ symbol, reason, orderId, price, qty } = {}) {
  return `JEV CLOSE\nPair: ${field(symbol)}\nReason: ${field(reason)}\nOrderID: ${field(orderId)}\nPrice: ${field(price)}\nQty: ${field(qty)}\nStatus: CLOSED`;
}
