from dataclasses import dataclass, field

@dataclass
class ContinuationEvent:
    event_id: str
    side: str
    broken_level: float
    break_source_indices: tuple
    retest_source_indices: tuple = ()
    continuation_source_indices: tuple = ()
    state: str = 'BOS_CONFIRMED'
    objective_event_id: str = ''
    invalidation_level: float = 0.0

    def observe(self, candle, index):
        if self.side == 'BULLISH':
            if self.state == 'BOS_CONFIRMED' and candle['low'] <= self.broken_level:
                self.retest_source_indices = (index,)
                self.state = 'RETEST_HELD' if candle['close'] > self.broken_level else 'RETEST_TOUCHED'
            elif self.state == 'RETEST_TOUCHED' and candle['close'] > self.broken_level:
                self.retest_source_indices += (index,)
                self.state = 'RETEST_HELD'
            elif self.state == 'RETEST_HELD' and candle['close'] > candle['open'] and candle['close'] > self.broken_level:
                self.continuation_source_indices = (index,)
                self.state = 'CONTINUATION_CONFIRMED'
            elif self.state in ('RETEST_TOUCHED','RETEST_HELD') and candle['close'] < self.invalidation_level:
                self.state = 'FAILED'
        else:
            if self.state == 'BOS_CONFIRMED' and candle['high'] >= self.broken_level:
                self.retest_source_indices = (index,)
                self.state = 'RETEST_HELD' if candle['close'] < self.broken_level else 'RETEST_TOUCHED'
            elif self.state == 'RETEST_TOUCHED' and candle['close'] < self.broken_level:
                self.retest_source_indices += (index,)
                self.state = 'RETEST_HELD'
            elif self.state == 'RETEST_HELD' and candle['close'] < candle['open'] and candle['close'] < self.broken_level:
                self.continuation_source_indices = (index,)
                self.state = 'CONTINUATION_CONFIRMED'
            elif self.state in ('RETEST_TOUCHED','RETEST_HELD') and candle['close'] > self.invalidation_level:
                self.state = 'FAILED'
        return self.state

def demo():
    c=[{'open':101,'high':102,'low':99,'close':100},{'open':100,'high':101,'low':99.5,'close':100.5},{'open':100.5,'high':103,'low':100.4,'close':102}]
    e=ContinuationEvent('BOS-1','BULLISH',100,(1,),invalidation_level=98)
    for i,x in enumerate(c):e.observe(x,i)
    assert e.state=='CONTINUATION_CONFIRMED' and e.break_source_indices==(1,) and e.continuation_source_indices==(2,)
    print('PASS continuation state identity')
if __name__=='__main__': demo()
