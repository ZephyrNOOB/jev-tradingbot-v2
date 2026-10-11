# 15M Market Structure → Setup Research

Status: research scope defined; setup selection not started.

## 15M structure used

The new clean-room 15M structure uses only these roles:

```text
1. Confirmed price swings
2. HH / HL / LH / LL sequence
3. Close-confirmed structural acceptance/break annotation
4. CHoCH/MSS transition annotation
5. Prior-pool liquidity sweep/reclaim evidence
6. FVG annotation
7. Order Block annotation
8. Volatility normalization context
9. Optional volume participation context
```

This is not a legacy setup list. Setup research starts from this output contract and derives candidate families from observed structure states.

## Boundary

This research selects **setup families compatible with 15M structure**. It does not define entry, SL, TP, risk, or profitability.

5M confirmation remains a later execution gate. A 15M state can authorize a setup family for research, but cannot authorize an entry.

## Structure state → research family derivation

| New 15M observable state | Derived setup hypothesis | Why it is compatible |
|---|---|---|
| Confirmed HH→HL sequence, bullish state, protected HL intact | bullish continuation family | continuation hypothesis follows preserved bullish sequence |
| Confirmed LH→LL sequence, bearish state, protected LH intact | bearish continuation family | continuation hypothesis follows preserved bearish sequence |
| Prior low/high swept, close reclaimed, structure not invalidated | liquidity-reclaim family | directly tests sweep/reclaim evidence selected in Stage 2 |
| Opposite protected swing broken by close and displacement | transition family | CHoCH/MSS annotation marks state transition, not entry |
| Displacement creates FVG annotation inside aligned directional state | imbalance-context family | tests FVG as location/evidence attached to structure, not standalone direction |
| Displacement creates OB annotation inside aligned directional state | origin-zone-context family | tests OB as structural origin annotation, not standalone direction |
| FVG and OB overlap within same parent impulse | confluence-context family | tests whether two annotations from one impulse add information |
| Range state: no complete directional sequence, boundary sweep/reclaim | range-boundary family | uses explicit RANGE state and liquidity evidence; no trend assumption |
| Transition/range plus volume participation confirmation | participation-conditioned family | tests optional volume as evidence modifier, not structure replacement |

These are **fresh hypotheses derived from the new 15M output**, not selected bots. Names are semantic test IDs, not legacy strategy imports.

## Excluded from research

```text
EMA cross setup
RSI/MACD setup
fixed RR setup
fixed SL setup
raw BOS entry
raw FVG entry
raw OB entry
5M entry trigger
legacy nine-setup registry
```

Reason: these require entry mechanics or legacy semantics that Stage 2 did not select for 15M structure.

## Research acceptance per family

Each family must produce a structure-only event ledger:

```text
family_id
parent_15m_event_id
15m_state
bias_alignment
swing sequence
protected level
break annotation
CHoCH/MSS annotation
sweep/reclaim evidence
FVG/OB annotations
volatility bucket
volume context
candidate timestamp
rejection reason
```

Required comparisons:

```text
candidate count
unique parent count
clustering ratio
forward return distribution
matched non-candidate baseline
side split
state split
volatility split
30-day time blocks
bootstrap interval
purged chronological windows
```

No family passes by trade count or raw win rate.

## Research source boundary

Swing highs/lows are treated as liquidity markers and require confirmation, not as standalone signals.[1][2] Public explanations of liquidity sweeps consistently distinguish a breach/reclaim from a genuine accepted break; this supports testing sweep/reclaim as a separate evidence family, not merging it with BOS.[3][4][5] FVG and OB definitions are treated as annotations requiring a precise operational definition; public descriptions define FVG as a three-candle non-overlap pattern, but do not establish a universal crypto edge.[6][7]

The local Stage 2 event study remains primary evidence. External sources define concepts; they do not override local results.

## Decision

```text
No setup bot selected yet.
Fresh setup research families registered from new 15M structure.
Stage 6 remains blocked.
Next action: run structure-only family event study, then select/reject families.
```

## Sources

[1] https://id.tradingview.com/scripts/marketstructure/page-2/
[2] https://acy.com/en/market-news/education/market-education-stop-hunting-trading-swing-highs-lows-liquidity-j-o-20250822-095643/
[3] https://alchemymarkets.com/education/strategies/liquidity-sweep/
[4] https://dailypriceaction.com/blog/liquidity-sweep-reversals/
[5] https://brokeralarab.com/en/strategies/liquidity-sweep
[6] https://phemex.com/academy/fair-value-gap-crypto-trading
[7] https://www.quantum-algo.com/blog/order-blocks-fair-value-gaps-explained/
