# SetupBot Core Gap Analysis

Status: HISTORICAL GAP RECORD. Superseded by current five-SetupBot runtime implementation in `SETUP_BOT_ARCHITECTURE_V2.md`.

## Finding 1 — Global trade plan defect

Previous executable runner routed all six bots through one `SetupBot.plan()` function. It used one protected-level reference, one range-width geometry, and generic target ratios. This violated setup ownership. No setup had independent entry, invalidation, objective, or exit-state logic.

## Finding 2 — StructureTransitionBot status

`StructureTransitionBot` existed in the retained six-family registry and in historical Hasil Uji artifacts. It was not newly invented by the latest runner. It remains a retained research family, but has not been promoted. Its task is first counter-break transition, not continuation.

## Finding 3 — Setup-specific methodology

The six cores now define separate responsibilities:

- BullishContinuationBot: bullish continuation acceptance; invalidation below its own continuation HL; target next opposing confirmed structure/liquidity.
- BearishContinuationBot: bearish continuation acceptance; invalidation above its own continuation LH; target next opposing confirmed structure/liquidity.
- StructureTransitionBot: CHoCH/MSS retest acceptance; invalidation at transition reclaim failure; target opposing external liquidity.
- FvgContextBot: causal FVG return/rejection; invalidation through full FVG; target parent impulse/opposing liquidity.
- OrderBlockContextBot: causal OB return/rejection; invalidation through OB; target parent impulse/opposing liquidity.
- ParticipationConditionedBot: existing base setup first; participation only confirms/rejects; inherits base invalidation/objective.

## Finding 4 — Sideways gate

ConfirmationBot already has a boundary in its contract: incomplete evidence is WAITING, contradiction is REJECTED, protected break is INVALIDATED, and no setup selection occurs before CONFIRMED. SelectionBot already has gates: valid 1H bias, 15M confirmation, valid structure, eligible category, and 5M CONFIRMED. However, the executable runner did not implement a complete explicit RANGE/sideways rejection record. The boundary must be executable and auditable: 15M RANGE/UNKNOWN, 5M WAITING/REJECTED/INVALIDATED, missing displacement, missing acceptance, or missing protected-reference integrity must produce NO_SELECTION with reason.

## Finding 5 — Timeout

Timeout is an execution-policy state, not a SetupBot signal. Current runner closes after 48 five-minute candles (4 hours) when neither setup-owned invalidation nor setup-owned objective is reached. Setup cores now require explicit exit states, but no new performance conclusion is drawn until those executable states are implemented.

## Decision

No setup promotion. No threshold tightening. Implement executable setup-owned plans and explicit sideways gates before the next backtest.
