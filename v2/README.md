# JEV Trading Bot — Active V2

Status: Live Demo execution active. Valid candidates can reach Binance Demo LIMIT GTC order submission when BOT ON and all execution gates pass.

## Active workflow

```text
1H Bias
→ 15M MarketStructureBot
→ 5M ConfirmationBot
→ SelectionBot
→ fvg_context / ob_context / liquidity_sweep_reversal / breaker_block / rbs_sbr_continuation
→ virtual Entry/SL/TP validation
→ Binance Demo observation
```

Active setup bots: `fvg_context`, `ob_context`.

Continuation Bullish/Bearish is archived and inactive. CHoCH/MSS and liquidity-sweep evidence remain structure diagnostics, not SetupBots.

## Safety boundary

- Closed candles only.
- Demo REST observation only.
- `orders_sent: false`.
- No withdrawal.
- No live account.
- Virtual plans require setup-zone provenance, structure evidence, valid SL/TP geometry, and fee/slippage economics.

## Active files

- `scripts/architecture_v2.py` — workflow contracts.
- `scripts/market_structure_authoritative.py` — 15M SMC structure events.
- `scripts/confirmation_5m_authoritative.py` — 5M confirmation contract.
- `scripts/setup_bots_executable.py` — setup-owned plans and validators.
- `scripts/binance_demo_live_pipeline.py` — Live Demo market-structure candidate pipeline; executor owns exchange order side effects.
- `artifacts/` — Live Demo workflow and execution-candidate evidence.

Retired research and generated cache are removed from this production workspace.