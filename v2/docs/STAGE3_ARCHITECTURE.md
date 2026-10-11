# Stage 3 — Architecture Contract

Status: contract defined; implementation not started.

## Pipeline

```text
completed 1H candles
        ↓
1H Bias Bot
        ↓ bias + evidence
completed 15M candles + frozen 1H output
        ↓
15M Market Structure Bot
        ↓ structure state + POI/liquidity annotations
completed 5M candles + frozen 15M output
        ↓
5M Execution Context Bot
        ↓ confirmation context
Setup Bot interfaces
```

## Boundaries

### 1H Bias Bot

Only directional context:

```text
BULLISH | BEARISH | RANGE | UNKNOWN
```

No setup selection. No entry. No 5M input.

### 15M Market Structure Bot

Primary structure source:

```text
price-derived confirmed swing sequence
HH / HL / LH / LL
close-confirmed break annotation
```

Additional evidence:

```text
CHoCH/MSS
prior-pool sweep/reclaim
FVG
Order Block
volatility normalization
optional volume participation
```

15M confirms whether 1H bias is aligned. It emits structure context only. No entry.

### 5M Execution Context Bot

Consumes frozen 15M output. Stage 3 defines interface only. It cannot mutate 15M structure or 1H bias.

### Setup Bot boundary

Setup bots consume 15M eligibility context and future 5M confirmation. Stage 3 defines ports only. Entry, SL, TP remain outside this stage.

## Hard invariants

```text
closed candles only
no lookahead
1H output immutable for each 15M decision
5M cannot redefine 15M structure
15M cannot generate entry
missing evidence rejects context
all outputs carry timestamps/source indices
all rejection paths carry reasons
```

## Stage 3 acceptance scope

This artifact establishes interfaces and forbidden responsibilities. It does not implement indicators, entries, setup logic, risk, costs, or PnL.
