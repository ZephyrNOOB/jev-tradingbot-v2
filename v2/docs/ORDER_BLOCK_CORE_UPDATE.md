# OrderBlockContextBot Core Update

## Causal construction

OB cannot exist from candle shape alone.

```text
15M displacement event
→ confirmed BOS/structure event
→ last opposing candle immediately before displacement
→ source candle high/low defines OB zone
→ parent_event_id links OB to displacement/BOS
```

Required object fields:

```text
object_id
parent_event_id
source_candle_index
source_indices
zone_low
zone_high
side
state
```

## Runtime lifecycle

```text
ACTIVE
→ TOUCHED
→ PARTIAL_MITIGATION
→ FULL_MITIGATION
```

Invalidation:

```text
active state → INVALIDATED
```

when completed candle accepts/closes through OB against setup direction.

Expiry:

```text
ACTIVE / TOUCHED / PARTIAL_MITIGATION → EXPIRED
```

## Entry gate

Entry requires all:

```text
causal displacement event
source candle
parent event
valid OB boundaries
state TOUCHED or PARTIAL_MITIGATION
5M rejection
5M local structure break away from OB
no invalidation acceptance
```

Reject:

```text
FULL_MITIGATION
INVALIDATED
EXPIRED
wick-only reaction
candle-shape-only OB
missing lineage
missing 5M evidence
```

## Trade plan ownership

```text
Entry: OB zone after real 5M rejection/local break
SL: beyond OB invalidation boundary
TP: parent impulse/opposing confirmed liquidity
RR: natural geometry
```

No global filter added. Lifecycle, causal lineage, and acceptance are logic.
