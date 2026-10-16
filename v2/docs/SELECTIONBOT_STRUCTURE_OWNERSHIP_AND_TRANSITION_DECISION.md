# SelectionBot Structure Ownership and StructureTransition Decision

Status: HISTORICAL ARCHITECTURE DECISION / not runtime registry. Current live ownership is defined in `SETUP_BOT_ARCHITECTURE_V2.md`.

## Decision

`StructureTransitionBot` should be removed from the active architecture.

Reason is not only poor PnL. It has no independent responsibility in the user's locked architecture and duplicates a structural transition already owned by MarketStructureBot:

```text
MarketStructureBot: confirmed CHoCH/MSS and transition state
ConfirmationBot: 5M confirmation of 15M structure
SelectionBot: selects one setup
selected SetupBot: owns Entry / SL / TP / RR / execution
```

A separate StructureTransitionBot makes CHoCH/MSS both a MarketStructureBot structural output and a separate SetupBot family. This violates the clean ownership boundary unless an approved transition-specific entry family exists. The user did not approve that family.

## Local evidence

Artifacts:

```text
v2/artifacts/ARCHITECTURE_V2_BACKTEST.json
v2/artifacts/ARCHITECTURE_V2_TRADES.json
v2/artifacts/SETUP_RESEARCH_REGISTRY.json
v2/artifacts/SETUP_BOT_CORES.json
```

Results:

```text
State-machine run:
  StructureTransitionBot: 47 trades, 2 wins, 45 losses, net -$59.11

Previous run:
  StructureTransitionBot: 39 trades, 5 wins, 34 losses, net -$60.00

Latest legacy parallel-candidate run:
  StructureTransitionBot: 0 trades because legacy ambiguous candidate sets became NO_SELECTION; this is historical evidence only, not current runtime behavior.
```

The result is not a temporary scarcity problem. The bot's own contract overlaps with MarketStructureBot's CHoCH/MSS authority and produced no independent validated edge. The historical result remains evidence only; active promotion is rejected.

## SelectionBot root problem

Current candidate model treats these as peers competing in one flat list:

```text
BOS continuation
CHoCH transition
FVG context
OB context
participation modifier
```

That is wrong ontology. FVG and OB are causal POI contexts attached to a structural event; participation is a modifier. They should not compete with a structural thesis using list order.

The correct SelectionBot input is a single confirmed event package:

```text
StructurePackage {
  primary_event_id
  structure_kind: BOS / CHoCH_MSS
  side
  bias_alignment
  protected_reference
  confirmation_event_id
  confirmation_source_indices
  poi_objects[]
  lifecycle_states[]
  evidence_ledger
}
```

SelectionBot must first identify the structural thesis from confirmed 15M structure plus 5M confirmation. Then it selects one eligible SetupBot using causal ownership.

## Correct ownership matrix

| Confirmed structure | POI evidence | Primary owner | Context/qualification |
|---|---|---|---|
| BOS continuation | no valid FVG/OB owner | BullishContinuationBot or BearishContinuationBot | participation may qualify |
| BOS continuation | valid causal FVG | FvgContextBot | continuation is parent thesis |
| BOS continuation | valid causal OB | OrderBlockContextBot | continuation is parent thesis |
| BOS continuation | valid FVG + OB | causal-strength resolver chooses primary owner; other valid POI remains contributing context | participation modifier |
| CHoCH/MSS | valid FVG/OB POI | FVG/OB context bot if their causal object owns entry | no StructureTransitionBot |
| CHoCH/MSS | no valid FVG/OB POI | NO_SELECTION | CHoCH is structure evidence, not standalone setup |
| any structure | participation only | base setup owner | participation cannot create trade |

This is not permanent ranking. It is causal ownership. A setup wins because its own required object owns the confirmed event, not because it appears first in an array.

## Selection algorithm

```text
1. Require valid 1H bias.
2. Require 15M structure confirmed/aligned.
3. Require 5M CONFIRMED evidence.
4. Build one StructurePackage keyed by primary_event_id.
5. Remove invalid/expired/mitigated POIs.
6. Build candidates from causal ownership, not list order.
7. If exactly one owner remains: SELECTED.
8. If zero owners: NO_SELECTION / no trade.
9. If multiple owners remain, apply equal-weight causal-strength resolver and preserve non-primary valid owners as contributing context.
10. Record every candidate, strength profile, primary owner, contributing context, eligibility, and rejection reason.
```

## Why not score candidates globally

A global score would hide ownership errors:

```text
BOS + OB + FVG = three labels for one impulse
```

Counting them as three independent setup candidates creates overlap and arbitrary selection. Stable parent/child lineage is safer:

```text
one structural parent event
→ zero or more causal POI children
→ one selected owner
```

## Research validation

State-aware strategy selection is more defensible than binary signal selection because identical raw signals can have different forward meaning depending on cycle state and context.[1]

Research on regime-conditional strategy comparison argues against relying on one aggregate performance number and supports evaluating strategy distributions conditional on realised market state.[2]

BOS/CHoCH practitioner frameworks distinguish continuation breaks from early transition evidence; this supports treating CHoCH as structural context rather than automatically promoting it to a standalone trade family.[3][4]

Research on multi-condition systems supports explicit sequential event clauses and warns that adding overlapping conditions or branches can shrink samples and create curve-fit routing.[5]

These sources validate the design principle, not profitability. Local event-key and holdout evidence remain required.

## Active architecture after removal

```text
SelectionBot
├── BullishContinuationBot
├── BearishContinuationBot
├── FvgContextBot
├── OrderBlockContextBot
└── ParticipationConditionedBot (modifier-only)
```

`StructureTransitionBot` remains only in historical artifacts until cleanup is applied. It must not be included in the next active backtest.

## Required cleanup

Remove `structure_transition` / `StructureTransitionBot` from:

```text
v2/artifacts/SETUP_RESEARCH_REGISTRY.json
v2/artifacts/SETUP_BOT_CORES.json
v2/artifacts/SETUP_BOT_INTERFACES.json
v2/scripts/setup_bots_executable.py
v2/scripts/architecture_v2.py
v2/scripts/live_demo_context.py
validators and active result schemas
```

Preserve historical evidence in this report. Do not delete historical backtest artifacts.

## Decision gate

```text
StructureTransitionBot: ELIMINATE FROM ACTIVE ARCHITECTURE
Reason: unapproved family + duplicated MarketStructureBot responsibility + no independent validated edge
SelectionBot: replace flat candidate order with causal ownership package
Next backtest: blocked until cleanup and runtime ownership trace pass
```

## Sources

[1] Setup state classifier, context-aware signal selection: https://shishin.io/research/setup-state-classifier

[2] Regime-conditional distributional strategy comparison: https://arxiv.org/pdf/2606.31251

[3] LuxAlgo, Change of Character concept: https://www.luxalgo.com/library/concept/change-of-character/

[4] BOS vs CHoCH structural distinction: https://innercircletrader.net/tutorials/break-of-structure-vs-change-of-structure/

[5] Multi-condition and sequential trading automation design: https://obside.com/trading-ai-agents/multi-condition-trading-automations
