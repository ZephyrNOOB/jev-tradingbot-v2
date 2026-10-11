# Review Hasil Uji 1, 3, dan 4

## Scope

`Hasil Uji 2` dihapus karena FAIL. Review hanya memakai:

```text
Hasil Uji 1: baseline
Hasil Uji 3: baseline + Kekurangan 2
Hasil Uji 4: baseline + Kekurangan 3
```

## Validity boundary

Ketiga hasil memakai data dan engine rough yang sama:

```text
Binance Futures USDⓈ-M Testnet
BTCUSDT perpetual
1H: 8,760
15M: 35,040
5M: 105,119
Gaps: 0
Invalid OHLC: 0
Fee: 0.04% each side
Slippage: 0.02% each side
Funding: omitted
RR: 1.5R
Max hold: 48 x 5M
```

Profit adalah diagnostic scaled return on $1,000, bukan portfolio PnL. Bot berjalan independen dan trades dapat overlap.

## Aggregate comparison

| Test | Base | Change | Trades | Wins | Losses | WR | Net |
|---|---|---|---:|---:|---:|---:|---:|
| Hasil Uji 1 | baseline | none | 8,481 | 4,892 | 3,589 | 57.71% | +$10,184.49 |
| Hasil Uji 3 | Hasil Uji 1 | Kekurangan 2 | 8,587 | 4,936 | 3,651 | 57.48% | +$10,110.49 |
| Hasil Uji 4 | Hasil Uji 1 | Kekurangan 3 | 8,481 | 4,892 | 3,589 | 57.71% | +$10,184.49 |

## Delta

### Hasil Uji 3 minus Hasil Uji 1

```text
Trades: +106
Wins: +44
Losses: +62
Win rate: -0.23 percentage point
Net: -$73.99
```

The net delta is $10,110.49 - $10,184.49 = -$74.00 after rounding.

Only meaningful behavior change is LiquidityReclaimBot:

```text
17 trades → 94 trades
3 wins → 37 wins
14 losses → 57 losses
17.65% WR → 39.36% WR
-$26.54 → -$43.81
```

Interpretation: cluster reference increases opportunity count, but does not establish a profitable liquidity-reclaim edge. More candidates did not mean better candidates.

### Hasil Uji 4 minus Hasil Uji 1

```text
Trades: 0
Wins: 0
Losses: 0
WR delta: 0
Net delta: $0
```

Expected. Kekurangan 3 is evidence identity/lifecycle/provenance. Setup bots did not consume it as a selection filter. It improves auditability, not signal behavior.

## Per-bot diagnostic review

| Bot | Uji 1 | Uji 3 | Uji 4 | Review |
|---|---:|---:|---:|---|
| StructureTransitionBot | +$6,309.43 / 70.32% | same | same | strongest diagnostic; timeout 282 requires audit |
| OrderBlockContextBot | +$1,596.61 / 66.06% | same | same | positive but raw OB validity not proven |
| ParticipationConditionedBot | +$2,458.67 / 57.19% | +$2,401.95 / 56.90% | same as Uji 1 | volume context adds no reliable edge; slight degradation |
| BearishContinuationBot | +$1,382.40 / 71.23% | same | same | positive asymmetry; only stop-first losses recorded |
| BullishContinuationBot | -$1,439.04 / 32.36% | same | same | primary weakness; 570 stop + 18 stop-first vs 339 targets |
| FvgObConfluenceBot | -$94.15 / 53.93% | same | same | overlap does not prove entry zone |
| FvgContextBot | -$2.90 / 53.11% | same | same | near breakeven before robust validation; 417 stops + 134 stop-first |
| LiquidityReclaimBot | -$26.54 / 17.65% | -$43.81 / 39.36% | same as Uji 1 | cluster expansion raised count, remained negative |
| RangeBoundaryReclaimBot | $0 / 0 trades | same | same | detector produced no opportunity; cannot judge edge |

## Reason analysis

### Wins

Most wins are classified as `target`:

```text
Uji 1 target exits: 5,197
```

But timeout exits are not separated into economically positive/negative wins in the aggregate ledger. Therefore target count is not equal to proof of setup validity.

### Losses

Loss burden concentrates in:

```text
BullishContinuationBot
ParticipationConditionedBot
FvgContextBot
OrderBlockContextBot
```

The engine uses provisional common RR/ATR mechanics. This prevents causal attribution to market structure alone. A stop may mean bad structure, bad POI, bad trigger, or bad SL geometry; current result does not isolate these causes.

### Asymmetry

Bearish continuation is positive while bullish continuation is deeply negative:

```text
Bearish: 71.23% WR, +$1,382.40
Bullish: 32.36% WR, -$1,439.04
```

This is a real sample finding, not a reason to delete bullish logic. Required next audit: side, regime, event identity, POI, MAE/MFE, and stable trade key.

## Root causes of uncertainty

```text
1. rough entry/SL/TP, not final setup contracts
2. funding omitted
3. no holdout or walk-forward split
4. independent bots overlap
5. timeout outcome lacks full economic classification
6. same candle SL/TP uses conservative stop-first
7. no portfolio position/risk competition
8. Hasil Uji 3 changed liquidity references without full lifecycle consumer
9. Hasil Uji 4 logged provenance but did not alter decisions
```

## Decisions

```text
Keep Hasil Uji 1 as immutable behavioral baseline.
Keep Hasil Uji 3 as Kekurangan 2 sensitivity result; do not promote.
Keep Hasil Uji 4 as evidence-ledger result; no PnL claim.
Hasil Uji 2 removed and excluded from active comparison.
Promote no bot.
Enable no live trading.
```

## Next audit, no threshold tuning

```text
stable trade key comparison
per-side and per-regime breakdown
MAE/MFE
exit reason reconciliation
timeout net distribution
POI lifecycle coverage
5M confirmation coverage
portfolio overlap
funding-inclusive rerun
holdout validation
```

Do not change thresholds before this audit. Current evidence supports research prioritization, not deployment.
