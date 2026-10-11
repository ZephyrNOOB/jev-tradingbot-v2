# SMC Component Study

Status: preliminary component diagnostics. No component selected.

## Data

15M BTCUSDT Binance Futures Testnet immutable snapshot. Forward close return horizons: 1, 3, 6, 12, 24 bars. No trading simulation or costs.

## Component rules

```text
structure: confirmed pivot breakout
BOS: breakout with provisional displacement
CHoCH_MSS: first opposite displaced breakout after state
combined_sequence: displaced structure event
FVG: three-candle gap probe
sweep_reclaim: 12-bar prior high/low breach and close-back-inside probe
OB: latest opposite candle preceding displaced structure event
```

These are measurement probes, not final indicator rules. No lookahead from future candles. Final SMC specification remains open.

## Raw result extraction

`v2/artifacts/EVENT_STUDY_RAW.json` contains full:

```text
component event count
unique parent count
forward distribution
bootstrap CI
matched diagnostic lift
side breakdown
30-day block breakdown
```

## Preliminary result summary

| Component | Events | Key observation |
|---|---:|---|
| BOS | 4,128 | mean negative at 1/3/6 bars; near-zero/weak at longer horizons |
| CHoCH/MSS | 1,133 | small positive at 1/3 bars, negative at 6/12/24 bars |
| Combined sequence | recorded | no unconditional edge promotion |
| FVG | recorded | requires retest/mitigation study; raw gap event is not a trade |
| OB | recorded | requires retest/location study; candle label alone is not a trade |
| Sweep/reclaim | recorded | requires sequence confirmation; isolated sweep is insufficient |

## Interpretation

Raw components cannot be accepted as profitable indicators from unconditional return. BOS shows no positive short-horizon evidence in this probe. CHoCH/MSS reverses from slightly positive early returns to negative longer returns. FVG, OB, and sweep are event hypotheses whose economic meaning depends on subsequent retest/confirmation; their raw event result must not be treated as setup performance.

Parent-event identity and clustering remain critical. A combined sequence may contain component labels from the same impulse. Count one economic episode once when evaluating a complete setup.

## Decision

```text
SMC-01: retained as research candidate.
BOS: no promotion.
CHoCH/MSS: no promotion.
FVG: no promotion before retest study.
OB: no promotion before retest study.
Sweep/reclaim: no promotion before sequence study.
Stage 2: open.
```

## Next gate

Run component studies with exact common matching:

```text
side
volatility bucket
market state
30-day time block
non-overlapping parent event
```

Then run purged chronological validation. Do not tune thresholds from these results.
