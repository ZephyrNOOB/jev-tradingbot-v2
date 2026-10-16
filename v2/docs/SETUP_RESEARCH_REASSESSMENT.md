# Setup Research Reassessment

Status: HISTORICAL RESEARCH SHORTLIST ONLY. Current live runtime uses five SetupBots defined in `SETUP_BOT_ARCHITECTURE_V2.md`.

## Removal decision

Removed from active setup registry per user instruction:

```text
LiquidityReclaimBot
FvgObConfluenceBot
RangeBoundaryReclaimBot
```

Reasons from rough evidence:

```text
LiquidityReclaimBot: 17 trades, 17.65% WR, -$26.54; sample too small and negative.
FvgObConfluenceBot: 610 trades, 53.93% WR, -$94.15; confluence did not demonstrate edge after rough costs.
RangeBoundaryReclaimBot: 0 trades; no testable evidence.
```

The rough test is diagnostic only. The previous TP-short bug and provisional trade plan prevent promotion of any remaining setup.

## Remaining candidates

```text
StructureTransitionBot
OrderBlockContextBot
BearishContinuationBot
ParticipationConditionedBot
FvgContextBot
BullishContinuationBot
```

## Research-backed interpretation

1. Trend/continuation effects are plausible in crypto, but results are regime- and cost-dependent. High-frequency breakout/technical-rule evidence requires out-of-sample and transaction-cost controls.[1][2]
2. Price-and-volume trend factors provide a stronger research basis than an isolated visual FVG or OB label, but they do not prove a single BTCUSDT setup will remain profitable.[3]
3. Crypto microstructure/order-flow research supports using participation and order-flow variables as context, not as a replacement for confirmed market structure.[4][5]
4. FVG/OB terminology is operationally subjective and requires explicit lifecycle, parent impulse, retest, invalidation, and provenance rules before it can be tested fairly.[6]

## Provisional shortlist, not promotion

### 1. StructureTransitionBot
Best research fit for the locked core because it uses a confirmed protected-swing close break plus displacement and CHoCH/MSS. It represents a state transition, not a raw wick or isolated label. Rough result was strongest, but must be re-tested with correct directional TP and exclusive SelectionBot execution.

### 2. OrderBlockContextBot
Candidate because OB is anchored to a displacement origin and aligned 15M state, then requires 5M return/response. It must retain POI identity, lifecycle, invalidation, and parent impulse. Rough result was positive, but not validated.

### 3. BearishContinuationBot / BullishContinuationBot as one symmetric continuation family
Continuation aligns with confirmed structure and protected swing. The asymmetric rough results are not enough to reject bullish continuation because the rough short TP implementation was wrong. Re-test both sides under identical directional formulas before selection.

### 4. ParticipationConditionedBot
Context overlay only. It can qualify a base structure setup when participation supports price acceptance. It must never create a signal from volume alone and should not be treated as an independent primary setup until controlled ablation proves incremental lift.

### 5. FvgContextBot
Keep as lower-priority annotation/context candidate. Require displacement-created FVG, return to zone, 5M response, local swing break, and non-acceptance through invalidation. Rough result was near breakeven; no promotion.

## Selection order for next controlled test

```text
StructureTransitionBot
OrderBlockContextBot
Continuation family (bullish/bearish)
FvgContextBot
ParticipationConditionedBot as context modifier
```

This is a test priority, not a profitability claim. SelectionBot must still choose exactly one bot after the locked gates; no parallel independent candidates.

## Required next test

```text
freeze remaining registry
fix directional TP for LONG/SHORT
implement exclusive SelectionBot
use exact 1H → 15M → 5M pipeline
use setup-specific Entry/SL/TP hypotheses
include fees, slippage, and funding state
compare stable opportunity keys
run train/holdout or purged walk-forward
promote only after evidence gate passes
```

## Sources

[1] https://doras.dcu.ie/25053/1/The_effectiveness_of_technical_trading_rules_in_cryptocurrency_markets%5B1%5D.pdf
[2] https://arxiv.org/html/2602.11708v1
[3] https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/trend-factor-for-the-cross-section-of-cryptocurrency-returns/
[4] https://stoye.economics.cornell.edu/docs/Easley_ssrn-4814346.pdf
[5] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[6] https://realbacktesting.com/academy/order-blocks-fair-value-gaps-explained.html
