// Live Caller Studio — Service Worker v1.0
// Caches the listener page shell so it loads instantly and works offline.
// Firebase/Cloudinary calls always go to the network — we never cache live data.

const CACHE_NAME = 'lcs-v1';
const SHELL = [
  '/LiveCaller/voicemessage.html',
  '/LiveCaller/manifest.json'
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Firebase / Cloudinary / CDN requests → always network (never cache live data)
// - Everything else → cache first, fall back to network
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Always network for live data sources
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('cloudinary.com') ||
    url.includes('gstatic.com/firebasejs') ||
    url.includes('qrserver.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful GET responses for shell files
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback — return cached index.html if available
      return caches.match('/LiveCaller/voicemessage.html');
    })
  );
});
