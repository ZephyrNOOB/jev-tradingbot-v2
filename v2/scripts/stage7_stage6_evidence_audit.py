import json
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'v2/artifacts'
trades=json.loads((ART/'ARCHITECTURE_V2_TRADES.json').read_text())
backtest=json.loads((ART/'ARCHITECTURE_V2_BACKTEST.json').read_text())
cut=backtest['chronological_holdout']['cut_open_time']
summary={}
for period,rows in [('all',trades),('development',[t for t in trades if t['entry_time']<cut]),('holdout',[t for t in trades if t['entry_time']>=cut])]:
 setups={}
 for bot in sorted({t['bot'] for t in rows}):
  subset=[t for t in rows if t['bot']==bot]
  sides={}
  for side in sorted({t['side'] for t in subset}):
   xs=[t for t in subset if t['side']==side]
   sides[side]={'trades':len(xs),'net_pnl':sum(t['net_pnl'] for t in xs),'wins':sum(t['net_pnl']>0 for t in xs),'losses':sum(t['net_pnl']<=0 for t in xs),'exit_reasons':dict(Counter(t['exit_reason'] for t in xs))}
  setups[bot]={'trades':len(subset),'net_pnl':sum(t['net_pnl'] for t in subset),'exit_reasons':dict(Counter(t['exit_reason'] for t in subset)),'sides':sides}
 summary[period]={'trades':len(rows),'net_pnl':sum(t['net_pnl'] for t in rows),'setups':setups}
artifact={'name':'STAGE7_STAGE6_EVIDENCE_AUDIT','status':'DIAGNOSTIC_ONLY','source_artifacts':['ARCHITECTURE_V2_BACKTEST.json','ARCHITECTURE_V2_TRADES.json'],'holdout_cut_open_time':cut,'trade_count_matches_backtest':len(trades)==backtest['trades']==backtest['funnel']['executed'],'summary':summary,'findings':['Continuation Bullish and Continuation Bearish are removed from production SetupBot registry; their research artifacts remain historical evidence only.','FVG direction coverage is now present in both directions after the adapter fix; holdout remains diagnostic and requires independent validation before generalizing results.','Holdout is diagnostic only and cannot establish production profitability or justify setup promotion.']}
assert artifact['trade_count_matches_backtest']
assert summary['holdout']['trades']==backtest['chronological_holdout']['trades']
(ART/'STAGE7_STAGE6_EVIDENCE_AUDIT.json').write_text(json.dumps(artifact,indent=2)+'\n')
print(json.dumps(artifact,indent=2))