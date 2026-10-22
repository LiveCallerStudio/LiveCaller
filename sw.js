// Live Caller Studio — Service Worker
// Caches the listener page shell so it loads instantly and works offline.
// Firebase/Cloudinary calls always go to the network — we never cache live data.

const CACHE_NAME = 'lcs-v14';
const SHELL = [
  '/LiveCaller/index.html',
  '/LiveCaller/home.html',
  '/LiveCaller/home-v2.html',
  '/LiveCaller/voicemessage.html',
  '/LiveCaller/songrequest.html',
  '/LiveCaller/song-overlay.html',
  '/LiveCaller/call.html',
  '/LiveCaller/videocall.html',
  '/LiveCaller/dashboard.html',
  '/LiveCaller/dashboard/',
  '/LiveCaller/dashboard/index.html',
  '/LiveCaller/lib/line-state.js',
  '/LiveCaller/manifest.json',
  '/LiveCaller/manifest-voicemessage.json',
  '/LiveCaller/manifest-call.json',
  '/LiveCaller/manifest-videocall.json',
  '/LiveCaller/manifest-dashboard.json',
  '/LiveCaller/favicon-32.png',
  '/LiveCaller/apple-touch-icon.png',
  '/LiveCaller/apple-touch-icon-152.png',
  '/LiveCaller/apple-touch-icon-167.png',
  '/LiveCaller/icon-192.png',
  '/LiveCaller/icon-512.png'
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

  // Only apply the app-shell cache strategy to GET requests. Never turn a failed
  // POST/PUT/DELETE into an HTML fallback response.
  if (event.request.method !== 'GET') return;

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
      // Offline fallback — return cached home.html if available
      return caches.match('/LiveCaller/home.html');
    })
  );
});
