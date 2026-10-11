"""Read-only repeated paper snapshots; no order path."""
import hashlib, json, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'v2'/'artifacts'; PIPE=ROOT/'v2'/'scripts'/'binance_demo_paper_pipeline.py'
def run_once():
    result=subprocess.run([sys.executable,str(PIPE)],cwd=ROOT,capture_output=True,text=True,timeout=60)
    if result.returncode: raise SystemExit(result.stderr[-2000:])
    artifact=json.loads((ART/'BINANCE_DEMO_PAPER_PIPELINE.json').read_text())
    return {'server_time':artifact['server_time'],'totals':artifact['totals'],'orders_sent':artifact['orders_sent'],'digest':hashlib.sha256(json.dumps(artifact['symbols'],sort_keys=True,separators=(',',':')).encode()).hexdigest()}
def main():
    cycles=[]
    for i in range(3):
        cycles.append(run_once())
        if i<2: time.sleep(2)
    out={'name':'BINANCE_DEMO_MULTICYCLE','status':'PASS' if all(not x['orders_sent'] for x in cycles) else 'BLOCKED','cycles':cycles,'same_snapshot':len({x['digest'] for x in cycles})==1,'orders_sent':False,'withdrawals_sent':False,'next_action':'Require distinct closed-candle timestamps before promoting observation.'}
    (ART/'BINANCE_DEMO_MULTICYCLE.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out,indent=2))
    if out['status']!='PASS': raise SystemExit(1)
if __name__=='__main__': main()
