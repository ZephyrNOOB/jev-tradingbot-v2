# SMC Market Structure Comparison — JEV v2 vs FractalTrader

Status: research complete; comparison only; no JEV rule promoted.

## Scope and evidence boundary

FractalTrader is an open-source SMC trading system. This comparison uses its public README and source modules, not undocumented claims. A code feature is not proof of trading edge. FractalTrader's public README itself describes the project as educational/research software and exposes implementation/test claims, not independent performance validation.[1]

## Current JEV v2 structure

```text
confirmed price swings
HH / HL / LH / LL
close-confirmed break
CHoCH/MSS annotation
prior-pool sweep/reclaim
FVG annotation
Order Block annotation
volatility context
optional aggregate-volume context
1H bias → 15M structure → 5M confirmation boundary
```

## FractalTrader observed structure

The public implementation provides:

```text
local swing highs/lows with configurable n; default n=5
trend from last two highs and last two lows
BOS/CHoCH based on close crossing latest tracked swing level
equal-high/equal-low liquidity clustering by relative tolerance
liquidity sweep: level breach + close back inside within reversal window
FVG and order-block modules
OB validity, invalidation, age filtering, retest count
OB strength score using retests, zone size, optional volume
liquidity zones with first touch, last touch, touch count
BOS + OB retest strategy
confidence score using trend, volume, volatility, pattern clarity
risk/position sizing and live decision infrastructure in broader project
```

These features are directly visible in the public repository source.[2][3][4][5][6]

## Direct comparison

| Area | JEV v2 | FractalTrader | JEV deficiency? | Evidence conclusion |
|---|---|---|---|---|
| Swing scale | fixed confirmed swing design; current research uses 15M structure | configurable fractal width, default 5 | **Yes: scale sensitivity not yet benchmarked** | confirmed engineering gap, not proof FractalTrader's n=5 is correct |
| Swing hierarchy | 1H/15M/5M responsibility layers | fractal swing detector; H4/H1/M15 viewer | **Partial**: JEV has cleaner contract, lacks explicit nested swing graph | confirmed representation gap |
| HH/HL/LH/LL | explicit structure vocabulary | trend derives from latest two highs/lows | **No** for vocabulary; **yes** for richer sequence metadata | JEV stronger conceptually, FractalTrader simpler computationally |
| Protected swing lifecycle | protected invalidation is explicit JEV rule | latest tracked levels reset after break | **Yes: independent lifecycle/state audit needed** | JEV should preserve protected references while also tracking consumed levels |
| BOS/CHoCH | close + displacement + bias/state contract | close cross of latest level; trend decides BOS vs CHoCH | **No** on strictness; FractalTrader is less strict | FractalTrader lacks JEV's displacement/protected-swing rigor |
| Internal vs external structure | not yet explicit as separate streams | not clearly separate in source | **No**; JEV can be ahead | no deficiency found |
| Equal highs/lows | prior liquidity pool/sweep concept; no full cluster artifact | explicit tolerance clustering, min touches, zone metadata | **Yes** | confirmed feature gap |
| Liquidity zone lifecycle | sweep/reclaim price proxy | zones include first/last touch/count; sweep reversal window | **Yes: touch history and expiry metadata absent/incomplete** | confirmed feature gap |
| Sweep confirmation | price breach + reclaim; further reversal confirmation planned | breach then close back within 3 bars | **Not a deficiency in rigor**; JEV is intentionally stricter | FractalTrader is a baseline, not evidence of superiority |
| FVG | annotation | dedicated imbalance module | **No** at component existence; **yes** if lifecycle/retest metadata missing | exact JEV implementation audit still required |
| OB | annotation with subordinate role | detection, validity, invalidation, retest count, age, nearest zone | **Yes** if JEV lacks equivalent metadata | confirmed POI lifecycle gap |
| OB strength | no validated strength score | heuristic 0–100 based on retests/size/volume | **No automatic deficiency** | score is heuristic, not validated edge |
| Rejection candle | JEV requires explicit 5M reaction contract | strategy enters when bar intersects OB; no strong rejection requirement in shown path | **No: JEV is stricter by design** | FractalTrader exposes a false-positive risk here |
| Acceptance/failure | JEV research already identified missing persistence metrics | FractalTrader code also does not expose robust acceptance-duration model | **Shared gap**, not JEV-only | external comparison confirms G7, but does not uniquely blame JEV |
| MTF confirmation | formal immutable 1H→15M→5M contract | H4/H1/M15 viewer, no equivalent immutable 5M confirmation contract observed | **No**; JEV architecture stronger, validation pending | JEV must validate execution layer empirically |
| Confidence | structural evidence fields; no promoted confidence score | heuristic confidence 0–100 | **No proven deficiency** | heuristic score can create false precision |
| Volume | optional aggregate context | optional volume spike/score | **Shared gap**: neither measures signed flow/CVD/OFI | G6 remains valid |
| Order flow | absent | absent in public core | **Shared gap** | G1 remains valid |
| Regime probability | categorical structural state | categorical trend/range behavior | **Shared gap** | G2 remains valid |
| OB/FVG institutional interpretation | explicitly not assumed | README calls footprints of smart money | **JEV is more epistemically strict** | JEV should not copy causal claim without evidence |
| Test discipline | clean-room stage gates, data boundary, event studies | repository advertises broad tests/coverage | **Different strengths** | test count/coverage does not prove strategy edge |
| Strategy coupling | setup bots derived after structure research | liquidity-sweep and BOS+OB strategies tightly couple detector to entry/SL/TP | **No**; separation is JEV advantage | JEV must keep structure/setup boundary |

## Confirmed deficiencies specific to JEV v2

### F1 — No explicit equal-liquidity clustering

FractalTrader clusters swing highs/lows using tolerance and exposes zones with first touch, last touch, and touch count.[3] JEV currently has prior-pool sweep/reclaim but lacks an equivalent explicit liquidity-zone artifact.

**Confirmed:** yes, feature/measurement gap.

**Why it matters:** one isolated prior high and a repeated equal-high cluster should not carry identical liquidity evidence.

**Not proven:** clustering will improve PnL.

### F2 — No complete POI lifecycle metadata in the clean-room structure contract

FractalTrader's OB implementation tracks validity, invalidation, age, retests, and nearest valid block.[4] JEV treats FVG/OB as annotations and has identified lifecycle as a weakness, but the clean-room 15M structure output does not yet standardize all of these fields.

**Confirmed:** yes, schema gap.

**Required fields for research:**

```text
poi_id
created_at
source_impulse_id
first_retest
last_retest
touch_count
age_bars
mitigated
invalidated
expiry_reason
```

### F3 — No independent multi-scale/fractal structure graph

FractalTrader exposes a configurable fractal detector and its viewer uses synchronized H4/H1/M15 views.[1][2] JEV has timeframe contracts, but not a formal nested structure graph where internal and external swings coexist and link to parent levels.

**Confirmed:** yes, representation gap.

**Caution:** configurable `n=5` is not automatically superior. It still needs holdout testing.

### F4 — No explicit liquidity-cluster evidence score

FractalTrader at least records touch count for clustered liquidity and OB retest count.[3][4] JEV's sweep evidence currently focuses on price breach/reclaim and does not carry a standardized cluster-strength record.

**Confirmed:** yes, evidence-ledger gap.

### F5 — No standardized nearest valid POI selection record

FractalTrader exposes nearest valid liquidity and order-block helpers.[3][4] JEV's architecture defines POI annotations but does not yet require every setup candidate to record why one POI was selected over another.

**Confirmed:** yes, auditability gap.

Required record:

```text
candidate_pois
selected_poi_id
selection_reason
distance_to_entry
competing_poi_count
```

## Findings that are NOT JEV deficiencies

### BOS/CHoCH strictness

FractalTrader's public code classifies a break largely from close crossing a tracked swing and current trend.[2] JEV requires close confirmation plus displacement and protected-swing context. Copying FractalTrader here would weaken false-break control.

### Sweep strictness

FractalTrader accepts breach plus reclaim within a reversal window.[3] JEV's planned reversal confirmation is stricter. More FractalTrader signals do not mean better signals.

### Rejection requirement

FractalTrader's OB retest path detects zone intersection and can create a signal without a strong rejection/5M structure confirmation.[6] This validates JEV's prior concern: zone touch is not enough.

### Confidence score

FractalTrader's 0–100 score is heuristic. It includes base points for detected patterns and volume/volatility bonuses.[5][6] No independent evidence proves that score is calibrated. JEV should not copy it as truth.

### Institutional causality

FractalTrader README describes SMC patterns as institutional footprints.[1] The public implementation cannot observe institutional orders. JEV's statement that FVG/OB/sweep are price proxies is more defensible.

## Research confirmation matrix

| Finding | Confirmed by FractalTrader comparison? | Type |
|---|---|---|
| G1 no order-flow observability | Yes, shared absence | confirmed shared gap |
| G2 no uncertainty layer | Yes, shared categorical logic | confirmed shared gap |
| G3 fixed-scale pivot sensitivity | Yes | confirmed JEV representation gap |
| G4 liquidity is price proxy | Yes | confirmed shared limitation |
| G5 FVG/OB not proof of orders | Yes | confirmed epistemic limitation |
| G6 crude volume context | Yes, shared | confirmed shared gap |
| G7 no acceptance-duration metrics | Yes, shared | confirmed shared gap |
| G8 no repeated-level/value structure | Partly; FractalTrader has liquidity clusters, not full value profile | confirmed JEV gap for clustering; value profile unconfirmed |
| G9 5M confirmation not validated | FractalTrader does not disprove it | JEV validation gap |
| F1 equal-level clustering absent | Yes | JEV-specific gap |
| F2 POI lifecycle schema incomplete | Yes | JEV-specific gap |
| F3 nested structure graph absent | Yes | JEV-specific gap |
| F4 liquidity evidence score absent | Yes | JEV-specific gap |
| F5 POI selection provenance absent | Yes | JEV-specific gap |

## Bottom line

JEV v2 is stronger than FractalTrader in these boundaries:

```text
clean-room separation
explicit 1H/15M/5M responsibility
closed-candle/no-lookahead discipline
protected-swing and displacement requirements
refusal to treat SMC labels as institutional proof
setup/structure separation
```

FractalTrader is stronger in these implemented artifacts:

```text
equal-high/equal-low clustering
liquidity-zone touch metadata
OB age/validity/invalidation/retest tracking
nearest valid POI helpers
configurable fractal width
broader operational test/live scaffolding
```

## Final decision

Record these as **Kekurangan 1 — FractalTrader comparison**:

```text
F1 equal-liquidity clustering missing
F2 POI lifecycle metadata incomplete
F3 no explicit nested multi-scale structure graph
F4 no liquidity-cluster evidence score
F5 no POI selection provenance
```

Do not patch yet. First validate F1–F5 against JEV's current clean-room output and test incremental information value. FractalTrader's code is an implementation reference, not a validated profitability benchmark.

## Sources

[1] FractalTrader README: https://github.com/r464r64r/FractalTrader
[2] FractalTrader market structure implementation: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/market_structure.py
[3] FractalTrader liquidity implementation: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/liquidity.py
[4] FractalTrader order-block implementation: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/order_blocks.py
[5] FractalTrader liquidity-sweep strategy: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/strategies/liquidity_sweep.py
[6] FractalTrader BOS + order-block strategy: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/strategies/bos_orderblock.py
[7] ICT/SMC True Market Structure (fractal reference): https://www.tradingview.com/script/nJdooGEY-ICT-SMC-True-Market-Structure-TDT/
[8] LuxAlgo Market Structure CHoCH/BOS Fractal: https://www.luxalgo.com/library/indicator/market-structure-choch-bos-fractal/
