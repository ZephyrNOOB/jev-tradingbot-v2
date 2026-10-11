# SMC Combined Gap Synthesis

Status: RESEARCH SYNTHESIS COMPLETE / NO CODE PATCH / NO BACKTEST
Scope: JEV MarketStructureBot compared with LuxAlgo public SMC/market-structure material, FractalTrader implementation, practitioner sources, and relevant market-microstructure research.

## Evidence rule

LuxAlgo and FractalTrader are operational implementations, not universal standards. Practitioner sources provide definitions and hypotheses, not automatic profitability proof. Academic sources support market microstructure, volatility, and execution claims; they do not prove every SMC label. Repeated gaps across sources are treated as specification weaknesses, not as proof that an alternative implementation is correct.

## Unified diagnosis

JEV has correct SMC foundations: price-derived structure, HH/HL/LH/LL, protected swing, close-confirmed breaks, and separation of structure authority from trade planning. Main weakness is incomplete event reasoning. Objects are named, but their identity, parent relationship, state transition, lifecycle, scale, acceptance, and failure are not specified tightly enough.

This is a logic/specification gap, not a missing filter. The repair target is event meaning and object relationships. Do not repair these gaps by adding ATR, volume, age, confidence, or other global thresholds.

## 1. BOS — Break of Structure

### JEV current state

JEV defines BOS as a completed 15M candle close beyond a prior structural swing. Wick-only breach is rejected. BOS is structure authority.

### Combined finding

LuxAlgo separates structure presentation into internal and swing structures and links breaks to identified pivots. FractalTrader uses configurable fractal/pivot structure and object-level state. Practitioner definitions generally distinguish continuation BOS from a counter-structure break and emphasize close confirmation, not wick breach. Combined, JEV BOS needs:

- stable `bos_event_id`;
- explicit `source_swing_id` and protected-reference ID;
- internal versus external/swing scale;
- continuation BOS versus reversal/character break classification;
- one event for one structural break, with duplicate-break handling;
- explicit detected → close-confirmed → accepted/failed lifecycle;
- immediate reclaim/failure state when price returns through the broken level;
- break candle timestamp, close timestamp, source timeframe, and source indices;
- parent regime and prior structure lineage.

### Logic correction target

Do not make BOS more selective with a body/ATR threshold. Make BOS semantically correct: identify which protected reference was broken, what type of break occurred, whether the break was accepted or failed, and how it changes the structure state.

## 2. CHoCH / MSS

### JEV current state

JEV records close-confirmed CHoCH/MSS as a structural change annotation.

### Combined finding

LuxAlgo distinguishes BOS and CHoCH visually by structure direction. Fractal-style implementations track pivot state and structural transitions. Practitioner sources generally describe CHoCH/MSS as the first confirmed break against the active protected structure, while later breaks in the new direction are BOS. Terminology is not universal, so JEV must define its own contract.

Required logic:

- identify the active protected high/low being violated;
- first counter-structure break becomes a transition event, not an immediate permanent trend flip;
- separate warning, confirmed transition, failed transition, and new-regime BOS;
- after confirmed transition, later same-direction breaks become BOS;
- prevent repeated CHoCH labels from the same protected reference;
- preserve reclaim/failure and event lineage.

### Logic correction target

CHoCH/MSS must be a state-machine transition tied to protected structure, not a label attached to any opposite candle or isolated swing break.

## 3. HH / HL / LH / LL and protected swing

### Combined finding

LuxAlgo exposes different structural scales. FractalTrader uses configurable fractal width and pivot objects. JEV names HH/HL/LH/LL and protected swings but lacks a formal scale and lineage policy.

Required logic:

- explicit pivot/fractal scale policy;
- internal and external structure as separate layers;
- swing classification linked to previous same-type swing;
- protected swing ID, creation event, replacement event, and invalidation reason;
- chain: swing → break → transition/continuation → new protected swing;
- equal highs/lows not treated as unrelated independent swings;
- no minor internal swing silently replacing external protected structure.

### Logic correction target

Improve hierarchy and object lineage. Do not use a larger pivot window as a blind filter.

## 4. FVG — Fair Value Gap

### JEV current state

FVG is supporting context/annotation, not structure authority.

### Combined finding

LuxAlgo presents FVG as a persistent zone. FractalTrader treats imbalance as an object that can be tracked. Practitioner definitions commonly use a three-candle imbalance, but geometry and fill semantics vary. JEV lacks a complete FVG object contract.

Required logic:

- exact three-candle source indices;
- bullish/bearish boundary coordinates;
- parent displacement/structure event when applicable;
- untouched, partially filled, fully filled, mitigated, invalidated, expired states;
- fill direction and fill timestamp;
- overlap/merge policy;
- source timeframe and event lineage;
- distinction between FVG existence and FVG trade eligibility.

### Logic correction target

Define what the imbalance is and how it evolves. Do not require an arbitrary minimum gap size to make it “valid.”

## 5. Order Block

### JEV current state

Order Block is supporting context/annotation.

### Combined finding

LuxAlgo links OB zones to structure and liquidity context. FractalTrader operationalizes source zones, mitigation, and invalidation more explicitly. Practitioner sources repeatedly warn that “last opposite candle” alone is insufficient; an OB should be related to displacement and a structural event. JEV lacks causal provenance.

Required logic:

- exact source candle rule;
- parent BOS/CHoCH/MSS or displacement event;
- body-only versus full-wick boundary policy;
- bullish/bearish polarity;
- created, active, touched, partially mitigated, fully mitigated, invalidated, expired states;
- mitigation count and last-touch timestamp;
- invalidation price and reason;
- nested/overlapping OB policy;
- clear distinction between an OB annotation and a setup-owned entry zone.

### Logic correction target

Tie OB identity to an actual structural impulse. Do not classify every opposite candle as an OB.

## 6. Liquidity pool and Liquidity Sweep / Reclaim

### JEV current state

Sweep/reclaim is supporting evidence.

### Combined finding

LuxAlgo maps liquidity and sweep events visually. FractalTrader models liquidity objects and sweep-related strategy components. Practitioner sources distinguish a liquidity pool from a single high/low and distinguish a sweep from a reclaim/acceptance sequence. JEV currently lacks persistent pool identity.

Required logic:

- equal-high/equal-low clustering;
- explicit price tolerance policy as object geometry, not a global trade filter;
- pool ID and member swing IDs;
- internal versus external liquidity;
- pool creation, active, swept, reclaimed, consumed, and expired states;
- sweep timestamp and sweep candle;
- wick breach versus body acceptance distinction;
- reclaim close and subsequent structural response;
- failed reclaim and second-sweep handling;
- parent pool ID on every sweep event.

### Logic correction target

First identify the pool, then identify the sweep, then identify the reclaim and response. A wick beyond one arbitrary high is not automatically a liquidity sweep.

## 7. Inducement

### JEV current state

Inducement has no final falsifiable contract and must remain non-authoritative.

### Combined finding

LuxAlgo and FractalTrader do not provide one universally accepted inducement definition. Practitioner terminology varies between internal liquidity, a minor swing that attracts participation, and a pre-break trap. This lack of standard makes inducement especially vulnerable to hindsight labeling.

Required logic before implementation:

- explicit parent liquidity or structure event;
- objective formation rule;
- timestamp and source swing IDs;
- invalidation/failure condition;
- no use as market-structure authority until a local event study can test it.

### Logic correction target

Do not add an inducement filter. Either define a falsifiable event and test it, or keep it as an unimplemented research concept.

## 8. Premium / Discount and dealing range

### Combined finding

LuxAlgo commonly displays premium/discount from a dealing range. JEV references premium/discount conceptually but lacks a formal range object.

Required logic:

- range ID and source protected swings;
- external versus internal dealing range;
- equilibrium definition;
- range creation, update, invalidation, and replacement;
- premium/discount as descriptive location, not automatic entry permission;
- provenance to the structure event that created the range.

## 9. POI and object lifecycle

### Combined finding

FractalTrader is stronger in explicit object lifecycle. LuxAlgo provides persistent visual zones. JEV has partial lifecycle concepts but not one consistent state machine across FVG, OB, liquidity pool, sweep, protected swing, and dealing range.

Required shared lifecycle:

```text
created → active → touched → partially mitigated → fully mitigated
                 ↘ invalidated
                 ↘ expired
```

Not every object uses every state, but every object must declare allowed transitions and a reason for terminal state.

## 10. Event identity, provenance, and lineage

### Combined finding

JEV requires timestamps and source indices, which is insufficient for robust event auditing. External implementations use pivot/object references more explicitly. Every structure object needs stable identity and parent relationships.

Required fields:

```text
event_id
object_id
parent_event_id
parent_swing_id
parent_pool_id
parent_bos_id
source_timeframe
source_indices
created_at
confirmed_at
invalidated_at
state
state_reason
```

Required MTF lineage:

```text
1H bias event
→ 15M structure event
→ 5M confirmation event
→ Selection event
→ selected SetupBot trade-plan event
```

## 11. Regime and structure scale

### Combined finding

JEV states BULLISH, BEARISH, RANGE, TRANSITION, and UNKNOWN. The state labels are useful, but transition cause and scale are under-specified.

Required logic:

- state transition reason;
- parent event causing transition;
- internal/external disagreement handling;
- persistence of range boundaries;
- confidence as descriptive evidence, not a global trading filter;
- UNKNOWN when structure evidence is insufficient.

## 12. Volume, order flow, volatility, and displacement

These are not additional MarketStructureBot authorities.

```text
volume: context
volatility: context
order flow: context unless true taker/L2 data exists
displacement: event attribute where explicitly defined, not a global filter
```

OHLCV volume must not be called full order flow. Taker volume and taker-buy volume are proxies; L2 and trade-level imbalance are separate evidence classes.

## Consolidated gap list

### P0 — structural logic

1. Stable event/object identity and provenance.
2. BOS state machine tied to protected swing.
3. CHoCH/MSS state machine tied to first counter-structure break.
4. Internal versus external structure hierarchy.
5. Protected swing lineage and replacement/invalidation.
6. Duplicate event policy.

### P1 — object reasoning

7. Liquidity pool clustering and lifecycle.
8. Sweep/reclaim lifecycle and pool relationship.
9. FVG geometry, fill, and invalidation lifecycle.
10. OB causal source and mitigation lifecycle.
11. Shared POI/object state machine.
12. Complete 1H → 15M → 5M event lineage.

### P2 — incomplete concepts

13. Premium/discount dealing-range object.
14. Regime transition provenance.
15. Inducement falsifiable definition.
16. Volume/taker/L2 evidence classification.
17. Displacement semantics.

## What this synthesis proves

It proves that JEV's SMC contract has specification and reasoning gaps when compared with multiple operational implementations and research sources. It does not prove that LuxAlgo, FractalTrader, or any SMC label is universally correct or profitable.

The correct repair is:

```text
improve event meaning
improve object relationship
improve lifecycle
improve provenance
improve state transitions
```

The incorrect repair is:

```text
add global ATR filter
add global volume filter
add age threshold
add confidence threshold
add arbitrary minimum gap
add arbitrary RR gate
```

## Decision

Synthesis complete. No code patch. No backtest. No MarketStructureBot core change. Any implementation requires separate user approval, one gap at a time, with isolated validation.

## Sources

- LuxAlgo SMC: https://www.luxalgo.com/library/indicator/smart-money-concepts-smc/
- LuxAlgo Market Structure: https://www.luxalgo.com/library/indicator/market-structure-choch-bos-fractal/
- FractalTrader repository: https://github.com/r464r64r/FractalTrader
- FractalTrader market structure source: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/market_structure.py
- FractalTrader liquidity source: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/liquidity.py
- FractalTrader imbalance source: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/imbalance.py
- FractalTrader order-block source: https://raw.githubusercontent.com/r464r64r/FractalTrader/main/core/order_blocks.py
- Binance aggregate trade streams: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Aggregate-Trade-Streams
- Order Flow and Cryptocurrency Returns: https://www.sciencedirect.com/science/article/pii/S1386418126000029
- State-Dependent L2 Liquidity Transitions: https://arxiv.org/pdf/2607.09230
- Bitcoin Technical Trading Rules: http://dirkgerritsen.nl/uploads/gerritsen_et_al_2020_bitcoin_trading_rules.pdf
