# Stage 2 Final Decision — 15M Market-Structure Selection

Status: CLOSED — PASS WITH SCOPED ROLES

## Scope

Stage 2 selects market-structure research candidates for the 15M layer only. It does not select entries, SL, TP, setup bots, execution timing, or profitable strategy rules.

The 1H and 5M roles are not implemented here. Stage 2 only determines which observable evidence may feed the future 15M market-structure bot.

## Frozen evidence

Dataset:

```text
Binance Futures USDⓈ-M Testnet
BTCUSDT perpetual
~365 days
5M 105,119 candles
15M 35,040 candles
1H 8,760 candles
gaps 0
invalid OHLC 0
duplicates 0
```

Artifacts:

```text
v2/artifacts/DATA_SNAPSHOT_MANIFEST.json
v2/artifacts/EVENT_STUDY_RAW.json
v2/artifacts/COMPONENT_VALIDATION.json
v2/artifacts/OTHER_CANDIDATE_STUDY.json
```

Tests were descriptive event studies. No entry simulation, SL, TP, PnL, fee, slippage, funding, or threshold optimization was used.

## Decision table

| Candidate | 15M market-structure role | Evidence result | Final decision |
|---|---|---|---|
| Price-derived confirmed swings | Primary structural control | Required control; auditable and venue-independent. Raw break events showed weak unconditional returns but provide the neutral reference. | SELECTED as structural control |
| SMC-01 structure | Structure vocabulary and event annotations | Popularity is not proof. Raw BOS and combined sequence had negative matched lift. SMC remains useful only as explicit, testable definitions. | SELECTED as research framework, not proven edge |
| SMC sweep/reclaim | Liquidity event evidence | Strongest current hypothesis. Matched lift positive at 1/3/6/12/24 bars; still not a trade signal. | SELECTED as 15M evidence component |
| SMC BOS | Break/acceptance annotation | Negative matched lift at all horizons in current operational probe. | REJECTED as standalone selector |
| SMC CHoCH/MSS | Opposite structural transition annotation | Unstable: weak negative short horizon, mixed longer horizon. | SELECTED as annotation only; not selector |
| SMC FVG | Imbalance/POI annotation | Raw FVG event negative short/medium horizon; no retest semantics tested. | SELECTED as annotation only; no standalone direction |
| SMC Order Block | POI annotation | Raw OB candle event negative short/medium horizon; no retest semantics tested. | SELECTED as annotation only; no standalone direction |
| EMA trend/momentum | Directional context candidate | Small positive mean, confidence interval included zero. | REJECTED as primary structure; optional 1H context later |
| Momentum cross | Directional event | Negative 24-bar mean; no robust evidence. | REJECTED |
| Volatility expansion | Movement/regime context | Near-zero/negative 24-bar result; not directional. | SELECTED as normalization context only |
| Volume spike | Participation context | Highest non-SMC mean, but interval touched zero. Volume is not directional proof. | SELECTED as confirmation context only |
| Rolling VWAP location | Location context | Small positive mean, interval included zero; 24/7 anchor semantics remain context-dependent. | DEFERRED context; not structure |
| ADX/DMI class | Strength/regime context | Research literature supports regime hypothesis, but no clean local ADX study was used to claim an edge. | DEFERRED; no selection claim |

## Final selected 15M market-structure set

```text
Primary structure:
  price-derived confirmed swing sequence

Structural annotations:
  HH / HL / LH / LL
  close-confirmed acceptance/break
  CHoCH/MSS annotation

Liquidity evidence:
  prior-pool sweep/reclaim

POI annotations:
  FVG
  Order Block

Context only:
  volatility normalization
  optional volume participation
```

## Explicit exclusions

These are not allowed to define 15M structure by themselves:

```text
EMA cross
momentum cross
raw BOS label
raw FVG label
raw OB candle
volume spike
VWAP location
ATR/volatility direction
```

No candidate has been declared profitable. No candidate has been selected for entry generation.

## Acceptance rationale

The selection is role-based, not PnL-based:

1. Price-derived swings are the control because they are directly observable and auditable.
2. SMC-01 is retained because its vocabulary can express structure, liquidity, and POI hypotheses, not because popularity proves performance.
3. Sweep/reclaim is the only component with consistently positive matched descriptive lift, so it is retained as evidence for the 15M bot, not as an entry rule.
4. BOS is not allowed to act as a standalone selector because its current matched lift is negative across tested horizons.
5. FVG and OB remain annotations because their raw event probes do not model retest/mitigation.
6. Auxiliary indicators remain context roles because their confidence intervals or local evidence do not justify redefining structure.

## Stage transition

```text
Stage 2: COMPLETE
Stage 3: COMPLETE
Stage 4: COMPLETE
Stage 5: COMPLETE
Stage 5A: IN_PROGRESS
```

Stage 5A continues the setup-family research gate using only these selected 15M roles. It must not promote setup selection, implement entry/SL/TP, or import legacy thresholds.
