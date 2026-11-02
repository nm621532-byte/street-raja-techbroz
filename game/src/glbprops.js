
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLTF } from './assets.js';

// Real CC0 street props (Poly Haven + Grab3D), merged per material and instanced per streamed chunk.
// Each model is normalised: origin at the bottom centre, scaled to a real-world height in metres,
// long axis along +Z (for bikes / cows / carts) so placement code can just give a yaw.
export const PROP_SPEC = {
  scooter: { h: 1.12, len: true }, moped: { h: 1.08, len: true }, motorcycle: { h: 1.12, len: true },
  aircon: { h: 0.6 }, pot: { h: 0.95 }, planter: { h: 0.6 }, trash: { h: 0.95 }, ubox: { h: 1.25 }, powerbox: { h: 1.5 },
  stall: { h: 2.7 }, cart: { h: 1.5, len: true }, cow: { h: 1.45, len: true }, shutter: { w: 2.6 },
  oak: { h: 7.5 }, olive: { h: 5.6 }, crate: { h: 0.34 }, lpg: { h: 0.62 }, dish: { h: 0.85 },
};
export const propModels = {};

function clean(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  if (!g.attributes.normal) g.computeVertexNormals();
  out.setAttribute('normal', g.attributes.normal);
  const n = g.attributes.position.count;
  out.setAttribute('uv', g.attributes.uv && g.attributes.uv.itemSize === 2 ? g.attributes.uv : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return out;
}

export async function loadProps(Q, names = ['scooter', 'moped', 'motorcycle', 'aircon', 'pot', 'planter', 'trash', 'ubox', 'powerbox', 'stall', 'cart', 'cow', 'lpg', 'dish']) {
  const dir = Q.id === 'low' ? 'models/props/512/' : 'models/props/';
  await Promise.all(names.map(async (name) => {
    try {
      const gl = await loadGLTF(dir + name + '.glb'); const root = gl.scene; root.updateMatrixWorld(true);
      const byMat = new Map();
      root.traverse(o => { if (!o.isMesh) return; const g = clean(o.geometry); g.applyMatrix4(o.matrixWorld); const m = o.material;
        if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g); });
      const parts = []; const box = new THREE.Box3();
      for (const [mat, list] of byMat) { const geo = mergeGeometries(list, false); if (!geo) continue; geo.computeBoundingBox(); box.union(geo.boundingBox); parts.push({ geometry: geo, material: mat }); }
      const sp = PROP_SPEC[name] || { h: 1 }; const size = box.getSize(new THREE.Vector3());
      const s = sp.w ? sp.w / Math.max(size.x, size.z) : sp.h / size.y;
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      const turn = sp.len && size.x > size.z; // long axis -> +Z
      for (const p of parts) {
        p.geometry.translate(-cx, -box.min.y, -cz); p.geometry.scale(s, s, s); if (turn) p.geometry.rotateY(Math.PI / 2);
        p.geometry.computeBoundingSphere();
        const m = p.material; if (m.isMeshStandardMaterial) { m.envMapIntensity = 1.0; if (m.transparent && name !== 'oak' && name !== 'olive') { m.transparent = false; m.alphaTest = 0.5; } }
        if (name === 'oak' || name === 'olive' || name === 'pot' || name === 'planter') { m.alphaTest = Math.max(m.alphaTest || 0, 0.4); m.transparent = false; m.side = THREE.DoubleSide; }
      }
      const fs = size.clone().multiplyScalar(s); if (turn) [fs.x, fs.z] = [fs.z, fs.x];
      propModels[name] = { parts, size: fs };
    } catch (e) { console.warn('prop failed', name, e); }
  }));
  return propModels;
}

// Build one InstancedMesh per material part for every prop that has placements in this chunk.
const _T = new THREE.Matrix4();
export function instanceProps(group, lists, castFor) {
  const made = [];
  for (const [name, mats] of Object.entries(lists)) {
    const M = propModels[name]; if (!M || !mats.length) continue;
    for (const p of M.parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = castFor(name); im.receiveShadow = true; im.computeBoundingSphere(); im.userData.prop = name; im.userData.all = im.instanceMatrix.array.slice(); im.userData.n = mats.length; group.add(im); made.push(im);
    }
  }
  return made;
}

// Per-instance distance culling: only props within R metres of the camera are drawn (cheap CPU pass,
// run when the focus moves a few metres). Keeps a mid-range phone's vertex load bounded.
export function cullProps(meshes, x, z, R) {
  const R2 = R * R;
  for (const im of meshes) {
    const all = im.userData.all, n = im.userData.n, dst = im.instanceMatrix.array; let k = 0;
    for (let i = 0; i < n; i++) { const o = i * 16, dx = all[o + 12] - x, dz = all[o + 14] - z;
      if (dx * dx + dz * dz < R2) { if (k !== i) for (let j = 0; j < 16; j++) dst[k * 16 + j] = all[o + j]; k++; } }
    if (k !== im.count || k) { im.count = k; im.instanceMatrix.needsUpdate = true; }
    im.visible = k > 0;
  }
}
