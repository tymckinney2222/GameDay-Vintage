// GameDay PWA service worker
//
// Two important details after the Skipper-fantasy rewrite:
//   1. HTML is fetched NETWORK-FIRST so deploys are picked up on the
//      next page load, not after the cache happens to expire.
//   2. We listen for SKIP_WAITING messages from index.html so the
//      auto-update flow there can ask us to take over immediately.
//
// To force every existing user to get a clean cache after deploying
// these changes, bump CACHE_NAME below. (The version suffix is what
// triggers the SW to install fresh and clean out the old cache.)
const CACHE_NAME = 'gameday-vintage-v2';
const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700;800&family=Caveat:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
];

// Install — precache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  // Note: we deliberately DO NOT call skipWaiting() here. The new
  // index.html sends a SKIP_WAITING message after install, which
  // triggers a coordinated reload — that's smoother than auto-skipping
  // and accidentally activating mid-render.
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Message handler — required for the cache-busting flow in index.html.
// When index.html detects a new SW has been installed, it posts
// { type: 'SKIP_WAITING' }; we activate immediately so the page can
// reload with the new code.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET (POSTs to OAuth refresh, etc.)
  if (request.method !== 'GET') return;

  // API calls — always pass through to the network, never cache
  if (url.hostname.includes('espn.com') ||
      url.hostname.includes('mlb.com') ||
      url.hostname.includes('sofascore.com') ||
      url.hostname.includes('workers.dev')) {
    return;
  }

  // Network-first for HTML — this is the key change. Every page load
  // tries the network first, falls back to cache on failure (offline).
  // Without this, deployed changes won't be visible to users until
  // the SW happens to reinstall, which can take a long time.
  const isHTML =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/');

  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Stash a fresh copy for offline fallback
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets (fonts, images, etc.)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && (url.hostname.includes('fonts.googleapis.com') ||
            url.hostname.includes('fonts.gstatic.com'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
