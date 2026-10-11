import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://demo-fapi.binance.com"
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSDT")


def get(path):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "jev-trading-bot-preflight/1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.status, json.loads(response.read())


def main():
    checks = {}
    try:
        status, ping = get("/fapi/v1/ping")
        checks["public_ping"] = status == 200 and ping == {}
        status, server_time = get("/fapi/v1/time")
        checks["server_time"] = status == 200 and isinstance(server_time.get("serverTime"), int)
        status, info = get("/fapi/v1/exchangeInfo")
        listed = {item["symbol"]: item for item in info.get("symbols", [])}
        checks["exchange_info"] = status == 200 and bool(listed)
        checks["required_symbols"] = all(symbol in listed for symbol in SYMBOLS)
        symbol_rules = {symbol: {"status": listed[symbol].get("status"), "contractType": listed[symbol].get("contractType"), "quoteAsset": listed[symbol].get("quoteAsset"), "orderTypes": listed[symbol].get("orderTypes", []), "isSpotTradingAllowed": listed[symbol].get("isSpotTradingAllowed")} for symbol in SYMBOLS if symbol in listed}
    except Exception as error:
        checks["public_ping"] = checks.get("public_ping", False)
        checks["server_time"] = checks.get("server_time", False)
        checks["exchange_info"] = checks.get("exchange_info", False)
        checks["required_symbols"] = False
        symbol_rules = {}
        checks["error"] = type(error).__name__ + ": " + str(error)
    env_text = (ROOT / ".env").read_text(encoding="utf-8") if (ROOT / ".env").exists() else ""
    checks["credential_names_configured"] = all(any(line.startswith(name + "=") and line.split("=", 1)[1].strip() for line in env_text.splitlines()) for name in ("BINANCE_DEMO_API_KEY", "BINANCE_DEMO_SECRET"))
    out = {"name": "BINANCE_DEMO_PREFLIGHT", "status": "PASS" if all(value for key, value in checks.items() if key != "error") else "BLOCKED", "environment": "demo-fapi", "base_url": BASE, "checks": checks, "symbols": symbol_rules, "orders_sent": False, "withdrawals_sent": False, "secrets_logged": False, "next_action": "Run paper/observation execution only; no order until explicit confirmation."}
    (ROOT / "v2" / "artifacts" / "BINANCE_DEMO_PREFLIGHT.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    if out["status"] != "PASS": raise SystemExit(1)


if __name__ == "__main__": main()