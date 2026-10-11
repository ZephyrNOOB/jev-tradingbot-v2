# Root-Cause Setup Audit

Status: ROOT CAUSE FOUND / NO FILTER PATCH

## Finding

The negative results are not primarily caused by missing filters. The backtest places a new trade after a 15M break event and searches the next 24 5M candles for a retest, but the setup identity is not preserved through the full event lifecycle. The entry is therefore not a setup-specific causal entry; it is a generic candle close after a level touch.

Evidence from the executed v3 runner:

```text
Breakout-Retest: 172 trades, 128 unique signal times
Volatility: 38 trades, 32 unique signal times
Order-flow: 98 trades, 74 unique signal times
Union: 140 unique signal times
```

Signals overlap heavily because all candidates inherit the same 15M BOS and 5M level test. This is not four independent setup edges. They are three labels over one generic event.

## Root causes

### 1. Entry causality is wrong

The runner defines `near_level` using a 5M candle whose range touches the level and then requires a same-candle directional close. It does not prove that price first entered the POI, rejected it, and then confirmed a new micro-structure event. `entry = q[entry_idx]['open']` occurs after an arbitrary next-candle follow-through, not at a setup-specific causal trigger.

### 2. ConfirmationBot boundary is bypassed

The runner uses a simple next-candle close comparison as follow-through. It does not construct the ConfirmationBot state machine: micro swing, displacement, acceptance/retest, protected-reference status, and explicit rejection reason.

### 3. Setup identity is lost

A 15M BOS event is reused by all candidate families. Compression and volume are attached as booleans to the same event. Mitigation was removed, but the same design defect remains in the retained candidates.

### 4. Directional asymmetry is visible

```text
Breakout LONG  -$36.24 / SHORT +$0.77
Volatility LONG +$5.99 / SHORT -$12.02
Order-flow LONG +$1.51 / SHORT -$8.70
```

This is evidence of regime/side interaction or implementation bias, not proof that a direction should be filtered out.

### 5. Cost and target model are not causal

Fixed RR 1.5 and generic ATR/reference stops are shared across all families. They do not represent each setup's invalidation and structural target. Therefore net loss cannot be assigned solely to entry quality.

## Correct solution

Do not add another filter. Rebuild event identity and confirmation flow:

```text
15M event_id and parent impulse
15M POI identity and lifecycle
5M retest_start after event
5M rejection/acceptance event
5M confirmed micro BOS in setup direction
5M displacement measured on confirmation leg
setup-specific Entry after confirmation close
setup-specific SL at structural invalidation
setup-specific TP at opposing structural/liquidity target
one event -> one selected setup -> one trade
```

Order-flow candidate additionally requires real taker/L2 data. OHLCV volume must remain explicitly a proxy.

## Decision

```text
No candidate promoted.
No threshold tightening promoted.
Current PnL comparison is not an edge comparison until event identity and causal confirmation are rebuilt.
```

## Sources

[1] https://koryu.io/research/how-crypto-breakouts-work
[2] https://researchpips.com/university/breakout-retest/
[3] https://studio.kvants.ai/blog/how-to-avoid-false-breakouts
[4] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[5] https://arxiv.org/html/2607.09230v1
[6] https://www.quantconnect.com/forum/discussion/20140/robust-backtesting-guide-walk-forward-validation-transaction-costs-out-of-sample-testing/
