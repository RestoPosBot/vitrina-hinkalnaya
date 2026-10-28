// Витрина Хинкальной v2 — связь с живой системой ChikChak (RPB_backend).
// Меню, цены и стопы по заведениям, вход гостя по СМС, личная скидка, отправка заказа.
// Контракт экранов не меняется: sobratMenyu() отдаёт объект той же схемы, что menyu.json
// (design/vitrina_v2/YADRO.md §4), только id блюд и заведений — настоящие, из RPB.
//
// Эндпоинты сверены по коду work/backend/src (02.10.2026):
//   GET  /products/by-network/:setId            @Public  — товары сети (245, гостю видно publishedInApp)
//   GET  /categories/network/:setId/tree        @Public  — разделы и их порядок
//   POST /customers/request-code                @Public  — {phone, networkId} -> СМС с кодом
//   POST /customers/verify-code                 @Public  — {phone, code, networkId} -> токены + id гостя
//   GET  /customers/:id/discounts/:restaurantId          — личная скидка (нужен токен)
//   POST /customers/:id/qr                      @DlyaGostya — QR для кассира на 2 минуты, один раз
//   POST /customers/refresh-token               @Public  — {refreshToken} -> новые токены
//   GET  /delivery-zones/restaurant/:id         @Public  — зоны доставки заведения (контур WKT, минимум, приоритет)
//   POST /orders                                @Public  — настоящий заказ, оплата CASH/PENDING,
//                                                          личная скидка вычитается на сервере
// Заказ идёт через POST /orders, а НЕ /orders/client: клиентский требует подключённую
// ЮKassa и падает «Платежная система недоступна» (order.service.ts:527).
// Заведения — свой файл zavedeniya.json (адреса, точки, фото); часы работы — из GET /restaurants/by-id/:id
// (с 24.10 он отдаёт 2–3 КБ без сотрудников; раньше отдавал хеши паролей и весил до 2 МБ).

import { konturZony } from './dannye.js';

const BAZA = 'https://api.chikchak.ai/api';

/**
 * Витрина открыта в приложении гостя: обёртка открывает её с ?prilozhenie=1 (или пишет «ChikChakApp» в User-Agent).
 * Тогда заказ уходит как MOBILE — «самовывоз −10 %» только из приложения, на сайте её нет (владелец 28.10.2026).
 * Метка помнится: у обёртки своё хранилище, а внутри неё гость переходит по страницам без параметра.
 * shortcut: гость сайта может дописать ?prilozhenie=1 руками и получить скидку приложения; закрыть — подписью обёртки
 */
export const ISTOCHNIK = (() => {
  const vUA = /ChikChakApp/i.test(navigator.userAgent);
  try {
    if (/[?&]prilozhenie=1(&|$)/.test(location.search)) localStorage.setItem('chikchak_prilozhenie', '1');
    return vUA || localStorage.getItem('chikchak_prilozhenie') === '1' ? 'MOBILE' : 'SITE';
  } catch {
    return vUA ? 'MOBILE' : 'SITE';
  }
})();

/** Сеть Хинкальной в ChikChak. */
export const SET_ID = 'cmbsh1diy000110v3ic2a7h1v';

const ADRES_ZAVEDENIY = new URL('../zavedeniya.json', import.meta.url);
const ADRES_DOPOLNENIYA = new URL('../dopolnenie.json', import.meta.url);

/** Сколько ждём ответа API, мс: дольше гость смотрит на пустой экран. */
const SROK = 12000;

// ---------------------------------------------------------------------------
// Сеть
// ---------------------------------------------------------------------------

async function zapros(put, opcii = {}) {
  const otmena = new AbortController();
  const chasy = setTimeout(() => otmena.abort(), opcii.srok || SROK);
  try {
    const otvet = await fetch(put, {
      method: opcii.method || 'GET',
      signal: otmena.signal,
      headers: {
        ...(opcii.telo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opcii.token ? { Authorization: `Bearer ${opcii.token}` } : {}),
        ...(opcii.headers || {}),
      },
      body: opcii.telo !== undefined ? JSON.stringify(opcii.telo) : undefined,
    });
    const tekst = await otvet.text();
    let telo = null;
    try { telo = tekst ? JSON.parse(tekst) : null; } catch { telo = tekst; }
    if (!otvet.ok) {
      const soobshchenie = (telo && (telo.message || telo.error)) || `Ответ ${otvet.status}`;
      const oshibka = new Error(Array.isArray(soobshchenie) ? soobshchenie.join('; ') : String(soobshchenie));
      oshibka.kod = otvet.status;
      oshibka.telo = telo;
      throw oshibka;
    }
    return telo;
  } finally {
    clearTimeout(chasy);
  }
}

// ---------------------------------------------------------------------------
// Меню из RPB
// ---------------------------------------------------------------------------

/** Нормализация названия для склейки с dopolnenie.json (регистр, ё, знаки). */
function klyuchNazvaniya(nazvanie) {
  return String(nazvanie || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐‑]/g, '-')
    .replace(/[^0-9a-zа-я]+/g, ' ')
    .trim();
}

/** Фото из RPB: только настоящий адрес. В базе остались заглушки example.com — их не берём. */
function foto(tovar) {
  const spisok = Array.isArray(tovar.images) ? tovar.images : [];
  const adres = spisok.find((i) => typeof i === 'string' && /^https?:\/\//.test(i) && !i.includes('example.com'));
  return adres || null;
}

/** Цены и стопы по нашим заведениям: {restaurantId: {cena, stop}}. */
function poZavedeniyam(tovar, nashi) {
  const itog = {};
  for (const cena of tovar.restaurantPrices || []) {
    if (!nashi.has(cena.restaurantId)) continue;
    itog[cena.restaurantId] = { cena: Number(cena.price) || 0, stop: Boolean(cena.isStopList) };
  }
  return itog;
}

function blyudoIzTovara(tovar, nashi, dopolnenie) {
  const dop = dopolnenie[klyuchNazvaniya(tovar.title)] || {};
  const po = poZavedeniyam(tovar, nashi);
  const vseVStope = Object.keys(po).length > 0 && Object.values(po).every((z) => z.stop);
  const sostav = (tovar.composition || '').trim() || dop.sostav || null;
  const opisanie = (tovar.description || '').trim() || dop.opisanie || null;
  return {
    id: tovar.id,
    nazvanie: tovar.title,
    cena: Number(tovar.price) || 0,
    ves: Number(tovar.weight) || null,
    vremya: Number(tovar.preparationTime) || null,
    foto: foto(tovar),
    cvet: dop.cvet || null,
    opisanie,
    sostav,
    kkal: dop.kkal || null,
    dobavki: (tovar.additives || []).map((d) => ({
      id: d.id,
      nazvanie: d.title || d.name || '',
      cena: Number(d.price) || 0,
    })),
    po_zavedeniyam: po,
    stop_vezde: Boolean(tovar.isStopList) || vseVStope,
  };
}

const DNI_PANELI = [['mo', 'monday'], ['tu', 'tuesday'], ['we', 'wednesday'], ['th', 'thursday'], ['fr', 'friday'], ['sa', 'saturday'], ['su', 'sunday']];

/** Минуты от полуночи в поясе заведения: в панели время хранится как момент 2026-01-01 в UTC. */
function minutyVPoyase(moment, poyas) {
  const [ch, m] = new Intl.DateTimeFormat('ru-RU', { timeZone: poyas, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(moment)).split(':').map(Number);
  return ch * 60 + m;
}

/**
 * Часы работы заведений из панели (GET /restaurants/by-id/:id, 2–3 КБ без сотрудников) в виде файла витрины:
 * {mo: [от, до] в минутах, …, su: null — выходной}; «до» за полночь — больше 1440. Не ответило — заведения нет в ответе.
 * @param {string[]} idy
 * @returns {Promise<Map<string, object>>}
 */
async function chasyIzPaneli(idy) {
  const otvety = await Promise.all(idy.map((id) => zapros(`${BAZA}/restaurants/by-id/${encodeURIComponent(id)}`, { srok: 4000 }).catch(() => null)));
  const out = new Map();
  otvety.forEach((r, i) => {
    if (!r || !DNI_PANELI.some(([, d]) => r[`${d}Open`])) return;
    const poyas = r.timezone || 'Europe/Moscow';
    const chasy = {};
    for (const [k, d] of DNI_PANELI) {
      if (r[`${d}IsWorking`] === false || !r[`${d}Open`] || !r[`${d}Close`]) { chasy[k] = null; continue; }
      const ot = minutyVPoyase(r[`${d}Open`], poyas);
      const do_ = minutyVPoyase(r[`${d}Close`], poyas);
      chasy[k] = [ot, do_ > ot ? do_ : do_ + 1440];
    }
    out.set(idy[i], chasy);
  });
  return out;
}

/**
 * Собирает меню витрины из живого RPB.
 * Гостю попадают только товары с publishedInApp — правило владельца: видно то, что показано в приложении.
 * @param {{setId?: string}} [opcii]
 * @returns {Promise<object>} меню по схеме YADRO.md §4
 */
export async function sobratMenyu(opcii = {}) {
  const setId = opcii.setId || SET_ID;
  const fayl = fetch(ADRES_ZAVEDENIY, { cache: 'no-cache' }).then((o) => o.json());
  const [tovary, derevo, zavFayl, dopFayl, chasy] = await Promise.all([
    zapros(`${BAZA}/products/by-network/${setId}`, { srok: 25000 }),
    zapros(`${BAZA}/categories/network/${setId}/tree`, { srok: 20000 }).catch(() => []),
    fayl,
    fetch(ADRES_DOPOLNENIYA, { cache: 'no-cache' }).then((o) => o.json()).catch(() => ({ blyuda: {} })),
    // часы — из панели, пока меню ещё грузится; в файле у всех стоят «по умолчанию», и витрина писала
    // «часы уточняйте», хотя в панели 11:00–22:00 (Б-28, 26.10.2026)
    fayl.then((f) => chasyIzPaneli((f.zavedeniya || []).map((z) => z.id))).catch(() => new Map()),
  ]);

  const zavedeniya = (zavFayl.zavedeniya || []).map((z) => (chasy.has(z.id) ? { ...z, chasy: chasy.get(z.id) } : { ...z }));
  const nashi = new Set(zavedeniya.map((z) => z.id));
  const dopolnenie = dopFayl.blyuda || {};

  const spisokTovarov = Array.isArray(tovary) ? tovary : (tovary?.data || []);
  // 22.10: «в приложении» — витрина, установленная на телефон (значок на экране); в браузере — «на сайте».
  // Так у блюд бывает эксклюзив только для приложения (просьба владельца). Раньше смотрели только на «в приложении».
  const vPrilozhenii = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const vidnye = spisokTovarov.filter((t) => t && t.isUsed !== false && (vPrilozhenii ? t.publishedInApp : t.publishedOnWebsite));

  // Порядок блюд внутри раздела — как в панели (clientSortOrder); ищем его по id, а не перебором.
  const poryadokBlyud = new Map(vidnye.map((t) => [t.id, Number(t.clientSortOrder ?? t.sortOrder ?? 0)]));

  // Порядок разделов — clientOrder у категории, потом order, потом название.
  const poryadokRazdelov = new Map();
  const imenaRazdelov = new Map();
  for (const k of Array.isArray(derevo) ? derevo : []) {
    poryadokRazdelov.set(k.id, Number(k.clientOrder ?? k.order ?? 0));
    imenaRazdelov.set(k.id, k.title);
  }

  const razdelyPoId = new Map();
  for (const tovar of vidnye) {
    const kategoriya = tovar.category || {};
    const id = tovar.categoryId || kategoriya.id;
    if (!id) continue;
    if (!razdelyPoId.has(id)) {
      razdelyPoId.set(id, {
        id,
        nazvanie: imenaRazdelov.get(id) || kategoriya.title || 'Без раздела',
        _poryadok: poryadokRazdelov.has(id)
          ? poryadokRazdelov.get(id)
          : Number(kategoriya.clientOrder ?? kategoriya.order ?? 9999),
        blyuda: [],
      });
    }
    razdelyPoId.get(id).blyuda.push(blyudoIzTovara(tovar, nashi, dopolnenie));
  }

  const razdely = [...razdelyPoId.values()].sort((a, b) => a._poryadok - b._poryadok);
  for (const razdel of razdely) {
    razdel.blyuda.sort((a, b) => (poryadokBlyud.get(a.id) || 0) - (poryadokBlyud.get(b.id) || 0)
      || a.nazvanie.localeCompare(b.nazvanie, 'ru'));
    delete razdel._poryadok;
  }

  return {
    set: zavFayl.set || 'Хинкальная',
    setId,
    snyato: new Date().toISOString().slice(0, 10),
    istochnik: 'ChikChak, живое API (products/by-network)',
    zavedeniya,
    razdely,
    banket: null,
  };
}

// ---------------------------------------------------------------------------
// Гость: вход по СМС
// ---------------------------------------------------------------------------

const KLYUCH_GOSTYA = 'hinkalnaya.rpb.gost.v1';

function prochitat() {
  try {
    const s = JSON.parse(localStorage.getItem(KLYUCH_GOSTYA) || 'null');
    return s && typeof s === 'object' && s.id && s.token ? s : null;
  } catch { return null; }
}

function zapisat(s) {
  try {
    if (s) localStorage.setItem(KLYUCH_GOSTYA, JSON.stringify(s));
    else localStorage.removeItem(KLYUCH_GOSTYA);
  } catch { /* приватный режим: вход живёт только до перезагрузки */ }
}

/** Вошедший гость или null. @returns {{id: string, telefon: string, token: string, imya?: string}|null} */
export function gost() {
  return prochitat();
}

/** Выход: забываем токен. */
export function vyyti() {
  zapisat(null);
}

/** Только цифры телефона; 8XXXXXXXXXX приводим к 7XXXXXXXXXX, как ждёт сервер. */
export function cifryTelefona(telefon) {
  let d = String(telefon || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  return d;
}

/**
 * Просит выслать код на телефон. Сервер отвечает success даже если СМС не ушла
 * (customer.service.ts:122-138 глотает ошибку отправки) — отдельного признака нет.
 * @param {string} telefon
 * @returns {Promise<{otpravleno: boolean}>}
 */
export async function zaprositKod(telefon) {
  const phone = cifryTelefona(telefon);
  if (phone.length < 10) throw new Error('Не хватает цифр в номере');
  await zapros(`${BAZA}/customers/request-code`, { method: 'POST', telo: { phone, networkId: SET_ID } });
  return { otpravleno: true };
}

/**
 * Проверяет код и запоминает гостя.
 * @param {string} telefon
 * @param {string} kod
 * @returns {Promise<{id: string, telefon: string, token: string}>}
 */
export async function podtverditKod(telefon, kod) {
  const phone = cifryTelefona(telefon);
  const otvet = await zapros(`${BAZA}/customers/verify-code`, {
    method: 'POST',
    telo: { phone, code: String(kod || '').trim(), networkId: SET_ID },
  });
  const token = otvet?.tokens?.accessToken;
  const id = otvet?.customer?.id;
  if (!token || !id) throw new Error('Сервер не выдал токен');
  const zapis = { id, telefon: phone, token, obnovit: otvet?.tokens?.refreshToken || null, imya: otvet?.customer?.name || '' };
  zapisat(zapis);
  return zapis;
}

/**
 * Имя вошедшего гостя: из входа, иначе из профиля на сервере (вход до 29.10.2026 имени не хранил), иначе ''.
 * Ответ запоминаем в сессии — профиль спрашиваем один раз.
 * @returns {Promise<string>}
 */
export async function imyaGostya() {
  const g = prochitat();
  if (!g) return '';
  if (typeof g.imya === 'string') return g.imya;
  try {
    const p = await sTokenom((token) => zapros(`${BAZA}/customers/profile`, { token }));
    const s = prochitat();   // sTokenom мог сменить токен — пишем поверх свежей записи
    if (s) zapisat({ ...s, imya: String(p?.name || '').trim() });
  } catch { return ''; }   // вход истёк или сеть — просто спросим имя
  return prochitat()?.imya || '';
}

/**
 * Личная скидка гостя в заведении (23.10.2026): у гостя свой % на каждый тип заказа и потолки на отдельные блюда
 * (исключения блюд и категорий, сервер разворачивает их до блюд; 0 — без скидки). Без входа — 0.
 * @param {string} zavedenieId id ресторана в RPB
 * @param {'samovyvoz'|'dostavka'} [sposob] способ получения: самовывоз — TAKEAWAY, доставка — DELIVERY
 * @returns {Promise<{procent: number, est: boolean, potolki: Object<string, number>}>}
 */
export async function lichnayaSkidka(zavedenieId, sposob) {
  const g = prochitat();
  if (!g || !zavedenieId) return { procent: 0, est: false, potolki: {} };
  try {
    const otvet = await sTokenom((token) => zapros(`${BAZA}/customers/${g.id}/discounts/${zavedenieId}`, { token }));
    const procent = otvet?.isActive === false ? 0 : Number(otvet?.procenty?.[sposob === 'dostavka' ? 'DELIVERY' : 'TAKEAWAY']) || 0;
    return { procent, est: procent > 0, potolki: otvet?.potolkiBlyud || {} };
  } catch {
    return { procent: 0, est: false, potolki: {} };
  }
}

let zagruzkaZon = null;
/**
 * Зоны доставки всех заведений — те, что рисуют в панели (GET /delivery-zones/restaurant/:id, @Public), раз за открытие сайта.
 * Не ответило хоть одно заведение — null: экраны решают по-старому, по 7 км, чтобы не закрыть доставку его району.
 * @param {{id: string}[]} zavedeniya
 * @returns {Promise<Array<{zavedenieId, nazvanie, cena, min, nizheMin, prioritet, cvet, kontur}>|null>} nizheMin — доставка меньше минимума, ₽; null — не возим
 */
export function zonyDostavki(zavedeniya) {
  if (!zavedeniya?.length) return Promise.resolve(null);   // меню ещё не загрузилось — пустоту не запоминаем
  if (zagruzkaZon) return zagruzkaZon;
  zagruzkaZon = Promise.all((zavedeniya || []).map((z) => zapros(`${BAZA}/delivery-zones/restaurant/${encodeURIComponent(z.id)}`)
    .then((spisok) => (Array.isArray(spisok) ? spisok : []).map((x) => ({
      zavedenieId: z.id, nazvanie: x.title, cena: Number(x.price) || 0, min: Number(x.minOrder) || 0, nizheMin: x.priceBelowMin ?? null,
      prioritet: Number(x.priority) || 0, cvet: x.color || null, kontur: konturZony(x.polygon),
    })))))
    .then((vse) => vse.flat())
    .catch(() => { zagruzkaZon = null; return null; });
  return zagruzkaZon;
}

/**
 * Сохранённые адреса доставки вошедшего гостя (23.10.2026: перенесены из старой системы — 21 тыс. адресов).
 * Без входа или при ошибке — пусто: витрина просто предлагает поиск адреса.
 * @returns {Promise<Array<{kratko: string, adres: string, shirota: number, dolgota: number, dop: object}>>}
 */
export async function moiAdresa() {
  const g = prochitat();
  if (!g) return [];
  try {
    const spisok = await sTokenom((token) => zapros(`${BAZA}/customers/${g.id}/addresses`, { token }));
    return (Array.isArray(spisok) ? spisok : []).map((a) => ({
      kratko: a.address,
      adres: [a.title, a.entrance && `подъезд ${a.entrance}`, a.floor && `этаж ${a.floor}`, a.apartment && `кв. ${a.apartment}`].filter(Boolean).join(' · '),
      // 0,0 в старой базе — «координат нет», а не точка в океане (иначе витрина скажет «доставки нет»)
      shirota: Number(a.latitude) || NaN, dolgota: Number(a.longitude) || NaN,
      dop: { kvartira: a.apartment || '', podyezd: a.entrance || '', etazh: a.floor || '', domofon: a.intercom || '', kurieru: a.comment || '' },
    }));
  } catch {
    return [];
  }
}

/**
 * Токен гостя живёт час (JWT_ACCESS_EXPIRATION), refresh — 7 дней. Чтобы не слать СМС каждый час,
 * на 401 один раз меняем токены через POST /customers/refresh-token; не вышло — гость разлогинен.
 * @template T @param {(token: string) => Promise<T>} fn @returns {Promise<T>}
 */
export async function sTokenom(fn) {
  const g = prochitat();
  if (!g) { const o = new Error('Нужен вход'); o.kod = 401; throw o; }
  try {
    return await fn(g.token);
  } catch (oshibka) {
    if (oshibka?.kod !== 401 || !g.obnovit) { if (oshibka?.kod === 401) vyyti(); throw oshibka; }
    let novye;
    try {
      novye = await zapros(`${BAZA}/customers/refresh-token`, { method: 'POST', telo: { refreshToken: g.obnovit } });
    } catch (o2) {
      // разлогиниваем только если refresh отвергнут; обрыв сети или 500 вход не стирают
      if (o2?.kod === 401 || o2?.kod === 403) vyyti();
      throw o2;
    }
    const token = novye?.accessToken;
    if (!token) { vyyti(); throw oshibka; }
    zapisat({ ...g, token, obnovit: novye?.refreshToken || g.obnovit });
    return fn(token);
  }
}

/**
 * QR для кассира: `rpb-gost:<id>:<случайный ключ>`, 2 минуты, срабатывает один раз (бэкенд qr-gostya.ts).
 * Только по нему касса привязывает гостя и даёт скидку (владелец 21.10.2026). `kod` — текст QR.
 * @returns {Promise<{kod: string, do: Date}>}
 */
export async function korotkiyKod() {
  const g = prochitat();
  if (!g) { const o = new Error('Нужен вход'); o.kod = 401; throw o; }
  const otvet = await sTokenom((token) => zapros(`${BAZA}/customers/${g.id}/qr`, { method: 'POST', token }));
  if (!otvet?.qr) throw new Error('Сервер не выдал QR');
  // срок считаем от момента получения по часам устройства: часы телефона могут расходиться с сервером
  return { kod: String(otvet.qr), do: new Date(Date.now() + 2 * 60 * 1000) };
}

// ---------------------------------------------------------------------------
// Акции заведения
// ---------------------------------------------------------------------------

/**
 * Действующие акции сети для такого способа получения. Отдаёт то же, что сервер
 * сам применит к заказу (GET /discounts/vitrina/:setId), поэтому витрина обещает
 * ровно ту сумму, которую посчитает система.
 * @param {'samovyvoz'|'dostavka'} sposob
 * @param {string} [zavedenieId] заведение гостя: сервер отдаёт только акции, что действуют в нём сейчас (часы по его поясу)
 * @returns {Promise<{id:string, nazvanie:string, tip:'PERCENTAGE'|'FIXED', razmer:number, minSumma:number|null, maxSumma:number|null}[]>}
 */
let akciiNeOtvechayut = false;

export async function akcii(sposob, zavedenieId) {
  if (akciiNeOtvechayut) return [];
  const tip = sposob === 'dostavka' ? 'DELIVERY' : 'TAKEAWAY';
  try {
    const spisok = await zapros(`${BAZA}/discounts/vitrina/${SET_ID}?orderType=${tip}&istochnik=${ISTOCHNIK}${zavedenieId ? `&restaurantId=${encodeURIComponent(zavedenieId)}` : ''}`);
    return Array.isArray(spisok) ? spisok : [];
  } catch (oshibka) {
    // 404 — на сервере ещё нет этого адреса (старая сборка бэкенда): молчим и живём без акций,
    // чтобы не сыпать ошибками в консоль на каждый пересчёт корзины.
    if (oshibka.kod === 404) akciiNeOtvechayut = true;
    else console.warn('Акции не пришли', oshibka);
    return [];
  }
}

/**
 * Сколько рублей даст акция на такую сумму. Повторяет расчёт сервера:
 * проценты округляются вниз, скидка не больше суммы заказа.
 * @returns {number}
 */
export function summaAkcii(akciya, summa) {
  if (!akciya || !(summa > 0)) return 0;
  if (akciya.minSumma && summa < akciya.minSumma) return 0;
  if (akciya.maxSumma && summa > akciya.maxSumma) return 0;
  const rub = akciya.tip === 'PERCENTAGE'
    ? Math.floor((summa * Number(akciya.razmer || 0)) / 100 + 1e-9)   // как сервер: 2,3 % от 3000 = 69
    : Math.floor(Number(akciya.razmer || 0));
  return Math.max(0, Math.min(rub, summa));
}

// ---------------------------------------------------------------------------
// Заказ
// ---------------------------------------------------------------------------

/**
 * Отправляет настоящий заказ в RPB.
 * Сумму считает сервер по ценам заведения и сам вычитает личную скидку гостя
 * (order.service.ts:209-224) — витрина своих цифр серверу не навязывает.
 * @param {object} zakaz
 * @param {string} zakaz.zavedenieId id ресторана в RPB
 * @param {'samovyvoz'|'dostavka'} zakaz.sposob
 * @param {{blyudoId: string, kolichestvo: number, dobavki?: ({id: string}|string)[], kommentariy?: string}[]} zakaz.pozicii
 * @param {string} zakaz.imya
 * @param {string} zakaz.telefon
 * @param {string} [zakaz.kommentariy]
 * @param {object} [zakaz.adres] {tekst, kvartira, podyezd, etazh, domofon, kurieru}
 * @param {number} [zakaz.cenaDostavki]
 * @param {string} [zakaz.kogda] ISO-время, если «ко времени»
 * @returns {Promise<{id: string, nomer: string|number, summa: number, skidka: number, otvet: object}>}
 */
/** Ссылка на оплату заказа картой (ЮKassa магазина заведения, 28.10.2026). Сумму считает сервер; vozvrat — куда вернуть гостя. */
export async function oplatitOnlayn(zakazId, vozvrat) {
  return zapros(`${BAZA}/orders/${encodeURIComponent(zakazId)}/oplata-onlayn`, { method: 'POST', telo: { vozvrat }, srok: 35000 });
}

/**
 * Форма оплаты ЮKassa прямо на витрине (29.10.2026, владелец: «нельзя уводить людей с сайта»): сервер создаёт платёж
 * с подтверждением embedded и отдаёт токен формы. popytka — новая попытка после неудачной (у неё новый платёж).
 * @returns {Promise<{token: string}>}
 */
export async function tokenOplaty(zakazId, popytka = 0) {
  return zapros(`${BAZA}/orders/${encodeURIComponent(zakazId)}/oplata-onlayn`, { method: 'POST', telo: { vidzhet: true, popytka }, srok: 35000 });
}

export async function otpravitZakaz(zakaz) {
  const g = prochitat();
  const adres = zakaz.adres || {};
  const telo = {
    restaurantId: zakaz.zavedenieId,
    type: zakaz.sposob === 'dostavka' ? 'DELIVERY' : 'TAKEAWAY',
    source: ISTOCHNIK,
    customerName: zakaz.imya,
    phone: cifryTelefona(zakaz.telefon),
    comment: zakaz.kommentariy || undefined,
    customerId: g?.id || undefined,
    items: (zakaz.pozicii || []).map((p) => ({
      productId: p.blyudoId,
      quantity: p.kolichestvo,
      comment: p.kommentariy || undefined,
      additiveIds: (p.dobavki || []).map((d) => (typeof d === 'string' ? d : d.id)).filter(Boolean),
    })),
  };
  if (zakaz.kogda) telo.scheduledAt = zakaz.kogda;
  if (zakaz.sposob === 'dostavka') {
    telo.deliveryAddress = adres.tekst || undefined;
    telo.deliveryApartment = adres.kvartira || undefined;
    telo.deliveryEntrance = adres.podyezd || undefined;
    telo.deliveryFloor = adres.etazh || undefined;
    telo.deliveryIntercom = adres.domofon || undefined;
    telo.deliveryCourierComment = adres.kurieru || undefined;
    if (typeof zakaz.cenaDostavki === 'number') telo.deliveryPrice = zakaz.cenaDostavki;
    // точка адреса: по ней сервер сам находит зону, цену доставки и минимум (26.10.2026)
    if (Number.isFinite(adres.shirota) && Number.isFinite(adres.dolgota)) { telo.deliveryLat = adres.shirota; telo.deliveryLng = adres.dolgota; }
  }

  if (zakaz.onlayn) telo.payment = { method: 'ONLINE' };   // касса видит «онлайн»; на кухню заказ уйдёт, когда пройдёт оплата
  const otvet = await zapros(`${BAZA}/orders`, { method: 'POST', telo, srok: 25000, token: g?.token });
  return {
    id: otvet?.id || null,
    nomer: otvet?.number ?? null,
    summa: Number(otvet?.totalAmount) || 0,
    skidka: Number(otvet?.discountAmount) || 0,
    otvet,
  };
}
