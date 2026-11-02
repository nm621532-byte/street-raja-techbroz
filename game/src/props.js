
import * as THREE from 'three';
// Night lighting for the streamed street lamps: glow sprites, light pools on the road, and a few real
// point lights that follow the camera. Rebuilt whenever world chunks load/unload.
export class Props {
  constructor(scene, city, Q) { this.scene = scene; this.city = city; this.Q = Q; this.dirty = true; this.lampPos = []; }
  async build(radialTex) {
    this.glowMat = new THREE.PointsMaterial({ map: radialTex, color: 0xffd9a0, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.glow = new THREE.Points(new THREE.BufferGeometry(), this.glowMat); this.glow.frustumCulled = false; this.scene.add(this.glow);
    this.poolGeo = new THREE.PlaneGeometry(16, 16); this.poolGeo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: radialTex, color: 0xffb870, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    this.lights = []; for (let i = 0; i < (this.Q.lampLights || 0); i++) { const l = new THREE.PointLight(0xffc98a, 0, 28, 1.6); this.scene.add(l); this.lights.push(l); }
    const prevL = this.city.onLoad, prevU = this.city.onUnload;
    this.city.onLoad = (ch) => { prevL && prevL(ch); this.dirty = true; }; this.city.onUnload = (ch) => { prevU && prevU(ch); this.dirty = true; };
  }
  rebuild() {
    this.dirty = false; const L = []; for (const ch of this.city.chunks.values()) for (const l of ch.lamps) L.push(l); this.lampPos = L;
    const gp = new Float32Array(L.length * 3); L.forEach((p, i) => { gp[i * 3] = p.hx; gp[i * 3 + 1] = p.hy; gp[i * 3 + 2] = p.hz; });
    this.glow.geometry.dispose(); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); this.glow.geometry = gg;
    if (this.pools) { this.scene.remove(this.pools); this.pools.dispose(); }
    const pools = new THREE.InstancedMesh(this.poolGeo, this.poolMat, Math.max(1, L.length)); const M = new THREE.Matrix4();
    L.forEach((p, i) => { M.makeTranslation(p.hx, 0.05, p.hz); pools.setMatrixAt(i, M); }); pools.count = L.length; pools.frustumCulled = false; this.scene.add(pools); this.pools = pools; this._sorted = false;
  }
  update(env, camPos) {
    if (this.dirty) this.rebuild();
    const n = env.night; const on = THREE.MathUtils.smoothstep(n, 0.2, 0.6);
    this.glowMat.opacity = on * 0.9; this.poolMat.opacity = on * 0.55 * (1 + env.rain * 0.6);
    const lm = this.city.lampMat; if (lm) lm.emissiveIntensity = on * 4;
    if (!this.lights.length) return;
    this.tick = (this.tick || 0) + 1; if (this.tick % 15 && this._sorted) { for (const l of this.lights) l.intensity = on * 60; return; }
    this._sorted = true;
    const near = this.lampPos.map(p => [p, (p.hx - camPos.x) ** 2 + (p.hz - camPos.z) ** 2]).sort((a, b) => a[1] - b[1]);
    this.lights.forEach((l, i) => { const p = near[i]?.[0]; if (p) l.position.set(p.hx, p.hy - 0.4, p.hz); l.intensity = p ? on * 60 : 0; });
  }
}
