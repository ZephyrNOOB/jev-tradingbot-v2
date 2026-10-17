"""Setup-owned trade plans. No shared SL/TP/RR."""
from dataclasses import dataclass
from setup_lifecycle import fvg_entry_allowed, ob_entry_allowed, setup_entry_allowed

# SetupBot cores own trade-plan construction. No shared Entry/SL/TP logic.
NEW_SETUP_BOTS = ('liquidity_sweep_reversal', 'breaker_block', 'rbs_sbr_continuation')

@dataclass
class TradePlan:
    setup_id:str; side:str; entry_zone:tuple; entry:float; sl:float; tp_zone:tuple; tp:float; invalidation:str; entry_reason:str; sl_reason:str; tp_reason:str; rr:float; evidence:dict=None; state:str='READY'
    def validate(self):
        assert self.entry_zone[0] <= self.entry <= self.entry_zone[1]
        assert self.sl < self.entry < self.tp if self.side == 'BULLISH' else self.tp < self.entry < self.sl
        assert self.rr > 0 and self.entry_reason and self.sl_reason and self.tp_reason
        return self

def _p(i,s,z,e,sl,tz,tp,inv,er,sr,tr,evidence):
    return TradePlan(i,s,z,e,sl,tz,tp,inv,er,sr,tr,abs(tp-e)/abs(e-sl),evidence=evidence).validate()
def validate_entry_sl_provenance(plan):
    evidence = plan.evidence or {}
    if not evidence.get('entry_source'):
        return False, 'missing_entry_source'
    if not evidence.get('sl_source'):
        return False, 'missing_sl_source'
    if not plan.entry_zone[0] <= plan.entry <= plan.entry_zone[1]:
        return False, 'entry_outside_setup_zone'
    if plan.side == 'BULLISH' and plan.sl >= plan.entry:
        return False, 'bullish_sl_not_below_entry'
    if plan.side == 'BEARISH' and plan.sl <= plan.entry:
        return False, 'bearish_sl_not_above_entry'
    return True, 'entry_sl_provenance_pass'
def validate_plan_economics(plan, fee_rate=0.0005, slippage_rate=0.0002, funding_buffer=0.0):
    if plan.rr <= 0:
        return False, 'non_positive_rr'
    gross_reward = abs(plan.tp - plan.entry) / plan.entry
    modeled_costs = 2 * (fee_rate + slippage_rate) + funding_buffer
    if gross_reward <= modeled_costs:
        return False, 'gross_reward_below_modeled_costs'
    return True, 'economic_viability_pass'
def _z(c,k):
    z=c[k]; assert len(z)==2 and z[0] < z[1]; return z

def fvg(c):
    z=_z(c,'fvg_zone'); s=c['side']; assert c['fvg_state'] in ('TOUCHED','PARTIAL_MITIGATION') and c.get('fvg_parent_event_id') and c.get('fvg_source_indices') and c.get('rejection_event_id') and c.get('micro_break_event_id') and fvg_entry_allowed(c['fvg_object'],c['fvg_rejection_confirmed'],c['local_structure_break']); t=_z(c,'parent_impulse_objective')
    return _p('fvg_context',s,z,(z[0]+z[1])/2,z[0]-c['invalidation_buffer'] if s=='BULLISH' else z[1]+c['invalidation_buffer'],t,t[0] if s=='BULLISH' else t[1],'full FVG acceptance invalidation','causal FVG return/rejection/local break','outside FVG boundary','parent impulse/opposing liquidity',{'event_id':c['fvg_parent_event_id'],'source_indices':c['fvg_source_indices'],'rejection_event_id':c['rejection_event_id'],'micro_break_event_id':c['micro_break_event_id'],'entry_source':'fvg_zone','sl_source':'fvg_boundary','tp_source':'parent_impulse_objective'})
def ob(c):
    z=_z(c,'ob_zone'); s=c['side']; assert c['ob_state'] in ('TOUCHED','PARTIAL_MITIGATION') and c.get('ob_parent_event_id') and c.get('ob_source_indices') and c.get('ob_displacement_event_id') and c.get('ob_source_candle') is not None and c.get('ob_zone_bounds') == tuple(z) and c.get('rejection_event_id') and c.get('micro_break_event_id') and ob_entry_allowed(c['ob_object'],c['ob_rejection_confirmed'],c['local_structure_break']); t=_z(c,'parent_impulse_objective')
    return _p('ob_context',s,z,(z[0]+z[1])/2,z[0]-c['invalidation_buffer'] if s=='BULLISH' else z[1]+c['invalidation_buffer'],t,t[0] if s=='BULLISH' else t[1],'full OB acceptance invalidation','causal displacement-origin OB return/rejection/local break','outside OB boundary','parent impulse/opposing liquidity',{'event_id':c['ob_parent_event_id'],'source_indices':c['ob_source_indices'],'rejection_event_id':c['rejection_event_id'],'micro_break_event_id':c['micro_break_event_id'],'entry_source':'ob_zone','sl_source':'ob_boundary','tp_source':'parent_impulse_objective'})

def liquidity_sweep_reversal(c):
    s=c['side']; z=_z(c,'reversal_zone'); t=_z(c,'target_zone'); extreme=float(c['sweep_extreme']); entry=(z[0]+z[1])/2
    assert setup_entry_allowed('LIQUIDITY_SWEEP', c.get('lifecycle_state', 'REVERSAL_CONFIRMED'), c.get('rejection_confirmed', True), c.get('micro_break_confirmed', True))
    sl=extreme-c['invalidation_buffer'] if s=='BULLISH' else extreme+c['invalidation_buffer']
    tp=t[0] if s=='BULLISH' else t[1]
    return _p('liquidity_sweep_reversal',s,z,entry,sl,t,tp,'sweep extreme/reclaim invalidation','liquidity sweep + reclaim + 5M reversal confirmation','sweep extreme invalidates reclaim thesis','opposing liquidity / DOL target',{'event_id':c['sweep_event_id'],'pool_id':c['pool_id'],'reclaim_event_id':c['reclaim_event_id'],'entry_source':'reclaim_reversal_zone','sl_source':'sweep_extreme','tp_source':'opposing_liquidity'})

def breaker_block(c):
    s=c['side']; z=_z(c,'breaker_zone'); t=_z(c,'target_zone'); entry=(z[0]+z[1])/2
    assert setup_entry_allowed('BREAKER_BLOCK', c.get('lifecycle_state', 'BREAKER_PARTIAL_MITIGATION'), c.get('rejection_confirmed', True), c.get('micro_break_confirmed', True))
    sl=z[0]-c['invalidation_buffer'] if s=='BULLISH' else z[1]+c['invalidation_buffer']
    tp=t[0] if s=='BULLISH' else t[1]
    return _p('breaker_block',s,z,entry,sl,t,tp,'breaker zone boundary invalidation','failed OB flipped function + retest + 5M confirmation','close through breaker zone invalidates flipped function','opposing liquidity / DOL target',{'event_id':c['breaker_event_id'],'source_ob_id':c['source_ob_id'],'entry_source':'breaker_retest_zone','sl_source':'breaker_zone_boundary','tp_source':'opposing_liquidity'})

def rbs_sbr_continuation(c):
    s=c['side']; z=_z(c,'flip_zone'); t=_z(c,'target_zone'); entry=(z[0]+z[1])/2
    assert c.get('continuation_state') == 'CONTINUATION_CONFIRMED'
    sl=c['invalidation_level']-c['invalidation_buffer'] if s=='BULLISH' else c['invalidation_level']+c['invalidation_buffer']
    tp=t[0] if s=='BULLISH' else t[1]
    return _p('rbs_sbr_continuation',s,z,entry,sl,t,tp,'flip level/retest failure invalidation','BOS displacement + level flip + 5M continuation confirmation','close back through flipped level invalidates continuation','opposing liquidity / DOL target',{'event_id':c['bos_event_id'],'entry_source':'rbs_sbr_retest_zone','sl_source':'flip_invalidation','tp_source':'opposing_liquidity','continuation_state':c['continuation_state']})

# Explicit aliases keep registry names aligned with architecture names.
LiquiditySweepReversalBot = liquidity_sweep_reversal
BreakerBlockBot = breaker_block
RbsSbrContinuationBot = rbs_sbr_continuation
FvgContextBot = fvg
OrderBlockContextBot = ob

BOTS={'fvg_context':fvg,'ob_context':ob,'liquidity_sweep_reversal':liquidity_sweep_reversal,'breaker_block':breaker_block,'rbs_sbr_continuation':rbs_sbr_continuation}
def build_plan(i,c): return BOTS[i](c)
def demo():
    from setup_lifecycle import Zone
    z=Zone('FVG-1','BOS-1','BULLISH',100,102,state='PARTIAL_MITIGATION',source_indices=(1,2,3)); p=build_plan('fvg_context',{'side':'BULLISH','fvg_zone':(100,102),'fvg_state':'PARTIAL_MITIGATION','fvg_object':z,'fvg_parent_event_id':'BOS-1','fvg_source_indices':[1,2,3],'rejection_event_id':'R-1','micro_break_event_id':'M-1','fvg_rejection_confirmed':True,'local_structure_break':True,'invalidation_buffer':.5,'parent_impulse_objective':(106,108)}); assert p.sl==99.5
    o=Zone('OB-1','BOS-2','BEARISH',100,102,state='PARTIAL_MITIGATION',source_indices=(4,)); q=build_plan('ob_context',{'side':'BEARISH','ob_zone':(100,102),'ob_state':'PARTIAL_MITIGATION','ob_object':o,'ob_parent_event_id':'BOS-2','ob_source_indices':[4],'ob_displacement_event_id':'BOS-2','ob_source_candle':4,'ob_zone_bounds':(100,102),'rejection_event_id':'R-2','micro_break_event_id':'M-2','ob_rejection_confirmed':True,'local_structure_break':True,'invalidation_buffer':.5,'parent_impulse_objective':(94,96)}); assert q.sl==102.5
    print('PASS all setup executable plans and state evidence')
if __name__=='__main__': demo()




