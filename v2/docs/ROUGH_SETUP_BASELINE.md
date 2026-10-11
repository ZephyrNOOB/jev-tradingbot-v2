# Rough Setup Baseline — Clean-Room v2

Status: IMMUTABLE BASELINE / DIAGNOSTIC ONLY
Created: 2026-10-02
Scope: first rough comparison of nine fresh setup-bot hypotheses derived from the new 15M market-structure architecture.

## Important boundary

This is not a promoted strategy, not proof of profitability, and not a final entry/SL/TP design. It is a frozen diagnostic baseline used to explain where each setup currently wins or loses before targeted research.

The user explicitly requested this rough run before finalizing entry, SL, and TP. Results must not be compared as a final apples-to-apples strategy ranking against the old project.

## Architecture used

```text
1H bias → 15M structure hypothesis → provisional 5M trigger → rough trade outcome
```

Setup families came from the fresh 15M structure research. Legacy setup names/rules were not imported.

## Data

```text
Venue: Binance Futures USDⓈ-M Testnet
Symbol: BTCUSDT perpetual
5M candles: 105,119
15M candles: 35,040
1H candles: 8,760
Gaps: 0
Invalid OHLC: 0
Duplicate timestamps: 0
```

Source manifest:

```text
v2/artifacts/DATA_SNAPSHOT_MANIFEST.json
```

## Rough execution assumptions

```text
fee: 0.04% each side
slippage: 0.02% each side
round-trip fee+slippage: 0.12%
funding: omitted; historical funding dataset not yet integrated
provisional RR: 1.5R
maximum holding horizon: 48 x 5M candles
reference balance: $1,000
```

The script used provisional mechanics only to generate diagnostic outcomes. These values are not approved trading rules.

Raw output:

```text
v2/artifacts/ROUGH_SETUP_BACKTEST.json
```

Reproduction command:

```text
python v2/scripts/rough_setup_backtest.py
```

## Frozen result

| Bot | Trades | Wins | Losses | Win rate | Rough net profit* |
|---|---:|---:|---:|---:|---:|
| StructureTransitionBot | 1,142 | 803 | 339 | 70.32% | +$6,309.43 |
| ParticipationConditionedBot | 2,226 | 1,273 | 953 | 57.19% | +$2,458.67 |
| OrderBlockContextBot | 928 | 613 | 315 | 66.06% | +$1,596.61 |
| BearishContinuationBot | 994 | 708 | 286 | 71.23% | +$1,382.40 |
| FvgObConfluenceBot | 610 | 329 | 281 | 53.93% | -$94.15 |
| FvgContextBot | 1,606 | 853 | 753 | 53.11% | -$2.90 |
| LiquidityReclaimBot | 17 | 3 | 14 | 17.65% | -$26.54 |
| BullishContinuationBot | 958 | 310 | 648 | 32.36% | -$1,439.04 |
| RangeBoundaryReclaimBot | 0 | 0 | 0 | — | $0.00 |

*Approximate diagnostic return scaled to $1,000. Not compounded account equity and not a final net-PnL claim.

## Exit/outcome reason ledger

| Bot | Target | Stop | Stop-first | Timeout |
|---|---:|---:|---:|---:|
| StructureTransitionBot | 689 | 167 | 4 | 282 |
| ParticipationConditionedBot | 1,333 | 561 | 191 | 141 |
| OrderBlockContextBot | 628 | 230 | 34 | 36 |
| BearishContinuationBot | 769 | 0 | 225 | 0 |
| FvgObConfluenceBot | 396 | 164 | 45 | 5 |
| FvgContextBot | 1,043 | 417 | 134 | 12 |
| LiquidityReclaimBot | 4 | 6 | 5 | 2 |
| BullishContinuationBot | 339 | 570 | 18 | 31 |
| RangeBoundaryReclaimBot | 0 | 0 | 0 | 0 |

Definitions:

```text
Target: rough target was reached first.
Stop: rough stop was reached first.
Stop-first: same candle touched stop and target; conservative stop-first policy.
Timeout: neither boundary was reached within rough horizon; final close determined result.
```

## Findings and reasons

### StructureTransitionBot

Positive rough result, but many outcomes are timeout. Positive result is influenced by provisional RR and mechanics. Does not yet prove genuine control transfer. Required audit: protected-swing break, displacement, no immediate close-back, 5M same-direction sequence, 5M retest rejection.

### ParticipationConditionedBot

Volume increased candidates from a base family. This does not prove volume caused direction. Required audit: valid base family first, relative participation support, price acceptance matching pressure. Volume-only signals remain invalid.

### OrderBlockContextBot

Better rough result than raw FVG context. OB still requires displacement-origin evidence, return to zone, 5M close away, local swing break, and invalidation not accepted. Candle shape or wick alone is not rejection.

### BearishContinuationBot

Strong rough result in this sample. Seller control still requires protected LH defense, 5M lower-high/higher-high failure, close below confirmed micro low, displacement, and retest failure. Must be tested on untouched windows before promotion.

### FvgObConfluenceBot

Overlap alone did not guarantee a valid zone. Required: non-zero overlap, same parent impulse/direction, no invalidation, and 5M response plus local swing break.

### FvgContextBot

FVG touch produced many adverse outcomes. Raw touch is not a reaction. Required: displacement-created FVG, return to zone, 5M close away, local swing break, and no full invalidation acceptance.

### LiquidityReclaimBot

Only 17 trades: insufficient sample. Sweep-only logic produced false reversals. Required: prior pool, close reclaim, no re-acceptance, 5M counter-swing break, displacement, and retest hold.

### BullishContinuationBot

Highest diagnostic weakness: 570 stops plus 18 stop-first versus 339 targets. The bullish premise did not protect entries under rough mechanics. Required audit: protected HL defense, 5M higher low/lower-low failure, close above confirmed micro high, displacement, and retest hold.

### RangeBoundaryReclaimBot

Zero trades. This is a detector/definition finding, not proof of failure. Boundary must be confirmed by repeated reactions, sweep close inside, no outside acceptance, 5M break away, and sufficient distance to opposing boundary.

## Why baseline is useful

```text
It reveals asymmetry: bearish continuation currently behaves differently from bullish continuation.
It identifies stop-first ambiguity for later simulator audit.
It separates timeout from target/stop outcomes.
It prevents future changes from being judged only by total PnL.
It creates a frozen reference before targeted fixes.
```

## Promotion status

```text
Status: NEEDS REVIEW
Promoted bots: none
Selected entry rules: none
Funding included: no
Untouched holdout: no
Final cost model: no
Portfolio overlap control: no
```

Next work must audit one mechanism at a time. Do not tighten filters merely to reduce trade count. Compare stable opportunity keys, retained/removed winners and losses, outcome reasons, and post-cost results.
