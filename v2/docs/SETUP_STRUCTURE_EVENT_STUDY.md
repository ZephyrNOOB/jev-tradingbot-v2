# Stage 5A Structure-Only Event Study

Status: `IN_PROGRESS` — ledger generated for review; no SetupBot is promoted.

This artifact measures closed-15M structure/context events only. It does not define Entry, SL, TP, leverage, PnL, or live orders.

## Frozen universe

- Active research families: continuation_bullish, continuation_bearish, fvg_context, ob_context, structure_transition, participation_conditioned
- Excluded families: liquidity_reclaim, fvg_ob_confluence, range_boundary_reclaim
- Runtime remains limited to four existing SetupBot interfaces.

## Snapshot

- 15M rows: `35040`; SHA-256 `c97012fc6e7094c06d4a34d757a646a1236feb2715d2d7d6f2609afefeda2034`
- 1H rows: `8760`; SHA-256 `7bd4de0a904b9779399f66bb2b0199c4abe1c30051ee8792d8c6cf5b29cb315d`
- Candidate fields use only closed candles available at the event timestamp.
- Future candles are used only to calculate forward-return measurements.

## Family results

| Family | Candidates | Unique parents | Clustering ratio | Rejected |
| --- | ---: | ---: | ---: | ---: |
| continuation_bullish | 253 | 253 | 1.0 | 293 |
| continuation_bearish | 294 | 294 | 1.0 | 292 |
| fvg_context | 8658 | 8658 | 1.0 | 0 |
| ob_context | 1131 | 1131 | 1.0 | 0 |
| structure_transition | 584 | 584 | 1.0 | 0 |
| participation_conditioned | 3031 | 3031 | 1.0 | 6343 |

## Gate decision

The ledger is evidence for Stage 5A review only. Stage 6 remains blocked until the structure evidence, matched baselines, bootstrap intervals, purge windows, and P0 G7/G9 validations are reviewed and accepted.

No family is promoted by raw count, raw positive share, or rough PnL.
