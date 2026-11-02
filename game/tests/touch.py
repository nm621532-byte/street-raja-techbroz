#!/usr/bin/env python3
"""Street Raja phone playtest with REAL touch events (Chrome DevTools touch input, 915x412 landscape phone).
Plays the actual UI: PLAY button, left-thumb joystick walk, right-side camera swipe, ENTER car, GAS / BRAKE / HORN,
exit, JUMP / PUNCH, map button, pause menu, Character Creator open + save, resume.
Usage: python3 tests/touch.py [url] [preset]    (default: serves ./dist, preset low)"""
import sys, json, time, asyncio, subprocess, os, socket
from playwright.async_api import async_playwright
UA = 'Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
async def main(url, q):
    out = {}; errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 915, 'height': 412}, has_touch=True, is_mobile=True, user_agent=UA)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        cdp = await ctx.new_cdp_session(pg)
        async def touch(typ, pts): await cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts]})
        async def center(js): return await pg.evaluate("(()=>{const e=" + js + "; if(!e) return null; const r=e.getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]})()")
        async def hold(idv, sec=0.35):
            c = await center(f"[...document.querySelectorAll('.btn')].find(e=>e.dataset.id==={json.dumps(idv)}&&e.offsetParent)")
            if not c: return False
            await touch('touchStart', [(5, c)]); await asyncio.sleep(sec); await touch('touchEnd', []); return True
        async def tap_text(t):
            c = await center(f"[...document.querySelectorAll('button,div')].filter(e=>e.offsetParent&&e.children.length===0&&e.textContent.trim().startsWith({json.dumps(t)})).pop()")
            if c: await pg.touchscreen.tap(*c)
            return bool(c)
        ev = lambda js: pg.evaluate(js)
        await pg.goto(url + ('&' if '?' in url else '?') + 'q=' + q, timeout=180000)
        t0 = time.time()
        while time.time() - t0 < 180 and (await ev('window.__frames||0')) < 3: await asyncio.sleep(1)
        out['loadSeconds'] = round(time.time() - t0, 1)
        out['playTapped'] = await tap_text('PLAY'); await asyncio.sleep(2)
        P = "(()=>{const p=__game.game.player.pos; return [p.x,p.z]})()"
        a = await ev(P); await touch('touchStart', [(0, (110, 300))])
        for k in range(6): await touch('touchMove', [(0, (110, 300 - 10 * (k + 1)))]); await asyncio.sleep(0.05)
        await asyncio.sleep(6); await touch('touchEnd', []); b2 = await ev(P)
        out['joystickWalk_m'] = round(((a[0] - b2[0]) ** 2 + (a[1] - b2[1]) ** 2) ** 0.5, 1)
        yaw0 = await ev('__game.game.camYaw||0'); await touch('touchStart', [(1, (650, 150))])
        for k in range(8): await touch('touchMove', [(1, (650 - 20 * (k + 1), 150))]); await asyncio.sleep(0.05)
        await touch('touchEnd', []); out['cameraSwipe'] = (await ev('__game.game.camYaw||0')) != yaw0
        await ev("(()=>{const g=__game.game; g.player.pos.set(g.hero.pos.x+2.2,0.16,g.hero.pos.z)})()"); await asyncio.sleep(1)
        await hold('Enter'); await asyncio.sleep(2); out['enterCar'] = await ev('!!__game.game.player.vehicle')
        V = "(()=>{const v=__game.game.player.vehicle; return v?[v.pos.x,v.pos.z,v.speed]:[0,0,0]})()"
        a = await ev(V); await hold('Gas', 8); b2 = await ev(V)
        out['gasDrive_m'] = round(((a[0] - b2[0]) ** 2 + (a[1] - b2[1]) ** 2) ** 0.5, 1); out['topSpeed_kmh'] = round(abs(b2[2]) * 3.6)
        await hold('Brake', 4); out['brakeSpeed_kmh'] = round(abs((await ev(V))[2]) * 3.6)
        out['horn'] = await hold('Horn'); await hold('Enter'); await asyncio.sleep(2); out['exitCar'] = await ev('!__game.game.player.vehicle')
        out['jump'] = await hold('Jump'); out['punch'] = await hold('Punch')
        await pg.touchscreen.tap(126, 26); await asyncio.sleep(1.5)
        out['mapOpens'] = await ev("[...document.querySelectorAll('div')].some(e=>e.offsetParent&&/tap to close/.test(e.textContent)&&e.children.length===0)")
        await pg.touchscreen.tap(126, 26); await asyncio.sleep(0.8)
        await pg.touchscreen.tap(31, 26); await asyncio.sleep(1); out['pauseMenu'] = await tap_text('👕 CHARACTER BANAO')
        await asyncio.sleep(3); out['creatorOpens'] = await ev('!!(__game.creator&&__game.creator.active)')
        if out['creatorOpens']: await ev('__game.creator.close(true)'); await asyncio.sleep(1)
        out['avatarSaved'] = await ev("!!localStorage.getItem('sr_avatar')")
        if await tap_text('RESUME'): await asyncio.sleep(1)
        out['fps_swiftshader'] = await ev('window.__fps||0')
        await pg.screenshot(path='/tmp/touch_final.jpg', type='jpeg', quality=80); await b.close()
    out['pageErrors'] = errors[:5]
    ok = out['joystickWalk_m'] > 2 and out['enterCar'] and out['gasDrive_m'] > 10 and out['exitCar'] and out['mapOpens'] and out['creatorOpens'] and not errors
    print(json.dumps(out, indent=1)); print('TOUCH', 'PASS' if ok else 'FAIL'); return ok
if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith('http') else None; q = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].startswith('http') else 'low'; srv = None
    if not target:
        s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1); target = f'http://127.0.0.1:{port}/'
    try: ok = asyncio.run(main(target, q))
    finally:
        if srv: srv.kill()
    sys.exit(0 if ok else 1)
