
// Unified input: keyboard+mouse on PC, virtual joystick + buttons on phones.
export class Input {
  constructor(ui) {
    this.mx = 0; this.my = 0; this.lookX = 0; this.lookY = 0; this.b = {}; this.pressed = {}; this.touch = false;
    this.keys = {};
    addEventListener('keydown', e => { if (!this.keys[e.code]) this.pressed[e.code] = true; this.keys[e.code] = true; if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    const cv = document.getElementById('c');
    cv.addEventListener('mousedown', (e) => { if (this.touch) return; if (document.pointerLockElement !== cv && this.allowLock) cv.requestPointerLock?.(); else if (e.button === 0) this.pressed.Punch = true; });
    addEventListener('mousemove', e => { if (document.pointerLockElement === cv) { this.lookX += e.movementX; this.lookY += e.movementY; } });
    this.buildTouch(ui);
    addEventListener('touchstart', () => { if (!this.touch) { this.touch = true; this.tc.classList.add('on'); } }, { passive: true });
  }
  buildTouch(ui) {
    const tc = document.createElement('div'); tc.className = 'tc'; ui.appendChild(tc); this.tc = tc;
    tc.innerHTML = `<div class="joy"><div class="base"></div><div class="knob"></div></div><div class="look"></div>`;
    const joy = tc.querySelector('.joy'), base = joy.querySelector('.base'), knob = joy.querySelector('.knob');
    let jid = null, jx = 0, jy = 0;
    joy.addEventListener('touchstart', e => { const t = e.changedTouches[0]; jid = t.identifier; jx = t.clientX; jy = t.clientY; base.style.display = knob.style.display = 'block'; base.style.left = knob.style.left = jx + 'px'; base.style.top = knob.style.top = jy + 'px'; e.preventDefault(); }, { passive: false });
    const jmove = e => { for (const t of e.changedTouches) if (t.identifier === jid) { let dx = t.clientX - jx, dy = t.clientY - jy; const d = Math.hypot(dx, dy), R = 60; if (d > R) { dx *= R / d; dy *= R / d; } knob.style.left = jx + dx + 'px'; knob.style.top = jy + dy + 'px'; this.mx = dx / R; this.my = -dy / R; } e.preventDefault(); };
    const jend = e => { for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; this.mx = this.my = 0; base.style.display = knob.style.display = 'none'; } };
    joy.addEventListener('touchmove', jmove, { passive: false }); joy.addEventListener('touchend', jend); joy.addEventListener('touchcancel', jend);
    const look = tc.querySelector('.look'); let lid = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', e => { const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
    look.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === lid) { this.lookX += (t.clientX - lx) * 2.2; this.lookY += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; } e.preventDefault(); }, { passive: false });
    look.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; });
    // buttons (two layouts: on foot / in car)
    const mk = (id, label, css, cls = '') => { const b = document.createElement('div'); b.className = 'btn ' + cls; b.innerHTML = label; Object.assign(b.style, css); b.dataset.id = id; tc.appendChild(b);
      b.addEventListener('touchstart', e => { this.b[id] = true; this.pressed[id] = true; b.classList.add('down'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      const up = e => { this.b[id] = false; b.classList.remove('down'); e.preventDefault(); }; b.addEventListener('touchend', up); b.addEventListener('touchcancel', up); return b; };
    const R = 'calc(16px + env(safe-area-inset-right))';
    this.footBtns = [
      mk('Jump', 'JUMP', { right: R, bottom: '28px' }, 'big'),
      mk('Sprint', 'RUN', { right: 'calc(112px + env(safe-area-inset-right))', bottom: '22px' }),
      mk('Punch', 'PUNCH', { right: 'calc(40px + env(safe-area-inset-right))', bottom: '128px' }),
      mk('Enter', '🚗<br>ENTER', { right: 'calc(128px + env(safe-area-inset-right))', bottom: '108px' }),
    ];
    this.carBtns = [
      mk('Gas', 'GAS', { right: R, bottom: '26px' }, 'big gas'),
      mk('Brake', 'BRAKE<br>REV', { right: 'calc(112px + env(safe-area-inset-right))', bottom: '20px' }, 'brk'),
      mk('Handbrake', 'DRIFT', { right: 'calc(28px + env(safe-area-inset-right))', bottom: '128px' }),
      mk('Enter', 'EXIT', { right: 'calc(118px + env(safe-area-inset-right))', bottom: '106px' }),
      mk('Horn', '📯', { right: 'calc(196px + env(safe-area-inset-right))', bottom: '24px' }),
    ];
    this.setMode('foot');
  }
  setMode(m) { this.mode = m; for (const b of this.footBtns) b.style.display = m === 'foot' ? 'flex' : 'none'; for (const b of this.carBtns) b.style.display = m === 'car' ? 'flex' : 'none'; }
  // per-frame snapshot
  read() {
    const k = this.keys;
    const kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const ky = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = {
      mx: Math.abs(this.mx) > 0.08 ? this.mx : kx, my: Math.abs(this.my) > 0.08 ? this.my : ky,
      lookX: this.lookX, lookY: this.lookY,
      sprint: !!(k.ShiftLeft || k.ShiftRight || this.b.Sprint),
      jump: !!(this.pressed.Space || this.pressed.Jump),
      enter: !!(this.pressed.KeyF || this.pressed.KeyE || this.pressed.Enter),
      punch: !!(this.pressed.Punch || this.pressed.KeyQ),
      gas: !!(k.KeyW || k.ArrowUp || this.b.Gas), brake: !!(k.KeyS || k.ArrowDown || this.b.Brake),
      handbrake: !!(k.Space || this.b.Handbrake), horn: !!(k.KeyH || this.b.Horn),
      steer: this.touch ? -this.mx : -kx,
      cam: !!this.pressed.KeyC, pause: !!(this.pressed.Escape || this.pressed.KeyP), map: !!this.pressed.KeyM,
      rain: !!this.pressed.KeyR, time: !!this.pressed.KeyT,
    };
    this.lookX = 0; this.lookY = 0; this.pressed = {};
    return s;
  }
}
