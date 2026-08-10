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
      renotify: true,
      silent: false,
      vibrate: [120, 60, 120],
      data: { url },
      badge: '/icons/cosmix-universe-logo-192.png',
      icon: '/icons/cosmix-universe-logo.png',
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
