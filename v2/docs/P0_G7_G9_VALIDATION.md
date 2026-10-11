# P0 G7/G9 Validation Review

Status: `VALIDATION_COMPLETE_NO_SETUP_PROMOTION`

G7 measures 15M acceptance persistence and failure timing. G9 replays closed 5M candles for causal confirmation and FVG/OB lifecycle evidence. Neither artifact creates a trade plan or live order.

## G7 — Acceptance duration

- Structure events measured: `1131`
- Failure rate within `24` 15M bars: `0.74447391688771`
- Acceptance checkpoint rates: `{'1': 1.0, '2': 0.7771883289124668, '3': 0.6551724137931034, '4': 0.5764809902740937}`
- Retest observed rate: `0.8647214854111406`
- Failure types: `{'acceptance_close_failure': 317, 'insufficient_future_window': 1, 'no_failure_in_window': 288, 'retest_failure': 525}`

## G9 — 5M confirmation

| Contract | Attempts | Confirmed | Rate |
| --- | ---: | ---: | ---: |
| continuation_5m_confirmation | 548 | 141 | 0.2572992700729927 |
| fvg_5m_confirmation | 8658 | 1356 | 0.15661815661815662 |
| ob_5m_confirmation | 1131 | 278 | 0.2458001768346596 |

- Confirmed records with distinct rejection/micro-break IDs: `1775`
- 5M confirmation is diagnostic evidence only; no SetupBot is promoted.

## Gate

These outputs validate that the required diagnostic fields and causal replay contract can be measured. They do not prove profitability and do not close Stage 5A by themselves.
