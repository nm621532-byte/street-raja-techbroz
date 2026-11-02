
import * as THREE from 'three';
import { N, SIDE, CURB } from './city.js';
import { makePerson } from './characters.js';

// Pedestrians walk loops around block sidewalks; flee from danger; get knocked down by cars.
export class Peds {
  constructor(scene, city, Q) { this.scene = scene; this.city = city; this.Q = Q; this.list = []; }
  spawn(count, near) { for (let i = 0; i < count; i++) this.add(near); }
  add(near, opts = {}) {
    const p = makePerson(Object.assign({ npc: true }, opts)); this.scene.add(p.root);
    const ped = { p, pos: new THREE.Vector3(), heading: 0, state: 'walk', t: 0, speed: 1.2 + Math.random() * 0.5, dir: Math.random() < 0.5 ? 1 : -1, blk: null, s: 0, hp: 100 };
    this.place(ped, near); this.list.push(ped); return ped;
  }
  place(ped, near) {
    const city = this.city; let blk, tries = 0;
    do { blk = city.blocks[Math.floor(Math.random() * city.blocks.length)]; tries++; }
    while (near && tries < 60 && (Math.hypot((blk.x0 + blk.x1) / 2 - near.x, (blk.z0 + blk.z1) / 2 - near.z) > 170 || Math.hypot((blk.x0 + blk.x1) / 2 - near.x, (blk.z0 + blk.z1) / 2 - near.z) < 20));
    ped.blk = blk; const inset = 1.6 + Math.random() * 1.6; ped.inset = inset;
    ped.per = 2 * ((blk.x1 - blk.x0 - 2 * inset) + (blk.z1 - blk.z0 - 2 * inset)); ped.s = Math.random() * ped.per;
    ped.state = 'walk'; ped.hp = 100; ped.p.root.visible = true; ped.t = 0; ped.p.play('Walk_Loop', 0.1);
    const q = this.pointAt(ped, ped.s); ped.pos.set(q.x, CURB, q.z);
  }
  pointAt(ped, s) {
    const b = ped.blk, i = ped.inset; const w = b.x1 - b.x0 - 2 * i, h = b.z1 - b.z0 - 2 * i; s = ((s % ped.per) + ped.per) % ped.per;
    if (s < w) return { x: b.x0 + i + s, z: b.z0 + i };
    if (s < w + h) return { x: b.x1 - i, z: b.z0 + i + (s - w) };
    if (s < 2 * w + h) return { x: b.x1 - i - (s - w - h), z: b.z1 - i };
    return { x: b.x0 + i, z: b.z1 - i - (s - 2 * w - h) };
  }
  scare(pos, radius = 25) { for (const d of this.list) if (d.state === 'walk' && d.pos.distanceTo(pos) < radius) { d.state = 'flee'; d.t = 0; d.from = pos.clone(); d.p.play('Sprint_Loop', 0.15); } }
  knock(d, dir, speed) {
    if (d.state === 'down') return false; d.state = 'down'; d.t = 0; d.hp = 0; d.vel = dir.clone().multiplyScalar(Math.min(10, speed * 0.6)); d.p.play('Death01', 0.08, true);
    return true;
  }
  update(dt, player, camPos) {
    for (const d of this.list) {
      d.t += dt;
      const far = camPos ? d.pos.distanceTo(camPos) : 0;
      if (d.state === 'walk') {
        d.s += d.dir * d.speed * dt; const q = this.pointAt(d, d.s), q2 = this.pointAt(d, d.s + d.dir * 0.5);
        d.pos.set(q.x, CURB, q.z); d.heading = Math.atan2(q2.x - q.x, q2.z - q.z);
        if (d.t > 30 + Math.random() * 30 && Math.random() < dt * 0.05) { d.state = 'idle'; d.t = 0; d.p.play(Math.random() < 0.5 ? 'Idle_Talking_Loop' : 'Idle_Loop', 0.3); }
      } else if (d.state === 'idle') {
        if (d.t > 4 + Math.random() * 6) { d.state = 'walk'; d.t = 0; d.p.play('Walk_Loop', 0.3); }
      } else if (d.state === 'flee') {
        const away = new THREE.Vector3(d.pos.x - d.from.x, 0, d.pos.z - d.from.z).normalize();
        d.heading = Math.atan2(away.x, away.z);
        const nx = d.pos.x + away.x * 5.5 * dt, nz = d.pos.z + away.z * 5.5 * dt;
        if (!this.blocked(nx, nz)) { d.pos.x = nx; d.pos.z = nz; } else { d.heading += Math.PI / 2; d.from.set(d.pos.x - Math.cos(d.heading), 0, d.pos.z + Math.sin(d.heading)); }
        d.pos.y = this.city.groundAt(d.pos.x, d.pos.z);
        if (d.t > 6) { this.place(d, player.pos); }
      } else if (d.state === 'down') {
        if (d.vel) { d.pos.addScaledVector(d.vel, dt); d.vel.multiplyScalar(Math.max(0, 1 - dt * 3)); }
        d.pos.y = this.city.groundAt(d.pos.x, d.pos.z);
        if (d.t > 12) this.place(d, player.pos);
      }
      // keep the crowd around the player
      if (far > 190 && d.state !== 'down') this.place(d, player.pos);
      d.p.root.position.copy(d.pos); d.p.root.rotation.y = d.heading;
      // cheap LOD: far peds animate at lower rate
      d.acc = (d.acc || 0) + dt; const step = far > 60 ? 0.1 : far > 30 ? 0.05 : 0;
      if (d.acc >= step) { d.p.mixer.update(d.acc); d.acc = 0; }
      const vis = far < (this.visR || (this.visR = { low: 70, medium: 100, high: 140, ultra: 165 }[this.Q.id] || 120)); d.p.root.visible = vis;
      const cs = vis && far < 28; if (cs !== d.cs) { d.cs = cs; d.p.root.traverse(n => { if (n.isMesh) n.castShadow = cs; }); }
    }
  }
  blocked(x, z) { for (const c of this.city.query(x, z, 1)) if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) return true; return false; }
}
