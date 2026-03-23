const CACHE_NAME = 'gameday-vintage-v1';
const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700;800&family=Caveat:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&display=swap',
];

// Install — precache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
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

// Fetch — network first for API calls, cache first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — always network, no cache
  if (url.hostname.includes('espn.com') ||
      url.hostname.includes('mlb.com') ||
      url.hostname.includes('sofascore.com')) {
    return;
  }

  // Static assets (fonts, the app itself) — cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response.ok && (url.hostname.includes('fonts.googleapis.com') ||
            url.hostname.includes('fonts.gstatic.com') ||
            url.pathname.endsWith('.html') ||
            url.pathname === '/' ||
            url.pathname.endsWith('/'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
