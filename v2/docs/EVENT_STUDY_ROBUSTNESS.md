# Stage 2 Event Study Robustness Addendum

Status: preliminary robustness complete; final selection remains open.

## Additional tests

- Block bootstrap: 1,000 repetitions, block length 8 events.
- Matched non-event comparison: same event side, nearby time window, non-event observations.
- No fees, slippage, funding, entry, SL, TP, or PnL simulation.

## Bootstrap 95% intervals for mean forward return

| Candidate | Horizon | Mean | 95% CI |
|---|---:|---:|---:|
| Price control | 1 | +0.0078% | -0.0037% to +0.0193% |
| Price control | 3 | +0.0089% | -0.0081% to +0.0263% |
| Price control | 6 | +0.0018% | -0.0210% to +0.0252% |
| Price control | 12 | +0.0039% | -0.0284% to +0.0380% |
| Price control | 24 | -0.0030% | -0.0463% to +0.0401% |
| SMC-01 | 1 | -0.0015% | -0.0095% to +0.0066% |
| SMC-01 | 3 | -0.0038% | -0.0183% to +0.0121% |
| SMC-01 | 6 | -0.0069% | -0.0310% to +0.0183% |
| SMC-01 | 12 | -0.0038% | -0.0388% to +0.0331% |
| SMC-01 | 24 | +0.0124% | -0.0382% to +0.0655% |

All intervals include zero. No unconditional mean-return result is statistically distinguishable from zero under this preliminary block bootstrap.

## Matched lift

| Candidate | Horizon | Event mean | Matched mean | Lift |
|---|---:|---:|---:|---:|
| Price control | 1 | +0.0078% | -0.0005% | +0.0084% |
| Price control | 3 | +0.0089% | -0.0023% | +0.0113% |
| Price control | 6 | +0.0018% | -0.0048% | +0.0066% |
| Price control | 12 | +0.0039% | -0.0073% | +0.0112% |
| Price control | 24 | -0.0030% | -0.0196% | +0.0166% |
| SMC-01 | 1 | -0.0015% | +0.0003% | -0.0018% |
| SMC-01 | 3 | -0.0038% | +0.0026% | -0.0065% |
| SMC-01 | 6 | -0.0069% | +0.0071% | -0.0140% |
| SMC-01 | 12 | -0.0038% | +0.0077% | -0.0115% |
| SMC-01 | 24 | +0.0124% | +0.0095% | +0.0028% |

The matched baseline is a diagnostic comparison, not a final causal estimate. It is not yet matched on volatility, regime, or exact time-of-day; this remains open.

## Decision

```text
SMC-01 selected: NO
SMC-01 rejected permanently: NO
Price control selected: NO
Stage 2 closed: NO
```

Reason: preliminary SMC shows negative lift at 1/3/6/12 horizons, near-zero lift at 24, and all bootstrap intervals include zero. The control also has weak evidence. Neither candidate is ready for architecture selection.

## Required next test

Before final rejection, isolate SMC components and add exact matching:

```text
BOS
CHoCH/MSS
sweep/reclaim
FVG
OB
combined sequence
```

Match by:

```text
side
15M volatility bucket
market-state bucket
time block
non-overlapping parent event
```

Then run purged chronological windows and preserve the untouched final window.
