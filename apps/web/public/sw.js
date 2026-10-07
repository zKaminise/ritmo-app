/* O build substitui esta lista pelos arquivos com hash gerados pelo Vite. */
const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
const CACHE = 'ritmo-shell-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith('ritmo-shell-') && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/')) ?? (await caches.match('/offline.html'))),
    );
    return;
  }
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  )
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((c) => c.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('ritmo-push', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('meta');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function remember(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const s = tx.objectStore('meta');
    let fresh = false;
    const read = s.get(`received:${id}`);
    read.onsuccess = () => {
      if (!read.result) {
        fresh = true;
        s.put(new Date().toISOString(), `received:${id}`);
        s.put(new Date().toISOString(), 'lastPush');
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(fresh);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function readLast() {
  const db = await database();
  return new Promise((resolve) => {
    const tx = db.transaction('meta');
    const read = tx.objectStore('meta').get('lastPush');
    read.onsuccess = () => resolve(read.result ?? null);
    tx.oncomplete = () => db.close();
  });
}
self.addEventListener('message', (event) => {
  if (event.data?.type === 'LAST_PUSH')
    event.waitUntil(readLast().then((last) => event.ports[0]?.postMessage(last)));
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        data = null;
      }
      if (!data || typeof data.title !== 'string') return;
      const id =
        typeof data.reminderId === 'string'
          ? data.reminderId
          : `${data.occurrenceId}:${data.title}`;
      if (!(await remember(id))) return;
      const url = new URL(typeof data.url === 'string' ? data.url : '/', self.location.origin);
      if (url.origin !== self.location.origin) return;
      await self.registration.showNotification(data.title, {
        body: data.body ?? '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: id,
        renotify: false,
        data: { url: url.pathname + url.search, occurrenceId: data.occurrenceId },
        actions: [{ action: 'snooze-10', title: 'Adiar 10 min' }],
      });
      if ('setAppBadge' in self.navigator) await self.navigator.setAppBadge(1).catch(() => {});
      for (const client of await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      }))
        client.postMessage({ type: 'PUSH_RECEIVED', at: new Date().toISOString() });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      if (event.action === 'snooze-10' && event.notification.data.occurrenceId) {
        try {
          const response = await fetch(
            `/api/occurrences/${event.notification.data.occurrenceId}/snooze`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ minutes: 10 }),
            },
          );
          if (response.ok) return;
        } catch {
          /* Abra o app para mostrar o compromisso se o adiar não puder ser salvo. */
        }
      }
      const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
      if (url.origin !== self.location.origin) return;
      if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge().catch(() => {});
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.navigate(url.href);
        await client.focus();
      } else await self.clients.openWindow(url.href);
    })(),
  );
});
