const BASE = 'wss://demo-fstream.binance.com/stream?streams=';
const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'xauusdt'];
const INTERVALS = ['5m', '15m', '1h'];
let socket = null;
let reconnectTimer = null;
let closedByApp = false;
const prices = new Map();
const candles = new Map();
const closeListeners = new Set();
const closedKeys = new Set();
let state = { connected: false, error: null, updatedAt: null, closedCandles: 0 };

function connect() {
  if (closedByApp || socket) return;
  try {
    socket = new WebSocket(BASE + [...SYMBOLS.map(symbol => `${symbol}@markPrice@3s`), ...SYMBOLS.flatMap(symbol => INTERVALS.map(interval => `${symbol}@kline_${interval}`))].join('/'));
    socket.addEventListener('open', () => { state = { ...state, connected: true, error: null }; });
    socket.addEventListener('message', event => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        if (data.s && data.p != null) prices.set(data.s, Number(data.p));
        if (data.e === 'kline' && data.k) {
          const k = data.k;
          const key = `${k.s}:${k.i}`;
          candles.set(key, { symbol: k.s, interval: k.i, openTime: Number(k.t), closeTime: Number(k.T), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v), closed: Boolean(k.x), updatedAt: Date.now() });
          if (closedKeys.size > 1000) closedKeys.clear();
          if (k.x && !closedKeys.has(`${key}:${k.t}`)) {
            closedKeys.add(`${key}:${k.t}`);
            state.closedCandles += 1;
            for (const listener of closeListeners) {
              try { listener(candles.get(key)); } catch (error) { state.error = `closed_candle_listener_failed:${error.message}`; }
            }
          }
        }
        if (!data.s && data.e !== 'kline') return;
        state.updatedAt = Date.now();
      } catch (error) { state.error = error.message; }
    });
    socket.addEventListener('error', () => { state.error = 'market_stream_error'; });
    socket.addEventListener('close', () => {
      socket = null;
      state.connected = false;
      if (!closedByApp) reconnectTimer = setTimeout(connect, 5_000);
    });
  } catch (error) {
    state = { connected: false, error: error.message, updatedAt: state.updatedAt, closedCandles: state.closedCandles };
    socket = null;
    reconnectTimer = setTimeout(connect, 5_000);
  }
}

export function startBinanceMarketStream() { closedByApp = false; connect(); }
export function stopBinanceMarketStream() { closedByApp = true; clearTimeout(reconnectTimer); reconnectTimer = null; socket?.close(); socket = null; }
export function getBinanceStreamPrices() { return Object.fromEntries(prices); }
export function getBinanceStreamCandles() { return Object.fromEntries(candles); }
export function onClosedCandle(listener) { if (typeof listener !== 'function') throw new TypeError('closed candle listener must be a function'); closeListeners.add(listener); return () => closeListeners.delete(listener); }
export function getBinanceStreamState() { return { ...state, symbols: prices.size, candleKeys: candles.size }; }
