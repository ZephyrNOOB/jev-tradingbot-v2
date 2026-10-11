# Setup-Specific Entry Confirmation Research

Status: RESEARCH COMPLETE / NO PROMOTION

## Common gate

All four candidates require:

```text
1H bias valid
15M confirms 1H bias
15M structure valid
15M eligible category
5M ConfirmationBot = CONFIRMED
SelectionBot selects exactly one
```

A setup reason is not a valid entry by itself. Entry requires setup-specific confirmation.

## 1. Breakout-Retest-Continuation

Reason: 15M close-confirmed BOS with displacement shows acceptance beyond a structural level. Retest tests whether the broken level changes role. Entering on first breakout alone is rejected.[1][2]

Required confirmation:

```text
15M:
  BOS close beyond confirmed swing
  displacement relative to 15M ATR/range
  BOS aligns with 1H bias
  protected swing intact

5M:
  price returns to BOS level/POI
  no accepted close back through level
  rejection or acceptance in breakout direction
  micro swing break in direction
  follow-through close
```

Entry:

```text
LONG: 5M retest holds above broken resistance and closes bullish with follow-through
SHORT: 5M retest holds below broken support and closes bearish with follow-through
```

Reject: wick-only break, no retest, immediate close back inside, no follow-through.

## 2. Mitigation-Block Retest

Reason: displacement-origin POI matters only when identity, parent impulse, freshness, and invalidation are explicit. Candle shape alone is not evidence.[3]

Required confirmation:

```text
15M:
  identifiable opposite candle before displacement
  displacement creates valid structural event
  POI has parent impulse and provenance
  POI not invalidated or over-consumed
  state aligns with 1H bias

5M:
  price enters POI
  rejection away from POI
  close exits in expected direction
  micro swing break/follow-through
  no acceptance beyond invalidation boundary
```

Entry:

```text
LONG: bullish displacement-origin POI retest + 5M bullish rejection/structure confirmation
SHORT: bearish displacement-origin POI retest + 5M bearish rejection/structure confirmation
```

Reject: touch-only, full acceptance through POI, missing provenance, stale/mitigated POI.

## 3. Volatility-Compression Expansion Retest

Reason: compression identifies low-volatility state; expansion identifies regime change. Volatility cannot supply direction; structure and 5M confirmation must do so.[4][5]

Required confirmation:

```text
15M:
  measurable compression versus rolling baseline
  close-confirmed structural break
  expansion/displacement beyond compression
  break aligns with 1H bias
  protected reference intact

5M:
  retest of expansion level
  volatility remains supportive, not immediate collapse
  directional close and micro swing break
  follow-through
```

Entry:

```text
LONG: bullish expansion break + retest hold + 5M bullish confirmation
SHORT: bearish expansion break + retest hold + 5M bearish confirmation
```

Reject: volatility spike without structure break, expansion against bias, return into range, no 5M follow-through.

## 4. Order-Flow-Confirmed Structure Retest

Reason: order flow can add short-horizon participation and price-discovery information, but cannot replace structure. Venue, latency, and sampling must be controlled.[6][7][8]

Required confirmation:

```text
15M:
  valid BOS/CHoCH and POI
  state aligns with 1H bias

5M:
  retest and price acceptance/rejection
  signed taker flow aligns with direction
  imbalance persists or confirms at trigger
  micro swing break/follow-through
  no price/flow contradiction
```

Entry:

```text
LONG: bullish structure retest + buyer-initiated flow/imbalance + 5M confirmation
SHORT: bearish structure retest + seller-initiated flow/imbalance + 5M confirmation
```

Reject: volume-only spike, flow contradiction, no retest, no structure confirmation. Current OHLCV volume proxy is not true order-flow validation.

## Verdict

```text
Breakout-Retest-Continuation: adequate confirmation definition for controlled test; not proven profitable.
Mitigation-Block Retest: POI lifecycle/provenance required before valid test.
Volatility-Compression Expansion Retest: objective thresholds required before valid test.
Order-Flow-Confirmed Structure Retest: real taker/L2 data required; OHLCV proxy insufficient.
```

None promoted. Implement confirmation rules in isolation before next backtest.

## Sources

[1] https://www.kucoin.com/knowledge-base/Analysis/what-is-breakout-confirmation-in-crypto
[2] https://studio.kvants.ai/blog/how-to-avoid-false-breakouts
[3] https://www.luxalgo.com/blog/how-to-find-order-blocks-obs-in-trading/
[4] https://www.sciencedirect.com/science/article/pii/S0275531924002654
[5] https://www.mdpi.com/1911-8074/15/11/513
[6] https://link.springer.com/article/10.1007/s42521-019-00007-w
[7] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[8] https://arxiv.org/html/2607.09230
