// Street Raja web: joins big assets that the host stores as 800 KB parts. Same URLs as the APK.
const V = '__V__'; let M = null;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
async function manifest() { if (!M) M = await (await fetch('./' + V + '/manifest.json')).json(); return M; }
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url); if (u.origin !== location.origin || e.request.method !== 'GET') return;
  const scope = new URL(self.registration.scope).pathname; if (!u.pathname.startsWith(scope)) return;
  const rp = decodeURIComponent(u.pathname.slice(scope.length)); if (!rp.startsWith('assets/')) return;
  e.respondWith((async () => {
    const m = await manifest(); const f = m[rp]; if (!f) return fetch(e.request);
    const base = './' + V + '/' + rp.split('/').map(encodeURIComponent).join('/');
    if (!f.n) { const r = await fetch(base); return new Response(r.body, { status: r.status, headers: { 'Content-Type': f.t } }); }
    const parts = await Promise.all(Array.from({ length: f.n }, (_, i) => fetch(base + '.p' + i).then((r) => { if (!r.ok) throw new Error('part ' + i + ' ' + r.status); return r.arrayBuffer(); })));
    const body = new Blob(parts, { type: f.t });
    return new Response(body, { status: 200, headers: { 'Content-Type': f.t, 'Content-Length': String(body.size) } });
  })());
});
