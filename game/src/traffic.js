
import * as THREE from 'three';
const wrapAng = (a) => Number.isFinite(a) ? a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)) : 0;
import { N, P, ROAD, ORIGIN, segX, segZ, interDegree } from './city.js';
import { Vehicle, CAR_TYPES } from './vehicles.js';

const STOP = ROAD / 2 + 5.0;
const CIV = ['sedan','scooter','taxi','suv','bike','hatch','auto','scooter','auto','van','scooter','suvlux','delivery','bike','truck','sports','sedan','scooter','auto'];
export function lightState(i, j, t, axis) { // returns 'g' | 'a' | 'r'
  if (interDegree(i, j) < 3) return 'g';
  const c = ((t + ((i + j) % 2 ? 0 : 12)) % 24 + 24) % 24;
  if (axis === 'x') return c < 10 ? 'g' : c < 12 ? 'a' : 'r';
  return c >= 12 && c < 22 ? 'g' : c >= 22 ? 'a' : 'r';
}

export class Traffic {
  constructor(scene, city, Q) {
    this.scene = scene; this.city = city; this.Q = Q; this.cars = []; this.t = 0; this.parked = []; this.lightsDirty = true; this.initLights();
    const pl = city.onLoad, pu = city.onUnload;
    city.onLoad = (ch) => { pl && pl(ch); this.lightsDirty = true; for (const p of ch.parked) { const v = new Vehicle(this.scene, p.type, this.Q); v.ai = { mode: 'empty' }; v.place(p.x, p.z, p.heading); v.chunk = ch; this.cars.push(v); this.parked.push(v); } };
    city.onUnload = (ch) => { pu && pu(ch); this.lightsDirty = true; this.cars = this.cars.filter(v => { if (v.chunk === ch && v.driver !== 'player' && v.ai && v.ai.mode === 'empty') { v.remove(this.scene); return false; } return true; }); };
  }
  laneLat(axis, line, d, k) { const c = ORIGIN + line * P; const off = 1.75 + 3.5 * k; return axis === 'x' ? c - d * off : c + d * off; }
  spawnAI(type, near) {
    const v = new Vehicle(this.scene, type, this.Q);
    this.resetAI(v, near); this.cars.push(v); return v;
  }
  resetAI(v, near) {
    const c = near || { x: ORIGIN + 4 * P, z: ORIGIN + 4 * P };
    const ints = this.city.intersectionsNear(c.x, c.z, 240);
    for (let tries = 0; tries < 40 && ints.length; tries++) {
      const [i, j] = ints[Math.floor(Math.random() * ints.length)];
      const opts = []; if (segX(i, j)) opts.push(['x', j, i, 1]); if (segX(i - 1, j)) opts.push(['x', j, i - 1, -1]); if (segZ(i, j)) opts.push(['z', i, j, 1]); if (segZ(i, j - 1)) opts.push(['z', i, j - 1, -1]);
      if (!opts.length) continue;
      const [axis, line, seg, d0] = opts[Math.floor(Math.random() * opts.length)];
      const d = Math.random() < 0.5 ? 1 : -1; const k = 0; // outer lane = kerb parking
      const s0 = ORIGIN + seg * P + STOP + 2, s1 = ORIGIN + (seg + 1) * P - STOP - 2; const s = s0 + Math.random() * (s1 - s0);
      const lat = this.laneLat(axis, line, d, k);
      const x = axis === 'x' ? s : lat, z = axis === 'x' ? lat : s;
      if (near) { const dd = Math.hypot(x - near.x, z - near.z); if (dd < 60 || dd > 240) continue; }
      if (this.cars.some(o => o !== v && Math.hypot(o.pos.x - x, o.pos.z - z) < 12)) continue;
      v.ai = { axis, line, d, k, s, mode: 'lane', speed: 0, target: 9 + Math.random() * 5, nextIdx: d > 0 ? seg + 1 : seg, path: null, pi: 0, honk: 0, stuck: 0 };
      const hw = !(this.city.isRoad(x, z) && Math.abs(this.city.groundAt(x + 20, z + 20)) > 0); // rough: open road → faster
      v.kinematic = true; v.place(x, z, axis === 'x' ? (d > 0 ? Math.PI / 2 : -Math.PI / 2) : (d > 0 ? 0 : Math.PI));
      if (v.type === 'auto') v.ai.target = 7 + Math.random() * 2; else if (hw) v.ai.target += 5;
      v.health = 100; v.root.visible = true;
      return true;
    }
    v.ai = { mode: 'empty' }; v.root.visible = false; v.kinematic = true; v.pos.set(1e5, 0, 1e5); return false;
  }
  populate(count, near) { for (let i = 0; i < count; i++) this.spawnAI(CIV[i % CIV.length], null); }
  ahead(v, all) { // distance to closest obstacle in front within lane
    const f = v.forward; let best = 99;
    for (const o of all) {
      if (o === v || !o.root.visible) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z; const fwd = dx * f.x + dz * f.z; if (fwd < 0 || fwd > 22) continue;
      const lat = Math.abs(dx * f.z - dz * f.x); if (lat > 2.2) continue;
      best = Math.min(best, fwd - (o.length || 1) * 0.5 - v.length * 0.5);
    }
    return best;
  }
  update(dt, envT, player, peds) {
    this.t += dt; const lt = this.t; this.lastPlayerPos = player.pos;
    const all = this.cars.concat(player.vehicle ? [] : [], this.extra || []);
    const lodR = this.Q.id === 'low' ? 22 : this.Q.id === 'medium' ? 32 : this.Q.id === 'high' ? 48 : 64;
    for (const v of this.cars) if (v.rider) { const on = !!(v.ai && (v.ai.mode === 'lane' || v.ai.mode === 'turn')) && v.driver !== 'player' && v.root.visible; v.rider.root.visible = on;
      if (on) { const dd = Math.abs(v.pos.x - player.pos.x) + Math.abs(v.pos.z - player.pos.z); v.riderAcc = (v.riderAcc || 0) + dt; if (dd < 120 && v.riderAcc > (dd > 50 ? 0.12 : 0.03)) { v.rider.mixer.update(v.riderAcc); v.riderAcc = 0; } } }
    for (const v of this.cars) if (v.setLod) v.setLod(v.driver !== 'player' && Math.abs(v.pos.x - player.pos.x) + Math.abs(v.pos.z - player.pos.z) > lodR);
    for (const v of this.cars) {
      const a = v.ai; if (!a || v.driver === 'player') continue;
      if (a.mode === 'loose') { // knocked about: physics only, then recover
        v.throttle = 0; v.brake = 0.6; v.steer = 0; v.physics(dt, this.city); v.collideWorld(this.city); v.sync(dt);
        a.looseT = (a.looseT || 0) + dt; if (a.looseT > 6 && Math.hypot(v.vel.x, v.vel.y) < 0.5) { a.looseT = 0; this.resetAI(v, player.pos); }
        continue;
      }
      if (a.mode === 'empty') { if (!v.root.visible && v.driver !== 'player' && Math.random() < 0.02) this.resetAI(v, player.pos); else v.sync(dt); continue; }
      // obstacle check (cars + player on foot)
      let gap = this.ahead(v, all.concat(player.vehicle ? [player.vehicle] : []));
      if (!player.vehicle) { const f = v.forward; const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z; const fw = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x); if (fw > 0 && fw < 14 && lat < 1.8) { gap = Math.min(gap, fw - 3); a.honk += dt; } }
      let tgt = a.target;
      if (a.mode === 'lane') {
        const cpos = ORIGIN + a.nextIdx * P; const stopS = cpos - a.d * STOP; const toStop = (stopS - a.s) * a.d;
        const st = a.axis === 'x' ? lightState(a.nextIdx, a.line, lt, 'x') : lightState(a.line, a.nextIdx, lt, 'z');
        if (toStop > 0 && toStop < 30 && (st === 'r' || (st === 'a' && toStop > 6))) tgt = Math.min(tgt, Math.max(0, (toStop - 1) * 0.6));
        if (gap < 30) tgt = Math.min(tgt, Math.max(0, (gap - 2.5) * 0.7));
        a.speed += THREE.MathUtils.clamp(tgt - a.speed, -9 * dt, 3.5 * dt); a.speed = Math.max(0, a.speed);
        a.s += a.d * a.speed * dt;
        if ((a.s - stopS) * a.d >= 0) this.planTurn(v);
        const lat = this.laneLat(a.axis, a.line, a.d, a.k);
        const x = a.axis === 'x' ? a.s : lat, z = a.axis === 'x' ? lat : a.s;
        v.pos.set(x, 0, z); v.heading = a.axis === 'x' ? (a.d > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.d > 0 ? 0 : Math.PI);
        v.angVel = 0;
      } else if (a.mode === 'turn') {
        if (gap < 20) tgt = Math.min(tgt, Math.max(0, (gap - 2.5) * 0.7));
        tgt = Math.min(tgt, a.turnType === 's' ? a.target : 6.5);
        a.speed += THREE.MathUtils.clamp(tgt - a.speed, -9 * dt, 3 * dt); a.speed = Math.max(0, a.speed);
        a.u += a.speed * dt / a.len;
        if (a.u >= 1) { Object.assign(a, a.after); a.mode = 'lane'; a.u = 0; }
        else { const p = bez(a.p0, a.p1, a.p2, a.u), q = bez(a.p0, a.p1, a.p2, Math.min(1, a.u + 0.02)); v.pos.set(p.x, 0, p.y); const h = Math.atan2(q.x - p.x, q.y - p.y); v.angVel = (h - v.heading) / dt; v.heading = h; }
      }
      v.speed = a.speed; v.throttle = 0; v.brake = tgt < a.speed - 0.5 ? 1 : 0; v.accel = 0;
      v.vel.set(Math.sin(v.heading) * a.speed, Math.cos(v.heading) * a.speed);
      v.steerAngle = a.mode === 'turn' ? (a.turnType === 'l' ? 0.4 : a.turnType === 'r' ? -0.4 : 0) : 0;
      v.sync(dt);
      // despawn far away cars → respawn near the player
      if (Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z) > 280) this.resetAI(v, player.pos);
    }
    this.updateLights(lt);
  }
  planTurn(v) {
    const a = v.ai; const i = a.nextIdx;
    const opts = [];
    const other = a.axis === 'x' ? 'z' : 'x';
    // intersection coords: (I,J) in x/z index space
    const I = a.axis === 'x' ? i : a.line, J = a.axis === 'x' ? a.line : i;
    const straightOK = a.axis === 'x' ? (a.d > 0 ? segX(I, J) : segX(I - 1, J)) : (a.d > 0 ? segZ(I, J) : segZ(I, J - 1));
    if (straightOK) opts.push('s', 's');
    for (const d2 of [1, -1]) { const ok = other === 'x' ? (d2 > 0 ? segX(I, J) : segX(I - 1, J)) : (d2 > 0 ? segZ(I, J) : segZ(I, J - 1)); if (ok) opts.push(d2); }
    if (!opts.length) { this.resetAI(v, this.lastPlayerPos); return; }
    const ch = opts[Math.floor(Math.random() * opts.length)];
    const cpos = ORIGIN + i * P; const linePos = ORIGIN + a.line * P;
    const lat0 = this.laneLat(a.axis, a.line, a.d, a.k);
    const startS = a.s;
    const P0 = a.axis === 'x' ? new THREE.Vector2(startS, lat0) : new THREE.Vector2(lat0, startS);
    let after, P2, turnType;
    if (ch === 's') {
      const endS = cpos + a.d * STOP; after = { axis: a.axis, line: a.line, d: a.d, k: a.k, s: endS, nextIdx: i + a.d };
      P2 = a.axis === 'x' ? new THREE.Vector2(endS, lat0) : new THREE.Vector2(lat0, endS); turnType = 's';
    } else {
      const d2 = ch; const k2 = a.k; const lat2 = this.laneLat(other, i, d2, k2); const endS = linePos + d2 * STOP;
      after = { axis: other, line: i, d: d2, k: k2, s: endS, nextIdx: a.line + d2 };
      P2 = other === 'x' ? new THREE.Vector2(endS, lat2) : new THREE.Vector2(lat2, endS);
      // left or right? cross of dir vectors
      const d1v = a.axis === 'x' ? [a.d, 0] : [0, a.d]; const d2v = other === 'x' ? [d2, 0] : [0, d2];
      turnType = (d1v[0] * d2v[1] - d1v[1] * d2v[0]) > 0 ? 'r' : 'l';
    }
    const P1 = ch === 's' ? P0.clone().lerp(P2, 0.5) : (a.axis === 'x' ? new THREE.Vector2(P2.x, P0.y) : new THREE.Vector2(P0.x, P2.y));
    a.mode = 'turn'; a.p0 = P0; a.p1 = P1; a.p2 = P2; a.u = 0; a.after = after; a.turnType = turnType;
    a.len = ch === 's' ? P0.distanceTo(P2) : (P0.distanceTo(P1) + P1.distanceTo(P2)) * 0.8;
  }
  initLights() {
    const poleG = new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8); poleG.translate(0, 2.1, 0);
    const boxG = new THREE.BoxGeometry(0.42, 1.25, 0.32); boxG.translate(0, 3.9, 0);
    this.lg = { poleG, boxG, bulbG: new THREE.CircleGeometry(0.13, 12), pm: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.6 }), bm: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), bulbM: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) };
    this.lightMeshes = [];
  }
  rebuildLights() {
    this.lightsDirty = false; for (const m of this.lightMeshes) { this.scene.remove(m); m.dispose(); } this.lightMeshes = [];
    const heads = []; for (const ch of this.city.chunks.values()) for (const h of ch.heads) heads.push(h); this.heads = heads;
    const n = heads.length; if (!n) return;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    this.poles = new THREE.InstancedMesh(this.lg.poleG, this.lg.pm, n); this.boxes = new THREE.InstancedMesh(this.lg.boxG, this.lg.bm, n);
    this.bulbs = [0, 1, 2].map(() => new THREE.InstancedMesh(this.lg.bulbG, this.lg.bulbM, n));
    heads.forEach(([x, z, r], k) => {
      q.setFromEuler(e.set(0, r, 0)); M.compose(new THREE.Vector3(x, 0.16, z), q, one); this.poles.setMatrixAt(k, M); this.boxes.setMatrixAt(k, M);
      [4.3, 3.9, 3.5].forEach((y, bi) => { const off = new THREE.Vector3(0, y, 0.17).applyQuaternion(q); M.compose(new THREE.Vector3(x + off.x, 0.16 + off.y, z + off.z), q, one); this.bulbs[bi].setMatrixAt(k, M); });
    });
    for (const m of [this.poles, this.boxes]) { m.castShadow = true; m.computeBoundingSphere(); this.scene.add(m); this.lightMeshes.push(m); }
    for (const b of this.bulbs) { b.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); b.computeBoundingSphere(); this.scene.add(b); this.lightMeshes.push(b); }
    this.lastLightUpdate = -1;
  }
  updateLights(t) {
    if (this.lightsDirty) this.rebuildLights();
    if (!this.heads || !this.heads.length || Math.abs(t - this.lastLightUpdate) < 0.25) return; this.lastLightUpdate = t;
    const on = [new THREE.Color(6, 0.2, 0.1), new THREE.Color(6, 3.2, 0.2), new THREE.Color(0.2, 5, 1.6)], off = new THREE.Color(0.06, 0.06, 0.06);
    this.heads.forEach(([x, z, r, axis, i, j], k) => {
      const st = lightState(i, j, t, axis); const which = st === 'r' ? 0 : st === 'a' ? 1 : 2;
      for (let b = 0; b < 3; b++) this.bulbs[b].setColorAt(k, b === which ? on[b] : off);
    });
    for (const b of this.bulbs) b.instanceColor.needsUpdate = true;
  }
}
function bez(a, b, c, t) { const u = 1 - t; return new THREE.Vector2(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y); }

// Police chase driving (physics car steering toward the player)
export function chaseDrive(v, target, dt, city) {
  const dx = target.x - v.pos.x, dz = target.z - v.pos.z; const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz); let diff = want - v.heading; diff = wrapAng(diff);
  const s = v.ai;
  if (s.reverseT > 0) { s.reverseT -= dt; v.throttle = -1; v.steer = -Math.sign(diff); v.brake = 0; return; }
  v.steer = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
  const sp = v.speed;
  v.throttle = Math.abs(diff) > 1.2 && sp > 14 ? 0.2 : 1; v.brake = Math.abs(diff) > 1.4 && sp > 18 ? 0.7 : 0; v.handbrake = Math.abs(diff) > 1.6 && sp > 12;
  if (dist < 9) { v.throttle = 0.3; }
  if (Math.abs(sp) < 1.2 && v.throttle > 0.5) { s.stuck = (s.stuck || 0) + dt; if (s.stuck > 1.5) { s.reverseT = 1.3; s.stuck = 0; } } else s.stuck = 0;
}
