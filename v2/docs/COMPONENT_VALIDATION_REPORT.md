# SMC Component Validation — Exact Matching Diagnostic

Status: completed diagnostic; no candidate promotion.

## Method

- Dataset: immutable 15M BTCUSDT Binance Futures USDⓈ-M Testnet snapshot.
- Event horizons: 1, 3, 6, 12, 24 completed 15M bars.
- Matching: side + volatility quartile + 30-day state block.
- Purge exclusion: 24 bars around event when selecting control.
- Bootstrap: 1,000 block resamples, block length 8.
- No fees, slippage, funding, entry, SL, TP, or PnL.

State proxy uses only completed candles: 32-bar price return, bucketed bearish/neutral/bullish. Volatility uses ATR(14)/close only for grouping. These are research grouping variables, not strategy rules.

## Results

`lift` = event forward return minus matched control forward return.

| Component | Events | Parents | 1-bar lift | 3-bar lift | 6-bar lift | 12-bar lift | 24-bar lift |
|---|---:|---:|---:|---:|---:|---:|---:|
| Structure | 12,257 | 2,539 | -0.0690% | -0.1138% | -0.1386% | -0.1073% | -0.0531% |
| BOS | 4,129 | 1,592 | -0.0568% | -0.1158% | -0.1483% | -0.1579% | -0.1157% |
| Combined sequence | 5,262 | 2,026 | -0.0486% | -0.0974% | -0.1252% | -0.1216% | -0.0791% |
| CHoCH/MSS | 1,133 | 1,103 | -0.0208% | -0.0361% | -0.0395% | +0.0054% | +0.0686% |
| Sweep/reclaim | 4,063 | 4,063 | +0.0757% | +0.1351% | +0.1490% | +0.1318% | +0.0833% |
| FVG | 8,658 | 8,658 | -0.1065% | -0.1010% | -0.0568% | -0.0287% | -0.0021% |
| OB | 5,256 | 3,418 | -0.0485% | -0.0969% | -0.1249% | -0.1208% | -0.0787% |

## Confidence interpretation

Sweep/reclaim has positive matched lift in every tested horizon; its 95% bootstrap lift intervals were positive for 1/3/6/12/24 bars. This is evidence for a **conditional reversal hypothesis**, not proof of a tradeable edge. It has not passed retest, 1H bias, 15M structure alignment, 5M confirmation, costs, or untouched holdout.

BOS and combined sequence show negative lift across all horizons. Their intervals are negative in the diagnostic. This is evidence against the current raw breakout event definition, not against every possible BOS implementation.

FVG and OB show negative short-to-medium horizon lift. Their raw event definitions do not represent retest/mitigation entries; no setup rejection should be based on these raw events alone.

CHoCH/MSS is unstable: negative short horizon, near zero at 12 bars, positive at 24 bars with low practical interpretation. Do not promote.

## Data-quality warning

Parent counts expose event clustering. Structure has 12,257 labels but only 2,539 parents; BOS has 4,129 labels but 1,592 parents. A final economic-event ledger must deduplicate parent episodes before claiming statistical power.

The matching is materially better than the earlier nearby-window diagnostic but remains a research match, not causal identification. It does not yet use a fully frozen independently defined regime classifier or a final purged walk-forward train/test protocol.

## Decision

```text
SMC-01: retained as candidate, not selected.
Sweep/reclaim: strongest research hypothesis; requires sequence validation.
BOS: raw definition rejected for promotion.
Combined sequence: not promoted.
CHoCH/MSS: unstable; not promoted.
FVG: raw gap not promoted; retest study required.
OB: raw candle event not promoted; retest study required.
Stage 2: remains open.
Stage 3: blocked.
```

## Next gate

Only one follow-up should be tested next: sweep → reclaim → 15M structure alignment → 5M confirmation. Freeze this diagnostic, use an untouched chronological window, and include costs only after event qualification is proven.
