# Stage 3 Architecture Data Contract

## Version

```text
contract: v2-stage3
schema_version: 1
closed_candle_policy: source candle must be complete
```

## Common envelope

Every bot output uses:

```json
{
  "schema_version": 1,
  "bot": "bias_1h | market_structure_15m | execution_5m | setup_interface",
  "decision_ts": 0,
  "source": {
    "timeframe": "1h | 15m | 5m",
    "closed_index": 0,
    "parent_index": 0,
    "input_hash": "sha256"
  },
  "state": "...",
  "evidence": {},
  "confidence": {"valid": 0, "required": 0, "completeness": 0},
  "rejection_reason": null,
  "contract_version": "v2-stage3"
}
```

`decision_ts` must identify the closed source candle. No future candle may enter `input_hash`.

## 1H Bias Bot output

```json
{
  "state": "BULLISH | BEARISH | RANGE | UNKNOWN",
  "bias": "BULLISH | BEARISH | RANGE | UNKNOWN",
  "reference_swing": {"high_index": 0, "low_index": 0},
  "reason": "string"
}
```

Forbidden fields:

```text
entry, setup_selection, 5m data
```

## 15M Market Structure Bot output

```json
{
  "bias_alignment": "ALIGNED | MISALIGNED | NEUTRAL | UNKNOWN",
  "state": "BULLISH | BEARISH | RANGE | TRANSITION | UNKNOWN",
  "swings": {"HH": [], "HL": [], "LH": [], "LL": []},
  "break_annotation": {"type": "NONE | ACCEPTANCE | BOS_CANDIDATE", "index": null},
  "choch_mss": {"type": "NONE | CHoCH_ANNOTATION | MSS_ANNOTATION", "index": null},
  "sweep_reclaim": {"present": false, "pool_index": null, "direction": null},
  "fvg": [],
  "order_block": [],
  "volatility_context": {},
  "volume_context": {},
  "eligible_context": false,
  "rejection_reason": null
}
```

A `BOS_CANDIDATE` is annotation only in Stage 3. It does not authorize entry.

## 5M Execution Context output

Interface only:

```json
{
  "confirmation_state": "CONFIRMED | NOT_CONFIRMED | UNKNOWN",
  "trigger_context": {},
  "rejection_reason": null
}
```

It consumes an immutable 15M output. It cannot rewrite 15M state.

## Setup interface

```json
{
  "eligible": false,
  "candidate_setup_ids": [],
  "evidence_refs": [],
  "rejection_reason": null
}
```

No entry, SL, TP, risk, or cost fields are implemented in Stage 3.

## Invariants

```text
source candle closed
parent timeframe closed
source index immutable
input hash reproducible
missing evidence => eligible_context false
rejection reason required when false
5M cannot mutate 15M output
15M cannot mutate 1H output
```
