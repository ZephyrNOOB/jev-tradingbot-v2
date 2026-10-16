# SetupBot Architecture v2

Status: LIVE CORE UPDATED / five active SetupBot families / removed families excluded / no backtest requested

SelectionBot is parent/orchestrator. Five active SetupBot families are equal peer children: FvgContextBot, OrderBlockContextBot, LiquiditySweepReversalBot, BreakerBlockBot, and RbsSbrContinuationBot. SelectionBot evaluates every peer against the same common gates and setup-owned causal evidence. No left-to-right priority, hardcoded favorite, or hidden fallback exists. Each peer emits a strength profile using equal weights: causal 25%, structure 20%, confirmation 20%, liquidity 15%, zone integrity 10%, invalidation 5%, objective 5%. Exactly one primary owner is resolved by causal strength; other valid peers remain `contributing_contexts`. `NO_SELECTION` is reserved for common-gate failure or absence of valid causal setup context, never for ambiguity between valid peers. The selected SetupBot owns Entry, SL, TP, RR, invalidation, objective, post-entry state, and execution.

Immutable pipeline:

```text
1H MarketBiasBot → 15M MarketStructureBot → 5M ConfirmationBot → SelectionBot exclusive handoff → selected SetupBot → execution / costs / trade record
```

ConfirmationBot evidence must retain distinct `rejection_event_id` and `micro_break_event_id`. Same candle cannot represent both independent events.

Selection ownership:

```text
FVG lineage → FvgContextBot
OB lineage → OrderBlockContextBot
LIQUIDITY_SWEEP + reclaim → LiquiditySweepReversalBot
invalidated OB + confirmed flip → BreakerBlockBot
BOS + flipped level + retest → RbsSbrContinuationBot
CHoCH/MSS → structural evidence only; no standalone transition bot
```

New setup cores own complete Entry/SL/TP/RR placement and reasons. They are peer children, not global filters.


Continuation contract: `BOS → broken protected level → retest → hold → 5M continuation break`. Entry uses continuation break; SL uses retest/reclaim failure; TP uses confirmed opposing liquidity/external objective.

CHoCH/MSS is structural evidence only. No standalone transition SetupBot. Causal FVG/OB ownership is required for setup eligibility.

FVG/OB contract: parent displacement/BOS → zone → ACTIVE → touch → rejection → independent micro break → PARTIAL_MITIGATION → entry. Runner replays closed 5M candles through `Zone.update()` and cannot assign lifecycle/evidence directly.

BOS continuation state machine remains executable in `v2/scripts/continuation_transition.py` and must reach `CONTINUATION_CONFIRMED` before RbsSbrContinuationBot plan validation. `ConfirmationBot` preserves this state in runtime context. CHoCH/MSS remains MarketStructureBot structural evidence; no transition SetupBot plan exists.

Compliance requires same event/object identity through producer, lifecycle, ConfirmationBot, SelectionBot, selected SetupBot, execution, and trade record. `runtime_trace()` asserts identity at handoff. Failed runtime trace means `NOT RUN` or `DIAGNOSTIC_ONLY`.

SelectionBot parent selects exactly one peer SetupBot. Each selected bot owns Entry, SL, TP, RR, invalidation, objective, and post-entry state. No global trade plan.

Runtime implementation is complete only when runner supplies each bot's causal context and calls its own executable plan. A core JSON definition or unit self-check alone is not an executable integration. Current runtime path calls `build_plan()` for all five registered setup families; legacy generic `SetupBot.plan()` is disabled.

## Runtime boundary

- MarketStructureBot emits causal FVG/OB objects with `object_id`, `parent_event_id`, source indices, zone bounds, and lifecycle state.
- ConfirmationBot verifies 5M rejection, local structure break, acceptance, and protected-reference integrity. Sideways/RANGE/WAITING/REJECTED/INVALIDATED blocks handoff.
- SelectionBot emits `SELECTION_RESOLVED` with one primary owner or `NO_SELECTION` only when common gates fail/zero causal contexts. Valid non-primary peers remain contributing context. Causal OB events are eligible only when source candle, parent event, zone bounds, and runtime lifecycle object exist.
- FVG/OB lifecycle objects are replayed candle-by-candle from closed 5M candles before SetupBot plan validation. Runner never assigns `TOUCHED` manually; final state comes from `Zone.update()`, while rejection and local-break evidence come from distinct ConfirmationBot event IDs.
- Continuation requires BOS → broken-level retest → hold → 5M continuation break. CHoCH/MSS remains structural evidence only; causal FVG/OB ownership is required. Generic pivot proximity is not setup evidence.
- Selected SetupBot consumes only its own context and emits plan plus reasons.

## FVG lifecycle

`ACTIVE → TOUCHED → PARTIAL_MITIGATION → MITIGATED`; any active state can become `INVALIDATED` or `EXPIRED`. Entry requires `TOUCHED`/`PARTIAL_MITIGATION`, causal lineage, real rejection, local structure break, and no invalidation acceptance.

## OB lifecycle

`ACTIVE → TOUCHED → PARTIAL_MITIGATION → FULL_MITIGATION`; any active state can become `INVALIDATED` or `EXPIRED`. Entry requires `TOUCHED`/`PARTIAL_MITIGATION`, causal lineage, real rejection, local structure break, and no invalidation acceptance.

## Setup ownership

- FVG: FVG zone → full-zone acceptance → parent impulse/opposing liquidity.
- OB: OB zone → full-zone acceptance → parent impulse/opposing liquidity.
- Liquidity sweep reversal: sweep extreme/reclaim zone → opposing liquidity or DOL.
- Breaker block: failed source OB flip/retest → opposing liquidity or DOL.
- RBS/SBR continuation: BOS flip/retest/5M continuation → opposing liquidity or DOL.
- CHoCH/MSS: MarketStructureBot evidence only. No standalone transition SetupBot.

No ATR, volume, age, or RR threshold is added as a global filter. Lifecycle and causal ownership are logic, not filters.
