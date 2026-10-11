from dataclasses import dataclass

FVG_STATES=('ACTIVE','TOUCHED','PARTIAL_MITIGATION','MITIGATED','INVALIDATED','EXPIRED')
OB_STATES=('ACTIVE','TOUCHED','PARTIAL_MITIGATION','FULL_MITIGATION','INVALIDATED','EXPIRED')

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
