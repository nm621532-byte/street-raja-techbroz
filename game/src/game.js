
import * as THREE from 'three';
import { N, P, ROAD, ORIGIN, CURB, SIDE } from './city.js';
import { Vehicle, CAR_TYPES } from './vehicles.js';
import { makePerson } from './characters.js';
import { avatarPerson, loadAvatar } from './avatar.js';
import { chaseDrive } from './traffic.js';

const V3 = THREE.Vector3;
export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, camera, city, traffic, peds, env, hud, input, audio, Q
    this.money = 0; this.wanted = 0; this.heat = 0; this.lastSeen = 0; this.police = []; this.time = 0;
    this.camYaw = 0; this.camPitch = 0.25; this.camDist = 4.2; this.camMode = 0; this.camPos = new V3(); this.camLookOverride = 0;
    this.done = {}; this.mission = null; this.markers = [];
    this.player = { pos: new V3(), vel: new V3(), heading: 0, vy: 0, grounded: true, health: 100, vehicle: null, punchT: 0, hitT: 0, state: 'ok', stateT: 0 };
  }
  init(save) {
    const pl = this.player;
    pl.p = avatarPerson(loadAvatar());
    this.scene.add(pl.p.root);
    const sx = this.city.roadX(4) + ROAD / 2 + 2.2, sz = this.city.roadX(4) + 24;
    pl.pos.set(sx, CURB, sz); pl.heading = Math.PI; this.camYaw = pl.heading;
    if (save) { this.money = save.money || 0; this.done = save.done || {}; if (save.pos) pl.pos.set(save.pos[0], save.pos[1], save.pos[2]); if (save.time != null) this.env.time = save.time; }
    // a parked hero car next to the player
    this.hero = new Vehicle(this.scene, 'sports', this.Q, { paint: 0xb0121b }); this.hero.ai = { mode: 'empty' };
    this.hero.place(this.city.roadX(4) + 5.25 - 0.2, this.city.roadX(4) + 30, Math.PI); this.traffic.cars.push(this.hero);
    this.buildMissions();
    this.hud.set(this.state());
  }
  applyAvatar(a) {
    const pl = this.player, old = pl.p; pl.p = avatarPerson(a); this.scene.add(pl.p.root);
    pl.p.root.position.copy(pl.pos); pl.p.root.rotation.y = pl.heading; pl.p.root.visible = !pl.vehicle; old.dispose();
  }
  state() { const pl = this.player, v = pl.vehicle; return { money: this.money, stars: this.wanted, starFlash: this.wanted > 0 && this.lastSeen > 3, time: this.env.time, rain: this.env.rain, health: pl.health, inCar: !!v, speed: v ? v.speed : 0 }; }
  save() { try { localStorage.setItem('sr_save', JSON.stringify({ money: this.money, done: this.done, pos: this.player.vehicle ? null : this.player.pos.toArray(), time: this.env.time, v: 1 })); } catch (e) {} }

  // ---------------- crimes / wanted ----------------
  crime(amount, where) {
    this.heat += amount; const ns = Math.min(5, Math.max(this.wanted, Math.ceil(this.heat)));
    if (ns > this.wanted) { this.wanted = ns; this.hud.toast(this.wanted >= 3 ? 'Police alert! Bhaago!' : 'Police ko pata chal gaya!'); }
    this.lastSeen = 0; this.peds.scare(where || this.player.pos, 30);
  }
  updatePolice(dt) {
    const pl = this.player; const want = Math.min(6, this.wanted * 2);
    // spawn
    while (this.police.length < want) {
      const v = new Vehicle(this.scene, 'police', this.Q); v.ai = { mode: 'chase', stuck: 0, reverseT: 0 }; v.sirenOn = true;
      // spawn on a road ~90m away, preferably behind the player
      let best = null; const ints = this.city.intersectionsNear(pl.pos.x, pl.pos.z, 200); for (let k = 0; k < 24 && ints.length; k++) { const [i, j] = ints[Math.floor(Math.random() * ints.length)]; const x = ORIGIN + i * P, z = ORIGIN + j * P; const d = Math.hypot(x - pl.pos.x, z - pl.pos.z); if (d > 70 && d < 180 && (!best || Math.abs(d - 100) < Math.abs(best.d - 100))) best = { x, z, d }; }
      if (!best) { const a = Math.random() * 6.28; best = { x: pl.pos.x + Math.cos(a) * 110, z: pl.pos.z + Math.sin(a) * 110 }; }
      v.place(best.x, best.z, Math.atan2(pl.pos.x - best.x, pl.pos.z - best.z)); this.police.push(v); this.traffic.extra = this.police;
    }
    while (this.police.length > want) { const v = this.police.pop(); v.remove(this.scene); }
    let near = 0, closest = 999;
    for (const v of this.police) {
      if (v.ai.mode === 'chase') {
        const target = pl.vehicle ? pl.vehicle.pos.clone().addScaledVector(new V3(pl.vehicle.vel.x, 0, pl.vehicle.vel.y), 0.6) : pl.pos;
        // route via road grid when far: aim at nearest intersection toward the target
        let aim = target; const d = Math.hypot(target.x - v.pos.x, target.z - v.pos.z);
        if (d > 45) { const gi = Math.round((v.pos.x - ORIGIN) / P), gj = Math.round((v.pos.z - ORIGIN) / P); const onX = Math.abs(v.pos.z - (ORIGIN + gj * P)) < ROAD, onZ = Math.abs(v.pos.x - (ORIGIN + gi * P)) < ROAD;
          if (onX && !onZ) aim = new V3(target.x > v.pos.x ? Math.min(target.x, ORIGIN + Math.ceil((v.pos.x - ORIGIN) / P) * P) : Math.max(target.x, ORIGIN + Math.floor((v.pos.x - ORIGIN) / P) * P), 0, ORIGIN + gj * P);
          else if (onZ && !onX) aim = new V3(ORIGIN + gi * P, 0, target.z > v.pos.z ? Math.min(target.z, ORIGIN + Math.ceil((v.pos.z - ORIGIN) / P) * P) : Math.max(target.z, ORIGIN + Math.floor((v.pos.z - ORIGIN) / P) * P));
          else if (onX && onZ) { aim = Math.abs(target.x - v.pos.x) > Math.abs(target.z - v.pos.z) ? new V3(target.x, 0, ORIGIN + gj * P) : new V3(ORIGIN + gi * P, 0, target.z); }
        }
        chaseDrive(v, aim, dt, this.city);
        v.physics(dt, this.city); v.collideWorld(this.city, (vv, imp) => { vv.health -= imp * 0.5; }); v.sync(dt);
        if (d < 70) { near++; this.lastSeen = 0; } closest = Math.min(closest, d);
        if (Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) > 260) { const ints = this.city.intersectionsNear(pl.pos.x, pl.pos.z, 160); const ij = ints.length ? ints[Math.floor(Math.random() * ints.length)] : null; if (ij) v.place(ORIGIN + ij[0] * P, ORIGIN + ij[1] * P, 0); else v.place(pl.pos.x + 120, pl.pos.z, 0); }
      }
    }
    this.sirenNear = Math.max(0, 1 - closest / 120);
    if (this.wanted > 0) {
      this.lastSeen += dt; this.heat = Math.max(this.wanted - 1 + 0.01, this.heat - dt * 0.02);
      if (this.lastSeen > 14 + this.wanted * 3) { this.wanted--; this.heat = this.wanted; this.lastSeen = 0; if (this.wanted === 0) { this.hud.toast('Police ne peecha chhod diya 😎'); this.onEvade && this.onEvade(); } }
      // busted check
      const slow = pl.vehicle ? Math.abs(pl.vehicle.speed) < 1.2 : true;
      if (slow && closest < 7) { pl.bustT = (pl.bustT || 0) + dt; if (pl.bustT > 2.5) this.busted(); } else pl.bustT = 0;
    }
  }
  clearWanted() { this.wanted = 0; this.heat = 0; for (const v of this.police) v.remove(this.scene); this.police = []; this.traffic.extra = []; }
  busted() { this.hud.showBanner('BUSTED', true, 3000); this.money = Math.floor(this.money * 0.9); this.respawn(this.city.policeSpawn()); this.failMission('Pakde gaye!'); }
  wasted() { this.hud.showBanner('WASTED', true, 3000); this.money = Math.floor(this.money * 0.9); this.respawn(this.city.hospitalSpawn()); this.failMission('Mission fail'); }
  respawn(at) { const pl = this.player; if (pl.vehicle) this.exitVehicle(true); this.clearWanted(); pl.health = 100; pl.pos.copy(at); pl.p.play('Idle_Loop', 0.1); pl.state = 'ok'; this.save(); }

  // ---------------- vehicles ----------------
  nearestCar(r = 4) { let best = null, bd = r; for (const v of this.traffic.cars.concat(this.police)) { if (!v.root.visible) continue; const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z); if (d < bd) { bd = d; best = v; } } return best; }
  enterVehicle(v) {
    const pl = this.player; const wasAI = v.ai && (v.ai.mode === 'lane' || v.ai.mode === 'turn');
    if (wasAI) { // pull the driver out
      const d = this.peds.add(null); d.pos.set(v.pos.x + Math.cos(v.heading) * 1.8, CURB, v.pos.z - Math.sin(v.heading) * 1.8); d.state = 'flee'; d.from = pl.pos.clone(); d.t = 0; d.p.play('Sprint_Loop', 0.1);
      if (this.police.some(p => p.pos.distanceTo(pl.pos) < 50) || Math.random() < 0.3) this.crime(1);
      this.hud.toast('Gaadi chheen li! 🚗');
    } else if (v.type === 'police') this.crime(2);
    v.ai = null; v.kinematic = false; v.driver = 'player'; pl.vehicle = v; pl.p.root.visible = false;
    v.vel.set(Math.sin(v.heading) * (v.speed || 0), Math.cos(v.heading) * (v.speed || 0));
    this.input.setMode('car'); this.camYaw = v.heading; this.mission?.onEnter?.(v);
  }
  exitVehicle(force) {
    const pl = this.player, v = pl.vehicle; if (!v) return;
    if (!force && Math.abs(v.speed) > 6) return;
    v.driver = null; v.ai = { mode: 'loose', looseT: -1e9 }; v.throttle = 0; v.brake = 1; v.handbrake = true;
    pl.vehicle = null; pl.exitPending = false; pl.p.root.visible = true;
    const side = new V3(Math.cos(v.heading), 0, -Math.sin(v.heading)); // car's left
    pl.pos.set(v.pos.x + side.x * 1.9, 0, v.pos.z + side.z * 1.9); pl.pos.y = this.city.groundAt(pl.pos.x, pl.pos.z);
    this.resolvePlayer(); pl.heading = v.heading; this.camYaw = v.heading; this.input.setMode('foot');
  }
  vehicleCollisions(dt) {
    const pl = this.player; const dyn = this.police.slice(); if (pl.vehicle) dyn.push(pl.vehicle);
    const all = this.traffic.cars.concat(this.police);
    for (const a of dyn) for (const b of all) {
      if (a === b || !b.root.visible) continue; if (dyn.indexOf(b) >= 0 && dyn.indexOf(b) < dyn.indexOf(a)) continue;
      const dx0 = b.pos.x - a.pos.x, dz0 = b.pos.z - a.pos.z; if (dx0 * dx0 + dz0 * dz0 > 64) continue;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const ax = a.pos.x + Math.sin(a.heading) * a.length * 0.27 * sa, az = a.pos.z + Math.cos(a.heading) * a.length * 0.27 * sa;
        const bx = b.pos.x + Math.sin(b.heading) * b.length * 0.27 * sb, bz = b.pos.z + Math.cos(b.heading) * b.length * 0.27 * sb;
        const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), r = a.radius + b.radius;
        if (d < r && d > 1e-4) {
          const nx = dx / d, nz = dz / d, pen = r - d;
          if (b.kinematic || (b.ai && b.ai.mode !== 'loose' && b.ai.mode !== 'chase' && b.driver !== 'player')) { b.kinematic = false; if (b.ai) { b.ai.mode = 'loose'; b.ai.looseT = 0; } b.vel.set(Math.sin(b.heading) * (b.ai?.speed || 0), Math.cos(b.heading) * (b.ai?.speed || 0)); }
          const ma = a.mass, mb = b.mass, tot = ma + mb;
          a.pos.x -= nx * pen * mb / tot; a.pos.z -= nz * pen * mb / tot; b.pos.x += nx * pen * ma / tot; b.pos.z += nz * pen * ma / tot;
          const rv = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * nz;
          if (rv < 0) {
            const j = -(1.3) * rv / (1 / ma + 1 / mb);
            a.vel.x -= j * nx / ma; a.vel.y -= j * nz / ma; b.vel.x += j * nx / mb; b.vel.y += j * nz / mb;
            const imp = -rv; if (imp > 3) { a.health -= imp * 0.6; b.health -= imp * 0.6; this.audio.crash(imp); if (a === pl.vehicle) { this.shake = Math.min(1, imp / 15); if (b.type === 'police') this.crime(1, b.pos); } }
          }
        }
      }
    }
    // cars vs pedestrians
    for (const v of dyn) {
      const sp = Math.abs(v.speed); if (sp < 3) continue;
      for (const d of this.peds.list) {
        if (d.state === 'down') continue; const dx = d.pos.x - v.pos.x, dz = d.pos.z - v.pos.z; if (dx * dx + dz * dz > 9) continue;
        const f = v.forward; const fw = dx * f.x + dz * f.z, lat = Math.abs(dx * f.z - dz * f.x);
        if (Math.abs(fw) < v.length * 0.55 + 0.3 && lat < v.width * 0.5 + 0.35) { if (this.peds.knock(d, new V3(v.vel.x, 2, v.vel.y).normalize(), sp)) { this.audio.punch(); if (v === pl.vehicle) this.crime(1, d.pos); } }
      }
    }
  }

  // ---------------- player on foot ----------------
  resolvePlayer() {
    const pl = this.player, r = 0.38;
    for (const c of this.city.query(pl.pos.x, pl.pos.z, 2)) {
      if (pl.pos.y > c.h) continue;
      const px = Math.max(c.x0, Math.min(pl.pos.x, c.x1)), pz = Math.max(c.z0, Math.min(pl.pos.z, c.z1));
      const dx = pl.pos.x - px, dz = pl.pos.z - pz, d = Math.hypot(dx, dz);
      if (d < r) { if (d < 1e-4) { // inside: push out the shortest way
          const opts = [[c.x0 - r - pl.pos.x, 0], [c.x1 + r - pl.pos.x, 0], [0, c.z0 - r - pl.pos.z], [0, c.z1 + r - pl.pos.z]].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          pl.pos.x += opts[0][0]; pl.pos.z += opts[0][1]; } else { pl.pos.x += dx / d * (r - d); pl.pos.z += dz / d * (r - d); } }
    }
    for (const v of this.traffic.cars.concat(this.police)) {
      if (!v.root.visible) continue;
      for (const s of [-1, 1]) { const cx = v.pos.x + Math.sin(v.heading) * v.length * 0.27 * s, cz = v.pos.z + Math.cos(v.heading) * v.length * 0.27 * s; const dx = pl.pos.x - cx, dz = pl.pos.z - cz, d = Math.hypot(dx, dz), R = v.radius + r;
        if (d < R && d > 1e-4) { pl.pos.x += dx / d * (R - d); pl.pos.z += dz / d * (R - d); if (Math.abs(v.speed) > 6 && pl.hitT <= 0) { pl.health -= Math.abs(v.speed) * 2.5; pl.hitT = 1.2; pl.p.play('Hit_Chest', 0.05, true); this.audio.crash(8); } } }
    }
  }
  updateFoot(dt, inp) {
    const pl = this.player; pl.hitT -= dt; pl.punchT -= dt;
    const mv = new V3(inp.mx, 0, inp.my); const mag = Math.min(1, mv.length());
    const camF = new V3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)), camR = new V3(-camF.z, 0, camF.x);
    const dir = camF.clone().multiplyScalar(inp.my).add(camR.clone().multiplyScalar(-inp.mx));
    let speed = 0;
    if (mag > 0.1 && pl.hitT < 0.6) {
      dir.normalize(); const want = Math.atan2(dir.x, dir.z); let df = want - pl.heading; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI;
      pl.heading += df * Math.min(1, dt * 10);
      speed = inp.sprint ? 6.8 : mag > 0.75 ? 3.9 : 1.6;
      pl.pos.x += Math.sin(pl.heading) * speed * dt; pl.pos.z += Math.cos(pl.heading) * speed * dt;
    }
    // jump / gravity / curb steps
    const g = this.city.groundAt(pl.pos.x, pl.pos.z);
    if (inp.jump && pl.grounded) { pl.vy = 5.2; pl.grounded = false; pl.p.play('Jump_Start', 0.05, true); }
    pl.vy -= 14 * dt; pl.pos.y += pl.vy * dt;
    if (pl.pos.y <= g) { if (!pl.grounded && pl.vy < -2) pl.p.play('Jump_Land', 0.05, true); pl.pos.y = g; pl.vy = 0; pl.grounded = true; }
    this.resolvePlayer();
    // punch
    if (inp.punch && pl.punchT <= 0) {
      pl.punchT = 0.55; pl.p.play(Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', 0.05, true, 1.3); this.audio.punch();
      const f = new V3(Math.sin(pl.heading), 0, Math.cos(pl.heading));
      for (const d of this.peds.list) { const dx = d.pos.x - pl.pos.x, dz = d.pos.z - pl.pos.z; if (Math.hypot(dx, dz) < 1.7 && dx * f.x + dz * f.z > 0.2 && d.state !== 'down') { this.peds.knock(d, f, 4); this.crime(1, d.pos); } }
    }
    // animation state
    const busy = pl.punchT > 0.1 || pl.hitT > 0.6 || !pl.grounded;
    if (!pl.grounded) { if (pl.vy < 0 && pl.p.cur !== pl.p.actions.Jump_Loop) pl.p.play('Jump_Loop', 0.2); }
    else if (!busy || (pl.p.cur && pl.p.cur.loop === THREE.LoopOnce && !pl.p.cur.isRunning())) {
      if (speed > 6) pl.p.play('Sprint_Loop', 0.2); else if (speed > 3) pl.p.play('Jog_Fwd_Loop', 0.2); else if (speed > 0.5) pl.p.play('Walk_Loop', 0.2); else pl.p.play('Idle_Loop', 0.25);
    }
    pl.p.root.position.copy(pl.pos); pl.p.root.rotation.y = pl.heading;
    pl.p.mixer.update(dt);
    // enter vehicle prompt
    const near = this.nearestCar(4);
    this.hud.prompt(near ? (this.input.touch ? 'Tap 🚗 ENTER' : 'Press F to enter') : null);
    if (inp.enter && near) this.enterVehicle(near);
  }
  updateDrive(dt, inp) {
    const pl = this.player, v = pl.vehicle;
    const fwd = v.speed;
    // Gas/brake semantics: brake button reverses when stopped
    if (inp.gas) { v.throttle = 1; v.brake = 0; } else if (inp.brake) { if (fwd > 1) { v.throttle = 0; v.brake = 1; } else { v.throttle = -1; v.brake = 0; } } else { v.throttle = 0; v.brake = 0; }
    if (this.input.touch && !inp.gas && !inp.brake && inp.my > 0.4) v.throttle = inp.my; // joystick up also accelerates
    v.steer = inp.steer; v.handbrake = inp.handbrake;
    v.physics(dt, this.city);
    v.collideWorld(this.city, (vv, imp) => { vv.health -= imp * 0.8; this.audio.crash(imp); this.shake = Math.min(1, imp / 14); });
    v.pos.y = 0; v.sync(dt);
    pl.pos.set(v.pos.x, 0, v.pos.z); pl.heading = v.heading;
    if (v.health <= 0 && !v.dead) { v.dead = true; this.hud.toast('Gaadi kharab ho gayi! Bahar niklo'); }
    if (inp.enter) { if (Math.abs(v.speed) > 6) { pl.exitPending = !pl.exitPending; if (pl.exitPending) this.hud.toast('Gaadi rok rahe hain…'); } else this.exitVehicle(false); }
    if (pl.exitPending && pl.vehicle) { v.throttle = 0; v.brake = 1; v.vel.multiplyScalar(Math.exp(-2.5 * dt)); if (Math.abs(v.speed) < 3) { pl.exitPending = false; this.exitVehicle(true); } }
    this.hud.prompt(null);
  }

  // ---------------- camera ----------------
  updateCamera(dt, inp) {
    const pl = this.player, cam = this.camera;
    if (window.__cam) { const c = window.__cam; cam.position.set(...c.p); cam.lookAt(...c.t); if (c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); } return; }
    this.camYaw -= inp.lookX * 0.0035; this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.lookY * 0.0025, -0.25, 1.1);
    if (inp.cam) this.camMode = (this.camMode + 1) % 3;
    let target, dist, height;
    if (pl.vehicle) {
      const v = pl.vehicle; const big = v.T.kind === 'truck' ? 1.4 : v.type === 'auto' ? 0.8 : 1;
      if (Math.abs(inp.lookX) > 0.5) this.camLookOverride = 2.0; this.camLookOverride -= dt;
      if (this.camLookOverride <= 0) { let df = v.heading - this.camYaw; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI; this.camYaw += df * Math.min(1, dt * (Math.abs(v.speed) > 2 ? 3.5 : 1.0)); this.camPitch += (0.22 - this.camPitch) * Math.min(1, dt * 2); }
      dist = [7.2, 10.5, 4.6][this.camMode] * big; height = [2.4, 3.6, 1.7][this.camMode] * big;
      target = new V3(v.pos.x, 1.15 * big, v.pos.z);
      cam.fov += ((62 + Math.min(18, Math.abs(v.speed) * 0.45)) - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
    } else {
      dist = [4.2, 6.5, 2.6][this.camMode]; height = 1.55; target = new V3(pl.pos.x, pl.pos.y + 1.55, pl.pos.z);
      cam.fov += (60 - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
    }
    const back = new V3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    let want = target.clone().addScaledVector(back, dist); want.y += pl.vehicle ? height - 1.0 : 0.15;
    // shoulder offset on foot
    if (!pl.vehicle) { const right = new V3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw)); want.addScaledVector(right, -0.45); }
    // camera collision with buildings (march)
    const steps = 12; for (let i = 1; i <= steps; i++) { const p = target.clone().lerp(want, i / steps); let hit = false; for (const c of this.city.query(p.x, p.z, 0.5)) if (p.x > c.x0 - 0.3 && p.x < c.x1 + 0.3 && p.z > c.z0 - 0.3 && p.z < c.z1 + 0.3 && p.y < c.h) { hit = true; break; } if (hit) { want = target.clone().lerp(want, (i - 1.5) / steps); break; } }
    // keep the camera out from under shop awnings
    for (const b of this.city.camBlocksAll()) if (want.x > b.x0 && want.x < b.x1 && want.z > b.z0 && want.z < b.z1 && want.y > b.y0 - 0.2 && want.y < b.y1 + 0.4) want.y = b.y0 - 0.25;
    want.y = Math.max(want.y, 0.5);
    if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
    this.camPos.lerp(want, Math.min(1, dt * (pl.vehicle ? 8 : 12)));
    cam.position.copy(this.camPos);
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.3; cam.position.y += (Math.random() - 0.5) * this.shake * 0.3; this.shake -= dt * 2; }
    const look = target.clone(); if (pl.vehicle) look.addScaledVector(pl.vehicle.forward, 3);
    cam.lookAt(look);
  }

  // ---------------- missions ----------------
  buildMissions() {
    const c = this.city; const mk = (bx, bz, side, t = 0.5) => { const [x0, z0, x1, z1] = c.blockRect(bx, bz); const m = SIDE / 2; if (side === 'n') return new V3(x0 + (x1 - x0) * t, CURB, z0 + m); if (side === 's') return new V3(x0 + (x1 - x0) * t, CURB, z1 - m); if (side === 'w') return new V3(x0 + m, CURB, z0 + (z1 - z0) * t); return new V3(x1 - m, CURB, z0 + (z1 - z0) * t); };
    this.missionDefs = [
      { id: 'mithai', name: 'Mithai Delivery', start: mk(3, 4, 'e', 0.4), desc: 'Sharma Sweets ka order — 2 minute mein Hotel Shanti pahunchao!', reward: 500 },
      { id: 'auto', name: 'Auto Wala', start: mk(5, 3, 'w', 0.5), desc: 'Auto lo, sawari ko uthao aur manzil tak chhodo.', reward: 800 },
      { id: 'bhaago', name: 'Police Se Bhaago', start: mk(6, 2, 'n', 0.5), desc: 'Thane ke saamne se sports car uthao aur police se bach ke dikhao!', reward: 2000 },
      { id: 'parcel', name: 'Sonapur Parcel', start: mk(7, 4, 'e', 0.5), desc: 'Parcel highway se Sonapur Bazaar pahunchao — 3 minute!', reward: 1500, drive: { bx: 18, bz: 3, side: 'w', time: 180, label: 'Sonapur Bazaar' } },
      { id: 'beach', name: 'Samudra Trip', start: mk(4, 1, 'n', 0.6), desc: 'NH-7 pakdo aur Samudra Nagar beach pahunchao — 3 minute!', reward: 1200, drive: { bx: 4, bz: -13, side: 'n', time: 180, label: 'Samudra Nagar' } },
    ];
    const ringG = new THREE.CylinderGeometry(1.4, 1.4, 2.4, 32, 1, true); ringG.translate(0, 1.2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.markerGeo = ringG; this.markerMat = mat;
    for (const d of this.missionDefs) { const m = new THREE.Mesh(ringG, mat); m.position.copy(d.start); this.scene.add(m); d.marker = m; }
    // clothes shop (Character Creator in the city)
    this.shopPos = mk(4, 4, 'w', 0.62);
    this.shopMarker = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff4fa0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.shopMarker.position.copy(this.shopPos); this.scene.add(this.shopMarker);
    this.goal = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x33aaff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.goal.scale.set(2.2, 1.6, 2.2); this.goal.visible = false; this.scene.add(this.goal);
  }
  blips() {
    const out = [];
    if (!this.mission) for (const d of this.missionDefs) out.push({ x: d.start.x, z: d.start.z, color: this.done[d.id] ? '#c9a000' : '#ffd400', size: 8 });
    if (this.shopPos) out.push({ x: this.shopPos.x, z: this.shopPos.z, color: '#ff4fa0', size: 8, label: '👕 Kapde' });
    if (this.goal.visible) out.push({ x: this.goal.position.x, z: this.goal.position.z, color: '#3af', size: 9 });
    const t = performance.now() / 250 | 0; for (const v of this.police) out.push({ x: v.pos.x, z: v.pos.z, color: t % 2 ? '#f33' : '#36f', size: 6 });
    return out;
  }
  startMission(d) {
    const c = this.city; this.mission = { def: d, t: 0, stage: 0 };
    this.hud.showBanner(d.name.toUpperCase(), false, 2200); d.marker.visible = false;
    const m = this.mission;
    const roadSpot = (bx, bz, side) => { const [x0, z0, x1, z1] = c.blockRect(bx, bz); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; if (side === 'e') return new V3(x1 + 3.5, 0, mz); if (side === 'w') return new V3(x0 - 3.5, 0, mz); if (side === 'n') return new V3(mx, 0, z0 - 3.5); return new V3(mx, 0, z1 + 3.5); };
    if (d.drive) {
      m.time = d.drive.time; m.goal = roadSpot(d.drive.bx, d.drive.bz, d.drive.side); this.setGoal(m.goal);
      this.hud.showMission(`<span class="t">${d.name}</span> — ${d.drive.label} (blue) tak pahunchao!`);
      if (!this.player.vehicle) this.hud.toast('Koi bhi gaadi pakdo 🚗 — map (🗺) dekho');
    } else if (d.id === 'mithai') {
      m.time = 120; m.goal = roadSpot(6, 6, 'w'); this.setGoal(m.goal);
      this.hud.showMission(`<span class="t">Mithai Delivery</span> — Hotel Shanti (blue) tak pahunchao!`);
      if (!this.player.vehicle) this.hud.toast('Koi bhi gaadi pakdo 🚗');
    } else if (d.id === 'auto') {
      const at = roadSpot(5, 3, 'w'); const auto = new Vehicle(this.scene, 'auto', this.Q); auto.ai = { mode: 'empty' }; auto.place(at.x - 1, at.z + 6, 0); this.traffic.cars.push(auto); m.auto = auto;
      m.pick = roadSpot(2, 2, 'e'); m.drop = roadSpot(7, 6, 'n'); this.setGoal(at);
      this.hud.showMission(`<span class="t">Auto Wala</span> — Auto mein baitho`);
      m.onEnter = (v) => { if (v === m.auto && m.stage === 0) { m.stage = 1; this.setGoal(m.pick); this.hud.showMission(`<span class="t">Auto Wala</span> — Sawari ko pick karo (blue)`); } };
      const pass = this.peds.add(null, { female: true }); pass.state = 'idle'; pass.t = -999; pass.pos.set(m.pick.x + 3.6, CURB, m.pick.z); pass.p.play('Idle_Loop'); m.pass = pass;
    } else if (d.id === 'bhaago') {
      const at = roadSpot(6, 2, 'n'); const car = new Vehicle(this.scene, 'sports', this.Q, { paint: 0xe8c013 }); car.ai = { mode: 'empty' }; car.place(at.x, at.z, Math.PI / 2); this.traffic.cars.push(car); m.car = car; this.setGoal(at);
      this.hud.showMission(`<span class="t">Police Se Bhaago</span> — Peeli sports car chura lo!`);
      m.onEnter = (v) => { if (v === m.car && m.stage === 0) { m.stage = 1; this.crime(3); this.wanted = 3; this.goal.visible = false; this.hud.showMission(`<span class="t">Police Se Bhaago</span> — Police se bach ke dikhao! ★★★`); } };
      this.onEvade = () => { if (this.mission && this.mission.def.id === 'bhaago' && this.mission.stage === 1) this.passMission(); };
    }
  }
  setGoal(p) { this.goal.position.set(p.x, 0, p.z); this.goal.visible = true; }
  passMission() {
    const d = this.mission.def; this.money += d.reward; this.done[d.id] = true; this.audio.cash();
    this.hud.showBanner('MISSION PASSED', false, 3000); setTimeout(() => this.hud.toast(`+₹${d.reward} 💰`), 600);
    this.endMission();
  }
  failMission(why) { if (!this.mission) return; this.hud.toast('Mission failed: ' + why, 3000); this.endMission(); }
  endMission() { const m = this.mission; if (m) { m.def.marker.visible = true; if (m.pass) { m.pass.state = 'walk'; m.pass.p.root.visible = true; } } this.mission = null; this.goal.visible = false; this.hud.showMission(null); this.onEvade = null; this.save(); }
  updateMission(dt) {
    const pl = this.player, m = this.mission;
    for (const d of this.missionDefs) { d.marker.rotation.y += dt; d.marker.material.opacity = 0.25 + 0.15 * Math.sin(this.time * 3); }
    this.goal.rotation.y -= dt;
    if (this.shopMarker) { this.shopMarker.rotation.y += dt; const ds = Math.hypot(pl.pos.x - this.shopPos.x, pl.pos.z - this.shopPos.z);
      if (!pl.vehicle && ds < 1.6 && !this.inShop && this.wanted === 0 && this.openShop) { this.inShop = true; this.openShop(); } else if (ds > 3) this.inShop = false;
      if (!pl.vehicle && ds < 6 && ds >= 1.6 && !this.inShop) this.hud.prompt('👕 Kapde ki dukaan — gol ghere mein jao'); }
    if (!m) {
      if (!pl.vehicle) for (const d of this.missionDefs) if (d.marker.visible && Math.hypot(pl.pos.x - d.start.x, pl.pos.z - d.start.z) < 1.6) { this.startMission(d); break; }
      return;
    }
    m.t += dt; const near = (p, r) => Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < r;
    if (m.def.drive) {
      const left = Math.max(0, m.time - m.t); const dist = Math.round(Math.hypot(pl.pos.x - m.goal.x, pl.pos.z - m.goal.z));
      this.hud.showMission(`<span class="t">${m.def.name}</span> — ${m.def.drive.label}: ${dist > 999 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m'} · ⏱ ${Math.ceil(left)}s`);
      if (near(m.goal, 8)) this.passMission(); else if (left <= 0) this.failMission('Time khatam!');
    } else if (m.def.id === 'mithai') {
      const left = Math.max(0, m.time - m.t); this.hud.showMission(`<span class="t">Mithai Delivery</span> — Hotel Shanti pahunchao! ⏱ ${Math.ceil(left)}s`);
      if (near(m.goal, 6)) this.passMission(); else if (left <= 0) this.failMission('Time khatam! Mithai thandi ho gayi');
    } else if (m.def.id === 'auto') {
      if (m.stage === 1 && near(m.pick, 7) && pl.vehicle === m.auto && Math.abs(m.auto.speed) < 2) { m.stage = 2; m.pass.p.root.visible = false; this.setGoal(m.drop); this.hud.showMission(`<span class="t">Auto Wala</span> — Sawari ko manzil tak chhodo (blue)`); this.hud.toast('Bhaiya, jaldi chalo! 🛺'); }
      if (m.stage === 2) { m.pass.pos.copy(m.auto.pos); if (near(m.drop, 7) && pl.vehicle === m.auto && Math.abs(m.auto.speed) < 2) { m.pass.p.root.visible = true; m.pass.pos.set(m.drop.x + 3.6, CURB, m.drop.z); m.pass.state = 'walk'; m.pass.t = 0; this.passMission(); } }
    }
  }

  // ---------------- main tick ----------------
  update(dt, inp) {
    this.time += dt; const pl = this.player;
    if (inp.rain) { this.env.rainTarget = this.env.rainTarget > 0.5 ? 0 : 1; this.hud.toast(this.env.rainTarget ? 'Baarish 🌧' : 'Mausam saaf ☀️'); }
    if (inp.time) { this.env.time = (this.env.time + 3) % 24; }
    if (pl.vehicle) this.updateDrive(dt, inp); else this.updateFoot(dt, inp);
    this.vehicleCollisions(dt);
    this.updatePolice(dt);
    this.updateMission(dt);
    for (const v of this.traffic.cars) if (v.ai && v.ai.mode === 'empty' && v !== pl.vehicle) v.sync(dt);
    if (pl.health <= 0 && pl.state !== 'dead') { pl.state = 'dead'; this.wasted(); }
    this.updateCamera(dt, inp);
    this.hud.set(this.state());
    this.hud.draw(pl, pl.vehicle ? this.camYaw : this.camYaw, this.blips());
    this.audio.update(dt, { inCar: !!pl.vehicle, speed: pl.vehicle?.speed || 0, throttle: pl.vehicle?.throttle || 0, skid: pl.vehicle?.skid || 0, rain: this.env.rain, night: this.env.night, sirenNear: this.sirenNear, horn: inp.horn && !!pl.vehicle });
    this.regT = (this.regT || 0) - dt; if (this.regT <= 0) { this.regT = 1; const rn = this.city.regionNameAt(pl.pos.x, pl.pos.z); if (rn !== this.region) { if (this.region !== undefined) this.hud.showRegion(rn, rn === 'Highway' ? 'NH-44 · NH-7' : ''); this.region = rn; } }
    this.saveT = (this.saveT || 0) + dt; if (this.saveT > 20) { this.saveT = 0; this.save(); }
  }
}
