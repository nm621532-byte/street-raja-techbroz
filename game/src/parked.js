
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carTemplate } from './vehicles.js';

// Parked cars & auto-rickshaws along the kerbs. One InstancedMesh per (car type × material), shared by the whole
// streamed city, so a street full of parked cars costs ~30 draw calls total instead of ~15 per car.
const TYPES = ['sedan', 'hatch', 'suv', 'taxi', 'auto'];
const PAINTS_AUTO = [0x1f7a2e, 0x1f7a2e, 0xf2c418, 0x111111];
const PAINTS = [0xb0121b, 0xf0f0ec, 0x16181c, 0x1d3f8a, 0x8e9499, 0xc9b38a, 0x0f5132, 0xd96c06, 0x6b0f0f, 0x2b4a66, 0xd7d9db, 0x5c6b73, 0xe3e4e0, 0x7a1f2b, 0x9a8f80];
const WHITE = 0xfdfdfd;

function strip(g) {
  let n = g.index ? g.toNonIndexed() : g.clone();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', n.attributes.position);
  if (!n.attributes.normal) n.computeVertexNormals();
  out.setAttribute('normal', n.attributes.normal);
  const cnt = n.attributes.position.count;
  out.setAttribute('color', n.attributes.color && n.attributes.color.itemSize === 3 ? n.attributes.color : new THREE.Float32BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
  out.setAttribute('uv', n.attributes.uv && n.attributes.uv.itemSize === 2 ? n.attributes.uv : new THREE.Float32BufferAttribute(new Float32Array(cnt * 2), 2));
  return out;
}
function sub(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'uv']) { const a = g.attributes[k]; out.setAttribute(k, new THREE.Float32BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize)); }
  return out;
}
function template(type, Q) {
  const T = carTemplate(type, Q); const v = { root: T.root };
  v.root.position.set(0, 0, 0); v.root.rotation.set(0, 0, 0); v.root.updateMatrixWorld(true);
  const byMat = new Map();
  v.root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = strip(o.geometry);
    const groups = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex]; if (!mat || (mat.transparent && mat.opacity < 0.05)) continue;
      const s = sub(g, gr.start, Math.min(gr.count, g.attributes.position.count - gr.start)); s.applyMatrix4(o.matrixWorld);
      if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(s);
    }
  });
  const parts = [];
  for (const [mat, list] of byMat) {
    const geo = mergeGeometries(list, false); if (!geo) continue;
    const paint = T.glb ? (mat === T.paintMat && type !== 'taxi') : (type !== 'taxi' && type !== 'auto' && mat.color && mat.color.getHex() === WHITE && (mat.clearcoat !== undefined || mat.metalness > 0.3));
    parts.push({ geo, mat, paint });
  }
  return parts;
}

export class ParkedFleet {
  constructor(scene, city, Q) {
    this.city = city; this.Q = Q; this.scene = scene;
    this.R = Q.id === 'low' ? 110 : Q.id === 'medium' ? 160 : Q.id === 'high' ? 230 : 280;
    this.max = Q.id === 'low' ? 40 : Q.id === 'medium' ? 70 : 120;
    this.meshes = TYPES.map(t => template(t, Q).map(p => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, this.max); im.count = 0; im.frustumCulled = false;
      im.castShadow = !!Q.shadows && Q.id !== 'medium'; im.receiveShadow = true;
      if (p.paint) im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.userData.paint = p.paint; scene.add(im); return im;
    }));
    this.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }), this.max);
    this.blob.count = 0; this.blob.frustumCulled = false; this.blob.renderOrder = 1; scene.add(this.blob);
    this.t = 9; this.lastKey = ''; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.c = new THREE.Color();
  }
  update(dt, focus) {
    this.t += dt; if (this.t < 0.6) return; this.t = 0;
    const fx = Math.round(focus.x / 20), fz = Math.round(focus.z / 20); const key = fx + ',' + fz + ',' + this.city.chunks.size;
    if (key === this.lastKey) return; this.lastKey = key;
    const all = [];
    for (const ch of this.city.chunks.values()) if (ch.parked2) for (const p of ch.parked2) { const d = Math.hypot(p.x - focus.x, p.z - focus.z); if (d < this.R) all.push([d, p]); }
    all.sort((a, b) => a[0] - b[0]); const list = all.slice(0, this.max).map(a => a[1]);
    const counts = TYPES.map(() => 0); const up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), sb = new THREE.Vector3();
    let nb = 0;
    for (const p of list) {
      const ti = Math.min(p.type, TYPES.length - 1); const n = counts[ti]++;
      this.q.setFromAxisAngle(up, p.heading); this.m.compose(new THREE.Vector3(p.x, 0, p.z), this.q, one);
      for (const im of this.meshes[ti]) { im.setMatrixAt(n, this.m); if (im.userData.paint) { const pal = ti === 4 ? PAINTS_AUTO : PAINTS; im.setColorAt(n, this.c.setHex(pal[Math.floor(p.col * pal.length) % pal.length])); } }
      const L = ti === 4 ? 3.0 : 4.9, W = ti === 4 ? 1.7 : 2.25;
      sb.set(W, 1, L); this.m.compose(new THREE.Vector3(p.x, 0.03, p.z), this.q, sb); this.blob.setMatrixAt(nb++, this.m);
    }
    this.meshes.forEach((arr, ti) => arr.forEach(im => { im.count = counts[ti]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }));
    this.blob.count = nb; this.blob.instanceMatrix.needsUpdate = true;
  }
}
// soft contact shadow texture (also used under moving cars & people)
let _blob = null;
export function blobTex() {
  if (_blob) return _blob;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _blob = new THREE.CanvasTexture(c); return _blob;
}
