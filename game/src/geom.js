
import * as THREE from 'three';
// Small geometry builder that writes world-space-UV boxes/quads into big merged buffers.
export class GB {
  constructor(withInfo = false) { this.p = []; this.n = []; this.uv = []; this.i = []; this.info = withInfo ? [] : null; this.info2 = withInfo ? [] : null; }
  quad(a, b, c, d, nrm, uvs, info, info2) {
    const base = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    if (this.info) for (let k = 0; k < 4; k++) { this.info.push(...info); this.info2.push(...info2); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // axis aligned box; UVs in meters / s. faces: mask {top,bottom,sides}
  box(x0, y0, z0, x1, y1, z1, s = 1, opt = {}) {
    const u = (a) => a / s;
    if (opt.top !== false) this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],[[u(x0),u(-z1)],[u(x1),u(-z1)],[u(x1),u(-z0)],[u(x0),u(-z0)]]);
    if (opt.sides !== false) {
      this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],[[u(x0),u(y0)],[u(x1),u(y0)],[u(x1),u(y1)],[u(x0),u(y1)]]);
      this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],[[u(-x1),u(y0)],[u(-x0),u(y0)],[u(-x0),u(y1)],[u(-x1),u(y1)]]);
      this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[1,0,0],[[u(-z1),u(y0)],[u(-z0),u(y0)],[u(-z0),u(y1)],[u(-z1),u(y1)]]);
      this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0],[[u(z0),u(y0)],[u(z1),u(y0)],[u(z1),u(y1)],[u(z0),u(y1)]]);
    }
    if (opt.bottom) this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],[[0,0],[1,0],[1,1],[0,1]]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.info) { g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4)); g.setAttribute('aInfo2', new THREE.Float32BufferAttribute(this.info2, 4)); }
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get empty() { return this.i.length === 0; }
}

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
