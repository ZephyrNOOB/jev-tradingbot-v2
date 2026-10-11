# Setup Confirmation Research — Derived From New 15M Structure

Status: historical pre-reassessment research artifact; no entry rules selected.

Scope note: this document and its nine-bot matrix predate the Stage 5A reassessment. The current frozen six-family research universe is `v2/artifacts/SETUP5A_CANDIDATE_UNIVERSE.json`; runtime remains limited to four active SetupBots.

## Core conclusion

A 15M structure label is never enough to permit entry. The bot must observe a **new, independent confirmation event** after the 15M candidate exists. A single candle, wick, label, volume spike, FVG, or OB is not sufficient.

The confirmation contract is:

```text
15M structural premise
+ 5M directional confirmation
+ 5M acceptance/rejection evidence
+ invalidation remains intact
+ no contradictory higher-timeframe evidence
```

This is a research contract, not yet an executable entry rule.

## Evidence standard

Buyer/seller control is inferred from price acceptance and displacement, not guessed from candle color. Crypto order-flow research supports studying buyer/seller-initiated pressure and order-book imbalance as short-horizon explanatory variables, but it does not establish a universal entry rule.[1][2][3] Volume therefore measures participation/pressure context; it cannot prove direction alone.

A swing high/low is a confirmed structural reference only after the required right-side candles exist; swing points and liquidity markers are not standalone signals.[4][5] A sweep must remain separate from an accepted break: breach plus reclaim is rejection evidence, while close-and-acceptance beyond a level is break evidence.[6][7][8]

Candlestick reversal patterns can have context-dependent results and require out-of-sample testing; a named candle is not proof of reversal.[9][10]

## Candidate-specific confirmation research

### BullishContinuationBot

**15M premise:** bullish HH→HL sequence, protected HL intact, 1H bias aligned.

**Required confirmation:**

```text
1. price reaches/approaches a valid 15M bullish reference or POI;
2. 5M does not close below protected 15M invalidation;
3. 5M forms a higher low or stops making lower lows;
4. 5M closes above the most recent confirmed 5M swing high;
5. break candle shows positive displacement relative to recent 5M movement;
6. next 5M observation accepts above the broken micro high or retest holds;
7. no bearish 15M contradiction appears.
```

**Reason:** buyer control is evidenced by defense of the 15M protected HL, then demand acceptance above a confirmed 5M swing. Green candle alone is rejected.

**Reject when:** 5M only rises without breaking a confirmed micro high, breaks below protected HL, produces immediate close-back below the break, or displacement is absent.

### BearishContinuationBot

**15M premise:** bearish LH→LL sequence, protected LH intact, 1H bias aligned.

**Required confirmation:** mirror logic:

```text
1. price reaches/approaches valid 15M bearish reference or POI;
2. 5M does not close above protected 15M invalidation;
3. 5M forms a lower high or stops making higher highs;
4. 5M closes below the most recent confirmed 5M swing low;
5. negative displacement is present;
6. next 5M observation accepts below the broken micro low or retest fails;
7. no bullish 15M contradiction appears.
```

**Reason:** seller control is evidenced by defense of protected LH and acceptance below a confirmed 5M swing. Red candle alone is rejected.

### LiquidityReclaimBot

**15M premise:** prior confirmed pool swept and close reclaimed inside.

**Required reversal confirmation:**

```text
1. sweep breaches prior pool, not an unconfirmed active pivot;
2. candle closes back inside the pool boundary;
3. follow-through does not re-accept beyond the swept level;
4. 5M breaks the first confirmed counter-direction micro swing;
5. 5M displacement supports the reversal direction;
6. 5M retest holds reclaimed level or fails to reclaim the swept side;
7. 15M protected structure is not invalidated by the reversal attempt.
```

**Reason:** failed breakout alone only identifies rejection. Reversal requires reclaim plus directional structure shift plus follow-through. Without 5M break/acceptance, classify as rejected sweep, not reversal.

### StructureTransitionBot

**15M premise:** protected swing broken by a completed 15M close with displacement; CHoCH/MSS annotation.

**Required confirmation:**

```text
1. break is through protected HL/LH, not a wick or micro level;
2. close is beyond the protected level;
3. displacement exceeds the predeclared evidence threshold;
4. following 15M behavior does not immediately close back inside old structure;
5. 5M builds a same-direction sequence after the break;
6. 5M retest rejects the broken protected level from the new side.
```

**Reason:** control transfer requires invalidation of the old protected structure plus acceptance in the opposite direction. The label CHoCH/MSS alone is not proof.

### FvgContextBot

**15M premise:** FVG created by a directional displacement inside aligned structure.

**Required reaction:**

```text
1. FVG is created by a measured displacement, not a random three-candle gap;
2. price returns to the FVG after creation;
3. 5M enters the zone and closes back in the intended direction;
4. 5M breaks a local swing in the intended direction;
5. price does not fully accept through the invalidation edge;
6. reaction is compared with matched non-FVG locations.
```

**Reason:** reaction means rejection/acceptance from a structural imbalance, not merely touching the zone. A touch without 5M response is no signal.

### OrderBlockContextBot

**15M premise:** OB is the opposite-direction candle/zone immediately preceding the displacement that produced a documented structural event.

**Rejection definition:**

```text
1. price returns to the OB after its creation;
2. 5M trades into the zone but fails to close through its invalidation boundary;
3. 5M closes away from the zone with directional body dominance;
4. 5M breaks a confirmed local swing away from the zone;
5. next observation accepts or retests without immediate failure.
```

A wick, engulfing candle, pin bar, or green/red candle alone is not rejection. Candle shape is evidence only when combined with location, invalidation, close, and follow-through.

### FvgObConfluenceBot

**15M premise:** FVG and OB overlap and share the same parent displacement impulse.

**Zone validity test:**

```text
1. overlap has a measurable non-zero interval;
2. both annotations share direction and parent impulse;
3. parent impulse caused a documented structural event;
4. overlap has not been invalidated or fully accepted through;
5. 5M response occurs inside overlap and breaks a local swing;
6. matched comparison tests overlap against FVG-only and OB-only locations.
```

**Reason:** overlap alone does not make an entry zone. Confluence is a candidate location; 5M response and invalidation control are mandatory.

### RangeBoundaryReclaimBot

**15M premise:** explicit RANGE state with confirmed boundaries and no complete directional sequence.

**Required return-to-range evidence:**

```text
1. boundary is confirmed by repeated reactions, not one arbitrary line;
2. price sweeps boundary and closes back inside;
3. next 15M/5M observation does not re-accept outside;
4. 5M breaks away from boundary in the range direction;
5. opposing boundary has sufficient distance for a non-trivial move;
6. range is not transitioning into accepted breakout.
```

**Reason:** no certainty of equilibrium return exists. The bot must classify only a conditional range-reclaim hypothesis. If outside acceptance persists, reject range-reversion logic.

### ParticipationConditionedBot

**15M premise:** a base family already passes its structural evidence.

**Volume role:**

```text
1. measure directional participation relative to a predeclared recent baseline;
2. compare buy/sell pressure proxy with price displacement;
3. confirm volume supports the base event;
4. do not create candidate from volume alone;
5. reject if high volume produces no price acceptance or contradicts direction.
```

**Reason:** volume estimates participation/pressure strength, not buyer/seller identity with certainty. It modifies confidence of a valid base setup; it does not define market structure or entry alone.

## Universal rejection policy

```text
no confirmed 5M swing break → reject
no close acceptance → reject
wick-only event → reject
contradictory 15M state → reject
protected level invalidated → reject original continuation
no follow-through → classify as failed confirmation
volume-only → reject
FVG/OB touch-only → reject
named candlestick-only → reject
```

## Final research decision

```text
Each bot requires independent confirmation.
No bot is entry-ready yet.
The confirmation hypotheses are now explicit and auditable.
Stage 5A remains open until these hypotheses are tested on the immutable dataset.
Stage 6 remains blocked.
```

## Sources

[1] https://link.springer.com/article/10.1007/s42521-019-00007-w
[2] https://www.sciencedirect.com/science/article/pii/S1386418126000029
[3] https://arxiv.org/html/2602.00776v1
[4] https://id.tradingview.com/scripts/marketstructure/page-2/
[5] https://acy.com/en/market-news/education/market-education-stop-hunting-trading-swing-highs-lows-liquidity-j-o-20250822-095643/
[6] https://alchemymarkets.com/education/strategies/liquidity-sweep/
[7] https://dailypriceaction.com/blog/liquidity-sweep-reversals/
[8] https://brokeralarab.com/en/strategies/liquidity-sweep
[9] https://journals.sagepub.com/doi/full/10.1177/2158244017736799
[10] https://www.sciencedirect.com/science/article/pii/S1058330012000092
