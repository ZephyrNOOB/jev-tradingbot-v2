import json
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'v2'/'artifacts'
trades=json.loads((ART/'ARCHITECTURE_V2_TRADES.json').read_text())
back=json.loads((ART/'ARCHITECTURE_V2_BACKTEST.json').read_text())
cut=back['chronological_holdout']['cut_open_time']
def metric(rows):
 if not rows:return {'trades':0,'net_pnl':0,'gross_pnl':0,'wins':0,'losses':0,'win_rate':0,'avg_rr':0,'avg_mae_pct':0,'avg_mfe_pct':0,'exit_reasons':{},'mean_fee':0,'mean_slippage':0,'mean_funding':0,'ambiguous_stop_first':0}
 return {'trades':len(rows),'net_pnl':sum(x['net_pnl'] for x in rows),'gross_pnl':sum(x['gross_pnl'] for x in rows),'wins':sum(x['net_pnl']>0 for x in rows),'losses':sum(x['net_pnl']<=0 for x in rows),'win_rate':sum(x['net_pnl']>0 for x in rows)/len(rows),'avg_rr':sum(x['rr'] for x in rows)/len(rows),'avg_mae_pct':sum(x['mae_pct'] for x in rows)/len(rows),'avg_mfe_pct':sum(x['mfe_pct'] for x in rows)/len(rows),'exit_reasons':dict(Counter(x['exit_reason'] for x in rows)),'mean_fee':sum(x['fee'] for x in rows)/len(rows),'mean_slippage':sum(x['slippage'] for x in rows)/len(rows),'mean_funding':sum(x['funding'] for x in rows)/len(rows),'ambiguous_stop_first':sum(x['exit_reason']=='stop_first' for x in rows)}
periods={'all':trades,'development':[x for x in trades if x['entry_time']<cut],'holdout':[x for x in trades if x['entry_time']>=cut]}
summary={}
for period,rows in periods.items():
 summary[period]={'overall':metric(rows),'by_setup':{},'by_side':{}}
 for setup in sorted({x['bot'] for x in trades}):summary[period]['by_setup'][setup]=metric([x for x in rows if x['bot']==setup])
 for side in ('BULLISH','BEARISH'):summary[period]['by_side'][side]=metric([x for x in rows if x['side']==side])
findings=['FVG and OB both have positive diagnostic holdout net PnL; this is not production proof.','FVG has much larger sample and contributes most net PnL; OB holdout sample is only 10 trades.','Stop-first ambiguity exists in the executed artifact and requires an explicit execution convention before live testing.','Future single-variable test should isolate one setup risk or target rule while preserving the locked funnel and costs.']
out={'name':'STAGE7_FVG_OB_EVIDENCE_AUDIT','status':'DIAGNOSTIC_ONLY','source_artifacts':['ARCHITECTURE_V2_BACKTEST.json','ARCHITECTURE_V2_TRADES.json'],'holdout_cut_open_time':cut,'summary':summary,'findings':findings,'decision':'REGISTER_NEXT_HYPOTHESIS','next_hypothesis':'Measure whether stop-first ambiguity changes setup conclusions under conservative versus optimistic candle-order conventions; do not alter production behavior yet.'}
assert summary['all']['overall']['trades']==523 and summary['holdout']['overall']['trades']==117
assert set(summary['all']['by_setup'])=={'fvg_context','ob_context'}
(ART/'STAGE7_FVG_OB_EVIDENCE_AUDIT.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))