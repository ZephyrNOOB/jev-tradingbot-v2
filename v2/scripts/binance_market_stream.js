const BASE = 'wss://demo-fstream.binance.com/stream?streams=';
const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'xauusdt'];
let socket = null;
let reconnectTimer = null;
let closedByApp = false;
const prices = new Map();
let state = { connected: false, error: null, updatedAt: null };

function connect() {
  if (closedByApp || socket) return;
  try {
    socket = new WebSocket(BASE + SYMBOLS.map(symbol => `${symbol}@markPrice@3s`).join('/'));
    socket.addEventListener('open', () => { state = { ...state, connected: true, error: null }; });
    socket.addEventListener('message', event => {
      try {
        const payload = JSON.parse(event.data);
        const data = payload.data || payload;
        if (!data.s || data.p == null) return;
        prices.set(data.s, Number(data.p));
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
    state = { connected: false, error: error.message, updatedAt: state.updatedAt };
    socket = null;
    reconnectTimer = setTimeout(connect, 5_000);
  }
}

export function startBinanceMarketStream() { closedByApp = false; connect(); }
export function stopBinanceMarketStream() { closedByApp = true; clearTimeout(reconnectTimer); reconnectTimer = null; socket?.close(); socket = null; }
export function getBinanceStreamPrices() { return Object.fromEntries(prices); }
export function getBinanceStreamState() { return { ...state, symbols: prices.size }; }
