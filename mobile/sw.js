// Service worker của AwM: chỉ nhận thông báo đẩy (không cache để luôn lấy bản mới).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = {body: event.data ? event.data.text() : ''}; }
  event.waitUntil(self.registration.showNotification(d.title || 'BQLDA', {
    body: d.body || 'Có thư mới', tag: d.tag || 'awm', renotify: true,
    icon: '/mobile/icon-192.png', badge: '/mobile/icon-192.png', data: {url: d.url || '/mobile/?view=mobile#mail'}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/mobile/?view=mobile#mail';
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) { if (c.url.includes('/mobile/')) { c.focus(); c.postMessage({type: 'awm-open', page: 'mail'}); return; } }
    return self.clients.openWindow(url);
  }));
});
