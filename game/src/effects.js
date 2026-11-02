
import * as THREE from 'three';
// Rain streaks around the camera (GPU-animated), plus the player car's headlights at night.
export class Rain {
  constructor(scene, count) {
    const n = Math.max(500, count | 0); const pos = new Float32Array(n * 2 * 3); const seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); seed[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(1.5, 0.6) } },
      vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; varying float vA;
        void main(){ vec3 p = position; float fall = 22.0; float y = mod(p.y - uTime * fall, 30.0);
          vec3 w = vec3(mod(p.x - uCam.x + uWind.x * uTime + 30.0, 60.0) - 30.0, y - 6.0, mod(p.z - uCam.z + uWind.y * uTime + 30.0, 60.0) - 30.0) + vec3(uCam.x, uCam.y, uCam.z);
          w += aEnd * vec3(uWind.x * 0.03, 0.75, uWind.y * 0.03);
          vA = aEnd; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform float uAmt; varying float vA; void main(){ gl_FragColor = vec4(0.75, 0.8, 0.88, (0.06 + 0.22 * vA) * uAmt); }`,
      transparent: true, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; scene.add(this.lines);
  }
  update(dt, cam, rain) { this.mat.uniforms.uTime.value += dt; this.mat.uniforms.uCam.value.copy(cam.position); this.mat.uniforms.uAmt.value = rain; this.lines.visible = rain > 0.02; }
}
export class Headlights {
  constructor(scene, Q) {
    this.on = Q.id !== 'low'; if (!this.on) return;
    this.l = [0, 1].map(() => { const s = new THREE.SpotLight(0xfff1d8, 0, 60, 0.5, 0.45, 1.3); s.castShadow = false; scene.add(s); scene.add(s.target); return s; });
  }
  update(v, night) {
    if (!this.on) return; const k = v ? THREE.MathUtils.smoothstep(night, 0.25, 0.6) : 0;
    this.l.forEach((s, i) => { s.intensity = k * 160; if (!v) return; const f = v.forward, side = i ? 0.6 : -0.6; const r = { x: f.z, z: -f.x };
      s.position.set(v.pos.x + f.x * (v.length / 2) + r.x * side, 0.8, v.pos.z + f.z * (v.length / 2) + r.z * side);
      s.target.position.set(v.pos.x + f.x * 25 + r.x * side, 0, v.pos.z + f.z * 25 + r.z * side); s.target.updateMatrixWorld(); });
  }
}
