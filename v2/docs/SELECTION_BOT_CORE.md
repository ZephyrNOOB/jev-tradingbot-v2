# SelectionBot Core

Status: CORE DEFINITION / PRIMARY PIPELINE

## Mandatory order

```text
1. 1H bias valid
2. 15M confirms or rejects 1H bias
3. 15M market structure valid
4. 15M determines eligible setup categories
5. 5M state is CONFIRMED
6. SelectionBot evaluates setup bots and selects one based on market structure confirmed by ConfirmationBot.
7. setup bot yang terpilih oleh SelectionBot menentukan Entry, SL, TP, lalu eksekusi.
```

## Core principle

SelectionBot does not create new market evidence, bias, structure, or trade plan. It selects exactly one setup bot from 15M eligible categories after ConfirmationBot confirms the 15M structure on 5M.

## Input

```text
validated_1h_bias
market_structure_15m_output
eligible_setup_categories_15m
confirmation_5m_output
```

## Hard gates

```text
1H bias must be VALID
15M must CONFIRM 1H bias
15M market structure must be VALID
eligible setup categories must exist
5M confirmation_state must be CONFIRMED
selected bot must match confirmed 15M market structure
```

Any failed gate produces `NO_SELECTION`; no setup bot runs and no trade occurs.

## Selection logic

```text
candidates = setup bots whose requirements match:
  confirmed 15M state
  confirmed 15M structure
  eligible setup category
  5M CONFIRMED evidence

selected_setup_bot = exactly_one_ranked_candidate(candidates)
```

Selection is exclusive. Parallel unranked setup execution is forbidden.

If multiple candidates qualify, rank using only available evidence:

```text
1. exact match with confirmed 15M structure
2. eligible category match
3. 5M confirmation completeness
4. setup-specific evidence strength
5. absence of conflicting evidence
```

If ranking cannot produce one defensible candidate:

```text
NO_SELECTION
WAIT
no entry
```

## Output

```text
selected_setup_bot
selection_state: SELECTED | NO_SELECTION
selection_reason
market_structure_reference
confirmation_reference
eligible_setup_bots
rejected_setup_bots
rejection_reasons
timestamp
source_indices
```

## Forbidden

```text
select before 5M CONFIRMED
select from 15M eligibility alone
select against confirmed 15M structure
select multiple bots for one event
run setup bot before selection
create Entry, SL, or TP
mutate 1H bias, 15M structure, or 5M confirmation
```

## Handoff

```text
SelectionBot selects one bot.
setup bot yang terpilih oleh SelectionBot menentukan Entry, SL, TP, lalu eksekusi.
```

## Change control

Immutable by default. Changes require explicit user approval, research record, and isolated validation.
