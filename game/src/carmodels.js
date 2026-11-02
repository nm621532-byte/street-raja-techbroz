
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Procedural, realistic-proportion car generator (lofted body with real wheel arches, tinted glass cabin,
// alloy wheels, lights). Original designs — no real brands.
export const SPECS = {
  sedan:  { L: 4.5, W: 1.78, belt: 0.98, roof: 1.45, hood: 0.86, nose: 0.62, tail: 0.78, R: 0.32, wb: 2.65, cab0: 0.62, cab1: -1.30, ws: 0.78, rw: 0.62, clear: 0.17, kind: 'car', mass: 1300, power: 7.4, top: 46, grip: 9 },
  hatch:  { L: 3.95, W: 1.72, belt: 0.98, roof: 1.48, hood: 0.86, nose: 0.62, tail: 0.85, R: 0.31, wb: 2.45, cab0: 0.55, cab1: -1.88, ws: 0.72, rw: 0.28, clear: 0.16, kind: 'car', mass: 1100, power: 8.2, top: 48, grip: 9.5 },
  suv:    { L: 4.7, W: 1.9, belt: 1.18, roof: 1.80, hood: 1.08, nose: 0.82, tail: 1.05, R: 0.38, wb: 2.75, cab0: 0.55, cab1: -2.2, ws: 0.65, rw: 0.22, clear: 0.24, kind: 'car', mass: 1900, power: 8.2, top: 45, grip: 8.5 },
  sports: { L: 4.55, W: 1.92, belt: 0.82, roof: 1.22, hood: 0.72, nose: 0.48, tail: 0.74, R: 0.34, wb: 2.6, cab0: 0.35, cab1: -1.25, ws: 0.95, rw: 1.0, clear: 0.12, kind: 'car', mass: 1250, power: 11.7, top: 64, grip: 11 },
  van:    { L: 4.9, W: 1.9, belt: 1.12, roof: 2.05, hood: 1.0, nose: 0.75, tail: 1.1, R: 0.34, wb: 3.0, cab0: 1.45, cab1: -2.42, ws: 0.6, rw: 0.06, clear: 0.2, kind: 'car', mass: 2200, power: 6.2, top: 38, grip: 8 },
  taxi:   { L: 4.05, W: 1.6, belt: 0.96, roof: 1.47, hood: 0.88, nose: 0.66, tail: 0.84, R: 0.30, wb: 2.4, cab0: 0.42, cab1: -1.15, ws: 0.5, rw: 0.45, clear: 0.18, kind: 'car', mass: 1050, power: 6.6, top: 40, grip: 8.5, twoTone: [0x111111, 0xf2c200] },
  police: { L: 4.6, W: 1.8, belt: 0.98, roof: 1.46, hood: 0.86, nose: 0.62, tail: 0.78, R: 0.33, wb: 2.7, cab0: 0.62, cab1: -1.30, ws: 0.78, rw: 0.62, clear: 0.17, kind: 'police', mass: 1450, power: 10.1, top: 56, grip: 10, paint: 0xf4f4f4, lightbar: true, stripe: 0x1a3fa0 },
  ambulance: { L: 5.2, W: 1.95, belt: 1.12, roof: 2.25, hood: 1.0, nose: 0.75, tail: 1.1, R: 0.35, wb: 3.2, cab0: 1.6, cab1: -2.57, ws: 0.6, rw: 0.06, clear: 0.2, kind: 'car', mass: 2600, power: 7.0, top: 42, grip: 8, paint: 0xf4f4f4, stripe: 0xc8102e, lightbar: true },
};
const PAINTS = [0xb0121b, 0xf0f0ec, 0x0d0f12, 0x1d3f8a, 0x8e9499, 0xc9b38a, 0x0f5132, 0xd96c06, 0x6b0f0f, 0x223344, 0xd7d9db, 0x5c6b73, 0xe3e4e0, 0x7a1f2b];
export function randomPaint() { return PAINTS[Math.floor(Math.random() * PAINTS.length)]; }

const geoCache = {};
function smooth01(t) { return t * t * (3 - 2 * t); }
function bodyGeometry(s) {
  const L = s.L, hw = s.W / 2, NZ = 96;
  const zf = L / 2, zr = -L / 2; const wf = s.wb * 0.5 + 0.03, wr = -s.wb * 0.5 + 0.03; const arch = s.R + 0.07;
  const wheelY = s.R; // wheel centre height
  const pos = [], idxPaint = [], idxDark = [], idxGlass = [];
  const rings = [];
  const plan = (t) => { const a = Math.abs(t); return Math.pow(Math.max(0, 1 - Math.pow(a, 7)), 1 / 7); };
  const topAt = (z) => { // beltline / hood / trunk profile
    if (z > s.cab0) { const t = (z - s.cab0) / (zf - s.cab0); return THREE.MathUtils.lerp(s.hood + 0.04, s.nose, smooth01(Math.pow(t, 1.6))); }
    if (z < s.cab1) { const t = (s.cab1 - z) / (s.cab1 - zr); return THREE.MathUtils.lerp(s.belt, s.tail, smooth01(Math.pow(t, 1.8))); }
    return THREE.MathUtils.lerp(s.belt, s.hood + 0.04, smooth01((z - s.cab1) / (s.cab0 - s.cab1)) * 0.25 + 0.0);
  };
  const bottomAt = (z) => {
    let y = s.clear; const t = Math.abs(z) / (L / 2); if (t > 0.86) y += (t - 0.86) * 1.6; // bumper lift
    for (const zw of [wf, wr]) { const d = z - zw; if (Math.abs(d) < arch) y = Math.max(y, wheelY + Math.sqrt(arch * arch - d * d) - 0.02); }
    return y;
  };
  for (let i = 0; i <= NZ; i++) {
    const t = i / NZ; const z = zr + t * L; const tp = (z / (L / 2));
    const w = hw * plan(tp); const yt = topAt(z); let y0 = Math.min(bottomAt(z), yt - 0.12);
    const crown = 0.03 * plan(tp);
    // profile: right side from top center down to bottom center
    const pr = [[0, yt + crown], [w * 0.7, yt + crown * 0.6], [w * 0.92, yt - 0.015], [w * 0.985, yt - 0.06], [w, yt - 0.14],
      [w, Math.max(y0 + 0.12, (yt + y0) / 2)], [w * 0.985, y0 + 0.05], [w * 0.93, y0], [0, y0]];
    const ring = [];
    for (const [x, y] of pr) { ring.push(pos.length / 3); pos.push(x, y, z); }
    for (let k = pr.length - 2; k >= 1; k--) { ring.push(pos.length / 3); pos.push(-pr[k][0], pr[k][1], z); }
    rings.push(ring);
  }
  const M = rings[0].length;
  for (let i = 0; i < NZ; i++) for (let k = 0; k < M; k++) {
    const a = rings[i][k], b = rings[i + 1][k], c = rings[i + 1][(k + 1) % M], d = rings[i][(k + 1) % M];
    const dark = (k === 7 || k === 8 || k === 6 + 3 * 0); // bottom strips
    const arr = (k >= 7 && k <= 8) ? idxDark : idxPaint;
    arr.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = idxPaint.concat(idxDark); g.setIndex(all); g.addGroup(0, idxPaint.length, 0); g.addGroup(idxPaint.length, idxDark.length, 1);
  g.computeVertexNormals();
  // ---- cabin (glass + roof) ----
  const cp = [], ci = { glass: [], paint: [] }; const cr = []; const NC = 48;
  const c0 = s.cab0, c1 = s.cab1; const roofF = c0 - s.ws, roofR = c1 + s.rw;
  for (let i = 0; i <= NC; i++) {
    const z = c1 + (c0 - c1) * i / NC; const tp = z / (L / 2);
    const yb = topAt(z) - 0.005; const wb = hw * plan(tp) * 0.985 - 0.035;
    let yr; if (z > roofF) yr = THREE.MathUtils.lerp(s.roof, yb, Math.pow((z - roofF) / (c0 - roofF), 1.0)); else if (z < roofR) yr = THREE.MathUtils.lerp(s.roof, yb, Math.pow((roofR - z) / (roofR - c1), 1.15)); else yr = s.roof;
    yr = Math.max(yr, yb + 0.001);
    const h = yr - yb; const wr = wb - Math.min(0.24, h * 0.42);
    const pr = [[0, yr + 0.015], [wr - 0.14, yr], [wr - 0.01, yr - Math.min(0.05, h * 0.2)], [wr + 0.012, yr - Math.min(0.1, h * 0.35)], [wb, yb]];
    const ring = []; for (const [x, y] of pr) { ring.push(cp.length / 3); cp.push(x, y, z); }
    for (let k = pr.length - 1; k >= 1; k--) { ring.push(cp.length / 3); cp.push(-pr[k][0], pr[k][1], z); }
    cr.push({ ring, z });
  }
  const MC = cr[0].ring.length;
  const bpil = (z) => Math.abs(z - (c0 + c1) / 2 - 0.05) < 0.07 && (c0 - c1) > 1.6;
  for (let i = 0; i < NC; i++) for (let k = 0; k < MC - 1; k++) {
    const zc = (cr[i].z + cr[i + 1].z) / 2;
    const a = cr[i].ring[k], b = cr[i + 1].ring[k], c = cr[i + 1].ring[k + 1], d = cr[i].ring[k + 1];
    const kk = k < 4 ? k : MC - 2 - k; // strip id from top center (0) to side (3)
    let glass;
    if (kk <= 1) glass = zc > roofF + 0.02 || zc < roofR - 0.02; // roof → glass on windshield/rear window
    else if (kk === 2) glass = false; // roof rail
    else glass = !bpil(zc) && zc > c1 + 0.12 + (s.rw < 0.3 ? 0.1 : 0) && zc < c0 - 0.06; // side windows
    (glass ? ci.glass : ci.paint).push(a, b, c, a, c, d);
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cg.setIndex(ci.paint.concat(ci.glass)); cg.addGroup(0, ci.paint.length, 0); cg.addGroup(ci.paint.length, ci.glass.length, 1); cg.computeVertexNormals();
  return { body: g, cabin: cg, wf, wr, topAt };
}

let shared = null;
function sharedMats(Q) {
  if (shared) return shared;
  const phys = Q.cars === 'physical';
  shared = {
    glass: phys ? new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3.0 }) : new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.08, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, metalness: 0.0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.12, metalness: 1.0 }),
    alloy: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.28, metalness: 0.9 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.4 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1a0a, emissiveIntensity: 0.4, roughness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
    plateY: new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }),
  };
  return shared;
}
const paintCache = new Map();
export function paintMat(color, Q) {
  const key = color + Q.cars; if (paintCache.has(key)) return paintCache.get(key);
  const m = Q.cars === 'physical' ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 2.4 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4 });
  paintCache.set(key, m); return m;
}
let wheelGeo = {};
function wheelParts(R, tw) {
  const key = R + '_' + tw; if (wheelGeo[key]) return wheelGeo[key];
  // tire via lathe (rounded section), axis along X
  const pts = []; const r0 = R * 0.66, sw = tw / 2;
  const sec = [[r0, -sw * 0.9], [R * 0.93, -sw], [R, -sw * 0.75], [R, sw * 0.75], [R * 0.93, sw], [r0, sw * 0.9]];
  for (const [r, y] of sec) pts.push(new THREE.Vector2(r, y));
  const tire = new THREE.LatheGeometry(pts, 28); tire.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r0 * 1.0, r0 * 1.0, tw * 0.82, 24, 1, false); rim.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(r0 * 0.28, r0 * 0.32, tw * 0.9, 12); hub.rotateZ(Math.PI / 2);
  const spokes = []; for (let k = 0; k < 5; k++) { const b = new THREE.BoxGeometry(tw * 0.9, r0 * 0.95, r0 * 0.2); b.translate(0, r0 * 0.5, 0); b.rotateX(k * Math.PI * 2 / 5); spokes.push(b); }
  const sp = mergeGeos(spokes);
  const colr = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g : g; };
  const sp2 = sp.clone(); sp2.translate(0.02, 0, 0);
  const parts = [colr(tire.toNonIndexed(), 0x0c0c0c), colr(rim.toNonIndexed(), 0x202020), colr(sp2.toNonIndexed(), 0xa9adb3), colr(hub.toNonIndexed(), 0xe0e0e0)];
  const merged = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }));
  wheelGeo[key] = { tire, rim, hub, sp, merged }; return wheelGeo[key];
}
function mergeGeos(list) {
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g0 of list) { const g = g0.index ? g0 : g0; const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += p.length / 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}

export function buildCar(type, Q, paint) {
  const s = SPECS[type]; const M = sharedMats(Q);
  if (!geoCache[type]) geoCache[type] = bodyGeometry(s);
  const G = geoCache[type];
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const col = s.paint ?? paint ?? randomPaint();
  const pm = paintMat(s.twoTone ? s.twoTone[0] : col, Q);
  const roofM = s.twoTone ? paintMat(s.twoTone[1], Q) : pm;
  const b = new THREE.Mesh(G.body, [pm, M.dark]); b.castShadow = true; b.receiveShadow = true; body.add(b);
  const c = new THREE.Mesh(G.cabin, [roofM, M.glass]); c.castShadow = true; body.add(c);
  const hw = s.W / 2, zf = s.L / 2;
  const acc = new Map(); // material -> [geometries baked in body space]
  const add = (geo, mat, x, y, z, parent = body) => { if (parent !== body) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
    const o = { rotation: new THREE.Euler(), position: new THREE.Vector3(x, y, z), bake() { const g = geo.clone(); g.applyMatrix4(new THREE.Matrix4().compose(this.position, new THREE.Quaternion().setFromEuler(this.rotation), new THREE.Vector3(1, 1, 1))); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; } };
    if (!acc.has(mat)) acc.set(mat, []); acc.get(mat).push(o); return o; };
  // lights, grille, plates, mirrors, bumpers
  const yh = G.topAt(zf - 0.12) - 0.1;
  for (const sx of [-1, 1]) {
    const hl = add(new THREE.BoxGeometry(0.36, 0.11, 0.08), M.head, sx * hw * 0.68, yh, zf - 0.09); hl.rotation.y = sx * 0.12;
    add(new THREE.BoxGeometry(0.34, 0.1, 0.06), M.tail, sx * hw * 0.72, G.topAt(-zf + 0.1) - 0.12, -zf + 0.07);
    const mir = add(new THREE.BoxGeometry(0.2, 0.12, 0.1), pm, sx * (hw + 0.07), s.belt + 0.1, s.cab0 - 0.22);
  }
  add(new THREE.BoxGeometry(s.W * 0.42, 0.14, 0.06), M.dark, 0, yh - 0.04, zf - 0.04);
  add(new THREE.BoxGeometry(s.W * 0.96, 0.12, 0.12), M.dark, 0, s.clear + 0.16, zf - 0.13);
  add(new THREE.BoxGeometry(s.W * 0.96, 0.12, 0.12), M.dark, 0, s.clear + 0.18, -zf + 0.13);
  const plateM = s.twoTone ? M.plateY : M.plate;
  add(new THREE.BoxGeometry(0.5, 0.12, 0.02), plateM, 0, s.clear + 0.32, zf - 0.03);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.02), plateM, 0, G.topAt(-zf + 0.05) - 0.3, -zf + 0.03);
  if (s.stripe) { const st = paintMat(s.stripe, Q); for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.01, 0.12, s.L * 0.8), st, sx * (hw + 0.003), s.belt - 0.25, -0.1); }
  let bar = null;
  if (s.lightbar) {
    bar = new THREE.Group(); bar.position.set(0, s.roof + 0.04, s.cab0 - s.ws - 0.35); body.add(bar);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.28), M.dark); bar.add(base);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0.2 })); r.position.set(-0.27, 0.07, 0); bar.add(r);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x0030ff, emissiveIntensity: 0.2 })); bl.position.set(0.27, 0.07, 0); bar.add(bl);
    bar.userData = { r, b: bl };
  }
  if (s.twoTone) { // roof taxi sign
    const sign = add(new THREE.BoxGeometry(0.6, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0xffaa00, emissiveIntensity: 0.15 }), 0, s.roof + 0.1, (s.cab0 + s.cab1) / 2);
  }
  // wheels
  const tw = s.R * 0.62; const wp = wheelParts(s.R, tw);
  const wheels = [];
  for (const [nm, x, z] of [['wheel-front-left', 1, G.wf], ['wheel-front-right', -1, G.wf], ['wheel-back-left', 1, G.wr], ['wheel-back-right', -1, G.wr]]) {
    const wg = new THREE.Group(); wg.name = nm; wg.rotation.order = 'YXZ'; wg.position.set(x * (hw - tw / 2 - 0.03), s.R, z);
    const t = new THREE.Mesh(wp.merged, M.wheel); t.castShadow = true; t.scale.x = x; wg.add(t);
    root.add(wg); wheels.push(wg);
  }
  // interior block (seats/dash silhouettes behind tinted glass)
  add(new THREE.BoxGeometry(s.W * 0.8, 0.5, Math.max(0.5, s.cab0 - s.cab1 - 0.6)), M.dark, 0, s.belt + 0.05, (s.cab0 + s.cab1) / 2 - 0.1);
  if (acc.size) { const mats = [], geos = []; for (const [mat, list] of acc) { mats.push(mat); geos.push(mergeGeometries(list.map(o => o.bake()))); }
    const mg = mergeGeometries(geos, true); const am = new THREE.Mesh(mg, mats); am.castShadow = true; body.add(am); }
  root.userData = { spec: s, bar, paint: col, headM: M.head, tailM: M.tail };
  return root;
}
