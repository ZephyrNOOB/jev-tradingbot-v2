"""Read-only Binance Demo market-data observation; never sends orders."""
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "v2" / "artifacts"
BASE = "https://demo-fapi.binance.com"
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSDT")
TIMEFRAMES = ("1h", "15m", "5m")

def get(path):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "jev-trading-bot-observation/1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, json.loads(response.read())

def candle(row):
    return {"open_time": int(row[0]), "open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[5]), "close_time": int(row[6])}

def main():
    started = int(time.time() * 1000); _, server = get("/fapi/v1/time"); server_time = int(server["serverTime"]); _, info = get("/fapi/v1/exchangeInfo"); listed = {item["symbol"]: item for item in info["symbols"]}; observations = {}
    checks = {"server_time": server_time > 0, "symbols_trading": all(listed.get(symbol, {}).get("status") == "TRADING" for symbol in SYMBOLS), "closed_only": True, "ascending": True}
    for symbol in SYMBOLS:
        observations[symbol] = {}
        for interval in TIMEFRAMES:
            _, raw = get(f"/fapi/v1/klines?symbol={symbol}&interval={interval}&limit=3"); rows = [candle(row) for row in raw]; closed = [row for row in rows if row["close_time"] < server_time]
            checks["closed_only"] = checks["closed_only"] and len(closed) > 0 and all(row["close_time"] < server_time for row in closed); checks["ascending"] = checks["ascending"] and all(rows[i]["open_time"] < rows[i + 1]["open_time"] for i in range(len(rows) - 1)); observations[symbol][interval] = {"latest_closed": closed[-1] if closed else None, "rows_received": len(rows), "closed_rows": len(closed)}
    out = {"name": "BINANCE_DEMO_OBSERVATION", "status": "PASS" if all(checks.values()) else "BLOCKED", "environment": "demo-fapi", "base_url": BASE, "server_time": server_time, "server_datetime": datetime.fromtimestamp(server_time / 1000, timezone.utc).isoformat(), "started_at": started, "checks": checks, "symbols": observations, "paper_orders": [], "orders_sent": False, "withdrawals_sent": False, "next_action": "Feed closed snapshots into virtual signal/SL/TP engine; keep real order path disabled."}
    (ART / "BINANCE_DEMO_OBSERVATION.json").write_text(json.dumps(out, indent=2) + "\n"); print(json.dumps(out, indent=2))
    if out["status"] != "PASS": raise SystemExit(1)

if __name__ == "__main__": main()
