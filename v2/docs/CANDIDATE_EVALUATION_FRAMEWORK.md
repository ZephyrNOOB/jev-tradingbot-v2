# Candidate Evaluation Framework — Stage 2

Status: approved metric framework; no candidate selected.

## Objective

Evaluate indicator candidates as evidence-producing components, not as win-rate generators. First test whether candidate events contain forward information. Only then test whether a complete trading rule can monetize that information after costs.

## Evaluation layers

### Layer 1 — Data and implementation validity

Hard gates. Failure means candidate result is invalid.

| Metric | Acceptance | Reason |
|---|---|---|
| Candle integrity | zero invalid OHLC | prevents corrupted features |
| Timestamp order | strict ascending, no duplicates | prevents replay and join errors |
| Closed-candle use | 100% signals use completed source candle | prevents lookahead |
| MTF alignment | each 15M/5M decision maps to completed 1H/15M parent | prevents future information leakage |
| Reproducibility | same input/config gives identical event ledger hash | proves deterministic implementation |
| Missing-value policy | explicit; no silent forward fill | prevents hidden signal distortion |

### Layer 2 — Signal/evidence quality

No PnL required yet.

| Metric | Output | Reason |
|---|---|---|
| Event count | total events and unique parent events | identifies statistical power and duplicates |
| Coverage | events / eligible closed candles | shows whether candidate is usable or almost always silent |
| Forward return by horizon | signed return at 1, 3, 6, 12, 24 5M bars | tests whether event contains future information |
| Forward return in R/vol units | return divided by contemporaneous volatility estimate | compares across regimes without selecting a legacy threshold |
| Directional hit rate | sign of forward return, with confidence interval | descriptive only; not strategy win rate |
| Median return | median signed forward return | protects against a few large outliers |
| Quantiles | p10/p25/p50/p75/p90 | exposes distribution and tail dependence |
| Event clustering | events per parent impulse and time bucket | prevents one episode masquerading as many observations |
| Conditional lift | event outcome minus matched non-event baseline | measures incremental information, not raw market drift |
| Regime stability | result by trend/range/volatility/time block | detects context dependence |
| Side symmetry | LONG and SHORT separately | prevents one side hiding failure of the other |

### Layer 3 — Cost-aware tradeability

Only after Layer 2.

| Metric | Acceptance direction | Reason |
|---|---|---|
| Net expectancy per event/trade | positive after fees, slippage, and funding where applicable | profit objective |
| Net R distribution | positive median/mean with tails reported | normalizes risk geometry |
| Profit factor | >1 on development and untouched validation | gain/loss balance |
| Cost sensitivity | remains viable under baseline and stressed costs | prevents fragile edge |
| Max drawdown | within declared risk limit | survivability |
| Time under water | reported | capital opportunity cost |
| Monthly/block consistency | not dependent on one block | temporal robustness |
| Trade frequency | compatible with target 3–7 trades/day, not forced | avoids overtrading |
| Position overlap | no unintended duplicate exposure | valid risk measurement |

### Layer 4 — Statistical reliability and selection bias

Required before final candidate selection.

| Metric | Use |
|---|---|
| Bootstrap confidence interval | uncertainty of expectancy, PF, and cumulative net result; block bootstrap preserves event clustering |
| Untouched chronological validation | tests generalization to later data |
| Purged boundary + embargo | removes events whose forward horizon overlaps train/validation boundary |
| Walk-forward windows | tests temporal stability across regimes |
| White Reality Check / multiple-testing control | corrects inference after trying many candidate rules |
| Deflated Sharpe Ratio or equivalent | adjusts for selection bias, non-normality, and multiple trials |
| Parameter-region stability | prefer a stable neighborhood over one optimized point |
| Opportunity retention | reports removed/retained events and winners; prevents “improvement” by deleting opportunities |

## Primary scorecard

Do not collapse all evidence into one arbitrary weighted score. Use gates first, then a transparent rank.

### Hard reject

Reject candidate if any applies:

```text
implementation/leakage gate fails
no measurable conditional lift over matched baseline
negative net expectancy in every required validation window
result exists only in one regime or one side without declared scope
cost stress destroys result
insufficient events for the claim
```

### Research rank

Among candidates that pass hard gates, report:

```text
1. implementation validity
2. conditional forward-return lift
3. validation-window consistency
4. post-cost expectancy and PF
5. drawdown and tail risk
6. cost sensitivity
7. statistical uncertainty
8. coverage and trade-frequency fit
9. interpretability and auditability
```

No weights are locked until event counts and distributions are available. This avoids manufacturing a score that hides weak evidence.

## Trade-frequency target

The project target is approximately 3–7 positive-quality trades per day, not 3–7 forced signals. Evaluate:

```text
median trades/day
p10 and p90 trades/day
zero-trade days
clustered-trade days
net expectancy by frequency bucket
```

A candidate does not pass by increasing count. A lower frequency is acceptable if the post-cost distribution remains positive and robust.

## Candidate-specific notes

### SMC-01

Evaluate components separately before combination:

```text
structure event
BOS
CHoCH/MSS
sweep/reclaim
FVG event/retest
OB event/retest
combined sequence
```

Use parent-event IDs. Overlapping labels from one impulse count as one economic event.

### Trend/momentum candidate

Measure directional forward-return lift and regime dependence. Do not accept a popular period without a fresh comparison.

### Volatility candidate

Measure normalization quality and conditional lift, not direction. It passes only as a context/risk feature unless it demonstrates directional information independently.

### ADX/DMI candidate

Treat direction and strength separately. Report whether it improves regime classification beyond price-only control.

### Volume candidate

Validate venue volume semantics and compare event outcomes against matched price-only events. Volume confirmation is not directional proof by itself.

### VWAP candidate

Define the 24/7 reset/session rule before evaluation. Without a fixed anchor, VWAP results are not reproducible.

## Final selection rule

Select candidate roles only when:

```text
all Layer 1 gates pass
Layer 2 shows conditional lift
Layer 3 passes post-cost validation where monetization is claimed
Layer 4 shows robustness and uncertainty
role remains interpretable and auditable
```

A candidate may be selected for research role without being declared profitable. A failed trading rule does not automatically disprove its descriptive market-structure information; report those conclusions separately.

## Sources

- White, A Reality Check for Data Snooping: https://www.jstor.org/stable/2999444
- White Reality Check PDF: https://users.ssc.wisc.edu/~behansen/718/White2000.pdf
- Deflated Sharpe Ratio: https://www.davidhbailey.com/dhblive_demos/deflated-sharpe.pdf
- Technical trading and cryptocurrencies: https://link.springer.com/article/10.1007/s10479-019-03357-1
- Technical analysis, transaction costs and bubbles: https://www.sciencedirect.com/science/article/abs/pii/S1042443122000816
- Event-study methodology reference: https://www.eventstudytools.com/introduction-event-study-methodology
