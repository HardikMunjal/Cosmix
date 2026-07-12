const CACHE_VERSION = 'cosmix-pwa-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        return cache.match(OFFLINE_URL);
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => caches.match(event.request)),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }

  const title = String(payload.title || 'Cosmix');
  const body = String(payload.body || 'You have a new update.');
  const url = String(payload.url || '/dashboard');
  const tag = String(payload.tag || 'cosmix-notification');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      badge: '/icons/cosmix-icon.svg',
      icon: '/icons/cosmix-icon.svg',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = String(event.notification?.data?.url || '/dashboard');
  const targetUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = new URL(targetUrl);

    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== target.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch (_) { /* ignore */ }
        }
        return;
      } catch (_) {
        // ignore malformed client URLs
      }
    }

    await clients.openWindow(targetUrl);
  })());
});
