# ConfirmationBot Core

Status: CORE LOCKED / PRIMARY EXECUTION-CONFIRMATION BASELINE

Executable authority: `v2/scripts/confirmation_5m_authoritative.py`. It replays only closed 5M candles strictly after the parent 15M close and requires a distinct retest/rejection event followed by a later micro-break event.

## Responsibility

ConfirmationBot owns 5M confirmation. It receives completed 5M candles and immutable MarketStructureBot output from 15M.

```text
1. read immutable 15M state and protected reference
2. test 5M direction alignment
3. test 5M micro-structure confirmation
4. test displacement and close acceptance
5. test retest hold or retest failure
6. confirm or reject 15M structure
7. provide trigger context and rejection reason
```

## Core principle

ConfirmationBot does not create a new market bias or mutate 15M structure. It verifies whether 5M price action supports the already-confirmed 15M structure before Bot Selection runs.

## Bullish 15M confirmation

```text
5M maintains bullish direction
5M forms HL or fails to form LL
5M closes above confirmed micro high
5M shows bullish displacement
5M acceptance or retest hold
5M does not break protected bullish reference
```

## Bearish 15M confirmation

```text
5M maintains bearish direction
5M forms LH or fails to form HH
5M closes below confirmed micro low
5M shows bearish displacement
5M acceptance or retest failure
5M does not break protected bearish reference
```

## Confirmation states

```text
CONFIRMED:
  5M evidence is aligned and complete

REJECTED:
  5M contradicts 15M, protected reference breaks, displacement is absent,
  signal is wick-only/single-candle, or follow-through is absent

WAITING:
  15M structure remains valid, but 5M evidence is incomplete

INVALIDATED:
  15M structure or protected reference has failed
```

## Output

```text
confirmation_state
trigger_context
micro_structure
direction_alignment
displacement_evidence
acceptance_evidence
retest_evidence
protected_reference_status
rejection_reason
timestamp
source_indices
```

## Hard rules

```text
closed 5M candles only
no lookahead
5M cannot mutate 15M structure
5M cannot mutate 1H bias
5M cannot select setup bot before CONFIRMED
5M cannot determine Entry, SL, or TP
single candle alone is insufficient
wick break alone is not confirmation
missing evidence = WAITING or REJECTED
every rejection requires a reason
```

## Change control

Immutable by default. Any change requires explicit user approval, research record, and isolated validation.

This artifact is the authoritative ConfirmationBot core. The primary pipeline references this core instead of duplicating its detailed confirmation rules.
