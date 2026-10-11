"""Read-only Binance Demo WebSocket kline observer with one reconnect."""
import asyncio, json, time
from pathlib import Path
import websockets
ROOT=Path(__file__).resolve().parents[2]; ART=ROOT/'v2'/'artifacts'; BASE='wss://demo-fstream.binance.com/stream'
SYMBOLS=('btcusdt','ethusdt','solusdt','xauusdt'); INTERVALS=('1m','5m')
async def read_connection(seconds=8):
    streams='/'.join(f'{s}@kline_{i}' for s in SYMBOLS for i in INTERVALS)
    uri=f'{BASE}?streams={streams}'; messages=[]; closed=0; deadline=time.monotonic()+seconds
    async with websockets.connect(uri,open_timeout=10,close_timeout=3,ping_interval=20) as ws:
        while time.monotonic()<deadline:
            try: raw=await asyncio.wait_for(ws.recv(),timeout=max(.1,deadline-time.monotonic()))
            except asyncio.TimeoutError: break
            data=json.loads(raw).get('data',{}); k=data.get('k',{})
            if k: messages.append({'symbol':data.get('s'),'interval':k.get('i'),'closed':bool(k.get('x')),'event_time':data.get('E')})
    return messages
async def main_async():
    attempts=[]
    for attempt in range(2):
        started=int(time.time()*1000)
        try: messages=await read_connection()
        except Exception as error: attempts.append({'attempt':attempt+1,'status':'ERROR','error':type(error).__name__+': '+str(error)}); continue
        attempts.append({'attempt':attempt+1,'status':'PASS','started_at':started,'messages':len(messages),'symbols':sorted({x['symbol'] for x in messages if x['symbol']}),'closed_messages':sum(x['closed'] for x in messages)})
    passed=any(x['status']=='PASS' for x in attempts) and any(x.get('messages',0)>0 for x in attempts)
    out={'name':'BINANCE_DEMO_WEBSOCKET_OBSERVATION','status':'PASS' if passed else 'BLOCKED','environment':'demo-fstream','attempts':attempts,'reconnect_attempted':len(attempts)>1,'orders_sent':False,'withdrawals_sent':False}
    (ART/'BINANCE_DEMO_WEBSOCKET_OBSERVATION.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out,indent=2))
    return 0 if passed else 1
if __name__=='__main__': raise SystemExit(asyncio.run(main_async()))
