# JEV Trading Bot — Active V2

Status: Stage 7 closed without promotion. Active workflow is read-only paper observation on Binance Demo.

## Active workflow

```text
1H Bias
→ 15M MarketStructureBot
→ 5M ConfirmationBot
→ SelectionBot
→ fvg_context / ob_context
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
- `scripts/binance_demo_paper_pipeline.py` — read-only Demo paper pipeline.
- `artifacts/` — Demo preflight, observation, and paper evidence.

Retired research and generated cache are removed from this production workspace.