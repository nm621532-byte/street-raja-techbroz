
import * as THREE from 'three';
import { hasReal, makePerson } from './characters.js';

// ------------------------------------------------------------------------------------------
// Character Creator: the player's look, saved in localStorage ('sr_avatar') and used in-game.
// ------------------------------------------------------------------------------------------
export const COLORS = [0xf4f4f0, 0x111111, 0x1e4fa8, 0x0d2a5c, 0xb3261e, 0x7b1020, 0x2e7d32, 0x1b4d2a, 0xf9a825, 0xff7043, 0x6a1b9a, 0xec407a, 0x00838f, 0x8d6e63, 0xd7ccc8, 0x9e9e9e, 0xc8b89a, 0x4fc3f7];
const DENIM = [0x1b3a6b, 0x2b4f86, 0x1a2433, 0x2b2b2b, 0x3e4a5a, 0x5d4037, 0xc8b89a, 0xf4f4f0, 0x37474f, 0x6d4c41, 0x7b1020, 0x2e7d32];
const HAIRC = [0x0d0b0a, 0x1c140e, 0x3b2516, 0x6b3a1e, 0x8a2b18, 0xb08850, 0xe0c27a, 0x8f8f8f, 0xe8e8e8, 0x3f51b5, 0x7b1fa2, 0xc2185b];
const EYEC = [0x5a3a22, 0x2a1a10, 0x8a6a2e, 0x4c7a3a, 0x6d8aa0];
export const DEFAULT_AVATAR = { v: 1, model: 'man', female: false, build: 1, height: 1, skinTone: 3, face: 0, eye: 0, hair: 'parted', hairColor: 0x1c140e, beard: 'stubble',
  top: 'tshirt', topColor: 0xf4f4f0, top2: 0x1e4fa8, pattern: 'plain', bottom: 'jeans', bottomColor: 0x1b3a6b, shoeColor: 0x111111, cap: 'none', capColor: 0xb3261e, glasses: 'none', watch: 'none' };
export function loadAvatar() { try { const a = JSON.parse(localStorage.getItem('sr_avatar') || 'null'); if (a && a.v === 1) return Object.assign({}, DEFAULT_AVATAR, a); } catch (e) {} return Object.assign({}, DEFAULT_AVATAR); }
export function saveAvatar(a) { try { localStorage.setItem('sr_avatar', JSON.stringify(a)); } catch (e) {} }
export function avatarPerson(a) {
  if (a.model && a.model !== 'custom' && hasReal(a.model)) return makePerson({ real: a.model, build: a.build, height: a.height });
  return makePerson({ female: a.female, build: a.build, height: a.height, skinTone: a.skinTone, brows: [0, 1, 2, 3, 0][a.face] ?? 0, eyeColor: EYEC[a.eye] ?? EYEC[0],
    hair: a.hair, hairColor: a.hairColor, beardStyle: a.beard, top: a.top, shirt: a.topColor, shirt2: a.top2, pattern: a.pattern, longSleeve: a.top !== 'tshirt' && a.top !== 'vest',
    bottom: a.bottom, pants: a.bottom === 'pajama' && a.top === 'kurta' ? a.bottomColor : a.bottomColor, shoes: a.shoeColor, cap: a.cap, capColor: a.capColor, glasses: a.glasses, watch: a.watch === 'none' ? null : a.watch });
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const SKIN_CSS = ['#f1d3b8', '#e2bb98', '#cfa27c', '#bd8e68', '#a8775a', '#8c5e45', '#6f4935', '#57392a'];

const TABS = [
  ['hero', '⭐ Hero'], ['body', '🧍 Body'], ['face', '🙂 Face'], ['hair', '💇 Baal'], ['top', '👕 Upar'], ['bottom', '👖 Neeche'], ['shoes', '👟 Joote'], ['extra', '🧢 Extras'],
];
function rows(a) {
  const male = !a.female;
  return {
    hero: [
      ['Hero chuno', 'seg', 'model', [['man', 'Raja (jacket)'], ['woman', 'Rani'], ['businessman', 'Seth ji'], ['farmer', 'Kisan'], ['custom', 'Custom (khud banao)']]],
    ],
    body: [
      ['Gender', 'seg', 'female', [[false, 'Ladka'], [true, 'Ladki']]],
      ['Body', 'seg', 'build', [[0, 'Patla'], [1, 'Normal'], [2, 'Strong'], [3, 'Bhaari']]],
      ['Height', 'seg', 'height', [[0.94, 'Chhota'], [1, 'Normal'], [1.06, 'Lamba']]],
      ['Skin', 'sw', 'skinTone', SKIN_CSS.map((c, i) => [i, c])],
    ],
    face: [
      ['Chehra', 'seg', 'face', [[0, 'Classic'], [1, 'Bold'], [2, 'Soft'], [3, 'Sharp'], [4, 'Clean']]],
      ['Aankhen', 'sw', 'eye', EYEC.map((c, i) => [i, hex(c)])],
      ['Daadhi', 'seg', 'beard', [['none', 'Clean'], ['stubble', 'Halki'], ['moustache', 'Moochh'], ['full', 'Daadhi'], ['fullm', 'Daadhi+Moochh']]],
    ],
    hair: [
      ['Style', 'seg', 'hair', [['parted', 'Side part'], ['buzz', 'Buzz cut'], ['pixie', 'Short'], ['long', 'Lambe'], ['buns', 'Jooda'], ['ponytail', 'Choti'], ['bald', 'Ganja']]],
      ['Rang', 'sw', 'hairColor', HAIRC.map(c => [c, hex(c)])],
    ],
    top: [
      ['Kapda', 'seg', 'top', [['tshirt', 'T-shirt'], ['shirt', 'Shirt'], ['kurta', 'Kurta'], ['jacket', 'Jacket'], ['vest', 'Baniyan']]],
      ['Rang', 'sw', 'topColor', COLORS.map(c => [c, hex(c)])],
      ['Design', 'seg', 'pattern', [['plain', 'Plain'], ['stripes', 'Lines'], ['checks', 'Checks']]],
      [a.top === 'jacket' ? 'Andar ki shirt' : 'Doosra rang', 'sw', 'top2', COLORS.map(c => [c, hex(c)])],
    ],
    bottom: [
      ['Kapda', 'seg', 'bottom', [['jeans', 'Jeans'], ['trousers', 'Pant'], ['shorts', 'Shorts'], ['pajama', 'Pajama']]],
      ['Rang', 'sw', 'bottomColor', DENIM.map(c => [c, hex(c)])],
    ],
    shoes: [['Rang', 'sw', 'shoeColor', [0x111111, 0xf4f4f0, 0x5d4037, 0x8d6e63, 0xb3261e, 0x1e4fa8, 0xf9a825, 0x2e7d32, 0x9e9e9e].map(c => [c, hex(c)])]],
    extra: [
      ['Topi', 'seg', 'cap', [['none', 'Kuch nahi'], ['cap', 'Cap'], ['topi', 'Topi'], ['turban', 'Pagdi']]],
      ['Topi rang', 'sw', 'capColor', COLORS.map(c => [c, hex(c)])],
      ['Chashma', 'seg', 'glasses', [['none', 'Nahi'], ['specs', 'Chashma'], ['gold', 'Golden'], ['shades', 'Kaala chashma']]],
      ['Ghadi', 'seg', 'watch', [['none', 'Nahi'], ['black', 'Kaali'], ['gold', 'Golden']]],
    ],
  };
}
export function randomAvatar() {
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const female = Math.random() < 0.5;
  return Object.assign({}, DEFAULT_AVATAR, { model: Math.random() < 0.7 ? r(['man', 'woman', 'businessman', 'farmer']) : 'custom', female, build: r([0, 1, 1, 2, 3]), height: r([0.94, 1, 1, 1.06]), skinTone: Math.floor(Math.random() * 8), face: Math.floor(Math.random() * 5), eye: Math.floor(Math.random() * 5),
    hair: female ? r(['long', 'buns', 'ponytail', 'pixie']) : r(['parted', 'buzz', 'pixie', 'parted', 'bald']), hairColor: r(HAIRC.slice(0, 8)), beard: female ? 'none' : r(['none', 'stubble', 'moustache', 'full', 'fullm']),
    top: r(['tshirt', 'shirt', 'kurta', 'jacket', 'vest']), topColor: r(COLORS), top2: r(COLORS), pattern: r(['plain', 'plain', 'stripes', 'checks']), bottom: r(['jeans', 'trousers', 'shorts', 'pajama']), bottomColor: r(DENIM),
    shoeColor: r([0x111111, 0xf4f4f0, 0x5d4037]), cap: r(['none', 'none', 'cap', 'topi', 'turban']), capColor: r(COLORS), glasses: r(['none', 'none', 'specs', 'gold', 'shades']), watch: r(['none', 'black', 'gold']) });
}

export class Creator {
  constructor(renderer, ui, mainScene) {
    this.renderer = renderer; this.ui = ui; this.active = false; this.yaw = 0.5; this.zoom = 0;
    const s = this.scene = new THREE.Scene();
    this.mainScene = mainScene; s.background = new THREE.Color(0x1a1d24);
    s.fog = new THREE.Fog(0x1a1d24, 6, 14);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.4); key.position.set(2.5, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -2; key.shadow.camera.right = key.shadow.camera.top = 2; s.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.4); rim.position.set(-3, 2.5, -3); s.add(rim);
    s.add(new THREE.HemisphereLight(0xdde8ff, 0x302820, 0.8));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.28, 1.34, 64), new THREE.MeshBasicMaterial({ color: 0xffb300 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; s.add(ring);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.holder = new THREE.Group(); s.add(this.holder);
  }
  open(opts = {}) {
    this.scene.environment = this.mainScene ? this.mainScene.environment : null;
    this.a = loadAvatar(); this.orig = JSON.stringify(this.a); this.onDone = opts.onDone; this.tab = 'hero'; this.active = true; this.title = opts.title || 'CHARACTER BANAO';
    const d = this.el = document.createElement('div'); d.className = 'creator';
    d.innerHTML = `<div class="cr-drag"></div><div class="cr-panel"><div class="cr-title">${this.title}</div><div class="cr-tabs"></div><div class="cr-rows"></div>
      <div class="cr-bar"><button data-c="rand">🎲 Random</button><button data-c="cancel">✖ Wapas</button><button data-c="save" class="ok">✔ Save</button></div></div><div class="cr-hint">⟲ ghumane ke liye drag karo</div>`;
    this.ui.appendChild(d);
    d.querySelector('[data-c=rand]').onclick = () => { this.a = randomAvatar(); this.rebuild(); this.renderTabs(); this.renderRows(); };
    d.querySelector('[data-c=cancel]').onclick = () => this.close(false);
    d.querySelector('[data-c=save]').onclick = () => this.close(true);
    const drag = d.querySelector('.cr-drag'); let px = null, py = null;
    const down = (x, y) => { px = x; py = y; }, move = (x, y) => { if (px == null) return; this.yaw += (x - px) * 0.012; this.zoom = Math.max(0, Math.min(1, this.zoom + (py - y) * 0.004)); px = x; py = y; }, up = () => { px = null; };
    drag.addEventListener('pointerdown', e => { drag.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
    drag.addEventListener('pointermove', e => move(e.clientX, e.clientY)); drag.addEventListener('pointerup', up); drag.addEventListener('pointercancel', up);
    drag.addEventListener('wheel', e => { this.zoom = Math.max(0, Math.min(1, this.zoom - e.deltaY * 0.001)); }, { passive: true });
    this.renderTabs(); this.renderRows(); this.rebuild(); document.body.classList.add('creating');
  }
  renderTabs() {
    const t = this.el.querySelector('.cr-tabs'); const realM = this.a.model && this.a.model !== 'custom'; if (realM && !['hero', 'body'].includes(this.tab)) this.tab = 'hero'; t.innerHTML = TABS.filter(([k]) => !realM || k === 'hero' || k === 'body').map(([k, n]) => `<button data-t="${k}" class="${k === this.tab ? 'sel' : ''}">${n}</button>`).join('');
    t.querySelectorAll('button').forEach(b => b.onclick = () => { this.tab = b.dataset.t; this.renderTabs(); this.renderRows(); if (b.dataset.t === 'face' || b.dataset.t === 'hair' || b.dataset.t === 'extra') this.zoom = 1; else if (b.dataset.t === 'shoes' || b.dataset.t === 'bottom' || b.dataset.t === 'body') this.zoom = 0; });
  }
  renderRows() {
    const R = rows(this.a)[this.tab]; const box = this.el.querySelector('.cr-rows');
    box.innerHTML = R.map(([label, kind, key, opts], ri) => `<div class="cr-row"><div class="cr-l">${label}</div><div class="cr-${kind}">${opts.map(([v, txt], oi) => kind === 'seg'
      ? `<button data-r="${ri}" data-o="${oi}" class="${JSON.stringify(this.a[key]) === JSON.stringify(v) ? 'sel' : ''}">${txt}</button>`
      : `<button data-r="${ri}" data-o="${oi}" class="${this.a[key] === v ? 'sel' : ''}" style="background:${txt}"></button>`).join('')}</div></div>`).join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => { const [, , key, opts] = R[+b.dataset.r]; this.a[key] = opts[+b.dataset.o][0];
      if (key === 'female') { this.a.hair = this.a.female ? 'long' : 'parted'; this.a.beard = this.a.female ? 'none' : 'stubble'; }
      if (key === 'model') { if (this.a.model === 'woman') this.a.female = true; else if (this.a.model !== 'custom') this.a.female = false; }
      this.rebuild(); this.renderTabs(); this.renderRows(); });
  }
  rebuild() {
    if (this.p) this.p.dispose();
    this.p = avatarPerson(this.a); this.holder.add(this.p.root); this.p.root.traverse(n => { if (n.isMesh) n.castShadow = true; });
    this.p.play('Idle_Loop', 0);
  }
  close(save) {
    if (save) saveAvatar(this.a);
    this.active = false; this.el.remove(); document.body.classList.remove('creating'); if (this.p) { this.p.dispose(); this.p = null; }
    this.onDone && this.onDone(save ? this.a : null);
  }
  render(dt) {
    if (!this.active || !this.p) return;
    const W = innerWidth, H = innerHeight; const r = this.renderer;
    this.p.mixer.update(dt); this.holder.rotation.y = this.yaw;
    const portrait = H > W; const z = this.zoom;
    this.cam.aspect = W / H; this.cam.fov = portrait ? 46 : 30; this.cam.updateProjectionMatrix();
    const ty = 0.95 + z * 0.68, dist = (portrait ? 4.6 : 4.4) - z * 3.0;
    this.cam.position.set(0, ty + 0.15 - z * 0.1, dist); this.cam.lookAt(0, ty, 0);
    // shift the figure into the free (left / top) part of the screen
    if (portrait) this.cam.setViewOffset(W, H, 0, H * 0.22, W, H); else this.cam.setViewOffset(W, H, W * 0.22, 0, W, H);
    const tm = r.toneMapping; r.render(this.scene, this.cam); r.toneMapping = tm;
  }
}
