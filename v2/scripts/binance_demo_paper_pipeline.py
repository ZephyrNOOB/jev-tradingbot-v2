import hashlib
import time
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

def rank_and_approve_candidates(candidates, latest_structure_event_ids):
    """Rank current candidates by structure/confirmation freshness; reject ties."""
    groups = {}
    for candidate in candidates:
        latest = latest_structure_event_ids.get(candidate["symbol"])
        if not latest:
            candidate["status"] = "INVALIDATED_NO_ACTIVE_STRUCTURE"
            continue
        if candidate.get("status") == "INVALIDATED_OPPOSITE_STRUCTURE":
            continue
        groups.setdefault(candidate["symbol"], []).append(candidate)
    approved = []
    for symbol, group in groups.items():
        scored = [(int(c.get("structure_index", -1)), int(c.get("confirmation_index", -1)), c) for c in group]
        best_key = max((x[:2] for x in scored), default=None)
        winners = [x[2] for x in scored if x[:2] == best_key]
        if len(winners) != 1:
            for candidate in group:
                candidate["status"] = "REJECTED_AMBIGUOUS_CANDIDATE"
            continue
        winners[0]["status"] = "APPROVED_FOR_EXECUTION"
        approved.append(winners[0])
        for candidate in group:
            if candidate is not winners[0]:
                candidate["status"] = "REJECTED_LOWER_STRUCTURE_RANK"
    return approved


def select_execution_candidates(candidates):
    """Compatibility wrapper; caller must use rank_and_approve_candidates first."""
    return [c for c in candidates if c.get("status") == "APPROVED_FOR_EXECUTION"]

CANDIDATE_FRESHNESS_MS = 15 * 60 * 1000

def invalidate_stale_candidates(candidates, latest_structure_event_ids, structure_events=None, now_ms=None):
    """Expire old plans and invalidate only evidenced thesis breaks."""
    active = []
    now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
    structure_events = structure_events or {}
    for candidate in candidates:
        symbol = candidate["symbol"]
        created_at = candidate.get("created_at_ms")
        if created_at is None or now_ms - int(created_at) > CANDIDATE_FRESHNESS_MS:
            candidate["status"] = "EXPIRED_FRESHNESS"
            continue
        if not latest_structure_event_ids.get(symbol):
            candidate["status"] = "INVALIDATED_NO_ACTIVE_STRUCTURE"
            continue
        protected = candidate.get("protected_level")
        current_close = candidate.get("current_close")
        side = candidate.get("side")
        broken = protected is not None and current_close is not None and ((side == "BUY" and float(current_close) < float(protected)) or (side == "SELL" and float(current_close) > float(protected)))
        if broken:
            candidate["status"] = "INVALIDATED_PROTECTED_LEVEL"
            continue
        poi_state = candidate.get("poi_state")
        if poi_state in ("MITIGATED", "FULL_MITIGATION", "INVALIDATED", "EXPIRED"):
            candidate["status"] = "INVALIDATED_POI_MITIGATED" if poi_state in ("MITIGATED", "FULL_MITIGATION") else f"INVALIDATED_POI_{poi_state}"
            continue
        events = structure_events.get(symbol, [])
        candidate_index = int(candidate.get("structure_index", -1))
        newer_confirmed = any(
            int(event.get("structure_index", -1)) > candidate_index
            and event.get("confirmation") == "CONFIRMED"
            and event.get("lifecycle_state") not in ("MITIGATED", "FULL_MITIGATION", "INVALIDATED", "EXPIRED")
            for event in events
        )
        opposite = any(
            int(event.get("structure_index", -1)) > candidate_index
            and event.get("confirmation") == "CONFIRMED"
            and event.get("side") in ("LONG", "SHORT")
            and event.get("side") != ("LONG" if candidate.get("side") == "BUY" else "SHORT")
            and event.get("kind") in ("BOS", "CHoCH_MSS")
            for event in events
        )
        if opposite:
            candidate["status"] = "INVALIDATED_OPPOSITE_STRUCTURE"
        elif newer_confirmed:
            candidate["status"] = "INVALIDATED_STRUCTURE_REPLACED"
        else:
            active.append(candidate)
    return active


def collapse_active_plans(observations, candidates):
    """Keep one active plan per pair; mark replaced plans without deleting audit rows."""
    active = select_execution_candidates(candidates)
    active_ids = {candidate["client_order_id"] for candidate in active}
    for symbol_data in observations.values():
        for row in symbol_data["recent_events"]:
            candidate_id = row.get("client_order_id")
            if row.get("virtual_entry_sl_tp") and candidate_id not in active_ids:
                row["virtual_entry_sl_tp"] = False
                row["virtual_order"] = False
                row["plan_status"] = "ELIMINATED_REPLACED"
    return active
def main():
    server_time = int(get("/fapi/v1/time")["serverTime"])
    observations = {}; plan_candidates = []; latest_structure_event_ids = {}; totals = {"bias_ready": 0, "structure_events": 0, "confirmed_5m": 0, "selected": 0, "paper_plans": 0, "gate_rejections": 0}
    for symbol in SYMBOLS:
        h, m, q = rows(symbol, "1h"), rows(symbol, "15m"), rows(symbol, "5m")
        closed = lambda data: [x for x in data if x["close_time"] < server_time]
        h, m, q = closed(h), closed(m), closed(q)
        bias = MarketBiasBot(h); events = MarketStructureBot(m, symbol).build(); latest_structure_event_ids[symbol] = next((event.event_id for event in reversed(events) if event.kind in ("BOS", "CHoCH_MSS")), None); confirm = ConfirmationBot(q, symbol); selection = SelectionBot(); qtimes = [x["close_time"] for x in q]; hs, ls = pivots(m)
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
            row = {"event_id": event.event_id, "kind": event.kind, "side": event.side, "structure_index": event.index, "bias": b.get("state"), "confirmation": c["state"], "lifecycle_state": c.get("lifecycle_state"), "zone_bounds": c.get("zone_bounds"), "touch_event_id": c.get("touch_event_id"), "selection": decision["state"], "selected_setup": decision.get("selected"), "virtual_order": False}
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
                                row["client_order_id"] = client_order_id
                                plan_candidates.append({"client_order_id": client_order_id, "symbol": symbol, "structure_event_id": event.event_id, "structure_index": event.index, "confirmation_index": c["index"], "created_at_ms": server_time, "side": "BUY" if plan.side == "BULLISH" else "SELL", "protected_level": event.protected_level or None, "current_close": q[-1]["close"], "poi_type": plan.setup_id.split("_")[0].upper(), "poi_state": c.get("lifecycle_state"), "setup_id": plan.setup_id, "entry": plan.entry, "sl": plan.sl, "tp": plan.tp, "rr": plan.rr, "status": "READY_FOR_DEMO_EXECUTION", "evidence": plan.evidence})
                                totals["paper_plans"] += 1
            symbol_rows.append(row)
        observations[symbol] = {"closed_counts": {"1h": len(h), "15m": len(m), "5m": len(q)}, "latest_closed_candle": {"1h": h[-1]["close_time"], "15m": m[-1]["close_time"], "5m": q[-1]["close_time"]}, "recent_events": symbol_rows}

    structure_events = {symbol: rows_data["recent_events"] for symbol, rows_data in observations.items()}
    plan_candidates = invalidate_stale_candidates(plan_candidates, latest_structure_event_ids, structure_events, server_time)
    rank_and_approve_candidates(plan_candidates, latest_structure_event_ids)
    execution_candidates = collapse_active_plans(observations, plan_candidates)
    totals["selected_events"] = totals["selected"]
    totals["selected"] = len(execution_candidates)
    totals["paper_plans"] = len(execution_candidates)

    out = {"name": "BINANCE_DEMO_PAPER_PIPELINE", "status": "PASS", "environment": "demo-fapi", "server_time": server_time, "symbols": observations, "latest_structure_event_ids": latest_structure_event_ids, "execution_candidates": execution_candidates, "totals": totals, "execution_status": "PAPER_ONLY", "virtual_entry_sl_tp": totals["paper_plans"] > 0, "next_action": "Demo executor may process READY_FOR_DEMO_EXECUTION candidates."}
    (ART / "BINANCE_DEMO_PAPER_PIPELINE.json").write_text(json.dumps(out, indent=2) + "\n"); print(json.dumps(out, indent=2))

if __name__ == "__main__": main()
