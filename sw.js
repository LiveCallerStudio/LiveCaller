// Live Caller Studio — Service Worker
// Keep the app shell available offline without pinning users to stale HTML.
// Firebase/Cloudinary/live data are never cached.

const CACHE_NAME = 'lcs-v41';
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
  '/LiveCaller/overlay.html',
  '/LiveCaller/dashboard/',
  '/LiveCaller/dashboard/index.html',
  '/LiveCaller/lib/line-state.js',
  '/LiveCaller/manifest.json',
  '/LiveCaller/manifest-voicemessage.json',
  '/LiveCaller/manifest-songrequest.json',
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

// Warm the shell best-effort. Cache.addAll() rejects the entire install if a
// single optional icon/path is missing or one request briefly fails.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch {
        // A failed precache is retried naturally on a later same-origin request.
      }
    }));
    await self.skipWaiting();
  })());
});

// Activate: clean up old caches after the new shell has been installed.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // Do not intercept writes or requests to Firebase, Cloudinary, CDNs, or other
  // origins. Live data must always use its normal network path.
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  // Navigation is network-first so deployed HTML fixes reach users without
  // requiring a service-worker cache-version bump. Cached pages remain available
  // when offline; the home page is the last-resort offline entry point.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(cache.put(request, response.clone()));
        }
        return response;
      } catch {
        const cachedPage = await cache.match(request);
        if (cachedPage) return cachedPage;
        const home = await cache.match('/LiveCaller/home-v2.html');
        return home || Response.error();
      }
    })());
    return;
  }

  // Cache-first for same-origin static assets; update the cache after a miss.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch {
      return Response.error();
    }
  })());
});
