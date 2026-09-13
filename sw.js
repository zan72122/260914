const CACHE = 'poppo-v1';
const FILES = [
  './', './index.html', './manifest.json',
  './src/main.js', './src/levels.js', './src/audio.js', './src/storage.js',
  './src/sim/grid.js', './src/sim/simulate.js', './src/sim/solver.js',
  './src/render/geom.js', './src/render/board.js', './src/render/train.js', './src/render/fx.js', './src/render/map.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
    if (e.request.method === 'GET' && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
