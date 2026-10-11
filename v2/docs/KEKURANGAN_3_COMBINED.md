# Kekurangan 3 — Combined Gap Analysis

Status: RESEARCH SYNTHESIS COMPLETE / NO PATCH

## Inputs

```text
Kekurangan 1: market-structure comparison against broader structure families
Kekurangan 2: JEV SMC comparison against FractalTrader
```

## Synthesis

Kekurangan 1 mostly identifies missing information dimensions. Kekurangan 2 identifies missing implementation artifacts. Combined, they reveal one larger root problem:

> JEV can detect and label structure, but cannot yet preserve a complete, multi-scale, auditable evidence chain proving that a structural event remains valid from liquidity formation through break, acceptance, POI selection, and 5M confirmation.

This is **Kekurangan 3: incomplete structural evidence lifecycle**.

## Root decomposition

### 3.1 Structure identity is incomplete

Current structure has HH/HL/LH/LL, BOS/CHoCH/MSS, and timeframe boundaries. It lacks a linked identity graph across:

```text
external swing
internal swing
parent/child relationship
liquidity cluster
break event
protected reference
POI origin
5M confirmation
```

Result: related observations can be stored as separate labels instead of one auditable structural event.

### 3.2 Evidence lifecycle is incomplete

Current model does not standardize all state transitions:

```text
created
confirmed
retested
accepted
failed
mitigated
invalidated
expired
```

This affects both liquidity and POI. A label can exist without clear proof that it is still tradable or structurally relevant.

### 3.3 Event quality is incomplete

Current break and sweep logic uses price proxy. It does not consistently persist:

```text
acceptance_bars
reclaim_latency
failed_break
sweep cluster strength
signed participation
order-flow evidence
uncertainty/conflicting evidence
```

The system may know that an event happened, but not how strong, persistent, or contested it was.

### 3.4 Entry provenance is incomplete

A setup can reference a zone, but the evidence chain is not yet mandatory end-to-end:

```text
which structure created the POI?
which liquidity pool was relevant?
why was this POI selected?
why were competing POIs rejected?
what exact 5M confirmation occurred?
what invalidates the setup?
```

This is the direct bridge between market-structure weakness and the rough baseline's false-entry risk.

### 3.5 Observable and inferred facts are mixed

OHLCV can show price behavior. It cannot prove:

```text
institutional orders
resting liquidity
stop hunt intent
buyer/seller aggressor identity
```

Without explicit evidence typing, a price proxy can be mistaken for causal market knowledge.

## Confirmed vs unconfirmed

| Finding | Status | Reason |
|---|---|---|
| incomplete multi-scale identity | Confirmed schema gap | K1 scale gap + K2 nested graph gap |
| incomplete POI/liquidity lifecycle | Confirmed schema gap | K1 acceptance/value gap + K2 lifecycle/cluster gap |
| missing acceptance/failure persistence | Confirmed measurement gap | K1 G7 and comparison review |
| missing order-flow observability | Confirmed information gap | K1 G1; shared with FractalTrader |
| missing signed participation | Confirmed information gap | K1 G6; shared limitation |
| missing uncertainty layer | Confirmed representation gap | K1 G2; shared limitation |
| rough baseline losses caused by all gaps | Not proven | baseline has provisional mechanics and no causal ablation |
| adding all missing features improves PnL | Not proven | requires incremental tests |

## Why this is a new gap

Kekurangan 1 lists missing dimensions. Kekurangan 2 lists missing artifacts. Neither alone states the system-level failure:

```text
structure labels exist,
but evidence continuity is not guaranteed.
```

Kekurangan 3 is therefore not another duplicate feature list. It is the root integration gap that explains why individual labels can look correct while setup decisions remain weakly justified.

## Required acceptance contract before patch

Do not implement every feature. First prove that each structure event can carry minimum provenance:

```text
structure_event_id
parent_event_id / child_event_id
source_timeframe
confirmed_at
break_type
protected_reference
liquidity_pool_id
poi_id
acceptance_state
failure_state
selected_poi_reason
5m_confirmation_state
invalidation_reason
evidence_type: price_proxy | volume_context | order_flow
```

Order-flow fields remain nullable until data exists. Null is preferable to invented evidence.

## Priority

```text
P0: event identity + lifecycle + acceptance/failure + POI provenance
P0: validate 5M confirmation state
P1: multi-scale graph
P1: liquidity clustering and evidence count
P1: uncertainty/conflicting-evidence state
P2: signed volume/order flow when data contract exists
P2: value/repeated-level annotation
```

## Decision

```text
Kekurangan 3 recorded.
Current strategy rules: unchanged.
Current market-structure implementation: unchanged.
Stage 6/setup promotion: remains blocked.
Next valid action: audit current clean-room output against this evidence contract.
```

## Sources

Primary comparison artifacts:

```text
v2/docs/MARKET_STRUCTURE_GAP_RESEARCH.md
v2/artifacts/MARKET_STRUCTURE_GAP_MATRIX.json
v2/docs/SMC_FRACTALTRADER_COMPARISON.md
v2/artifacts/SMC_FRACTALTRADER_GAPS.json
```
