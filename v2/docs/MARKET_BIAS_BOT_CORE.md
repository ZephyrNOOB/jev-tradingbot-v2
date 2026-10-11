# MarketBiasBot Core

Status: CORE LOCKED / RESEARCH-BACKED / NO PROFIT GUARANTEE

## Core principle

MarketBiasBot determines 1H directional bias from confirmed 1H market structure. EMA, ADX/DMI, volatility, volume, derivatives data, and regime models support analysis but cannot override confirmed structure.

## Authority hierarchy

```text
1. Confirmed 1H HH/HL/LH/LL structure
2. Protected swing reference
3. Close-confirmed BOS or CHoCH/MSS
4. Break persistence and invalidation state
5. ADX/DMI trend-strength context
6. ATR/realized-volatility context
7. Relative participation / volume context
8. Taker buy/sell flow, OI, funding context when available
9. HMM/change-point as shadow uncertainty diagnostic only
```

## Bias output

```text
BULLISH:
  confirmed HH/HL structure
  protected bullish reference intact
  latest valid bullish continuation or reversal break

BEARISH:
  confirmed LH/LL structure
  protected bearish reference intact
  latest valid bearish continuation or reversal break

RANGE:
  conflicting or non-directional structure
  no valid protected directional reference

UNKNOWN:
  insufficient closed-candle evidence
  missing required structure data
```

## Hard rules

```text
closed candles only
no lookahead
structure determines direction
EMA cannot determine bias alone
ADX/DMI cannot override structure
ATR cannot determine direction
volume cannot determine direction alone
OI/funding cannot override structure
HMM/change-point cannot become authority
missing evidence returns RANGE or UNKNOWN
bias is immutable for each completed 15M decision
```

## Evidence record

Every decision stores:

```text
bias
confidence
structure_direction
HH/HL/LH/LL references
protected_reference
last_confirmed_break
break_type: BOS | CHOCH_MSS | NONE
break_persistence
trend_strength_context
volatility_context
participation_context
positioning_context
conflicts
reason
source_timestamp
source_indices
```

## Research conclusion

Research supports using trend structure as the primary directional framework, while treating trend strength, volatility, participation, derivatives positioning, and probabilistic regime models as separate context or diagnostic layers. Research does not prove any indicator guarantees direction or profitability. This core is therefore a defensible decision hierarchy, not a claim of certainty or guaranteed edge.

## Change control

This core is immutable by default. Any change requires explicit user approval and a new research record plus isolated validation.
