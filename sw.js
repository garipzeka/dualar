const CACHE_NAME = 'zikirmatik-pro-v25';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  `${BASE_PATH}/confetti.browser.min.js`
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keyList) =>
        Promise.all(keyList.map((key) => (key !== CACHE_NAME ? caches.delete(key) : undefined)))
      )
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET' || req.url.includes('/api/') || req.url.includes('dualar.json')) return;

  // 🔴 GÜVENLİK: SADECE kendi alan adımız cache'lenir.
  // Firebase/Google alan adları (firestore.googleapis.com, gstatic.com, fonts.googleapis.com vb.)
  // asla cache'lenmez — kutsal dualar telefona yazılamaz.
  // Firestore'da onaylı/özel duaların tam metinleri bulunur; bunların telefon cache'ine
  // yazılması "kutsal kelime telefonda saklanmaz" ilkesini ihlal eder.
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  // Network First Stratejisi
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        const cloned = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned));
        return networkRes;
      })
      .catch(() => {
        // Offline durumunda cache'den dön
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match(`${BASE_PATH}/index.html`);
          }
        });
      })
  );
});
