
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PRESETS, detectPreset } from './quality.js';
import { setAniso, progress, loadGLTF, loadTex } from './assets.js';
import { Env, makeComposer } from './render.js';
import { City } from './city.js';
import { loadCars, Vehicle, setRiderFactory } from './vehicles.js';
import { loadPeople, loadRealPeople, makePerson, hasReal, REAL_KINDS } from './characters.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Props } from './props.js';
import { Rain, Headlights } from './effects.js';
import { Creator } from './avatar.js';
import { ParkedFleet } from './parked.js';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
const canvas = document.getElementById('c');
const capture = params.has('capture');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
const det = detectPreset(renderer);
const qid = params.get('q') || localStorage.getItem('sr_quality') || det.id;
const Q = PRESETS[qid] || PRESETS.medium; Q.id = PRESETS[qid] ? qid : 'medium';
renderer.shadowMap.enabled = !!Q.shadows;
setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const W = () => window.innerWidth, H = () => window.innerHeight;
const pr = Math.min(window.devicePixelRatio * Q.pixelRatio, Q.maxPR);
renderer.setPixelRatio(pr); renderer.setSize(W(), H(), false);

// loading screen
ui.insertAdjacentHTML('beforeend', `<div class="loading" id="load"><div class="title">STREET RAJA</div><div class="sub">RATNAPUR</div><div class="bar"><div></div></div><div class="small" id="lmsg">Loading city… (${Q.name || qid})</div></div>`);
const bar = ui.querySelector('#load .bar>div');
progress.onProgress = (url, a, b) => { bar.style.width = Math.round(a / b * 100) + '%'; };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, W() / H(), 0.15, Q.drawDist);
const env = new Env(renderer, scene, Q);
if (params.has('t')) env.time = parseFloat(params.get('t'));
if (params.has('rain')) { env.rainTarget = env.rain = 1; }
const city = new City(scene, Q);
const post = makeComposer(renderer, scene, camera, Q, W() * pr, H() * pr);
const audio = new Audio();
let game, input, hud, rain, heads, creator, paused = true;
window.__game = { SkeletonUtils, THREE, scene, camera, env, city, renderer, Q, det, Vehicle, loadGLTF, loadTex };

async function init() {
  await env.load();
  await city.build();
  await Promise.all([loadCars(Q), loadPeople()]);
  await loadRealPeople(Q);
  setRiderFactory(() => { const ks = REAL_KINDS.filter(hasReal); const k = ks[Math.floor(Math.random() * ks.length)]; return makePerson({ real: k, npc: true, height: 0.96 + Math.random() * 0.08 }); });
  const props = new Props(scene, city, Q); await props.build(city.lightPoolTex); window.__game.props = props;
  const parked = new ParkedFleet(scene, city, Q); window.__game.parked = parked;
  const traffic = new Traffic(scene, city, Q);
  const peds = new Peds(scene, city, Q);
  hud = new HUD(ui, city); input = new Input(ui);
  rain = new Rain(scene, Q.rainDrops); heads = new Headlights(scene, Q);
  game = new Game({ scene, camera, city, traffic, peds, env, hud, input, audio, Q });
  let save = null; try { save = JSON.parse(localStorage.getItem('sr_save') || 'null'); } catch (e) {}
  if (params.has('fresh')) save = null;
  game.init(save);
  creator = new Creator(renderer, ui, scene); window.__game.creator = creator;
  game.openShop = () => { paused = true; if (document.pointerLockElement) document.exitPointerLock(); creator.open({ title: 'DESI THREADS · KAPDE', onDone: (a) => { if (a) { game.applyAvatar(a); hud.toast('Naya look! 😎'); } paused = false; } }); };
  { const lm = document.getElementById('lmsg'); if (lm) lm.textContent = 'Building Ratnapur…'; }
  city.stream(game.player.pos, 0, true);
  traffic.populate(Q.traffic, game.player.pos);
  peds.spawn(Q.peds, game.player.pos);
  Object.assign(window.__game, { game, traffic, peds, hud, input, post });
  window.__view = (px, pz, cam, tgt, time) => { if (time != null) env.time = time; game.player.pos.set(px, game.city.groundAt(px, pz), pz); if (game.player.vehicle) game.player.vehicle.pos.set(px, 0, pz); city.stream(game.player.pos, 0, true); for (let i = 0; i < 3; i++) { traffic.update(0.03, env.time, game.player, peds); peds.update(0.03, game.player, camera.position); } window.__cam = { p: cam, t: tgt, fov: 55 }; game.updateCamera(0.016, input.read()); env.update(0.001, game.player.pos, true); city.update(env); window.__game.props.update(env, camera.position); window.__game.parked.update(dt, game.player.pos); traffic.updateLights(env.time); post.composer.render(0.016); return renderer.domElement.toDataURL('image/jpeg', 0.9); };
  hud.onTop(a => { if (a === 'pause') showMenu(); if (a === 'cam') input.pressed.KeyC = true; if (a === 'map') hud.openBigMap(game.player, game.blips()); });
  // test hook: advance the simulation without rendering
  window.__step = (n, over = {}, dt = 1 / 30) => { for (let i = 0; i < n; i++) { const inp = Object.assign(input.read(), over); game.update(dt, inp); game.traffic.update(dt, env.time, game.player, game.peds); game.peds.update(dt, game.player, camera.position); env.update(dt, game.player.pos); if (i % 10 === 0) city.stream(game.player.pos, 50); } };
  // recording hook: one deterministic frame (sim + render), used for the trailer clip
  window.__frame = (over = {}, dt = 1 / 30) => { const inp = Object.assign(input.read(), over); if (window.__auto) window.__auto(game, inp, dt); game.update(dt, inp); game.traffic.update(dt, env.time, game.player, game.peds); game.peds.update(dt, game.player, camera.position);
    city.stream(game.player.pos, 40); env.update(dt, game.player.pos); city.update(env); window.__game.props.update(env, camera.position); window.__game.parked.update(dt, game.player.pos); rain.update(dt, camera, env.rain); heads.update(game.player.vehicle, env.night);
    const n = env.night, now = performance.now(); for (const v of game.traffic.cars) v.setNight(n, game.time); for (const v of game.police) v.setNight(n, game.time); post.composer.render(dt); };
  window.__androidBack = () => { if (creator.active) { creator.close(false); return; } if (hud.big) { hud.openBigMap(); return; } if (!paused) showMenu(); };
  document.getElementById('load').remove();
  if (capture || params.has('play')) startPlay(); else showMenu(true);
  loop();
}
function startPlay() { paused = false; audio.init(); audio.resume(); input.allowLock = true; const m = document.getElementById('menu'); if (m) m.remove(); }
function showMenu(first) {
  paused = true; if (document.pointerLockElement) document.exitPointerLock();
  const m = document.createElement('div'); m.className = 'menu'; m.id = 'menu';
  const qs = ['low', 'medium', 'high', 'ultra'];
  m.innerHTML = `<div class="panel"><div class="title">STREET RAJA</div><div class="sub">RATNAPUR CITY</div>
    <button class="mbtn" data-a="play">${first ? 'PLAY ▶' : 'RESUME ▶'}</button>
    <button class="mbtn sec" data-a="char">👕 CHARACTER BANAO</button>
    <div class="row">Graphics <div class="seg">${qs.map(q => `<button data-q="${q}" class="${q === qid ? 'sel' : ''}">${q.toUpperCase()}</button>`).join('')}</div></div>
    <div class="row">Volume <input type="range" min="0" max="100" value="${Math.round(audio.vol * 100)}" id="vol"></div>
    <div class="small">${input.touch || /Android|iPhone/i.test(navigator.userAgent) ? 'Phone: left side = joystick, right side = camera ghumao, buttons screen pe.<br>🗺 = bada map · Yellow = missions · Pink = kapde ki dukaan (character)' : `PC: WASD/Arrows move · Shift run · Space jump/drift · F enter/exit car · Click punch · Mouse look · C camera · R rain · T time +3h · H horn · Esc menu · M map<br>Yellow circles = missions · Pink = clothes shop`}</div>
    <button class="mbtn sec" data-a="credits">Credits</button>
    <button class="mbtn sec" data-a="reset">New game (reset save)</button></div>`;
  ui.appendChild(m);
  m.querySelector('[data-a=play]').onclick = startPlay;
  m.querySelector('[data-a=char]').onclick = () => { m.remove(); creator.open({ onDone: (a) => { if (a) game.applyAvatar(a); showMenu(first); } }); };
  m.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { localStorage.setItem('sr_quality', b.dataset.q); game.save(); location.reload(); });
  m.querySelector('#vol').oninput = (e) => audio.setVolume(e.target.value / 100);
  m.querySelector('[data-a=reset]').onclick = () => { if (confirm('Reset all progress?')) { localStorage.removeItem('sr_save'); location.reload(); } };
  m.querySelector('[data-a=credits]').onclick = () => { m.querySelector('.panel').innerHTML = `<div class="credits">${CREDITS}</div><button class="mbtn" onclick="location.reload()">Back</button>`; };
}
const CREDITS = `Street Raja: Ratnapur — an original game by Tech Bro Z (YouTube @techbrozdeveloper · Instagram @tech_bro_z_1).
Engine: three.js (MIT license).
Characters, hairstyles & animations: Quaternius — Universal Base Characters + Universal Animation Library (CC0).
PBR textures (asphalt, pavers, plaster, brick, concrete, grass…) & HDRI skies: Poly Haven — polyhaven.com (CC0).
Cars, auto-rickshaw, buildings, shop signs, street lamps, palms, gates, accessories & clothes: made procedurally in code for this game.
Sound: synthesized in-game (Web Audio).
All names, places, shops and brands in the game are fictional. Not affiliated with any other game or studio.`;

let last = performance.now(), fpsAcc = 0, fpsN = 0;
// dynamic resolution: keep ~30+ fps on phones by trading pixels for frames
let curPR = pr, drCool = 3, lowN = 0;
function dynRes(fps) {
  if (params.has('fixedres')) return; drCool--; if (drCool > 0) return;
  if (fps < 27) lowN++; else lowN = 0;
  let np = curPR;
  if (lowN >= 2 && curPR > pr * 0.55) np = Math.max(pr * 0.55, curPR * 0.85);
  else if (fps > 50 && curPR < pr) np = Math.min(pr, curPR * 1.1);
  if (Math.abs(np - curPR) > 0.01) { curPR = np; renderer.setPixelRatio(curPR); renderer.setSize(W(), H(), false); post.composer.setPixelRatio(curPR); post.composer.setSize(W(), H()); drCool = 3; lowN = 0; window.__pr = curPR; }
}
window.__fps = 0;
function loop() {
  requestAnimationFrame(loop);
  if (window.__rec) return;
  const now = performance.now();
  const dt = capture ? 1 / 30 : Math.min(0.05, (now - last) / 1000); last = now;
  fpsAcc += (now - (loop.prev || now)); loop.prev = now; fpsN++;
  if (fpsAcc > 1000) { window.__fps = Math.round(fpsN * 1000 / fpsAcc); if (!capture && !paused) dynRes(window.__fps); if (hud && params.has('fps')) hud.fpsEl.textContent = window.__fps + ' fps · ' + qid; fpsAcc = 0; fpsN = 0; }
  const inp = input.read();
  if (creator && creator.active) { creator.render(dt); window.__frames = (window.__frames || 0) + 1; return; }
  if (inp.pause) { if (paused) startPlay(); else showMenu(); }
  if (inp.map) hud.openBigMap(game.player, game.blips());
  if (!paused) {
    if (window.__auto) window.__auto(game, inp, dt);
    game.update(dt, inp);
    game.traffic.update(dt, env.time, game.player, game.peds);
    game.peds.update(dt, game.player, camera.position);
  }
  city.stream(game.player.pos, Q.id === 'low' ? 3 : 5);
  env.update(paused ? 0 : dt, game.player.pos);
  city.update(env);
  if (window.__game.props) window.__game.props.update(env, camera.position);
  if (window.__game.parked) window.__game.parked.update(dt, game.player.pos);
  rain.update(dt, camera, env.rain); heads.update(game.player.vehicle, env.night);
  const n = env.night; for (const v of game.traffic.cars) v.setNight(n, now / 1000); for (const v of game.police) v.setNight(n, now / 1000);
  post.composer.render(dt);
  window.__frames = (window.__frames || 0) + 1;
}
addEventListener('resize', () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H(), false); post.composer.setPixelRatio(curPR); post.composer.setSize(W(), H()); });
init().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f55;background:#000c;z-index:99;white-space:pre-wrap">${e.stack || e}</pre>`); });
