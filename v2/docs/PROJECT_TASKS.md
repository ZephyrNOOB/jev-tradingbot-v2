# Fresh v2 Project Tasks

Status authority: this file + `PROJECT_ROADMAP.md`.

## Operating rule

Never start a later stage while current stage has `status: INCOMPLETE`, `BLOCKED`, or an open gate. User approval of research does not close a stage. Only evidence and acceptance criteria close a stage.

Every stage transition requires:

```text
artifact
analysis
acceptance criteria
validation output
status update
```

## Stage 0 — Clean-room reset

Status: COMPLETE

Acceptance:

- legacy rules excluded from v2 inputs;
- v2 boundary exists;
- no active indicator/setup/trading rule at initialization.

## Stage 1 — Data Boundary

Status: COMPLETE

Decisions:

- venue: Binance Futures USDⓈ-M Testnet;
- market: BTCUSDT perpetual futures;
- scope: 12 months;
- timeframes: 1H, 15M, 5M;
- raw local snapshot required;
- live orders disabled.

Verification gate: CLOSED

Completed data gate:

- [x] endpoint coverage verified;
- [x] immutable 12-month snapshot downloaded;
- [x] timestamps, duplicates, OHLC, gaps, and SHA-256 manifest validated.

Snapshot counts: 5M 105,119; 15M 35,040; 1H 8,760.

Required artifacts:

- `v2/artifacts/DATA_BOUNDARY.json`
- `scripts/validate_fresh_data_boundary.py`
- `v2/artifacts/DATA_SNAPSHOT_MANIFEST.json`

## Stage 2 — Indicator Research and Selection

Status: COMPLETE

Completed subtask:

- SMC research completed as candidate review;
- SMC-01 registered as market-structure candidate only.

Completed subtasks:

- [x] research price-derived structure;
- [x] research trend-direction candidates;
- [x] research trend-strength/regime candidates — preliminary regime proxy;
- [x] research volatility-normalization candidates;
- [x] isolate SMC components: structure, BOS, CHoCH/MSS, FVG, OB, sweep/reclaim;
- [x] produce preliminary component event study;
- [x] exact-match component diagnostic with bootstrap and 24-bar purge audit;
- [x] research volume/participation candidates — preliminary diagnostic;
- [x] research location candidates — preliminary VWAP diagnostic;
- [x] define candidate evaluation criteria and evidence gates;
- [x] compare candidates using common criteria — preliminary event study + bootstrap/matched diagnostic complete; exact regime matching and purged windows remain open;
- [x] verify data availability for candidate inputs;
- [x] produce final selected/rejected indicator decision;
- [x] close Stage 2 with evidence and validation output — `v2/docs/STAGE2_FINAL_DECISION.md` + `v2/artifacts/STAGE2_DECISION.json` + validator PASS;
- [x] derive fresh setup-research hypotheses from selected 15M structure;
- [x] register setup hypotheses without importing legacy setup registry;
- [x] create candidate-only bot interfaces from fresh setup hypotheses;
- [x] research independent confirmation evidence for each setup family;
- [x] capture rough setup baseline with outcome reasons and provisional cost ledger;
- [x] research current market-structure gaps against alternative structure families;

Gap artifact: `v2/docs/MARKET_STRUCTURE_GAP_RESEARCH.md`, `v2/artifacts/MARKET_STRUCTURE_GAP_MATRIX.json`; validator PASS.

Current model remains unchanged. No feature promoted from external research alone.

- [x] compare JEV SMC market structure against FractalTrader public implementation;

Comparison artifact: `v2/docs/SMC_FRACTALTRADER_COMPARISON.md`, `v2/artifacts/SMC_FRACTALTRADER_GAPS.json`; validator PASS. No patch promoted.

- [x] synthesize Kekurangan 1 + Kekurangan 2 into Kekurangan 3;
- [x] Hasil Uji 1: run unchanged JEV market structure with unchanged setup bots; store post-cost diagnostic results;
- [x] Hasil Uji 2: test Kekurangan 1 OHLCV-available structure subset; FAIL; artifacts removed by decision;
- [x] Hasil Uji 3: rerun Hasil Uji 1 baseline with Kekurangan 2 active and unchanged setup bots; saved replacement result;
- [x] Hasil Uji 4: rerun Hasil Uji 1 baseline with Kekurangan 3 evidence lifecycle layer; saved result and comparison table;
- [x] review Hasil Uji 1, 3, 4; exclude Hasil Uji 2; save review artifact and validator PASS;
- [x] lock primary market-structure baseline: MarketBiasBot 1H bias → MarketStructureBot 15M confirmation/structure → ConfirmationBot 5M confirmation → Bot Selection by 15M structure → Selected Setup Bot Entry/SL/TP/execution; no change without explicit approval;
- [x] research 1H bias alternatives beyond EMA; structure primary, ADX/DMI filter, ATR/volume/derivatives context, HMM shadow only; approval required before baseline change;
- [x] lock MarketBiasBot core from researched 1H bias hierarchy; core artifact and validator PASS;

MarketBiasBot core: `v2/docs/MARKET_BIAS_BOT_CORE.md`, `v2/artifacts/MARKET_BIAS_BOT_CORE.json`; immutable without explicit approval.
- [x] save and lock MarketStructureBot core; primary baseline now delegates 15M logic to core instead of duplicating it;

MarketStructureBot core: `v2/docs/MARKET_STRUCTURE_BOT_CORE.md`, `v2/artifacts/MARKET_STRUCTURE_BOT_CORE.json`; validator PASS; immutable without explicit approval.
- [x] save and lock ConfirmationBot core; primary baseline now delegates 5M confirmation logic to core;

ConfirmationBot core: `v2/docs/CONFIRMATION_BOT_CORE.md`, `v2/artifacts/CONFIRMATION_BOT_CORE.json`; validator PASS; immutable without explicit approval.

- [x] lock SelectionBot mandatory order and exclusive setup selection; primary baseline delegates selection logic to core;

SelectionBot core: `v2/docs/SELECTION_BOT_CORE.md`, `v2/artifacts/SELECTION_BOT_CORE.json`; validator PASS; immutable without explicit approval.

Actual primary pipeline remains the baseline. Core artifacts hold bot-specific reasoning.


Primary baseline artifacts: `v2/artifacts/PRIMARY_MARKET_STRUCTURE_BASELINE.json`, `v2/docs/PRIMARY_MARKET_STRUCTURE_BASELINE.md`; validator PASS.
All future compliant backtests must implement this exact pipeline. Previous rough tests are diagnostic only.

- [x] add immutable final stage: selected Setup Bot owns setup-specific Entry, SL, TP, and reasons;

Baseline now ends: `1H Bias → 15M Confirmation/Market Structure → 5M Confirmation → Bot Selection → Setup Bot Trade Plan`. No generic shared Entry/SL/TP.

Kekurangan 3: `v2/docs/KEKURANGAN_3_COMBINED.md`, `v2/artifacts/KEKURANGAN_3.json`; validator PASS. No patch promoted.

Stage 2 guard (satisfied):

- implement indicator logic;
- write SMC specification;
- enable setup bots;
- run strategy PnL backtest;
- tune thresholds.

Required artifacts:

- `v2/docs/INDICATOR_RESEARCH.md`
- `v2/docs/SMC_RESEARCH_REPORT.md`
- `v2/artifacts/SMC_CANDIDATE.json`
- `v2/docs/INDICATOR_COMPARISON.md`
- `v2/artifacts/INDICATOR_DECISION_FINAL.json`

## Stage 3 — System Architecture

Status: COMPLETE

Artifacts: `v2/docs/STAGE3_ARCHITECTURE.md`, `v2/artifacts/STAGE3_ARCHITECTURE_CONTRACT.json`, `v2/docs/ARCHITECTURE_DATA_CONTRACT.md`, `v2/artifacts/ARCHITECTURE_DECISIONS.json`.

Validation: `scripts/stage3_architecture_check.py` and `v2/scripts/architecture_contract_probe.py` PASS.

Scope completed: module boundaries, immutable layer snapshots, evidence envelope, deterministic replay contract, and forbidden responsibilities. No entry, SL, TP, setup implementation, or PnL was added.

Next: Stage 4 exchange operation contract.

Tasks:

- [x] define selected indicator contracts;
- [x] define Market Structure Bot;
- [x] define Execution Context Bot;
- [x] define one boundary per Setup Bot;
- [x] define evidence and rejection schemas;
- [x] validate architecture without PnL.

## Stage 4 — Exchange Operation

Status: COMPLETE

Artifacts: `v2/docs/STAGE4_EXCHANGE_OPERATION.md`, `v2/artifacts/STAGE4_EXCHANGE_OPERATION_CONTRACT.json`.

Validation: `scripts/validate_stage4_contract.py` PASS.

Scope completed: Binance Futures USDⓈ-M Testnet venue, BTCUSDT perpetual, public/private endpoint boundaries, server-side credential policy, time-sync/HMAC rules, rate-limit policy, and live-order prohibition. No trading logic was added.

Next: Stage 5 data pipeline contract.

### Historical Stage 4 details (superseded)

Status: COMPLETE

Tasks:

- [ ] confirm venue suitability;
- [ ] confirm Futures operation model;
- [ ] research fee and funding data;
- [ ] research execution and slippage assumptions;
- [ ] keep live order path disabled.

## Stage 5 — Historical Data Pipeline

Status: COMPLETE

Artifacts: `v2/docs/STAGE5_DATA_PIPELINE.md`, `v2/artifacts/STAGE5_DATA_PIPELINE_CONTRACT.json`, `v2/artifacts/DATA_SNAPSHOT_MANIFEST.json`.

Validation: `scripts/validate_stage5_pipeline.py` PASS.

Tasks:

- [x] download raw 1H/15M/5M snapshot;
- [x] store immutable manifest and hashes;
- [x] validate data;
- [x] keep funding/fee datasets separate and unimplemented until Stage 6 cost model.

Next: Stage 6 diagnostic backtest contract.

## Stage 5A — Setup Research and Market-Structure Mapping

Status: COMPLETE

Scope: derive and validate setup families only from fresh 15M market-structure output. Entry, SL, TP, and 5M timing are excluded.

Tasks:

- [x] derive fresh setup-research hypotheses from selected 15M structure;
- [x] register setup hypotheses without importing legacy setup registry;
- [x] create candidate-only bot interfaces from fresh setup hypotheses;
- [x] research independent confirmation evidence for each setup family;
- [x] capture rough setup baseline with outcome reasons and provisional cost ledger;
- [x] generate and validate setup families with structure-only event ledger;
- [x] review structure-only event ledger; no family promoted;
- [x] select/reject setup families before Stage 6; all six reviewed families rejected for promotion;
- [x] research current market-structure gaps against alternative structure families;
- [x] validate P0 G7 acceptance-duration metrics and G9 5M confirmation contract;
- [x] compare JEV SMC market structure against FractalTrader public implementation;
- [x] validate FractalTrader comparison gaps F1-F5 on clean-room output before patch; gaps confirmed, no patch promoted;
- [x] synthesize Kekurangan 1 + Kekurangan 2 into Kekurangan 3;
- [x] audit current clean-room output against structural evidence lifecycle contract; gaps remain explicit and are carried into diagnostic backtest evidence.

Artifacts: `v2/docs/15M_MARKET_STRUCTURE_SETUP_RESEARCH.md`, `v2/artifacts/SETUP_RESEARCH_REGISTRY.json`.

Validation: registry PASS; confirmation matrix PASS; rough baseline captured; structure-only event ledger reviewed; G7/G9 diagnostics validated; F1-F5 audit PASS; evidence-lifecycle audit PASS; no family promoted. Acceptance artifact: `v2/artifacts/STAGE5A_ACCEPTANCE.json`.

Research confirmation artifact: `v2/docs/SETUP_CONFIRMATION_RESEARCH.md`, `v2/artifacts/SETUP_CONFIRMATION_MATRIX.json`.

Stage 6 is open for diagnostic backtest only; no setup family is promoted.

## Stage 6 — Diagnostic Backtest

Status: COMPLETE

Tasks:

- [x] run the baseline cost-aware chronological diagnostic backtest and write `v2/artifacts/ARCHITECTURE_V2_BACKTEST.json`;
- [ ] event diagnostics before PnL;
- [x] candidate/qualified/rejected/executed funnel;
- [ ] no-lookahead validation;
- [x] execution-cost model with fee, slippage, and funding ledgers;
- [x] deterministic replay;
- [x] untouched chronological validation.

Acceptance: `v2/artifacts/STAGE6_SMC_SETUP_ACCEPTANCE.json` (`passed: true`).

Validation: no-lookahead PASS; deterministic replay PASS; funnel/trade-count match PASS; provenance and MAE/MFE PASS; 83-trade chronological holdout recorded. Results remain diagnostic only; no setup family promoted.

## Stage 7 — Evidence-Based Iteration

Status: IN_PROGRESS

Stage 7 baseline: locked diagnostic evidence from Stage 6. First iteration target is evidence review and hypothesis registration; no production behavior change is authorized.

Audit artifact: 2/artifacts/STAGE7_STAGE6_EVIDENCE_AUDIT.json; reproducible trade-count and holdout assertions PASS.

Tasks:

- [x] close Stage 6 with acceptance evidence;
- [x] remove abandoned Liquidity Sweep Reversal research artifacts;
- [x] audit Stage 6 results by setup, side, exit reason, and holdout behavior;
- [x] register one falsifiable, one-variable hypothesis;
- [x] run deterministic comparison on stable opportunity keys;
- [ ] accept or reject hypothesis with evidence.

Required loop:

```text
data
→ analysis
→ external research
→ falsifiable hypothesis
→ one-variable change
→ deterministic test
→ compare stable opportunity keys
→ accept/reject
```

`r`nCost-qualified target artifact: `v2/artifacts/CONTINUATION_COST_QUALIFIED_TARGET.json`; 33/33 candidates passed modeled-cost filter, but holdout net PnL was -4.9524. Decision: `NO_PRODUCTION_CHANGE`.

Continuation Bullish/Bearish removed from production SetupBot registry and workflow. Research artifacts retained for traceability; active SetupBots: vg_context, ob_context. `r`n`r`n

FVG/OB audit artifact: `v2/artifacts/STAGE7_FVG_OB_EVIDENCE_AUDIT.json`; audit reproducible PASS. FVG holdout: 107 trades, net 200.2385; OB holdout: 10 trades, net 27.7006. Next hypothesis: test stop-first candle-order convention; no production change yet.

## Stage transition record

Current stage: Stage 7

Current status: IN_PROGRESS

Next allowed action: audit locked Stage 6 evidence, register one falsifiable hypothesis, then run one-variable deterministic comparison.

Next forbidden actions: live orders, withdrawals, setup promotion, production execution, and threshold tuning.

Last validated gate: `PASS Stage 6 acceptance; diagnostic-only holdout and replay evidence locked`
