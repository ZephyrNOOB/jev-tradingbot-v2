# MarketStructureBot Core

Status: CORE LOCKED / PRIMARY MARKET-STRUCTURE BASELINE

Executable authority: `v2/scripts/market_structure_authoritative.py`. The Stage 5A ledger, G7/G9 study, and `architecture_v2.py` all consume this implementation.

## Responsibility

MarketStructureBot owns 15M market-structure construction. It receives completed 15M candles and immutable 1H bias from MarketBiasBot.

```text
1. receive immutable 1H bias
2. confirm or reject 1H bias
3. build confirmed 15M market structure
4. classify BULLISH / BEARISH / RANGE / TRANSITION / UNKNOWN
5. produce eligible setup categories
6. reject context when evidence is missing
```

## Structural authority

```text
confirmed 15M price structure
HH / HL / LH / LL
protected swing
close-confirmed BOS
close-confirmed CHoCH/MSS
```

## Supporting evidence

```text
sweep / reclaim
FVG
Order Block
volatility context
volume participation context
```

Supporting evidence enriches context. It cannot replace confirmed structure.

## Output

```text
bias_alignment
state
HH
HL
LH
LL
break_annotation
CHoCH_MSS
sweep_reclaim
FVG
Order_Block
volatility_context
volume_context
eligible_setup_categories
rejection_reason
timestamp
source_indices
event_id
object_id
parent_event_id
parent_swing_id
parent_pool_id
source_timeframe
state_reason
created_at
confirmed_at
invalidated_at
```

## Logic model

```text
structure scales: external_swing, internal_swing
states: detected, confirmed, accepted, failed, invalidated, expired

BOS:
  one completed-candle close beyond one identified protected swing
  classify continuation or reversal
  wick-only breach is not BOS

CHoCH/MSS:
  first completed-candle counter-break through active protected reference
  transition state precedes new-regime BOS

FVG:
  three-candle imbalance with boundaries, source indices, parent event,
  fill and invalidation lifecycle

Order Block:
  opposing source candle linked causally to displacement and structure event;
  mitigation and invalidation lifecycle required

Liquidity sweep:
  identified pool is breached, then reclaim/response is tracked;
  one arbitrary wick is not a liquidity pool

Inducement:
  non-authoritative until falsifiable definition and provenance exist
```

## Object lifecycle

```text
created → active → touched → partially_mitigated → fully_mitigated
                         ↘ invalidated
                         ↘ expired
                         ↘ consumed
```

Every object carries identity, parent lineage, state reason, timestamps, and source indices.

Supporting context remains context. No ATR, volume, EMA, ADX, age, confidence, or other global threshold is added as a structure filter.


## Hard rules

```text
closed candles only
no lookahead
1H bias immutable
15M must confirm or reject 1H bias
15M owns market structure
15M does not create Entry, SL, or TP
15M does not use 5M trigger data
5M cannot mutate 15M structure
missing evidence = reject
every output has timestamp and source indices
every rejection has reason
```

## Core reasoning

MarketStructureBot does not infer direction from one candle, one wick, FVG, OB, volume, or indicator. It reads confirmed swing sequence, tracks protected references, and accepts BOS/CHoCH only when close and structural evidence support it.

## Change control

Immutable by default. Any change requires explicit user approval, research record, and isolated validation.

This artifact is the authoritative MarketStructureBot core. The primary pipeline baseline references this core instead of duplicating its detailed rules.
