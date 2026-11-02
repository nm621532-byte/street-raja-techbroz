const BLOCK_IN = 61;

import { N, P, ROAD, ORIGIN, SIDE, BX0, BX1, BZ0, BZ1, blockType, segX, segZ, REGIONS, VILLAGE_LIST, DHABA_LIST, isUrban } from './city.js';
export class HUD {
  constructor(ui, city) {
    this.ui = ui; this.city = city;
    ui.insertAdjacentHTML('beforeend', `
      <div class="hud-top"><div class="money">₹0</div><div class="stars"></div><div class="clock"></div><div class="health"><div></div></div></div>
      <canvas id="minimap" width="340" height="340"></canvas>
      <div class="mission"></div><div class="banner"></div><div class="toast"></div><div class="prompt"></div>
      <div class="speedo"><span>0</span><small>KM/H</small></div>
      <div class="topbtns"><div data-a="pause">⏸</div><div data-a="cam">🎥</div><div data-a="map">🗺</div></div><div class="region"></div>
      <div class="fps"></div>`);
    this.$ = (s) => ui.querySelector(s);
    this.money = this.$('.money'); this.stars = this.$('.stars'); this.clock = this.$('.clock'); this.hp = this.$('.health>div');
    this.mission = this.$('.mission'); this.banner = this.$('.banner'); this.toastEl = this.$('.toast'); this.promptEl = this.$('.prompt');
    this.speedo = this.$('.speedo'); this.fpsEl = this.$('.fps');
    this.mm = this.$('#minimap'); this.mctx = this.mm.getContext('2d');
    this.buildMap();
    this.lastMoney = -1; this.lastStars = -1;
  }
  onTop(fn) { this.ui.querySelectorAll('.topbtns div').forEach(d => d.addEventListener('click', () => fn(d.dataset.a))); this.ui.querySelectorAll('.topbtns div').forEach(d => d.addEventListener('touchstart', (e) => { e.preventDefault(); fn(d.dataset.a); }, { passive: false })); }
  buildMap() {
    const S = 2; this.mapS = S; this.mapO = ORIGIN + BX0 * P; this.mapOz = ORIGIN + BZ0 * P;
    const Wm = (BX1 - BX0) * P, Hm = (BZ1 - BZ0) * P;
    const c = document.createElement('canvas'); c.width = Math.ceil(Wm / S); c.height = Math.ceil(Hm / S); const g = c.getContext('2d');
    const fill = { field: ['#6f7f45', '#7d8a4c', '#8a7a4a', '#a39a3c', '#6a7a40'], village: ['#7d7550'], dhaba: ['#8a7550'], beach: ['#d8c79a'], sea: ['#2b5f7a'], city: ['#9a9a92'], town: ['#a39486'], coast: ['#9fa3a3'] };
    for (let bx = BX0 - 1; bx <= BX1; bx++) for (let bz = BZ0 - 1; bz <= BZ1; bz++) {
      const t = blockType(bx, bz); if (t === 'out') continue; const pal = fill[t] || ['#777'];
      const x = (ORIGIN + bx * P - this.mapO) / S, z = (ORIGIN + bz * P - this.mapOz) / S;
      g.fillStyle = pal[Math.abs(bx * 7 + bz * 13) % pal.length]; g.fillRect(x, z, P / S + 1, P / S + 1);
      if (isUrban(t)) { g.fillStyle = t === 'town' ? '#b9a48f' : '#b4b4ac'; g.fillRect(x + (ROAD / 2 + SIDE) / S, z + (ROAD / 2 + SIDE) / S, (BLOCK_IN) / S, (BLOCK_IN) / S); }
      if (t === 'village' || t === 'dhaba') { g.fillStyle = '#c9b48a'; for (let k = 0; k < 5; k++) g.fillRect(x + 8 + ((k * 37 + bx * 11) % 50), z + 8 + ((k * 23 + bz * 7) % 50), 4, 4); }
    }
    // sea beyond the beach
    g.fillStyle = '#2b5f7a'; g.fillRect(0, 0, c.width, (ORIGIN - 18 * P - 20 - this.mapOz) / S);
    g.fillStyle = '#3d4045';
    for (let i = BX0; i <= BX1; i++) for (let j = BZ0; j <= BZ1; j++) {
      const x = (ORIGIN + i * P - this.mapO) / S, z = (ORIGIN + j * P - this.mapOz) / S, w = ROAD / S;
      if (segX(i, j)) g.fillRect(x - w / 2, z - w / 2, P / S + w, w);
      if (segZ(i, j)) g.fillRect(x - w / 2, z - w / 2, w, P / S + w);
    }
    this.mapImg = c;
  }
  toWorldMap(x, z) { return [(x - this.mapO) / this.mapS, (z - this.mapOz) / this.mapS]; }
  openBigMap(player, blips) {
    if (this.big) { this.big.remove(); this.big = null; return; }
    const d = document.createElement('div'); d.className = 'menu'; d.style.background = '#000d'; const cv = document.createElement('canvas');
    const W = Math.min(innerWidth, innerHeight) * 0.94; cv.width = cv.height = Math.round(W * devicePixelRatio); cv.style.width = cv.style.height = W + 'px'; cv.style.borderRadius = '12px'; d.appendChild(cv);
    const g = cv.getContext('2d'); const k = cv.width / this.mapImg.width; g.drawImage(this.mapImg, 0, 0, cv.width, cv.height * this.mapImg.height / this.mapImg.width);
    const lab = (txt, x, z, size, col = '#fff') => { const [px, pz] = this.toWorldMap(x, z); g.font = `900 ${size * devicePixelRatio}px Arial`; g.textAlign = 'center'; g.lineWidth = 4 * devicePixelRatio; g.strokeStyle = '#000a'; g.strokeText(txt, px * k, pz * k); g.fillStyle = col; g.fillText(txt, px * k, pz * k); };
    for (const r of REGIONS) lab(r.name.toUpperCase(), ORIGIN + (r.bx0 + r.bx1 + 1) / 2 * P, ORIGIN + (r.bz0 + r.bz1 + 1) / 2 * P, 18, '#ffd54a');
    const seen = {}; for (const v of VILLAGE_LIST) { if (seen[v[2]]) continue; seen[v[2]] = 1; lab(v[2], ORIGIN + (v[0] + 0.5) * P, ORIGIN + (v[1] + 0.5) * P - 30, 12, '#e8f5c8'); }
    for (const dh of DHABA_LIST) lab('🍽 ' + dh[2].replace(' DHABA', ''), ORIGIN + (dh[0] + 0.5) * P, ORIGIN + (dh[1] + 0.5) * P, 10, '#ffcc80');
    lab('NH-44', ORIGIN + 13 * P, ORIGIN + 4 * P - 25, 12, '#90caf9'); lab('NH-7', ORIGIN + 4 * P + 40, ORIGIN - 5 * P, 12, '#90caf9'); lab('ARABIAN SEA', ORIGIN + 12 * P, ORIGIN - 20 * P, 16, '#b3e5fc');
    for (const b of blips) { const [px, pz] = this.toWorldMap(b.x, b.z); g.fillStyle = b.color; g.beginPath(); g.arc(px * k, pz * k, 6 * devicePixelRatio, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); if (b.label) { g.font = `800 ${11 * devicePixelRatio}px Arial`; g.textAlign = 'left'; g.lineWidth = 3 * devicePixelRatio; g.strokeStyle = '#000c'; g.strokeText(b.label, px * k + 9 * devicePixelRatio, pz * k + 4 * devicePixelRatio); g.fillStyle = b.color; g.fillText(b.label, px * k + 9 * devicePixelRatio, pz * k + 4 * devicePixelRatio); } }
    const [px, pz] = this.toWorldMap(player.pos.x, player.pos.z); g.save(); g.translate(px * k, pz * k); g.rotate(Math.PI - player.heading); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -12 * devicePixelRatio); g.lineTo(8 * devicePixelRatio, 9 * devicePixelRatio); g.lineTo(-8 * devicePixelRatio, 9 * devicePixelRatio); g.closePath(); g.stroke(); g.fill(); g.restore();
    const sz = document.createElement('div'); sz.className = 'small'; sz.style.cssText = 'position:absolute;bottom:12px;left:0;right:0;text-align:center'; sz.textContent = `World: ${(this.mapImg.width * this.mapS / 1000).toFixed(1)} × ${(this.mapImg.height * this.mapS / 1000).toFixed(1)} km · tap to close`; d.appendChild(sz);
    d.onclick = () => { d.remove(); this.big = null; }; this.ui.appendChild(d); this.big = d;
  }
  draw(player, heading, blips) {
    const g = this.mctx, W = this.mm.width, H = this.mm.height, S = this.mapS;
    const zoom = player.vehicle ? 1.1 + Math.min(1, Math.abs(player.vehicle.speed) / 35) * -0.35 : 1.4;
    g.save(); g.clearRect(0, 0, W, H); g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2a2d31'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2); g.rotate(heading + Math.PI); g.scale(zoom, zoom);
    g.drawImage(this.mapImg, -(player.pos.x - this.mapO) / S, -(player.pos.z - this.mapOz) / S);
    for (const b of blips) {
      const x = (b.x - player.pos.x) / S, y = (b.z - player.pos.z) / S; const r = 155 / zoom;
      let dx = x, dy = y; const d = Math.hypot(dx, dy); if (d > r) { dx *= r / d; dy *= r / d; }
      g.fillStyle = b.color; g.beginPath(); g.arc(dx, dy, (b.size || 7) / zoom, 0, Math.PI * 2); g.fill(); g.lineWidth = 2 / zoom; g.strokeStyle = '#000'; g.stroke();
    }
    g.restore();
    // player arrow
    g.save(); g.translate(W / 2, H / 2); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.stroke(); g.fill(); g.restore();
    // north marker
    g.save(); g.translate(W / 2, H / 2); g.rotate(heading + Math.PI); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('N', 0, -(H / 2 - 22)); g.restore();
  }
  set(state) {
    if (state.money !== this.lastMoney) { this.money.textContent = '₹' + state.money.toLocaleString('en-IN'); this.lastMoney = state.money; }
    if (state.stars !== this.lastStars || state.starFlash !== this.lastFlash) {
      this.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < state.stars ? 'on' : 'off'}">★</span>`).join('');
      this.stars.classList.toggle('flash', !!state.starFlash); this.lastStars = state.stars; this.lastFlash = state.starFlash;
    }
    const h = Math.floor(state.time), m = Math.floor((state.time - h) * 60);
    this.clock.textContent = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}${state.rain > 0.3 ? ' 🌧' : ''}`;
    this.hp.style.width = Math.max(0, state.health) + '%';
    this.speedo.style.display = state.inCar ? 'block' : 'none'; if (state.inCar) this.speedo.firstChild.textContent = Math.round(Math.abs(state.speed) * 3.6);
  }
  showMission(html) { this.mission.style.display = html ? 'block' : 'none'; if (html) this.mission.innerHTML = html; }
  showBanner(text, red = false, ms = 2500) { this.banner.textContent = text; this.banner.className = 'banner' + (red ? ' red' : ''); this.banner.style.display = 'block'; clearTimeout(this.bt); this.bt = setTimeout(() => this.banner.style.display = 'none', ms); }
  toast(t, ms = 2200) { this.toastEl.textContent = t; this.toastEl.style.opacity = 1; clearTimeout(this.tt); this.tt = setTimeout(() => this.toastEl.style.opacity = 0, ms); }
  showRegion(name, sub) { const r = this.ui.querySelector('.region'); r.innerHTML = `${name}<small>${sub || ''}</small>`; r.style.opacity = 1; clearTimeout(this.rt); this.rt = setTimeout(() => r.style.opacity = 0, 3500); }
  prompt(t) { this.promptEl.style.display = t ? 'block' : 'none'; if (t) this.promptEl.textContent = t; }
}
