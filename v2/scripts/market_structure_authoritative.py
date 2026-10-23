"""Single-source causal 15M market-structure detector.

This module owns confirmed swings, protected references, BOS/CHoCH annotations,
and causal FVG/OB context. It never creates a trade plan.
"""

from collections import defaultdict
from dataclasses import asdict, dataclass


SYMBOL = "BTCUSDT"
INTERNAL_SWING = 2
EXTERNAL_SWING = 5
ATR_LENGTH = 14
DISPLACEMENT_ATR = 0.5
DISPLACEMENT_BODY_RANGE = 0.55
POOL_TOLERANCE = 0.001


@dataclass
class Event:
    event_id: str
    kind: str
    state: str
    side: str | None
    index: int
    source_indices: list[int]
    previous_state: str | None = None
    parent_event_id: str | None = None
    parent_swing_id: str | None = None
    parent_pool_id: str | None = None
    reason: str = ""
    broken_level: float | None = None
    protected_level: float | None = None
    protected_swing_id: str | None = None
    displacement_atr: float | None = None
    object_id: str | None = None
    zone_low: float | None = None
    zone_high: float | None = None
    ob_source_index: int = -1
    ob_zone_low: float | None = None
    ob_zone_high: float | None = None
    structure_layer: str = "SWING"
    level_classification: str = ""
    pool_id: str | None = None
    sweep_level: float | None = None
    sweep_extreme: float | None = None
    reclaim_index: int | None = None
    breaker_source_ob_id: str | None = None
    flip_level: float | None = None
    lifecycle_state: str = "ACTIVE"


def validate_event_contract(event):
    errors = []
    if any(index > event.index for index in event.source_indices):
        errors.append('future_source_index')
    if event.kind in ('BOS', 'CHoCH_MSS'):
        if event.broken_level is None:
            errors.append('missing_broken_level')
        if event.displacement_atr is None or event.displacement_atr <= 0:
            errors.append('invalid_displacement')
        if event.side not in ('LONG', 'SHORT'):
            errors.append('invalid_structure_side')
    if event.kind == 'FVG':
        if event.zone_low is None or event.zone_high is None or event.zone_low >= event.zone_high:
            errors.append('invalid_zone_bounds')
        if len(event.source_indices) != 3:
            errors.append('invalid_fvg_sources')
    if event.kind == 'BOS' and event.protected_level is None:
        errors.append('missing_protected_level')
    if event.ob_source_index >= 0 and (event.ob_zone_low is None or event.ob_zone_high is None or event.ob_zone_low >= event.ob_zone_high):
        errors.append('invalid_ob_zone')
    return errors
def _atr(rows, length=ATR_LENGTH):
    values = [None] * len(rows)
    true_ranges = []
    rolling = 0.0
    for i, row in enumerate(rows):
        previous = rows[i - 1]["close"] if i else row["close"]
        current = max(row["high"] - row["low"], abs(row["high"] - previous), abs(row["low"] - previous))
        true_ranges.append(current)
        rolling += current
        if i >= length:
            rolling -= true_ranges[i - length]
        if i >= length - 1:
            values[i] = rolling / length
    return values


def confirmed_pivots(rows, scales=(INTERNAL_SWING, EXTERNAL_SWING)):
    """Return pivots only on the candle where right-side confirmation closes."""
    confirmed = defaultdict(list)
    for width in scales:
        scale = "internal_swing" if width == INTERNAL_SWING else "external_swing"
        for pivot in range(width, len(rows) - width):
            high = rows[pivot]["high"]
            low = rows[pivot]["low"]
            is_high = all(high > rows[j]["high"] for j in range(pivot - width, pivot + width + 1) if j != pivot)
            is_low = all(low < rows[j]["low"] for j in range(pivot - width, pivot + width + 1) if j != pivot)
            if is_high:
                confirmed[pivot + width].append({"kind": "high", "index": pivot, "confirmation_index": pivot + width, "price": high, "scale": scale, "id": f"SW-H-{scale}-{pivot}"})
            if is_low:
                confirmed[pivot + width].append({"kind": "low", "index": pivot, "confirmation_index": pivot + width, "price": low, "scale": scale, "id": f"SW-L-{scale}-{pivot}"})
    return confirmed


def _sequence(highs, lows):
    if len(highs) < 2 or len(lows) < 2:
        return "INSUFFICIENT"
    high = "HH" if highs[-1]["price"] > highs[-2]["price"] else "LH"
    low = "HL" if lows[-1]["price"] > lows[-2]["price"] else "LL"
    return f"{high}_{low}"


def _sequence_state(sequence):
    if sequence == "HH_HL":
        return "BULLISH"
    if sequence == "LH_LL":
        return "BEARISH"
    if sequence == "INSUFFICIENT":
        return "UNKNOWN"
    return "RANGE"


def _bias_1h(rows_1h, close_ts):
    if not rows_1h:
        return "UNKNOWN"
    closed = [row for row in rows_1h if row.get("close_ts", 0) <= close_ts]
    if len(closed) < 20:
        return "NEUTRAL"
    average = sum(row["close"] for row in closed[-20:]) / 20
    return "BULLISH" if closed[-1]["close"] >= average else "BEARISH"


def _volatility_bucket(row, atr):
    if atr is None or row["close"] <= 0:
        return "UNKNOWN"
    ratio = atr / row["close"]
    return "LOW" if ratio < 0.004 else "MEDIUM" if ratio < 0.008 else "HIGH"


def _volume_context(rows, index, lookback=20):
    values = [row.get("volume", 0.0) for row in rows[max(0, index - lookback + 1) : index + 1]]
    average = sum(values) / len(values) if values else 0
    ratio = rows[index].get("volume", 0.0) / average if average else 0
    bucket = "HIGH" if ratio >= 1.2 else "LOW" if ratio <= 0.8 else "NORMAL"
    return {"ratio_to_20_bar_average": round(ratio, 8), "bucket": bucket, "participation_condition": ratio >= 1.2}


def _fvg(rows, index):
    if index < 2:
        return None
    left = rows[index - 2]
    current = rows[index]
    if left["high"] < current["low"]:
        return {"side": "LONG", "low": left["high"], "high": current["low"], "source_indices": [index - 2, index - 1, index]}
    if left["low"] > current["high"]:
        return {"side": "SHORT", "low": current["high"], "high": left["low"], "source_indices": [index - 2, index - 1, index]}
    return None


def _ob(rows, index, side, displacement):
    if not displacement or side is None:
        return None
    for source in range(index - 1, max(-1, index - 12), -1):
        opposing = rows[source]["close"] < rows[source]["open"] if side == "LONG" else rows[source]["close"] > rows[source]["open"]
        if opposing:
            return {"side": side, "low": rows[source]["low"], "high": rows[source]["high"], "source_index": source}
    return None


def _pool(swings, side):
    if len(swings) < 2:
        return None
    first, second = swings[-2], swings[-1]
    if abs(first["price"] - second["price"]) > max(first["price"], second["price"]) * POOL_TOLERANCE:
        return None
    return {"pool_id": f"POOL-{side}-{first['index']}-{second['index']}", "price": (first["price"] + second["price"]) / 2, "source_indices": [first["index"], second["index"]]}


def build_contexts(candles, rows_1h=None, upto=None, symbol=SYMBOL):
    rows = candles if upto is None else candles[: min(upto + 1, len(candles))]
    atrs = _atr(rows)
    confirmations = confirmed_pivots(rows)
    internal_highs, internal_lows = [], []
    external_highs, external_lows = [], []
    regime = "UNKNOWN"
    used_breaks = set()
    swept_pools = set()
    contexts = {}
    structure_events = {}

    for i, row in enumerate(rows):
        for pivot in confirmations.get(i, []):
            if pivot["scale"] == "internal_swing":
                (internal_highs if pivot["kind"] == "high" else internal_lows).append(pivot)
            else:
                (external_highs if pivot["kind"] == "high" else external_lows).append(pivot)

        sequence = _sequence(external_highs, external_lows)
        sequence_state = _sequence_state(sequence)
        if regime == "UNKNOWN" and sequence_state in {"BULLISH", "BEARISH"}:
            regime = sequence_state

        current_atr = atrs[i]
        body = abs(row["close"] - row["open"])
        candle_range = max(row["high"] - row["low"], 1e-12)
        displacement = current_atr is not None and body >= current_atr * DISPLACEMENT_ATR and body / candle_range >= DISPLACEMENT_BODY_RANGE
        last_high = external_highs[-1] if external_highs else None
        last_low = external_lows[-1] if external_lows else None
        bull_break = displacement and last_high is not None and row["close"] > last_high["price"]
        bear_break = displacement and last_low is not None and row["close"] < last_low["price"]
        structure = None
        previous_state = regime if regime in {"BULLISH", "BEARISH"} else sequence_state

        if bull_break or bear_break:
            side = "LONG" if bull_break else "SHORT"
            reference = last_high if bull_break else last_low
            protected = last_low if bull_break else last_high
            if reference and (side, reference["id"]) not in used_breaks:
                kind = "CHoCH_MSS" if previous_state in {"BULLISH", "BEARISH"} and previous_state != ("BULLISH" if side == "LONG" else "BEARISH") else "BOS"
                regime = "BULLISH" if side == "LONG" else "BEARISH"
                used_breaks.add((side, reference["id"]))
                structure = {
                    "event_id": f"15m:{row.get('close_ts', row.get('ts', i))}:{kind}:{reference['id']}",
                    "kind": kind,
                    "side": side,
                    "index": i,
                    "state": regime,
                    "previous_state": previous_state,
                    "source_indices": [reference["index"], i],
                    "broken_level": reference["price"],
                    "break_source_index": i,
                    "protected_level": protected["price"] if protected else None,
                    "protected_swing_id": protected["id"] if protected else None,
                    "parent_swing_id": reference["id"],
                    "displacement_atr": body / current_atr if current_atr else None,
                }

        state = regime if regime in {"BULLISH", "BEARISH"} else sequence_state
        protected = external_lows[-1] if state == "BULLISH" and external_lows else external_highs[-1] if state == "BEARISH" and external_highs else None
        fvg = _fvg(rows, i)
        ob = _ob(rows, i, structure["side"] if structure else None, displacement) if structure else None
        if structure:
            structure["ob"] = ob
        pool_low = _pool(external_lows, "SSL")
        pool_high = _pool(external_highs, "BSL")
        sweep = None
        if pool_low and pool_low["pool_id"] not in swept_pools and row["low"] < pool_low["price"] and row["close"] > pool_low["price"]:
            sweep = {"side": "LONG", "pool_id": pool_low["pool_id"], "level": pool_low["price"], "source_indices": pool_low["source_indices"]}
            swept_pools.add(pool_low["pool_id"])
        elif pool_high and pool_high["pool_id"] not in swept_pools and row["high"] > pool_high["price"] and row["close"] < pool_high["price"]:
            sweep = {"side": "SHORT", "pool_id": pool_high["pool_id"], "level": pool_high["price"], "source_indices": pool_high["source_indices"]}
            swept_pools.add(pool_high["pool_id"])

        timestamp = row.get("close_ts", row.get("ts", i))
        context = {
            "index": i,
            "event_id": f"{symbol}-15m-{timestamp}",
            "candidate_timestamp": timestamp,
            "side": structure["side"] if structure else None,
            "state": state,
            "previous_state": previous_state,
            "swing_sequence": sequence,
            "internal_swing_sequence": _sequence(internal_highs, internal_lows),
            "protected_level": structure["protected_level"] if structure else protected["price"] if protected else None,
            "protected_swing_id": structure["protected_swing_id"] if structure else protected["id"] if protected else None,
            "broken_level": structure["broken_level"] if structure else None,
            "break_source_index": structure["break_source_index"] if structure else None,
            "break_annotation": structure["kind"] if structure else None,
            "choch_mss_annotation": structure["kind"] if structure and structure["kind"] == "CHoCH_MSS" else None,
            "sweep_reclaim_evidence": sweep,
            "fvg_annotation": fvg,
            "ob_annotation": ob,
            "volatility_bucket": _volatility_bucket(row, current_atr),
            "volume_context": _volume_context(rows, i),
            "bias_1h": _bias_1h(rows_1h or [], timestamp),
            "structure_event": structure,
        }
        contexts[i] = context
        if structure:
            structure_events[i] = context
    return contexts, structure_events


def build_events(candles, upto=None, symbol=SYMBOL, rows_1h=None):
    contexts, _ = build_contexts(candles, rows_1h=rows_1h, upto=upto, symbol=symbol)
    events = []
    active_obs = {}
    emitted_breakers = set()
    for index, context in contexts.items():
        row = candles[index]
        structure = context["structure_event"]
        # Breaker lifecycle: prior causal OB invalidation flips zone function.
        for ob_id, ob in list(active_obs.items()):
            invalidated = (ob["side"] == "LONG" and row["close"] < ob["low"]) or (ob["side"] == "SHORT" and row["close"] > ob["high"])
            if invalidated and ob_id not in emitted_breakers:
                breaker_side = "SHORT" if ob["side"] == "LONG" else "LONG"
                flip = ob["low"] if breaker_side == "SHORT" else ob["high"]
                events.append(Event(f"BREAKER-{breaker_side}-{index}-{ob_id}", "BREAKER_BLOCK", "confirmed", breaker_side, index, [ob["source_index"], index], parent_event_id=ob["parent_event_id"], reason="source_ob_invalidated_and_function_flipped", broken_level=flip, protected_level=flip, object_id=f"BREAKER-{ob_id}", zone_low=ob["low"], zone_high=ob["high"], breaker_source_ob_id=ob_id, flip_level=flip, lifecycle_state="BREAKER_CONFIRMED"))
                emitted_breakers.add(ob_id)
        sweep = context["sweep_reclaim_evidence"]
        if structure:
            ob = structure.get("ob")
            events.append(Event(event_id=structure["event_id"], kind=structure["kind"], state="confirmed", side=structure["side"], index=index, source_indices=structure["source_indices"], previous_state=structure["previous_state"], parent_swing_id=structure["parent_swing_id"], reason="close_beyond_external_swing_with_displacement", broken_level=structure["broken_level"], protected_level=structure["protected_level"], protected_swing_id=structure["protected_swing_id"], displacement_atr=structure["displacement_atr"], ob_source_index=ob["source_index"] if ob else -1, ob_zone_low=ob["low"] if ob else None, ob_zone_high=ob["high"] if ob else None, level_classification="PROTECTED"))
            if ob:
                active_obs[f"OB-{structure['event_id']}"] = {**ob, "side": structure["side"], "parent_event_id": structure["event_id"]}
        if sweep:
            sweep_id = f"SWEEP-{sweep['side']}-{index}-{sweep['pool_id']}"
            events.append(Event(sweep_id, "LIQUIDITY_SWEEP", "confirmed", sweep["side"], index, sweep["source_indices"], parent_pool_id=sweep["pool_id"], reason="liquidity_breach_and_reclaim", broken_level=sweep["level"], protected_level=sweep["level"], pool_id=sweep["pool_id"], sweep_level=sweep["level"], sweep_extreme=candles[index]["low"] if sweep["side"] == "LONG" else candles[index]["high"], reclaim_index=index, zone_low=sweep["level"] - (candles[index]["high"] - candles[index]["low"]) * 0.1, zone_high=sweep["level"] + (candles[index]["high"] - candles[index]["low"]) * 0.1))
        fvg = context["fvg_annotation"]
        if fvg:
            event_id = f"FVG-{fvg['side']}-{index}"
            events.append(Event(event_id, "FVG", "active", fvg["side"], index, fvg["source_indices"], parent_event_id=structure["event_id"] if structure else None, reason="three_candle_imbalance", object_id=event_id, zone_low=fvg["low"], zone_high=fvg["high"]))
    return events


def events_at(events, index):
    return [asdict(event) for event in events if event.index == index]














