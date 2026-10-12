import hashlib
"""Read-only paper pipeline on latest Binance Demo closed candles."""
import json
import urllib.request
from bisect import bisect_right
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "v2" / "artifacts"
BASE = "https://demo-fapi.binance.com"
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSDT")
sys.path.insert(0, str(ROOT / "v2" / "scripts"))
from architecture_v2 import ConfirmationBot, MarketBiasBot, MarketStructureBot, SelectionBot, load_csv, pivots
from paper_context import lifecycle_context, setup_context
from setup_bots_executable import build_plan, validate_entry_sl_provenance, validate_plan_economics

def get(path):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "jev-paper/1"})
    with urllib.request.urlopen(request, timeout=15) as response: return json.loads(response.read())

def rows(symbol, interval, limit=500):
    raw = get(f"/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}")
    return [{"open": float(x[1]), "high": float(x[2]), "low": float(x[3]), "close": float(x[4]), "volume": float(x[5]), "taker_buy_volume": float(x[9]), "open_time": int(x[0]), "close_time": int(x[6])} for x in raw]

def select_execution_candidates(candidates):
    """Keep newest valid candidate per pair; older plans remain in observations."""
    selected = {}
    for candidate in candidates:
        selected[candidate["symbol"]] = candidate
    return list(selected.values())

def main():
    server_time = int(get("/fapi/v1/time")["serverTime"])
    observations = {}; plan_candidates = []; totals = {"bias_ready": 0, "structure_events": 0, "confirmed_5m": 0, "selected": 0, "paper_plans": 0, "gate_rejections": 0}
    for symbol in SYMBOLS:
        h, m, q = rows(symbol, "1h"), rows(symbol, "15m"), rows(symbol, "5m")
        closed = lambda data: [x for x in data if x["close_time"] < server_time]
        h, m, q = closed(h), closed(m), closed(q)
        bias = MarketBiasBot(h); events = MarketStructureBot(m, symbol).build(); confirm = ConfirmationBot(q, symbol); selection = SelectionBot(); qtimes = [x["close_time"] for x in q]; hs, ls = pivots(m)
        symbol_rows = []
        hs, ls = pivots(m)
        for event in events[-20:]:
            hidx = bisect_right([x["open_time"] for x in h], m[event.index]["open_time"]) - 1
            b = bias.at(hidx); start = bisect_right(qtimes, m[event.index]["close_time"]) - 1
            if start < 0: continue
            c = confirm.run(event, start=start); totals["structure_events"] += 1
            if c["state"] == "CONFIRMED": totals["confirmed_5m"] += 1
            decision = selection.select(event, b, c, m[event.index])
            if b.get("valid"): totals["bias_ready"] += 1
            if decision["state"] == "SELECTED": totals["selected"] += 1
            else: totals["gate_rejections"] += 1
            row = {"event_id": event.event_id, "kind": event.kind, "side": event.side, "bias": b.get("state"), "confirmation": c["state"], "selection": decision["state"], "selected_setup": decision.get("selected"), "virtual_order": False}
            if decision["state"] == "SELECTED":
                entry_index = c["index"] + 1
                if entry_index >= len(q):
                    row["paper_rejection"] = "entry_out_of_range"
                else:
                    live = lifecycle_context(event, q, start, c["index"])
                    ctx = setup_context(decision["selected"], event.side, event, q[entry_index]["open"], m, event.index, hs, ls, c, live, entry_index)
                    if ctx is None:
                        row["paper_rejection"] = "context_rejected"
                    else:
                        try:
                            plan = build_plan(decision["selected"], ctx)
                            provenance_ok, provenance_reason = validate_entry_sl_provenance(plan)
                            economics_ok, economics_reason = validate_plan_economics(plan)
                        except (AssertionError, KeyError, TypeError) as error:
                            row["paper_rejection"] = f"plan_exception:{type(error).__name__}"
                        else:
                            if not provenance_ok:
                                row["paper_rejection"] = provenance_reason
                            elif not economics_ok:
                                row["paper_rejection"] = economics_reason
                            else:
                                row.update({"virtual_order": True, "virtual_entry_sl_tp": True, "paper_plan": {"setup_id": plan.setup_id, "side": plan.side, "entry": plan.entry, "sl": plan.sl, "tp": plan.tp, "rr": plan.rr, "entry_reason": plan.entry_reason, "sl_reason": plan.sl_reason, "tp_reason": plan.tp_reason, "evidence": plan.evidence}})
                                client_order_id = "jev_" + hashlib.sha256(f"{symbol}:{plan.evidence['event_id']}".encode()).hexdigest()[:24]
                                plan_candidates.append({"client_order_id": client_order_id, "symbol": symbol, "side": "BUY" if plan.side == "BULLISH" else "SELL", "setup_id": plan.setup_id, "entry": plan.entry, "sl": plan.sl, "tp": plan.tp, "rr": plan.rr, "status": "PENDING_POLICY_SIZING", "evidence": plan.evidence})
                                totals["paper_plans"] += 1
            symbol_rows.append(row)
        observations[symbol] = {"closed_counts": {"1h": len(h), "15m": len(m), "5m": len(q)}, "recent_events": symbol_rows}

    execution_candidates = select_execution_candidates(plan_candidates)

    out = {"name": "BINANCE_DEMO_PAPER_PIPELINE", "status": "PASS", "environment": "demo-fapi", "server_time": server_time, "symbols": observations, "execution_candidates": execution_candidates, "totals": totals, "orders_sent": False, "withdrawals_sent": False, "virtual_entry_sl_tp": totals["paper_plans"] > 0, "next_action": "Validate policy sizing and Binance filters before Demo execution."}
    (ART / "BINANCE_DEMO_PAPER_PIPELINE.json").write_text(json.dumps(out, indent=2) + "\n"); print(json.dumps(out, indent=2))

if __name__ == "__main__": main()
