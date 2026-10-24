import hashlib
import time
"""Live Demo candidate pipeline on latest Binance Demo closed candles."""
import json
import os
import tempfile
import urllib.request
from bisect import bisect_right
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "v2" / "artifacts"
BASE = "https://demo-fapi.binance.com"
CANDLE_CACHE_PATH = ART / "MARKET_CANDLE_CACHE.json"
# Live Demo pipeline: artifact builds candidates; executor owns order side effects.
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSDT")
sys.path.insert(0, str(ROOT / "v2" / "scripts"))
from architecture_v2 import ConfirmationBot, MarketBiasBot, MarketStructureBot, SelectionBot, load_csv, pivots
from market_structure_authoritative import confirmed_pivots
from live_demo_context import lifecycle_context, setup_context
from setup_bots_executable import build_plan, validate_entry_sl_provenance, validate_plan_economics

def get(path):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "jev-live-demo/1"})
    with urllib.request.urlopen(request, timeout=15) as response: return json.loads(response.read())

def rows(symbol, interval, limit=500):
    cache = {}
    if CANDLE_CACHE_PATH.exists():
        try: cache = json.loads(CANDLE_CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError): cache = {}
    cached = cache.get(f"{symbol}:{interval}", [])
    if len(cached) >= limit:
        return sorted(cached, key=lambda row: row["open_time"])[-limit:]
    raw = get(f"/fapi/v1/klines?symbol={symbol}&interval={interval}&limit={limit}")
    result = [{"open": float(x[1]), "high": float(x[2]), "low": float(x[3]), "close": float(x[4]), "volume": float(x[5]), "taker_buy_volume": float(x[9]), "open_time": int(x[0]), "close_time": int(x[6])} for x in raw]
    by_open = {int(row["open_time"]): row for row in cached if isinstance(row, dict)}
    by_open.update({row["open_time"]: row for row in result})
    merged = sorted(by_open.values(), key=lambda row: row["open_time"])[-limit:]
    cache[f"{symbol}:{interval}"] = merged
    _write_cache(cache)
    return merged

def _write_cache(cache):
    fd, temp_path = tempfile.mkstemp(prefix="market-cache-", suffix=".json", dir=CANDLE_CACHE_PATH.parent)
    try:
        with open(fd, "w", encoding="utf-8") as handle: json.dump(cache, handle)
        Path(temp_path).replace(CANDLE_CACHE_PATH)
    finally:
        Path(temp_path).unlink(missing_ok=True)

def write_stream_candle_cache(candles):
    if not candles: return
    try: cache = json.loads(CANDLE_CACHE_PATH.read_text(encoding="utf-8")) if CANDLE_CACHE_PATH.exists() else {}
    except (OSError, json.JSONDecodeError): cache = {}
    for candle in candles:
        key = f"{candle['symbol']}:{candle['interval']}"
        cache.setdefault(key, []).append({"open": candle["open"], "high": candle["high"], "low": candle["low"], "close": candle["close"], "volume": candle["volume"], "taker_buy_volume": candle.get("takerBuyVolume", 0), "open_time": candle["openTime"], "close_time": candle["closeTime"]})
        cache[key] = list({int(row["open_time"]): row for row in cache[key]}.values())
        cache[key] = sorted(cache[key], key=lambda row: row["open_time"])[-500:]
    _write_cache(cache)

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


def _material_setup_identity(plan):
    evidence = plan.get("evidence") or {}
    def norm(value):
        return round(float(value), 8) if isinstance(value, (int, float)) else value
    return (
        plan.get("symbol"), plan.get("side"), plan.get("setup_id"),
        norm(plan.get("entry")), norm(plan.get("sl")), norm(plan.get("tp")),
        tuple(round(float(x), 8) for x in (plan.get("entry_zone") or [])),
        evidence.get("entry_source"), evidence.get("sl_source"), evidence.get("tp_source"),
    )


def _stable_thesis_key(plan):
    evidence = plan.get("evidence") or {}
    required = ("symbol", "side", "setup_id", "entry", "sl", "tp")
    if any(plan.get(key) in (None, "") for key in required):
        return ("EVENT_FALLBACK", plan.get("symbol"), plan.get("structure_event_id"))
    return (
        plan.get("symbol"), plan.get("side"), plan.get("setup_id"),
        round(float(plan.get("entry")), 8), round(float(plan.get("sl")), 8), round(float(plan.get("tp")), 8),
        evidence.get("entry_source"), evidence.get("sl_source"), evidence.get("tp_source"),
    )


def preserve_active_plan(previous, refreshed):
    """Keep one order while selected SetupBot thesis remains materially equal."""
    if not previous or not refreshed:
        return refreshed
    if previous.get("status") in {"FILLED", "CLOSED", "CANCELLED", "INVALIDATED", "EXPIRED"}:
        return refreshed
    if _stable_thesis_key(previous) != _stable_thesis_key(refreshed):
        return refreshed
    same_regime = previous.get("side") == refreshed.get("side") and previous.get("setup_id") == refreshed.get("setup_id")
    if not same_regime:
        return refreshed
    merged = dict(previous)
    for key in ("current_close", "poi_state", "protected_level", "structure_index", "confirmation_index", "evidence"):
        if key in refreshed:
            merged[key] = refreshed[key]
    merged["client_order_id"] = previous.get("client_order_id")
    merged["status"] = "APPROVED_FOR_EXECUTION"
    merged["plan_refresh"] = "EXECUTABLE_THESIS_UNCHANGED"
    return merged


def preserve_active_plans(previous_by_symbol, candidates):
    """Deduplicate refresh snapshots by stable structure thesis identity."""
    return [preserve_active_plan(previous_by_symbol.get(c["symbol"]), c) for c in candidates]


def assert_candidate_contract(candidate):
    """Reject malformed plans before ranking or exchange-side execution."""
    required = ("client_order_id", "symbol", "structure_event_id", "confirmation_index", "created_at_ms", "side", "entry", "sl", "tp", "status", "setup_id")
    missing = [key for key in required if candidate.get(key) in (None, "")]
    if missing:
        raise ValueError(f"CANDIDATE_CONTRACT_MISSING:{','.join(missing)}")
    if candidate["side"] not in {"BUY", "SELL"}:
        raise ValueError("CANDIDATE_CONTRACT_INVALID_SIDE")
    for key in ("entry", "sl", "tp", "created_at_ms"):
        if not isinstance(candidate[key], (int, float)):
            raise ValueError(f"CANDIDATE_CONTRACT_INVALID_{key.upper()}")
    return candidate

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
            if row.get("live_demo_plan") and candidate_id not in active_ids:
                row["live_demo_plan"] = False
                row["live_demo_order"] = False
                row["plan_status"] = "ELIMINATED_REPLACED"
    return active
def swing_visuals(candles):
    confirmed = confirmed_pivots(candles)
    highs, lows = [], []
    for items in confirmed.values():
        for item in items:
            target = highs if item['kind'] == 'high' else lows
            previous = target[-1]['price'] if target else None
            target.append({**item, 'time': candles[item['index']]['close_time'], 'label': ('HH' if item['kind'] == 'high' and previous is not None and item['price'] > previous else 'LH' if item['kind'] == 'high' else 'HL' if previous is not None and item['price'] > previous else 'LL')})
    return highs + lows


def event_visual_geometry(event, candles):
    """Read-only chart projection; does not alter structure or workflow decisions."""
    def candle_at(index):
        return candles[index] if isinstance(index, int) and 0 <= index < len(candles) else None
    source = list(event.source_indices or [])
    pivot_index = source[0] if source else None
    pivot = candle_at(pivot_index)
    break_candle = candle_at(event.index)
    ob_candle = candle_at(event.ob_source_index)
    source_times = [c["close_time"] for index in source if (c := candle_at(index))]
    zone_start_time = min(source_times) if source_times else (ob_candle.get("close_time") if ob_candle else None)
    zone_end_time = break_candle.get("close_time") if break_candle else None
    return {
        "event_time": break_candle.get("close_time") if break_candle else None,
        "zone_start_time": zone_start_time,
        "zone_end_time": zone_end_time,
        "mitigation_time": break_candle.get("close_time") if event.lifecycle_state in ("MITIGATED", "FULL_MITIGATION", "PARTIAL_MITIGATION") and break_candle else None,
        "invalidation_time": break_candle.get("close_time") if event.lifecycle_state in ("INVALIDATED", "EXPIRED") and break_candle else None,
        "event_price": break_candle.get("close") if break_candle else None,
        "pivot_index": pivot_index,
        "pivot_time": pivot.get("close_time") if pivot else None,
        "pivot_price": (pivot.get("low") if event.side == "SHORT" else pivot.get("high")) if pivot else None,
        "break_index": event.index,
        "break_time": break_candle.get("close_time") if break_candle else None,
        "break_price": event.broken_level or (break_candle.get("close") if break_candle else None),
        "ob_source_time": ob_candle.get("close_time") if ob_candle else None,
        "ob_source_price": ob_candle.get("close") if ob_candle else None,
        "label_time": break_candle.get("close_time") if break_candle else None,
        "label_price": event.broken_level or (break_candle.get("close") if break_candle else None),
    }

def build_artifact_status(payload):
    """Mark empty execution output explicitly while retaining rejection evidence."""
    candidates = payload.get("execution_candidates") or []
    diagnostics = []
    for symbol, data in (payload.get("symbols") or {}).items():
        diagnostics.extend({"symbol": symbol, "gate_rejection": row["gate_rejection"]} for row in data.get("recent_events", []) if row.get("gate_rejection"))
    status = "PASS" if candidates else "NO_TRADE"
    return {**payload, "status": status, "execution_status": status, "rejection_diagnostics": diagnostics}


def main():
    server_time = int(get("/fapi/v1/time")["serverTime"])
    previous_active_plans = {}
    try:
        previous_artifact = json.loads((ART / "BINANCE_DEMO_LIVE_PIPELINE.json").read_text(encoding="utf-8"))
        previous_active_plans = previous_artifact.get("active_plan_by_symbol", {})
    except (OSError, json.JSONDecodeError):
        pass
    observations = {}; plan_candidates = []; latest_structure_event_ids = {}; latest_confirmed_structure_event_ids = {}; totals = {"bias_ready": 0, "structure_events": 0, "confirmed_5m": 0, "selected_events": 0, "live_demo_candidates": 0, "gate_rejections": 0}
    for symbol in SYMBOLS:
        h, m, q = rows(symbol, "1h"), rows(symbol, "15m"), rows(symbol, "5m")
        closed = lambda data: [x for x in data if x["close_time"] < server_time]
        h, m, q = closed(h), closed(m), closed(q)
        bias = MarketBiasBot(h); events = MarketStructureBot(m, symbol).build(); latest_structure_event_ids[symbol] = next((event.event_id for event in reversed(events) if event.kind in ("BOS", "CHoCH_MSS", "LIQUIDITY_SWEEP", "BREAKER_BLOCK")), None); confirm = ConfirmationBot(q, symbol); selection = SelectionBot(); qtimes = [x["close_time"] for x in q]; hs, ls = pivots(m)
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
            if decision["state"] == "SELECTION_RESOLVED": totals["selected_events"] += 1
            else: totals["gate_rejections"] += 1
            row = {"event_id": event.event_id, "kind": event.kind, "side": event.side, "structure_index": event.index, **event_visual_geometry(event, m), "source_times": [m[i]["close_time"] for i in event.source_indices if 0 <= i < len(m)], "broken_level": event.broken_level, "protected_level": event.protected_level, "ob_source_index": event.ob_source_index, "ob_source_time": m[event.ob_source_index]["close_time"] if 0 <= event.ob_source_index < len(m) else None, "ob_zone_low": event.ob_zone_low, "ob_zone_high": event.ob_zone_high, "flip_level": event.flip_level, "structure_layer": getattr(event, "structure_layer", "SWING"), "line_style": "DASHED" if getattr(event, "structure_layer", "SWING") == "INTERNAL" else "SOLID", "label_size": "TINY" if getattr(event, "structure_layer", "SWING") == "INTERNAL" else "SMALL", "ob_layer": "INTERNAL" if getattr(event, "structure_layer", "SWING") == "INTERNAL" else "SWING", "level_classification": getattr(event, "level_classification", ""), "pool_id": getattr(event, "pool_id", ""), "sweep_level": getattr(event, "sweep_level", 0.0), "sweep_extreme": getattr(event, "sweep_extreme", 0.0), "source_event_ids": list(event.source_indices), "parent_event_id": event.parent_event_id, "bias": b.get("state"), "confirmation": c["state"], "continuation_state": c.get("continuation_state"), "lifecycle_state": c.get("lifecycle_state"), "zone_bounds": c.get("zone_bounds"), "touch_event_id": c.get("touch_event_id"), "selection": decision["state"], "selection_reason": decision.get("reason"), "selection_method": decision.get("selection_method"), "primary_owner": decision.get("primary_owner"), "eligible_setup_candidates": decision.get("candidates", []), "contributing_contexts": decision.get("contributing_contexts", []), "setup_strength_profiles": decision.get("setup_strength_profiles", []), "setup_eligibility_ledger": decision.get("ledger", []), "selected_setup": decision.get("selected"), "live_demo_order": False}
            confirmation_indices = c.get("source_indices", []) or c.get("source_5m_indices", []) or ([c.get("index")] if c.get("index") is not None else [])
            confirmation_indices = [index for index in confirmation_indices if isinstance(index, int) and 0 <= index < len(q)]
            terminal_time = q[confirmation_indices[-1]]["close_time"] if confirmation_indices and 0 <= confirmation_indices[-1] < len(q) else None
            if row["lifecycle_state"] in ("PARTIAL_MITIGATION", "MITIGATED", "FULL_MITIGATION") and terminal_time:
                row["mitigation_time"] = terminal_time
                row["zone_end_time"] = terminal_time
            elif row["lifecycle_state"] in ("INVALIDATED", "EXPIRED") and terminal_time:
                row["invalidation_time"] = terminal_time
                row["zone_end_time"] = terminal_time
            elif row["lifecycle_state"] in ("INVALIDATED", "EXPIRED"):
                row["invalidation_time"] = row.get("event_time")
                row["zone_end_time"] = row.get("event_time")
            if decision["state"] == "SELECTION_RESOLVED":
                entry_index = c["index"] + 1
                if entry_index >= len(q):
                    row["gate_rejection"] = "entry_out_of_range"
                else:
                    live = lifecycle_context(event, q, start, c["index"])
                    ctx = setup_context(decision["selected"], event.side, event, q[entry_index]["open"], m, event.index, hs, ls, c, live, entry_index)
                    if ctx is None:
                        row["gate_rejection"] = "context_rejected"
                    else:
                        try:
                            plan = build_plan(decision["selected"], ctx)
                            provenance_ok, provenance_reason = validate_entry_sl_provenance(plan)
                            economics_ok, economics_reason = validate_plan_economics(plan)
                        except (AssertionError, KeyError, TypeError) as error:
                            row["gate_rejection"] = f"plan_exception:{type(error).__name__}:{error}"
                        else:
                            if not provenance_ok:
                                row["gate_rejection"] = provenance_reason
                            elif not economics_ok:
                                row["gate_rejection"] = economics_reason
                            else:
                                row.update({"live_demo_order": False, "live_demo_plan": {"setup_id": plan.setup_id, "side": plan.side, "entry": plan.entry, "sl": plan.sl, "tp": plan.tp, "rr": plan.rr, "entry_reason": plan.entry_reason, "sl_reason": plan.sl_reason, "tp_reason": plan.tp_reason, "invalidation": plan.invalidation, "entry_zone": plan.entry_zone, "tp_zone": plan.tp_zone, "evidence": plan.evidence}})
                                thesis_payload = {"symbol": symbol, "side": "BUY" if plan.side == "BULLISH" else "SELL", "setup_id": plan.setup_id, "entry": round(plan.entry, 8), "sl": round(plan.sl, 8), "entry_source": plan.evidence.get("entry_source"), "sl_source": plan.evidence.get("sl_source")}
                                client_order_id = "jev_" + hashlib.sha256(json.dumps(thesis_payload, sort_keys=True).encode()).hexdigest()[:24]
                                row["client_order_id"] = client_order_id
                                plan_candidates.append({"client_order_id": client_order_id, "symbol": symbol, "structure_event_id": event.event_id, "structure_index": event.index, "confirmation_index": c["index"], "created_at_ms": server_time, "side": "BUY" if plan.side == "BULLISH" else "SELL", "protected_level": event.protected_level or None, "current_close": q[-1]["close"], "poi_type": plan.setup_id.split("_")[0].upper(), "poi_state": c.get("lifecycle_state"), "setup_id": plan.setup_id, "confirmation_event_id": c.get("micro_break_event_id") or c.get("touch_event_id") or c.get("rejection_event_id"), "entry": plan.entry, "sl": plan.sl, "tp": plan.tp, "rr": plan.rr, "invalidation": plan.invalidation, "entry_zone": plan.entry_zone, "tp_zone": plan.tp_zone, "status": "APPROVED_FOR_EXECUTION", "evidence": plan.evidence})
                                totals["live_demo_candidates"] += 1
            symbol_rows.append(row)
        latest_confirmed_structure_event_ids[symbol] = next((row["event_id"] for row in reversed(symbol_rows) if row.get("confirmation") == "CONFIRMED" and (row.get("selected_setup") or row.get("kind") in ("BOS", "CHoCH_MSS", "LIQUIDITY_SWEEP", "BREAKER_BLOCK"))), None)
        observations[symbol] = {"closed_counts": {"1h": len(h), "15m": len(m), "5m": len(q)}, "latest_closed_candle": {"1h": h[-1]["close_time"], "15m": m[-1]["close_time"], "5m": q[-1]["close_time"]}, "recent_events": symbol_rows, "swing_visuals": swing_visuals(m)}

    structure_events = {symbol: rows_data["recent_events"] for symbol, rows_data in observations.items()}
    plan_candidates = preserve_active_plans(previous_active_plans, plan_candidates)
    for candidate in plan_candidates:
        assert_candidate_contract(candidate)
    plan_candidates = invalidate_stale_candidates(plan_candidates, latest_structure_event_ids, structure_events, server_time)
    rank_and_approve_candidates(plan_candidates, latest_structure_event_ids)
    execution_candidates = collapse_active_plans(observations, plan_candidates)
    totals["live_demo_candidates"] = len(execution_candidates)

    active_plan_by_symbol = {candidate["symbol"]: candidate for candidate in execution_candidates}
    out = build_artifact_status({"name": "BINANCE_DEMO_LIVE_PIPELINE", "environment": "demo-fapi", "server_time": server_time, "symbols": observations, "latest_structure_event_ids": latest_structure_event_ids, "latest_confirmed_structure_event_ids": latest_confirmed_structure_event_ids, "execution_candidates": execution_candidates, "active_plan_by_symbol": active_plan_by_symbol, "totals": totals, "live_demo_plan": False, "next_action": "Live Demo executor processes fresh APPROVED_FOR_EXECUTION candidates."})
    _write_artifact(out)
    print(json.dumps(out, indent=2))

def _write_artifact(payload):
    artifact_path = ART / "BINANCE_DEMO_LIVE_PIPELINE.json"
    fd, temp_path = tempfile.mkstemp(prefix="live-pipeline-", suffix=".json", dir=ART)
    try:
        with open(fd, "w", encoding="utf-8") as handle: json.dump(payload, handle, indent=2); handle.write("\n")
        Path(temp_path).replace(artifact_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)

if __name__ == "__main__": main()
