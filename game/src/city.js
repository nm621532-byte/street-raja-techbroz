
import * as THREE from 'three';
import { GB, rng } from './geom.js';
import { pbr } from './assets.js';
import { makeFacade, makeWettable, facadeUniforms } from './facade.js';

// ---------------------------------------------------------------------------------------------
// World layout. Everything sits on one global grid: road line i at x = ORIGIN + i*P (same for z),
// block (bx,bz) lies between lines bx..bx+1. The world is generated deterministically per block
// and streamed in 3x3-block chunks (252 m) around the player, with two levels of detail.
// ---------------------------------------------------------------------------------------------
export const N = 9, ROAD = 14, SIDE = 4.5, BLOCK = 70, P = BLOCK + ROAD;
export const ORIGIN = -N * P / 2;
export const CURB = 0.16;
export const BX0 = -14, BX1 = 34, BZ0 = -22, BZ1 = 26;            // world = 48 x 48 blocks ≈ 4.0 x 4.0 km
export const WORLD_MIN_X = ORIGIN + BX0 * P, WORLD_MAX_X = ORIGIN + BX1 * P, WORLD_MIN_Z = ORIGIN + BZ0 * P, WORLD_MAX_Z = ORIGIN + BZ1 * P;
export const CH = 3, CHS = CH * P;                                 // chunk = 3x3 blocks
export const SEA_Z = ORIGIN - 18 * P - 20;                         // ocean south of the beach
export const REGIONS = [
  { id: 'ratnapur', name: 'Ratnapur', bx0: 0, bx1: 8, bz0: 0, bz1: 8, kind: 'city' },
  { id: 'sonapur', name: 'Sonapur Bazaar', bx0: 17, bx1: 22, bz0: 1, bz1: 7, kind: 'town' },
  { id: 'samudra', name: 'Samudra Nagar', bx0: 1, bx1: 7, bz0: -17, bz1: -12, kind: 'coast' },
];
const VILLAGES = [[12, 2, 'Rampur'], [13, 6, 'Rampur'], [2, -7, 'Kheri'], [6, -5, 'Kheri'], [20, -9, 'Bhojpur'], [18, -6, 'Bhojpur'], [-4, 3, 'Chandpur'], [-3, 6, 'Chandpur'], [5, 13, 'Lakhanpur'], [2, 15, 'Lakhanpur']];
const DHABAS = [[14, 4, 'SHER-E-PUNJAB DHABA'], [3, -4, 'HIGHWAY KING DHABA'], [13, -11, 'APNA DHABA'], [20, -4, 'MOTI DHABA'], [-6, 4, 'BABA KA DHABA'], [4, 12, 'TRUCKERS DHABA']];
// highways: [axis of travel, line index, from, to] — segments idx from..to-1
export const HIGHWAYS = [
  ['x', 4, 9, 17],     // NH-44 Ratnapur → Sonapur (east)
  ['z', 4, -11, 0],    // NH-7 Ratnapur → Samudra Nagar (south)
  ['x', -11, 8, 20],   // coast highway Samudra → east
  ['z', 20, -11, 1],   // link north to Sonapur
  ['x', 4, -10, 0],    // west road to Chandpur & the hills
  ['z', 4, 9, 19],     // north road to Lakhanpur
];
function hash2(a, b, s = 0) { let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function regionAt(bx, bz) { for (const r of REGIONS) if (bx >= r.bx0 && bx <= r.bx1 && bz >= r.bz0 && bz <= r.bz1) return r; return null; }
export function blockType(bx, bz) {
  if (bx < BX0 || bx >= BX1 || bz < BZ0 || bz >= BZ1) return 'out';
  const r = regionAt(bx, bz); if (r) return r.kind;
  if (bz <= -18) return bz === -18 ? 'beach' : 'sea';
  for (const v of VILLAGES) if (v[0] === bx && v[1] === bz) return 'village';
  for (const d of DHABAS) if (d[0] === bx && d[1] === bz) return 'dhaba';
  return 'field';
}
const q0 = new THREE.Quaternion(), e0 = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1);
export const isUrban = (t) => t === 'city' || t === 'town' || t === 'coast';
function onHighway(axis, line, idx) { for (const [a, l, f, t] of HIGHWAYS) if (a === axis && l === line && idx >= f && idx < t) return true; return false; }
// segment along x on line j between intersections i and i+1 ; segment along z on line i between j and j+1
export function segX(i, j) { if (i < BX0 || i >= BX1) return false; return isUrban(blockType(i, j - 1)) || isUrban(blockType(i, j)) || onHighway('x', j, i); }
export function segZ(i, j) { if (j < BZ0 || j >= BZ1) return false; return isUrban(blockType(i - 1, j)) || isUrban(blockType(i, j)) || onHighway('z', i, j); }
export function interDegree(i, j) { return (segX(i, j) ? 1 : 0) + (segX(i - 1, j) ? 1 : 0) + (segZ(i, j) ? 1 : 0) + (segZ(i, j - 1) ? 1 : 0); }
export function isHighwaySeg(axis, line, idx) { return onHighway(axis, line, idx); }
export function villageName(bx, bz) { for (const v of VILLAGES) if (v[0] === bx && v[1] === bz) return v[2]; return null; }
export const VILLAGE_LIST = VILLAGES, DHABA_LIST = DHABAS;

export const SHOP_NAMES = [
  ['SHARMA SWEETS','Pure Desi Ghee'],['GUPTA MOBILE','Recharge • Repair'],['CHAI ADDA','Garam Chai 24x7'],['RAJU TAILORS','Ladies & Gents'],
  ['KAPOOR MEDICAL','Chemist & Druggist'],['ANNAPURNA BHOJNALAYA','Pure Veg Thali'],['BOMBAY DRY FRUITS','Wholesale & Retail'],['SHREE GANESH HARDWARE','Paints • Tools'],
  ['LUCKY ELECTRONICS','TV • AC • Fridge'],['ROYAL BARBER SHOP','Hair Cut • Shave'],['KRISHNA DAIRY','Fresh Milk • Paneer'],['PATEL KIRANA STORE','Daily Needs'],
  ['NEW BOOK DEPOT','Books • Stationery'],['SINGH AUTO PARTS','Car • Bike Spares'],['MEHTA OPTICALS','Eye Testing Free'],['SAI PAN BHANDAR','Meetha Paan'],
  ['FRESH JUICE CORNER','Mango Shake'],['BIRYANI HOUSE','Hyderabadi Dum'],['BANSAL CLOTH HOUSE','Sarees • Suits'],['LAXMI JEWELLERS','Gold • Silver'],
  ['CITY PHARMACY','Open 24 Hours'],['JANTA BANK','ATM Inside'],['HOTEL SHANTI','A/C Rooms'],['CYBER CAFE','Print • Xerox'],
  ['VERMA PHOTO STUDIO','Passport Photo'],['MOMOS JUNCTION','Steam • Fried'],['UDUPI DOSA CORNER','South Indian'],['KULFI CORNER','Since 1975'],
  ['JAIN STATIONERY','School Items'],['STAR GYM','Fitness Club'],['TAJ TEA STALL','Cutting Chai'],['RK SUPERMARKET','Best Prices'],
  ['AGARWAL SWEETS','Kaju Katli'],['DHABA EXPRESS','Punjabi Khana'],['SPEED COURIER','Parcel Service'],['GOLDEN BAKERY','Cakes • Pastry'],
  ['MOTI PALACE','Restaurant'],['FIX IT REPAIRS','Laptop • Mobile'],['NAMASTE TRAVELS','Bus • Train'],['SHAKTI GAS AGENCY','Cylinder Booking'],
  ['PANDIT JI CHAAT','Pani Puri'],['AUTO GARAGE','Puncture Repair'],['KHAN TRADERS','Electricals'],['SUNRISE CLINIC','Dr. Mehra MBBS'],
  ['DESI THREADS','Fashion Store'],['RAJA BIKE SPARES','Bike Service'],['SHIV SHAKTI STEEL','Utensils'],['GLOBAL MOBILES','EMI Available'],
  ['TANDOOR HOUSE','Non Veg'],['POLICE STATION','Thana'],['BOMBAY SALON','Unisex'],['NAVRANG SAREES','Wedding Collection'],
  ['QUICK PHOTOCOPY','Lamination'],['DOLLY CHAI','Since 1998'],['AMBIKA FLOUR MILL','Atta Chakki'],['SHAAN PALACE','Banquet Hall'],
  ['KHILONA GHAR','Kids Zone'],['JAI HIND GENERAL','Store'],['VIJAY BOOT HOUSE','Shoes'],['SURYA ELECTRICALS','Wiring'],
  ['APNA BAZAAR','Fresh Veggies'],['PUNJAB DA DHABA','Lassi'],['GREEN LEAF CAFE','Coffee'],['NEHA BEAUTY PARLOUR','Bridal Makeup'],
];


// Coconut palm: curved trunk + drooping fronds, one geometry with vertex colours
function palmGeometry() {
  const P = [], N = [], Cc = [], I = []; const v = new THREE.Vector3();
  const push = (x, y, z, nx, ny, nz, c) => { P.push(x, y, z); N.push(nx, ny, nz); Cc.push(c.r, c.g, c.b); return P.length / 3 - 1; };
  const trunkC = new THREE.Color(0x7a5c3e), trunkD = new THREE.Color(0x5b4330), leaf = new THREE.Color(0x3f7a2a), leafD = new THREE.Color(0x2c5a1e);
  const H = 7.5, segs = 10, rs = 8; const lean = (t) => new THREE.Vector3(Math.sin(t * 1.2) * 0.9 * t, t * H, 0);
  for (let s = 0; s <= segs; s++) { const t = s / segs, c = lean(t), r = 0.24 - 0.09 * t; for (let k = 0; k <= rs; k++) { const a = k / rs * Math.PI * 2; push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), s % 2 ? trunkC : trunkD); } }
  for (let s = 0; s < segs; s++) for (let k = 0; k < rs; k++) { const a = s * (rs + 1) + k, b = a + rs + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const top = lean(1);
  for (let f = 0; f < 9; f++) { const yaw = f / 9 * Math.PI * 2 + 0.3, L = 3.4 + (f % 3) * 0.4, n0 = P.length / 3; const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let s = 0; s <= 6; s++) { const t = s / 6; const p = top.clone().addScaledVector(dir, t * L); p.y += Math.sin(t * Math.PI * 0.8) * 0.9 - t * t * 1.8; const w = Math.sin(t * Math.PI) * 0.55 + 0.05;
      push(p.x + side.x * w, p.y - 0.05, p.z + side.z * w, 0, 1, 0, leaf); push(p.x, p.y + 0.08, p.z, 0, 1, 0, leafD); push(p.x - side.x * w, p.y - 0.05, p.z - side.z * w, 0, 1, 0, leaf); }
    for (let s = 0; s < 6; s++) { const a = n0 + s * 3; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); } }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; const cx = top.x + Math.cos(a) * 0.22, cz = top.z + Math.sin(a) * 0.22; const sg = new THREE.SphereGeometry(0.15, 6, 4); const p = sg.attributes.position, n = sg.attributes.normal; const base = P.length / 3; for (let i = 0; i < p.count; i++) push(cx + p.getX(i), top.y - 0.25 + p.getY(i), cz + p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), trunkD); for (let i = 0; i < sg.index.count; i++) I.push(sg.index.getX(i) + base); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// Welcome gateways on the highways at each town's edge
function gateTexture(title, sub, bg, fg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 160); grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -35)); g.fillStyle = grd; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = '#ffd54a'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 144);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 70px Arial Black, Arial'; g.fillText(title, 512, 66);
  g.font = 'bold 32px Arial'; g.fillStyle = '#ffe9a8'; g.fillText(sub, 512, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function makeSignAtlas() {
  const W = 2048, H = 2048, cols = 4, rows = 16; const cw = W / cols, ch = H / rows;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const pal = [['#c21807','#ffd700'],['#0b3d91','#ffffff'],['#006400','#fff59d'],['#ff8f00','#1a1a1a'],['#4a148c','#ffeb3b'],['#111111','#ff5252'],['#ffffff','#b71c1c'],['#00695c','#ffffff'],['#ffeb3b','#c62828'],['#1565c0','#ffeb3b']];
  for (let i = 0; i < cols * rows; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; const [t, sub] = SHOP_NAMES[i % SHOP_NAMES.length]; const [bg, fg] = pal[(i * 7) % pal.length];
    const grd = g.createLinearGradient(0, y, 0, y + ch); grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -25));
    g.fillStyle = grd; g.fillRect(x, y, cw, ch);
    g.strokeStyle = shade(bg, 40); g.lineWidth = 5; g.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 54; g.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
    while (g.measureText(t).width > cw - 40 && fs > 20) { fs -= 2; g.font = `900 ${fs}px Arial Black, Arial, sans-serif`; }
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowOffsetY = 3; g.fillText(t, x + cw / 2, y + ch * 0.42); g.shadowOffsetY = 0;
    g.font = `bold 24px Arial, sans-serif`; g.fillStyle = shade(fg, -10); g.fillText(sub, x + cw / 2, y + ch * 0.8);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  return { tex, cols, rows };
}
function shade(hex, amt) { let n = parseInt(hex.slice(1), 16); let r = Math.max(0, Math.min(255, (n >> 16) + amt)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt)); return '#' + ((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0'); }

function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}


// procedural low-poly tree (trunk + leafy blobs), vertex coloured
function treeGeometry(seed) {
  const R = rng(seed); const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 7); trunk.translate(0, 1.6, 0); paint(trunk, 0x5a4330); parts.push(trunk);
  const greens = [0x3e6b2a, 0x4f7d2f, 0x355e24, 0x5b8a34];
  for (let k = 0; k < 6; k++) { const r = 1.1 + R() * 0.9; const s = new THREE.IcosahedronGeometry(r, 1); const a = R() * 6.28, d = k === 0 ? 0 : 0.9 + R() * 0.6;
    s.scale(1, 0.8, 1); s.translate(Math.cos(a) * d, 3.6 + R() * 1.6, Math.sin(a) * d); const pos = s.attributes.position; for (let v = 0; v < pos.count; v++) pos.setXYZ(v, pos.getX(v) + (R() - 0.5) * 0.25, pos.getY(v) + (R() - 0.5) * 0.25, pos.getZ(v) + (R() - 0.5) * 0.25);
    paint(s, greens[k % 4]); parts.push(s); }
  return merge(parts);
}
function mergeSimple(list) {
  const pos = [], nor = [], idx = []; let off = 0;
  for (let g of list) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } for (const i of g.index.array) idx.push(i + off); off += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
function paint(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = 0.85 + Math.random() * 0.3; a[i * 3] = c.r * v; a[i * 3 + 1] = c.g * v; a[i * 3 + 2] = c.b * v; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
function merge(list) {
  const pos = [], nor = [], col = [], idx = []; let off = 0;
  for (let g of list) { g = g.index ? g : g; if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); }
    g.computeVertexNormals(); const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); col.push(c[i]); } for (const i of g.index.array) idx.push(i + off); off += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
function waterNormalTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const img = g.createImageData(S, S);
  const h = new Float32Array(S * S);
  for (let k = 0; k < 40; k++) { const fx = 1 + Math.floor(Math.random() * 6), fy = Math.floor(Math.random() * 6) - 3, ph = Math.random() * 6.28, a = 1 / (fx + Math.abs(fy) + 1);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] += a * Math.sin((x * fx + y * fy) / S * 6.283 + ph); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S], dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize(); const o = (y * S + x) * 4; img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class City {
  constructor(scene, Q) {
    this.scene = scene; this.Q = Q; this.grid = new Map(); this.cell = 24;
    this.chunks = new Map(); this.blocks = []; this.queue = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.fullR = { low: 300, medium: 380, high: 470, ultra: 560 }[Q.id] || 400;
    this.lodR = Math.max(this.fullR + 150, Q.drawDist);
    this.parkBlock = [2, 6]; this.policeBlock = [6, 2]; this.marketBlock = [4, 5];
  }
  roadX(i) { return ORIGIN + i * P; }
  policeSpawn() { const [x0, z0, x1, z1] = this.blockRect(6, 2); return new THREE.Vector3(x0 + 2, CURB, (z0 + z1) / 2 + 6); }
  hospitalSpawn() { const [x0, z0, x1, z1] = this.blockRect(3, 6); return new THREE.Vector3(x1 - 2, CURB, (z0 + z1) / 2); }
  blockRect(bx, bz) { const x0 = ORIGIN + bx * P + ROAD / 2, z0 = ORIGIN + bz * P + ROAD / 2; return [x0, z0, x0 + BLOCK, z0 + BLOCK]; }
  // ---------- colliders (spatial hash, per-chunk ownership so chunks can unload) ----------
  addCollider(x0, z0, x1, z1, h = 10, tag = 'bld') {
    const c = { x0, z0, x1, z1, h, tag, keys: [] }; if (this._cur) this._cur.colliders.push(c);
    const cs = this.cell;
    for (let gx = Math.floor(x0 / cs); gx <= Math.floor(x1 / cs); gx++) for (let gz = Math.floor(z0 / cs); gz <= Math.floor(z1 / cs); gz++) {
      const k = gx * 10007 + gz; let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(c); c.keys.push(k);
    }
    return c;
  }
  removeCollider(c) { for (const k of c.keys) { const a = this.grid.get(k); if (!a) continue; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) this.grid.delete(k); } }
  query(x, z, r = 2) {
    const cs = this.cell, out = [];
    for (let gx = Math.floor((x - r) / cs); gx <= Math.floor((x + r) / cs); gx++) for (let gz = Math.floor((z - r) / cs); gz <= Math.floor((z + r) / cs); gz++) {
      const a = this.grid.get(gx * 10007 + gz); if (a) for (const c of a) if (out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }
  groundAt(x, z) {
    const bx = Math.floor((x - ORIGIN) / P), bz = Math.floor((z - ORIGIN) / P);
    const lx = x - ORIGIN - bx * P, lz = z - ORIGIN - bz * P;
    if (lx < ROAD / 2 || lx > P - ROAD / 2 || lz < ROAD / 2 || lz > P - ROAD / 2) return 0;
    return isUrban(blockType(bx, bz)) ? CURB : 0;
  }
  isRoad(x, z) {
    const i = Math.round((x - ORIGIN) / P), j = Math.round((z - ORIGIN) / P);
    const dx = Math.abs(x - ORIGIN - i * P), dz = Math.abs(z - ORIGIN - j * P);
    const bi = Math.floor((x - ORIGIN) / P), bj = Math.floor((z - ORIGIN) / P);
    if (dz < ROAD / 2 && segX(bi, j)) return true; if (dx < ROAD / 2 && segZ(i, bj)) return true; return false;
  }
  district(bx, bz) { const c = (N - 1) / 2; const d = Math.max(Math.abs(bx - c), Math.abs(bz - c)); return d <= 1 ? 'downtown' : d <= 2 ? 'mid' : 'low'; }
  regionNameAt(x, z) { const bx = Math.floor((x - ORIGIN) / P), bz = Math.floor((z - ORIGIN) / P); const r = regionAt(bx, bz); if (r) return r.name; const v = villageName(bx, bz); if (v) return v; const t = blockType(bx, bz); if (t === 'beach' || t === 'sea') return 'Samudra Beach'; return 'Highway'; }
  *camBlocksAll() { for (const ch of this.chunks.values()) yield* ch.camBlocks; }
  intersectionsNear(x, z, r) { const out = []; const i0 = Math.floor((x - r - ORIGIN) / P), i1 = Math.ceil((x + r - ORIGIN) / P), j0 = Math.floor((z - r - ORIGIN) / P), j1 = Math.ceil((z + r - ORIGIN) / P);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (interDegree(i, j) > 0) out.push([i, j]); return out; }


  buildGates() {
    const G = [
      ['x', ORIGIN + 9 * P + 25, ORIGIN + 4 * P, 'RATNAPUR', 'Aapka swagat hai · Welcome', '#8e1b1b'],
      ['x', ORIGIN + 17 * P - 25, ORIGIN + 4 * P, 'SONAPUR BAZAAR', 'Purana shehar · Old Bazaar Town', '#b35c00'],
      ['z', ORIGIN + 4 * P, ORIGIN - 25, 'RATNAPUR', 'Aapka swagat hai · Welcome', '#8e1b1b'],
      ['z', ORIGIN + 4 * P, ORIGIN - 11 * P + 25, 'SAMUDRA NAGAR', 'Beach City · Samudra Beach', '#0b5e7a'],
    ];
    const stone = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.85 }), trim = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
    const half = ROAD / 2 + 1.8;
    for (const [ax, gx, gz, title, sub, bg] of G) {
      const grp = new THREE.Group(); grp.position.set(gx, 0, gz); if (ax === 'x') grp.rotation.y = Math.PI / 2; // along x travel the gate spans z
      for (const s of [-1, 1]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.6, 1.4), stone); pil.position.set(s * half, 4.3, 0); pil.castShadow = pil.receiveShadow = true; grp.add(pil);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 8), trim); cap.position.set(s * half, 9.3, 0); cap.castShadow = true; grp.add(cap);
        const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 2), stone); base.position.set(s * half, 0.4, 0); grp.add(base);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1.4, 2.4, 0.9), trim); beam.position.y = 7.3; beam.castShadow = true; grp.add(beam);
      const tex = gateTexture(title, sub, bg, '#ffffff'); const sm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 });
      for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.8, 2.0), sm); pl.position.set(0, 7.3, s * 0.47); if (s < 0) pl.rotation.y = Math.PI; grp.add(pl); }
      this.scene.add(grp); this.gateMats = (this.gateMats || []).concat([sm]);
      for (const s of [-1, 1]) { const px = ax === 'x' ? gx : gx + s * half, pz = ax === 'x' ? gz + s * half : gz; this.addCollider(px - 0.8, pz - 0.8, px + 0.8, pz + 0.8, 8.6, 'bld'); }
    }
  }
  // ---------- one-time setup: materials, ground, sea, hills ----------
  async build() {
    const Q = this.Q, res = Q.tex;
    const asphalt = makeWettable(pbr('clean_asphalt', res, { repeat: 1 }), 1, true);
    for (const k of ['map','normalMap','roughnessMap','aoMap']) asphalt[k].repeat.set(1/6, 1/6);
    const pavers = makeWettable(pbr('interlocking_concrete_pavers', res), 0.8);
    for (const k of ['map','normalMap','roughnessMap','aoMap']) pavers[k].repeat.set(1/2.5, 1/2.5);
    const curbMat = makeWettable(pbr('concrete_pavement', res), 0.7);
    const roofMat = pbr('concrete_floor_worn_001', res); for (const k of ['map','normalMap','roughnessMap','aoMap']) roofMat[k].repeat.set(1/4, 1/4);
    const grassMat = pbr('grass_ground', res); for (const k of ['map','normalMap','roughnessMap','aoMap']) grassMat[k].repeat.set(1/3, 1/3);
    const wallIds = [['yellow_plaster',0],['plastered_wall_02',0],['painted_plaster_wall',0],['red_brick_03',2],['white_plaster_02',0],['worn_plaster_wall',0],['red_plaster_weathered',0],['blue_plaster_weathered',0],['concrete_wall_006',1],['rectangular_facade_tiles',1]];
    const wallMats = wallIds.map(([id, st]) => { const m = makeFacade(makeWettable(pbr(id, res), 0.3), id.includes('brick') ? 2.0 : 3.0); m.userData.style = st; return m; });
    const markW = makeWettable(new THREE.MeshStandardMaterial({ color: 0xd9d9d2, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.6);
    const markY = makeWettable(new THREE.MeshStandardMaterial({ color: 0xe0a915, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.6);
    const roadMat = asphalt.clone(); roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -1; roadMat.polygonOffsetUnits = -1; roadMat.onBeforeCompile = asphalt.onBeforeCompile; roadMat.customProgramCacheKey = asphalt.customProgramCacheKey;
    this.signAtlas = makeSignAtlas();
    const signMat = new THREE.MeshStandardMaterial({ map: this.signAtlas.tex, emissiveMap: this.signAtlas.tex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.45, metalness: 0.05 });
    const awnMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 });
    const acMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.6, metalness: 0.2 });
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const hayMat = new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8c8c86, roughness: 0.8 });
    this.mats = { asphalt, roadMat, pavers, curbMat, roofMat, grassMat, wallMats, markW, markY, signMat, awnMat, tankMat, acMat, treeMat, hayMat, woodMat, poleMat };
    this.signMat = signMat; this.lightPoolTex = radialTex();
    this.palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    this.geos = {
      palm: palmGeometry(), flag: (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.22, 0, 0, 0.22, 0, -0.42, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3)); return g; })(),
      tank: (() => { const g = new THREE.CylinderGeometry(0.62, 0.62, 1.3, 14); g.translate(0, 0.65, 0); return g; })(),
      ac: (() => { const g = new THREE.BoxGeometry(1.0, 0.7, 0.45); g.translate(0, 0.35, 0); return g; })(),
      trees: [treeGeometry(11), treeGeometry(23), treeGeometry(37)],
      hay: (() => { const g = new THREE.ConeGeometry(1.6, 2.6, 10); g.translate(0, 1.3, 0); return g; })(),
      pole: (() => { const g = new THREE.CylinderGeometry(0.1, 0.16, 9, 6); g.translate(0, 4.5, 0); return g; })(),
      poleBar: (() => { const p = new THREE.CylinderGeometry(0.1, 0.16, 9, 6); p.translate(0, 4.5, 0); const b = new THREE.BoxGeometry(1.6, 0.1, 0.1); b.translate(0, 8.5, 0); return mergeSimple([p, b]); })(),
    };
    // street lamp (procedural, ~150 tris: tapered pole, curved arm, LED head) — instanced per chunk
    {
      const pole = new THREE.CylinderGeometry(0.07, 0.13, 8.5, 8); pole.translate(0, 4.25, 0);
      const base = new THREE.CylinderGeometry(0.2, 0.24, 0.6, 8); base.translate(0, 0.3, 0);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.2, 0), new THREE.Vector3(0.1, 8.9, 0), new THREE.Vector3(2.3, 8.75, 0));
      const arm = new THREE.TubeGeometry(curve, 8, 0.055, 6, false);
      const head = new THREE.BoxGeometry(0.75, 0.14, 0.32); head.translate(2.35, 8.7, 0);
      const lens = new THREE.BoxGeometry(0.62, 0.02, 0.24); lens.translate(2.35, 8.62, 0);
      const metal = mergeSimple([pole, base, arm, head]);
      const metalMat = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.45, metalness: 0.7 });
      const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0.0, roughness: 0.2 });
      this.lampModel = { parts: [{ geometry: metal, material: metalMat, matrix: new THREE.Matrix4() }, { geometry: lens, material: lensMat, matrix: new THREE.Matrix4() }], armAxis: 0, H: 8.5, arm: 2.45 };
      this.lampMat = lensMat;
    }
    // ---- ground: farmland / grass / sand everywhere (urban blocks & roads sit on top) ----
    const W = (BX1 - BX0) * P + 3000; const gGeo = new THREE.PlaneGeometry(W, W, 96, 96); gGeo.rotateX(-Math.PI / 2);
    const uv = gGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W, uv.getY(i) * W);
    const gm = grassMat.clone(); gm.onBeforeCompile = (sh) => {
      sh.uniforms.uSea = { value: SEA_Z }; sh.uniforms.uWet = facadeUniforms.uWet;
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWPos; uniform float uSea; uniform float uWet;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 fp = vWPos.xz / vec2(46.0, 31.0); vec2 fid = floor(fp); vec2 ff = fract(fp);
        float r = fh(fid); float bund = 1.0 - step(0.012, ff.x) * step(ff.x, 0.988) * step(0.02, ff.y) * step(ff.y, 0.98);
        vec3 crop = diffuseColor.rgb * vec3(0.78, 1.0, 0.62);
        if (r < 0.22) crop *= vec3(1.25, 1.15, 0.35) * 1.15;                                         // mustard (yellow)
        else if (r < 0.45) crop = mix(crop, vec3(0.36, 0.25, 0.16), 0.75) * (0.85 + 0.15 * step(0.5, fract(ff.y * 18.0))); // ploughed soil
        else if (r < 0.7) crop *= vec3(0.8, 1.15, 0.6);                                              // wheat green
        else if (r < 0.8) crop *= vec3(1.1, 1.0, 0.65);                                              // dry grass
        crop = mix(crop, vec3(0.3, 0.26, 0.18), bund * 0.55);
        // sand towards the sea
        float sand = smoothstep(uSea + 120.0, uSea + 70.0, vWPos.z);
        vec3 sandC = mix(vec3(0.86, 0.78, 0.6), vec3(0.62, 0.55, 0.42), smoothstep(uSea + 18.0, uSea, vWPos.z));
        diffuseColor.rgb = mix(crop, sandC * (0.9 + 0.1 * fh(floor(vWPos.xz * 3.0))), sand);`);
    };
    gm.customProgramCacheKey = () => 'ground'; gm.polygonOffset = true; gm.polygonOffsetFactor = 2; gm.polygonOffsetUnits = 8;
    const ground = new THREE.Mesh(gGeo, gm); ground.receiveShadow = true; ground.position.set((WORLD_MIN_X + WORLD_MAX_X) / 2, -0.05, (WORLD_MIN_Z + WORLD_MAX_Z) / 2);
    this.ground = ground; this.scene.add(ground);
    this.buildGates();
    // ---- sea ----
    const wn = waterNormalTex(); wn.repeat.set(60, 20); this.waterTex = wn;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 3000).rotateX(-Math.PI / 2), Q.cars === 'physical'
      ? new THREE.MeshPhysicalMaterial({ color: 0x0d3b4a, roughness: 0.06, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2 })
      : new THREE.MeshStandardMaterial({ color: 0x0d3b4a, roughness: 0.08, metalness: 0.3, normalMap: wn }));
    sea.position.set((WORLD_MIN_X + WORLD_MAX_X) / 2, 0.05, SEA_Z - 1500); this.scene.add(sea); this.sea = sea;
    // ---- distant hills (nature, not fake cities) + boundary fence ----
    this.buildHills();
    const t = 3; this.bounds = [[WORLD_MIN_X - 40, WORLD_MIN_Z - 40, WORLD_MAX_X + 40, WORLD_MIN_Z - t], [WORLD_MIN_X - 40, WORLD_MAX_Z + t, WORLD_MAX_X + 40, WORLD_MAX_Z + 40],
      [WORLD_MIN_X - 40, WORLD_MIN_Z, WORLD_MIN_X - t, WORLD_MAX_Z], [WORLD_MAX_X + t, WORLD_MIN_Z, WORLD_MAX_X + 40, WORLD_MAX_Z]];
    for (const b of this.bounds) this.addCollider(...b, 50, 'wall');
    this.addCollider(WORLD_MIN_X, SEA_Z - 400, WORLD_MAX_X, SEA_Z + 2, 50, 'wall'); // can't drive into the sea
  }
  buildHills() {
    const segs = 160, rings = 6; const pos = [], col = [], idx = [];
    const cx = (WORLD_MIN_X + WORLD_MAX_X) / 2, cz = (WORLD_MIN_Z + WORLD_MAX_Z) / 2; const R0 = (WORLD_MAX_X - WORLD_MIN_X) * 0.5 + 220;
    for (let r = 0; r <= rings; r++) for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2; const rad = R0 + r * 160; const n = Math.sin(a * 7 + 1.3) * 0.5 + Math.sin(a * 13 + 0.4) * 0.3 + Math.sin(a * 3.1) * 0.6;
      const h = r === 0 ? 0 : (40 + 70 * (n + 1.2)) * Math.min(1, r / 2.5) * (r === rings ? 0.6 : 1);
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad; pos.push(x, h - 2, z);
      const south = Math.sin(a) < -0.55; const g = south ? 0 : 1; const c = new THREE.Color().setRGB(0.24 + 0.1 * (h / 200), 0.33 - 0.05 * (h / 200), 0.18).multiplyScalar(g ? 1 : 0); col.push(c.r, c.g, c.b);
      if (south) pos[pos.length - 2] = -20; // no hills over the sea
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); m.receiveShadow = false; this.scene.add(m);
  }

  // ---------- streaming ----------
  chunkKey(cx, cz) { return cx + ',' + cz; }
  stream(focus, budgetMs = 6, all = false) {
    const fcx = Math.floor((focus.x - ORIGIN) / CHS), fcz = Math.floor((focus.z - ORIGIN) / CHS);
    const rC = Math.ceil(this.lodR / CHS) + 1; const want = new Map();
    for (let cx = fcx - rC; cx <= fcx + rC; cx++) for (let cz = fcz - rC; cz <= fcz + rC; cz++) {
      if ((cx + 1) * CH <= BX0 || cx * CH >= BX1 || (cz + 1) * CH <= BZ0 || cz * CH >= BZ1) continue;
      const mx = ORIGIN + (cx + 0.5) * CHS, mz = ORIGIN + (cz + 0.5) * CHS; const d = Math.max(0, Math.hypot(mx - focus.x, mz - focus.z) - CHS * 0.7);
      if (d > this.lodR) continue; want.set(this.chunkKey(cx, cz), { cx, cz, lod: d < this.fullR ? 0 : 1, d });
    }
    for (const [k, ch] of this.chunks) { const w = want.get(k); if (!w && ch.dist(focus) > this.lodR + 120) this.unload(k); }
    const todo = []; for (const [k, w] of want) { const ch = this.chunks.get(k); if (!ch || ch.lod !== w.lod) todo.push(w); }
    todo.sort((a, b) => (a.lod - b.lod) * 1000 + a.d - b.d);
    const t0 = performance.now(); let n = 0;
    for (const w of todo) { if (!all && n > 0 && performance.now() - t0 > budgetMs) break; this.load(w.cx, w.cz, w.lod); n++; if (!all && n >= 2) break; }
    return todo.length - n;
  }
  unload(k) { const ch = this.chunks.get(k); if (!ch) return; this.group.remove(ch.group); ch.group.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); for (const c of ch.colliders) this.removeCollider(c);
    this.chunks.delete(k); this.blocks = this.blocks.filter(b => b.chunk !== ch); this.onUnload && this.onUnload(ch); }
  load(cx, cz, lod) {
    const k = this.chunkKey(cx, cz); if (this.chunks.has(k)) this.unload(k);
    const ch = { cx, cz, lod, group: new THREE.Group(), colliders: [], camBlocks: [], lamps: [], heads: [], parked: [], blocks: [],
      dist(f) { return Math.hypot(ORIGIN + (cx + 0.5) * CHS - f.x, ORIGIN + (cz + 0.5) * CHS - f.z) - CHS * 0.7; } };
    this._cur = ch; this.buildChunk(ch); this._cur = null;
    this.chunks.set(k, ch); this.group.add(ch.group); for (const b of ch.blocks) this.blocks.push(b);
    this.onLoad && this.onLoad(ch);
  }
  buildChunk(ch) {
    const { cx, cz, lod } = ch; const M = this.mats; const full = lod === 0;
    const gb = { side: new GB(), curb: new GB(), roof: new GB(), grass: new GB(), road: new GB(), white: new GB(), yellow: new GB(), sign: new GB(), awn: new GB(), walls: M.wallMats.map(() => new GB(true)) };
    gb.awn.colors = [];
    const inst = { tank: [], ac: [], tree: [[], [], []], hay: [], lamp: [], pole: [], palm: [], flag: [], flagC: [] };
    const bx0 = cx * CH, bz0 = cz * CH;
    // roads (segments starting in this chunk + intersections in this chunk)
    for (let i = bx0; i < bx0 + CH; i++) for (let j = bz0; j < bz0 + CH; j++) {
      if (interDegree(i, j) > 0) this.buildIntersection(gb, ch, i, j, full);
      if (segX(i, j)) this.buildSegment(gb, inst, ch, 'x', j, i, full);
      if (segZ(i, j)) this.buildSegment(gb, inst, ch, 'z', i, j, full);
    }
    for (let bx = bx0; bx < bx0 + CH; bx++) for (let bz = bz0; bz < bz0 + CH; bz++) this.buildBlock(gb, inst, ch, bx, bz, full);
    // ---- meshes ----
    const add = (g, mat, cast = true, recv = true) => { if (g.empty) return null; const m = new THREE.Mesh(g.build(), mat); m.castShadow = cast; m.receiveShadow = recv; m.userData.own = true; ch.group.add(m); return m; };
    add(gb.road, M.roadMat, false); add(gb.side, M.pavers, false); add(gb.curb, M.curbMat, false); add(gb.roof, M.roofMat, false); add(gb.grass, M.grassMat, false);
    add(gb.white, M.markW, false); add(gb.yellow, M.markY, false);
    if (full && this.Q.id !== 'low' && this.Q.id !== 'medium') gb.walls.forEach((g, i) => add(g, M.wallMats[i], true, true));
    else if (full) { const groups = this.Q.id === 'low' ? [[0, 2, 6, 7], [3, 5], [1, 4, 8, 9]] : [[0, 6], [2, 7], [3], [5, 1], [4, 8, 9]];
      for (const grp of groups) { const all = new GB(true); for (const gi of grp) { const g = gb.walls[gi]; const base = all.p.length / 3; all.p.push(...g.p); all.n.push(...g.n); all.uv.push(...g.uv); all.info.push(...g.info); all.info2.push(...g.info2); for (const k of g.i) all.i.push(k + base); } add(all, M.wallMats[grp[0]], true, true); } }
    else { const all = new GB(true); for (const g of gb.walls) { const base = all.p.length / 3; all.p.push(...g.p); all.n.push(...g.n); all.uv.push(...g.uv); all.info.push(...g.info); all.info2.push(...g.info2); for (const k of g.i) all.i.push(k + base); } add(all, M.wallMats[4], false, true); }
    add(gb.sign, M.signMat, false, true);
    if (!gb.awn.empty) { const g = gb.awn.build(); g.setAttribute('color', new THREE.Float32BufferAttribute(gb.awn.colors, 3)); const m = new THREE.Mesh(g, M.awnMat); m.castShadow = full; m.receiveShadow = true; m.userData.own = true; ch.group.add(m); }
    const I = (geo, mat, list, cast = true) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); ch.group.add(im); return im; };
    I(this.geos.tank, M.tankMat, inst.tank, full); I(this.geos.ac, M.acMat, inst.ac, false);
    I(this.geos.trees[0], M.treeMat, inst.tree.flat(), full);
    I(this.geos.palm, this.palmMat, inst.palm, full);
    if (inst.flag.length) { const im = I(this.geos.flag, this.flagMat, inst.flag, false); const col = new THREE.Color(); inst.flagC.forEach((c, i) => im.setColorAt(i, col.setHex(c))); im.instanceColor.needsUpdate = true; }
    I(this.geos.hay, M.hayMat, inst.hay); I(this.geos.poleBar, M.poleMat, inst.pole, full);
    if (inst.lamp.length) for (const part of this.lampModel.parts) { const im = new THREE.InstancedMesh(part.geometry, part.material, inst.lamp.length); const T = new THREE.Matrix4(); inst.lamp.forEach((m, i) => im.setMatrixAt(i, T.multiplyMatrices(m, part.matrix))); im.castShadow = full; im.receiveShadow = true; im.computeBoundingSphere(); ch.group.add(im); }
  }
  // ---------- roads ----------
  buildIntersection(gb, ch, i, j, full) {
    const x = ORIGIN + i * P, z = ORIGIN + j * P, h = ROAD / 2; const y = 0.004;
    gb.road.quad([x - h, y, z + h], [x + h, y, z + h], [x + h, y, z - h], [x - h, y, z - h], [0, 1, 0], [[x - h, -(z + h)], [x + h, -(z + h)], [x + h, -(z - h)], [x - h, -(z - h)]]);
    const deg = interDegree(i, j);
    if (deg >= 3 && full) ch.heads.push(...this.lightHeads(i, j));
    if (deg >= 3) ch.inters = (ch.inters || []).concat([[i, j]]);
  }
  lightHeads(i, j) {
    const x = ORIGIN + i * P, z = ORIGIN + j * P, o = ROAD / 2 + 1.2; const out = [];
    if (segZ(i, j - 1)) out.push([x - o, z - o - 3.0, 0, 'z', i, j]);
    if (segZ(i, j)) out.push([x + o, z + o + 3.0, Math.PI, 'z', i, j]);
    if (segX(i, j)) out.push([x + o + 3.0, z - o, -Math.PI / 2, 'x', i, j]);
    if (segX(i - 1, j)) out.push([x - o - 3.0, z + o, Math.PI / 2, 'x', i, j]);
    return out;
  }
  buildSegment(gb, inst, ch, axis, line, idx, full) {
    const c = ORIGIN + line * P, h = ROAD / 2, y = 0.004, my = 0.012;
    const s0 = ORIGIN + idx * P + h, s1 = ORIGIN + (idx + 1) * P - h;
    const Q = (A, B, Cc, D) => gb.road.quad(A, B, Cc, D, [0, 1, 0], [A, B, Cc, D].map(p => [p[0], -p[2]]));
    if (axis === 'x') Q([s0, y, c + h], [s1, y, c + h], [s1, y, c - h], [s0, y, c - h]); else Q([c - h, y, s1], [c + h, y, s1], [c + h, y, s0], [c - h, y, s0]);
    const urbanSeg = axis === 'x' ? (isUrban(blockType(idx, line - 1)) || isUrban(blockType(idx, line))) : (isUrban(blockType(line - 1, idx)) || isUrban(blockType(line, idx)));
    const strip = (g, a0, a1, cc, w) => { if (axis === 'x') g.quad([a0, my, cc + w / 2], [a1, my, cc + w / 2], [a1, my, cc - w / 2], [a0, my, cc - w / 2], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); else g.quad([cc - w / 2, my, a1], [cc + w / 2, my, a1], [cc + w / 2, my, a0], [cc - w / 2, my, a0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); };
    const deg0 = axis === 'x' ? interDegree(idx, line) : interDegree(line, idx), deg1 = axis === 'x' ? interDegree(idx + 1, line) : interDegree(line, idx + 1);
    const m0 = s0 + (deg0 >= 3 ? 4 : 0), m1 = s1 - (deg1 >= 3 ? 4 : 0);
    strip(gb.yellow, m0, m1, c - 0.15, 0.12); strip(gb.yellow, m0, m1, c + 0.15, 0.12);
    if (full) for (let t = m0; t < m1 - 3; t += 9) { strip(gb.white, t, t + 3, c - 3.5, 0.13); strip(gb.white, t, t + 3, c + 3.5, 0.13); }
    strip(gb.white, s0 - (deg0 >= 3 ? 0 : h), s1 + (deg1 >= 3 ? 0 : h), c - h + 0.35, 0.14); strip(gb.white, s0 - (deg0 >= 3 ? 0 : h), s1 + (deg1 >= 3 ? 0 : h), c + h - 0.35, 0.14);
    if (full) for (const [zs, dir, deg] of [[s0, 1, deg0], [s1, -1, deg1]]) { if (deg < 3) continue;
      for (let k = -h + 0.8; k < h - 0.6; k += 1.1) {
        if (axis === 'x') gb.white.quad([zs, my, c + k + 0.55], [zs + dir * 3, my, c + k + 0.55], [zs + dir * 3, my, c + k], [zs, my, c + k], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        else gb.white.quad([c + k, my, zs], [c + k + 0.55, my, zs], [c + k + 0.55, my, zs + dir * 3], [c + k, my, zs + dir * 3], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      } }
    // festive bunting across Sonapur's bazaar streets
    const regAx = axis === 'x' ? blockType(idx, line) : blockType(line, idx);
    if (full && regAx === 'town') { const FC = [0xff9933, 0xffffff, 0x138808, 0xe91e63, 0xffeb3b, 0x2196f3, 0xff5722];
      for (let s = s0 + 12; s < s1 - 8; s += 16) { const span = ROAD + 2 * SIDE - 1.5; const n = Math.floor(span / 0.55);
        for (let f = 0; f <= n; f++) { const u = f / n, a = -span / 2 + u * span, y = 6.6 - Math.sin(u * Math.PI) * 1.1; const pos = axis === 'x' ? new THREE.Vector3(s, y, c + a) : new THREE.Vector3(c + a, y, s);
          inst.flag.push(new THREE.Matrix4().compose(pos, q0.setFromEuler(e0.set(0, axis === 'x' ? 0 : Math.PI / 2, 0)), ONE)); inst.flagC.push(FC[(f + Math.floor(s)) % FC.length]); } } }
    // street lamps (urban: staggered both sides; highway: one side every 60 m) / electricity poles on highways
    const lm = this.lampModel; const sc = 8.5 / lm.H; const reach = lm.arm * sc; const S = new THREE.Vector3(sc, sc, sc); const q = new THREE.Quaternion(), e = new THREE.Euler();
    const spacing = urbanSeg ? 28 : 56; let k = 0;
    for (let s = s0 + 8; s <= s1 - 6; s += spacing, k++) for (const side of [-1, 1]) {
      if (urbanSeg ? (k + (side > 0 ? 1 : 0)) % 2 : side < 0) continue;
      const edge = h + (urbanSeg ? 0.5 : 1.2); let x, z, yaw, ax = 0, az = 0;
      if (axis === 'z') { x = c + side * edge; z = s; yaw = (side > 0 ? Math.PI : 0) - lm.armAxis; ax = side > 0 ? -1 : 1; }
      else { x = s; z = c + side * edge; yaw = (side > 0 ? -Math.PI / 2 : Math.PI / 2) - lm.armAxis; az = side > 0 ? -1 : 1; }
      q.setFromEuler(e.set(0, yaw, 0)); inst.lamp.push(new THREE.Matrix4().compose(new THREE.Vector3(x, urbanSeg ? CURB : 0, z), q, S));
      ch.lamps.push({ x, z, hx: x + ax * reach * 0.9, hy: 8.2, hz: z + az * reach * 0.9 });
      if (urbanSeg) this.addCollider(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 8, 'lamp');
    }
    if (!urbanSeg && full) { // electricity poles + roadside trees along highways (very desi)
      for (let s = s0 + 20; s <= s1; s += 40) { const off = h + 4.5; const x = axis === 'z' ? c - off : s, z = axis === 'z' ? s : c - off;
        inst.pole.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e.set(0, axis === 'z' ? Math.PI / 2 : 0, 0)), new THREE.Vector3(1, 1, 1))); this.addCollider(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 9, 'pole'); }
      for (let s = s0 + 10; s <= s1; s += 22) { const r = hash2(Math.round(s), line, 5); if (r < 0.35) continue; const off = h + 7 + r * 4; const x = axis === 'z' ? c + off : s, z = axis === 'z' ? s : c + off; const sc2 = 0.9 + r * 0.6;
        inst.tree[Math.floor(r * 3) % 3].push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q.setFromEuler(e.set(0, r * 9, 0)), new THREE.Vector3(sc2, sc2, sc2))); this.addCollider(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 6, 'tree'); }
    }
  }
  // ---------- blocks ----------
  buildBlock(gb, inst, ch, bx, bz, full) {
    const type = blockType(bx, bz); if (type === 'out' || type === 'sea') return;
    const [x0, z0, x1, z1] = this.blockRect(bx, bz); const R = rng(Math.floor(hash2(bx, bz, 1) * 1e9));
    const q = new THREE.Quaternion(), e = new THREE.Euler(), M4 = () => new THREE.Matrix4();
    if (isUrban(type)) {
      gb.side.box(x0 + 0.25, 0, z0 + 0.25, x1 - 0.25, CURB, z1 - 0.25, 1, { sides: false });
      gb.curb.box(x0, 0, z0, x1, CURB, z1, 0.5, { top: false });
      if (full) { gb.curb.box(x0, CURB - 0.001, z0, x1, CURB, z0 + 0.25, 0.5, { sides: false }); gb.curb.box(x0, CURB - 0.001, z1 - 0.25, x1, CURB, z1, 0.5, { sides: false });
        gb.curb.box(x0, CURB - 0.001, z0 + 0.25, x0 + 0.25, CURB, z1 - 0.25, 0.5, { sides: false }); gb.curb.box(x1 - 0.25, CURB - 0.001, z0 + 0.25, x1, CURB, z1 - 0.25, 0.5, { sides: false }); }
      const blk = { bx, bz, x0, z0, x1, z1, kind: 'normal', chunk: ch, region: type }; ch.blocks.push(blk);
      const isPark = type === 'city' && bx === this.parkBlock[0] && bz === this.parkBlock[1];
      if (isPark || (type !== 'city' && R() < 0.06)) { blk.kind = 'park'; gb.grass.box(x0 + SIDE, CURB, z0 + SIDE, x1 - SIDE, CURB + 0.02, z1 - SIDE, 1, { sides: false });
        for (let k = 0; k < 16; k++) { const tx = x0 + SIDE + 4 + R() * (BLOCK - 2 * SIDE - 8), tz = z0 + SIDE + 4 + R() * (BLOCK - 2 * SIDE - 8), s = 0.9 + R() * 0.7; inst.tree[k % 3].push(M4().compose(new THREE.Vector3(tx, CURB, tz), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, s, s))); this.addCollider(tx - 0.35, tz - 0.35, tx + 0.35, tz + 0.35, 6, 'tree'); }
        return; }
      if (type === 'coast' && full) for (const [px, pz] of [[x0 + 1.6, z0 + 1.6], [x1 - 1.6, z0 + 1.6], [x0 + 1.6, z1 - 1.6], [x1 - 1.6, z1 - 1.6], [(x0 + x1) / 2, z0 + 1.6], [(x0 + x1) / 2, z1 - 1.6], [x0 + 1.6, (z0 + z1) / 2], [x1 - 1.6, (z0 + z1) / 2]]) { const s = 0.75 + R() * 0.3; inst.palm.push(M4().compose(new THREE.Vector3(px, CURB, pz), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, s, s))); this.addCollider(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3, 7, 'tree'); }
      this.buildUrbanLots(gb, inst, ch, type, bx, bz, x0, z0, x1, z1, R, full);
      return;
    }
    if (type === 'beach' && full) { for (let k = 0; k < 9; k++) { const tx = x0 + 4 + R() * (BLOCK - 8), tz = z0 + 6 + R() * (BLOCK * 0.55), s = 0.85 + R() * 0.45; inst.palm.push(M4().compose(new THREE.Vector3(tx, 0, tz), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, s, s))); this.addCollider(tx - 0.3, tz - 0.3, tx + 0.3, tz + 0.3, 7, 'tree'); } return; }
    if (type === 'village') { this.buildVillage(gb, inst, bx, bz, x0, z0, x1, z1, R, full); return; }
    if (type === 'dhaba') { this.buildDhaba(gb, inst, ch, bx, bz, x0, z0, x1, z1, R, full); return; }
    if (type === 'field' && full) { // a few trees / haystacks scattered on field edges
      const n = Math.floor(R() * 4); for (let k = 0; k < n; k++) { const tx = x0 + R() * BLOCK, tz = z0 + R() * BLOCK, s = 0.9 + R() * 0.8; inst.tree[k % 3].push(M4().compose(new THREE.Vector3(tx, 0, tz), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, s, s))); this.addCollider(tx - 0.35, tz - 0.35, tx + 0.35, tz + 0.35, 6, 'tree'); }
      if (R() < 0.3) { const hx = x0 + 10 + R() * 50, hz = z0 + 10 + R() * 50; inst.hay.push(M4().makeTranslation(hx, 0, hz)); this.addCollider(hx - 1.3, hz - 1.3, hx + 1.3, hz + 1.3, 2.6, 'hay'); }
    }
  }
  buildUrbanLots(gb, inst, ch, type, bx, bz, x0, z0, x1, z1, R, full) {
    const M = this.mats;
    const dist = type === 'city' ? this.district(bx, bz) : type === 'coast' ? (bz <= -16 ? 'downtown' : 'mid') : 'bazaar';
    const ix0 = x0 + SIDE, iz0 = z0 + SIDE, ix1 = x1 - SIDE, iz1 = z1 - SIDE;
    const lots = [];
    const split = (a, b) => { const out = []; let s = a; const w = dist === 'bazaar' ? 6 : 9; while (s < b - 6) { const ww = Math.min(b - s, w + R() * (dist === 'bazaar' ? 6 : 12)); out.push([s, s + ww]); s += ww; } if (out.length) out[out.length - 1][1] = b; return out; };
    if (dist === 'downtown' && R() < 0.75) {
      const mx = (ix0 + ix1) / 2 + (R() - 0.5) * 8, mz = (iz0 + iz1) / 2 + (R() - 0.5) * 8;
      for (const [a, b, c, d] of [[ix0, iz0, mx, mz], [mx, iz0, ix1, mz], [ix0, mz, mx, iz1], [mx, mz, ix1, iz1]]) lots.push([a + 0.6, b + 0.6, c - 0.6, d - 0.6, true]);
    } else {
      const depth = () => (dist === 'bazaar' ? 12 : 15) + R() * 8;
      const dN = depth(), dS = depth();
      for (const [a, b] of split(ix0, ix1)) { lots.push([a, iz0, b, iz0 + dN, false]); lots.push([a, iz1 - dS, b, iz1, false]); }
      const dW = depth(), dE = depth();
      for (const [a, b] of split(iz0 + dN, iz1 - dS)) { lots.push([ix0, a, ix0 + dW, b, false]); lots.push([ix1 - dE, a, ix1, b, false]); }
      gb.roof.box(ix0 + dW, CURB, iz0 + dN, ix1 - dE, CURB + 0.03, iz1 - dS, 1, { sides: false });
    }
    for (const [lx0, lz0, lx1, lz1, big] of lots) {
      const inset = 0.25; const bx0 = lx0 + inset, bz0 = lz0 + inset, bx1 = lx1 - inset, bz1 = lz1 - inset;
      if (bx1 - bx0 < 4 || bz1 - bz0 < 4) continue;
      let floors;
      if (dist === 'downtown') floors = big ? 8 + Math.floor(R() * R() * 26) : 5 + Math.floor(R() * 8);
      else if (dist === 'mid') floors = 3 + Math.floor(R() * 6);
      else if (dist === 'bazaar') floors = 2 + Math.floor(R() * 3);
      else floors = 2 + Math.floor(R() * 3);
      let mi;
      if (big && floors > 12) mi = R() < 0.6 ? 9 : 8; else if (dist === 'bazaar') mi = [0, 2, 5, 6, 7, 0, 6, 3][Math.floor(R() * 8)]; else mi = Math.floor(R() * 8);
      const mat = M.wallMats[mi]; const style = mat.userData.style;
      const flH = style === 1 ? 3.6 : 3.2 + R() * 0.3;
      const H = floors * flH + 1.1 + CURB;
      const bayW = style === 1 ? 2.2 + R() * 0.8 : 2.8 + R() * 1.2;
      const seed = R(); const shop = dist !== 'low' || R() < 0.4;
      this.addBuilding(gb.walls[mi], bx0, bz0, bx1, bz1, H, { seed, flH, bayW, style, shop });
      gb.roof.box(bx0, H - 0.02, bz0, bx1, H, bz1, 1, { sides: false });
      this.addCollider(bx0, bz0, bx1, bz1, H, 'bld');
      if (full) {
        const nt = big ? Math.floor(R() * 3) : 1 + Math.floor(R() * 2.5);
        for (let k = 0; k < nt; k++) { const s = 0.8 + R() * 0.5; inst.tank.push(new THREE.Matrix4().compose(new THREE.Vector3(bx0 + 1.5 + R() * (bx1 - bx0 - 3), H, bz0 + 1.5 + R() * (bz1 - bz0 - 3)), new THREE.Quaternion(), new THREE.Vector3(s, s, s))); }
        for (let k = 0; k < 2; k++) if (R() < 0.6) inst.ac.push(new THREE.Matrix4().compose(new THREE.Vector3(bx0 + 1 + R() * (bx1 - bx0 - 2), H, bz0 + 1 + R() * (bz1 - bz0 - 2)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * Math.PI, 0)), new THREE.Vector3(1, 1, 1)));
        if (shop) this.addShopfronts(gb.sign, gb.awn, bx0, bz0, bx1, bz1, x0, z0, x1, z1, flH, R);
      }
    }
  }
  buildVillage(gb, inst, bx, bz, x0, z0, x1, z1, R, full) {
    const M = this.mats; const n = 5 + Math.floor(R() * 5);
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < n; k++) {
      const w = 6 + R() * 5, d = 6 + R() * 4; const hx = x0 + 6 + R() * (BLOCK - 12 - w), hz = z0 + 6 + R() * (BLOCK - 12 - d);
      if (this.query(hx + w / 2, hz + d / 2, Math.max(w, d)).some(c => c.tag === 'bld' && !(hx + w < c.x0 - 2 || hx > c.x1 + 2 || hz + d < c.z0 - 2 || hz > c.z1 + 2))) continue;
      const floors = R() < 0.7 ? 1 : 2; const mi = [3, 5, 0, 6, 4, 3][Math.floor(R() * 6)]; const H = floors * 3.1 + 0.6;
      this.addBuilding(gb.walls[mi], hx, hz, hx + w, hz + d, H, { seed: R(), flH: 3.1, bayW: 2.6, style: M.wallMats[mi].userData.style === 1 ? 0 : M.wallMats[mi].userData.style, shop: false });
      gb.roof.box(hx - 0.2, H - 0.02, hz - 0.2, hx + w + 0.2, H + 0.12, hz + d + 0.2, 1, {});
      this.addCollider(hx, hz, hx + w, hz + d, H, 'bld');
    }
    if (full) for (let k = 0; k < 10; k++) { const tx = x0 + R() * BLOCK, tz = z0 + R() * BLOCK; if (this.query(tx, tz, 2).some(c => c.tag === 'bld')) continue; const s = 0.9 + R() * 0.7; inst.tree[k % 3].push(new THREE.Matrix4().compose(new THREE.Vector3(tx, 0, tz), q.setFromEuler(e.set(0, R() * 6.28, 0)), new THREE.Vector3(s, s, s))); this.addCollider(tx - 0.35, tz - 0.35, tx + 0.35, tz + 0.35, 6, 'tree'); }
    if (full) for (let k = 0; k < 3; k++) { const hx = x0 + 8 + R() * 54, hz = z0 + 8 + R() * 54; if (this.query(hx, hz, 3).some(c => c.tag === 'bld')) continue; inst.hay.push(new THREE.Matrix4().makeTranslation(hx, 0, hz)); this.addCollider(hx - 1.3, hz - 1.3, hx + 1.3, hz + 1.3, 2.6, 'hay'); }
  }
  buildDhaba(gb, inst, ch, bx, bz, x0, z0, x1, z1, R, full) {
    const M = this.mats; const name = (DHABAS.find(d => d[0] === bx && d[1] === bz) || [0, 0, 'DHABA'])[2];
    // which side faces a highway?
    const sides = [['n', segX(bx, bz)], ['s', segX(bx, bz + 1)], ['w', segZ(bx, bz)], ['e', segZ(bx + 1, bz)]].filter(s => s[1]);
    const side = sides.length ? sides[0][0] : 'n';
    const w = 26, d = 10; let hx0, hz0, hx1, hz1;
    if (side === 'n') { hx0 = x0 + 22; hz0 = z0 + 14; hx1 = hx0 + w; hz1 = hz0 + d; } else if (side === 's') { hx0 = x0 + 22; hz1 = z1 - 14; hz0 = hz1 - d; hx1 = hx0 + w; }
    else if (side === 'w') { hx0 = x0 + 14; hz0 = z0 + 22; hx1 = hx0 + d; hz1 = hz0 + w; } else { hx1 = x1 - 14; hx0 = hx1 - d; hz0 = z0 + 22; hz1 = hz0 + w; }
    const H = 3.6; this.addBuilding(gb.walls[0], hx0, hz0, hx1, hz1, H, { seed: R(), flH: 3.4, bayW: 3.2, style: 0, shop: true });
    gb.roof.box(hx0 - 0.3, H, hz0 - 0.3, hx1 + 0.3, H + 0.15, hz1 + 0.3, 1, {}); this.addCollider(hx0, hz0, hx1, hz1, H, 'bld');
    // forecourt: packed earth is the ground; big signboard facing the road
    this._cur.dhaba = { name, x: (hx0 + hx1) / 2, z: (hz0 + hz1) / 2, side };
    if (full) { this.addShopfronts(gb.sign, gb.awn, hx0, hz0, hx1, hz1, hx0 - 15, hz0 - 15, hx1 + 15, hz1 + 15, 3.4, R);
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let k = 0; k < 5; k++) { const tx = x0 + R() * BLOCK, tz = z0 + R() * BLOCK; if (this.query(tx, tz, 3).some(c => c.tag === 'bld')) continue; const s = 1 + R() * 0.6; inst.tree[k % 3].push(new THREE.Matrix4().compose(new THREE.Vector3(tx, 0, tz), q.setFromEuler(e.set(0, R() * 6, 0)), new THREE.Vector3(s, s, s))); this.addCollider(tx - 0.35, tz - 0.35, tx + 0.35, tz + 0.35, 6, 'tree'); }
      // parked trucks & cars in front (spawned by the traffic system as empty vehicles)
      const fx = side === 'n' ? 0 : side === 's' ? 0 : side === 'w' ? -1 : 1, fz = side === 'n' ? -1 : side === 's' ? 1 : 0;
      for (let k = 0; k < 2; k++) { const px = (hx0 + hx1) / 2 + fx * 8 + (fz ? (k - 0.5) * 9 : 0), pz = (hz0 + hz1) / 2 + fz * 8 + (fx ? (k - 0.5) * 9 : 0); this._cur.parked.push({ x: px, z: pz, heading: fz ? Math.PI / 2 : 0, type: k ? 'van' : 'suv' }); }
    }
  }
  addBuilding(gb, x0, z0, x1, z1, H, o) {
    const faces = [
      [[x0, z1], [x1, z1], [0, 0, 1]], // south (+z)
      [[x1, z1], [x1, z0], [1, 0, 0]],
      [[x1, z0], [x0, z0], [0, 0, -1]],
      [[x0, z0], [x0, z1], [-1, 0, 0]],
    ];
    for (const [a, b, n] of faces) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // shop only on faces that look at a road (i.e. outward from block center): approximate by checking a point 6m out
      const ox = (a[0] + b[0]) / 2 + n[0] * 6, oz = (a[1] + b[1]) / 2 + n[2] * 6;
      let outside = true; for (const c of this.query(ox, oz, 0.5)) if (ox > c.x0 && ox < c.x1 && oz > c.z0 && oz < c.z1) { outside = false; break; }
      const shop = o.shop && outside ? 1 : 0;
      const info = [o.seed, o.flH, o.bayW, o.style], info2 = [H - CURB, shop, 0, L];
      gb.quad([a[0], CURB, a[1]], [b[0], CURB, b[1]], [b[0], H, b[1]], [a[0], H, a[1]], n, [[0, 0], [L, 0], [L, H - CURB], [0, H - CURB]], info, info2);
    }
  }

  addShopfronts(signGB, awnGB, x0, z0, x1, z1, bx0, bz0, bx1, bz1, flH, R) {
    // signboards on faces that are close to the block edge (street-facing)
    const near = 6.5;
    const faces = [];
    if (z1 > bz1 - SIDE - near) faces.push(['s', x0, x1, z1, [0, 0, 1]]);
    if (z0 < bz0 + SIDE + near) faces.push(['n', x1, x0, z0, [0, 0, -1]]);
    if (x1 > bx1 - SIDE - near) faces.push(['e', z1, z0, x1, [1, 0, 0]]);
    if (x0 < bx0 + SIDE + near) faces.push(['w', z0, z1, x0, [-1, 0, 0]]);
    const { cols, rows } = { cols: 4, rows: 16 };
    if (!awnGB.colors) awnGB.colors = [];
    for (const [side, a0, a1, c, n] of faces) {
      const L = Math.abs(a1 - a0); if (L < 5) continue;
      const nSigns = Math.max(1, Math.floor(L / 9));
      const seg = L / nSigns;
      for (let s = 0; s < nSigns; s++) {
        const idx = Math.floor(R() * cols * rows); const u0 = (idx % cols) / cols, v0 = 1 - (Math.floor(idx / cols) + 1) / rows;
        const uvs = [[u0, v0], [u0 + 1 / cols, v0], [u0 + 1 / cols, v0 + 1 / rows], [u0, v0 + 1 / rows]];
        const w0 = s * seg + 0.6, w1 = (s + 1) * seg - 0.6; const y0 = CURB + flH * 0.86, y1 = y0 + Math.min(1.25, (w1 - w0) / 4.2);
        const off = 0.12; const dir = Math.sign(a1 - a0);
        const A = a0 + dir * w0, B = a0 + dir * w1;
        let p;
        if (side === 's' || side === 'n') p = [[A, y0, c + n[2] * off], [B, y0, c + n[2] * off], [B, y1, c + n[2] * off], [A, y1, c + n[2] * off]];
        else p = [[c + n[0] * off, y0, A], [c + n[0] * off, y0, B], [c + n[0] * off, y1, B], [c + n[0] * off, y1, A]];
        signGB.quad(p[0], p[1], p[2], p[3], n, uvs);
        // awning below sign (sloped cloth)
        if (R() < 0.55) {
          const col = [[0.75, 0.1, 0.08], [0.1, 0.35, 0.7], [0.1, 0.5, 0.2], [0.85, 0.55, 0.05], [0.5, 0.1, 0.5]][Math.floor(R() * 5)];
          const ay0 = y0 - 0.15, ay1 = ay0 - 0.7, d = 1.4;
          let q;
          if (side === 's' || side === 'n') q = [[A, ay1, c + n[2] * d], [B, ay1, c + n[2] * d], [B, ay0, c + n[2] * 0.05], [A, ay0, c + n[2] * 0.05]];
          else q = [[c + n[0] * d, ay1, A], [c + n[0] * d, ay1, B], [c + n[0] * 0.05, ay0, B], [c + n[0] * 0.05, ay0, A]];
          awnGB.quad(q[0], q[1], q[2], q[3], [n[0], 0.7, n[2]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
          this._cur.camBlocks.push({ x0: Math.min(...q.map(p => p[0])) - 0.2, x1: Math.max(...q.map(p => p[0])) + 0.2, z0: Math.min(...q.map(p => p[2])) - 0.2, z1: Math.max(...q.map(p => p[2])) + 0.2, y0: ay1 - 0.3, y1: ay0 + 0.3 });
          for (let k = 0; k < 4; k++) awnGB.colors.push(...col);
        }
      }
    }
  }


  update(env) {
    facadeUniforms.uNight.value = env.night;
    facadeUniforms.uWet.value = Math.min(1, env.rain * 1.3);
    if (this.signMat) this.signMat.emissiveIntensity = 0.05 + env.night * 1.6;
    if (this.gateMats) for (const m of this.gateMats) m.emissiveIntensity = 0.15 + env.night * 0.9;
    if (this.waterTex) { this.waterTex.offset.x += 0.00012; this.waterTex.offset.y += 0.00007; }
  }
}
