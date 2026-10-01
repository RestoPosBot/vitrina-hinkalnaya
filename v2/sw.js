/* Сервис-воркер витрины Хинкальной v2.

   Код и оболочка — снимок по версии.
   - install: всё, из чего собран первый экран (страница, стиль, манифест, модули, шрифты,
     favicon, превью сторис, данные), ложится в кеш KESH одним снимком. По одному: пропавший
     файл не роняет весь оффлайн. Тяжёлое (значки установки, сторис целиком) — OBOLOCHKA_POTOM:
     по требованию или впрок со второго захода.
   - страница, js, css, шрифты, значки, картинки берутся сначала из снимка. Сеть не нужна,
     поэтому на плохой связи витрина открывается сразу, а модули одной версии не смешиваются
     с модулями другой (ленивые экраны js/ekrany/*.js приходят из того же снимка, что и ядро).
   - новая версия (изменился sw.js) ставится в фоне и ждёт. Как только витрину открывают
     заново и других её вкладок нет, воркер пропускает ожидание и страница один раз
     перезагружается уже с новым снимком. Открытые вкладки доживают на старой версии целиком.
   - VERSIYA и VERSIYA_FOTO — хеши файлов, их пишет instrumenty/obnovit_versiyu_sw.py
     (хук instrumenty/hooks/pre-commit не пустит коммит со старыми). Руками не править.

   Данные — свежие, но без ожидания.
   - menyu.json, istorii.json: копии в кеше меньше 10 минут — гость получает её сразу,
     сеть обновляет кеш в фоне. Копия старше — запрос в сеть; нет ответа за 1,5 с — копия,
     а сетевой ответ дописывается в кеш для следующего захода. Без сети — копия из кеша.

   Фото блюд foto/** — свой кеш со своей версией, трафик гостя бережём.
   - сначала кеш; кеш не сбрасывается при выпуске кода, только при замене самих фото.
   - первый заход ничего лишнего не качает: только то, что гость увидел на экране.
     Каждое показанное фото ложится в кеш (оригинал в шторке — тоже, при открытии).
   - со второго захода (страница открыта уже через воркер) в фоне докачиваются ПРЕВЬЮ
     foto/m/ всех блюд меню (около 2,5 МБ), по 4 за раз. Не качаем, если у гостя экономия
     трафика, связь 2G или сотовая сеть (navigator.connection.type === 'cellular', Chrome на
     Android). Оригиналы впрок не качаются никогда.
   - фото не в кеше и нет сети: отдаём превью этого блюда из кеша, если оно есть; иначе 204
     без тела. Плитка показывает знак раздела, ошибок загрузки в консоли нет. */

const VERSIYA = 'k-6ae2142fe8';
const VERSIYA_FOTO = 'f-1e08883204';
const KESH = `hinkalnaya-v2-${VERSIYA}`;
const KESH_FOTO = `hinkalnaya-foto-v2-${VERSIYA_FOTO}`;
const PREDEL_FOTO = 400;
const TAYMAUT_DANNYH = 1500;
const SVEZHEST_KOPII = 10 * 60 * 1000; // копия данных моложе — отдаётся без ожидания сети
const METKA_VREMENI = 'X-Polozheno'; // когда копия легла в кеш (мс), пишет сам воркер
const PAUZA_DO_DOKESHA = 6000;
const OBLAST = new URL('./', self.location).pathname;

const OBOLOCHKA = [
  './',
  './index.html',
  './stil.css',
  './manifest.webmanifest',
  './menyu.json',
  './istorii.json',
  // js/**
  './js/prilozhenie.js',
  './js/kartochka.js',
  './js/dannye.js',
  './js/korzina.js',
  './js/dvizhenie.js',
  './js/hinkalik.js',
  './js/istorii.js',
  './js/ekrany/glavnaya.js',
  './js/ekrany/blyudo.js',
  './js/ekrany/adres.js',
  './js/ekrany/korzina.js',
  './js/ekrany/oformlenie.js',
  './js/ekrany/perenos.js',
  './js/ekrany/poisk.js',
  './js/ekrany/gotovo.js',
  // shrifty/**
  './shrifty/shrifty.css',
  './shrifty/unbounded-cyrillic.woff2',
  './shrifty/unbounded-cyrillic-ext.woff2',
  './shrifty/unbounded-latin.woff2',
  './shrifty/onest-cyrillic.woff2',
  './shrifty/onest-cyrillic-ext.woff2',
  './shrifty/onest-latin.woff2',
  // ikonki/**: в снимок только то, что видит страница; значки установки — в OBOLOCHKA_POTOM
  './ikonki/hinkalik.svg',
  './ikonki/favicon-32.png',
  './ikonki/favicon.ico',
  // превью для кружков сторис (scripts/sdelat_prevyu_foto.py), по 6–8 КБ
  './kartinki/istorii/m/bankety.jpg',
  './kartinki/istorii/m/desyat-plyus-dva.jpg',
  './kartinki/istorii/m/hachapuri-dnya.jpg',
  './kartinki/istorii/m/hinkalik-uchitsya.jpg',
  './kartinki/istorii/m/pervyy-zakaz.jpg',
];

// Тяжёлое и не нужное первому экрану (около 1 МБ): значки установки и картинки сторис целиком.
// На первом заходе берутся только по требованию (izSnimka кладёт их в снимок), впрок —
// со второго захода вместе с превью фото и при тех же условиях связи.
const OBOLOCHKA_POTOM = [
  './ikonki/znachok-192.png',
  './ikonki/znachok-512.png',
  './ikonki/znachok-maskable-192.png',
  './ikonki/znachok-maskable-512.png',
  './ikonki/apple-touch-icon.png',
  './kartinki/istorii/bankety.jpg',
  './kartinki/istorii/desyat-plyus-dva.jpg',
  './kartinki/istorii/hachapuri-dnya.jpg',
  './kartinki/istorii/hinkalik-uchitsya.jpg',
  './kartinki/istorii/pervyy-zakaz.jpg',
];

const pauza = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
// Пока у старого воркера идёт фоновая работа (waitUntil), новая версия не может стать активной.
// Поэтому докеш уступает: не начинается и обрывается, как только новая версия ставится или ждёт.
const novayaVersiyaRyadom = () => Boolean(self.registration.waiting || self.registration.installing);
/** Пауза, которая прерывается при появлении новой версии. true — дождались, false — уступили. */
async function pauzaUstupchivaya(ms) {
  for (let proshlo = 0; proshlo < ms; proshlo += 250) {
    if (novayaVersiyaRyadom()) return false;
    await pauza(250);
  }
  return !novayaVersiyaRyadom();
}
const net504 = () => new Response('', { status: 504, statusText: 'Offline' }); // statusText только латиницей: кириллица роняет Response

// ---------------------------------------------------------------------------
// Установка и смена версии
// ---------------------------------------------------------------------------

self.addEventListener('install', (s) => {
  // skipWaiting здесь не зовём: иначе открытая вкладка со старым ядром подтянет
  // новые ленивые модули. Смена версии — в otkrytObolochku() и по сообщению.
  // Первая установка берёт файлы из HTTP-кеша: страница их только что скачала, второй раз
  // качать незачем, и снимок совпадает с тем, что гость уже видит. Обновление — условный
  // запрос: неизменённые файлы приходят как 304 без тела.
  const rezhim = self.registration.active ? 'no-cache' : 'default';
  s.waitUntil(
    caches.open(KESH)
      .then((k) => Promise.all(OBOLOCHKA.map((put) => k.add(new Request(put, { cache: rezhim })).catch(() => null))))
      .then(() => dobavitObloshkiRazdelov())
    // фото при установке не качаем: первый заход гостя тратит только то, что он видит
  );
});

/** Обложки разделов kartinki/razdely/<id>.jpg — список берётся из menyu.json (если обложки есть). */
async function dobavitObloshkiRazdelov() {
  try {
    const k = await caches.open(KESH);
    const otvet = await k.match('./menyu.json');
    if (!otvet) return;
    const menyu = await otvet.json();
    const puti = (menyu.razdely || [])
      .map((r) => r.oblozhka || null)
      .filter((p) => typeof p === 'string' && p.startsWith('kartinki/razdely/'))
      .map((p) => `./${p}`);
    await Promise.all(puti.map((p) => k.add(p).catch(() => null)));
  } catch { /* обложек нет — и не надо */ }
}

self.addEventListener('activate', (s) => {
  s.waitUntil(
    caches.keys()
      .then((imena) => Promise.all(imena
        .filter((i) => i.startsWith('hinkalnaya') && i !== KESH && i !== KESH_FOTO)
        .map((i) => caches.delete(i))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (s) => {
  const d = s.data || {};
  if (d.tip === 'propustit-ozhidanie') {
    self.skipWaiting();
  } else if (d.tip === 'dokeshirovat-foto' && Array.isArray(d.foto)) {
    // страница может прислать фото выбранного заведения: { tip, foto: ['foto/<id>.webp', …] }
    s.waitUntil(dokeshirovatFoto(d.foto, 0));
  }
});

// ---------------------------------------------------------------------------
// Оболочка (сама страница)
// ---------------------------------------------------------------------------

let uzheProsiliPropustit = null;

/** Промежуточная страница на долю секунды: фон как у заставки, без белой вспышки. */
const STRANICA_PEREHODA = '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Хинкальная</title></head>'
  + '<body style="margin:0;background:#FFF7EC"><script>'
  + 'var p=function(){location.reload()};'
  + 'navigator.serviceWorker.addEventListener("controllerchange",p);setTimeout(p,1500);'
  + '</script><noscript><meta http-equiv="refresh" content="1"></noscript></body></html>';

/** Открыть витрину: новая версия ждёт и других вкладок нет → перейти на неё; иначе страница из снимка. */
async function otkrytObolochku(zapros) {
  const ozhidaet = self.registration.waiting;
  if (ozhidaet && ozhidaet !== uzheProsiliPropustit) {
    const okna = await self.clients.matchAll({ type: 'window' });
    if (okna.length <= 1) {
      uzheProsiliPropustit = ozhidaet;
      ozhidaet.postMessage({ tip: 'propustit-ozhidanie' });
      // крошечная страница дождётся новой версии (controllerchange) и перезагрузится уже с ней
      return new Response(STRANICA_PEREHODA, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  }
  const k = await caches.open(KESH);
  const iz = await k.match('./index.html');
  if (iz) return iz;
  return fetch(zapros).catch(() => net504());
}

// ---------------------------------------------------------------------------
// Стратегии
// ---------------------------------------------------------------------------

/** Сначала снимок KESH, при промахе — сеть с дописью в снимок. */
async function izSnimka(s) {
  const k = await caches.open(KESH);
  const v = await k.match(s.request, { ignoreSearch: true });
  if (v) return v;
  try {
    const otvet = await fetch(s.request);
    if (otvet.ok) s.waitUntil(k.put(s.request, otvet.clone()).catch(() => {}));
    return otvet;
  } catch {
    // картинка без сети и не в снимке: пустой 204, как у фото, — без ошибки в консоли
    if (s.request.destination === 'image') return new Response(null, { status: 204, statusText: 'Offline' });
    return net504();
  }
}

/** Положить ответ в кеш с меткой времени (сам ответ гостю не меняется). */
async function polozhitSMetkoy(k, zapros, otvet) {
  const zagolovki = new Headers(otvet.headers);
  zagolovki.set(METKA_VREMENI, String(Date.now()));
  const telo = await otvet.blob();
  await k.put(zapros, new Response(telo, { status: otvet.status, statusText: otvet.statusText, headers: zagolovki }));
}

/** Копия свежая: легла в кеш меньше SVEZHEST_KOPII назад. */
function kopiyaSvezhaya(v) {
  const t = Number(v && v.headers.get(METKA_VREMENI));
  return Boolean(t) && Date.now() - t < SVEZHEST_KOPII;
}

/** Данные: свежая копия — сразу; иначе сеть против таймера. Кеш отдаётся по таймауту, сбою или ответу не 200. */
function dannye(s) {
  const zapros = s.request;
  const kopiya = caches.open(KESH).then((k) => k.match(zapros, { ignoreSearch: true }));
  const setevoy = fetch(new Request(zapros, { cache: 'no-cache' })).then(async (otvet) => {
    if (otvet.ok) {
      const k = await caches.open(KESH);
      await polozhitSMetkoy(k, zapros, otvet.clone());
    }
    return otvet;
  });
  // сеть дописывает кеш в фоне, даже если гость уже получил копию
  s.waitUntil(setevoy.catch(() => null));

  return new Promise((otdat) => {
    let otdano = false;
    const odin = (v) => { if (!otdano && v) { otdano = true; otdat(v); } };
    kopiya.then((v) => { if (kopiyaSvezhaya(v)) odin(v); });
    setevoy.then(
      async (otvet) => { odin(otvet.ok ? otvet : ((await kopiya) || otvet)); },
      async () => { odin((await kopiya) || net504()); },
    );
    setTimeout(async () => { odin(await kopiya); }, TAYMAUT_DANNYH);
  });
}

/** Фото блюд: сначала кеш фото, потом сеть с дописью в кеш (так оригинал ложится в кеш лениво,
    когда гость открыл шторку). Нет сети — превью того же блюда из кеша, иначе пустой 204. */
async function foto(s) {
  const k = await caches.open(KESH_FOTO);
  const v = await k.match(s.request, { ignoreSearch: true });
  if (v) return v;
  try {
    const otvet = await fetch(s.request);
    if (otvet.ok) s.waitUntil(k.put(s.request, otvet.clone()).then(obrezatFoto).catch(() => {}));
    return otvet;
  } catch {
    const url = new URL(s.request.url);
    if (!url.pathname.includes('/foto/m/')) {
      const prevyu = await k.match(new URL(url.pathname.replace('/foto/', '/foto/m/'), url.origin).href);
      if (prevyu) return prevyu;
    }
    return new Response(null, { status: 204, statusText: 'Offline' });
  }
}

// ---------------------------------------------------------------------------
// Кеш фото
// ---------------------------------------------------------------------------

/** Растущий кеш: самые старые записи уходят сверх предела. */
async function obrezatFoto() {
  const k = await caches.open(KESH_FOTO);
  const klyuchi = await k.keys();
  const lishnie = klyuchi.length - PREDEL_FOTO;
  for (let i = 0; i < lishnie; i += 1) await k.delete(klyuchi[i]);
}

/** Связь позволяет качать впрок: не экономия трафика, не 2G и не сотовая сеть. */
function svyazPozvolyaet() {
  const s = self.navigator.connection;
  if (!s) return true;
  if (s.saveData) return false;
  if (s.type === 'cellular') return false; // поле есть в Chrome на Android; мобильный трафик гостя не тратим
  return !/(^|-)2g$/.test(s.effectiveType || '');
}

let dokeshIdet = false;

/** Докачать в кеш фото, которых там ещё нет. По 4 за раз; сеть пропала — стоп. */
async function dokeshirovatFoto(spisok, pauzaMs) {
  if (dokeshIdet || !svyazPozvolyaet()) return;
  dokeshIdet = true;
  try {
    if (pauzaMs && !(await pauzaUstupchivaya(pauzaMs))) return; // сначала пусть догрузится первый экран
    const k = await caches.open(KESH_FOTO);
    const est = new Set((await k.keys()).map((z) => new URL(z.url).pathname));
    const nado = [...new Set(spisok)]
      .filter((p) => typeof p === 'string' && p.startsWith('foto/'))
      .map((p) => new URL(p, self.registration.scope))
      .filter((u) => !est.has(u.pathname))
      .slice(0, PREDEL_FOTO);
    for (let i = 0; i < nado.length; i += 4) {
      if (novayaVersiyaRyadom()) break; // уступить новой версии, докачает она
      const itog = await Promise.all(nado.slice(i, i + 4).map((u) => fetch(u)
        .then((o) => (o.ok ? k.put(u, o) : Promise.resolve()).then(() => true)) // 404 — сеть есть, идём дальше
        .catch(() => false)));
      if (!itog.some(Boolean)) break; // все четыре упали — сети нет
    }
  } finally {
    dokeshIdet = false;
  }
}

/** Превью всех блюд меню в кеше (для плиток без сети). Список — из menyu.json в снимке,
    к этому моменту сеть обычно уже освежила его. Оригиналы впрок не качаются. */
async function dokeshirovatPrevyuMenyu(pauzaMs = PAUZA_DO_DOKESHA) {
  if (!svyazPozvolyaet()) return;
  try {
    if (pauzaMs && !(await pauzaUstupchivaya(pauzaMs))) return; // сначала пусть догрузится первый экран и свежее меню
    const k = await caches.open(KESH);
    // значки установки и картинки сторис целиком — в снимок, если их ещё нет
    await Promise.all(OBOLOCHKA_POTOM.map(async (put) => {
      if (!(await k.match(put))) await k.add(put).catch(() => null);
    }));
    const otvet = await k.match('./menyu.json');
    if (!otvet) return;
    const menyu = await otvet.json();
    const spisok = [];
    for (const r of menyu.razdely || []) {
      for (const b of r.blyuda || []) {
        if (typeof b.foto === 'string') spisok.push(b.foto.replace(/^foto\//, 'foto/m/'));
      }
    }
    await dokeshirovatFoto(spisok, 0);
  } catch { /* меню не разобрать — фото догрузятся при просмотре */ }
}

// ---------------------------------------------------------------------------
// Маршрутизация запросов
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (s) => {
  const zapros = s.request;
  if (zapros.method !== 'GET') return;
  const url = new URL(zapros.url);
  if (url.origin !== location.origin) return; // чужое (подсказки адреса) — мимо кеша
  const put = url.pathname;
  if (!put.startsWith(OBLAST)) return;
  const otn = put.slice(OBLAST.length); // путь внутри витрины

  if (zapros.mode === 'navigate') {
    if (otn === '' || otn === 'index.html') {
      s.respondWith(otkrytObolochku(zapros));
      // страницу открыли через воркер — это уже не первый заход: можно докачать превью
      if (!novayaVersiyaRyadom()) s.waitUntil(dokeshirovatPrevyuMenyu());
    }
    return; // другие страницы в папке (концепты и т. п.) — как без воркера
  }
  if (otn.startsWith('foto/')) {
    s.respondWith(foto(s));
  } else if (otn === 'menyu.json' || otn === 'istorii.json') {
    s.respondWith(dannye(s));
  } else if (/^(js|shrifty|ikonki|kartinki)\//.test(otn) || otn === 'stil.css' || otn === 'manifest.webmanifest') {
    s.respondWith(izSnimka(s));
  }
  // остальное (концепты, служебные файлы) — мимо воркера
});
