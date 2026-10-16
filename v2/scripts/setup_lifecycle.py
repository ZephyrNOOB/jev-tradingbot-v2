from dataclasses import dataclass

FVG_STATES=('ACTIVE','TOUCHED','PARTIAL_MITIGATION','MITIGATED','INVALIDATED','EXPIRED')
OB_STATES=('ACTIVE','TOUCHED','PARTIAL_MITIGATION','FULL_MITIGATION','INVALIDATED','EXPIRED')
BREAKER_STATES=('OB_ACTIVE','OB_INVALIDATED','BREAKER_CANDIDATE','BREAKER_CONFIRMED','BREAKER_TOUCHED','BREAKER_PARTIAL_MITIGATION','BREAKER_INVALIDATED','BREAKER_EXPIRED')
SWEEP_STATES=('SWEEP_CONFIRMED','RECLAIM_CONFIRMED','REVERSAL_CONFIRMED','SWEEP_INVALIDATED','SWEEP_EXPIRED')


def setup_lifecycle_state(kind, current, *, touched=False, rejected=False, invalidated=False):
    if kind == 'BREAKER_BLOCK':
        if invalidated: return 'BREAKER_INVALIDATED'
        if rejected: return 'BREAKER_PARTIAL_MITIGATION'
        if touched: return 'BREAKER_TOUCHED'
        return current if current in BREAKER_STATES else 'BREAKER_CONFIRMED'
    if kind == 'LIQUIDITY_SWEEP':
        if invalidated: return 'SWEEP_INVALIDATED'
        if rejected: return 'REVERSAL_CONFIRMED'
        if touched: return 'RECLAIM_CONFIRMED'
        return current if current in SWEEP_STATES else 'SWEEP_CONFIRMED'
    return current


def setup_entry_allowed(kind, state, rejection, micro_break):
    if kind == 'BREAKER_BLOCK':
        return state in ('BREAKER_TOUCHED','BREAKER_PARTIAL_MITIGATION') and rejection and micro_break
    if kind == 'LIQUIDITY_SWEEP':
        return state in ('RECLAIM_CONFIRMED','REVERSAL_CONFIRMED') and rejection and micro_break
    return False


@dataclass
class Zone:
    object_id:str; parent_event_id:str; side:str; low:float; high:float; state:str='ACTIVE'; touches:int=0; source_indices:tuple=()
    def update(self, candle, close, rejection=False):
        assert self.low < self.high
        inside=candle['high'] >= self.low and candle['low'] <= self.high
        against=(self.side=='BULLISH' and close < self.low) or (self.side=='BEARISH' and close > self.high)
        if against: self.state='INVALIDATED'; return self.state
        if inside:
            self.touches+=1
            if self.state=='ACTIVE': self.state='TOUCHED'
            if rejection and self.state=='TOUCHED': self.state='PARTIAL_MITIGATION'
        return self.state

def fvg_entry_allowed(z, rejection, micro_break):
    return z.state in ('TOUCHED','PARTIAL_MITIGATION') and rejection and micro_break

def ob_entry_allowed(z, rejection, micro_break):
    return z.state in ('TOUCHED','PARTIAL_MITIGATION') and rejection and micro_break

def demo():
    z=Zone('FVG-1','BOS-1','BULLISH',100,102,source_indices=(1,2,3))
    assert z.update({'high':101,'low':99},101)== 'TOUCHED'
    assert z.update({'high':101,'low':100.5},101,True)=='PARTIAL_MITIGATION'
    assert fvg_entry_allowed(z,True,True)
    assert z.update({'high':103,'low':99},99)=='INVALIDATED'
    print('PASS FVG/OB shared lifecycle transitions and entry gate')
if __name__=='__main__': demo()
