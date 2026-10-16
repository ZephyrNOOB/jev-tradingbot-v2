# Primary Market Structure Baseline

Status: **IMMUTABLE DEFAULT**

This is JEV's primary and default architecture. No change without explicit user approval.

```text
1H bias
→ 15M MarketStructureBot confirms/rejects 1H bias and builds market structure
→ 5M ConfirmationBot confirms/rejects 15M market structure
→ Bot Selection selects setup bot based on 15M market structure
→ Selected Setup Bot determines and executes setup-specific Entry, SL, TP, and reasons
```

## Stage 1 — 1H Bias via MarketBiasBot

```text
Input: completed 1H candles
Bot: MarketBiasBot
Authority: confirmed 1H structure
Responsibility: directional bias only
Output: bias, confidence, reference swing, structure direction, protected reference, last confirmed break, break persistence, trend/volatility/participation/positioning context, conflicts, reason
```

1H cannot select setup, use 5M data, create entry, or mutate 15M structure.

EMA is not sole authority. Confirmed HH/HL/LH/LL structure, protected swing, and close-confirmed BOS/CHoCH/MSS determine direction. ADX/DMI filters trend strength. ATR/realized volatility and volume describe context. Taker flow, OI, and funding are optional context. Missing evidence produces `RANGE` or `UNKNOWN`, never guessed direction.

## Stage 2 — MarketStructureBot: 15M Confirmation + Market Structure

Authoritative core:

```text
v2/docs/MARKET_STRUCTURE_BOT_CORE.md
v2/artifacts/MARKET_STRUCTURE_BOT_CORE.json
```

```text
Input: completed 15M candles + immutable 1H bias
Bot: MarketStructureBot
Responsibility: confirm/reject 1H bias and build 15M structure
```

Detailed authority, supporting evidence, outputs, and hard rules live only in MarketStructureBot Core. Primary baseline references core; it does not duplicate core logic.

15M cannot create entry, SL, TP, or use 5M trigger data.

## Stage 3 — ConfirmationBot: 5M Confirmation

Authoritative core:

```text
v2/docs/CONFIRMATION_BOT_CORE.md
v2/artifacts/CONFIRMATION_BOT_CORE.json
```

```text
Input: completed 5M candles + MarketStructureBot 15M output
Bot: ConfirmationBot
Responsibility: confirm/reject 15M market structure
```

Detailed confirmation states, bullish/bearish requirements, outputs, and hard rules live only in ConfirmationBot Core. Primary baseline references core; it does not duplicate confirmation logic.

5M cannot mutate 15M structure or 1H bias. No setup selection before `CONFIRMED`.

## Stage 4 — SelectionBot: Setup Selection

Mandatory order:

```text
1. 1H bias valid
2. 15M confirms/rejects 1H bias
3. 15M market structure valid
4. 15M determines eligible setup categories
5. 5M state = CONFIRMED
6. SelectionBot evaluates setup bots and selects one based on 15M structure confirmed by ConfirmationBot.
7. setup bot yang terpilih oleh SelectionBot menentukan Entry, SL, TP, lalu eksekusi.
```

Authoritative core:

```text
v2/docs/SELECTION_BOT_CORE.md
v2/artifacts/SELECTION_BOT_CORE.json
```

SelectionBot input:

```text
validated 1H bias
15M market structure
15M eligible setup categories
5M ConfirmationBot output
```

SelectionBot evaluates all five equal peer SetupBots. Equal-weight causal strength resolves one primary owner; other valid peers remain contributing context. Failed common gate or zero valid causal context produces `NO_SELECTION`; ambiguity between valid peers never does. Parallel unranked candidate execution is forbidden.

## Stage 5 — Setup Bot Trade Plan + Execution

The selected setup bot owns and executes its own trade plan. It determines and performs:

```text
Entry
Stop Loss
Take Profit
Entry reason
Stop reason
Target reason
Risk/reward
Invalidation reason
Execution status
Execution timestamp
```

No generic shared Entry, SL, or TP. Every trade requires setup-specific evidence and reasons. Setup Bot executes entry only after its own Entry/SL/TP plan passes validation.

## Locked invariants

```text
closed candles only
no lookahead
1H bias immutable per completed 15M decision
15M must confirm/reject 1H bias before setup eligibility
15M owns market structure
5M must confirm/reject 15M structure
5M cannot mutate 15M structure
Bot Selection after 5M confirmation
missing evidence rejects context
all outputs carry timestamps and source indices
every rejection has reason
no baseline changes without explicit user approval
```

## Backtest rule

All future backtests must implement this pipeline exactly. The runner must import `v2/scripts/setup_bots_executable.py`, build causal per-SetupBot context, execute lifecycle-aware plan validation, and reject missing lineage/evidence. A rough approximation, shared trade-plan formula, forced lifecycle state, or unit-only self-check is non-compliant and cannot be used as final architecture evidence.
