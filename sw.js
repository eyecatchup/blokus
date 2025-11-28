// Minimal service worker for PWA installation only
// No caching - all requests pass through to network

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event - always fetch from network, never cache
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

