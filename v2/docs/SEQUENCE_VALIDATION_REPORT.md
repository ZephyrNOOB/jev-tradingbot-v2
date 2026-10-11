# Stage 2 Full Candidate Research — Consolidated Result

Status: completed research diagnostics; no final indicator selected.

## Executed

- SMC component exact matching and bootstrap.
- Sweep/reclaim hypothesis probe.
- Trend/momentum probe.
- Volatility probe.
- Volume participation probe.
- VWAP location probe.
- Purge-aware event ledger fields.

## Other candidate raw results

15M BTCUSDT, forward 24-bar return, 500 block-bootstrap resamples:

| Candidate | Events | Mean | 95% CI | Decision |
|---|---:|---:|---:|---|
| EMA trend state | 23,730 | +0.0044% | -0.0326% to +0.0396% | no promotion |
| Momentum cross | 4,770 | -0.0091% | -0.0232% to +0.0045% | no promotion |
| Volatility expansion | 15,166 | -0.0039% | -0.0234% to +0.0152% | context only |
| Volume spike | 4,818 | +0.0323% | -0.0018% to +0.0703% | research hypothesis only |
| Rolling VWAP location | 34,840 | +0.0094% | -0.0196% to +0.0382% | no promotion |

These are descriptive probes. No candidate has passed post-cost tradeability or untouched validation.

## Integrated interpretation

1. Sweep/reclaim is strongest current hypothesis among tested SMC components. It requires 1H bias, 15M structure alignment, 5M confirmation, retest, costs, and untouched chronological validation.
2. Volume spike is a weak secondary hypothesis. Its interval nearly touches zero; it cannot act as direction by itself.
3. EMA trend and VWAP location show small positive means but intervals include zero and event coverage is high. They cannot be declared edge.
4. Momentum cross and volatility expansion show no robust positive evidence in this probe.
5. Raw BOS, combined sequence, FVG, and OB probes cannot be promoted. FVG/OB require operational retest definitions before rejection.

## Research hierarchy

```text
Primary structure hypothesis: sweep → reclaim → confirmation
Control: price-derived structure
Bias context: trend candidate, not proven edge
Secondary confirmation: volume candidate, not directional proof
Risk context: volatility candidate only
Location context: VWAP candidate only after 24/7 anchor contract
```

## Required final gate

The following are still mandatory before Stage 2 closes:

```text
exact SMC sequence definition
1H bias confirmation
15M structural alignment
5M confirmation
one frozen event ledger
purged walk-forward windows
cost-aware tradeability study
untouched final validation
final selected/rejected roles
```

No PnL tuning, Setup Bot implementation, or Stage 3 architecture transition is allowed yet.

## Sources

- https://www.sciencedirect.com/science/article/abs/pii/S1042443122000816
- https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/trend-factor-for-the-cross-section-of-cryptocurrency-returns/4C1509ACBA33D5DCAF0AC24379148178
- https://ideas.repec.org/a/ebl/ecbull/eb-09-00423.html
- https://arxiv.org/html/2502.13722v2
- https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf
