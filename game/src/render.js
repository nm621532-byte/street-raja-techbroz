
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { loadHDR } from './assets.js';

// ---------- Sky: blends three CC0 HDR skies (day / sunset / night) + sun disc ----------
const skyVert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,0.0)).xyz); vec4 p = projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
uniform sampler2D tDay, tSet, tNight; uniform vec3 wts; uniform vec3 sunDir; uniform vec3 sunCol; uniform float rot; uniform float exposureSky;
uniform vec3 fogCol; uniform float haze; uniform float overcast;
varying vec3 vDir;
vec2 eq(vec3 d){ float a = atan(d.z, d.x)+rot; return vec2(a/6.2831853+0.5, asin(clamp(d.y,-1.,1.))/3.14159265+0.5); }
void main(){
  vec3 d = normalize(vDir); vec3 dd = vec3(d.x, max(d.y,0.0)*0.98+0.02, d.z);
  vec2 uv = eq(normalize(dd));
  vec3 c = texture2D(tDay,uv).rgb*wts.x + texture2D(tSet,uv).rgb*wts.y + texture2D(tNight,uv).rgb*wts.z;
  float g = dot(c, vec3(0.299,0.587,0.114)); c = mix(c, vec3(g)*vec3(0.85,0.9,1.0), overcast*0.85);
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 1800.0)*60.0 + pow(s, 12.0)*0.25*(1.0-overcast)) * step(-0.05, sunDir.y);
  float h = 1.0 - smoothstep(0.0, 0.25 + haze*0.3, d.y);
  c = mix(c, fogCol, h*0.85);
  gl_FragColor = vec4(c*exposureSky, 1.0);
}`;

export class Env {
  constructor(renderer, scene, Q) {
    this.r = renderer; this.scene = scene; this.Q = Q;
    this.time = 17.2; // hours
    this.daySpeed = 1/60; // hours per real second (24 min day)
    this.rain = 0; this.rainTarget = 0; this.overcast = 0;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = !!Q.shadows;
    if (Q.shadows) {
      const s = this.sun.shadow; s.mapSize.set(Q.shadowSize, Q.shadowSize);
      const R = Q.shadowRange; Object.assign(s.camera, { left:-R, right:R, top:R, bottom:-R, near:1, far:600 });
      s.camera.updateProjectionMatrix(); s.bias = -0.0004; s.normalBias = 0.04; s.radius = 2;
    }
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4036, 0.4); scene.add(this.hemi);
    this.fog = new THREE.Fog(0xb0c4d8, 40, Q.fog); scene.fog = this.fog;
  }
  async load() {
    const [d, s, n] = await Promise.all([
      loadHDR('hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr'),
      loadHDR('hdri/qwantani_sunset_puresky_2k.hdr'),
      loadHDR('hdri/qwantani_night_puresky_2k.hdr')]);
    for (const t of [d,s,n]) { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; }
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { tDay:{value:d}, tSet:{value:s}, tNight:{value:n}, wts:{value:new THREE.Vector3(1,0,0)}, sunDir:{value:new THREE.Vector3(0,1,0)},
        sunCol:{value:new THREE.Color(1,0.9,0.7)}, rot:{value:0}, exposureSky:{value:1}, fogCol:{value:new THREE.Color()}, haze:{value:0.2}, overcast:{value:0} },
      vertexShader: skyVert, fragmentShader: skyFrag, depthWrite:false, side: THREE.BackSide });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1000;
    this.scene.add(this.sky);
    // IBL: render the blended sky into an equirect target, PMREM it periodically.
    this.eqRT = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType });
    this.eqScene = new THREE.Scene(); this.eqCam = new THREE.CubeCamera(0.1, 100, new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }));
    this.eqSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat); this.eqScene.add(this.eqSky);
    this.pmrem = new THREE.PMREMGenerator(this.r);
    this.envRT = null; this.lastEnvT = -99; this.lastEnvHour = -99;
    this.update(0, new THREE.Vector3(), true);
  }
  weights() {
    const t = this.time;
    // night 0..1
    const dayF = THREE.MathUtils.smoothstep(t, 5.3, 7.0) * (1 - THREE.MathUtils.smoothstep(t, 17.6, 19.4));
    const setF = Math.max(Math.exp(-Math.pow((t-18.4)/1.0, 2)), Math.exp(-Math.pow((t-6.0)/0.8, 2)));
    let wd = dayF * (1 - setF*0.85), ws = setF, wn = 1 - Math.min(1, dayF + setF);
    const sum = wd+ws+wn; return [wd/sum, ws/sum, wn/sum, 1 - dayF];
  }
  get night() { return this._night || 0; }
  update(dt, focus, forceEnv = false) {
    this.time = (this.time + dt * this.daySpeed) % 24;
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt*0.15);
    this.overcast = Math.max(this.rain, this.overcast*0.0);
    const [wd, ws, wn, nightF] = this.weights();
    const nightish = THREE.MathUtils.smoothstep(nightF, 0.35, 0.9);
    this._night = nightish;
    // Sun path: rises 6, sets 18.8; tilted
    const a = (this.time - 6.0) / 12.8 * Math.PI; // 0..PI over the day
    const sd = new THREE.Vector3(Math.cos(a)*0.85, Math.sin(a), 0.45).normalize();
    const isDay = sd.y > -0.02;
    const md = new THREE.Vector3(-sd.x, Math.max(0.35, -sd.y), -0.3).normalize(); // moon
    const ld = isDay ? sd : md;
    const elev = Math.max(0, sd.y);
    const u = this.skyMat.uniforms;
    u.wts.value.set(wd, ws, wn); u.sunDir.value.copy(sd);
    const sunWarm = new THREE.Color().setRGB(1.0, 0.55 + 0.4*Math.min(1, elev*2.5), 0.25 + 0.65*Math.min(1, elev*2.2));
    u.sunCol.value.copy(sunWarm);
    u.overcast.value = this.overcast;
    const fogDay = new THREE.Color(0xc4d3e2), fogSet = new THREE.Color(0xd8a47c), fogNight = new THREE.Color(0x0d1422), fogRain = new THREE.Color(0x8a939c);
    const fc = new THREE.Color().setRGB(0,0,0).add(fogDay.clone().multiplyScalar(wd)).add(fogSet.clone().multiplyScalar(ws)).add(fogNight.clone().multiplyScalar(wn));
    fc.lerp(fogRain.clone().multiplyScalar(1 - nightish*0.85), this.rain*0.8);
    this.fog.color.copy(fc); u.fogCol.value.copy(fc);
    this.fog.near = 30 - this.rain*20; this.fog.far = this.Q.fog * (1 - this.rain*0.55);
    u.exposureSky.value = (1 - this.rain*0.4);
    // Lights
    const sunI = isDay ? (0.6 + 4.4*Math.min(1, elev*2.2)) * (1 - this.rain*0.75) : 0.25;
    this.sun.intensity = sunI;
    this.sun.color.copy(isDay ? sunWarm : new THREE.Color(0x8fa8ff));
    this.hemi.intensity = 0.08 + 0.12*(1-nightish);
    this.hemi.color.copy(fc).lerp(new THREE.Color(0xbfd8ff), 0.5);
    this.scene.environmentIntensity = (0.3 + 0.32*(1-nightish) + this.rain*0.25) * (1 - this.rain*0.2);
    this.scene.backgroundIntensity = 1;
    // Shadow camera follows the focus point, snapped to texels to avoid shimmer
    if (focus) {
      const R = this.Q.shadowRange || 60;
      const tex = (2*R) / (this.Q.shadowSize || 1024);
      const fx = Math.round(focus.x/tex)*tex, fz = Math.round(focus.z/tex)*tex;
      this.sun.position.set(fx + ld.x*250, ld.y*250, fz + ld.z*250);
      this.sun.target.position.set(fx, 0, fz);
      this.sun.target.updateMatrixWorld();
    }
    // Re-bake IBL every ~0.25 game hours or on demand
    if (forceEnv || Math.abs(this.time - this.lastEnvHour) > 0.25 || Math.abs(this.rain - (this._lastRain||0)) > 0.1) {
      this.lastEnvHour = this.time; this._lastRain = this.rain;
      this.eqCam.update(this.r, this.eqScene);
      const old = this.envRT;
      this.envRT = this.pmrem.fromCubemap(this.eqCam.renderTarget.texture);
      this.scene.environment = this.envRT.texture;
      if (old) old.dispose();
    }
  }
}

// ---------- Post-processing ----------
const GradeShader = {
  uniforms: { tDiffuse:{value:null}, vig:{value:0.28}, sat:{value:1.08}, contrast:{value:1.05}, time:{value:0}, grain:{value:0.025}, tint:{value:new THREE.Vector3(1,1,1)}, damage:{value:0} },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, sat, contrast, time, grain, damage; uniform vec3 tint; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
    float l = dot(col, vec3(0.2126,0.7152,0.0722)); col = mix(vec3(l), col, sat);
    col = (col-0.5)*contrast+0.5; col *= tint;
    vec2 q = vUv-0.5; float v = 1.0 - dot(q,q)*vig*2.2; col *= v;
    col = mix(col, vec3(l*1.2,0.05,0.05), damage*smoothstep(0.2,0.75,length(q)));
    col += (h(vUv*1000.0+time)-0.5)*grain;
    gl_FragColor = vec4(clamp(col,0.0,1.0), c.a); }`
};

export function makeComposer(renderer, scene, camera, Q, w, h) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 }));
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null, bloom = null;
  if (Q.ao) {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.85;
    try { gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 2, scale: 1, samples: Q.name==='Ultra' ? 16 : 8 }); } catch(e) {}
    try { gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 }); } catch(e) {}
    composer.addPass(gtao);
  }
  if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(w/2, h/2), 0.22, 0.5, 0.95); composer.addPass(bloom); }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  if (Q.aa === 'smaa') composer.addPass(new SMAAPass());
  else if (Q.aa === 'fxaa') composer.addPass(new FXAAPass());
  return { composer, gtao, bloom, grade };
}
