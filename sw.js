/* =============================================
   FieldScan PWA — Service Worker
   ============================================= */

const CACHE_NAME = 'fieldscan-v1';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// CDN assets — se cachean en runtime al primer acceso
const CDN_PATTERNS = [
  'unpkg.com/leaflet',
  'cdn.jsdelivr.net/npm/tesseract',
  'tile.openstreetmap.org',
  'tesseract.js-core',
  'tessdata',
];

// ─── INSTALL ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Solo GET
  if (event.request.method !== 'GET') return;

  // Tiles de OpenStreetMap: Network-first con fallback de caché
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // CDN assets (Leaflet, Tesseract): Cache-first
  const isCDN = CDN_PATTERNS.some(p => url.includes(p));
  if (isCDN) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // App shell: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// ─── ESTRATEGIAS ──────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Recurso no disponible sin conexión', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('Sin conexión', { status: 503 });
}
