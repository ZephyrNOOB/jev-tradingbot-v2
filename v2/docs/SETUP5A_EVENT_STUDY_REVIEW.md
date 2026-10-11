# Stage 5A Event Study Review

Status: `REVIEW_COMPLETE_P0_VALIDATION_REQUIRED`

The structure-only ledger was reviewed without selecting or promoting a SetupBot. Stage 6 remains blocked.

## Review screen

A family passes the conservative evidence screen only when the same horizon has positive matched lift and a bootstrap 95% lower bound above zero. Raw count, positive share, and rough PnL are not promotion criteria.

## Family decisions

| Family | Candidates | 24-bar matched lift | Robust positive horizons | Decision |
| --- | ---: | ---: | --- | --- |
| continuation_bullish | 253 | -0.00346516 | none | NOT_PROMOTED_INSUFFICIENT_MATCHED_EDGE |
| continuation_bearish | 294 | -0.00416459 | none | NOT_PROMOTED_INSUFFICIENT_MATCHED_EDGE |
| fvg_context | 8658 | -0.00083700 | none | NOT_PROMOTED_INSUFFICIENT_MATCHED_EDGE |
| ob_context | 1131 | -0.00174747 | none | NOT_PROMOTED_INSUFFICIENT_MATCHED_EDGE |
| structure_transition | 584 | 0.00020853 | none | NO_STANDALONE_PROMOTION_EVIDENCE_ONLY |
| participation_conditioned | 3031 | -0.00149672 | none | NO_STANDALONE_PROMOTION_CONTEXT_ONLY |

## Parent-event overlap

- Accepted parent events: `9374`
- Parent events shared by multiple families: `3358`
- Distribution by number of families: `{'1': 6016, '2': 2435, '3': 627, '4': 296}`

This overlap means family counts must not be interpreted as independent opportunities.

## Gate decision

No family is promoted from this review. The next required work is P0 validation for G7 acceptance-duration/failure metrics and G9 5M confirmation contract. Stage 6, setup selection, entry, SL/TP, PnL backtesting, and live orders remain blocked.
