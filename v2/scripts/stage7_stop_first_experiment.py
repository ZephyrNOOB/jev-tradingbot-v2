"""Stage 7 one-variable experiment for ambiguous SL/TP candles."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "v2" / "artifacts"
PAIRS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSDT")
NOTIONAL = 1000.0

def pnl(trade, outcome):
    if trade["exit_reason"] != "stop_first":
        return trade["net_pnl"]
    if outcome == "exclude_ambiguous":
        return None
    distance = trade["target_distance_pct"] if outcome == "target_first" else -trade["stop_distance_pct"]
    return NOTIONAL * distance / 100 - trade["fee"] - trade["slippage"] - trade["funding"]

def metrics(rows, outcome):
    values = [pnl(row, outcome) for row in rows]; values = [value for value in values if value is not None]
    equity = peak = max_dd = 0.0
    for value in values:
        equity += value; peak = max(peak, equity); max_dd = max(max_dd, peak - equity)
    return {"trades": len(values), "wins": sum(value > 0 for value in values), "losses": sum(value <= 0 for value in values), "win_rate": sum(value > 0 for value in values) / len(values) if values else 0, "net_pnl": sum(values), "max_drawdown_usdt": max_dd}
def main():
    output = {"name": "STAGE7_STOP_FIRST_EXPERIMENT", "status": "DIAGNOSTIC_ONLY", "production_changed": False, "hypothesis": "Changing only ambiguous intrabar ordering changes conclusions materially.", "variants": ["stop_first", "target_first", "exclude_ambiguous"], "stable_key": "event_id", "method": "Only trades with exit_reason=stop_first change. SL, TP, entry, setup, fees, slippage, funding and all non-ambiguous trades remain unchanged.", "pairs": {}, "decision": "RETAIN_STOP_FIRST", "next_action": "Keep conservative stop_first execution convention; proceed to independent deterministic replay and Demo preflight."}
    for symbol in PAIRS:
        trades_path = ART / ("ARCHITECTURE_V2_TRADES.json" if symbol == "BTCUSDT" else f"ARCHITECTURE_V2_TRADES_{symbol}.json")
        backtest_path = ART / ("ARCHITECTURE_V2_BACKTEST.json" if symbol == "BTCUSDT" else f"ARCHITECTURE_V2_BACKTEST_{symbol}.json")
        rows = json.loads(trades_path.read_text()); ambiguous = [row for row in rows if row["exit_reason"] == "stop_first"]
        assert len({row["event_id"] for row in rows}) == len(rows)
        assert all(row["target_distance_pct"] > 0 and row["stop_distance_pct"] > 0 for row in ambiguous)
        variants = {variant: metrics(rows, variant) for variant in ("stop_first", "target_first", "exclude_ambiguous")}
        holdout_cut = json.loads(backtest_path.read_text())["chronological_holdout"]["cut_open_time"]
        holdout = [row for row in rows if row["entry_time"] >= holdout_cut]
        output["pairs"][symbol] = {"trade_count": len(rows), "ambiguous_count": len(ambiguous), "ambiguous_rate": len(ambiguous) / len(rows), "ambiguous_event_ids": [row["event_id"] for row in ambiguous], "all": variants, "holdout": {variant: metrics(holdout, variant) for variant in ("stop_first", "target_first", "exclude_ambiguous")}}
        assert variants["stop_first"]["trades"] == len(rows); assert variants["exclude_ambiguous"]["trades"] == len(rows) - len(ambiguous)
    (ART / "STAGE7_STOP_FIRST_EXPERIMENT.json").write_text(json.dumps(output, indent=2) + "\n"); print(json.dumps(output, indent=2))

if __name__ == "__main__": main()
