
import * as THREE from 'three';
// World-space retarget of UAL (UE-mannequin bone names) clips onto a Mixamo-named rig (Grab3D humans).
// Rest-pose differences (T vs A pose) are handled with per-bone direction alignment.
const SIDE = (s, S) => [[`clavicle_${s}`, `${S}Shoulder`], [`upperarm_${s}`, `${S}Arm`], [`lowerarm_${s}`, `${S}ForeArm`], [`hand_${s}`, `${S}Hand`],
  [`thigh_${s}`, `${S}UpLeg`], [`calf_${s}`, `${S}Leg`], [`foot_${s}`, `${S}Foot`], [`ball_${s}`, `${S}ToeBase`],
  ...['index', 'middle', 'ring', 'pinky', 'thumb'].flatMap(f => [1, 2, 3].map(k => [`${f}_0${k}_${s}`, `${S}Hand${f[0].toUpperCase() + f.slice(1)}${k}`]))];
export const UAL_TO_MIXAMO = [['pelvis', 'Hips'], ['spine_01', 'Spine02'], ['spine_02', 'Spine01'], ['spine_03', 'Spine'], ['neck_01', 'neck'], ['Head', 'Head'], ...SIDE('l', 'Left'), ...SIDE('r', 'Right')];
const CHILD = { Hips: 'Spine02', Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head' };
for (const S of ['Left', 'Right']) {
  Object.assign(CHILD, { [`${S}Shoulder`]: `${S}Arm`, [`${S}Arm`]: `${S}ForeArm`, [`${S}ForeArm`]: `${S}Hand`, [`${S}Hand`]: `${S}HandMiddle1`, [`${S}UpLeg`]: `${S}Leg`, [`${S}Leg`]: `${S}Foot`, [`${S}Foot`]: `${S}ToeBase` });
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) { CHILD[`${S}Hand${f}1`] = `${S}Hand${f}2`; CHILD[`${S}Hand${f}2`] = `${S}Hand${f}3`; }
}
function bonesByName(root) { const m = {}; root.traverse(o => { if (o.isBone) m[o.name] = o; }); return m; }
export function makeRetargeter(srcRoot, tgtRoot) {
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const sb = bonesByName(srcRoot), tb = bonesByName(tgtRoot);
  const pairs = UAL_TO_MIXAMO.filter(([s, t]) => sb[s] && tb[t]).map(([s, t]) => ({ s: sb[s], t: tb[t] }));
  const s2t = new Map(pairs.map(p => [p.s.name, p.t.name])), t2s = new Map(pairs.map(p => [p.t.name, p.s]));
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion()), wp = (o) => o.getWorldPosition(new THREE.Vector3());
  // rest data
  for (const p of pairs) {
    p.sRest = wq(p.s); p.tRest = wq(p.t);
    const tc = CHILD[p.t.name] && tb[CHILD[p.t.name]], sc = tc && t2s.get(tc.name);
    p.off = new THREE.Quaternion();
    if (tc && sc) { const dt = wp(tc).sub(wp(p.t)).normalize(), ds = wp(sc).sub(wp(p.s)).normalize(); p.off.setFromUnitVectors(dt, ds); }
  }
  // order target bones parents-first
  const order = []; tgtRoot.traverse(o => { if (o.isBone) { const p = pairs.find(q => q.t === o); if (p) order.push(p); } });
  const hip = pairs.find(p => p.t.name === 'Hips');
  const sHip0 = wp(hip.s), tHip0 = wp(hip.t); const hScale = tHip0.y / Math.max(0.01, sHip0.y);
  const restLocal = new Map(); tgtRoot.traverse(o => { if (o.isBone) restLocal.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
  const srcRestLocal = new Map(); srcRoot.traverse(o => { if (o.isBone) srcRestLocal.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
  return function retarget(clip, fps = 30, inPlace = true) {
    const mixer = new THREE.AnimationMixer(srcRoot); const act = mixer.clipAction(clip); act.play();
    const n = Math.max(2, Math.ceil(clip.duration * fps) + 1); const times = new Float32Array(n);
    const qv = new Map(order.map(p => [p, new Float32Array(n * 4)])); const hipPos = new Float32Array(n * 3);
    const tmpQ = new THREE.Quaternion(), pw = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / fps); times[i] = t; mixer.setTime(t); srcRoot.updateMatrixWorld(true);
      for (const p of order) {
        // delta of source bone from its rest (world), applied to the aligned target rest
        const d = wq(p.s).multiply(tmpQ.copy(p.sRest).invert());
        const tw = d.multiply(p.off.clone()).multiply(p.tRest);
        p.t.parent.updateWorldMatrix(true, false); p.t.parent.getWorldQuaternion(pw);
        p.t.quaternion.copy(pw.invert().multiply(tw)); p.t.updateMatrixWorld(true);
        qv.get(p).set(p.t.quaternion.toArray(), i * 4);
      }
      const sp = wp(hip.s); const dy = (sp.y - sHip0.y) * hScale, dx = inPlace ? 0 : (sp.x - sHip0.x) * hScale, dz = inPlace ? 0 : (sp.z - sHip0.z) * hScale;
      const want = tHip0.clone().add(new THREE.Vector3(dx, dy, dz)); hip.t.parent.updateWorldMatrix(true, false);
      const loc = want.applyMatrix4(m4.copy(hip.t.parent.matrixWorld).invert()); hipPos.set(loc.toArray(), i * 3);
    }
    act.stop(); mixer.uncacheRoot(srcRoot);
    // restore rest poses
    for (const [o, r] of restLocal) { o.quaternion.copy(r.q); o.position.copy(r.p); }
    for (const [o, r] of srcRestLocal) { o.quaternion.copy(r.q); o.position.copy(r.p); }
    const tracks = order.map(p => new THREE.QuaternionKeyframeTrack(p.t.name + '.quaternion', times, qv.get(p)));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipPos));
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  };
}
