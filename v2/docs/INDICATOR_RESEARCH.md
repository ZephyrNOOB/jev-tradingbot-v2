# Fresh v2 Indicator Research

Status: research stage. No indicator is enabled.

## Research question

Which minimal evidence set can support:

```text
1H bias
→ 15M same-direction confirmation + market structure
→ 5M structure confirmation + timing
```

## Candidate classes

| Class | Candidate | Intended role | Risk |
|---|---|---|---|
| Price-derived structure | confirmed swing sequence, close breaks, displacement | 15M structure and 5M confirmation | definitions can become subjective; must be explicit |
| Trend direction | SMA/EMA family, slope, price location | 1H bias confirmation | lag and whipsaw; lengths must be researched, not inherited |
| Trend strength/regime | ADX/DMI family | distinguish trend from range | lag; threshold selection risk |
| Volatility normalization | True Range / ATR family | normalize displacement, stop distance, regime | not directional; cannot create bias |
| Participation | exchange volume, relative volume, OBV/CVD candidates | confirm movement quality | volume semantics differ by venue; futures volume is not proof of direction |
| Location | VWAP/session VWAP candidates | premium/discount and mean location | 24/7 crypto session definition must be fixed first |

## Research conclusions

1. Price-derived structure must remain primary. An indicator can confirm or normalize structure; it must not replace observed swing/close evidence.
2. Trend indicators are lagging descriptors, not standalone entry signals. Moving-average and time-series-momentum literature supports testing trend/momentum as a family, not accepting one period as universal.
3. ADX/DMI is a regime-strength candidate, not a direction oracle. Direction must come from price structure and bias evidence.
4. ATR/True Range is a volatility-normalization candidate only. It can express displacement relative to current volatility; it cannot decide LONG/SHORT.
5. Volume candidates require venue-specific validation. They remain optional until the Binance candle field and its relationship to directional follow-through are tested.
6. VWAP requires an explicit crypto session/reset rule. Do not import stock-market session assumptions.
7. The smallest falsifiable first stack is:

```text
price-derived structure
+ one trend-direction candidate
+ one volatility-normalization candidate
```

Adding ADX, volume, VWAP, RSI, or MACD before baseline evidence would create attribution ambiguity.

## Fresh candidate protocol

No old project values are reused. Every candidate gets:

```text
definition
input timeframe
closed-candle rule
lookback candidates
hypothesis
failure condition
data diagnostic
```

Lookback values are experiment variables, not defaults. No candidate passes because it is popular.

## Proposed research arms

### Arm A — price-only control

- 1H bias from a newly specified price-structure rule.
- 15M confirmation and structure from newly specified price data.
- 5M confirmation from newly specified micro-structure.
- No auxiliary indicator.

Purpose: measure whether structure logic itself carries information.

### Arm B — price + trend candidate

Add one trend-direction family to Arm A. Compare against Arm A without changing structure or execution.

### Arm C — price + trend + volatility candidate

Add one volatility-normalization family. Use it only to classify displacement/regime, not direction.

### Arm D — participation candidate

Add volume confirmation only after Arm C has a stable diagnostic ledger.

## Acceptance rules

An indicator candidate advances only when:

- its formula is written before testing;
- no lookahead exists;
- output is available on closed candles;
- its evidence is stored per decision;
- it adds information beyond the previous arm;
- the effect is measured by regime, side, and time block;
- the result survives an untouched chronological window;
- no conclusion relies on win rate alone.

## Important venue/data issue

Binance Futures Testnet is suitable for sandbox execution testing. Historical candle availability and representativeness must be checked before using it as a 12-month research dataset. If the testnet cannot provide the required period, use a separate public mainnet historical-candle snapshot for research while keeping all order execution disabled; testnet remains execution sandbox only. This is a data-boundary decision, not a strategy rule.

## Sources

- Binance USDⓈ-M Futures Kline/Candlestick API: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data
- Binance Futures API general information: https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info
- Moskowitz, Ooi, Pedersen, Time Series Momentum: https://live_demos.ssrn.com/sol3/live_demos.cfm?abstract_id=2089463
- The Significance of Technical Trading-Rule Profits: https://www.nber.org/live_demos/w3818
- Wilder ATR reference: https://ta-lib.github.io/ta-doc/indicator/ATR.htm
- LuxAlgo ADX/DMI concept reference: https://www.luxalgo.com/library/concept/adx-dmi-system/
