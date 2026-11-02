
// Procedural WebAudio sound: engine, skid, horn, siren, crash, city ambience, rain. No external files needed.
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.8; }
  init() {
    if (this.ctx) return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C(); const master = this.master = ctx.createGain(); master.gain.value = this.vol; master.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = noiseBuf;
    const noise = (gain, type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1; const g = ctx.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(master); s.start(); return { s, f, g }; };
    // engine: two detuned saws + square sub through lowpass
    const eg = this.engGain = ctx.createGain(); eg.gain.value = 0; const lp = this.engLP = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 4;
    this.engOsc = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    this.engOsc[0].type = 'sawtooth'; this.engOsc[1].type = 'sawtooth'; this.engOsc[2].type = 'square';
    for (const o of this.engOsc) { o.connect(lp); o.start(); } lp.connect(eg).connect(master);
    this.skid = noise(0, 'bandpass', 1800, 3);
    this.amb = noise(0.05, 'lowpass', 500, 0.5);
    this.rain = noise(0, 'highpass', 2500, 0.3);
    this.siren = ctx.createOscillator(); this.siren.type = 'square'; this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0; const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    this.siren.connect(sf).connect(this.sirenG).connect(master); this.siren.start();
    this.horn = [ctx.createOscillator(), ctx.createOscillator()]; this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    this.horn[0].frequency.value = 415; this.horn[1].frequency.value = 523; for (const o of this.horn) { o.type = 'square'; o.connect(this.hornG); o.start(); }
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800; this.hornG.connect(hf).connect(master);
    this.nextHonk = 3;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  update(dt, s) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const rpm = s.inCar ? 0.25 + Math.min(1, Math.abs(s.speed) / 30) * 0.75 + (s.throttle > 0 ? 0.1 : 0) : 0;
    const f = 38 + rpm * 120;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.05); this.engOsc[1].frequency.setTargetAtTime(f * 1.007, t, 0.05); this.engOsc[2].frequency.setTargetAtTime(f / 2, t, 0.05);
    this.engLP.frequency.setTargetAtTime(300 + rpm * 1500 + (s.throttle > 0 ? 400 : 0), t, 0.05);
    this.engGain.gain.setTargetAtTime(s.inCar ? 0.05 + 0.07 * rpm : 0, t, 0.1);
    this.skid.g.gain.setTargetAtTime(s.inCar ? Math.min(0.25, s.skid * 0.3) : 0, t, 0.05);
    this.rain.g.gain.setTargetAtTime(s.rain * 0.12, t, 0.5);
    this.amb.g.gain.setTargetAtTime(0.03 + (1 - s.night) * 0.03, t, 1);
    // siren wail
    const sv = s.sirenNear || 0; this.sirenG.gain.setTargetAtTime(sv * 0.05, t, 0.1);
    this.siren.frequency.setTargetAtTime(700 + 400 * (0.5 + 0.5 * Math.sin(t * 5)), t, 0.02);
    this.hornG.gain.setTargetAtTime(s.horn ? 0.07 : 0, t, 0.01);
    // distant random honks (it's an Indian city!)
    this.nextHonk -= dt; if (this.nextHonk < 0) { this.nextHonk = 2 + Math.random() * 6; this.blip(300 + Math.random() * 250, 0.18 + Math.random() * 0.25, 0.015); }
  }
  blip(freq, dur, vol) { const c = this.ctx; if (!c) return; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq; const g = c.createGain(); g.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; o.connect(f).connect(g).connect(this.master); const t = c.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05); o.start(t); o.stop(t + dur + 0.1); }
  crash(power) { const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = c.createGain(); const t = c.currentTime; const v = Math.min(0.6, power * 0.03); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 0.7); }
  punch() { const c = this.ctx; if (!c) return; const o = c.createOscillator(); o.frequency.value = 120; const g = c.createGain(); const t = c.currentTime; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2); }
  cash() { this.blip(880, 0.08, 0.06); setTimeout(() => this.blip(1320, 0.12, 0.06), 90); }
}
