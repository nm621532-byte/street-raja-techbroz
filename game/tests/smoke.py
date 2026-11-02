#!/usr/bin/env python3
"""Street Raja smoke test (run before every publish).
Serves dist/ (or tests a live URL), boots the game headless, then drives the real game loop:
walk, enter a car, drive, brake, exit, crime -> police chase -> busted, start + pass a mission, traffic + peds alive, save written.
Usage:  python3 tests/smoke.py            (tests ./dist)
        python3 tests/smoke.py https://street-raja.sites.tab.bot/
"""
import sys, json, time, asyncio, subprocess, os, socket
from playwright.async_api import async_playwright

CHECK = r"""(()=>{const G=window.__game, g=G.game, pl=g.player, out={}, errs=[]; try{
 __step(60,{my:1}); out.walked = pl.pos.distanceTo(new G.THREE.Vector3(-32.8,0.16,-18)) > 3;
 pl.pos.set(g.hero.pos.x+2.2,0.16,g.hero.pos.z); __step(1,{enter:true}); out.enteredCar = !!pl.vehicle;
 const v = pl.vehicle; const p0 = v.pos.clone(); __step(90,{gas:true}); out.drove = v.pos.distanceTo(p0) > 15;
 __step(90,{brake:true}); __step(1,{enter:true}); __step(90,{}); out.exitedCar = !pl.vehicle;
 g.crime(2); __step(60,{}); out.policeCame = g.police.length > 0;
 __step(400,{}); out.busted = g.police.length === 0 && g.wanted === 0;
 pl.pos.copy(g.shopPos); __step(2,{}); out.shopOpens = G.creator.active; if (G.creator.active) G.creator.close(true); out.avatarSaved = !!localStorage.getItem('sr_avatar'); pl.pos.x += 8; __step(2,{});
 const d = g.missionDefs[0]; pl.pos.copy(d.start); __step(3,{}); out.missionStarted = !!g.mission;
 if (g.mission && g.mission.goal) { const car = g.traffic.cars.find(c=>c.ai&&c.ai.mode==='lane'); if (car) { pl.pos.set(car.pos.x+1,0.16,car.pos.z); __step(1,{enter:true}); }
   if (pl.vehicle) { pl.vehicle.pos.set(g.mission.goal.x,0,g.mission.goal.z); __step(3,{}); } }
 out.missionPassed = !!g.done.mithai;
 out.traffic = g.traffic.cars.filter(c=>c.ai&&(c.ai.mode==='lane'||c.ai.mode==='turn')).length > 3;
 out.peds = g.peds.list.length > 3;
 out.saved = !!localStorage.getItem('sr_save');
 out.chunks = G.city.chunks.size > 4;
}catch(e){errs.push(String(e.stack||e).slice(0,400))} out.errs=errs; return JSON.stringify(out);})()"""

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

async def main(url):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 640, 'height': 360}); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        await pg.goto(url + ('&' if '?' in url else '?') + 'q=low&capture=1&fresh', timeout=120000)
        t0 = time.time()
        while time.time() - t0 < 180 and (await pg.evaluate('window.__frames||0')) < 3 and not errors: await asyncio.sleep(1)
        res = json.loads(await pg.evaluate(CHECK))
        await b.close()
    res['pageErrors'] = errors[:5]
    ok = all(v for k, v in res.items() if k not in ('errs', 'pageErrors')) and not res['errs'] and not errors
    print(json.dumps(res, indent=1)); print('SMOKE', 'PASS' if ok else 'FAIL'); return ok

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else None; srv = None
    if not target:
        port = free_port(); root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        time.sleep(1.5); target = f'http://127.0.0.1:{port}/'
    try: ok = asyncio.run(main(target))
    finally:
        if srv: srv.kill()
    sys.exit(0 if ok else 1)
