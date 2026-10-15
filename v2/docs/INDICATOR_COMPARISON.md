# Indicator Candidate Comparison — Stage 2

Status: research complete; implementation and selection gate pending.

## Common criteria

Candidates are compared on:

```text
observable input
formula clarity
timeframe role
closed-candle availability
lookahead risk
lag/noise
crypto evidence
venue/data requirements
explainability
failure modes
```

No candidate receives a profitability score before a fresh event study.

## Candidate results

| Candidate | Best role | Evidence quality | Main value | Main risk | Decision |
|---|---|---|---|---|---|
| SMC-01 | 15M structure/POI; 5M confirmation | low direct peer-reviewed SMC evidence; high practitioner adoption | interpretable structure/event hypotheses | discretionary labels, retrospective bias | register for validation |
| Price-derived structure | 15M structure; 5M confirmation | foundational and directly observable | no indicator dependency; explainable | swing definition and confirmation lag | required control |
| Trend/momentum family | 1H bias confirmation | stronger crypto technical-analysis evidence | directional regime description | lag, whipsaw, parameter/data mining | test as one candidate family |
| ADX/DMI family | regime/trend strength | general technical reference; limited direct crypto evidence | separates trend/range hypothesis | lag; strength is not direction | optional secondary candidate |
| True Range/volatility family | normalization/risk context | strong volatility literature | normalizes movement and regime | cannot establish direction | test only as context |
| Volume/participation family | confirmation/context | crypto volume-return evidence exists, but venue semantics matter | tests participation hypothesis | volume is not directional proof | optional after controls |
| VWAP/location family | location/context/execution | crypto VWAP research emphasizes execution benchmark | location and execution reference | session anchor ambiguity in 24/7 crypto | defer until session contract |
| RSI/MACD/oscillators | possible secondary confirmation | broad usage, weak direct role for structure | momentum/mean-reversion context | overlap, lag, regime sensitivity | not first-line for structure |

## SMC evidence boundary

SMC is popular: LuxAlgo reported its TradingView SMC script reaching the platform's most-liked status in 2025, and TradingView hosts multiple SMC implementations.[1][2][3] This demonstrates adoption, not user count, accuracy, or success rate.

No verified public statistic was found for the number of active SMC traders, the percentage of successful SMC users, or a universal SMC win rate. Direct peer-reviewed SMC-on-crypto evidence was not found in this search. Public backtests are implementation-specific and cannot define general accuracy.

Crypto technical-analysis studies support testing rule families with explicit costs and data-mining controls, but do not validate SMC itself.[4][5][6][7]

## Data verification

A live request to Binance USDⓈ-M Futures Testnet public kline endpoint returned HTTP 200 for BTCUSDT 1h with a one-year-ago `startTime` request on 2026-10-02. This proves endpoint reachability and at least one historical response, not complete one-year coverage. Full snapshot and gap validation remain Stage 1 open gate.

## Stage 2 decision

SMC-01 remains registered for validation. It is not selected as a proven profitable indicator.

Recommended clean-room test order:

```text
A. price-derived structure control
B. SMC-01 operational structure candidate
C. one trend/momentum candidate for 1H confirmation
D. one volatility-normalization candidate
E. optional volume candidate
```

This is an experimental order, not a claim that SMC will win.

## Sources

[1] https://www.luxalgo.com/blog/smart-money-concepts-indicator-now-reaching-1-on-tradingview/
[2] https://www.tradingview.com/script/CnB3fSph-Smart-Money-Concepts-SMC-LuxAlgo/
[3] https://www.tradingview.com/script/RdfnBPYp-Smart-Money-Concepts-UAlgo/
[4] https://link.springer.com/article/10.1007/s10479-019-03357-1
[5] https://www.sciencedirect.com/science/article/abs/pii/S1042443122000816
[6] https://www.sciencedirect.com/science/article/abs/pii/S1059056024003010
[7] https://live_demos.ssrn.com/sol3/live_demos.cfm?abstract_id=3387950
[8] https://live_demos.ssrn.com/sol3/live_demos.cfm?abstract_id=4675565
[9] https://www.sciencedirect.com/science/article/abs/pii/S0275531921002130
[10] https://arxiv.org/html/2502.13722v2
[11] https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data
