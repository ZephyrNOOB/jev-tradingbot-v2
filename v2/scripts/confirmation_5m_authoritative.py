"""Authoritative causal 5M confirmation contract for 15M structure events."""

from bisect import bisect_right

from market_structure_authoritative import _atr, confirmed_pivots


CONFIRMATION_WINDOW_BARS = 48
MICRO_BREAK_BODY_ATR = 0.5
MICRO_BREAK_BODY_RANGE_RATIO = 0.55


def event_id(rows, index, symbol):
    return f"5m:{symbol}:{rows[index].get('close_ts', rows[index].get('close_time', rows[index].get('ts', index)))}"


def window_indices(rows, parent_close_ts, window=CONFIRMATION_WINDOW_BARS, close_times=None):
    close_times = close_times if close_times is not None else [row.get("close_ts", row.get("close_time", row.get("ts", i))) for i, row in enumerate(rows)]
    start = bisect_right(close_times, parent_close_ts)
    return range(start, min(len(rows), start + window))


def five_min_micro_breaks(rows):
    atrs = _atr(rows)
    confirmations = confirmed_pivots(rows, scales=(2,))
    highs, lows = [], []
    result = {}
    for index, row in enumerate(rows):
        for pivot in confirmations.get(index, []):
            (highs if pivot["kind"] == "high" else lows).append(pivot)
        body = abs(row["close"] - row["open"])
        candle_range = max(row["high"] - row["low"], 1e-12)
        displacement = atrs[index] is not None and body >= atrs[index] * MICRO_BREAK_BODY_ATR and body / candle_range >= MICRO_BREAK_BODY_RANGE_RATIO
        result[index] = {"LONG": None, "SHORT": None}
        if displacement and highs and row["close"] > highs[-1]["price"]:
            result[index]["LONG"] = {"source_pivot_index": highs[-1]["index"]}
        if displacement and lows and row["close"] < lows[-1]["price"]:
            result[index]["SHORT"] = {"source_pivot_index": lows[-1]["index"]}
    return result


def continuation_confirmation(rows, parent_event, micro_breaks=None, window=CONFIRMATION_WINDOW_BARS, close_times=None, symbol="UNKNOWN"):
    micro_breaks = micro_breaks or five_min_micro_breaks(rows)
    indices = list(window_indices(rows, parent_event["candidate_timestamp"], window, close_times))
    side = parent_event["side"]
    level = parent_event.get("broken_level")
    result = {
        "contract_family": "continuation_5m_confirmation",
        "parent_15m_event_id": parent_event["event_id"],
        "parent_timestamp": parent_event["candidate_timestamp"],
        "side": side,
        "parent_break_annotation": parent_event.get("break_annotation", "BOS"),
        "protected_level": parent_event.get("protected_level"),
        "broken_level": level,
        "confirmation_status": "REJECTED",
        "rejection_reason": None,
        "retest_event_id": None,
        "rejection_event_id": None,
        "micro_break_event_id": None,
        "source_5m_indices": [],
        "window_bars_observed": len(indices),
    }
    if level is None:
        result["rejection_reason"] = "missing_parent_broken_level"
        return result
    protected = parent_event.get("protected_level")
    for index in indices:
        if protected is not None and ((side == "LONG" and rows[index]["close"] < protected) or (side == "SHORT" and rows[index]["close"] > protected)):
            result["rejection_reason"] = "protected_reference_broken"
            result["source_5m_indices"].append(index)
            return result
    retest = None
    for index in indices:
        touched = rows[index]["low"] <= level if side == "LONG" else rows[index]["high"] >= level
        if touched:
            retest = index
            break
    if retest is None:
        result["rejection_reason"] = "no_retest"
        return result
    result["retest_event_id"] = event_id(rows, retest, symbol)
    result["source_5m_indices"].append(retest)
    held = rows[retest]["close"] > level if side == "LONG" else rows[retest]["close"] < level
    if not held:
        result["rejection_reason"] = "retest_failure"
        result["rejection_event_id"] = event_id(rows, retest, symbol)
        return result
    result["rejection_event_id"] = event_id(rows, retest, symbol)
    for index in indices:
        if index <= retest:
            continue
        if micro_breaks[index].get(side):
            result["micro_break_event_id"] = event_id(rows, index, symbol)
            result["source_5m_indices"].append(index)
            result["confirmation_status"] = "CONFIRMED"
            return result
    result["rejection_reason"] = "no_micro_break_after_retest_hold"
    return result


def zone_confirmation(rows, parent_event, family, annotation, micro_breaks=None, window=CONFIRMATION_WINDOW_BARS, close_times=None, symbol="UNKNOWN"):
    micro_breaks = micro_breaks or five_min_micro_breaks(rows)
    indices = list(window_indices(rows, parent_event["candidate_timestamp"], window, close_times))
    side = annotation["side"]
    low, high = annotation["low"], annotation["high"]
    state = "ACTIVE"
    touched = None
    rejection = None
    result = {
        "contract_family": family,
        "parent_15m_event_id": parent_event["event_id"],
        "parent_timestamp": parent_event["candidate_timestamp"],
        "side": side,
        "parent_break_annotation": parent_event.get("break_annotation"),
        "object_id": f"{family}:{parent_event['event_id']}",
        "source_15m_indices": annotation.get("source_indices", [annotation.get("source_index")]),
        "zone_bounds": {"low": low, "high": high},
        "lifecycle_state": state,
        "confirmation_status": "REJECTED",
        "rejection_reason": None,
        "touch_event_id": None,
        "rejection_event_id": None,
        "micro_break_event_id": None,
        "source_5m_indices": [],
        "window_bars_observed": len(indices),
    }
    for index in indices:
        candle = rows[index]
        protected = parent_event.get("protected_level")
        if protected is not None and ((side == "LONG" and candle["close"] < protected) or (side == "SHORT" and candle["close"] > protected)):
            result["lifecycle_state"] = "INVALIDATED"
            result["rejection_reason"] = "protected_reference_broken"
            result["source_5m_indices"].append(index)
            return result
        against = candle["close"] < low if side == "LONG" else candle["close"] > high
        if against:
            state = "INVALIDATED"
            result["lifecycle_state"] = state
            result["rejection_reason"] = "zone_invalidated_before_confirmation" if rejection is None else "zone_invalidated_after_rejection"
            return result
        intersects = candle["high"] >= low and candle["low"] <= high
        if state == "ACTIVE" and intersects:
            state = "TOUCHED"
            touched = index
            result["touch_event_id"] = event_id(rows, index, symbol)
            result["source_5m_indices"].append(index)
        if touched is not None and rejection is None:
            directional_close = candle["close"] > high if side == "LONG" else candle["close"] < low
            if directional_close:
                state = "PARTIAL_MITIGATION"
                rejection = index
                result["rejection_event_id"] = event_id(rows, index, symbol)
                result["source_5m_indices"].append(index)
        if rejection is not None and index > rejection and micro_breaks[index].get(side):
            result["lifecycle_state"] = state
            result["micro_break_event_id"] = event_id(rows, index, symbol)
            result["source_5m_indices"].append(index)
            result["confirmation_status"] = "CONFIRMED"
            return result
    result["lifecycle_state"] = state
    if touched is None:
        result["rejection_reason"] = "no_touch"
    elif rejection is None:
        result["rejection_reason"] = "no_rejection_after_touch"
    else:
        result["rejection_reason"] = "no_micro_break_after_rejection"
    return result
