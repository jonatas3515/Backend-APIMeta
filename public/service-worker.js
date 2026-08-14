const CACHE_NAME = 'nc-assets-v1';
const CACHE_ASSETS = [
  '/',
  '/Logo transparente.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('message', (event) => {
  const { title, body, icon, tag } = event.data || {};
  if (!title || !body) return;

  self.registration.showNotification(title, {
    body,
    icon: icon || '/Logo transparente.png',
    tag: tag || 'nc-push',
    requireInteraction: false
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        client.focus();
        client.navigate(client.url);
        return;
      }
      clients.openWindow('/');
    })
  );
});
