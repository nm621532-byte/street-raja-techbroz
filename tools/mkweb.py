#!/usr/bin/env python3
"""Make the web publish folder for street-raja.sites.tab.bot from game/dist.
The site host refuses files over ~850 KB, so every static asset is stored under a versioned folder
(new names = no stale CDN copies) and big ones are split into 800 KB parts. A tiny service worker
joins the parts back on the fly, so the game code loads the same URLs as in the APK."""
import os, sys, json, shutil, subprocess, re, mimetypes
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'game', 'dist'); OUT = os.path.join(ROOT, '_web'); PART = 800 * 1024
V = 'v' + subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=os.path.join(ROOT, 'game'), capture_output=True, text=True).stdout.strip()
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
MT = {'.glb': 'model/gltf-binary', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream', '.json': 'application/json', '.css': 'text/css', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'}
man = {}; nparts = 0
for dp, dn, fn in os.walk(os.path.join(DIST, 'assets')):
    for f in fn:
        src = os.path.join(dp, f); rp = os.path.relpath(src, DIST).replace(os.sep, '/'); sz = os.path.getsize(src)
        ext = os.path.splitext(f)[1].lower(); t = MT.get(ext) or mimetypes.guess_type(f)[0] or 'application/octet-stream'
        if rp.endswith('.css'): shutil.copy(src, os.path.join(OUT, rp.replace('/', '_')) if False else None) if False else None
        dst = os.path.join(OUT, V, rp); os.makedirs(os.path.dirname(dst), exist_ok=True)
        if sz <= PART: shutil.copy(src, dst); man[rp] = {'n': 0, 't': t}
        else:
            with open(src, 'rb') as fh:
                i = 0
                while True:
                    b = fh.read(PART)
                    if not b: break
                    open(f'{dst}.p{i}', 'wb').write(b); i += 1
            man[rp] = {'n': i, 't': t, 's': sz}; nparts += i
json.dump(man, open(os.path.join(OUT, V, 'manifest.json'), 'w'), separators=(',', ':'))
html = open(os.path.join(DIST, 'index.html')).read()
m = re.search(r'<script type="module" crossorigin src="\./(assets/index-[^"]+\.js)"></script>', html); main = m.group(1)
css = re.search(r'href="\./(assets/index-[^"]+\.css)"', html).group(1)
shutil.copy(os.path.join(DIST, css), os.path.join(OUT, css.replace('assets/', ''))); html = html.replace('./' + css, './' + css.replace('assets/', ''))
sw = open(os.path.join(ROOT, 'game', 'web', 'sw.js')).read().replace('__V__', V)
open(os.path.join(OUT, f'sw-{V}.js'), 'w').write(sw)
loader = ('<script>(async()=>{const main="./%s";try{if("serviceWorker" in navigator){await navigator.serviceWorker.register("./sw-%s.js");await navigator.serviceWorker.ready;'
          'if(!navigator.serviceWorker.controller){await new Promise(r=>{navigator.serviceWorker.addEventListener("controllerchange",r,{once:true});setTimeout(r,4000);});}'
          'if(!navigator.serviceWorker.controller&&!sessionStorage.getItem("sr_rl")){sessionStorage.setItem("sr_rl","1");location.reload();return;}}}catch(e){console.warn("sw",e)}'
          'const s=document.createElement("script");s.type="module";s.src=main;document.head.appendChild(s);})();</script>') % (main, V)
html = html.replace(m.group(0), loader)
open(os.path.join(OUT, 'index.html'), 'w').write(html)
for f in os.listdir(DIST):
    if f not in ('index.html', 'assets'): (shutil.copytree if os.path.isdir(os.path.join(DIST, f)) else shutil.copy)(os.path.join(DIST, f), os.path.join(OUT, f))
big = [p for p in (os.path.join(dp, f) for dp, dn, fn in os.walk(OUT) for f in fn) if os.path.getsize(p) > 850 * 1024]
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fn in os.walk(OUT) for f in fn); cnt = sum(len(fn) for dp, dn, fn in os.walk(OUT))
print(json.dumps({'version': V, 'files': cnt, 'mb': round(tot / 1e6, 1), 'parts': nparts, 'over850k': big[:5], 'main': main}))
