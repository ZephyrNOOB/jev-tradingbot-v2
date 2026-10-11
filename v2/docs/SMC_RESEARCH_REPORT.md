# Smart Money Concept (SMC) — Research Report

Date: 2026-10-02  
Status: evidence review complete; SMC not yet enabled.

## Executive conclusion

SMC is suitable as a **candidate price-structure framework** for crypto research. It is not yet a validated indicator, universal strategy, or standalone trading edge.

The defensible decision is:

```text
Use SMC as a falsifiable structure hypothesis.
Do not use SMC as proof of institutional order flow.
Do not claim a universal win rate.
Do not import public win-rate claims into project assumptions.
```

SMC concepts can map cleanly onto observable candle data:

```text
market structure → confirmed swings and close breaks
liquidity sweep   → prior-level wick breach + reclaim
FVG              → three-candle price imbalance definition
OB               → explicitly defined source candle + subsequent displacement
```

But labels such as “smart money,” “institutional order flow,” and “order block” do not reveal actual participant identity or resting institutional orders from OHLCV alone. They are interpretations that require an operational definition before testing.

## What field research found

### Popularity

LuxAlgo reported its SMC TradingView script becoming TradingView’s most-liked indicator in May 2025.[1] TradingView hosts multiple SMC scripts, including LuxAlgo and UAlgo implementations.[2][3] This supports broad user adoption and interest, not profitability or the number of profitable traders.

No reliable public source found a verified count of active SMC traders or a verified fraction of successful users. Platform likes, views, and script usage are not outcome data.

### Accuracy claims

Public SMC material commonly presents setup examples and high win-rate narratives. A crypto-focused review explicitly states that 80–90% claims are unsourced lore and that no peer-reviewed study had directly validated ICT/SMC on crypto at the time of review.[4] Independent backtests found through search are publisher-specific, non-standardized, and not sufficient to establish a general accuracy rate.[5][6]

Therefore:

```text
Verified universal SMC accuracy: none found.
Verified percentage of successful SMC traders: none found.
Verified trader population count: none found.
```

Any exact number must be treated as a result of a specific implementation, asset, timeframe, period, cost model, and validation design—not as “SMC accuracy.”

### Academic/market evidence

Research on technical trading in cryptocurrencies is relevant but does not validate SMC specifically. A large study examined almost 15,000 technical trading rules across Bitcoin and other cryptocurrencies and reported predictability/profitability for rule classes, while also reporting breakeven transaction costs substantially higher than typical crypto costs in its sample.[7] A later Bitcoin study tested 75,360 rules while accounting for realistic investor behavior, transaction costs, and data-mining issues.[8]

Other research specifically studies how transaction costs and bubble periods change technical-rule returns.[9] A comprehensive study of crypto technical trading also reports that performance is regime-dependent rather than a constant property of the rule.[10]

This supports the research design, not an SMC conclusion:

```text
SMC must be tested as a precise rule family.
Costs, regime, bubble/trend state, and data mining must be explicit.
```

## SMC component assessment

| Component | Observable from candles? | Candidate value | Main failure risk |
|---|---:|---|---|
| HH/HL/LH/LL | Yes, after confirmation | structure state | pivot hindsight and subjective swing choice |
| BOS | Yes, if close-break rule is fixed | continuation evidence | wick/close ambiguity and lookahead |
| CHoCH/MSS | Yes, if protected swing and sequence are fixed | transition hypothesis | retrospective labeling and false reversals |
| Liquidity sweep | Partly | rejection/liquidity hypothesis | prior pool definition and intrabar path unknown |
| FVG | Yes, operationally | displacement/retest hypothesis | many gaps, selection bias, weak standalone edge |
| Order Block | Partly | source-zone hypothesis | arbitrary source candle and zone boundaries |
| Inducement | Weakly | sequence/context hypothesis | highly discretionary definitions |
| Premium/discount | Yes, relative to a defined range | location feature | range anchor is subjective |

## Does SMC fit crypto?

**Potentially yes, as a research framework.** Crypto has continuous trading, high volatility, frequent market-structure transitions, and public OHLCV data. Those properties make the concepts testable.

**Not automatically yes as a profitable strategy.** Crypto’s 24/7 market, venue fragmentation, changing liquidity, fee/slippage effects, and bubble/regime changes can invalidate a rule that looks good in one sample. Technical-analysis research confirms the importance of transaction costs and market regime.[7][9][10]

## New project decision

SMC is admitted only as **Indicator/Structure Candidate SMC-01**.

It is not yet the selected indicator. It must pass the same clean-room process as any candidate.

### SMC-01 required definition before coding

The research specification must define, without old project values:

1. swing confirmation and whether confirmation delay is allowed;
2. HH/HL/LH/LL classification;
3. active and protected swing;
4. BOS close condition;
5. CHoCH/MSS sequence;
6. displacement measurement;
7. liquidity pool source and sweep/reclaim rule;
8. FVG boundaries and mitigation;
9. OB source candle, validation, and invalidation;
10. inducement definition or explicit exclusion;
11. premium/discount range anchor;
12. 1H, 15M, and 5M roles;
13. no-lookahead timestamp contract;
14. evidence fields and rejection reasons.

No threshold is inherited from the legacy project.

## Proposed validation design

### Stage 1 — Structure validity, no PnL

Replay closed candles and audit:

```text
swing confirmation
structure labels
break timestamps
protected levels
sweep sequence
FVG/OB provenance
5M confirmation alignment
```

### Stage 2 — Null and placebo controls

Compare SMC-01 against:

```text
price-only structure control
time-shuffled labels
direction-shuffled control
simple trend baseline
```

A detector that cannot beat its controls in out-of-sample evidence is not accepted.

### Stage 3 — Cost-aware event study

Measure forward returns after each event before turning events into trades:

```text
BOS only
CHoCH/MSS only
sweep only
FVG retest only
OB retest only
combined sequence
```

Do not combine components before isolated attribution exists.

### Stage 4 — Strategy validation

Only after event evidence passes:

```text
1H bias
→ 15M SMC structure and eligible setup
→ 5M SMC confirmation
→ one setup bot
→ execution model
```

Use chronological development, purged validation/embargo where event horizons overlap, and untouched test windows. Report expectancy, net R, PF, drawdown, uncertainty, and regime/side/time-block breakdown.

## Decision

```text
SMC as research candidate: ACCEPT
SMC as selected indicator:   NOT YET
SMC universal accuracy:      NOT ESTABLISHED
SMC trader success rate:     NOT ESTABLISHED
SMC standalone entry tool:   REJECT
SMC structure layer subject to validation: ACCEPT
```

The clean-room project continues with SMC-01 specification, not with old SMC code.

## Sources

[1] LuxAlgo popularity report: https://www.luxalgo.com/blog/smart-money-concepts-indicator-now-reaching-1-on-tradingview/

[2] LuxAlgo SMC TradingView script: https://www.tradingview.com/script/CnB3fSph-Smart-Money-Concepts-SMC-LuxAlgo/

[3] UAlgo SMC TradingView script: https://www.tradingview.com/script/RdfnBPYp-Smart-Money-Concepts-UAlgo/

[4] Crypto SMC evidence review and warning on unsourced win-rate claims: https://www.alphaexcapital.com/smart-money-concepts/smart-money-concepts-for-crypto

[5] Public crypto SMC backtest example; methodology is publisher-specific: https://www.youtube.com/watch?v=LOOw2DQ0gpY

[6] Public 2,600-trade SMC backtest example; methodology is publisher-specific: https://medium.com/@space.garaa/i-backtested-2-600-trades-using-smart-money-concepts-heres-what-actually-works-bb3c671098c6

[7] Hudson, Urquhart, Technical trading and cryptocurrencies: https://link.springer.com/article/10.1007/s10479-019-03357-1

[8] Are simple technical trading rules profitable in bitcoin markets?: https://www.sciencedirect.com/science/article/abs/pii/S1059056024003010

[9] Technical analysis in cryptocurrency markets: Do transaction costs and bubbles matter?: https://www.sciencedirect.com/science/article/abs/pii/S1042443122000816

[10] On the drivers of technical analysis profits in cryptocurrency: https://www.sciencedirect.com/science/article/abs/pii/S1057521923000327
