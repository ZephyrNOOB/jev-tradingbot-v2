import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "v2" / "artifacts"
SCRIPT = ROOT / "v2" / "scripts" / "backtest_architecture_v2.py"


def run_once():
    env = os.environ.copy()
    env["V2_DATA_DIR"] = str(ROOT / "v2" / "data" / "research_2022_2026")
    subprocess.run([sys.executable, str(SCRIPT)], cwd=ROOT / "v2" / "scripts", env=env, check=True, stdout=subprocess.DEVNULL)
    payload = (ART / "ARCHITECTURE_V2_TRADES.json").read_bytes()
    return hashlib.sha256(payload).hexdigest(), len(json.loads(payload))


def main():
    first_digest, first_count = run_once()
    second_digest, second_count = run_once()
    out = {"name": "DETERMINISTIC_REPLAY_GATE", "status": "PASS" if first_digest == second_digest and first_count == second_count else "FAIL", "runs": [{"trade_digest": first_digest, "trade_count": first_count}, {"trade_digest": second_digest, "trade_count": second_count}], "same_digest": first_digest == second_digest, "same_trade_count": first_count == second_count, "production_changed": False}
    assert out["status"] == "PASS", out
    (ART / "DETERMINISTIC_REPLAY_GATE.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()