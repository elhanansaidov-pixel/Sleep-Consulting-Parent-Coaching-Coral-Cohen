// Service worker for the CRM (/admin): shows push notifications and opens the related lead.
// No caching of data — the CRM always loads live (sensitive data must not sit in a cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'קורל כהן · מערכת ניהול', body: 'יש עדכון חדש במערכת', url: '/admin' };
  try { data = { ...data, ...event.data.json() }; } catch (_) { /* keep defaults */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/brand/app-192.png',
    badge: '/brand/app-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: data.url,
    data: { url: data.url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin + '/admin')) { await w.navigate(url); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
