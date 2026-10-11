# Hasil Uji 1

## Scope

Uji Market Structure JEV v2 tanpa perubahan. Setup bot existing juga tidak diubah.

```text
Data: Binance Futures USDⓈ-M Testnet local raw snapshot
Symbol: BTCUSDT perpetual
Timeframes: 1H → 15M → 5M
Period: 12 months ending at snapshot download
Engine: v2/scripts/rough_setup_backtest.py
```

Binance Futures dipilih, bukan CCXT, karena data boundary v2 sudah dikunci pada Binance Futures Testnet dan snapshot lokal sudah tervalidasi. CCXT hanya wrapper API; tidak memberi keunggulan backtest setelah data sudah tersedia.

## Data integrity

```text
1H: 8,760 candles
15M: 35,040 candles
5M: 105,119 candles
Gaps: 0
Invalid OHLC: 0
Duplicates: 0
```

## Cost

```text
fee: 0.04% per side
slippage: 0.02% per side
round-trip fee + slippage: 0.12%
funding: tidak tersedia di snapshot; tidak dimasukkan
reference balance: $1,000
RR provisional: 1.5R
maximum holding: 48 candle 5M
```

Profit bersih di bawah = gross return dikurangi fee dan slippage. Belum termasuk funding.

## Hasil per bot

| Bot | Trade | Wins | Losses | Win rate | Profit bersih* |
|---|---:|---:|---:|---:|---:|
| StructureTransitionBot | 1,142 | 803 | 339 | 70.32% | +$6,309.43 |
| FvgObConfluenceBot | 610 | 329 | 281 | 53.93% | -$94.15 |
| FvgContextBot | 1,606 | 853 | 753 | 53.11% | -$2.90 |
| OrderBlockContextBot | 928 | 613 | 315 | 66.06% | +$1,596.61 |
| ParticipationConditionedBot | 2,226 | 1,273 | 953 | 57.19% | +$2,458.67 |
| BullishContinuationBot | 958 | 310 | 648 | 32.36% | -$1,439.04 |
| BearishContinuationBot | 994 | 708 | 286 | 71.23% | +$1,382.40 |
| LiquidityReclaimBot | 17 | 3 | 14 | 17.65% | -$26.54 |
| RangeBoundaryReclaimBot | 0 | 0 | 0 | — | $0.00 |

*Scaled diagnostic return on $1,000 reference balance. Not compounded portfolio PnL.

## Total independent bot results

```text
Total trades: 8,481
Wins: 4,892
Losses: 3,589
Win rate closed trades: 57.71%
Net profit after fee + slippage: +$10,184.49
```

This aggregate is not a portfolio result. Each bot ran independently; trades can overlap. Do not use +$10,184.49 as deployable account profit.

## Exit reasons

| Bot | Target | Stop | Stop-first | Timeout |
|---|---:|---:|---:|---:|
| StructureTransitionBot | 689 | 167 | 4 | 282 |
| FvgObConfluenceBot | 396 | 164 | 45 | 5 |
| FvgContextBot | 1,043 | 417 | 134 | 12 |
| OrderBlockContextBot | 628 | 230 | 34 | 36 |
| ParticipationConditionedBot | 1,333 | 561 | 191 | 141 |
| BullishContinuationBot | 339 | 570 | 18 | 31 |
| BearishContinuationBot | 769 | 0 | 225 | 0 |
| LiquidityReclaimBot | 4 | 6 | 5 | 2 |
| RangeBoundaryReclaimBot | 0 | 0 | 0 | 0 |

```text
Target: target hit first
Stop: stop hit first
Stop-first: same candle touched both; conservative stop-first
Timeout: neither target nor stop hit within 48 x 5M bars
```

## Result interpretation

Positive diagnostic candidates:

```text
StructureTransitionBot
ParticipationConditionedBot
OrderBlockContextBot
BearishContinuationBot
```

Negative diagnostic candidates:

```text
BullishContinuationBot
FvgObConfluenceBot
FvgContextBot
LiquidityReclaimBot
```

No-trade candidate:

```text
RangeBoundaryReclaimBot
```

## Strict status

```text
Market Structure: unchanged
Setup bots: unchanged
Backtest: completed
Funding: omitted
Holdout: not applied
Portfolio overlap: not modeled
Bots promoted: none
```

This result is **Hasil Uji 1**, diagnostic only. It cannot yet prove final profitability because entry/SL/TP remain provisional and the 5M confirmation contract is not fully validated.
