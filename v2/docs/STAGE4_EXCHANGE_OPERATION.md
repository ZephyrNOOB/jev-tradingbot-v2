# Stage 4 — Exchange Operation Contract

Status: COMPLETE.

## Locked venue

```text
Binance Futures USDⓈ-M Demo
BTCUSDT perpetual
REST: https://demo-fapi.binance.com
WebSocket Streams: wss://demo-fstream.binance.com
```

No live orders. Stage 4 defines venue/data/auth boundaries, not trading logic.

## Endpoint boundary

Public:

```text
GET /fapi/v1/exchangeInfo
GET /fapi/v1/time
GET /fapi/v1/klines
GET /fapi/v1/premiumIndex
```

Private reads, not activated:

```text
GET /fapi/v2/account
GET /fapi/v2/positionRisk
```

Order route is explicitly disabled:

```text
POST /fapi/v1/order
```

## Credential boundary

```text
API key: server-side only
secret: encrypted server-side only
signature: never logged
credentials: never sent through chat
withdrawal: disabled
```

Signed read rules:

```text
server time synchronization
HMAC-SHA256(query_string, secret)
X-MBX-APIKEY header
recvWindow <= 5000ms
```

## Data boundary

Allowed intervals:

```text
5m
15m
1h
```

Every response must retain request metadata, venue, symbol, interval, timestamp, response status, and raw-response hash. Credentials and signatures never enter logs.

Funding and commission remain separate accounting fields. Testnet connectivity does not prove mainnet representativeness or profitability.

## Stage 4 acceptance

```text
venue fixed
symbol fixed
public endpoints fixed
private endpoint policy fixed
live order path disabled
credential policy fixed
interval validation fixed
rate-limit policy fixed
```

No entry, setup, SL, TP, PnL, or strategy tuning belongs here.
