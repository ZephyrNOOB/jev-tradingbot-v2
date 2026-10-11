# Bullish/Bearish Continuation Core — SMC Audit

Status: AUDIT COMPLETE / UPSTREAM PATCH APPLIED / DOWNSTREAM SETUP PROMOTION STILL BLOCKED
Scope: MarketStructureBot core → ConfirmationBot core → BullishContinuationBot / BearishContinuationBot core and executable path.

## Executive finding

The original audit identified material upstream gaps. Those gaps are now addressed for the authoritative 15M structure and 5M confirmation paths; downstream setup promotion remains blocked pending validation.

```text
Written contract: aligned
Authoritative MarketStructureBot: patched and validated
Authoritative ConfirmationBot: patched and validated
Continuation state machine: still requires downstream promotion evidence
Bullish/Bearish executable plans: unchanged and not promoted
```

No backtest or consequential validation was run.

## Pipeline readback

```text
1H bias
→ 15M confirms bias and builds HH/HL/LH/LL + protected reference + BOS/CHoCH/MSS + POI
→ 5M confirms 15M structure
→ SelectionBot resolves causal owner
→ BullishContinuationBot or BearishContinuationBot owns Entry/SL/TP/RR
```

The historical findings below explain the pre-patch gaps. The active path now routes through the authoritative modules named above; the downstream continuation bots remain out of scope for this patch.

## MarketStructureBot audit

### Written core strengths

The written core correctly defines:

- confirmed pivots, not unconfirmed wick extremes;
- HH/HL/LH/LL and protected swings as authority;
- BOS as a completed-candle close beyond an identified protected swing;
- wick-only breach as non-BOS;
- CHoCH/MSS as first counter-break evidence, not automatic reversal entry;
- FVG as a three-candle imbalance with lineage and lifecycle;
- OB as a causal opposing source candle linked to displacement and structure;
- sweep as pool breach plus reclaim/response, not one arbitrary wick;
- no entry, SL, TP, or 5M trigger ownership.

### Executable gaps

`v2/scripts/market_structure_core.py` does not fully implement its JSON/MD contract:

1. It emits swing, liquidity-pool, BOS/CHoCH, and FVG events, but no executable Order Block event.
2. Its FVG event lacks zone boundaries in the `Event` object, despite the contract requiring boundaries.
3. `parent_event_id=last_fvg` links an FVG to the previous FVG, not necessarily to its causal displacement/BOS parent.
4. BOS classification uses the latest confirmed pivot references but does not explicitly maintain protected-swing lifecycle/identity per regime.
5. No executable displacement test validates that the break is impulsive rather than a slow grind.
6. No executable sweep/reclaim event lifecycle exists in this core.
7. Internal/external swing labels are emitted, but HH/HL/LH/LL classification is not emitted as a first-class event/output.

Conclusion: written MarketStructureBot core is conceptually SMC-aligned; executable core is a structural skeleton, not full SMC implementation.

## ConfirmationBot audit

### Written core strengths

The written core correctly requires:

- immutable 15M input;
- 5M directional alignment;
- micro swing confirmation;
- close beyond micro high/low;
- displacement;
- acceptance/retest hold or failure;
- protected reference intact;
- no setup selection before CONFIRMED;
- wick-only and single-candle evidence rejection.

### Executable gaps

`architecture_v2.py:ConfirmationBot.run()` currently checks a compact candle relation:

```text
bullish candle + close above level + previous candle bullish
bearish candle + close below level + previous candle bearish
```

It does not calculate or prove:

- a 5M HL or failed LL for bullish confirmation;
- a 5M LH or failed HH for bearish confirmation;
- displacement as a measurable price-action event;
- retest hold/rejection as a distinct sequence;
- protected-reference intact status;
- a separate close-confirmed micro swing identity;
- follow-through across more than one candle.

The returned `rejection_event_id` and `micro_break_event_id` are metadata generated after the compact condition. IDs do not prove the underlying rejection and break occurred.

Conclusion: ConfirmationBot written core is SMC-shaped, executable confirmation is not yet equivalent to the written core.

## BullishContinuationBot audit

### Correct elements

Written core correctly states:

```text
1H_BULLISH
15M_BULLISH
HH/HL sequence
protected HL intact
15M accepted BOS
5M bullish continuation
5M close above micro high
retest hold
entry after continuation
SL below setup-owned protected HL / invalidation swing
TP next confirmed opposing liquidity
```

Executable plan correctly requires:

```text
continuation_event_id
retest_source_indices
continuation_source_indices
acceptance_zone
protected_hl
next_opposing_liquidity
```

It also checks long geometry:

```text
SL < Entry < TP
```

### Problems

1. `setup_bots_executable.bullish()` trusts `continuation_context()` but does not validate that the 5M confirmation IDs belong to the same continuation event package.
2. Entry is set at `acceptance_zone[1]`, not necessarily at a confirmed 5M close/retest-hold price or a defined SMC discount/PD-array location.
3. The context does not prove a bullish 5M HL; it only receives state-machine indices.
4. The state machine's bullish confirmation is based on `candle.close > candle.open` after retest, not a confirmed micro BOS with displacement.
5. SL references `obj.invalidation_level`, which is initialized from the broken level. This can be the wrong protected HL geometry for a continuation trade. The setup should own the invalidation swing formed during retest/continuation, not blindly reuse the BOS reference.
6. TP uses a precomputed pivot objective, but the core requires next confirmed opposing liquidity/structure. Objective lineage is not preserved in the plan context.
7. No premium/discount or OTE relationship is represented. This is not mandatory for every SMC dialect, but the user's doctrine expects discount/OTE for buys.
8. No explicit `bias_id`, `structure_event_id`, or `confirmation_event_id` survives into `TradePlan`.

## BearishContinuationBot audit

### Correct elements

Written core correctly mirrors bullish logic:

```text
1H_BEARISH
15M_BEARISH
LH/LL sequence
protected LH intact
15M accepted BOS
5M bearish continuation
5M close below micro low
retest failure
entry after continuation
SL above setup-owned protected LH / invalidation swing
TP next confirmed opposing liquidity
```

Executable plan correctly requires:

```text
continuation_event_id
retest_source_indices
continuation_source_indices
acceptance_zone
protected_lh
next_opposing_liquidity
```

It checks short geometry:

```text
TP < Entry < SL
```

### Problems

1. Same missing 5M HL/LH, displacement, and distinct retest proof as bullish side.
2. Bearish entry at `acceptance_zone[0]` is not tied to a confirmed rejection/retest price.
3. Bearish state-machine confirmation uses bearish candle direction after retest, not a confirmed micro BOS with displacement.
4. `protected_lh` is derived from the same generic invalidation reference pattern; setup-owned bearish invalidation is not independently established.
5. Objective lineage is not preserved.
6. No premium/discount representation for short entries in premium.
7. No complete event-package identity in `TradePlan`.

## Why both bots produced zero trades

The latest zero result cannot be attributed only to bad continuation setup logic.

There are four separate failure paths:

```text
1. BOS events with causal OB are routed to OrderBlockContextBot.
2. BOS without causal OB require ContinuationEvent state confirmation.
3. ConfirmationBot does not produce full structural evidence required by the written core.
4. Continuation plan validation requires state-machine indices that may never be produced.
```

Therefore:

```text
zero trades ≠ proven continuation edge failure
zero trades = routing + incomplete upstream evidence + strict plan contract
```

The two setup functions themselves contain real SMC-completeness gaps, but shared upstream components must not be patched during continuation isolation.

## Research synthesis

LuxAlgo's market-structure reference describes BOS as continuation evidence and notes that many conventions require a candle body close beyond the swing because a wick-only poke can be a liquidity sweep.[1]

LuxAlgo describes CHoCH as early evidence of a character shift, not the same thing as continuation BOS.[2]

ICT/SMC continuation material consistently treats BOS as the structural event, then waits for a pullback into a POI such as OB/FVG and lower-timeframe confirmation rather than entering on the break itself.[3][4]

The SMC references reviewed distinguish CHoCH from MSS by requiring displacement for the stronger shift interpretation. A label alone is insufficient.[4]

Order-block mitigation research reviewed requires an original displacement leg, a held OB boundary, a return to the zone, and lower-timeframe confirmation. A close through the OB extreme invalidates mitigation and changes the interpretation.[3]

These sources support the following continuation contract:

```text
15M BOS close beyond protected swing
→ BOS displacement evidence
→ causal impulse / POI identity
→ return to continuation POI or broken-level retest
→ 5M rejection / hold
→ 5M micro BOS with displacement
→ entry
```

## Corrected continuation core contract

This is the repair target. It does not yet patch shared bots.

### BullishContinuationBot

```text
Inputs:
  bias_id = confirmed 1H bullish bias
  structure_event_id = confirmed 15M bullish BOS
  protected_HL_id = active setup-owned protected HL
  bos_displacement_id = causal displacement event
  retest_id = 5M return/retest event
  micro_bos_id = 5M bullish close beyond confirmed micro high
  acceptance_id = 5M hold/rejection after retest
  objective_id = next confirmed opposing liquidity

Eligibility:
  all IDs belong to same causal structure package
  15M BOS is close-confirmed, not wick-only
  BOS has displacement evidence
  protected HL remains intact
  5M retest occurs after BOS
  5M micro BOS occurs after retest
  5M displacement exists
  no close through setup invalidation

Entry:
  setup-owned continuation POI / retest acceptance zone

SL:
  below setup-owned invalidation HL or POI extreme, with explicit reason

TP:
  next confirmed opposing liquidity/objective by objective_id
```

### BearishContinuationBot

```text
Inputs:
  bias_id = confirmed 1H bearish bias
  structure_event_id = confirmed 15M bearish BOS
  protected_LH_id = active setup-owned protected LH
  bos_displacement_id = causal displacement event
  retest_id = 5M return/retest event
  micro_bos_id = 5M bearish close below confirmed micro low
  acceptance_id = 5M rejection/hold after retest
  objective_id = next confirmed opposing liquidity

Eligibility:
  all IDs belong to same causal structure package
  15M BOS is close-confirmed, not wick-only
  BOS has displacement evidence
  protected LH remains intact
  5M retest occurs after BOS
  5M micro BOS occurs after retest
  5M displacement exists
  no close through setup invalidation

Entry:
  setup-owned continuation POI / retest rejection zone

SL:
  above setup-owned invalidation LH or POI extreme, with explicit reason

TP:
  next confirmed opposing liquidity/objective by objective_id
```

## Patch decision

Found problems. Research supports repair.

No patch is applied in this audit because the required evidence is split across MarketStructureBot, ConfirmationBot, and both setup bots. Patching only the two setup files would create metadata that upstream does not actually produce. The next patch must be isolated and staged:

```text
Stage A: add continuation-only evidence contract and rejection instrumentation
Stage B: patch BullishContinuationBot and BearishContinuationBot executable logic
Stage C: validate runtime identity without changing MarketStructureBot or ConfirmationBot behavior
Stage D: only after explicit backtest command, run isolated continuation diagnostic
```

MarketStructureBot and ConfirmationBot remain untouched.

## Sources

[1] LuxAlgo, Break of Structure: https://www.luxalgo.com/library/concept/break-of-structure/

[2] LuxAlgo, Change of Character: https://www.luxalgo.com/library/concept/change-of-character/

[3] ICT Mitigation Block explanation: https://innercircletrader.net/tutorials/ict-mitigation-block-explained/

[4] Smart Money Concepts market-structure guide: https://smartinggoods.com/blog/market-structure-trading
