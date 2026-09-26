/* Оффлайн для витрины: меню и оболочка кладутся в кеш при первом заходе.
   Нужно и само по себе, и для упаковки в приложение: проверяющий в Apple
   включает авиарежим, и белый экран означает отказ. */

const KESH = 'hinkalnaya-v1';
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
        .catch(() => caches.match(zapros).then((v) => v || caches.match('./index.html')))
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
