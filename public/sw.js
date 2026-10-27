// Service worker used only to show system notifications: Chrome on Android
// does not allow `new Notification()` from a page, only from a registration.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Clicking a notification focuses an open dashboard tab, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      open.postMessage({ type: 'open-results' });
      return open.focus();
    }
    return self.clients.openWindow('/?tab=official');
  })());
});
