# SetupBot Loss / Signal Scarcity Root-Cause Analysis

Status: HISTORICAL ANALYSIS ONLY — metrics are not current runtime state. Current live ownership is defined in `SETUP_BOT_ARCHITECTURE_V2.md`.

## Evidence snapshot

Artifact: `v2/artifacts/ARCHITECTURE_V2_BACKTEST.json`, `v2/artifacts/ARCHITECTURE_V2_TRADES.json`

| SetupBot | Trades | Wins | Losses | Net PnL |
|---|---:|---:|---:|---:|
| BullishContinuationBot | 1 | 0 | 1 | -7.56 |
| BearishContinuationBot | 0 | 0 | 0 | 0.00 |
| StructureTransitionBot | 39 | 5 | 34 | -60.00 |
| FvgContextBot | 510 | 316 | 194 | +376.30 |
| OrderBlockContextBot | 720 | 423 | 297 | +840.60 |
| ParticipationConditionedBot | 0 | 0 | 0 | 0.00 |

## Root causes proven from code and trade records

### 1. Continuation scarcity is SelectionBot starvation, not proof that core logic fails

Trade records show continuation eligibility in the SelectionBot ledger:

- Bullish continuation eligible: 314 events; executed: 1.
- Bearish continuation eligible: 407 events; executed: 0.

SelectionBot appends candidates in this order:

```text
CHoCH/MSS → StructureTransitionBot
FVG → FvgContextBot
BOS/CHoCH with OB → OrderBlockContextBot
BOS → Bullish/BearishContinuationBot
Participation → ParticipationConditionedBot
```

It then executes `candidates[0]`.

Therefore a BOS with a causal OB selects `OrderBlockContextBot` before continuation. Continuation is not evaluated as an independent peer outcome. This is a routing defect, not evidence that BullishContinuationBot or BearishContinuationBot has no valid signals.

### 2. Continuation plan geometry is also defective when it is reached

The only BullishContinuation trade has RR `0.1027`. This is not a healthy continuation objective. `setup_context()` creates a generic acceptance zone around entry and derives objective from the nearest pivot. `bullish()` / `bearish()` then choose the nearest objective boundary.

Observed consequence:

```text
entry → TP distance is tiny
fees + slippage consume expected move
```

The executable is setup-owned, but its supplied context is still generic. Core ownership is not enough; context must be causal continuation context.

### 3. ParticipationConditionedBot has 894 eligible ledger appearances but zero execution

Ledger evidence:

```text
participation_conditioned eligible: 894
executed: 0
```

SelectionBot places participation after FVG, OB, and continuation candidates, then takes the first candidate. Participation is therefore starved by exclusive selection. This is expected under the current architecture because participation is a modifier, not a primary setup. Its zero trades do not prove participation logic fails.

Additional implementation defect: when selected, runner builds a base continuation plan and passes it into ParticipationConditionedBot. The participation bot is therefore not independently signal-generating; it can only qualify a base setup.

### 4. StructureTransitionBot loss is mainly target geometry, not signal count

Observed:

```text
39 trades
5 net winners
34 net losses
18 stop losses: -53.62 net
21 target exits: -6.38 net total
median RR: 0.283
```

Sixteen of twenty-one target exits are still net losses. That means target was reached gross, but realized move was too small to pay costs. The transition executable uses the nearest external-liquidity boundary and allows extremely small natural RR. The code also uses `event.protected_level` as `transition_invalidation`; that is a structure reference, not necessarily the CHoCH origin/reclaim-failure invalidation required by the transition core.

Root cause classification:

```text
primary: transition-specific invalidation/objective geometry mismatch
secondary: target distance below round-trip cost for many trades
not proven: ConfirmationBot signal quality alone
```

### 5. FvgContextBot losses

Observed:

```text
510 trades
81 stop losses: -191.70 net
6 stop_first: -17.01 net
4 timeout: -0.37 net
105 target exits net-negative after costs
```

The main positive edge comes from 419 target exits totaling +585.38 net. The loss mechanism is not timeout; it is failed FVG reactions and cost-negative small targets.

Code-level defects:

- `aligned_rejection` is one candle closing beyond the zone, not a separately confirmed 5M rejection plus subsequent local structure break.
- `micro_break = True` is assigned from the same candle; it is not an independently identified micro swing break.
- lifecycle replay ends at entry; post-entry zone state is not separated from position invalidation state.
- FVG event construction has no explicit displacement-strength/parent BOS lineage for FVG events; the FVG object can be generated directly from three candles.
- All 510 FVG trades are BULLISH. Bearish FVG path produced no executed trade. This asymmetry requires audit before interpreting FVG profitability as direction-neutral.

### 6. OrderBlockContextBot losses

Observed:

```text
720 trades
101 stop losses: -313.07 net
6 stop_first: -32.81 net
11 timeout: +11.26 net
183 target exits net-negative
```

The OB path is active, unlike previous runs. Losses are concentrated in invalidation failures and cost-negative targets, not timeout.

Code-level defects:

- OB source is selected as the last opposing candle within a fixed 12-bar scan. That is a causal approximation, not proof that the candle caused the displacement.
- `ob_displacement_event_id` is set to `event.event_id`, but the event is not independently validated as a displacement event with displacement evidence.
- runner sets `ob_rejection_confirmed=True` and `local_structure_break=True` inside `setup_context()` before actual ConfirmationBot evidence is attached. This is forced evidence at context construction, even though lifecycle state itself is replayed.
- `Zone.update()` tracks zone touch/mitigation, but does not produce independent rejection and micro-structure event objects.
- all OB entries use midpoint of OB zone; no setup-specific entry rule distinguishes proximal boundary, equilibrium, or confirmation price.
- target uses `parent_impulse_objective`, but runner supplies generic opposing pivots, not a parent-event objective.

Therefore OB positive net is useful diagnostic evidence, but not yet clean causal proof.

## Research cross-check

Research supports the diagnosis categories, not the exact local counts:

1. Formal breakout research treats support/resistance break as a specific event definition; this supports separating breakout event identity from generic pivot proximity. Brock, Lakonishok, and LeBaron test trading-range break rules: https://www.jstor.org/stable/2328994
2. Empirical pullback/throwback analysis distinguishes partial versus full retracement and reports materially different continuation outcomes; this supports setup-specific invalidation and avoiding generic zone geometry: https://thepatternsite.com/ThrowPull.html
3. A recent reproducible technical-analysis study emphasizes explicit pattern formalization, transaction costs, and out-of-sample validation; this supports not treating win rate or gross target hits as proof: https://umu.diva-portal.org/smash/get/diva2:2076318/FULLTEXT01.pdf
4. Trading-cost research shows net returns depend materially on execution costs and strategy turnover; this supports the finding that tiny RR target exits become net losses: https://pages.stern.nyu.edu/~afrazzin/pdf/Trading%20Cost%20of%20Asset%20Pricing%20Anomalies%20-%20Frazzini%2C%20Israel%20and%20Moskowitz.pdf

## Decisions

- Do not patch with global filters.
- Do not eliminate continuation or participation from zero executed trades; both are selection-starved.
- Fix SelectionBot evidence routing/ownership first, while preserving exclusive one-bot handoff.
- Fix continuation-specific causal objective/invalidation separately.
- Fix transition invalidation and target objective separately.
- Replace forced OB/FVG rejection flags with ConfirmationBot-produced evidence objects.
- Keep current PnL diagnostic-only. No promotion decision.

## Required next experiment

One layer only: repair runtime evidence and SelectionBot routing so every eligible peer can be observed without executing parallel trades. Compare stable event keys and report selected, rejected, and starved candidates before changing Entry/SL/TP.
