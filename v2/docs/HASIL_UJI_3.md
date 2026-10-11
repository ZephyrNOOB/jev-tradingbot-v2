# Hasil Uji 3

## Scope

Baseline dikembalikan ke **Hasil Uji 1**, lalu hanya Kekurangan 2 diterapkan. Kekurangan 1 tidak aktif pada run ini. Setup bot tidak diubah.

```text
Base: Hasil Uji 1 market structure
Applied: Kekurangan 2
Setup bots: unchanged
```

Kekurangan 2 aktif pada data OHLCV:

```text
liquidity-cluster reference
POI provenance metadata
```

Order flow, order book, OI, funding, dan uncertainty tidak dipalsukan.

## Data dan cost

```text
Venue: Binance Futures USDⓈ-M Testnet
Symbol: BTCUSDT perpetual
1H: 8,760 candles
15M: 35,040 candles
5M: 105,119 candles
Gaps: 0
Invalid OHLC: 0
Fee: 0.04% per side
Slippage: 0.02% per side
Round-trip: 0.12%
Funding: omitted
RR: 1.5R provisional
Max holding: 48 candle 5M
Reference balance: $1,000
```

## Hasil

| Bot | Trades | Wins | Losses | Win rate | Profit bersih |
|---|---:|---:|---:|---:|---:|
| StructureTransitionBot | 1,142 | 803 | 339 | 70.32% | +$6,309.43 |
| FvgObConfluenceBot | 610 | 329 | 281 | 53.93% | -$94.15 |
| FvgContextBot | 1,606 | 853 | 753 | 53.11% | -$2.90 |
| OrderBlockContextBot | 928 | 613 | 315 | 66.06% | +$1,596.61 |
| ParticipationConditionedBot | 2,255 | 1,283 | 972 | 56.90% | +$2,401.95 |
| BullishContinuationBot | 958 | 310 | 648 | 32.36% | -$1,439.04 |
| BearishContinuationBot | 994 | 708 | 286 | 71.23% | +$1,382.40 |
| LiquidityReclaimBot | 94 | 37 | 57 | 39.36% | -$43.81 |
| RangeBoundaryReclaimBot | 0 | 0 | 0 | - | $0.00 |

## Aggregate independent result

```text
Trades: 8,587
Wins: 4,936
Losses: 3,651
Win rate: 57.48%
Profit bersih setelah fee + slippage: +$10,110.49
```

Aggregate bukan portfolio PnL. Trade antarbot dapat overlap.

## Comparison Hasil Uji 1

```text
Hasil Uji 1: 8,481 trades | 4,892 wins | 3,589 losses | 57.71% | +$10,184.49
Hasil Uji 3: 8,587 trades | 4,936 wins | 3,651 losses | 57.48% | +$10,110.49
```

```text
Trades: +106
Wins: +44
Losses: +62
Win rate: -0.23 percentage point
Net: -$74.94
```

## Decision

```text
Base: Hasil Uji 1
Kekurangan 1 active: false
Kekurangan 2 active: true
Setup bot changed: false
Promotion: NEEDS REVIEW / NOT PROMOTED
```

Kekurangan 2 menambah liquidity candidates, tetapi LiquidityReclaimBot tetap negatif. Observability naik; edge belum terbukti. Metadata/lifecycle belum sepenuhnya menjadi consumer filter setup.
