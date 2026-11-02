
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const BASE = (import.meta.env.BASE_URL || './') + 'assets/';
const manager = new THREE.LoadingManager();
export const progress = { loaded:0, total:0, onChange:null };
manager.onProgress = (url, l, t) => { progress.loaded = l; progress.total = t; progress.onChange && progress.onChange(l, t, url); };

const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
const hdrLoader = new HDRLoader(manager);
const texCache = new Map();
let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }

export function loadTex(url, srgb = false, repeat = null) {
  const key = url + (srgb ? '#s' : '');
  let t = texCache.get(key);
  if (!t) {
    t = texLoader.load(BASE + url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    texCache.set(key, t);
  }
  if (repeat) { const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; }
  return t;
}

// Poly Haven style PBR set: diff (sRGB), nor (GL), arm (AO/rough/metal)
const HI4K = new Set(['clean_asphalt', 'interlocking_concrete_pavers']); // Ultra: 4K colour + normal on the road and pavement (the surfaces you see most)
export function pbr(id, res0, opts = {}) {
  const rep = opts.repeat || 1; const res = Math.min(res0, 2048); const hres = res0 > 2048 && HI4K.has(id) ? 4096 : res;
  const m = new (opts.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
    map: loadTex(`tex/${id}/diff_${hres}.jpg`, true, rep),
    normalMap: loadTex(`tex/${id}/nor_${hres}.jpg`, false, rep),
    roughnessMap: loadTex(`tex/${id}/arm_${res}.jpg`, false, rep),
    aoMap: opts.ao === false ? null : loadTex(`tex/${id}/arm_${res}.jpg`, false, rep),
    metalness: 0, roughness: opts.roughness ?? 1,
    color: opts.color ?? 0xffffff,
  });
  m.normalScale.set(opts.normal ?? 1, opts.normal ?? 1);
  if (opts.aoIntensity != null) m.aoMapIntensity = opts.aoIntensity;
  return m;
}

export function loadGLTF(url) {
  return new Promise((res, rej) => gltfLoader.load(BASE + url, res, undefined, rej));
}
export function loadHDR(url) {
  return new Promise((res, rej) => hdrLoader.load(BASE + url, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; res(t); }, undefined, rej));
}
