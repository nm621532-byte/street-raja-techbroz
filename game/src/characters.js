
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF, BASE } from './assets.js';

const lib = { base: {}, hair: {}, clips: {}, mask: {} };
export const SHIRTS = [0xf4f4f0, 0x1e4fa8, 0xb3261e, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x263238, 0xff7043, 0x00838f, 0xd7ccc8, 0x8d6e63, 0xec407a];
export const PANTS = [0x1a2433, 0x2b2b2b, 0x3e4a5a, 0x5d4037, 0xc8b89a, 0x37474f, 0x1b3a6b];
const SKIN = [1.0, 0.92, 0.82, 0.72, 0.62];

export async function loadPeople() {
  const tl = new THREE.TextureLoader();
  const ld = (u) => new Promise(r => tl.load(BASE + u, t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; r(t); }));
  const [m, f, a, h1, h2, h3, h4, h5, h6, mm, fm] = await Promise.all([
    loadGLTF('models/Superhero_Male_FullBody.glb'), loadGLTF('models/Superhero_Female_FullBody.glb'), loadGLTF('models/anims.glb'),
    loadGLTF('models/Hair_SimpleParted.glb'), loadGLTF('models/Hair_Buzzed.glb'), loadGLTF('models/Hair_Long.glb'), loadGLTF('models/Hair_Buns.glb'), loadGLTF('models/Hair_Beard.glb'), loadGLTF('models/Hair_BuzzedFemale.glb'),
    ld('models/Superhero_Male_FullBody_mask.png'), ld('models/Superhero_Female_FullBody_mask.png')]);
  lib.base.male = m.scene; lib.base.female = f.scene;
  lib.hair = { parted: h1.scene, buzz: h2.scene, long: h3.scene, buns: h4.scene, beard: h5.scene, pixie: h6.scene };
  lib.mask = { male: mm, female: fm };
  for (const c of a.animations) {
    c.tracks = c.tracks.filter(t => !/^root\.(position|quaternion)/.test(t.name));
    lib.clips[c.name] = c;
  }
}

// Skin tones (multipliers on the base albedo, warm-tinted)
export const SKIN_TONES = [[1.34, 1.2, 1.08], [1.2, 1.06, 0.94], [1.08, 0.94, 0.82], [1.0, 0.86, 0.74], [0.9, 0.76, 0.64], [0.78, 0.64, 0.54], [0.66, 0.54, 0.46], [0.54, 0.44, 0.38]];
const TOP_STYLE = { tshirt: 0, shirt: 1, kurta: 2, jacket: 3, vest: 4 };
const BOTTOM_STYLE = { jeans: 0, trousers: 1, shorts: 2, pajama: 3 };
const PATTERN = { plain: 0, stripes: 1, checks: 2 };
function clothedMaterial(orig, mask, o) {
  const m = orig.clone();
  m.roughness = 0.8; m.envMapIntensity = 0.7;
  const sk = Array.isArray(o.skin) ? o.skin : [o.skin, o.skin, o.skin];
  const u = { uMask: { value: mask }, uShirt: { value: new THREE.Color(o.shirt) }, uShirt2: { value: new THREE.Color(o.shirt2 ?? 0xffffff) }, uPants: { value: new THREE.Color(o.pants) }, uShoes: { value: new THREE.Color(o.shoes) },
    uLong: { value: o.longSleeve ? 1 : 0 }, uSkin: { value: new THREE.Vector3(...sk) }, uTop: { value: TOP_STYLE[o.top] ?? (o.longSleeve ? 1 : 0) }, uBottom: { value: BOTTOM_STYLE[o.bottom] ?? 0 }, uPat: { value: PATTERN[o.pattern] ?? 0 }, uFemale: { value: o.female ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBind = position;');
    sh.fragmentShader = 'uniform sampler2D uMask; uniform vec3 uShirt, uShirt2, uPants, uShoes, uSkin; uniform float uLong, uTop, uBottom, uPat, uFemale; varying vec3 vBind;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
      // clothing regions from the bind-pose position (T-pose, metres): crisp edges at any resolution
      vec3 b = vBind; float ax = abs(b.x);
      float armX = mix(0.205, 0.158, uFemale), wristX = mix(0.655, 0.592, uFemale), shortX = mix(0.37, 0.33, uFemale), shY = mix(1.30, 1.27, uFemale);
      float neckY = mix(1.505, 1.462, uFemale) + 2.0 * b.x * b.x - step(0.0, b.z) * (0.012 + 0.02 * step(2.5, uTop) * step(uTop, 3.5));
      float onArm = step(armX, ax) * step(shY, b.y);
      float torso = (1.0 - onArm) * step(mix(0.93, 0.91, uFemale), b.y) * (1.0 - step(neckY, b.y));
      float longS = step(0.5, uTop) * (1.0 - step(3.5, uTop));           // shirt, kurta, jacket = long sleeves
      float sleeve = onArm * (1.0 - step(mix(shortX, wristX, longS), ax));
      if (uTop > 3.5) { sleeve = 0.0; torso *= 1.0 - step(mix(0.115, 0.1, uFemale), ax) * step(mix(1.36, 1.33, uFemale), b.y) * step(0.0, 1.0); torso *= 1.0 - step(0.05, b.z) * step(mix(1.40, 1.36, uFemale), b.y); }
      float sh = max(torso, sleeve);
      float legs = (1.0 - onArm) * step(0.105, b.y) * (1.0 - step(mix(0.95, 0.93, uFemale), b.y));
      float feet = 1.0 - step(0.105, b.y);
      float kurta = step(1.5, uTop) * (1.0 - step(2.5, uTop)) * legs * step(0.6, b.y);   // kurta hangs over the thighs
      float bare = step(1.5, uBottom) * (1.0 - step(2.5, uBottom)) * legs * (1.0 - step(0.5, b.y)); // shorts: bare shins
      vec4 mk = vec4(sh, legs, feet, 0.0);
      float fab = 0.93 + 0.07 * fract(sin(dot(floor(vMapUv * 1024.0), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= uSkin;
      vec3 clothShade = vec3(0.55 + 0.45 * smoothstep(0.0, 0.6, dot(texture2D(map, vMapUv).rgb, vec3(0.33))));
      vec3 topC = uShirt;
      float pat = 0.0;
      if (uPat > 0.5 && uPat < 1.5) pat = step(0.5, fract(vBind.y * 22.0));
      if (uPat > 1.5) pat = abs(step(0.5, fract(vBind.y * 16.0)) - step(0.5, fract((vBind.x + vBind.z) * 16.0)));
      topC = mix(topC, uShirt2, pat * 0.85);
      // jacket: open front shows the inner shirt; shirt: a button placket
      float front = step(0.0, vBind.z) * step(0.93, vBind.y) * (1.0 - step(neckY, vBind.y)) * (1.0 - onArm);
      if (uTop > 2.5 && uTop < 3.5) topC = mix(topC, uShirt2, front * (1.0 - step(0.055, abs(vBind.x))));
      if (uTop > 0.5 && uTop < 1.5) topC = mix(topC, topC * 0.55, front * (1.0 - step(0.006, abs(vBind.x))));
      diffuseColor.rgb = mix(diffuseColor.rgb, topC * clothShade * fab, max(sh, kurta));
      vec3 pantsC = uPants * clothShade * fab;
      if (uBottom > 0.5 && uBottom < 1.5) pantsC *= 1.0 - 0.25 * step(0.996, fract(vBind.x * 2.0 + 0.5)); // trouser crease
      diffuseColor.rgb = mix(diffuseColor.rgb, pantsC, legs * (1.0 - kurta) * (1.0 - bare));
      diffuseColor.rgb = mix(diffuseColor.rgb, uShoes * clothShade * (b.y < 0.02 ? 0.5 : 1.0), mk.b);
      float clothMask = max(max(sh, kurta), max(legs * (1.0 - bare), mk.b));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.92, clothMask);');
  };
  m.customProgramCacheKey = () => 'clothed2';
  m.userData.u = u;
  return m;
}
// ---- procedural accessories, modelled in bind-pose model space (metres, y up, face +z) ----
const accGeo = {};
function accGeometry(kind, female) {
  const key = kind + (female ? 'F' : 'M'); if (accGeo[key]) return accGeo[key];
  let g;
  if (kind === 'cap') {
    const dome = new THREE.SphereGeometry(0.108, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(0.98, 0.86, 1.1); dome.translate(0, 1.722, -0.006);
    const brim = new THREE.CylinderGeometry(0.095, 0.095, 0.007, 20, 1, false, -Math.PI / 2, Math.PI); brim.scale(0.95, 1, 0.9); brim.translate(0, 1.728, 0.07);
    const btn = new THREE.SphereGeometry(0.01, 8, 6); btn.translate(0, 1.814, -0.006);
    g = mergeGeos([dome, brim, btn]);
  } else if (kind === 'turban') {
    const parts = []; for (let i = 0; i < 4; i++) { const t = new THREE.TorusGeometry(0.092 - i * 0.014, 0.03, 8, 24); t.rotateX(Math.PI / 2); t.rotateZ((i % 2 ? 1 : -1) * 0.1); t.translate(0, 1.735 + i * 0.026, -0.008); parts.push(t); }
    const top = new THREE.SphereGeometry(0.07, 14, 8); top.scale(1, 0.6, 1.05); top.translate(0, 1.815, -0.01); parts.push(top);
    g = mergeGeos(parts);
  } else if (kind === 'topi') {
    const t = new THREE.CylinderGeometry(0.105, 0.112, 0.07, 20, 1, true); t.scale(0.62, 1, 1.08); t.translate(0, 1.79, -0.01);
    const lid = new THREE.SphereGeometry(0.1, 16, 4, 0, Math.PI * 2, 0, 0.5); lid.scale(0.6, 0.4, 1.06); lid.translate(0, 1.79, -0.01);
    g = mergeGeos([t, lid]);
  } else if (kind === 'specs' || kind === 'shades') {
    const parts = []; const r = kind === 'shades' ? 0.026 : 0.022;
    for (const s of [-1, 1]) { const ring = new THREE.TorusGeometry(r, 0.0035, 6, 20); ring.translate(s * 0.034, 1.703, 0.106); parts.push(ring);
      const arm = new THREE.BoxGeometry(0.004, 0.004, 0.11); arm.translate(s * 0.074, 1.708, 0.052); parts.push(arm); }
    const bridge = new THREE.BoxGeometry(0.022, 0.004, 0.004); bridge.translate(0, 1.708, 0.108); parts.push(bridge);
    g = mergeGeos(parts);
  } else if (kind === 'lens') {
    const parts = []; for (const s of [-1, 1]) { const c = new THREE.CircleGeometry(0.025, 18); c.translate(s * 0.034, 1.703, 0.107); parts.push(c); }
    g = mergeGeos(parts);
  } else if (kind === 'watch') {
    const band = new THREE.TorusGeometry(0.036, 0.007, 6, 20); band.rotateY(Math.PI / 2); band.scale(1, 1, 1.25); band.translate(0.655, 1.455, -0.068);
    const face = new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16); face.translate(0.655, 1.493, -0.068);
    g = mergeGeos([band, face]);
  } else if (kind === 'moustache') {
    const parts = []; for (const s of [-1, 1]) { const c = new THREE.CapsuleGeometry(0.0055, 0.022, 4, 8); c.rotateZ(Math.PI / 2 + s * 0.3); c.translate(s * 0.014, 1.637, 0.104); parts.push(c); }
    g = mergeGeos(parts);
  } else if (kind === 'stubble') {
    const s = new THREE.SphereGeometry(0.097, 20, 12, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.52, Math.PI * 0.3); s.scale(0.93, 1.05, 1.06); s.translate(0, 1.665, 0.0); g = s;
  } else if (kind === 'ponytail') {
    const c = new THREE.CapsuleGeometry(0.03, 0.16, 4, 10); c.rotateX(0.35); c.translate(0, 1.62, -0.13);
    const k = new THREE.SphereGeometry(0.04, 10, 8); k.translate(0, 1.72, -0.11); g = mergeGeos([c, k]);
  }
  if (female) { if (kind === 'watch') g.translate(-0.062, -0.037, 0.014); else { g.translate(0, -1.69, 0.0); g.scale(0.95, 0.96, 0.97); g.translate(0, 1.69 - 0.045, 0.004); } }
  accGeo[key] = g; return g;
}
function mergeGeos(list) {
  const p = [], n = [], idx = []; let base = 0;
  for (let g of list) { if (g.index === null) g = g; const pa = g.attributes.position, na = g.attributes.normal; for (let i = 0; i < pa.count; i++) { p.push(pa.getX(i), pa.getY(i), pa.getZ(i)); n.push(na.getX(i), na.getY(i), na.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base); else for (let i = 0; i < pa.count; i++) idx.push(i + base); base += pa.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); out.setIndex(idx); return out;
}
const PERSON_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.25);
const HAIR_COLORS = [0x15100c, 0x1c140e, 0x2a1c12, 0x0d0b0a];
// attach a rigid accessory (built in bind-pose model space) to a bone
function attachRigid(root, skinned, boneName, geo, mat) {
  const sk = skinned.skeleton; const i = sk.bones.findIndex(b => b.name === boneName); if (i < 0) return null;
  const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(sk.boneInverses[i]); // bind model space -> bone local
  mesh.castShadow = true; mesh.frustumCulled = false; sk.bones[i].add(mesh); return mesh;
}

export function makePerson(o = {}) {
  if (o.real && lib.real && lib.real[o.real]) return makeRealPerson(o);
  const female = !!o.female; const gender = female ? 'female' : 'male';
  const root = SkeletonUtils.clone(lib.base[gender]);
  const skinIdx = o.skinIdx ?? Math.floor(Math.random() * SKIN.length);
  const skin = o.skinTone != null ? SKIN_TONES[o.skinTone] || SKIN_TONES[3] : SKIN[skinIdx];
  const opts = { shirt: o.shirt ?? SHIRTS[Math.floor(Math.random() * SHIRTS.length)], shirt2: o.shirt2 ?? 0xffffff, pants: o.pants ?? PANTS[Math.floor(Math.random() * PANTS.length)], shoes: o.shoes ?? (Math.random() < 0.5 ? 0x111111 : 0x5d4037), longSleeve: o.longSleeve ?? Math.random() < 0.4, skin, top: o.top, bottom: o.bottom, pattern: o.pattern, female };
  let skinned = null; const bones = {};
  const eyeTint = o.eyeColor != null ? new THREE.Color(o.eyeColor) : null;
  root.traverse(n => {
    if (n.isBone) bones[n.name] = n;
    if (n.isMesh) {
      n.castShadow = true; n.receiveShadow = false; n.frustumCulled = true; if (n.isSkinnedMesh) n.boundingSphere = PERSON_SPHERE.clone();
      if (/Superhero/.test(n.material.name)) { n.material = clothedMaterial(n.material, lib.mask[gender], opts); skinned = n; }
      else if (o.npc && /Eye|Hair_1|Hair_2/.test(n.material.name)) n.visible = false;
      else if (/Eye/.test(n.material.name) && eyeTint) { n.material = n.material.clone(); n.material.color.copy(eyeTint); }
      else if (n.name === 'Eyebrows' && o.brows != null) { n.material = n.material.clone(); n.material.color.set(o.hairColor ?? 0x1c140e); n.scale.y = [1, 1.35, 0.8, 1.6][o.brows] || 1; n.visible = o.brows !== 4; }
    }
  });
  // hair (skinned to head bone of its own skeleton → rebind to ours)
  const hairColor = o.hairColor ?? HAIR_COLORS[Math.floor(Math.random() * 4)];
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.55 });
  const hk = o.hair ?? (female ? (Math.random() < 0.6 ? 'long' : 'buns') : (Math.random() < 0.6 ? 'parted' : 'buzz'));
  const addHair = (key, opacity = 1) => {
    if (!lib.hair[key]) return;
    const h = SkeletonUtils.clone(lib.hair[key]);
    h.traverse(n => {
      if (n.isSkinnedMesh) {
        const sk = new THREE.Skeleton(n.skeleton.bones.map(b => bones[b.name] || b), n.skeleton.boneInverses);
        const hm = new THREE.SkinnedMesh(n.geometry, n.material.clone()); hm.material.color.set(hairColor); hm.material.roughness = 0.55; if (opacity < 1) { hm.material.transparent = true; hm.material.opacity = opacity; hm.material.depthWrite = false; hm.material.normalScale && hm.material.normalScale.set(0.3, 0.3); hm.scale.setScalar(1); }
        hm.bind(sk, n.bindMatrix); hm.castShadow = true; hm.frustumCulled = true; hm.boundingSphere = PERSON_SPHERE.clone(); root.add(hm);
      }
    });
  };
  const hat = o.cap && o.cap !== 'none';
  if (hk === 'ponytail') { addHair('pixie'); } else if (hk !== 'bald') addHair(hat && (hk === 'parted' || hk === 'pixie') ? (female ? 'pixie' : 'buzz') : hk);
  const beard = o.beardStyle ?? ((!female && (o.beard ?? Math.random() < 0.35)) ? 'full' : 'none');
  if (beard === 'full' || beard === 'fullm') addHair('beard'); else if (beard === 'stubble') addHair('beard', 0.45);
  const acc = [];
  if (skinned) {
    const A = (bone, kind, mat) => { const m = attachRigid(root, skinned, bone, accGeometry(kind, female), mat); if (m) acc.push(m); return m; };
    if (hk === 'ponytail') A('Head', 'ponytail', hairMat);
    if (beard === 'moustache' || beard === 'fullm') A('Head', 'moustache', hairMat);
    if (o.cap && o.cap !== 'none') A('Head', o.cap, new THREE.MeshStandardMaterial({ color: o.capColor ?? 0xb3261e, roughness: o.cap === 'turban' ? 0.95 : 0.7 }));
    if (o.glasses && o.glasses !== 'none') { A('Head', o.glasses === 'shades' ? 'shades' : 'specs', new THREE.MeshStandardMaterial({ color: o.glasses === 'gold' ? 0xc9a227 : 0x111111, metalness: 0.6, roughness: 0.3 }));
      if (o.glasses === 'shades') A('Head', 'lens', new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.2, roughness: 0.05, side: THREE.DoubleSide })); }
    if (o.watch) A('hand_l', 'watch', new THREE.MeshStandardMaterial({ color: o.watch === 'gold' ? 0xc9a227 : 0x222222, metalness: 0.8, roughness: 0.3 }));
  }
  // body build + height
  const bw = [0.92, 1, 1.1, 1.18][o.build ?? 1] ?? 1, hh = o.height ?? 1;
  root.scale.set(bw * hh, hh, (0.5 + bw * 0.5) * hh);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [k, c] of Object.entries(lib.clips)) actions[k] = mixer.clipAction(c);
  const p = { root, mixer, actions, cur: null, skinned, opts, female, acc };
  p.play = (name, fade = 0.2, once = false, speed = 1) => {
    const a = actions[name]; if (!a || p.cur === a) { if (a) a.timeScale = speed; return a; }
    a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.enabled = true;
    if (p.cur) a.crossFadeFrom(p.cur, fade, false); a.play(); p.cur = a; return a;
  };
  p.dispose = () => { root.traverse(n => { if (n.isMesh && n.material && n.material.dispose) n.material.dispose(); }); mixer.stopAllAction(); root.removeFromParent(); };
  p.play('Idle_Loop', 0);
  return p;
}

// ---------- Realistic clothed humans (Grab3D CC0 rigged models) driven by the UAL clips via retargeting ----------
import { makeRetargeter } from './retarget.js';
export const REAL_KINDS = ['man', 'woman', 'businessman', 'farmer'];
const REAL_FEMALE = { woman: true };
lib.real = {};
export async function loadRealPeople(Q) {
  const hiTex = Q && (Q.id === 'high' || Q.id === 'ultra');
  await Promise.all(REAL_KINDS.map(async (k) => {
    try {
      const [hero, lo] = await Promise.all([loadGLTF(`models/people/${k}.glb`), loadGLTF(`models/people/${k}_lo.glb`)]);
      for (const g of [hero, lo]) g.scene.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; n.frustumCulled = true; if (n.isSkinnedMesh) n.boundingSphere = PERSON_SPHERE.clone();
        if (n.material) { n.material.side = THREE.FrontSide; n.material.envMapIntensity = 0.9; if (n.material.metalness != null) n.material.metalness = Math.min(n.material.metalness, 0.1); } } });
      const rt = makeRetargeter(lib.base[REAL_FEMALE[k] ? 'female' : 'male'], hero.scene);
      const clips = {};
      for (const [name, c] of Object.entries(lib.clips)) { if (name === 'A_TPose') continue; clips[name] = rt(c, 30, true); }
      lib.real[k] = { hero: hero.scene, lo: lo.scene, clips };
    } catch (e) { console.warn('real person failed', k, e); }
  }));
}
export function hasReal(k) { return !!(lib.real && lib.real[k]); }
function makeRealPerson(o) {
  const R = lib.real[o.real]; const root = SkeletonUtils.clone(o.npc ? R.lo : R.hero);
  let skinned = null; root.traverse(n => { if (n.isSkinnedMesh && !skinned) skinned = n; });
  const hh = o.height ?? 1, bw = [0.94, 1, 1.06, 1.12][o.build ?? 1] ?? 1;
  root.scale.multiplyScalar(1); const wrap = new THREE.Group(); wrap.add(root); wrap.scale.set(bw * hh, hh, (0.5 + bw * 0.5) * hh);
  if (o.tint) root.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiply(new THREE.Color(o.tint)); } });
  const mixer = new THREE.AnimationMixer(root); const actions = {};
  for (const [k, c] of Object.entries(R.clips)) actions[k] = mixer.clipAction(c);
  const p = { root: wrap, mixer, actions, cur: null, skinned, opts: o, female: !!REAL_FEMALE[o.real], acc: [], real: o.real };
  p.play = (name, fade = 0.2, once = false, speed = 1) => {
    const a = actions[name]; if (!a || p.cur === a) { if (a) a.timeScale = speed; return a; }
    a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.enabled = true;
    if (p.cur) a.crossFadeFrom(p.cur, fade, false); a.play(); p.cur = a; return a;
  };
  p.dispose = () => { root.traverse(n => { if (n.isMesh && o.tint && n.material && n.material.dispose) n.material.dispose(); }); mixer.stopAllAction(); wrap.removeFromParent(); };
  p.play('Idle_Loop', 0);
  return p;
}
