// Service worker FGBB — reçoit les notifications Web Push (Feature 07) et ouvre
// la bonne page au clic. Volontairement minimal : pas de cache/offline ici.
/* global self, clients */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'FGBB', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'FGBB';
  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/icon.png',
    badge: data.badge || '/assets/favicon.png',
    data: { url: data.url || '/app' },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        try { await w.focus(); } catch {}
        try { if ('navigate' in w) await w.navigate(target); } catch {}
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});
