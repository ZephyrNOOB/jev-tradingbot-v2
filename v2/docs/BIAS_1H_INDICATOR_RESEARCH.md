# 1H Bias Indicator Research

Status: research complete; selection locked as research contract, not profitability proof.

## Question

Which evidence can determine 1H directional bias besides EMA?

## Candidate comparison

| Candidate | Bias information | Strength | Failure/risk | Decision |
|---|---|---|---|---|
| Confirmed 1H HH/HL/LH/LL structure | directional state and protected swing | directly price-derived; aligned with JEV architecture | pivot lag and scale sensitivity | **primary** |
| 1H close-confirmed BOS/CHoCH/MSS | continuation or transition evidence | uses structural close, not wick | break can fail without persistence | **required structure evidence** |
| ADX + DMI | trend strength and direction via +DI/-DI | separates trend strength from direction; useful regime filter | lagging; threshold is not universal | **context/filter, not bias alone** |
| ATR/realized volatility | movement regime and stop-distance context | avoids treating high volatility as directional bias | no direction by itself | **context only** |
| Volume / relative participation | activity and effort context | supports or contradicts price displacement | aggregate volume lacks aggressor side | **context only** |
| Binance taker buy/sell volume | signed participation proxy | better than raw volume for buy/sell pressure | still exchange-specific and not full order flow | **research candidate, nullable** |
| Open interest change | leverage/position participation context | can distinguish price/OI combinations | ambiguous without price and flow context | **research candidate, nullable** |
| Funding / long-short ratio | positioning/crowding context | detects crowded positioning | contrarian interpretation; not direct bias | **risk context only** |
| HMM/change-point probability | probabilistic regime state | expresses uncertainty and transition | model risk, lag, overfit | **shadow diagnostic only** |
| RSI/MACD/VWAP | momentum/location context | easy to calculate | redundant/lagging; no structural ownership | **not primary** |

## Required 1H bias decision model

The 1H Bias Bot must not use EMA as sole authority. It must produce an evidence ledger:

```text
structure_direction: BULLISH | BEARISH | RANGE | UNKNOWN
protected_reference
last_confirmed_break
break_type: BOS | CHOCH_MSS | NONE
break_persistence
trend_strength_context: ADX/DMI if selected
volatility_context: ATR/realized volatility
participation_context: aggregate or taker volume if available
positioning_context: OI/funding if available
conflicts
confidence
reason
```

Primary bias rule:

```text
confirmed 1H structure determines direction.
A close-confirmed break must be based on completed candles.
Protected swing invalidation can cancel bias.
ADX/DMI, volatility, volume, OI and funding cannot override structure alone.
Missing evidence yields RANGE/UNKNOWN, not guessed direction.
```

## Research conclusion

The best valid upgrade is not stacking indicators. Use a hierarchy:

```text
Primary: confirmed 1H price structure + protected swing + close-confirmed break
Filter: ADX/DMI to identify trend-strength versus range
Context: ATR/realized volatility and relative participation
Optional derivatives context: taker flow, OI, funding
Shadow only: HMM/change-point probability
```

No candidate has universal predictive validity. Literature supports studying crypto momentum/regime dependence, volatility, and order flow, but does not justify claiming any indicator guarantees direction or profit.[1][2][3][4][5]

## Sources

[1] https://arxiv.org/html/2602.11708v1
[2] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[3] https://www.sciencedirect.com/science/article/pii/S0275531924002654
[4] https://www.preprints.org/manuscript/202603.0831
[5] https://www.binance.com/en/markets/trading_data/futures/quarterly/trading-data
