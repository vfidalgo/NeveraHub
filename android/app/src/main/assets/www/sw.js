// Service Worker NeveraHub para Notificaciones Push y Modo Offline
const CACHE_NAME = 'neverahub-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// Recepción de Notificaciones Push en el móvil
self.addEventListener('push', (event) => {
  let data = { title: 'NeveraHub Familiar', message: 'Hay novedades en la casa' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data.message = event.data.text();
  }

  const options = {
    body: data.message,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      { action: 'open', title: 'Ver en NeveraHub' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Clic en la notificación abre la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
