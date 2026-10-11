# Market Structure Gap Research

Status: diagnostic complete; no architecture patch applied.

## Scope

Compare current clean-room 15M market-structure model against major market-structure families. This report evaluates structural information, not entry profitability.

## Current model

```text
confirmed price swings
HH / HL / LH / LL
close-confirmed break annotation
CHoCH/MSS annotation
prior-pool sweep/reclaim
FVG annotation
Order Block annotation
volatility normalization context
optional volume participation context
```

Current model is deterministic and auditable. It is also candle/OHLC-only for structure. It does not use trade-level order flow, order-book state, open interest, funding, cross-venue price discovery, explicit regime probabilities, or a multi-scale structure graph.

## Compared families

| Family | What it adds | Current gap | Evidence status | Decision |
|---|---|---|---|---|
| Price-action swing/fractal | confirmed pivots and hierarchical swings | pivot lag; fixed 2-left/2-right probe; no multi-scale hierarchy | structural foundation; not standalone edge | retain, extend cautiously |
| SMC-style structure/liquidity | protected swings, sweep/reclaim, CHoCH/MSS, POI labels | definitions can be subjective; current labels lack independent order-flow confirmation | practitioner concept; no universal accuracy proof | retain as explicit annotations only |
| Trend/regime models | persistent state probabilities and regime transitions | current state is deterministic categorical; no uncertainty or change-point detector | crypto regime studies support regime detection as a research family, not universal edge [5][6] | add diagnostic candidate, not structure replacement |
| Order-flow/microstructure | buyer/seller-initiated pressure, OFI, book imbalance, trade impact | current dataset has candles/aggregate volume only; no aggressor trades, book, OI | crypto microstructure studies report short-horizon explanatory information [1][2][3] | material gap; requires new data contract |
| Volume/participation | confirms activity and absorption/effort | current volume context is spike-only; no signed volume, delta, CVD, relative participation by regime | volume/order-flow evidence is context-dependent [1][2] | replace spike-only with measurable participation study |
| Support/resistance / market profile | repeated acceptance, rejection, value area, high-volume nodes | current structure has swings but no repeated-level clustering, value area, or acceptance time | public support/resistance claims are weaker than direct local tests; market-profile evidence needs data | research as location annotation, not bias |
| Change-point / structural-break models | objective regime transition and uncertainty | current CHoCH/MSS is rule-based; no statistical change-point probability or persistence test | BOCPD/order-flow regime research supports testing online regime shifts [4] | add shadow diagnostic |
| Multi-timeframe hierarchy | consistency across scales | current 15M model receives 1H bias but does not build a multi-scale structure graph; 5M confirmation is not yet tested | architecture requires frozen layer boundaries | gap in validation, not necessarily model defect |
| Cross-venue / futures context | price discovery, basis, OI/funding/liquidation context | current 15M model uses one venue and no derivatives state | crypto price-discovery/microstructure research supports venue context as relevant [7] | optional context; defer until data contract |

## Deep findings

### Gap 1 — Candle-only structure cannot observe aggressor pressure

The current model infers buyer/seller control from closes, ranges, and swings. It cannot distinguish passive absorption from aggressive initiative buying, nor measure whether a move was driven by a thin book or sustained trade pressure. Crypto order-flow research specifically studies buyer/seller-initiated flow and order-book events as explanatory variables for short-horizon price change.[1][2][3]

**Confirmed gap:** yes, information gap.

**Not proven:** adding order flow will improve net trading results. It needs tick/trade/book data and separate validation.

### Gap 2 — Deterministic labels have no uncertainty state

`BULLISH`, `BEARISH`, and `TRANSITION` are categorical. They do not express ambiguity, competing evidence, or probability that a regime has changed. Change-point research provides a basis for testing online regime-shift diagnostics.[4]

**Confirmed gap:** yes, uncertainty representation is missing.

**Risk:** adding HMM/BOCPD prematurely can overfit and introduce lag. First add a read-only change-point diagnostic, not a replacement.

### Gap 3 — Fixed pivot confirmation creates lag and scale dependence

A 2-left/2-right pivot is reproducible, but it is not a universal market-structure definition. Small pivots create noise; large pivots create delay. The current model also lacks an explicit multi-scale swing hierarchy.

**Confirmed gap:** yes, structural sensitivity/lag trade-off is real.

**Evidence boundary:** external sources support confirmed swings as references, but do not select the correct pivot length. Local walk-forward comparison is required.

### Gap 4 — Liquidity is price-proxy only

The current `prior_pool → sweep → reclaim` model uses prior highs/lows. It cannot verify actual resting liquidity, liquidation clusters, or order-book replenishment.

**Confirmed gap:** yes.

**Implication:** sweep/reclaim should remain a price-based hypothesis, not be described as proof of institutional stop hunting.

### Gap 5 — FVG/OB are annotations, not validated market structure

Current FVG/OB labels are derived from candle geometry. They do not prove unfilled institutional orders, future reaction, or executable zone validity. Public descriptions define the patterns, but do not establish universal crypto predictability.[8][9]

**Confirmed gap:** yes.

**Implication:** keep them as POI annotations. Require retest and 5M response later; never let raw label set 15M direction.

### Gap 6 — Volume context is too crude

Current volume candidate is essentially participation/spike context. It does not distinguish taker buy/sell volume, absorption, delta, CVD, or volume relative to volatility and regime.

**Confirmed gap:** yes.

**Implication:** volume can describe strength, not prove buyer/seller control. Add signed participation only if data contract permits.

### Gap 7 — No acceptance-duration or failed-break metric

Current break annotation focuses on close/displacement. It lacks persistence: how long price holds beyond level, how quickly it returns, and whether retest acceptance survives.

**Confirmed gap:** yes.

**Implication:** add `acceptance_bars`, `reclaim_latency`, and `failed_break` as diagnostic fields before using break labels for setup selection.

### Gap 8 — No repeated-level clustering / value structure

Current model uses individual swings and POIs. It does not cluster repeated reactions into zones, measure time-at-level, or identify value/low-volume areas.

**Confirmed gap:** yes.

**Implication:** research location context separately. Do not mix it into primary structure until incremental evidence exists.

### Gap 9 — MTF interface exists but confirmation is not yet empirically validated

Architecture correctly requires 1H bias → 15M structure → 5M confirmation. But current rough baseline used provisional 5M mechanics, not a fully validated execution-context implementation.

**Confirmed gap:** validation gap, not necessarily logic failure.

**Implication:** Stage 6 must test confirmation contracts before treating setup outcomes as reliable.

## What current model does well

```text
closed-candle and no-lookahead boundary
confirmed swing sequence
explicit HH/HL/LH/LL vocabulary
protected invalidation concept
separate sweep from accepted break
POI subordinate to structure
uniform evidence/rejection contract
immutable 1H/15M/5M responsibility boundaries
```

## Priority gaps

| Priority | Gap | Action |
|---|---|---|
| P0 | 5M confirmation not empirically validated | test existing contract before any setup promotion |
| P0 | acceptance/failure not persisted | add diagnostic fields, no threshold tuning |
| P1 | candle-only pressure | research signed trade/order-book data availability |
| P1 | pivot scale/lag | compare multi-scale pivot hypotheses on holdout |
| P1 | deterministic uncertainty | shadow change-point/regime diagnostic |
| P2 | crude volume | compare aggregate, taker, delta/CVD if venue data exists |
| P2 | repeated-level/value structure | location annotation study |
| P3 | cross-venue/OI/funding | optional context after core pipeline |

## Final conclusion

The current market structure is not wrong. It is a **price-action structural core** with explicit liquidity and POI annotations. Its main weakness is not missing more SMC labels. Its main weaknesses are:

```text
no order-flow observability
no uncertainty/change-point layer
fixed-scale pivot sensitivity
no acceptance-duration/failure metrics
crude volume context
no repeated-level/value structure
5M confirmation not yet validated
```

These findings are confirmed as information/measurement gaps by the research. They are not proof that adding every feature improves trading. Add no feature until its data source, hypothesis, acceptance test, and incremental evidence are defined.

## Sources

[1] https://link.springer.com/article/10.1007/s42521-019-00007-w
[2] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[3] https://arxiv.org/html/2602.00776v1
[4] https://arxiv.org/html/2307.02375v2
[5] https://www.preprints.org/manuscript/202603.0831
[6] https://jdmdc.com/index.php/JDMDC/article/view/57
[7] https://arxiv.org/pdf/2506.08718
[8] https://phemex.com/academy/fair-value-gap-crypto-trading
[9] https://www.quantum-algo.com/blog/order-blocks-fair-value-gaps-explained/
