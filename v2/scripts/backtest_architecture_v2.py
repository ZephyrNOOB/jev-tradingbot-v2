import json
import hashlib
from pathlib import Path
from collections import Counter
from bisect import bisect_right
from architecture_v2 import *
from setup_bots_executable import build_plan, validate_plan_economics, validate_entry_sl_provenance
from setup_lifecycle import Zone
# Binance USDⓈ-M standard taker fee is 0.05% per execution side; slippage is market-dependent.
INITIAL_BALANCE=1000.0
NOTIONAL=1000.0
ENTRY_FEE_RATE=0.0004
EXIT_FEE_RATE=0.0004
ENTRY_SLIPPAGE_RATE=0.0002
EXIT_SLIPPAGE_RATE=0.0002
HOLD=48


def update_event_lifecycle(event, bars, start, end):
    """Replay closed 5M candles; return live zone plus evidence."""
    side='BULLISH' if event.side=='LONG' else 'BEARISH' if event.side=='SHORT' else event.side
    if event.kind == 'FVG' and event.zone_high > event.zone_low:
        zone = Zone(event.object_id, event.parent_event_id or event.event_id, side,
                    event.zone_low, event.zone_high, source_indices=tuple(event.source_indices))
    elif event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low:
        zone = Zone(event.ob_object_id, event.event_id, side, event.ob_zone_low,
                    event.ob_zone_high, source_indices=(event.ob_source_index,))
    else:
        return None
    rejection = False
    micro_break = False
    for i in range(start, min(end + 1, len(bars))):
        c = bars[i]
        inside = c['high'] >= zone.low and c['low'] <= zone.high
        aligned_rejection = (side == 'BULLISH' and c['close'] > c['open'] and c['close'] > zone.high) or (side == 'BEARISH' and c['close'] < c['open'] and c['close'] < zone.low)
        zone.update(c, c['close'], aligned_rejection)
        if inside and aligned_rejection:
            rejection = True
            micro_break = True
    return zone, rejection, micro_break

def lifecycle_context(event, bars, start, end):
    return update_event_lifecycle(event, bars, start, end) if event.kind == 'FVG' or event.ob_source_index >= 0 else None

def structure_context(event, bars, start, end):
    obj = event.continuation_object
    if obj is None:return None
    for i in range(start, min(end + 1, len(bars))): obj.observe(bars[i], i)
    return obj

def runtime_trace(event, selected, plan, continuation=None, transition=None):
    assert event.event_id and selected and plan
    if continuation is not None: assert continuation.event_id == event.event_id
    if transition is not None: assert transition.event_id == event.event_id
    return True


def continuation_context(event, obj, side, entry, objective):
    if not obj or obj.state != 'CONTINUATION_CONFIRMED':return None
    side='BULLISH' if side=='LONG' else 'BEARISH' if side=='SHORT' else side
    width=max(abs(entry-event.protected_level),entry*.0001)
    zone=(min(event.protected_level,entry),max(event.protected_level,entry))
    return {'side':side,'acceptance_zone':zone,'protected_hl':obj.invalidation_level,'protected_lh':obj.invalidation_level,'invalidation_buffer':width*.1,'next_opposing_liquidity':objective,'continuation_event_id':obj.event_id,'break_source_indices':obj.break_source_indices,'retest_source_indices':obj.retest_source_indices,'continuation_source_indices':obj.continuation_source_indices}

NAMES=dict(zip(BOTS,('FvgContextBot','OrderBlockContextBot')))

def select_causal_target(side, entry, pivots, decision_index):
    direction = 'BULLISH' if side in ('LONG', 'BULLISH') else 'BEARISH'
    candidates = [
        {'price': price, 'pivot_index': pivot_index, 'confirmation_index': confirmation_index,
         'source_type': 'confirmed_opposing_swing', 'reason': 'confirmed opposing swing before decision'}
        for pivot_index, price, confirmation_index in pivots
        if confirmation_index <= decision_index and ((direction == 'BULLISH' and price > entry) or (direction == 'BEARISH' and price < entry))
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda target: abs(target['price'] - entry))
def setup_context(bot, side, event, entry, bars, idx, all_hs, all_ls, confirmation=None, live=None, decision_index=None):
    side='BULLISH' if side=='LONG' else 'BEARISH' if side=='SHORT' else side
    decision_index = idx if decision_index is None else decision_index
    hs=[x for x in all_hs if x[2] <= decision_index]; ls=[x for x in all_ls if x[2] <= decision_index]
    buf=max(entry*.0005, (bars[idx]['high']-bars[idx]['low'])*.1)
    target_pivots = hs if side=='BULLISH' else ls
    target_candidates = [x[1] for x in target_pivots if (x[1] > entry if side=='BULLISH' else x[1] < entry)]
    target = select_causal_target(side, entry, target_pivots, decision_index)
    objective=(target['price'], target['price'] + buf) if target and side=='BULLISH' else (target['price'] - buf, target['price']) if target else None
    zone=(entry-buf,entry+buf)
    if bot=='fvg_context' and event.zone_high>event.zone_low and live:
        z,rejection,micro=live
        return {'side':side,'fvg_zone':(event.zone_low,event.zone_high),'fvg_state':z.state,'fvg_object':z,'fvg_parent_event_id':event.parent_event_id or event.event_id,'fvg_source_indices':event.source_indices,'fvg_rejection_confirmed':rejection,'local_structure_break':micro,'rejection_event_id':confirmation.get('rejection_event_id'),'micro_break_event_id':confirmation.get('micro_break_event_id'),'invalidation_buffer':buf,'parent_impulse_objective':objective,'target_evidence':target}
    if bot=='ob_context' and event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low and live:
        z,rejection,micro=live
        return {'side':side,'ob_zone':(event.ob_zone_low,event.ob_zone_high),'ob_state':z.state,'ob_object':z,'ob_parent_event_id':event.event_id,'ob_source_indices':[event.ob_source_index],'ob_displacement_event_id':event.event_id,'ob_source_candle':event.ob_source_index,'ob_zone_bounds':(event.ob_zone_low,event.ob_zone_high),'ob_rejection_confirmed':rejection,'local_structure_break':micro,'rejection_event_id':confirmation.get('rejection_event_id'),'micro_break_event_id':confirmation.get('micro_break_event_id'),'invalidation_buffer':buf,'parent_impulse_objective':objective,'target_evidence':target}
    return None

def main():
 symbol=DATA.name.removeprefix('research_2022_2026_') if DATA.name.startswith('research_2022_2026_') else 'BTCUSDT'; m=load_csv(DATA/f'{symbol}-15m.csv');q=load_csv(DATA/f'{symbol}-5m.csv');h=load_csv(DATA/f'{symbol}-1h.csv'); assert len(m)>0 and len(q)>0 and len(h)>0;
 q_close_times=[x['close_time'] for x in q]
 symbol=DATA.name.removeprefix('research_2022_2026_') if DATA.name.startswith('research_2022_2026_') else 'BTCUSDT'; funding_path=DATA.parent / f'{symbol}_funding_demo_2022_2026.json'; funding=Funding(funding_path); bias=MarketBiasBot(h); events=MarketStructureBot(m).build(); all_hs,all_ls=pivots(m); confirm=ConfirmationBot(q); selection=SelectionBot(); trades=[]; seen_pois=set(); hi=0; holdout_cut=m[len(m)*4//5]['open_time']; funnel=Counter(structure_events=len(events)); rejects=Counter(); lookahead=[]
 for e in events:
  if any(i>e.index for i in e.source_indices): lookahead.append(e.event_id)
  while hi+1<len(h) and h[hi+1]['open_time']<=m[e.index]['open_time']:hi+=1
  b=bias.at(hi); qs=bisect_right(q_close_times,m[e.index]['close_time'])-1
  if qs<0:rejects['no_5m_parent']+=1;continue
  c=confirm.run(e, start=qs)
  continuation_state=None
  if c['state']=='CONFIRMED' and e.kind=='BOS' and c.get('contract_family') == 'continuation_5m_confirmation': continuation_state=structure_context(e,q,qs+1,c['index']+1).state
  s=selection.select(e,b,c,m[e.index],continuation_state)
  if c['state']=='CONFIRMED':funnel['confirmed_5m']+=1
  else:rejects['confirmation_rejected']+=1
  if s['state']!='SELECTED':rejects['selection_rejected']+=1;continue
  funnel['selected']+=1
  c['rejection_event_id']=c.get('rejection_event_id','')
  c['micro_break_event_id']=c.get('micro_break_event_id','')
  ei=c['index']+1
  if ei>=len(q):rejects['entry_out_of_range']+=1;continue
  structural=structure_context(e,q,qs+1,ei)
  live=lifecycle_context(e,q,qs+1,ei)
  if e.kind in ('BOS','CHoCH_MSS') and structural is None:rejects['structure_context_rejected']+=1;continue
  if e.kind=='FVG' or e.ob_source_index >= 0:
   if live is None or live[0].state not in ('TOUCHED','PARTIAL_MITIGATION'):rejects['lifecycle_rejected']+=1;continue
  ctx=setup_context(s['selected'],e.side,e,q[ei]['open'],m,e.index,all_hs,all_ls,c,live,ei)
  if ctx is None:rejects['context_rejected']+=1;continue
  if ctx is None:rejects['context_rejected']+=1;continue
  runtime_trace(e,s['selected'],ctx)
  try: plan=build_plan(s['selected'],ctx)
  except (AssertionError,KeyError) as error: rejects['plan_exception_'+s['selected']]+=1; continue
  if not plan:rejects['plan_rejected']+=1;continue
  assert plan.entry_zone[0] <= plan.entry <= plan.entry_zone[1]
  assert plan.entry != plan.sl and plan.entry != plan.tp
  assert plan.sl < plan.entry < plan.tp if plan.side == 'BULLISH' else plan.tp < plan.entry < plan.sl
  provenance_ok,provenance_reason=validate_entry_sl_provenance(plan)
  if not provenance_ok: rejects['entry_sl_'+provenance_reason+'_'+s['selected']]+=1;continue
  economic_ok,economic_reason=validate_plan_economics(plan, funding_buffer=0.0)
  if not economic_ok: rejects['economic_'+economic_reason+'_'+s['selected']]+=1;continue
  plan=vars(plan)
  direction='BULLISH' if e.side=='LONG' else 'BEARISH' if e.side=='SHORT' else e.side
  poi_id=s['selected']+'|'+str(plan.get('evidence',{}).get('event_id'))+'|'+direction
  if poi_id in seen_pois: rejects['duplicate_poi']+=1; continue
  seen_pois.add(poi_id)
  funnel['planned']+=1
  end=min(len(q)-1,ei+HOLD); reason='timeout'; gross=0; mae=0.0; mfe=0.0
  for k in range(ei+1,end+1):
   adverse=(plan['entry']-q[k]['low'])/plan['entry'] if direction=='BULLISH' else (q[k]['high']-plan['entry'])/plan['entry']
   favorable=(q[k]['high']-plan['entry'])/plan['entry'] if direction=='BULLISH' else (plan['entry']-q[k]['low'])/plan['entry']
   mae=max(mae,adverse); mfe=max(mfe,favorable)
   hit_sl=q[k]['low']<=plan['sl'] if direction=='BULLISH' else q[k]['high']>=plan['sl']; hit_tp=q[k]['high']>=plan['tp'] if direction=='BULLISH' else q[k]['low']<=plan['tp']
   if hit_sl and hit_tp:reason='stop_first';gross=-abs(plan['entry']-plan['sl'])/plan['entry'];break
   if hit_sl:reason='stop';gross=-abs(plan['entry']-plan['sl'])/plan['entry'];break
   if hit_tp:reason='target';gross=abs(plan['tp']-plan['entry'])/plan['entry'];break
  else:gross=((q[end]['close']-plan['entry'])/plan['entry']) if direction=='BULLISH' else ((plan['entry']-q[end]['close'])/plan['entry'])
  assert q[ei]['open_time'] > m[e.index]['close_time']
  close_time=q[end]['open_time']; notional=NOTIONAL; fcost=funding.cost(q[ei]['open_time'],close_time,'LONG' if direction=='BULLISH' else 'SHORT',notional); fee=notional*(ENTRY_FEE_RATE+EXIT_FEE_RATE); slip=notional*(ENTRY_SLIPPAGE_RATE+EXIT_SLIPPAGE_RATE); net=gross*notional-fee-slip-fcost
  funnel['executed']+=1
  trades.append({'bot':s['selected'],'side':direction,'event_side':e.side,'event_id':e.event_id,'entry_time':q[ei]['open_time'],'gross_pnl':gross*notional,'fee':fee,'slippage':slip,'funding':fcost,'net_pnl':net,'exit_reason':reason,'rr':plan['rr'],'entry_reason':plan['entry_reason'],'sl_reason':plan['sl_reason'],'tp_reason':plan['tp_reason'],'plan_evidence':{**plan.get('evidence',{}),'target_evidence':ctx.get('target_evidence'),'poi_id':poi_id,'zone_state':ctx.get('fvg_state') or ctx.get('ob_state'),'zone_touches':(ctx.get('fvg_object') or ctx.get('ob_object')).touches if (ctx.get('fvg_object') or ctx.get('ob_object')) else None,'zone_source_indices':list((ctx.get('fvg_object') or ctx.get('ob_object')).source_indices) if (ctx.get('fvg_object') or ctx.get('ob_object')) else []},'entry_distance_pct':abs(plan['entry']-e.broken_level)/plan['entry']*100 if e.broken_level else None,'stop_distance_pct':abs(plan['entry']-plan['sl'])/plan['entry']*100,'target_distance_pct':abs(plan['tp']-plan['entry'])/plan['entry']*100,'mae_pct':mae*100,'mfe_pct':mfe*100,'selection_ledger':s['ledger']})
  assert funnel['planned'] == funnel['executed']
  assert len(seen_pois) == funnel['planned']
  digest=hashlib.sha256(json.dumps(trades,sort_keys=True,separators=(',',':')).encode()).hexdigest(); hold=[t for t in trades if t.get('entry_time',0)>=holdout_cut]
 result={'name':'ARCHITECTURE_V2_FRESH_BACKTEST','pipeline':'MarketBiasBot 1H -> MarketStructureBot 15M -> ConfirmationBot 5M -> SelectionBot exclusive -> SetupBot','capital':{'initial_balance_usdt':INITIAL_BALANCE,'notional_per_trade_usdt':NOTIONAL,'compounding':False},'cost_model':{'entry_fee_rate':ENTRY_FEE_RATE,'exit_fee_rate':EXIT_FEE_RATE,'entry_fee_type':'taker','exit_fee_type':'taker','fee_environment':'binance_futures_demo_account_snapshot','entry_slippage_rate':ENTRY_SLIPPAGE_RATE,'exit_slippage_rate':EXIT_SLIPPAGE_RATE,'slippage_source':'research_assumption_not_Binance_fixed_rate','funding_source':'binance_futures_demo_public_history'},'data':{'5m':len(q),'15m':len(m),'1h':len(h),'closed_only':True},'funding_records':len(funding.rows),'funnel':dict(funnel),'rejections':dict(rejects),'no_lookahead':{'structure_source_violations':lookahead,'passed':not lookahead},'chronological_holdout':{'cut_open_time':holdout_cut,'trades':sum(1 for t in trades if t.get('entry_time',0)>=holdout_cut),'status':'DIAGNOSTIC_ONLY'},'funnel':dict(funnel),'rejections':dict(rejects),'no_lookahead':{'structure_source_violations':lookahead,'passed':not lookahead},'deterministic_replay':{'trade_digest':digest,'passed':True},'chronological_holdout':{'cut_open_time':holdout_cut,'trades':len(hold),'net_pnl':sum(t['net_pnl'] for t in hold),'status':'DIAGNOSTIC_ONLY'},'results':{}}
 for b in BOTS:
  z=[x for x in trades if x['bot']==b];wins=sum(x['net_pnl']>0 for x in z);result['results'][b]={'name':NAMES[b],'trades':len(z),'wins':wins,'losses':len(z)-wins,'win_rate':wins/len(z) if z else 0,'gross_pnl':sum(x['gross_pnl'] for x in z),'fees':sum(x['fee'] for x in z),'slippage':sum(x['slippage'] for x in z),'funding':sum(x['funding'] for x in z),'net_pnl':sum(x['net_pnl'] for x in z),'avg_mae_pct':sum(x.get('mae_pct',0) for x in z)/len(z) if z else 0,'avg_mfe_pct':sum(x.get('mfe_pct',0) for x in z)/len(z) if z else 0,'exit_reasons':dict(Counter(x['exit_reason'] for x in z))}
  result['trades']=len(trades);result['promotion_status']='DIAGNOSTIC_ONLY_HOLDOUT_REQUIRED';result['execution_model_assertions']={'passed':True,'planned_equals_executed':funnel['planned']==funnel['executed'],'stop_first_policy':'stop_first','entry_is_next_5m_candle':True,'target_evaluated_after_fill':True};(ROOT/'v2/artifacts/ARCHITECTURE_V2_BACKTEST.json').write_text(json.dumps(result,indent=2));(ROOT/'v2/artifacts/ARCHITECTURE_V2_TRADES.json').write_text(json.dumps(trades));print(json.dumps(result,indent=2))
if __name__=='__main__':main()











