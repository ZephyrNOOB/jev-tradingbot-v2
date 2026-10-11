# SMC Gap Research

Status: RESEARCH COMPLETE / NO PATCH
Scope: compare JEV MarketStructureBot with LuxAlgo public description, FractalTrader source review, and academic/professional evidence. No code/backtest executed.

## Evidence boundary

SMC is a practitioner framework, not a single standardized indicator. LuxAlgo and FractalTrader implement different operational definitions. Public trader education is hypothesis/evidence-light; it cannot prove profitability. Local event studies tested components, not a complete profitable SMC strategy.

## JEV current contract

Primary authority: confirmed 15M price structure, HH/HL/LH/LL, protected swing, close-confirmed BOS, close-confirmed CHoCH/MSS.
Supporting context: sweep/reclaim, FVG, Order Block, volatility, volume participation.
Hard boundary: closed candles, no lookahead, immutable 1H bias, 15M owns structure, no 5M input, no Entry/SL/TP.

## Comparison

| Component | JEV | External comparison | Evidence-based gap |
|---|---|---|---|
| Swing structure | HH/HL/LH/LL and protected swing | LuxAlgo exposes internal/swing structure; FractalTrader uses configurable fractal width | JEV does not yet specify scale policy, pivot width sensitivity, or nested structure graph |
| BOS | close beyond prior swing | Practitioner definitions commonly distinguish continuation break from character change | JEV contract says close-confirmed, but lacks explicit break reference identity, minimum acceptance/persistence, and duplicate-event policy |
| CHoCH/MSS | close-confirmed annotation | Usually first counter-structure break, but terminology varies | JEV needs explicit protected-reference invalidation and distinction between first warning, confirmed reversal, and continuation |
| FVG | supporting annotation | Common three-candle imbalance concept | JEV lacks explicit candle indexing, minimum gap rule, fill/partial-fill lifecycle, invalidation, and multi-timeframe provenance |
| Order Block | supporting annotation | Implementations vary: last opposing candle before displacement, often with mitigation/invalidation | JEV lacks exact source candle rule, displacement ownership, body/wick boundaries, mitigation count, and invalidation event |
| Liquidity sweep/reclaim | supporting annotation | LuxAlgo/FractalTrader expose liquidity/sweep concepts | JEV lacks equal-high/low clustering tolerance, pool identity, wick/body reclaim definition, and pool lifecycle |
| Inducement | output/context in earlier research | Practitioner term is ambiguous and not standardized | JEV lacks a falsifiable operational definition; should not be authority until defined and tested |
| Provenance | timestamp/source indices required | FractalTrader tracks object state in code | JEV contract is stronger than rough runner, but every event needs stable event_id/POI_id and parent swing IDs |
| Lifecycle | core mentions protected references | FractalTrader explicitly models POI/OB lifecycle more operationally | JEV needs persistent created/touched/mitigated/invalidated/expired state for every object |

## Findings by component

### BOS

Definition is directionally correct: a confirmed candle close beyond a prior structural swing is materially safer than wick breach. It is not yet complete. Need explicit swing reference, one event per break, close timestamp, acceptance state, and invalidation if price immediately reclaims the broken level. Do not add an arbitrary ATR/body threshold to MarketStructureBot; that would be a global trade filter.

### CHoCH/MSS

Current label is under-specified. CHoCH/MSS must be tied to the first close through the protected counter-swing, while later same-direction breaks remain BOS. Keep warning and confirmation states separate. Terminology conflict means no universal claim of correctness without a locked definition.

### FVG

Concept is usable as annotation but not proven standalone signal by local study. Add exact three-candle geometry and lifecycle only after contract approval. Avoid gap-size threshold unless setup-owned.

### Order Block

Concept is implementation-sensitive. “Last opposite candle” alone is insufficient. Require source event, displacement relation, zone boundaries, mitigation/invalidity state, and provenance. Keep as context, not structure authority.

### Liquidity sweep

Needs pool identity. A wick beyond one prior high/low is not enough to prove a liquidity pool. Equal-high/low clusters, sweep timestamp, reclaim close, and whether pool remains active are missing.

### Inducement

No stable objective definition in current core. Research found practitioner terminology varies. Keep non-authoritative and unimplemented until falsifiable rule and local event study exist.

## Ranked gaps

P0: stable event identity and provenance for swing, BOS/CHoCH, pool, FVG, OB.
P0: explicit BOS/CHoCH state machine tied to protected swing and duplicate-break handling.
P1: persistent lifecycle for FVG, OB, liquidity pool, and sweep/reclaim.
P1: scale/nesting policy for internal vs swing structure.
P1: equal-liquidity cluster definition and tolerance.
P2: exact FVG geometry and fill semantics.
P2: exact OB source candle/boundary semantics.
P2: inducement operational definition.

## Decision

Research confirms gaps in specification and event lifecycle, not that JEV SMC is profitable or that LuxAlgo/FractalTrader is universally correct. No code patch or backtest is authorized by this artifact. Changes require explicit user approval and isolated validation.

## Sources

- LuxAlgo SMC public indicator page: https://www.luxalgo.com/library/indicator/smart-money-concepts-smc/
- LuxAlgo market structure page: https://www.luxalgo.com/library/indicator/market-structure-choch-bos-fractal/
- FractalTrader repository: https://github.com/r464r64r/FractalTrader
- FractalTrader market structure source: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/market_structure.py
- Binance aggregate trade stream documentation: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Aggregate-Trade-Streams
- Order flow and cryptocurrency returns: https://www.sciencedirect.com/science/article/pii/S1386418126000029
- State-dependent L2 liquidity transitions: https://arxiv.org/pdf/2607.09230
- Bitcoin technical trading rules: http://dirkgerritsen.nl/uploads/gerritsen_et_al_2020_bitcoin_trading_rules.pdf
