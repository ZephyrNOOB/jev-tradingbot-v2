# Stage 2 Event Study — Preliminary Results

Status: preliminary diagnostic; candidate selection remains open.

## Dataset

- Immutable Binance Futures USDⓈ-M Testnet BTCUSDT snapshot.
- 15M events and forward 15M close returns.
- 5M: 105,119; 15M: 35,040; 1H: 8,760.
- No fee, slippage, funding, entry, SL, TP, or trade simulation.

## Critical implementation note

This is an event-study probe, not a final SMC implementation. The probe uses confirmed two-left/two-right pivots and provisional displacement parameters only to make the hypothesis measurable. Those provisional values are not project rules and cannot be promoted. The probe does not yet apply 1H bias confirmation, 5M execution confirmation, matched conditional baselines, confidence intervals, regime buckets, or purge/embargo.

## Results

| Event | Count | Parent events | Horizon | Mean forward return | Median | Positive |
|---|---:|---:|---:|---:|---:|---:|
| Price structure control | 2,539 | 2,539 | 1 bar | +0.0078% | -0.0048% | 47.99% |
| Price structure control | 2,539 | 2,539 | 3 bars | +0.0089% | -0.0079% | 48.82% |
| Price structure control | 2,539 | 2,539 | 6 bars | +0.0018% | -0.0168% | 47.60% |
| Price structure control | 2,539 | 2,539 | 12 bars | +0.0039% | -0.0435% | 46.69% |
| Price structure control | 2,537 | 2,537 | 24 bars | -0.0030% | -0.0317% | 48.01% |
| SMC-01 preliminary | 5,262 | 2,026 | 1 bar | -0.0015% | -0.0045% | 47.65% |
| SMC-01 preliminary | 5,262 | 2,026 | 3 bars | -0.0038% | -0.0159% | 46.99% |
| SMC-01 preliminary | 5,262 | 2,026 | 6 bars | -0.0069% | -0.0296% | 46.09% |
| SMC-01 preliminary | 5,262 | 2,026 | 12 bars | -0.0038% | -0.0484% | 45.66% |
| SMC-01 preliminary | 5,260 | 2,026 | 24 bars | +0.0124% | -0.0529% | 46.37% |

## Initial interpretation

The preliminary SMC event definition does not show positive unconditional forward-return lift over the simple price-structure control at 1, 3, 6, or 12 15M bars. Its 24-bar mean is slightly positive but its median and positive share remain below 50%, so this is not evidence of a robust edge.

The control itself is weak: means are close to zero, medians are negative, and positive shares are below 50% at every tested horizon. This means the probe is measuring noisy break events, not a validated trading signal.

SMC event count is higher than the control and parent-event count is lower. That indicates clustering or multiple events associated with the same structural episode. The final ledger must deduplicate economic parent events before inference.

## What this result does and does not prove

It does show:

- the raw snapshot can be replayed deterministically;
- a no-lookahead confirmed-pivot probe can be executed;
- preliminary SMC labels are not automatically predictive;
- unconditional SMC break events are insufficient as a trading decision.

It does not show:

- SMC is disproved;
- SMC setup entries are profitable or unprofitable;
- 1H/15M/5M architecture works or fails;
- a specific SMC component should be selected;
- any win rate or PnL result.

## Required next diagnostics

1. Add matched non-event baseline by time, side, volatility, and market state.
2. Add block-bootstrap confidence intervals.
3. Split SMC into BOS, CHoCH/MSS, sweep/reclaim, FVG, OB, and combined sequence.
4. Add 1H bias confirmation and 5M confirmation as separate event layers.
5. Add regime, side, and chronological-block breakdown.
6. Add parent-event deduplication and event cooldown only as an audit identity, not a performance filter.
7. Run purged chronological validation with an embargo matching the forward horizon.

## Decision

```text
SMC-01: remains candidate for structured validation.
SMC-01: not selected.
Stage 2: remains open.
Stage 3: remains blocked.
```
