
// Graphics presets. Auto-pick by device, user can override in Settings.
export const PRESETS = {
  low:    { name:'Low',    pixelRatio:1.0,  maxPR:1.25,   shadows:false, shadowSize:0,    shadowRange:0,   tex:512,  bloom:false, ao:false, aa:'none', fog:260, drawDist:320, traffic:14, peds:8,  lampLights:0, reflections:false, envProbe:false, cars:'basic', trees:0.4, rainDrops:1500 },
  medium: { name:'Medium', pixelRatio:1.0,  maxPR:1.5,shadows:true,  shadowSize:1024, shadowRange:70,  tex:1024, bloom:true,  ao:false, aa:'fxaa', fog:420, drawDist:520, traffic:28, peds:26, lampLights:4, reflections:false, envProbe:false, cars:'physical', trees:0.7, rainDrops:3000 },
  high:   { name:'High',   pixelRatio:1.0,  maxPR:1.75,shadows:true,  shadowSize:2048, shadowRange:110, tex:2048, bloom:true,  ao:true,  aa:'smaa', fog:600, drawDist:800, traffic:36, peds:34, lampLights:8, reflections:true,  envProbe:true,  cars:'physical', trees:1.0, rainDrops:5000 },
  ultra:  { name:'Ultra',  pixelRatio:1.0,  maxPR:2.0, shadows:true,  shadowSize:4096, shadowRange:150, tex:4096, bloom:true,  ao:true,  aa:'smaa', fog:900, drawDist:1100,traffic:40, peds:38, lampLights:12,reflections:true,  envProbe:true,  cars:'physical', trees:1.0, rainDrops:8000 },
};
export const ORDER = ['low','medium','high','ultra'];

export function detectPreset(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + '';
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const mem = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const g = gpu.toLowerCase();
    if (/swiftshader|llvmpipe|software/.test(g)) return { id:'low', gpu };
    if (!mobile) return { id: /intel|uhd|iris/.test(g) ? 'high' : 'ultra', gpu };
    // Mobile GPUs
    if (/adreno \(tm\) (7[3-9]\d|8\d\d)|adreno.*7[3-9]\d|mali-g7[1-9]|mali-g7\d\d|immortalis|xclipse/.test(g)) return { id: mem >= 8 ? 'high' : 'medium', gpu };
    if (/adreno.*(6[4-9]\d|7[0-2]\d)|mali-g(5[7-9]|6\d|7[0-9])/.test(g)) return { id:'medium', gpu };
    if (mem <= 3 || cores <= 4) return { id:'low', gpu };
    return { id:'medium', gpu };
  } catch (e) { return { id:'medium', gpu:'?' }; }
}
