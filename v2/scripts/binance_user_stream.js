const REST_BASE = 'https://demo-fapi.binance.com';
const WS_BASE = 'wss://demo-fstream.binance.com/ws/';
const streams = new Map();

async function createListenKey(apiKey) {
  const response = await fetch(`${REST_BASE}/fapi/v1/listenKey`, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey, accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok || !data.listenKey) throw new Error(data?.msg || 'Binance user stream unavailable');
  return data.listenKey;
}

export async function startBinanceUserStream(id, apiKey, onEvent) {
  if (streams.has(id)) return streams.get(id).state;
  const item = { socket: null, listenKey: await createListenKey(apiKey), keepalive: null, reconnect: null, stopped: false, connecting: false, state: { connected: false, error: null, updatedAt: null } };
  const connect = async (renew = false) => {
    if (item.stopped || item.connecting) return;
    item.connecting = true;
    try {
      if (renew) item.listenKey = await createListenKey(apiKey);
      item.socket = new WebSocket(WS_BASE + item.listenKey);
    } catch (error) {
      item.state = { ...item.state, connected: false, error: error.message };
      item.reconnect = setTimeout(() => connect(true), 5_000);
      item.connecting = false;
      return;
    }
    item.connecting = false;
    item.socket.addEventListener('open', () => { item.state = { ...item.state, connected: true, error: null }; });
    item.socket.addEventListener('message', event => {
      try { item.state.updatedAt = Date.now(); onEvent(JSON.parse(event.data)); }
      catch (error) { item.state.error = error.message; }
    });
    item.socket.addEventListener('error', () => { item.state.error = 'user_stream_error'; });
    item.socket.addEventListener('close', () => {
      item.state.connected = false;
      if (!item.stopped && !item.reconnect) item.reconnect = setTimeout(() => { item.reconnect = null; connect(true); }, 5_000);
    });
  };
  item.keepalive = setInterval(async () => {
    try {
      const response = await fetch(`${REST_BASE}/fapi/v1/listenKey?listenKey=${encodeURIComponent(item.listenKey)}`, { method: 'PUT', headers: { 'X-MBX-APIKEY': apiKey } });
      if (!response.ok) throw new Error((await response.text()) || 'listenKey_keepalive_failed');
    } catch (error) {
      item.state = { ...item.state, connected: false, error: error.message };
      if (!item.stopped && !item.reconnect) item.reconnect = setTimeout(() => { item.reconnect = null; item.socket?.close(); connect(true); }, 0);
    }
  }, 25 * 60_000);
  streams.set(id, item);
  connect();
  return item.state;
}

export function stopBinanceUserStream(id) {
  const item = streams.get(id);
  if (!item) return;
  item.stopped = true;
  clearInterval(item.keepalive);
  clearTimeout(item.reconnect);
  item.socket?.close();
  streams.delete(id);
}

export function getBinanceUserStreamState(id) { return streams.get(id)?.state || { connected: false, error: null, updatedAt: null }; }
