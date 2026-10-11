# Hasil Uji 4

## Scope

Baseline dikembalikan ke Hasil Uji 1, lalu Kekurangan 3 diterapkan.

```text
Base: Hasil Uji 1
Applied: Kekurangan 3
Setup bots: unchanged
```

Kekurangan 3 aktif sebagai evidence-lifecycle layer:

```text
structure_event_id
parent/child timeframe provenance
source timeframe
execution timeframe
poi_id
selected_poi_reason
acceptance_state
failure_state
invalidation_reason
evidence_type
```

Existing setup triggers, entry, SL, dan TP tidak diubah. Jadi pengujian mengisolasi evidence ledger tanpa mencampur perubahan setup.

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

## Hasil Uji 4

| Bot | Trades | Wins | Losses | Win rate | Profit bersih |
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

## Aggregate Hasil Uji 4

```text
Trades: 8,481
Wins: 4,892
Losses: 3,589
Win rate: 57.71%
Profit bersih setelah fee + slippage: +$10,184.49
```

Aggregate ini bukan portfolio PnL. Trade antarbot dapat overlap.

# Semua Hasil Uji

| Test | Base | Perubahan | Trades | Wins | Losses | Win rate | Net profit |
|---|---|---|---:|---:|---:|---:|---:|
| Hasil Uji 1 | Baseline | Tidak ada perubahan | 8,481 | 4,892 | 3,589 | 57.71% | +$10,184.49 |
| Hasil Uji 3 | Hasil Uji 1 | Kekurangan 2 aktif | 8,587 | 4,936 | 3,651 | 57.48% | +$10,110.49 |
| Hasil Uji 4 | Hasil Uji 1 | Kekurangan 3 aktif | 8,481 | 4,892 | 3,589 | 57.71% | +$10,184.49 |

## Interpretasi perbandingan

### Hasil Uji 1 → Hasil Uji 3

Kekurangan 2 mengubah referensi liquidity dan menambah candidate LiquidityReclaimBot.

```text
Trades: +106
Wins: +44
Losses: +62
Win rate: -0.23 percentage point
Net: -$74.00 approximately
```

Net turun tipis. Kekurangan 2 memberi observability, tetapi edge belum terbukti.

### Hasil Uji 1 → Hasil Uji 4

Kekurangan 3 diterapkan sebagai evidence-lifecycle ledger. Existing setup triggers tetap dipertahankan.

```text
Trade set: identical
PnL: identical
```

Ini expected. Kekurangan 3 memperbaiki auditability dan provenance, bukan sinyal. Belum ada consumer filter baru agar tidak mengubah setup secara diam-diam.

## Final decision

```text
Hasil Uji 1: baseline diagnostic
Hasil Uji 3: NEEDS REVIEW / NOT PROMOTED
Hasil Uji 4: evidence-lifecycle layer recorded; no PnL claim

Setup bot changed: false
Funding included: false
Holdout: false
Portfolio overlap modeled: false
Live trading enabled: false
```

Hasil Uji 4 tidak boleh dibaca sebagai bukti final profitabilitas. Nilainya: setiap trade sekarang memiliki alasan/provenance yang bisa diaudit pada level structure event, POI, acceptance, failure, dan evidence type.
