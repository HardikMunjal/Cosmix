self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }

  const title = String(payload.title || 'Cosmix');
  const body = String(payload.body || 'You have a new update.');
  const url = String(payload.url || '/chat');
  const tag = String(payload.tag || 'cosmix-notification');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      badge: '/cosmix-share-logo.png',
      icon: '/cosmix-share-logo.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || '/chat');

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(targetUrl)) {
        await client.focus();
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
