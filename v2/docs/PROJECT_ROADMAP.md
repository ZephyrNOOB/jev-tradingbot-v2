# Fresh v2 Project Roadmap

## Stage 0 — Clean-room reset

Status: COMPLETE

- Separate v2 boundary.
- Legacy rules/results excluded from v2 inputs.
- No active indicator, setup, risk, cost, or PnL rule.

## Stage 1 — Data boundary

Status: COMPLETE

- Venue: Binance Futures USDⓈ-M Testnet.
- Market: BTCUSDT perpetual futures.
- Initial scope: 12 months.
- Timeframes: 1H, 15M, 5M.
- Raw local snapshot required.
- Live orders disabled.

Verification: CLOSED. Historical coverage, immutable snapshot, timestamps, duplicates, OHLC, gaps, and closed-candle semantics are validated.

## Stage 2 — Indicator research and selection

Status: COMPLETE

Indicator research and selection are complete. Setup-family research continues in Stage 5A.

### 2.1 Research candidate classes

- Price-derived market structure.
- Trend-direction candidate.
- Trend-strength/regime candidate.
- Volatility-normalization candidate.
- Participation/volume candidate.
- Location candidate.
- SMC-01 as market-structure candidate.

### 2.2 Define comparable evaluation criteria

Every candidate must be evaluated for:

- observable input and formula;
- timeframe role;
- closed-candle availability;
- lookahead risk;
- lag;
- noise and ambiguity;
- data requirements;
- computational cost;
- explainability;
- failure modes;
- research evidence quality.

### 2.3 Complete research

SMC research and the comparable candidate review are complete. The selected market-structure baseline is documented; setup-family promotion remains gated in Stage 5A.

### 2.4 Verify data availability

Before indicator experiments:

- check historical coverage;
- download raw snapshot;
- validate timestamps, duplicates, OHLC, and closed-candle semantics;
- record exact source, period, and counts.

### 2.5 Select or reject candidates

Produce one final decision record:

- selected candidates and roles;
- rejected candidates and reasons;
- unresolved hypotheses;
- validation plan.

No setup-family promotion or strategy PnL implementation before the Stage 5A gate closes.

## Stage 3 — System architecture

Status: COMPLETE

- Market Structure Bot.
- Execution Context Bot.
- Setup Bots, one per newly defined setup family.
- Contracts and evidence schema.

## Stage 4 — Exchange and market operation

Status: COMPLETE

- Confirm venue suitability.
- Confirm Futures vs Spot.
- Confirm public historical endpoint.
- Confirm fee, funding, and execution data requirements.

## Stage 5 — Historical data pipeline

Status: COMPLETE

- Download raw candles.
- Store immutable snapshot.
- Validate and version dataset.
- Keep funding/fee datasets separate and unimplemented until the Stage 6 cost model.

## Stage 5A — Setup research and market-structure mapping

Status: COMPLETE

- Derive and validate setup families only from fresh 15M market-structure output.
- Keep entry, SL, TP, and 5M timing excluded from this gate.
- Generate, validate, and review the structure-only setup-family event study; no family promoted.
- Validate G7 acceptance-duration metrics and G9 5M confirmation contract; review remains open.
- Select or reject setup families with evidence before Stage 6.

Acceptance: `v2/artifacts/STAGE5A_ACCEPTANCE.json`. All six families are rejected for promotion; no setup family is selected. F1-F5 and the evidence-lifecycle gaps remain explicit research findings without a production patch.

## Stage 6 — Research backtest

Status: COMPLETE

- Event diagnostics before PnL.
- Candidate/qualified/rejected/executed funnel.
- Cost-aware execution.
- Chronological validation and untouched test window.

Baseline run: `v2/artifacts/ARCHITECTURE_V2_BACKTEST.json` covers 105,119 closed 5M bars, 35,040 15M bars, and 8,760 1H bars with 1,090 funding records. Funnel: 9,790 structure events → 1,470 confirmed 5M events → 395 selected → 277 planned/executed. Chronological holdout: 83 trades, net PnL `171.56262907493908`; deterministic replay and no-lookahead checks PASS. This remains diagnostic evidence only; no setup promotion or production performance claim.

## Stage 7 — Demo reconciliation and safety monitoring

Status: COMPLETE — READ-ONLY, NO ORDER SUBMISSION

- Reconciliation uses only fresh, approved, structure-current candidates.
- Unmanaged exchange orders and positions produce `REVIEW_REQUIRED`.
- Missing or partial protective orders produce explicit safety blockers.
- No order or setup decision is created by this stage.

The active architecture remains the Stage 6-locked V2 live_demo workflow:

Stage 8 is implemented as a guarded Demo execution path, but remains blocked until a fresh approved candidate exists and the user provides explicit immediate approval in the execution request.

```text
1H Bias → 15M MarketStructureBot → 5M ConfirmationBot → SelectionBot → fvg_context / ob_context → virtual Entry/SL/TP → LiveDemo Observer
```

Stage 7 results are retained only as research context. Do not resume or promote its hypotheses without a new explicit experiment and acceptance decision.