
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLTF } from './assets.js';

import { SPECS, buildCar } from './carmodels.js';
export const CAR_TYPES = {};
for (const [k, s] of Object.entries(SPECS)) CAR_TYPES[k] = { len: s.L, mass: s.mass, power: s.power, top: s.top, grip: s.grip, paint: !s.paint && !s.twoTone, kind: s.kind };
CAR_TYPES.truck = CAR_TYPES.van; CAR_TYPES.delivery = CAR_TYPES.van; CAR_TYPES.suvlux = CAR_TYPES.suv;
const ALIAS = { truck: 'van', delivery: 'van', suvlux: 'suv' };
const models = {};
export async function loadCars(Q) {
  models.auto = makeAutoRickshaw(Q);
  CAR_TYPES.auto = { file: null, len: 2.9, mass: 380, power: 5.5, top: 21, grip: 7, paint: false, kind: 'auto' };
}
function carMaterial(orig, paint, bodyColor, Q, isPolice) {
  const m = Q.cars === 'physical' ? new THREE.MeshPhysicalMaterial({ map: orig.map, roughness: 0.32, metalness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.25 })
                                   : new THREE.MeshStandardMaterial({ map: orig.map, roughness: 0.35, metalness: 0.2 });
  if (paint != null && bodyColor) {
    const pc = new THREE.Color(paint);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPaint = { value: pc }; sh.uniforms.uBody = { value: bodyColor };
      sh.fragmentShader = 'uniform vec3 uPaint; uniform vec3 uBody;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float dd = distance(diffuseColor.rgb, uBody);
        if (dd < 0.06) { diffuseColor.rgb = uPaint * (0.85 + 0.15 * diffuseColor.r / max(uBody.r, 0.01)); }`);
    };
    m.customProgramCacheKey = () => 'paint' + paint + (bodyColor ? bodyColor.getHexString() : '');
  }
  return m;
}

const tmpV = new THREE.Vector3();
export class Vehicle {
  constructor(scene, typeKey, Q, opts = {}) {
    const T = CAR_TYPES[typeKey]; this.type = typeKey; this.T = T; this.Q = Q;
    typeKey = ALIAS[typeKey] || typeKey; this.type = typeKey;
    if (typeKey === 'auto') { const mdl = models.auto; this.root = mdl.wrap.clone(true); this.length = 2.9; this.width = 1.42; }
    else { this.root = buildCar(typeKey, Q, opts.paint); const s = SPECS[typeKey]; this.length = s.L; this.width = s.W; this.bar = this.root.userData.bar; }
    this.wheels = []; this.root.traverse(o => { if (/^wheel/.test(o.name)) { o.userData.front = /front/.test(o.name); o.userData.baseRot = o.rotation.clone(); this.wheels.push(o); } });
    this.radius = this.width * 0.55;
    this.mass = T.mass; scene.add(this.root);
    this.pos = new THREE.Vector3(); this.heading = 0; this.vel = new THREE.Vector2(); this.angVel = 0;
    this.throttle = 0; this.brake = 0; this.steer = 0; this.handbrake = false; this.steerAngle = 0;
    this.health = 100; this.driver = null; this.ai = null; this.kinematic = false; this.siren = T.kind === 'police';
    this.wheelSpin = 0; this.pitch = 0; this.roll = 0; this.skid = 0; this.speed = 0; this.lastImpact = 0;
    this.lights = makeLights(this, T.kind);
    this.root.add(this.lights);
  }
  get forward() { return tmpV.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  place(x, z, heading) { this.pos.set(x, 0, z); this.heading = heading; this.vel.set(0, 0); this.angVel = 0; this.sync(0); }
  physics(dt, city) {
    const T = this.T;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let vF = this.vel.x * fx + this.vel.y * fz;           // forward speed
    let vL = this.vel.x * fz - this.vel.y * fx;           // lateral (right) speed
    const top = T.top * (this.health > 20 ? 1 : 0.5);
    // engine / brake
    let acc = 0;
    if (this.throttle > 0) acc = vF < top ? T.power * this.throttle * (1 - Math.max(0, vF) / top * 0.6) : 0;
    else if (this.throttle < 0) acc = vF > 0.5 ? -T.power * 1.9 * -this.throttle : (vF > -7 ? T.power * 0.45 * this.throttle : 0);
    if (this.brake > 0) acc -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 22 * this.brake);
    acc -= vF * Math.abs(vF) * 0.0012 + vF * 0.12; // drag + rolling
    if (this.handbrake) acc -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 6);
    vF += acc * dt;
    // steering: less lock at speed
    const maxSteer = 0.62 * (1 - Math.min(0.72, Math.abs(vF) / 60));
    this.steerAngle += (this.steer * maxSteer - this.steerAngle) * Math.min(1, dt * 7);
    const wb = this.length * 0.62;
    const targetYaw = vF * Math.tan(this.steerAngle) / wb;
    const grip = this.handbrake ? 1.4 : T.grip * (1 - (city?.wet || 0) * 0.25);
    this.angVel += (targetYaw - this.angVel) * Math.min(1, dt * (this.handbrake ? 2.5 : 8));
    // lateral friction (drift when handbrake / low grip)
    const latK = Math.min(1, dt * grip);
    vL -= vL * latK;
    if (this.handbrake && Math.abs(vF) > 6) { this.angVel *= 1.0 + dt * 1.2; }
    this.skid = Math.min(1, Math.abs(vL) / 6 + (this.handbrake && Math.abs(vF) > 5 ? 0.5 : 0) + (this.brake > 0.5 && Math.abs(vF) > 12 ? 0.4 : 0));
    this.heading += this.angVel * dt;
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vel.set(nfx * vF + nfz * vL, nfz * vF - nfx * vL);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    this.speed = vF; this.accel = acc;
  }
  collideWorld(city, onImpact) {
    // two circles along the body vs building AABBs
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading); const off = this.length * 0.28; const r = this.radius;
    for (const sgn of [1, -1]) {
      const cx = this.pos.x + fx * off * sgn, cz = this.pos.z + fz * off * sgn;
      for (const c of city.query(cx, cz, r + 1)) {
        const px = Math.max(c.x0, Math.min(cx, c.x1)), pz = Math.max(c.z0, Math.min(cz, c.z1));
        let dx = cx - px, dz = cz - pz; let d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-4) { dx = 0; dz = 1; d = 1e-4; }
          const nx = dx / d, nz = dz / d, pen = r - d;
          this.pos.x += nx * pen; this.pos.z += nz * pen;
          const vn = this.vel.x * nx + this.vel.y * nz;
          if (vn < 0) {
            this.vel.x -= (1.35) * vn * nx; this.vel.y -= (1.35) * vn * nz;
            this.vel.multiplyScalar(0.82); this.angVel += (sgn * (nx * fz - nz * fx)) * vn * 0.04;
            if (-vn > 3) onImpact && onImpact(this, -vn, 'wall');
          }
        }
      }
    }
  }
  sync(dt) {
    const gy = 0;
    this.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    // body pitch/roll from accel & turn (fake suspension)
    const tp = THREE.MathUtils.clamp(-(this.accel || 0) * 0.004, -0.05, 0.05);
    const tr = THREE.MathUtils.clamp(this.angVel * this.speed * 0.0035, -0.07, 0.07);
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 6); this.roll += (tr - this.roll) * Math.min(1, dt * 6);
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.wheelSpin += this.speed * dt / 0.36;
    for (const w of this.wheels) { w.rotation.x = w.userData.baseRot.x + this.wheelSpin; w.rotation.y = w.userData.baseRot.y + (w.userData.front ? this.steerAngle : 0); }
  }
  setNight(n, t) {
    const u = this.lights.userData, c = u.col; const head = n > 0.3 ? n * 1.4 : 0; const brake = this.brake > 0.1 || this.throttle < 0; const tail = brake ? 1.3 : 0.25 + n * 0.5;
    c[0] = c[3] = head; c[1] = c[4] = head * 0.95; c[2] = c[5] = head * 0.85;
    c[6] = c[9] = tail; c[7] = c[10] = tail * 0.08; c[8] = c[11] = tail * 0.05; u.attr.needsUpdate = true;
    if (this.bar) { const on = this.sirenOn; const ph = Math.floor(t * 6) % 2; this.bar.userData.r.material.emissiveIntensity = on && ph ? 6 : 0.2; this.bar.userData.b.material.emissiveIntensity = on && !ph ? 6 : 0.2; }
  }
  remove(scene) { scene.remove(this.root); }
}

let glowTex = null;
function glow() {
  if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
function makeLights(v, kind) {
  // one Points draw call per car: 2 head + 2 tail glows, colours driven per frame
  const L = v.length / 2, W = v.width / 2 - 0.25;
  const pos = new Float32Array([-W, 0.75, L + 0.05, W, 0.75, L + 0.05, -W, 0.85, -L - 0.05, W, 0.85, -L - 0.05]);
  const col = new Float32Array(12);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ map: glow(), size: 1.1, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData = { col, attr: g.attributes.color };
  return p;
}
// ---------- Procedural auto-rickshaw ----------
function makeAutoRickshaw(Q) {
  const g = new THREE.Group(); const root = new THREE.Group(); g.add(root);
  const P = (o) => Q.cars === 'physical' ? new THREE.MeshPhysicalMaterial(Object.assign({ clearcoat: 0.8, clearcoatRoughness: 0.15 }, o)) : new THREE.MeshStandardMaterial(o);
  const green = P({ color: 0x1f7a2e, roughness: 0.4, metalness: 0.1 });
  const yellow = P({ color: 0xf2c418, roughness: 0.4, metalness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.45 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  // lower tub (green)
  add(new THREE.BoxGeometry(1.35, 0.55, 1.6), green, 0, 0.55, -0.35);
  add(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 16, 1, false), green, 0, 0.6, 0.85, Math.PI / 2, 0, 0); // nose
  // floor + seat
  add(new THREE.BoxGeometry(1.3, 0.35, 0.55), seat, 0, 0.98, -0.75);
  add(new THREE.BoxGeometry(1.3, 0.6, 0.12), seat, 0, 1.3, -1.05);
  // canopy (yellow top, black sides)
  const roof = add(new THREE.BoxGeometry(1.42, 0.08, 2.05), yellow, 0, 1.92, -0.2);
  add(new THREE.CylinderGeometry(0.71, 0.71, 2.05, 20, 1, true, -Math.PI / 2, Math.PI), black, 0, 1.78, -0.2, Math.PI / 2, 0, 0).scale.set(1, 1, 0.35);
  add(new THREE.BoxGeometry(1.42, 0.95, 0.06), black, 0, 1.45, -1.2);
  // windshield + frame
  add(new THREE.BoxGeometry(1.15, 0.75, 0.04), glass, 0, 1.45, 0.78, -0.18);
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), chrome, s * 0.62, 1.45, 0.75, -0.18); add(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8), chrome, s * 0.66, 1.42, -0.55); }
  // handlebar + headlight
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), chrome, 0, 1.12, 0.65, 0, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.11, 0.09, 0.08, 16), chrome, 0, 0.98, 1.3, Math.PI / 2, 0, 0);
  // wheels
  const wg = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 18); wg.rotateZ(Math.PI / 2);
  const mkW = (name, x, z) => { const w = new THREE.Group(); w.name = name; w.position.set(x, 0.26, z); const m = new THREE.Mesh(wg, black); m.castShadow = true; w.add(m); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 12).rotateZ(Math.PI / 2), chrome); w.add(hub); root.add(w); };
  mkW('wheel-front', 0, 1.15); mkW('wheel-back-left', -0.62, -0.85); mkW('wheel-back-right', 0.62, -0.85);
  // merge all static parts by material (few draw calls)
  root.updateMatrixWorld(true); const byMat = new Map(); const rm = [];
  for (const m of root.children) if (m.isMesh) { const gg = m.geometry.clone().toNonIndexed(); gg.applyMatrix4(m.matrix); for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k); if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(gg); rm.push(m); }
  rm.forEach(m => root.remove(m));
  const mats = [], geos = []; for (const [mt, l] of byMat) { mats.push(mt); geos.push(mergeGeometries(l)); }
  const merged = new THREE.Mesh(mergeGeometries(geos, true), mats); merged.castShadow = true; merged.receiveShadow = true; root.add(merged);
  return { wrap: g, wheels: [], bodyColor: null, width: 1.42, height: 2.0, length: 2.9 };
}
