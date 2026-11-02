#!/usr/bin/env python3
# Records the Street Raja v0.1 gameplay clip from the REAL build (dist/), frame by frame, 1920x1080 @30fps.
import asyncio, json, os, subprocess, sys, time, socket
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)); DIST = os.path.join(ROOT, 'game', 'dist'); OUT = os.path.join(ROOT, '_rec2'); os.makedirs(OUT, exist_ok=True)
O = -378; P = 84
AUTO = """(()=>{window.__auto=(g,inp,dt)=>{const v=g.player.vehicle; if(!v||!window.__drive) return; const D=window.__drive; const isX=Math.abs(Math.sin(D.th))>0.5; const e=isX?(v.pos.z-D.lat):(v.pos.x-D.lat); let dh=v.heading-D.th; while(dh>Math.PI)dh-=2*Math.PI; while(dh<-Math.PI)dh+=2*Math.PI;
 const sgn = isX ? (Math.sin(D.th)>0?1:-1) : (Math.cos(D.th)>0?-1:1); inp.steer=Math.max(-1,Math.min(1, sgn*e*0.1 - dh*2.0)); inp.gas=v.speed<D.v; inp.brake=false; inp.handbrake=false;
 if (window.__camFn) window.__cam = window.__camFn(g); }; })()"""
STAGE = "{const t=__game.game.traffic, car=__game.game.hero; const line=4, axis='x';\n const pool=t.cars.filter(c=>c!==car && !t.parked.includes(c) && c.ai && c.ai.mode!=='empty' && c.ai.mode!=='chase');\n const autos=pool.filter(c=>c.type==='auto'), others=pool.filter(c=>c.type!=='auto');\n const pick=[autos[0],others[0],autos[1],others[1],others[2],autos[2],others[3],others[4]].filter(Boolean);\n const plan=[[1,16],[1,33],[-1,9],[-1,24],[-1,41],[1,50],[-1,58],[1,70]];\n pick.forEach((v,i)=>{const [d,ds]=plan[i]; const s=car.pos.x+ds; const lat=t.laneLat(axis,line,d,0); const seg=Math.floor((s+378)/84);\n  v.ai={axis,line,d,k:0,s,mode:'lane',speed:7,target:d>0?8.5:9,nextIdx:d>0?seg+1:seg,path:null,pi:0,honk:0,stuck:0}; v.kinematic=true; v.place(s,lat,d>0?Math.PI/2:-Math.PI/2); v.root.visible=true; });\n }"
def car_setup(x, z, th, lat, v, t, extra=''):
    return f"""(()=>{{const G=__game, g=G.game, pl=g.player; if(pl.vehicle) g.exitVehicle(true); g.clearWanted(); window.__cam=null; window.__camFn=null; G.env.time={t};
      const car=g.hero; car.health=100; car.dead=false; car.place({x},{z},{th}); car.ai={{mode:'empty'}}; pl.pos.set({x},0.16,{z}); g.enterVehicle(car); car.vel.set(Math.sin({th})*{v},Math.cos({th})*{v}); car.speed={v};
      g.camYaw={th}; g.camInit=false; g.camMode=0; window.__drive={{th:{th}, lat:{lat}, v:{v}}}; G.city.stream(pl.pos,0,true); G.traffic.populate && 0; {extra} }})()"""
SHOTS = [
  # A: Ratnapur main street, golden hour
  ('ratnapur', car_setup(-360, O + 4 * P - 1.75, 1.5708, O + 4 * P - 1.75, 9, 16.95, extra=STAGE), 240),
  # B: NH-44 towards Sonapur Bazaar gate
  ('highway', car_setup(870, O + 4 * P - 1.75, 1.5708, O + 4 * P - 1.75, 25, 17.55), 180),
  # C: on foot in the Sonapur bazaar at dusk under the bunting
  ('bazaar', f"""(()=>{{const G=__game, g=G.game, pl=g.player; if(pl.vehicle) g.exitVehicle(true); g.clearWanted(); window.__drive=null; window.__cam=null; window.__camFn=null; G.env.time=18.35;
      pl.pos.set({O + 19 * P + 9.2},0.16,{O + 3 * P + 12}); pl.heading=0; g.camYaw=0; g.camPitch=0.12; g.camInit=false; g.camMode=1; G.city.stream(pl.pos,0,true); }})()""", 180),
  # D: night police chase, cinematic front camera
  ('chase', car_setup(-300, O + 2 * P - 1.75, 1.5708, O + 2 * P - 1.75, 20, 20.6,
     extra="""G.game.traffic.cars.forEach(o=>{ if (Math.abs(o.pos.z-car.pos.z)<12 && o.pos.x>car.pos.x-5 && o.pos.x<car.pos.x+200) G.game.traffic.resetAI(o, {x:car.pos.x-320, z:car.pos.z+320}); }); g.crime(3); g.wanted=3; g.updatePolice(0.01); g.police.forEach((pv,i)=>{ pv.place(car.pos.x-18-i*12, car.pos.z+(i%2?2:-1), 1.5708); pv.vel.set(20,0); pv.speed=20; });
       window.__camFn=(g)=>{const v=g.player.vehicle; const f=v.forward; return {p:[v.pos.x+f.x*10+f.z*4.5, 2.3, v.pos.z+f.z*10-f.x*4.5], t:[v.pos.x-f.x*8, 1.0, v.pos.z-f.z*8], fov:50};};"""), 180),
]
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
async def main():
    port = free_port(); srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(1.5)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': 1920, 'height': 1080})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(f'http://127.0.0.1:{port}/?q=high&capture=1&fresh&fixedres', timeout=180000)
            while (await pg.evaluate('window.__frames||0')) < 3: await asyncio.sleep(1)
            await pg.evaluate('window.__rec=true'); await pg.evaluate(AUTO)
            await pg.add_style_tag(content='.toast,.prompt{display:none!important}')
            n = 0; only = sys.argv[1:] 
            for name, setup, frames in SHOTS:
                if only and name not in only: continue
                await pg.evaluate(setup)
                for _ in range(25): await pg.evaluate('__frame()')   # settle camera, traffic, streaming
                for f in range(frames):
                    await pg.evaluate("__frame(" + ("{my:1}" if name == 'bazaar' else "{}") + "); (()=>{const gl=__game.renderer.getContext(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));})()")
                    await pg.screenshot(path=os.path.join(OUT, f'{name}_{f:04d}.jpg'), quality=92, timeout=120000)
                    n += 1
                    if f % 30 == 0: print(name, f, time.strftime('%H:%M:%S'), flush=True)
            print('ERRS', errs[:5]); await b.close()
    finally:
        srv.kill()
    print('FRAMES', n, flush=True)
asyncio.run(main())
