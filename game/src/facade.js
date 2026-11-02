
import * as THREE from 'three';
export const facadeUniforms = { uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 } };

// Turns a PBR wall material into a procedural building facade: windows with frames, ledges,
// grime, curtains, shopfronts, and lit windows at night. Facade coords come from the meter-UVs.
export function makeFacade(mat, texScale = 3.0) {
  for (const k of ['map','normalMap','roughnessMap','aoMap']) if (mat[k]) { mat[k].repeat.set(1/texScale, 1/texScale); }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, facadeUniforms);
    sh.vertexShader = 'attribute vec4 aInfo; attribute vec4 aInfo2; varying vec2 vFac; varying vec4 vInfo; varying vec4 vInfo2;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vFac = uv; vInfo = aInfo; vInfo2 = aInfo2;');
    sh.fragmentShader = 'uniform float uNight; uniform float uWet; varying vec2 vFac; varying vec4 vInfo; varying vec4 vInfo2;\nfloat hh(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  float fWin = 0.0, fRough = 1.0, fMetal = 0.0; vec3 fEmis = vec3(0.0);
  {
    float seed = vInfo.x, flH = vInfo.y, bayW = vInfo.z, style = vInfo.w;
    float H = vInfo2.x, shop = vInfo2.y, faceW = vInfo2.w;
    vec2 f = vFac;
    float fl = floor(f.y / flH); float cy = fract(f.y / flH);
    float bay = floor(f.x / bayW); float cx = fract(f.x / bayW);
    float top = step(H - 1.05, f.y);
    float edge = step(0.5, f.x) * step(f.x, faceW - 0.5);
    float rnd = hh(vec3(fl, bay, seed * 91.7));
    float rnd2 = hh(vec3(bay, fl * 3.1, seed));
    vec4 wr = style < 0.5 ? vec4(0.26, 0.74, 0.30, 0.82) : (style < 1.5 ? vec4(0.035, 0.965, 0.06, 0.97) : vec4(0.2, 0.8, 0.28, 0.85));
    bool ground = fl < 0.5;
    bool storefront = ground && shop > 0.5;
    if (ground && !storefront) wr = vec4(0.3, 0.7, 0.35, 0.8);
    if (storefront) wr = vec4(0.07, 0.93, 0.03, 0.78);
    float inX = step(wr.x, cx) * step(cx, wr.y);
    float inY = step(wr.z, cy) * step(cy, wr.w);
    float win = inX * inY * (1.0 - top) * edge;
    float fr = style > 0.5 && style < 1.5 ? 0.012 : 0.045;
    float frame = step(wr.x - fr, cx) * step(cx, wr.y + fr) * step(wr.z - fr, cy) * step(cy, wr.w + fr) * (1.0 - top) * edge - win;
    // mullion cross on residential windows
    float mull = (style < 0.5 || style > 1.5) && !storefront ? (1.0 - step(0.012, abs(cx - 0.5))) * win : 0.0;
    float ledge = (1.0 - step(0.07, cy)) * (1.0 - top) * (1.0 - (storefront ? 1.0 : 0.0));
    vec3 wall = diffuseColor.rgb;
    float grime = 1.0 - 0.28 * (1.0 - smoothstep(0.0, 2.5, f.y));
    float streak = inX * (1.0 - inY) * step(cy, wr.z) * smoothstep(wr.z, 0.0, cy) * 0.22 * (1.0 - top);
    float topDark = smoothstep(H - 1.2, H, f.y) * 0.15;
    wall *= grime * (1.0 - streak) * (1.0 - topDark);
    wall = mix(wall, wall * 0.7, ledge);
    float curtain = step(0.55, rnd) * step(rnd, 0.9);
    vec3 cCol = mix(vec3(0.55, 0.42, 0.28), vec3(0.6, 0.62, 0.66), step(0.5, rnd2)) * (0.6 + 0.4 * rnd2);
    vec3 glass = style > 0.5 && style < 1.5 ? vec3(0.05, 0.08, 0.1) : vec3(0.025, 0.03, 0.035);
    // fake interior depth: darker near top of the window
    float depthS = smoothstep(wr.w, wr.w - 0.18, cy);
    glass = mix(glass, cCol * 0.5, curtain * 0.8) * (0.6 + 0.4 * depthS);
    float shutter = storefront && rnd2 > 0.72 ? 1.0 : 0.0;
    vec3 shopIn = vec3(0.0);
    if (storefront) {
      if (shutter > 0.5) {
        float rib = 0.82 + 0.18 * smoothstep(0.2, 0.5, abs(fract(f.y / 0.09) - 0.5));
        glass = mix(vec3(0.42, 0.44, 0.46), vec3(0.25, 0.36, 0.5), step(0.86, rnd2)) * rib * (0.85 + 0.15 * rnd);
      } else {
        float sy = fract((f.y - 0.25) / 0.48); float row = floor((f.y - 0.25) / 0.48);
        float gx = floor(f.x / 0.22);
        float g1 = hh(vec3(gx, row, seed * 13.0)), g2 = hh(vec3(gx * 1.7, row + 4.0, seed)), g3 = hh(vec3(gx, row * 2.3, seed + 7.0));
        vec3 good = vec3(g1, g2, g3); good = mix(vec3(dot(good, vec3(0.33))), good, 0.9); good = clamp(good, 0.0, 1.0) * (0.25 + 0.45 * step(0.25, g2));
        float hasGood = step(0.12, sy) * step(sy, 0.12 + 0.75 * (0.5 + 0.5 * g1)) * step(0.18, g3);
        vec3 back = mix(vec3(0.75, 0.72, 0.62), vec3(0.55, 0.62, 0.7), step(0.5, rnd)) * 0.35;
        shopIn = mix(back, good * 0.7, hasGood * 0.85);
        shopIn = mix(shopIn, vec3(0.16, 0.1, 0.06), step(sy, 0.08));            // shelf boards
        shopIn = mix(shopIn, vec3(0.32, 0.22, 0.14), step(cy, 0.28));          // counter
        shopIn *= 0.75 + 0.25 * smoothstep(wr.w, wr.w - 0.3, cy);
        glass = shopIn;
      }
    }
    vec3 frameCol = style > 0.5 && style < 1.5 ? vec3(0.22, 0.24, 0.26) : vec3(0.78, 0.77, 0.73);
    if (storefront) frameCol = vec3(0.18, 0.18, 0.2);
    diffuseColor.rgb = mix(wall, frameCol, clamp(frame, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
    diffuseColor.rgb = mix(diffuseColor.rgb, frameCol, mull);
    fWin = win * (1.0 - mull);
    fRough = curtain > 0.5 ? 0.3 : 0.03;
    fMetal = 0.2 * fWin;
    float litChance = 0.08 + 0.3 * uNight;
    float lit = step(rnd2, litChance) * smoothstep(0.15, 0.6, uNight);
    vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.92, 1.0), step(0.7, rnd));
    fEmis = fWin * lit * warm * (curtain > 0.5 ? 0.7 : 1.3) * depthS;
    if (storefront) { fEmis = shutter > 0.5 ? vec3(0.0) : fWin * shopIn * (0.35 + 1.5 * smoothstep(0.1, 0.7, uNight)) * mix(vec3(1.0, 0.86, 0.62), vec3(0.85, 0.95, 1.0), step(0.6, rnd)); fRough = shutter > 0.5 ? 0.45 : 0.6; fMetal = shutter * 0.6; }
  }
  `)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, nonPerturbedNormal, fWin));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor * (1.0 - uWet*0.35), fRough, fWin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, fMetal, fWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEmis;');
  };
  mat.customProgramCacheKey = () => 'facade';
  return mat;
}

// Roads/sidewalks get darker + glossier when it rains (wet look) via a shared uniform.
export function makeWettable(mat, strength = 1, puddles = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev && prev(sh);
    sh.uniforms.uWet = facadeUniforms.uWet;
    const pud = puddles ? `
      #ifdef USE_MAP
        vec2 pp = vMapUv * 0.9; vec2 pi = floor(pp), pf = fract(pp); pf = pf * pf * (3.0 - 2.0 * pf);
        float n00 = fract(sin(dot(pi, vec2(12.9898, 78.233))) * 43758.55), n10 = fract(sin(dot(pi + vec2(1, 0), vec2(12.9898, 78.233))) * 43758.55);
        float n01 = fract(sin(dot(pi + vec2(0, 1), vec2(12.9898, 78.233))) * 43758.55), n11 = fract(sin(dot(pi + vec2(1, 1), vec2(12.9898, 78.233))) * 43758.55);
        float nz = mix(mix(n00, n10, pf.x), mix(n01, n11, pf.x), pf.y);
        float puddle = smoothstep(0.62, 0.72, nz) * uWet;
      #else
        float puddle = 0.0;
      #endif` : 'float puddle = 0.0;';
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>\n ${pud}\n diffuseColor.rgb *= (1.0 - uWet*0.38*${strength.toFixed(2)}) * (1.0 - puddle * 0.35);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.08 + roughnessFactor*0.12, uWet*${strength.toFixed(2)}); roughnessFactor = mix(roughnessFactor, 0.02, puddle);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, nonPerturbedNormal, puddle));');
  };
  mat.customProgramCacheKey = () => 'wet' + strength + (puddles ? 'p' : '');
  return mat;
}
