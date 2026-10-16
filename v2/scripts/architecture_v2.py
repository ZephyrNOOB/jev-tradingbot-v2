import csv, json, os
from bisect import bisect_right
from pathlib import Path
from dataclasses import dataclass, asdict
from collections import defaultdict
from continuation_transition import ContinuationEvent
from market_structure_authoritative import build_events as build_authoritative_events
from confirmation_5m_authoritative import continuation_confirmation, zone_confirmation, five_min_micro_breaks

BOTS = ('fvg_context','ob_context','liquidity_sweep_reversal','breaker_block','rbs_sbr_continuation')
ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ['V2_DATA_DIR']) if os.environ.get('V2_DATA_DIR') else ROOT / 'v2' / 'data'

@dataclass
class Event:
    event_id: str
    kind: str
    side: str
    index: int
    state: str
    source_indices: list
    previous_state: str = ""
    protected_level: float = 0.0
    broken_level: float = 0.0
    protected_swing_id: str = ''
    parent_event_id: str = ''
    object_id: str = ''
    lifecycle: str = 'active'
    continuation_object: object = None
    zone_low: float = 0.0
    zone_high: float = 0.0
    ob_source_index: int = -1
    ob_zone_low: float = 0.0
    ob_zone_high: float = 0.0
    ob_object_id: str = ''
    displacement_atr: float = 0.0
    structure_layer: str = 'SWING'
    level_classification: str = ''
    pool_id: str = ''
    sweep_level: float = 0.0
    sweep_extreme: float = 0.0
    reclaim_index: int = -1
    breaker_source_ob_id: str = ''
    flip_level: float = 0.0
    lifecycle_state: str = 'ACTIVE'


def validate_structure_event_contract(event):
    """Validate BOS/CHoCH/MSS evidence; never creates a trade plan."""
    if event.kind not in ('BOS', 'CHoCH_MSS', 'LIQUIDITY_SWEEP', 'BREAKER_BLOCK'):
        return []
    errors=[]
    if event.side not in ('LONG', 'SHORT'): errors.append('invalid_side')
    if event.kind in ('BOS', 'CHoCH_MSS') and not event.previous_state: errors.append('missing_previous_state')
    if event.kind == 'CHoCH_MSS' and (not event.protected_swing_id or event.protected_level <= 0): errors.append('missing_protected_swing')
    if event.broken_level <= 0: errors.append('missing_break_level')
    if event.kind in ('BOS', 'CHoCH_MSS') and event.displacement_atr <= 0: errors.append('missing_displacement')
    if event.kind in ('LIQUIDITY_SWEEP', 'BREAKER_BLOCK') and (event.zone_low <= 0 or event.zone_high <= event.zone_low): errors.append('missing_setup_zone')
    if any(i > event.index for i in event.source_indices): errors.append('future_source_index')
    return errors
def load_csv(path):
    with open(path, newline='') as f:
        return [{k: float(r[k]) for k in ('open','high','low','close','volume')} | {'taker_buy_volume': float(r.get('taker_buy_volume', r['volume'])), 'open_time': int(float(r['open_time'])), 'close_time': int(float(r['close_time']))} for r in csv.DictReader(f)]


def pivots(bars, w=2):
    hs, ls = [], []
    for i in range(w, len(bars)-w):
        if all(bars[i]['high'] > bars[j]['high'] for j in range(i-w, i+w+1) if j != i): hs.append((i, bars[i]['high'], i+w))
        if all(bars[i]['low'] < bars[j]['low'] for j in range(i-w, i+w+1) if j != i): ls.append((i, bars[i]['low'], i+w))
    return hs, ls

class MarketBiasBot:
    def __init__(self, bars):
        self.bars = bars; self.confirmed = []
        hs=[]; ls=[]
        for i in range(2, len(bars)):
            p=i-2
            if p>=2:
                if all(bars[p]['high']>bars[j]['high'] for j in range(p-2,p+3) if j!=p): hs.append((p,bars[p]['high']))
                if all(bars[p]['low']<bars[j]['low'] for j in range(p-2,p+3) if j!=p): ls.append((p,bars[p]['low']))
            self.confirmed.append((i,hs[:],ls[:]))
        self.confirmed_indices = [x[0] for x in self.confirmed]
    def at(self, i):
        pos = bisect_right(self.confirmed_indices, i) - 1
        hs, ls = self.confirmed[pos][1:] if pos >= 0 else ([], [])
        if len(hs)<2 or len(ls)<2:return {'state':'UNKNOWN','valid':False,'reason':'insufficient_closed_structure'}
        bull=hs[-1][1]>hs[-2][1] and ls[-1][1]>ls[-2][1]; bear=hs[-1][1]<hs[-2][1] and ls[-1][1]<ls[-2][1]
        state='BULLISH' if bull else 'BEARISH' if bear else 'RANGE'; protected=ls[-1][1] if bull else hs[-1][1] if bear else None
        return {'state':state,'valid':state in ('BULLISH','BEARISH'),'protected':protected,'source_indices':[x[0] for x in (hs[-2:],ls[-2:]) for x in x],'reason':'HH_HL' if bull else 'LH_LL' if bear else 'conflict'}

class MarketStructureBot:
    def __init__(self, bars, symbol="UNKNOWN"): self.bars = bars; self.symbol = symbol
    def build(self):
        events=[]
        for raw in build_authoritative_events(self.bars, symbol=self.symbol):
            direction='BULLISH' if raw.side=='LONG' else 'BEARISH' if raw.side=='SHORT' else raw.side
            continuation = ContinuationEvent(raw.event_id, direction, raw.broken_level, tuple(raw.source_indices), invalidation_level=raw.protected_level or raw.broken_level) if raw.kind == 'BOS' else None
            candidate = Event(event_id=raw.event_id, kind=raw.kind, side=raw.side or '', index=raw.index, state=raw.state, source_indices=raw.source_indices, previous_state=raw.previous_state or "", protected_level=raw.protected_level or 0.0, broken_level=raw.broken_level or 0.0, protected_swing_id=raw.protected_swing_id or '', parent_event_id=raw.parent_event_id or '', object_id=raw.object_id or raw.event_id, lifecycle='active', continuation_object=continuation, zone_low=raw.zone_low or 0.0, zone_high=raw.zone_high or 0.0, ob_source_index=raw.ob_source_index, ob_zone_low=raw.ob_zone_low or 0.0, ob_zone_high=raw.ob_zone_high or 0.0, ob_object_id=f'OB-{raw.event_id}' if raw.ob_source_index >= 0 else '', displacement_atr=raw.displacement_atr or 0.0, structure_layer=getattr(raw, 'structure_layer', 'SWING'), level_classification=getattr(raw, 'level_classification', ''), pool_id=getattr(raw, 'pool_id', '') or '', sweep_level=getattr(raw, 'sweep_level', 0.0) or 0.0, sweep_extreme=getattr(raw, 'sweep_extreme', 0.0) or 0.0, reclaim_index=getattr(raw, 'reclaim_index', -1), breaker_source_ob_id=getattr(raw, 'breaker_source_ob_id', '') or '', flip_level=getattr(raw, 'flip_level', 0.0) or 0.0, lifecycle_state=getattr(raw, 'lifecycle_state', 'ACTIVE'))
            errors = validate_structure_event_contract(candidate)
            if errors: raise ValueError(f'{candidate.event_id}: {errors}')
            events.append(candidate)
        return events

class ConfirmationBot:
    def __init__(self, bars, symbol="UNKNOWN"):
        self.bars=bars; self.symbol=symbol
        self.close_times=[row.get('close_ts', row.get('close_time', row.get('ts', i))) for i, row in enumerate(bars)]
        self.micro_breaks=five_min_micro_breaks(bars)
    def run(self, event_or_start, side=None, level=None, start=None):
        event = event_or_start if isinstance(event_or_start, Event) else None
        if event is None:
            event = Event(f'legacy-15m-{event_or_start}', 'BOS', side, event_or_start, 'active', [], broken_level=level)
        parent = {'event_id': event.event_id, 'candidate_timestamp': self.bars[start if start is not None else event.index].get('close_time', self.bars[start if start is not None else event.index].get('open_time', start if start is not None else event.index)), 'side': event.side, 'broken_level': event.broken_level, 'protected_level': event.protected_level if event.kind != 'FVG' else None, 'break_annotation': event.kind}
        if event.kind == 'FVG':
            result = zone_confirmation(self.bars, parent, 'fvg_5m_confirmation', {'side': event.side, 'low': event.zone_low, 'high': event.zone_high, 'source_indices': event.source_indices}, micro_breaks=self.micro_breaks, close_times=self.close_times, symbol=self.symbol)
        elif event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low:
            result = zone_confirmation(self.bars, parent, 'ob_5m_confirmation', {'side': event.side, 'low': event.ob_zone_low, 'high': event.ob_zone_high, 'source_index': event.ob_source_index}, micro_breaks=self.micro_breaks, close_times=self.close_times, symbol=self.symbol)
        elif event.kind in ('BREAKER_BLOCK', 'LIQUIDITY_SWEEP') and event.zone_high > event.zone_low:
            result = zone_confirmation(self.bars, parent, f'{event.kind.lower()}_5m_confirmation', {'side': event.side, 'low': event.zone_low, 'high': event.zone_high, 'source_indices': event.source_indices}, micro_breaks=self.micro_breaks, close_times=self.close_times, symbol=self.symbol)
        else:
            result = continuation_confirmation(self.bars, parent, micro_breaks=self.micro_breaks, close_times=self.close_times, symbol=self.symbol)
        confirmed = result['confirmation_status'] == 'CONFIRMED'
        continuation_state = 'WAITING'
        if event.kind == 'BOS':
            transition = ContinuationEvent(event.event_id, 'BULLISH' if event.side == 'LONG' else 'BEARISH', event.broken_level, tuple(event.source_indices), invalidation_level=event.protected_level or event.broken_level)
            for offset in result['source_5m_indices']:
                transition.observe(self.bars[offset], offset)
            continuation_state = transition.state
            confirmed = confirmed and continuation_state == 'CONTINUATION_CONFIRMED'
        return {'state':'CONFIRMED' if confirmed else 'WAITING', 'index': result['source_5m_indices'][-1] if confirmed else None, 'source_indices': result['source_5m_indices'], 'reason': result['rejection_reason'] or 'retest_hold_then_micro_break', 'rejection_event_id': result.get('rejection_event_id') or '', 'rejection_source_indices': [result['source_5m_indices'][0]] if result['source_5m_indices'] else [], 'micro_break_event_id': result.get('micro_break_event_id') or '', 'micro_break_source_indices': [result['source_5m_indices'][-1]] if confirmed else [], 'contract_family': result.get('contract_family', 'continuation_5m_confirmation'), 'continuation_state': continuation_state, 'lifecycle_state': result.get('lifecycle_state', 'ACTIVE'), 'zone_bounds': result.get('zone_bounds'), 'touch_event_id': result.get('touch_event_id')}

class SelectionBot:
    WEIGHTS = {'causal': 25, 'structure': 20, 'confirmation': 20, 'liquidity': 15, 'zone_integrity': 10, 'invalidation': 5, 'objective': 5}

    def _profile(self, bot, event, confirmation):
        ob_valid = event.ob_source_index >= 0 and event.ob_zone_high > event.ob_zone_low
        common = {
            'causal': 0, 'structure': 0, 'confirmation': int(confirmation.get('state') == 'CONFIRMED'),
            'liquidity': 0, 'zone_integrity': 0, 'invalidation': 0, 'objective': 0,
        }
        if bot == 'fvg_context':
            evidence = event.kind == 'FVG' and event.zone_high > event.zone_low
            common.update(causal=int(evidence), structure=int(evidence), liquidity=int(bool(event.parent_event_id)), zone_integrity=int(evidence), invalidation=int(evidence), objective=int(bool(event.parent_event_id)))
            reason = 'confirmed_fvg_object'
            directness = int(event.kind == 'FVG')
        elif bot == 'ob_context':
            evidence = ob_valid and event.kind in ('BOS', 'CHoCH_MSS')
            common.update(causal=int(evidence), structure=int(evidence), liquidity=int(bool(event.parent_event_id)), zone_integrity=int(evidence), invalidation=int(evidence), objective=int(bool(event.protected_level)))
            reason = 'confirmed_causal_ob'
            directness = int(ob_valid)
        elif bot == 'liquidity_sweep_reversal':
            evidence = event.kind == 'LIQUIDITY_SWEEP' and bool(event.pool_id) and event.sweep_level > 0 and event.reclaim_index >= event.index
            common.update(causal=int(evidence), structure=int(evidence), liquidity=int(bool(event.pool_id)), zone_integrity=int(event.zone_high > event.zone_low), invalidation=int(bool(event.sweep_extreme)), objective=int(bool(event.protected_level)))
            reason = 'confirmed_sweep_reclaim'
            directness = int(event.kind == 'LIQUIDITY_SWEEP')
        elif bot == 'breaker_block':
            evidence = event.kind == 'BREAKER_BLOCK' and bool(event.breaker_source_ob_id) and event.flip_level > 0
            common.update(causal=int(evidence), structure=int(evidence), liquidity=int(bool(event.parent_event_id)), zone_integrity=int(event.zone_high > event.zone_low), invalidation=int(bool(event.flip_level)), objective=int(bool(event.protected_level)))
            reason = 'confirmed_ob_flip'
            directness = int(event.kind == 'BREAKER_BLOCK')
        else:
            evidence = event.kind == 'BOS' and event.continuation_object is not None and confirmation.get('continuation_state') == 'CONTINUATION_CONFIRMED'
            common.update(causal=int(evidence), structure=int(event.kind == 'BOS'), liquidity=int(bool(event.protected_level)), zone_integrity=int(event.kind == 'BOS'), invalidation=int(bool(event.protected_level)), objective=int(bool(event.protected_level)))
            reason = 'confirmed_bos_retest_continuation'
            directness = int(confirmation.get('continuation_state') == 'CONTINUATION_CONFIRMED')
        score = sum(self.WEIGHTS[k] * common[k] for k in self.WEIGHTS)
        return {'bot': bot, 'eligible': bool(evidence), 'score': score, 'components': common, 'reason': reason, 'directness': directness}

    def select(self, event, bias, confirmation, bar, continuation_state=None):
        direction = 'BULLISH' if event.side == 'LONG' else 'BEARISH' if event.side == 'SHORT' else event.side
        common_reason = None
        if not bias.get('valid') or bias.get('state') != direction:
            common_reason = 'bias_not_confirmed_or_direction_mismatch'
        elif confirmation.get('state') != 'CONFIRMED':
            common_reason = '5m_confirmation_not_confirmed'
        elif getattr(event, 'lifecycle', 'ACTIVE') in ('INVALIDATED', 'EXPIRED', 'MITIGATED', 'FULL_MITIGATION'):
            common_reason = 'event_lifecycle_invalid'
        profiles = [self._profile(bot, event, confirmation) for bot in BOTS]
        eligible = [p for p in profiles if common_reason is None and p['eligible']]
        eligible.sort(key=lambda p: (p['score'], p['directness'], event.index, event.event_id), reverse=True)
        selected = eligible[0]['bot'] if eligible else None
        for profile in profiles:
            profile['eligible'] = bool(common_reason is None and profile['eligible'])
            if common_reason:
                profile['reason'] = common_reason
            elif not profile['eligible']:
                profile['reason'] = 'setup_context_not_owned'
            elif profile['bot'] != selected:
                profile['reason'] = 'contributing_context'
        imb = 2 * bar['taker_buy_volume'] / bar['volume'] - 1 if bar['volume'] else 0
        participation = (direction == 'BULLISH' and imb > .1) or (direction == 'BEARISH' and imb < -.1)
        return {
            'state': 'SELECTION_RESOLVED' if selected else 'NO_SELECTION',
            'selected': selected,
            'primary_owner': selected,
            'candidates': [p['bot'] for p in eligible],
            'contributing_contexts': [p['bot'] for p in eligible if p['bot'] != selected],
            'setup_strength_profiles': profiles,
            'participation_aligned': participation,
            'ledger': profiles,
            'reason': 'deterministic_confluence_owner' if selected else (common_reason or 'no_confirmed_setup_context'),
            'selection_method': 'causal_strength_resolver' if selected else 'common_gate_blocked',
        } # ponytail: equal peer evaluation; score resolves confluence, never global filtering.

# All five peers use same weights and resolver; only causal evidence differs.

class Funding:
    def __init__(self, path):
        self.rows=json.loads(Path(path).read_text()) if Path(path).exists() else []
    def cost(self, open_ms, close_ms, side, notional):
        total=0.0
        for x in self.rows:
            t=int(x.get('fundingTime',x.get('ts',0)))
            if open_ms<=t<=close_ms:
                r=float(x.get('fundingRate',x.get('rate',0)))
                total += notional*r*(1 if side=='SHORT' else -1)
        return total

def as_json(events): return [asdict(x) for x in events]

if __name__=='__main__':
    m=load_csv(DATA/'BTCUSDT-15m.csv'); e=MarketStructureBot(m).build(); assert e and all(x.event_id for x in e); print('PASS architecture_v2 core')













