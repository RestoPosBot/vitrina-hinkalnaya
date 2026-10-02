// Витрина Хинкальной v2 — связь с живой системой Resto Postbot (RPB_backend).
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
//   POST /orders                                @Public  — настоящий заказ, оплата CASH/PENDING,
//                                                          личная скидка вычитается на сервере
// Заказ идёт через POST /orders, а НЕ /orders/client: клиентский требует подключённую
// ЮKassa и падает «Платежная система недоступна» (order.service.ts:527).
// Заведения — свой файл zavedeniya.json: публичные GET /restaurants и /restaurants/by-id/:id
// отдают сотрудников с хешами паролей и весят 0,3-2 МБ, гостю такое грузить нельзя.

const BAZA = 'https://api.restoposbot.ru/api';

/** Сеть Хинкальной в RPB (в системе названа Restopost.bot). */
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

/**
 * Собирает меню витрины из живого RPB.
 * Гостю попадают только товары с publishedInApp — правило владельца: видно то, что показано в приложении.
 * @param {{setId?: string}} [opcii]
 * @returns {Promise<object>} меню по схеме YADRO.md §4
 */
export async function sobratMenyu(opcii = {}) {
  const setId = opcii.setId || SET_ID;
  const [tovary, derevo, zavFayl, dopFayl] = await Promise.all([
    zapros(`${BAZA}/products/by-network/${setId}`, { srok: 25000 }),
    zapros(`${BAZA}/categories/network/${setId}/tree`, { srok: 20000 }).catch(() => []),
    fetch(ADRES_ZAVEDENIY, { cache: 'no-cache' }).then((o) => o.json()),
    fetch(ADRES_DOPOLNENIYA, { cache: 'no-cache' }).then((o) => o.json()).catch(() => ({ blyuda: {} })),
  ]);

  const zavedeniya = (zavFayl.zavedeniya || []).map((z) => ({ ...z }));
  const nashi = new Set(zavedeniya.map((z) => z.id));
  const dopolnenie = dopFayl.blyuda || {};

  const spisokTovarov = Array.isArray(tovary) ? tovary : (tovary?.data || []);
  const vidnye = spisokTovarov.filter((t) => t && t.isUsed !== false && t.publishedInApp);

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
    istochnik: 'Resto Postbot, живое API (products/by-network)',
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

/** Вошедший гость или null. @returns {{id: string, telefon: string, token: string}|null} */
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
  const zapis = { id, telefon: phone, token, obnovit: otvet?.tokens?.refreshToken || null };
  zapisat(zapis);
  return zapis;
}

/**
 * Личная скидка гостя в заведении, %. Без входа — 0.
 * @param {string} zavedenieId id ресторана в RPB
 * @returns {Promise<{procent: number, est: boolean}>}
 */
export async function lichnayaSkidka(zavedenieId) {
  const g = prochitat();
  if (!g || !zavedenieId) return { procent: 0, est: false };
  try {
    const otvet = await zapros(`${BAZA}/customers/${g.id}/discounts/${zavedenieId}`, { token: g.token });
    const procent = Number(otvet?.discount) || 0;
    const aktivna = otvet?.isActive !== false;
    return { procent: aktivna ? procent : 0, est: aktivna && procent > 0 };
  } catch (oshibka) {
    if (oshibka.kod === 401) vyyti();
    return { procent: 0, est: false };
  }
}

// ---------------------------------------------------------------------------
// Акции заведения
// ---------------------------------------------------------------------------

/**
 * Действующие акции сети для такого способа получения. Отдаёт то же, что сервер
 * сам применит к заказу (GET /discounts/vitrina/:setId), поэтому витрина обещает
 * ровно ту сумму, которую посчитает система.
 * @param {'samovyvoz'|'dostavka'} sposob
 * @returns {Promise<{id:string, nazvanie:string, tip:'PERCENTAGE'|'FIXED', razmer:number, minSumma:number|null}[]>}
 */
let akciiNeOtvechayut = false;

export async function akcii(sposob) {
  if (akciiNeOtvechayut) return [];
  const tip = sposob === 'dostavka' ? 'DELIVERY' : 'TAKEAWAY';
  try {
    const spisok = await zapros(`${BAZA}/discounts/vitrina/${SET_ID}?orderType=${tip}`);
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
  const rub = akciya.tip === 'PERCENTAGE'
    ? Math.floor((summa * Number(akciya.razmer || 0)) / 100)
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
export async function otpravitZakaz(zakaz) {
  const g = prochitat();
  const adres = zakaz.adres || {};
  const telo = {
    restaurantId: zakaz.zavedenieId,
    type: zakaz.sposob === 'dostavka' ? 'DELIVERY' : 'TAKEAWAY',
    source: 'SITE',
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
  }

  const otvet = await zapros(`${BAZA}/orders`, { method: 'POST', telo, srok: 25000, token: g?.token });
  return {
    id: otvet?.id || null,
    nomer: otvet?.number ?? null,
    summa: Number(otvet?.totalAmount) || 0,
    skidka: Number(otvet?.discountAmount) || 0,
    otvet,
  };
}
