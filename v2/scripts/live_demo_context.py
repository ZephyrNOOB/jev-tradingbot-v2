from setup_lifecycle import Zone

def update_event_lifecycle(event, bars, start, end):
    """Replay closed 5M candles; return live zone plus evidence."""
    side='BULLISH' if event.side=='LONG' else 'BEARISH' if event.side=='SHORT' else event.side
    if event.kind == 'FVG' and event.zone_high > event.zone_low:
        zone = Zone(event.object_id, event.parent_event_id or event.event_id, side,
                    event.zone_low, event.zone_high, source_indices=tuple(event.source_indices))
    elif event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low:
        zone = Zone(event.ob_object_id, event.event_id, side, event.ob_zone_low,
                    event.ob_zone_high, source_indices=(event.ob_source_index,))
    elif event.kind in ('BREAKER_BLOCK', 'LIQUIDITY_SWEEP') and event.zone_high > event.zone_low:
        zone = Zone(event.object_id or event.event_id, event.parent_event_id or event.event_id, side,
                    event.zone_low, event.zone_high, source_indices=tuple(event.source_indices))
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
    return update_event_lifecycle(event, bars, start, end) if event.kind == 'FVG' or event.ob_source_index >= 0 or event.kind in ('BREAKER_BLOCK', 'LIQUIDITY_SWEEP') else None

def select_causal_target(side, entry, pivots, decision_index):
    direction = 'BULLISH' if side in ('LONG', 'BULLISH') else 'BEARISH'
    candidates = [
        {'price': price, 'pivot_index': pivot_index, 'confirmation_index': confirmation_index,
         'source_type': 'confirmed_opposing_swing', 'reason': 'confirmed opposing swing before decision'}
        for pivot_index, price, confirmation_index in pivots
        if confirmation_index <= decision_index and ((direction == 'BULLISH' and price > entry) or (direction == 'BEARISH' and price < entry))
    ]
    return min(candidates, key=lambda target: abs(target['price'] - entry)) if candidates else None
def setup_context(bot, side, event, entry, bars, idx, all_hs, all_ls, confirmation=None, live=None, decision_index=None):
    side='BULLISH' if side=='LONG' else 'BEARISH' if side=='SHORT' else side
    confirmation = confirmation or {}
    decision_index = idx if decision_index is None else decision_index
    hs=[x for x in all_hs if x[2] <= decision_index]; ls=[x for x in all_ls if x[2] <= decision_index]
    buf=max(entry*.0005, (bars[idx]['high']-bars[idx]['low'])*.1)
    target_pivots = hs if side=='BULLISH' else ls
    target_candidates = [x[1] for x in target_pivots if (x[1] > entry if side=='BULLISH' else x[1] < entry)]
    target = select_causal_target(side, entry, target_pivots, decision_index)
    objective=(target['price'], target['price'] + buf) if target and side=='BULLISH' else (target['price'] - buf, target['price']) if target else None
    zone=(entry-buf,entry+buf)
    if bot=='fvg_context' and event.zone_high>event.zone_low and live:
        z, _, _ = live
        rejection = bool(confirmation.get('rejection_event_id'))
        micro = bool(confirmation.get('micro_break_event_id'))
        return {'side':side,'fvg_zone':(event.zone_low,event.zone_high),'fvg_state':z.state,'fvg_object':z,'fvg_parent_event_id':event.parent_event_id or event.event_id,'fvg_source_indices':event.source_indices,'fvg_rejection_confirmed':rejection,'local_structure_break':micro,'rejection_event_id':confirmation.get('rejection_event_id'),'micro_break_event_id':confirmation.get('micro_break_event_id'),'invalidation_buffer':buf,'parent_impulse_objective':objective,'target_evidence':target}
    if bot=='ob_context' and event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low and live:
        z,rejection,micro=live
        return {'side':side,'ob_zone':(event.ob_zone_low,event.ob_zone_high),'ob_state':z.state,'ob_object':z,'ob_parent_event_id':event.event_id,'ob_source_indices':[event.ob_source_index],'ob_displacement_event_id':event.event_id,'ob_source_candle':event.ob_source_index,'ob_zone_bounds':(event.ob_zone_low,event.ob_zone_high),'ob_rejection_confirmed':rejection,'local_structure_break':micro,'rejection_event_id':confirmation.get('rejection_event_id'),'micro_break_event_id':confirmation.get('micro_break_event_id'),'invalidation_buffer':buf,'parent_impulse_objective':objective,'target_evidence':target}
    if bot=='liquidity_sweep_reversal' and event.pool_id and event.sweep_level is not None:
        zone=(event.sweep_level-buf,event.sweep_level+buf)
        return {'side':side,'reversal_zone':zone,'sweep_extreme':event.sweep_extreme or event.broken_level,'invalidation_buffer':buf,'target_zone':objective,'sweep_event_id':event.event_id,'pool_id':event.pool_id,'reclaim_event_id':confirmation.get('rejection_event_id') or event.event_id,'lifecycle_state':'REVERSAL_CONFIRMED' if confirmation.get('micro_break_event_id') else 'RECLAIM_CONFIRMED','rejection_confirmed':bool(confirmation.get('rejection_event_id')),'micro_break_confirmed':bool(confirmation.get('micro_break_event_id'))}
    if bot=='breaker_block' and event.breaker_source_ob_id and event.flip_level is not None:
        zone=(event.zone_low,event.zone_high)
        return {'side':side,'breaker_zone':zone,'invalidation_level':event.flip_level,'invalidation_buffer':buf,'target_zone':objective,'breaker_event_id':event.event_id,'source_ob_id':event.breaker_source_ob_id,'lifecycle_state':'BREAKER_PARTIAL_MITIGATION' if confirmation.get('micro_break_event_id') else 'BREAKER_TOUCHED','rejection_confirmed':bool(confirmation.get('rejection_event_id')),'micro_break_confirmed':bool(confirmation.get('micro_break_event_id')),'continuation_state':confirmation.get('continuation_state', 'WAITING')}
    if bot=='rbs_sbr_continuation' and event.broken_level and event.kind == 'BOS':
        zone=(event.broken_level-buf,event.broken_level+buf)
        return {'side':side,'flip_zone':zone,'invalidation_level':event.protected_level or event.broken_level,'invalidation_buffer':buf,'target_zone':objective,'bos_event_id':event.event_id,'continuation_state':confirmation.get('continuation_state', 'CONTINUATION_CONFIRMED')}
    return None

