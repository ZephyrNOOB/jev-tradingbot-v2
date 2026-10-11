# SetupBot Researched Repair Solutions

Status: RESEARCH / SOLUTION DESIGN ONLY. No code patch. No backtest rerun.

## Evidence baseline

Source artifacts:

- `v2/artifacts/ARCHITECTURE_V2_BACKTEST.json`
- `v2/artifacts/ARCHITECTURE_V2_TRADES.json`
- `v2/scripts/architecture_v2.py`
- `v2/scripts/paper_context.py`
- `v2/scripts/setup_bots_executable.py`

## Shared rule

Do not solve any issue with a global threshold, global filter, global RR, or candidate priority. Repair event identity, causal lineage, lifecycle, setup-owned objective, and exclusive handoff.

## 1. BullishContinuationBot / BearishContinuationBot

### Proven problem

Continuation candidates appear in SelectionBot ledger 314 bullish and 407 bearish times, but only one bullish trade and zero bearish trades execute. `SelectionBot` selects `candidates[0]`; OB/FVG/transition candidates precede continuation. This is routing starvation, not proof of a failed continuation core.

When continuation executes, runner supplies a generic acceptance zone and nearest pivot objective. The only bullish trade has RR 0.1027. Expected movement cannot cover round-trip costs.

### Researched solution

Use a continuation-specific causal event contract:

```text
confirmed BOS in bias direction
→ broken protected swing / level identity
→ breakout close acceptance
→ first return to the broken level
→ retest holds as new support/resistance
→ 5M continuation break away from retest
→ continuation plan
```

Breakout-pullback-continuation is formally a sequence of breakout, return test, and continuation; treating proximity to a pivot as a retest loses the event identity. LuxAlgo describes this three-phase structure: https://www.luxalgo.com/library/concept/breakout-pullback-continuation/

Use a `ContinuationEvent` carrying:

```text
break_event_id
broken_level
break_source_indices
retest_source_indices
retest_state: WAITING / TOUCHED / HELD / FAILED
continuation_break_indices
side
objective_source_event
invalidation_source_event
```

Entry logic owned by continuation bot:

```text
entry = confirmed 5M break after retest hold
```

SL logic:

```text
beyond retest failure / broken-level reclaim failure
```

TP logic:

```text
next confirmed opposing liquidity or next external structural objective
```

Do not use nearest arbitrary pivot when it creates cost-negative geometry. If no setup-owned objective exists beyond execution cost, bot returns `NO_PLAN`; this is a geometry validity decision, not a global filter.

### Selection repair

Keep one exclusive trade. Add an evidence ledger field per candidate:

```text
eligible
rejection_reason
causal_event_id
objective_available
```

SelectionBot must select based on the event's causal category. For a pure BOS continuation event with no accepted FVG/OB consumer, continuation is selected. If the same event has a valid OB, selection must record why OB owns the event; continuation is not silently starved. No hardcoded left-to-right priority.

### Acceptance evidence

- Bullish and bearish continuation events both reach candidate evaluation.
- Every selected continuation trade carries `break_event_id`, retest state, invalidation source, objective source.
- RR distribution is natural and objective-derived.
- No continuation trade uses generic `acceptance_zone` or protected-level SL fallback.

## 2. StructureTransitionBot

### Proven problem

39 trades; 34 losses; 18 stop exits net -$53.62; 21 target exits net -$6.38; 16 of 21 target exits are still net-negative. Median RR is 0.283. Current code uses `event.protected_level` as transition invalidation and nearest external pivot as target.

### Researched solution

Model transition as a two-stage state machine:

```text
old regime protected reference
→ first counter-break / CHoCH
→ displacement away from reference
→ origin/reclaim zone
→ retest of transition origin
→ reclaim holds
→ continuation in new direction
```

CHoCH is earliest evidence of character shift, not confirmation that a new trend is already established; a transition bot must distinguish first counter-break from confirmed continuation. LuxAlgo describes CHoCH as early structural evidence of a shift toward reversal or range: https://www.luxalgo.com/library/concept/change-of-character/

Replace generic invalidation with transition-owned invalidation:

```text
transition_invalid_level = CHoCH origin / protected counter-swing
```

Not:

```text
event.protected_level from generic structure event
```

Entry:

```text
retest of CHoCH origin + 5M rejection + local break in new direction
```

TP:

```text
first confirmed external liquidity objective after transition
```

If objective is inside round-trip cost or is already consumed, transition plan is invalid. This is not a global RR filter; it is the bot's own objective geometry.

### Acceptance evidence

- Transition records CHoCH origin, counter-break, displacement, retest, and reclaim separately.
- Stop losses map to transition failure, not generic protected swing.
- Target exits have positive gross distance sufficient to cover recorded cost.
- Report transition outcomes separately for reversal continuation and range failure.

## 3. FvgContextBot

### Proven problem

510 trades; 81 stop, 6 stop-first, 4 timeout. 105 target exits are net-negative after costs. All 510 trades are bullish. Runner currently marks rejection/local break from the same candle; that is not independent confirmation.

### Researched solution

Use a causal FVG lifecycle:

```text
parent displacement/BOS
→ three-candle imbalance object
→ ACTIVE
→ return/touch
→ rejection candle
→ independent 5M micro break
→ PARTIAL_MITIGATION
→ entry
```

FVG is not a standalone three-candle label. It must reference the displacement parent and retain zone identity. Research on SMC itself is practitioner material, not an accepted academic standard; use it as a formalization hypothesis, then validate on local data. A practitioner overview describes FVG/OB as subjective and difficult to test: https://realbacktesting.com/academy/order-blocks-and-fair-value-gaps-explained.html

Separate evidence:

```text
rejection_event_id
micro_break_event_id
rejection_source_index
micro_break_source_indices
```

Never set both true from one candle.

Entry:

```text
rejection after return + following micro break
```

SL:

```text
outside FVG boundary / acceptance invalidation
```

TP:

```text
parent displacement objective or confirmed opposing liquidity
```

Add bearish path symmetry through the same event schema; do not assume bullish results transfer to bearish FVGs.

### Acceptance evidence

- Bullish and bearish FVG candidates counted separately.
- No FVG trade has forced rejection or forced local break.
- Zone replay ends at entry for entry eligibility, then post-entry invalidation state is tracked separately.
- Loss attribution distinguishes failed rejection, full mitigation, invalidation, and cost-negative objective.

## 4. OrderBlockContextBot

### Proven problem

720 trades; 101 stop, 6 stop-first, 11 timeout. 183 target exits are net-negative. OB source candle is selected as the last opposing candle in a 12-bar window. Runner sets rejection and local-break flags in context before evidence is independently produced.

### Researched solution

Use a causal OB object:

```text
confirmed displacement/BOS
→ identify last opposing candle immediately preceding displacement
→ source candle zone
→ parent event link
→ ACTIVE
→ return/touch
→ rejection
→ independent local break
→ TOUCHED/PARTIAL_MITIGATION
→ entry
```

The source candle is eligible only if it is linked to the confirmed displacement event, not merely directionally opposite within a lookback window. Order-flow literature supports treating price impact as a function of supply-demand imbalance and available depth, but OHLCV is not L2 order flow. Bouchaud et al. find a relation between order-flow imbalance and price change, with slope related to market depth: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1712822

Required object fields:

```text
ob_object_id
parent_displacement_event_id
source_candle_index
source_candle_role
zone_low / zone_high
rejection_event_id
micro_break_event_id
lifecycle_state
invalidation_event_id
objective_event_id
```

Entry:

```text
return into causal OB + independent rejection + local break
```

SL:

```text
beyond OB invalidation boundary
```

TP:

```text
parent displacement objective / confirmed opposing liquidity
```

Remove runner assignments:

```text
ob_rejection_confirmed=True
local_structure_break=True
```

Those fields must come from ConfirmationBot evidence.

Do not call taker-buy volume order flow. Label it volume-side proxy unless actual trades/order book data are present.

### Acceptance evidence

- OB source candle has parent displacement proof.
- Rejection and micro break have separate event IDs/source indices.
- OB trade record retains lifecycle history and invalidation reason.
- Target objective is parent-event-derived, not a generic pivot.
- OHLCV participation remains a proxy and is not promoted to L2 evidence.

## 5. ParticipationConditionedBot

### Proven problem

Participation appears 894 times in selection ledgers but executes zero trades. It loses exclusive selection to FVG, OB, transition, or continuation. The core contract correctly treats participation as a modifier, not an independent signal.

### Researched solution

Keep ParticipationConditionedBot as a modifier of an already valid base setup. Do not force it to create standalone trades.

Correct runtime path:

```text
base setup event
→ base SetupBot plan valid
→ participation evidence attached to same event window
→ ParticipationConditionedBot qualifies that base plan
→ selected bot owns final plan record
```

Participation evidence must be time-aligned with the base event:

```text
participation_source_indices
participation_side
participation_measure_type
participation_proxy_or_L2
participation_alignment
```

Use true order-flow imbalance only with trade/order-book data. Existing `taker_buy_volume` is a directional volume proxy. Literature finds order-flow imbalance can explain short-horizon price changes, but the result is data-type-specific: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1712822

Selection repair:

```text
base setup remains the causal owner
participation becomes a qualification state on that base event
```

Do not route the same event into a parallel independent participation trade. If the base bot already owns the event and participation only confirms it, record:

```text
participation_qualified=true
participation_owner=base_setup_id
```

If the architecture insists on a separate ParticipationConditionedBot execution record, SelectionBot must explicitly select it only when a base plan and participation evidence both exist; no candidate-order fallback.

### Acceptance evidence

- Zero trades is not treated as failure if no base setup reaches qualification.
- Report base candidates, participation-qualified candidates, and rejected candidates separately.
- Participation trade record includes base event ID and base plan identity.
- No participation-only trade.

## Research principles applied

Transaction-cost research consistently warns that gross technical-rule performance can disappear after costs and that trading design must account for costs during selection: https://www.scailett.ch/pdfs/BajSca.pdf

Take-profit optimization research treats TP as an objective stopping problem affected by drift, volatility, and transaction cost; it supports setup-owned objective research rather than one global RR menu: https://www.mdpi.com/2297-8747/22/1/1

## Repair order

1. Remove SelectionBot silent `candidates[0]` routing; preserve exactly one selected bot with explicit causal ownership.
2. Replace forced FVG/OB rejection flags with ConfirmationBot evidence objects.
3. Add continuation event state and transition-owned invalidation/objective.
4. Add independent FVG/OB rejection and micro-break lineage.
5. Make ParticipationConditionedBot a base-plan modifier with separate attribution.
6. Add per-event trace validator before any PnL backtest.
7. Run one controlled backtest only after runtime trace gate passes.

No global filter. No fixed RR. No threshold stacking.
