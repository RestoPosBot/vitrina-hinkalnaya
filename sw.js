/* Оффлайн для витрины: меню и оболочка кладутся в кеш при первом заходе.
   Нужно и само по себе, и для упаковки в приложение: проверяющий в Apple
   включает авиарежим, и белый экран означает отказ. */

const KESH = 'hinkalnaya-v1-pereezd';
// 19.10.2026: the storefront moved to client.restoposbot.ru on 02.10; this address only redirects there
const NOVYY_ADRES = 'https://client.restoposbot.ru/';

const OBOLOCHKA = [
  './',
  './index.html',
  './stil.css',
  './vitrina.js',
  './menyu.json',
  './manifest.webmanifest',
];

self.addEventListener('install', (s) => {
  s.waitUntil(caches.open(KESH).then((k) => k.addAll(OBOLOCHKA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (s) => {
  s.waitUntil(
    caches.keys()
      .then((imena) => Promise.all(imena.filter((i) => i !== KESH).map((i) => caches.delete(i))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (s) => {
  const zapros = s.request;
  if (zapros.method !== 'GET') return;

  // Своё — сеть, но с запасом из кеша. Чужое (фотографии) — сначала кеш.
  const svoe = new URL(zapros.url).origin === location.origin;

  if (svoe) {
    s.respondWith(
      fetch(zapros)
        .then((otvet) => {
          const kopiya = otvet.clone();
          caches.open(KESH).then((k) => k.put(zapros, kopiya));
          return otvet;
        })
        // nothing in the cache — not null (Safari shows «Returned response is null»), but a redirect to the new address
        .catch(() => caches.match(zapros).then((v) => v || caches.match('./index.html')).then((v) => v || Response.redirect(NOVYY_ADRES, 302)))
    );
    return;
  }

  s.respondWith(
    caches.match(zapros).then((v) => v || fetch(zapros).then((otvet) => {
      const kopiya = otvet.clone();
      caches.open(KESH).then((k) => k.put(zapros, kopiya));
      return otvet;
    }).catch(() => new Response('', { status: 504 })))
  );
});
