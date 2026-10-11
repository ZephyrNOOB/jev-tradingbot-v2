# Freshness Audit — v2

Date: 2026-10-02
Status: clean-room boundary PASS

## Audit result

Fresh v2 has no active trading logic yet.

```text
indicators: none
thresholds: none
setup definitions: none
entry rules: none
SL rules: none
TP rules: none
risk rules: none
fee/slippage assumptions: none
selector rules: none
legacy PnL inputs: none
```

## Legacy contamination check

Legacy code and artifacts remain outside `v2/` as read-only history. They are not imported or called by v2.

Historical-only locations include:

- `server.js`
- `results/`
- `smc_intelligent_result*.json`
- `docs/plans/`
- `docs/experiments/`
- `docs/architecture/README-v2.md`
- `docs/architecture/ADR-001-reset-v2.md`
- root-level legacy `scripts/`

The new clean-room boundary contains only:

- `v2/docs/README.md`
- `v2/artifacts/CONTRACTS.json`
- `v2/docs/FRESHNESS.md`

## Allowed v2 dependencies

Only future contracts may be introduced:

1. data boundary contract;
2. 1H bias contract;
3. 15M confirmation/structure contract;
4. 5M execution-context contract;
5. setup-bot contract.

No historical rule may enter a contract without a new explicit decision and research record.

## Decision

Previous v2 documents remain historical planning notes because they still mention indicator and setup vocabulary inherited from the old project. Fresh implementation must use this directory as the authority, not those documents.

Next work starts at Data Boundary Contract.
