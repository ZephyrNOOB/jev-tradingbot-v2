# Stage 5 — Historical Data Pipeline

Status: COMPLETE.

## Locked dataset

```text
Venue: Binance Futures USDⓈ-M Demo for new downloads. The currently locked historical snapshot retains its original provenance separately in `DATA_SNAPSHOT_MANIFEST.json`.
Symbol: BTCUSDT perpetual
Coverage: approximately 365 days
Intervals: 5m, 15m, 1h
New download source: https://demo-fapi.binance.com/fapi/v1/klines
```

## Snapshot

```text
5m:  105,119 candles
15m:  35,040 candles
1h:    8,760 candles
Gaps: 0
Invalid OHLC: 0
Duplicates: 0
```

Raw files:

```text
v2/data/BTCUSDT-5m.csv
v2/data/BTCUSDT-15m.csv
v2/data/BTCUSDT-1h.csv
```

Manifest and hashes:

```text
v2/artifacts/DATA_SNAPSHOT_MANIFEST.json
```

## Schema

Each row contains:

```text
open_time
open
high
low
close
volume
close_time
quote_volume
trades
taker_buy_volume
taker_buy_quote_volume
```

`open_time` uses milliseconds. Rows are strictly ascending. Expected interval spacing is enforced. OHLC must satisfy:

```text
low <= open <= high
low <= close <= high
```

Research consumers may use completed candles only. The final incomplete candle is excluded by the recorded cutoff.

## Reproducibility

The validator checks:

```text
manifest count equals CSV row count
SHA-256 equals manifest
no duplicate timestamp
no interval gaps
finite numeric fields
OHLC invariants
coverage
```

The raw snapshot is immutable. Any refresh creates a new manifest/version; it must not overwrite research evidence.

## Scope boundary

Stage 5 does not implement:

```text
indicators
market-structure rules
entry
setup selection
SL
TP
PnL
live orders
```
