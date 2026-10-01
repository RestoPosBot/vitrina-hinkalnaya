// Витрина Хинкальной v2 — ядро: загрузка меню, состояние гостя, маршруты по #,
// склейка экранов, нижняя навигация, корзина на кнопке, Хинкалик, живой фон.
// Соглашения для экранов — design/vitrina_v2/YADRO.md (сигнатуры не менять).

import {
  zagruzitMenyu, podgotovitMenyu, cenaV, prichinaNedostupnosti, semeystvoRazdela, naytiZavedenie, perenestiKorzinu,
  kEtomuBerut, naytiBlyudo,
} from './dannye.js';
import { sobratMenyu, lichnayaSkidka, gost as gostRPB, vyyti as vyytiRPB } from './rpb.js';
import { korzina } from './korzina.js';
import {
  FonGradient, pokazatTost, pokazatChislo, poletVKorzinu, vibro, nazhatie, pruzhina, shtorka, dvizhenieSnyato,
} from './dvizhenie.js';
import { Hinkalik, volnaZagruzki, svgHinkalika } from './hinkalik.js';
import { rub, chislo, tekst } from './kartochka.js';

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const KLYUCH_GOSTYA = 'hinkalnaya.gost.v2';
const KLYUCH_GOLOS = 'hinkalnaya.golos.v2';
const MIN_DOSTAVKI = 1000;
/** Личная скидка гостя: процент из Resto Postbot для выбранного заведения.
 *  Её же вычитает сервер при создании заказа (order.service.ts:209-224), поэтому витрина
 *  показывает ровно то, что посчитает система. Не вошёл — 0, своих скидок витрина не придумывает. */
let skidkaGostya = { procent: 0, est: false };
const PAUZA_REPLIK = 20000;

/** Палитры живого фона (DIZAYN §2.3). Единственное место — экраны берут через yadro.PALITRY_FONA. */
const PALITRY_FONA = {
  testo:   ['#FFB03A', '#F0532D', '#F6B75A', '#FF8A3D', '#E8452E', '#FFC76A'],
  zhar:    ['#F0532D', '#FFB03A', '#D9302F', '#FF7A2F', '#B8213F', '#FFAE4A'],
  zelen:   ['#F4C77A', '#6FBF73', '#FFB03A', '#B7DF8A', '#F0532D', '#8FD08A'],
  sladkoe: ['#F26B8A', '#FFB03A', '#FFB08A', '#F0532D', '#E8567D', '#FFC76A'],
  napitki: ['#6FD8C2', '#FFB03A', '#2AA8A0', '#F4C77A', '#D9F7E6', '#FF8A3D'],
  kombo:   ['#FFB03A', '#B8213F', '#F0532D', '#F6B75A', '#E0432F', '#FF8A3D'],
  adres:   ['#FFB03A', '#F4C77A', '#F0532D', '#FFD9B0', '#FF8A3D', '#FFC76A'],
  gotovo:  ['#FFB03A', '#3E9C5C', '#F4C77A', '#8FD08A', '#F0532D', '#FFC76A'],
};
/** Подложка фона под палитру: светлая, тёплая — между пятнами не бледнеет. */
const PODLOZHKA = '#FFE3C2';

/** Загрузчики экранов: явные строки, чтобы браузер и sw.js видели пути. */
const ZAGRUZCHIKI = {
  glavnaya: () => import('./ekrany/glavnaya.js'),
  adres: () => import('./ekrany/adres.js'),
  blyudo: () => import('./ekrany/blyudo.js'),
  korzina: () => import('./ekrany/korzina.js'),
  oformlenie: () => import('./ekrany/oformlenie.js'),
  perenos: () => import('./ekrany/perenos.js'),
  poisk: () => import('./ekrany/poisk.js'),
  gotovo: () => import('./ekrany/gotovo.js'),
  vhod: () => import('./ekrany/vhod.js'),
};

/** Таблица маршрутов (YADRO.md §3). punkt — индекс пункта нижней навигации. */
const MARSHRUTY = {
  glavnaya:   { vid: 'ekran',   niz: true,  hinkalik: true,  palitra: null,     punkt: 0 },
  adres:      { vid: 'ekran',   niz: false, hinkalik: false, palitra: 'adres',  punkt: 2 },
  blyudo:     { vid: 'shtorka', niz: true,  hinkalik: true,  palitra: null,     punkt: null },
  korzina:    { vid: 'shtorka', niz: true,  hinkalik: true,  palitra: null,     punkt: null },
  oformlenie: { vid: 'ekran',   niz: false, hinkalik: true,  palitra: null,     punkt: null },
  perenos:    { vid: 'ekran',   niz: false, hinkalik: false, palitra: null,     punkt: null },
  poisk:      { vid: 'ekran',   niz: true,  hinkalik: true,  palitra: null,     punkt: 1 },
  gotovo:     { vid: 'ekran',   niz: false, hinkalik: false, palitra: 'gotovo', punkt: null },
  vhod:       { vid: 'shtorka', niz: true,  hinkalik: true,  palitra: null,     punkt: null },
};

// ---------------------------------------------------------------------------
// Хранилище гостя
// ---------------------------------------------------------------------------

function prochitat(klyuch) {
  try { const s = localStorage.getItem(klyuch); return s ? JSON.parse(s) : null; } catch { return null; }
}
function zapisat(klyuch, znachenie) {
  try { localStorage.setItem(klyuch, JSON.stringify(znachenie)); } catch { /* приватный режим — живём в памяти */ }
}

const gost = { zavedenieId: null, sposob: null, adres: null, smotritMenyu: false };
(() => {
  const s = prochitat(KLYUCH_GOSTYA);
  if (s && typeof s === 'object') {
    gost.zavedenieId = typeof s.zavedenieId === 'string' ? s.zavedenieId : null;
    gost.sposob = s.sposob === 'dostavka' || s.sposob === 'samovyvoz' ? s.sposob : null;
    gost.adres = s.adres && typeof s.adres === 'object' ? s.adres : null;
    gost.smotritMenyu = Boolean(s.smotritMenyu);
  } else {
    // прошлый визит мог оставить заведение только в корзине
    gost.zavedenieId = korzina.zavedenieId || null;
    gost.sposob = korzina.sposob || null;
    gost.adres = korzina.adres || null;
  }
})();

function sohranitGostya() {
  zapisat(KLYUCH_GOSTYA, gost);
  soobshchit('gost', snimokGostya());
}
function snimokGostya() {
  return { ...gost, adres: gost.adres ? { ...gost.adres } : null };
}

// Незавершённый перенос корзины (выбрали другое заведение, экран переноса открыт):
// держим выбор в sessionStorage, чтобы обновление страницы на #/perenos его не теряло молча
const KLYUCH_PERENOSA = 'hinkalnaya.perenos.v2';
function zapomnitPerenos(p) {
  try {
    if (p) sessionStorage.setItem(KLYUCH_PERENOSA, JSON.stringify({ zavedenieId: p.zavedenieId, vozvrat: p.vozvrat || '#/', bylo: p.bylo ?? null }));
    else sessionStorage.removeItem(KLYUCH_PERENOSA);
  } catch { /* хранилище закрыто — перенос живёт только в памяти */ }
}
function prochitatPerenos() {
  try {
    const p = JSON.parse(sessionStorage.getItem(KLYUCH_PERENOSA) || 'null');
    return p && typeof p.zavedenieId === 'string' ? p : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// События ядра
// ---------------------------------------------------------------------------

const slushateli = new Map();
function na(sobytie, fn) {
  if (typeof fn !== 'function') return () => {};
  if (!slushateli.has(sobytie)) slushateli.set(sobytie, new Set());
  slushateli.get(sobytie).add(fn);
  return () => slushateli.get(sobytie)?.delete(fn);
}
function soobshchit(sobytie, dannye) {
  for (const fn of [...(slushateli.get(sobytie) || [])]) {
    try { fn(dannye); } catch (oshibka) { console.error('Ядро: ошибка в подписчике', sobytie, oshibka); }
  }
}

// ---------------------------------------------------------------------------
// Элементы оболочки
// ---------------------------------------------------------------------------

const ekrany = document.getElementById('ekrany');
const sloyShtorok = document.getElementById('sloy-shtorok');
const niz = document.getElementById('niz');
const indikator = document.getElementById('niz-indikator');
const knopkaKorziny = document.getElementById('knopka-korziny');
const schet = document.getElementById('korzina-schet');
const summaKnopki = document.getElementById('korzina-summa');
const minimumKnopki = document.getElementById('korzina-minimum');
const punkty = [...niz.querySelectorAll('.niz__punkt')];

// ---------------------------------------------------------------------------
// Объект ядра (YADRO.md §2)
// ---------------------------------------------------------------------------

const yadro = {
  menyu: null,
  korzina,
  hinkalik: null,
  fon: null,
  knopkaKorziny,
  sloyShtorok,
  marshrut: null,
  perenos: null,
  PALITRY_FONA,

  get gost() { return snimokGostya(); },

  zavedenie() {
    return gost.zavedenieId && yadro.menyu ? naytiZavedenie(yadro.menyu, gost.zavedenieId) : null;
  },

  obnovitGostya(chast = {}) {
    if ('sposob' in chast) {
      gost.sposob = chast.sposob === 'dostavka' || chast.sposob === 'samovyvoz' ? chast.sposob : null;
      korzina.sposob = gost.sposob;
    }
    if ('adres' in chast) {
      gost.adres = chast.adres && typeof chast.adres === 'object' ? { ...chast.adres } : null;
      korzina.adres = gost.adres;
    }
    if ('smotritMenyu' in chast) gost.smotritMenyu = Boolean(chast.smotritMenyu);
    sohranitGostya();
    obnovitKnopkuKorziny(false);
  },

  vybratZavedenie(id, opcii = {}) {
    const vozvrat = opcii.vozvrat || '#/';
    const novoe = id ? String(id) : null;
    if (!korzina.pusta() && novoe && (novoe !== korzina.zavedenieId || novoe !== gost.zavedenieId)) {
      const rezultat = perenestiKorzinu(korzina.pozicii, novoe, yadro.menyu);
      if (!rezultat.propalo.length && !rezultat.izmenilasCena.length) {
        // ничего не пропало и цены те же — показывать нечего, переносим молча и честно
        korzina.primenitPerenos(rezultat, {}, yadro.menyu);
        postavitZavedenie(novoe);
        return 'gotovo';
      }
      yadro.perenos = { zavedenieId: novoe, rezultat, vozvrat, bylo: gost.zavedenieId };
      zapomnitPerenos(yadro.perenos);
      // istochnik — название выбранного заведения: экран переноса FLIP-ом ведёт его в подзаголовок;
      // zamenit — экран адреса заменяет свою запись, чтобы «назад» после переноса не возвращал на выбор
      yadro.perejti('#/perenos', { istochnik: opcii.istochnik || null, zamenit: Boolean(opcii.zamenit) });
      return 'perenos';
    }
    postavitZavedenie(novoe);
    return 'gotovo';
  },

  zavershitPerenos(resheniya = {}) {
    const p = yadro.perenos;
    if (!p) { zapomnitPerenos(null); yadro.nazad('#/'); return null; }
    const itog = korzina.primenitPerenos(p.rezultat, resheniya, yadro.menyu);
    yadro.perenos = null;
    zapomnitPerenos(null);
    postavitZavedenie(p.zavedenieId);
    yadro.vernutsya(p.vozvrat || '#/');
    return itog;
  },

  otmenitPerenos() {
    const p = yadro.perenos;
    yadro.perenos = null;
    zapomnitPerenos(null);
    yadro.vernutsya(p?.vozvrat || '#/');
  },

  cena(blyudo) { return cenaV(blyudo, gost.zavedenieId); },
  prichina(blyudo) {
    if (blyudo?.banket) return 'net';
    return prichinaNedostupnosti(blyudo, gost.zavedenieId);
  },
  semeystvo(razdel) {
    const imya = String(razdel?.nazvanie ?? razdel ?? '').toLowerCase();
    // DIZAYN §2.2: Напитки — своё семейство (бирюза), не «сладкое»; вина больше нет
    if (/напит|лимонад|вод[аы]\b/.test(imya)) return 'napitki';
    const s = semeystvoRazdela(razdel);
    return s === 'vino' ? 'napitki' : s;
  },
  minZakaz() {
    const z = yadro.zavedenie();
    return Number(z?.min_zakaz) > 0 ? Number(z.min_zakaz) : MIN_DOSTAVKI;
  },
  /**
   * Личная скидка гостя к сумме блюд. Работает и на самовывоз, и на доставку —
   * так её считает сервер. Минимум доставки считается от суммы блюд без скидки.
   * @returns {{procent:number, rub:number, itogo:number, podpis:string}}
   */
  skidka(summa = korzina.summa()) {
    const procent = skidkaGostya.procent > 0 ? skidkaGostya.procent : 0;
    // сервер считает так же: Math.floor(сумма * процент / 100)
    const rub = Math.floor((summa * procent) / 100);
    return { procent, rub, itogo: summa - rub, podpis: procent ? `Ваша скидка −${procent} %` : '' };
  },

  /** Вошедший гость Resto Postbot или null (телефон подтверждён кодом из СМС). */
  gostRPB() { return gostRPB(); },

  /** Выход гостя: забываем токен и личную скидку. */
  vyytiGostyu() {
    vyytiRPB();
    skidkaGostya = { procent: 0, est: false };
    soobshchit('skidka', { ...skidkaGostya });
    obnovitKnopkuKorziny(false);
  },

  /**
   * Перечитывает личную скидку гостя в выбранном заведении. Зовётся после входа и смены заведения.
   * @returns {Promise<{procent:number, est:boolean}>}
   */
  async obnovitSkidku() {
    const bylo = skidkaGostya.procent;
    try {
      skidkaGostya = await lichnayaSkidka(gost.zavedenieId);
    } catch {
      skidkaGostya = { procent: 0, est: false };
    }
    if (skidkaGostya.procent !== bylo) {
      soobshchit('skidka', { ...skidkaGostya });
      obnovitKnopkuKorziny(false);
    }
    return { ...skidkaGostya };
  },
  palitra(imya) {
    const cveta = PALITRY_FONA[imya];
    if (cveta && yadro.fon) yadro.fon.zadatCveta(cveta, 1400, PODLOZHKA);
  },

  perejti(put, opcii = {}) {
    const cel = normalizovatPut(put);
    // двойной тап: второй переход туда же, где мы уже есть, — не новая запись истории
    // (иначе «назад» пришлось бы жать дважды) и не чужой источник FLIP
    if (!opcii.zamenit && cel === normalizovatPut(location.hash || '#/')) return cep;
    const st0 = history.state && history.state.hinkalnaya ? history.state : null;
    // «К меню» с экрана «готово»: под ним — записи корзины и оформления пустого уже заказа.
    // Идём назад сквозь них (primenit пропускает), а не кладём меню поверх: иначе «назад»
    // с меню вернул бы ту же главную или пустую корзину
    if (opcii.zamenit && cel === '#/' && yadro.marshrut?.imya === 'gotovo' && korzina.pusta() && st0 && st0.glubina > 0) {
      propuskPosleZakaza = 'menyu';
      history.back();
      return cep;
    }
    peredannyyIstochnik = opcii.istochnik || null;
    // прямоугольник источника снимаем сразу: к показу нового экрана старый уже убран
    peredannyyPryamougolnik = pryamougolnik(opcii.istochnik);
    peredannyyVozvrat = opcii.vozvrat ? normalizovatPut(opcii.vozvrat) : null;
    const st = history.state && history.state.hinkalnaya ? history.state : null;
    const glubina = (st ? st.glubina : 0) || 0;
    try {
      // prezhniy — адрес записи под этой: по нему vernutsya() решает, идти назад или заменить
      if (opcii.zamenit) history.replaceState({ hinkalnaya: true, glubina, prezhniy: st?.prezhniy ?? null, n: novayaMetka() }, '', cel);
      else history.pushState({ hinkalnaya: true, glubina: glubina + 1, prezhniy: normalizovatPut(location.hash || '#/'), n: novayaMetka() }, '', cel);
    } catch {
      location.hash = cel;
      return zaplanirovat();
    }
    return zaplanirovat();
  },

  nazad(zapas = '#/') {
    if (history.state && history.state.hinkalnaya && history.state.glubina > 0) history.back();
    else yadro.perejti(zapas, { zamenit: true });
  },

  /**
   * Вернуться на put: если запись под текущей — именно он, шаг назад по истории
   * (история не пухнет, «назад» телефона не водит по кругу); иначе заменить текущую запись.
   */
  vernutsya(put = '#/') {
    const cel = normalizovatPut(put);
    const st = history.state;
    if (st && st.hinkalnaya && st.glubina > 0 && st.prezhniy === cel) history.back();
    else yadro.perejti(cel, { zamenit: true });
  },

  na,

  tost(tekstTosta, opcii = {}) {
    const klassy = [opcii.vid ? `tost--${opcii.vid}` : '', opcii.klass || ''].filter(Boolean).join(' ');
    return pokazatTost(tekstTosta, { ms: opcii.ms ?? 2200, deystvie: opcii.deystvie, klass: klassy || undefined });
  },

  skazat(tekstRepliki, opcii = {}) {
    const h = yadro.hinkalik;
    if (!h || h.spryatan || h.ubran || !tekstRepliki) return false;
    const seychas = Date.now();
    if (!opcii.srazu && seychas - poslednyayaReplika < PAUZA_REPLIK) return false;
    poslednyayaReplika = seychas;
    if (opcii.nastroenie) {
      h.nastroenie(opcii.nastroenie);
      clearTimeout(tajmerNastroeniya);
      tajmerNastroeniya = setTimeout(() => h.nastroenie('obychno'), opcii.ms ?? 3200);
    }
    h.skazat(tekstRepliki, opcii.ms ?? 3200);
    return true;
  },

  dobavitVKorzinu(blyudo, opcii = {}) {
    const poziciya = korzina.dobavit(blyudo, opcii.kolichestvo ?? 1, opcii.dobavki ?? []);
    if (!poziciya) {
      const p = korzina.pochemuNelzya(blyudo);
      yadro.tost(p === 'stop' ? 'Сегодня закончилось — посмотрите похожее' : p === 'net' ? 'В этом заведении такого нет' : 'Это не для корзины', { vid: 'oshibka' });
      vibro([30, 40, 30]);
      return null;
    }
    vibro([10, 30, 10]);
    const letet = opcii.ot && !niz.classList.contains('uehal') && !niz.hidden;
    if (letet) {
      poletIdet += 1;
      zapustitPolet(opcii.ot).then(() => {
        poletIdet = Math.max(0, poletIdet - 1);
        obnovitKnopkuKorziny(true);
      });
    } else {
      podskokKnopki();
    }
    if (yadro.hinkalik && !yadro.hinkalik.spryatan) yadro.hinkalik.pryg();
    if (!opcii.tiho) yadro.tost(`${blyudo.nazvanie} в корзине`, { vid: 'uspeh' });
    // Хинкалик подсказывает, что к этому берут (не чаще раза в 20 с)
    const sovet = kEtomuBerut(korzina.pozicii, yadro.menyu, gost.zavedenieId, 1)[0];
    if (sovet) setTimeout(() => yadro.skazat(`К этому часто берут «${sovet.nazvanie}»`, { nastroenie: 'rad' }), 700);
    return poziciya;
  },

  umenshit(klyuch) {
    const p = korzina.poziciya(klyuch);
    if (!p) return;
    if (p.kolichestvo <= 1) { yadro.ubratPoziciyu(klyuch); return; }
    korzina.izmenit(klyuch, p.kolichestvo - 1);
    vibro(6);
  },

  ubratPoziciyu(klyuch) {
    const p = korzina.poziciya(klyuch);
    if (!p) return;
    const kopiya = { ...p, dobavki: (p.dobavki || []).map((d) => ({ ...d })) };
    korzina.ubrat(klyuch);
    vibro(8);
    yadro.tost('Убрали', {
      deystvie: {
        tekst: 'Вернуть',
        naNazhatie: () => {
          const blyudo = yadro.menyu && vseBlyudaPoId().get(kopiya.blyudoId);
          if (blyudo) korzina.dobavit(blyudo, kopiya.kolichestvo, kopiya.dobavki);
        },
      },
      ms: 3600,
    });
  },

  malayaShtorka,
};

let peredannyyIstochnik = null;
let peredannyyPryamougolnik = null;
let peredannyyVozvrat = null;
let poslednyayaReplika = 0;

/** Прямоугольник источника FLIP: элемент → getBoundingClientRect (видимый), DOMRect — как есть. */
function pryamougolnik(istochnik) {
  if (!istochnik) return null;
  if (typeof istochnik.getBoundingClientRect === 'function') {
    const r = istochnik.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }
  return typeof istochnik.width === 'number' && istochnik.width > 0 ? istochnik : null;
}
let tajmerNastroeniya = null;
let poletIdet = 0;

let indeksBlyud = null;
function vseBlyudaPoId() {
  if (!indeksBlyud) {
    indeksBlyud = new Map();
    for (const r of yadro.menyu?.razdely || []) for (const b of r.blyuda || []) indeksBlyud.set(b.id, b);
  }
  return indeksBlyud;
}

function postavitZavedenie(id) {
  gost.zavedenieId = id || null;
  if (korzina.pusta() || korzina.zavedenieId === gost.zavedenieId) korzina.zavedenieId = gost.zavedenieId;
  sohranitGostya();
  obnovitKnopkuKorziny(false);
  // скидка у гостя своя в каждом заведении — спрашиваем заново, не блокируя отрисовку
  yadro.obnovitSkidku().catch(() => {});
  if (yadro.marshrut?.imya === 'glavnaya') document.title = zagolovokVkladki(yadro.marshrut);
}

// экраны и отладка в консоли разработчика
window.hinkalnaya = yadro;

// ---------------------------------------------------------------------------
// Кнопка корзины: счётчик, сумма, полоса минимума
// ---------------------------------------------------------------------------

let pokazannayaSumma = 0;

function obnovitKnopkuKorziny(animirovat) {
  const n = korzina.kolichestvo();
  const summa = korzina.summa();
  schet.hidden = n === 0;
  knopkaKorziny.classList.toggle('est-summa', summa > 0);
  if (schet.textContent !== String(n)) {
    schet.textContent = String(n);
    if (animirovat && n > 0 && !dvizhenieSnyato()) {
      schet.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
    }
  }
  const format = (v) => (v > 0 ? rub(v) : '');
  // на кнопке — к оплате, как в «Итого» корзины (со скидкой самовывоза); минимум доставки — от суммы блюд
  const kOplate = yadro.skidka(summa).itogo;
  pokazatChislo(summaKnopki, pokazannayaSumma, kOplate, animirovat ? 420 : 0, format);
  pokazannayaSumma = kOplate;
  knopkaKorziny.setAttribute('aria-label', n ? `Корзина: ${n} шт. на ${rub(kOplate)}` : 'Корзина пуста');
  const min = yadro.minZakaz();
  const nuzhenMinimum = gost.sposob === 'dostavka' && summa > 0 && summa < min;
  minimumKnopki.hidden = !nuzhenMinimum;
  if (nuzhenMinimum) minimumKnopki.firstElementChild.style.width = `${Math.round((summa / min) * 100)}%`;
}

function podskokKnopki() {
  if (dvizhenieSnyato()) return;
  knopkaKorziny.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.09)', offset: 0.35 }, { transform: 'scale(.98)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'ease-out' },
  );
}

/** Полёт в корзину: летит само блюдо (фото без фона), если оно загружено, иначе плитка. */
function zapustitPolet(ot) {
  const img = ot.tagName === 'IMG' ? ot : ot.querySelector('img.zagruzheno');
  const cel = knopkaKorziny.querySelector('.niz__korzina-ikonka') || knopkaKorziny;
  if (img && img.naturalWidth) {
    const klon = img.cloneNode(false);
    klon.removeAttribute('loading');
    klon.className = 'polet';
    const obeshchanie = poletVKorzinu(img, cel, { klon, naPrilet: () => obnovitKnopkuKorziny(true) });
    // poletVKorzinu ставит клону прямоугольную тень — у фото без фона она лишняя
    klon.style.boxShadow = 'none';
    klon.style.objectFit = 'contain';
    klon.style.filter = 'drop-shadow(0 16px 14px rgba(120, 60, 20, .35))';
    return obeshchanie;
  }
  return poletVKorzinu(ot, cel, { naPrilet: () => obnovitKnopkuKorziny(true) });
}

korzina.na('izmenilas', (sobytie) => {
  // пока блюдо летит, цифры ждут прилёта (naPrilet)
  if (poletIdet > 0 && sobytie.tip === 'dobavleno') return;
  obnovitKnopkuKorziny(true);
  if (sobytie.tip === 'izmeneno' && sobytie.pole == null && sobytie.klyuch) podskokKnopki();
});

nazhatie(knopkaKorziny, { masshtab: 0.93 });
knopkaKorziny.addEventListener('click', () => {
  if (yadro.marshrut?.imya === 'korzina') return;
  yadro.perejti('#/korzina', { istochnik: knopkaKorziny });
});

// ---------------------------------------------------------------------------
// Нижняя навигация: пункты и едущий индикатор (DIZAYN §3.10, код Б)
// ---------------------------------------------------------------------------

let tekushchiyPunkt = 0;
punkty.forEach((p) => nazhatie(p, { masshtab: 0.9 }));

function vybratPunkt(indeks, animirovat = true) {
  if (indeks == null) return;
  punkty.forEach((p, i) => {
    p.classList.toggle('aktiven', i === indeks);
    if (i === indeks) p.setAttribute('aria-current', 'page'); else p.removeAttribute('aria-current');
  });
  const ot = tekushchiyPunkt;
  tekushchiyPunkt = indeks;
  indikator.style.transform = `translateX(${indeks * 100}%)`;
  if (!animirovat || ot === indeks || dvizhenieSnyato()) return;
  const napr = indeks > ot ? 1 : -1;
  indikator.animate([
    { transform: `translateX(${ot * 100}%) scale(1, 1)` },
    { transform: `translateX(${(ot + (indeks - ot) * 0.5) * 100}%) scale(1.22, .84)`, offset: 0.4 },
    { transform: `translateX(${indeks * 100}%) scale(1, 1)` },
  ], { duration: pruzhina.obychnaya.ms + 120, easing: pruzhina.obychnaya.easing });
  indikator.animate([{ rotate: '0deg' }, { rotate: `${napr * 6}deg`, offset: 0.35 }, { rotate: '0deg' }],
    { duration: 700, easing: pruzhina.zhivaya.easing, composite: 'add' });
}

// Двойной тап сквозь шторку: первый тап («В корзину», затемнение) закрывает её, второй
// через 100–200 мс попадает в экран под ней — в чужой «+» или карточку. Касания экрана
// сразу после касания шторки глушим (капчур, до всех обработчиков).
const TISHINA_POSLE_SHTORKI = 450;
let klikVShtorke = -Infinity;
document.addEventListener('click', (s) => {
  const t = s.target;
  if (!(t instanceof Node)) return;
  if (sloyShtorok.contains(t)) { klikVShtorke = performance.now(); return; }
  if (performance.now() - klikVShtorke < TISHINA_POSLE_SHTORKI && (ekrany.contains(t) || niz.contains(t))) {
    s.preventDefault();
    s.stopImmediatePropagation();
  }
}, true);

// Все внутренние ссылки '#/…' идут через ядро: так «назад» знает глубину истории
document.addEventListener('click', (s) => {
  if (s.defaultPrevented || s.button !== 0 || s.metaKey || s.ctrlKey || s.shiftKey || s.altKey) return;
  const a = s.target.closest && s.target.closest('a[href^="#/"]');
  if (!a) return;
  s.preventDefault();
  const put = a.getAttribute('href');
  if (normalizovatPut(put) === primenennyyPut) {
    // повторный тап по «Меню» на главной — наверх
    if (put === '#/' && yadro.marshrut?.imya === 'glavnaya') window.scrollTo({ top: 0, behavior: dvizhenieSnyato() ? 'auto' : 'smooth' });
    return;
  }
  // «Меню» с поиска: если под нами главная — шаг назад, а не новая запись (история не пухнет)
  if (normalizovatPut(put) === '#/') yadro.vernutsya('#/');
  else yadro.perejti(put);
});

// ---------------------------------------------------------------------------
// Служебная шторка ядра (голос, способ получения) — «назад» телефона её закрывает
// ---------------------------------------------------------------------------

let otkrytayaMalaya = null;

/**
 * Маленькая шторка поверх всего: заголовок, текст, кнопки.
 * @param {{zagolovok:string, tekst?:string, geroy?:string, knopki?:{tekst:string, klass?:string, znak?:string, naNazhatie?:()=>void}[]}} o
 * @returns {Promise<void>} когда закрыта
 */
function malayaShtorka(o = {}) {
  if (otkrytayaMalaya) otkrytayaMalaya.zakryt('kod');
  const el = document.createElement('div');
  el.className = 'shtorka shtorka--malaya';
  el.setAttribute('aria-label', o.zagolovok || '');
  el.innerHTML = `
    <div class="shtorka__ruchka" data-ruchka></div>
    <div class="shtorka__telo">
      ${o.geroy ? `<div class="shtorka__geroy">${o.geroy}</div>` : ''}
      <h2>${tekst(o.zagolovok || '')}</h2>
      ${o.tekst ? `<p>${tekst(o.tekst)}</p>` : ''}
      <div class="knopki"></div>
    </div>`;
  const mestoKnopok = el.querySelector('.knopki');
  sloyShtorok.appendChild(el);
  let upr = null;
  const gotovo = new Promise((razreshit) => {
    upr = shtorka(el, { cvetFona: 'rgba(60, 25, 10, .28)',
      naZakrytie: (prichina) => {
        if (otkrytayaMalaya === upr) otkrytayaMalaya = null;
        if (!tekushchayaShtorka && !otkrytayaMalaya) document.body.classList.remove('est-shtorka');
        upr.unichtozhit();
        upr.fon?.remove();
        el.remove();
        if (prichina !== 'kod' && prichina !== 'popstate' && history.state && history.state.hinkalnayaShtorka) history.back();
        razreshit();
      },
    });
  });
  (o.knopki || []).forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `knopka ${k.klass || 'knopka--glavnaya'}`;
    b.innerHTML = `${k.znak ? `<svg width="22" height="22" aria-hidden="true"><use href="${k.znak}"/></svg>` : ''}<span>${tekst(k.tekst)}</span>`;
    nazhatie(b, { masshtab: 0.95 });
    b.addEventListener('click', () => {
      try { k.naNazhatie?.(); } finally { upr.zakryt('knopka'); }
    });
    mestoKnopok.appendChild(b);
  });
  otkrytayaMalaya = upr;
  document.body.classList.add('est-shtorka');
  try { history.pushState({ ...(history.state || {}), hinkalnayaShtorka: true, n: novayaMetka() }, '', location.hash || '#/'); } catch { /* без истории — закроется жестом */ }
  upr.otkryt();
  // открыли по pointerup (тап по Хинкалику) — следующий за ним click не должен попасть в затемнение и закрыть шторку
  if (upr.fon) {
    upr.fon.style.pointerEvents = 'none';
    setTimeout(() => { if (upr.otkryta && upr.fon) upr.fon.style.pointerEvents = 'auto'; }, 400);
  }
  return gotovo;
}

function shtorkaGolosa() {
  const uzhe = prochitat(KLYUCH_GOLOS);
  // статичный герой несёт класс hinkalik__svg (width/height 100 % из стилей Хинкалика):
  // размер пишем прямо в style, иначе он растягивается на всю шторку и закрывает текст
  const geroy = svgHinkalika({ nastroenie: 'rad', razmer: 110 })
    .replace('<svg ', '<svg style="width:110px;height:117px;flex:none" ');
  malayaShtorka({
    geroy,
    zagolovok: 'Скоро закажете голосом',
    tekst: uzhe ? 'Вы уже в списке — позовём первым, как только Хинкалик научится.' : 'Скажете Хинкалику «два хинкали и лимонад» — он соберёт корзину сам.',
    knopki: uzhe ? [{ tekst: 'Хорошо', klass: 'knopka--steklo' }] : [{
      tekst: 'Хочу первым',
      naNazhatie: () => { zapisat(KLYUCH_GOLOS, { kogda: Date.now() }); yadro.tost('Записали — позовём первым', { vid: 'uspeh' }); },
    }],
  });
}

// ---------------------------------------------------------------------------
// Маршрутизация
// ---------------------------------------------------------------------------

let primenennyyPut = null;
let poslednyayaGlubina = 0;   // глубина записи истории последнего применённого экрана
let tekushchiyEkran = null;      // { imya, section, modul }
let glavnayaEkran = null;        // главная живёт всегда
let tekushchayaShtorka = null;   // { imya, kontejner, ubrat }
let prokrutkaGlavnoy = 0;
let skrytMarshrutom = false;
let cep = Promise.resolve();
const moduli = new Map();
/** Записи истории, которые после оформленного заказа (корзина пуста) проходим насквозь. */
const PROPUSK_POSLE_ZAKAZA = new Set(['korzina', 'oformlenie']);
let propuskPosleZakaza = false;
// метка записи, с которой уже ушли history.back(): popstate и hashchange зовут primenit дважды — второй раз назад не идём
let nazadUshlo = null;
/** Метка записи истории: у наших записей своя (n), иначе — путь. Подряд могут стоять две записи с одним путём
 *  (корзина → оформление → корзина), поэтому сравнивать только путь нельзя. */
const novayaMetka = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const metkaZapisi = (put) => (history.state && history.state.n) || put;

function normalizovatPut(put) {
  let p = String(put || '').trim();
  if (!p.startsWith('#')) p = `#${p}`;
  if (!p.startsWith('#/')) p = `#/${p.slice(1)}`;
  return p === '#' ? '#/' : p;
}

function razobrat(hash) {
  const put = normalizovatPut(hash || '#/');
  const chasti = put.slice(2).split('/').filter(Boolean);
  const imya = chasti[0] || 'glavnaya';
  if (!MARSHRUTY[imya] || imya === 'glavnaya' && chasti.length) return { imya: 'glavnaya', id: null, nomer: null, put: '#/' };
  return {
    imya,
    id: imya === 'blyudo' ? decodeURIComponent(chasti[1] || '') : null,
    nomer: imya === 'gotovo' ? decodeURIComponent(chasti[1] || '') : null,
    put: imya === 'glavnaya' ? '#/' : put,
  };
}

function zagruzitModul(imya) {
  if (!moduli.has(imya)) {
    const z = ZAGRUZCHIKI[imya];
    // модуль не пришёл (нет сети и нет в кеше) — честный экран «не загрузился»;
    // запись из карты убираем, чтобы следующий заход попробовал снова
    const obeshchanie = (z ? z() : Promise.reject(new Error('нет экрана')))
      .catch((oshibka) => {
        console.warn('Ядро: экран не загрузился', imya, oshibka);
        moduli.delete(imya);
        return { neZagruzilsya: true };
      });
    moduli.set(imya, obeshchanie);
  }
  return moduli.get(imya);
}

function zaplanirovat() {
  cep = cep.then(primenit).catch((oshibka) => console.error('Ядро: переход не удался', oshibka));
  return cep;
}

async function primenit() {
  const m = razobrat(location.hash);
  // переданное perejti() забираем и сбрасываем всегда — даже если путь тот же и показывать нечего,
  // иначе следующий переход получил бы чужой источник FLIP и чужой возврат
  const istochnik = peredannyyIstochnik;
  const istochnikRect = peredannyyPryamougolnik;
  const vozvrat = peredannyyVozvrat;
  peredannyyIstochnik = null;
  peredannyyPryamougolnik = null;
  peredannyyVozvrat = null;
  if (m.put === primenennyyPut) return;
  // с этой записи уже ушли назад (проход сквозь корзину после заказа), а второе событие
  // о ней (hashchange вслед за popstate) пришло раньше, чем история сдвинулась
  if (nazadUshlo !== null && metkaZapisi(m.put) === nazadUshlo) return;
  nazadUshlo = null;
  const ot = yadro.marshrut?.imya ?? null;
  // Заказ оформлен, корзина пуста: «назад» с экрана «готово» (и «К меню» оттуда) не должен
  // показывать пустую корзину и оформление — проходим их записи насквозь до меню.
  const st = history.state && history.state.hinkalnaya ? history.state : null;
  if ((ot === 'gotovo' || propuskPosleZakaza) && PROPUSK_POSLE_ZAKAZA.has(m.imya) && korzina.pusta()) {
    if (st && st.glubina > 0) { propuskPosleZakaza = propuskPosleZakaza || 'nazad'; nazadUshlo = metkaZapisi(m.put); history.back(); return; }
    // ниже записей нет (заход по ссылке) — эту запись заменяем меню
    propuskPosleZakaza = false;
    try { history.replaceState({ hinkalnaya: true, glubina: 0, prezhniy: null }, '', '#/'); } catch { /* без истории — просто покажем меню */ }
    return primenit();
  }
  // «К меню» с готово дошло до чужой записи (шторка блюда и т. п.) — гость просил меню: меняем её на меню
  if (propuskPosleZakaza === 'menyu' && m.imya !== 'glavnaya') {
    propuskPosleZakaza = false;
    try { history.replaceState({ hinkalnaya: true, glubina: st?.glubina || 0, prezhniy: st?.prezhniy ?? null }, '', '#/'); } catch { /* покажем что есть */ }
    return primenit();
  }
  propuskPosleZakaza = false;
  // запись без нашей метки (переход по ссылке-якорю, ручная правка адреса): метим её, иначе
  // «назад» и «К меню» с готово не знали бы, что под ней есть ещё записи витрины
  if (history.state == null) {
    try {
      history.replaceState(primenennyyPut == null
        ? { hinkalnaya: true, glubina: 0, prezhniy: null, n: novayaMetka() }
        : { hinkalnaya: true, glubina: poslednyayaGlubina + 1, prezhniy: primenennyyPut, n: novayaMetka() }, '', location.hash || '#/');
    } catch { /* без истории — живём как есть */ }
  }
  poslednyayaGlubina = history.state?.hinkalnaya ? (history.state.glubina || 0) : 0;
  primenennyyPut = m.put;
  // ушли с переноса не через «Продолжить»/«назад» экрана (системная «назад», ссылка) — перенос забыт
  if (ot === 'perenos' && m.imya !== 'perenos') { yadro.perenos = null; zapomnitPerenos(null); }
  const parametry = { id: m.id, nomer: m.nomer, put: m.put, ot, istochnik, istochnikRect, vozvrat };
  // Хинкалик экрана адреса (120 px) перелетает в плавающего (80 px) — DIZAYN §4.5
  let otkudaHinkalik = null;
  if (ot === 'adres' && m.imya === 'glavnaya') {
    const telo = document.querySelector('.ekran--adres .adres__hinkalik .hinkalik__telo');
    const r = telo?.getBoundingClientRect();
    if (r && r.width > 0) { otkudaHinkalik = r; telo.style.visibility = 'hidden'; }
  }
  const modul = await zagruzitModul(m.imya);
  const nastroyki = { ...MARSHRUTY[m.imya], ...(modul && typeof modul.nastroyki === 'object' ? modul.nastroyki : {}) };
  yadro.marshrut = { imya: m.imya, id: m.id, nomer: m.nomer, put: m.put };
  primenitNastroyki(nastroyki, otkudaHinkalik);
  if (nastroyki.vid === 'shtorka') await pokazatShtorkuMarshruta(m.imya, modul, parametry);
  else await pokazatEkran(m.imya, modul, parametry);
  document.title = zagolovokVkladki(m);
  // шторка держит фокус сама (dvizhenie.shtorka); экрану фокус переносит ядро — на его заголовок
  if (ot !== null && nastroyki.vid !== 'shtorka') perenestiFokusNaEkran();
  soobshchit('marshrut', { ...yadro.marshrut, ot });
}

/** Заголовок вкладки и истории браузера: «Что на экране · Хинкальная». */
function zagolovokVkladki(m) {
  let chto = '';
  if (m.imya === 'glavnaya') chto = yadro.zavedenie() ? `Меню — ${yadro.zavedenie().nazvanie}` : 'Меню';
  else if (m.imya === 'blyudo') chto = (m.id && naytiBlyudo(yadro.menyu, m.id)?.nazvanie) || NAZVANIYA_EKRANOV.blyudo;
  else if (m.imya === 'gotovo' && m.nomer) chto = `Заказ ${m.nomer}`;
  else chto = NAZVANIYA_EKRANOV[m.imya] || '';
  return chto ? `${chto} · Хинкальная` : 'Хинкальная';
}

/**
 * Смена экрана для читалки и клавиатуры: фокус — на заголовок нового экрана
 * (если экран сам не поставил его в поле ввода). Заголовок получает tabindex=-1.
 */
function perenestiFokusNaEkran() {
  const section = tekushchiyEkran?.section;
  if (!section || !section.isConnected) return;
  const a = document.activeElement;
  if (a && a !== document.body && (section.contains(a) || sloyShtorok.contains(a))) return;
  const zagolovok = section.querySelector('h1') || section.querySelector('h2');
  if (!zagolovok) return;
  if (!zagolovok.hasAttribute('tabindex')) {
    zagolovok.setAttribute('tabindex', '-1');
    zagolovok.style.outline = 'none';
  }
  try { zagolovok.focus({ preventScroll: true }); } catch { /* фокус не критичен */ }
}

function primenitNastroyki(n, otkudaHinkalik = null) {
  niz.hidden = false;
  niz.classList.toggle('uehal', !n.niz);
  const h = yadro.hinkalik;
  if (h) {
    if (!n.hinkalik) {
      if (!h.spryatan && !h.ubran) { h.spryatat(true); skrytMarshrutom = true; }
    } else if (skrytMarshrutom) {
      if (otkudaHinkalik && !dvizhenieSnyato()) priletHinkalika(h, otkudaHinkalik);
      else h.pokazat();
      skrytMarshrutom = false;
    }
  }
  if (n.palitra) yadro.palitra(n.palitra);
  if (n.punkt != null) vybratPunkt(n.punkt, true);
}

/** FLIP плавающего Хинкалика из прямоугольника r (герой экрана адреса) в его угол. */
function priletHinkalika(h, r) {
  const el = h.el;
  el.style.transition = 'none';
  h.pokazat();
  const cel = h.telo.getBoundingClientRect();
  if (!cel.width) { el.style.transition = ''; return; }
  const m = r.width / cel.width;
  const dx = r.left + r.width / 2 - (cel.left + cel.width / 2);
  const dy = r.top + r.height / 2 - (cel.top + cel.height / 2);
  const a = el.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${m})` }, { transform: 'translate(0, 0) scale(1)' }],
    { duration: pruzhina.obychnaya.ms || 620, easing: pruzhina.obychnaya.easing },
  );
  const konec = () => { el.style.transition = ''; };
  a.finished.then(konec, konec);
}

async function zakrytShtorkuMarshruta() {
  const t = tekushchayaShtorka;
  if (!t) return;
  tekushchayaShtorka = null;
  ekrany.classList.remove('pod-shtorkoy');
  if (!otkrytayaMalaya) document.body.classList.remove('est-shtorka');
  try { await t.ubrat(); } catch (oshibka) { console.error('Ядро: шторка не закрылась', oshibka); }
  t.kontejner.remove();
}

async function pokazatShtorkuMarshruta(imya, modul, parametry) {
  // под шторкой всегда экран; при первом заходе по ссылке на блюдо — главная
  if (!tekushchiyEkran) {
    const glavnaya = await zagruzitModul('glavnaya');
    await pokazatEkran('glavnaya', glavnaya, { ...parametry, id: null, istochnik: null, put: '#/' }, true);
    vybratPunkt(0, false);
  }
  await zakrytShtorkuMarshruta();
  const kontejner = document.createElement('div');
  kontejner.className = `sloy-ekrana sloy-ekrana--${imya}`;
  sloyShtorok.appendChild(kontejner);
  ekrany.style.setProperty('--pod-shtorkoy-y', `${Math.round(window.scrollY + window.innerHeight / 2)}px`);
  ekrany.classList.add('pod-shtorkoy');
  document.body.classList.add('est-shtorka');
  if (modul.neZagruzilsya) {
    const upr = oshibkaShtorkoy(kontejner, imya);
    tekushchayaShtorka = { imya, kontejner, ubrat: () => upr.zakryt('kod') };
    return;
  }
  tekushchayaShtorka = { imya, kontejner, ubrat: () => modul.ubrat?.() };
  await modul.pokazat(kontejner, yadro, parametry);
}

async function uvestiEkran(e) {
  if (e.imya === 'glavnaya') {
    prokrutkaGlavnoy = window.scrollY;
    try { e.modul.pauza?.(); } catch (oshibka) { console.error(oshibka); }
  } else {
    try { await e.modul.ubrat?.(); } catch (oshibka) { console.error('Ядро: экран не убрался', oshibka); }
  }
  if (!dvizhenieSnyato() && e.section.animate) {
    const a = e.section.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    await a.finished.catch(() => {});
    if (e.imya === 'glavnaya') e.section.classList.add('skryt');
    a.cancel();
  } else if (e.imya === 'glavnaya') e.section.classList.add('skryt');
  if (e.imya !== 'glavnaya') e.section.remove();
}

function prokrutitNa(y) {
  try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch { window.scrollTo(0, y); }
}

async function pokazatEkran(imya, modul, parametry, bezAnimacii = false) {
  await zakrytShtorkuMarshruta();
  const staryy = tekushchiyEkran;
  if (staryy && staryy.imya === imya && imya === 'glavnaya') return;
  if (staryy) await uvestiEkran(staryy);

  if (imya === 'glavnaya' && glavnayaEkran) {
    const s = glavnayaEkran.section;
    s.classList.remove('skryt');
    prokrutitNa(prokrutkaGlavnoy);
    tekushchiyEkran = glavnayaEkran;
    try { glavnayaEkran.modul.prodolzhit?.(parametry); } catch (oshibka) { console.error(oshibka); }
    if (!dvizhenieSnyato()) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    return;
  }

  const section = document.createElement('section');
  section.className = `ekran ekran--${imya}`;
  section.dataset.ekran = imya;
  ekrany.appendChild(section);
  prokrutitNa(0);
  const zapis = { imya, section, modul };
  tekushchiyEkran = zapis;
  if (imya === 'glavnaya') glavnayaEkran = zapis;
  if (modul.neZagruzilsya) oshibkaEkrana(section, imya);
  else await modul.pokazat(section, yadro, parametry);
  // ориентир «основное содержимое» для читалки — весь экран (у главной тоже: h1, шапка и баннер внутри ориентира)
  if (!section.querySelector('main')) section.setAttribute('role', 'main');
  // у экрана нет своего h1 (поиск) — даём скрытый заголовок по названию экрана
  if (!section.querySelector('h1') && NAZVANIYA_EKRANOV[imya]) {
    const h1 = document.createElement('h1');
    h1.className = 'skryto-vizualno';
    h1.textContent = imya === 'poisk' ? 'Поиск по меню' : NAZVANIYA_EKRANOV[imya];
    section.prepend(h1);
  }
  if (!bezAnimacii && !dvizhenieSnyato() && imya !== 'glavnaya') {
    section.animate(
      [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 420, easing: pruzhina.myagkaya.easing },
    );
  }
}

const NAZVANIYA_EKRANOV = {
  adres: 'Выбор заведения', korzina: 'Корзина', oformlenie: 'Оформление', perenos: 'Переносим заказ', poisk: 'Поиск', gotovo: 'Заказ принят', blyudo: 'Блюдо', vhod: 'Вход',
};

const TEKST_OSHIBKI = 'Не загрузилось — похоже, пропала сеть. Меню работает, а это откроется, как только она появится.';

/** Кнопка «Попробовать ещё раз»: сбрасывает применённый путь и показывает маршрут заново. */
function knopkaPovtora(koren) {
  koren.querySelector('[data-povtor]')?.addEventListener('click', () => { primenennyyPut = null; zaplanirovat(); });
}

function oshibkaEkrana(section, imya) {
  section.innerHTML = `<div class="zaglushka-ekrana"><b>${tekst(NAZVANIYA_EKRANOV[imya] || 'Экран')}</b><p>${TEKST_OSHIBKI}</p><button type="button" class="knopka knopka--glavnaya" data-povtor style="width:auto">Попробовать ещё раз</button><a class="knopka knopka--steklo" href="#/">К меню</a></div>`;
  knopkaPovtora(section);
}

function oshibkaShtorkoy(kontejner, imya) {
  const el = document.createElement('div');
  el.className = 'shtorka shtorka--malaya';
  el.innerHTML = `<div class="shtorka__ruchka" data-ruchka></div><div class="shtorka__telo"><div class="zaglushka-ekrana"><b>${tekst(NAZVANIYA_EKRANOV[imya] || 'Экран')}</b><p>${TEKST_OSHIBKI}</p><button type="button" class="knopka knopka--glavnaya" data-povtor style="width:auto">Попробовать ещё раз</button></div></div>`;
  kontejner.appendChild(el);
  knopkaPovtora(el);
  const upr = shtorka(el, { cvetFona: 'rgba(60, 25, 10, .28)', naZakrytie: (prichina) => { upr.fon?.remove(); if (prichina !== 'kod') yadro.nazad('#/'); } });
  upr.otkryt();
  return upr;
}

/**
 * Ссылка «К навигации» — первая по Tab: нижняя навигация в разметке идёт после
 * всего меню (сотни карточек), без ссылки до неё с клавиатуры не добраться.
 * Видна только в фокусе.
 */
function sdelatPropusk() {
  if (document.querySelector('.propusk')) return;
  const a = document.createElement('a');
  a.href = '#niz';
  a.className = 'propusk skryto-vizualno';
  a.textContent = 'К навигации';
  const vid = 'position:fixed;top:8px;left:8px;z-index:200;padding:10px 16px;border-radius:14px;background:#fff;color:#231A14;font-weight:600;box-shadow:0 8px 24px rgba(120,60,20,.25)';
  a.addEventListener('focus', () => { a.classList.remove('skryto-vizualno'); a.style.cssText = vid; });
  a.addEventListener('blur', () => { a.style.cssText = ''; a.classList.add('skryto-vizualno'); });
  a.addEventListener('click', (s) => {
    s.preventDefault();
    const cel = niz.classList.contains('uehal') ? null : niz.querySelector('.niz__punkt.aktiven') || niz.querySelector('.niz__punkt');
    if (cel) cel.focus();
  });
  document.body.prepend(a);
}

function naIstoriyu() {
  // служебная шторка ядра лежит на своей записи истории: «назад» закрывает её
  if (otkrytayaMalaya && normalizovatPut(location.hash) === primenennyyPut) {
    const u = otkrytayaMalaya;
    otkrytayaMalaya = null;
    u.zakryt('popstate');
    return;
  }
  zaplanirovat();
}
window.addEventListener('popstate', naIstoriyu);
window.addEventListener('hashchange', () => zaplanirovat());

// ---------------------------------------------------------------------------
// Сеть
// ---------------------------------------------------------------------------

window.addEventListener('offline', () => yadro.tost('Нет сети. Меню открыто из памяти — смотреть и собирать корзину можно', { ms: 3600 }));
window.addEventListener('online', () => yadro.tost('Сеть вернулась', { vid: 'uspeh' }));

function zaregistrirovatSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* без оффлайна витрина тоже работает */ });
  });
}

// ---------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------

/** Тупик 8: в корзине блюдо, которого теперь нет, или цена устарела → экран переноса. */
function proveritKorzinuPriZapuske() {
  if (korzina.pusta()) return false;
  const rezultat = perenestiKorzinu(korzina.pozicii, gost.zavedenieId, yadro.menyu);
  const sdvig = gost.zavedenieId !== korzina.zavedenieId;
  if (!rezultat.propalo.length && !rezultat.izmenilasCena.length) {
    if (sdvig) korzina.primenitPerenos(rezultat, {}, yadro.menyu);
    return false;
  }
  yadro.perenos = { zavedenieId: gost.zavedenieId, rezultat, vozvrat: '#/', bylo: korzina.zavedenieId, priZapuske: true };
  return true;
}

/** Перенос, начатый до обновления страницы: пересчитать по нынешней корзине и показать снова. */
function vosstanovitPerenos() {
  const s = prochitatPerenos();
  if (!s || korzina.pusta() || !naytiZavedenie(yadro.menyu, s.zavedenieId)) return false;
  const rezultat = perenestiKorzinu(korzina.pozicii, s.zavedenieId, yadro.menyu);
  if (!rezultat.propalo.length && !rezultat.izmenilasCena.length) {
    // показывать нечего — доводим выбор до конца молча, как vybratZavedenie
    korzina.primenitPerenos(rezultat, {}, yadro.menyu);
    postavitZavedenie(s.zavedenieId);
    return false;
  }
  yadro.perenos = { zavedenieId: s.zavedenieId, rezultat, vozvrat: s.vozvrat || '#/', bylo: s.bylo ?? gost.zavedenieId };
  return true;
}

/**
 * Меню из живой системы Resto Postbot; если API не ответило — снимок menyu.json рядом с витриной,
 * чтобы гость с плохой сетью всё равно увидел блюда (цены могли устареть, заказ в таком режиме
 * не уйдёт: сервер недоступен).
 * @returns {Promise<object>}
 */
async function zagruzitMenyuZhivoe() {
  try {
    const menyu = podgotovitMenyu(await sobratMenyu());
    if (!menyu.razdely?.length) throw new Error('RPB отдал меню без разделов');
    return menyu;
  } catch (oshibka) {
    console.warn('Меню из Resto Postbot не пришло, берём снимок menyu.json', oshibka);
    const snimok = await zagruzitMenyu();
    snimok.snimok = true;
    return snimok;
  }
}

async function zapustit() {
  const volna = document.getElementById('zagruzka-volna');
  let ostanovitVolnu = null;
  try { ostanovitVolnu = volnaZagruzki(volna); } catch { /* без волны — просто текст */ }

  // Живой фон — сразу, пока грузится меню
  const holst = document.getElementById('fon');
  try {
    yadro.fon = new FonGradient(holst, { cveta: PALITRY_FONA.testo.slice(0, 5), fon: PODLOZHKA, stil: false, delitel: 6 });
  } catch (oshibka) { console.error('Фон не запустился', oshibka); }

  try {
    // сторис грузим параллельно с меню: к показу главной баннер «Акция дня» и кружки
    // уже в кеше и встают на место сразу, а не сдвигают разделы на глазах у гостя
    const istorii = import('./istorii.js').then((m) => m.zagruzitIstorii()).catch(() => []);
    const menyu = await zagruzitMenyuZhivoe();
    // 200 OK, но не меню (чужой JSON с CDN) — это та же «не загрузилось», с повтором
    if (!menyu || !Array.isArray(menyu.zavedeniya) || !Array.isArray(menyu.razdely) || !menyu.razdely.length) {
      throw new Error('menyu.json без заведений или разделов');
    }
    yadro.menyu = menyu;
    // гость мог войти в прошлый раз — личную скидку спрашиваем сразу, но экран ею не держим
    yadro.obnovitSkidku().catch(() => {});
    // долго ждать сторис не будем: не пришли за 0,8 с после меню — главная нарисует их позже
    await Promise.race([istorii, new Promise((r) => { setTimeout(r, 800); })]);
  } catch (oshibka) {
    console.warn('Ядро: меню не загрузилось', oshibka);
    if (typeof ostanovitVolnu === 'function') ostanovitVolnu();
    const z = document.getElementById('zagruzka');
    z.classList.add('zagruzka--oshibka');
    z.querySelector('.zagruzka__tekst').textContent = 'Меню не загрузилось — похоже, нет сети. Как только она появится, всё откроется.';
    const b = document.createElement('button');
    b.className = 'knopka knopka--glavnaya';
    b.style.width = 'auto';
    b.textContent = 'Попробовать ещё раз';
    b.addEventListener('click', () => location.reload());
    z.appendChild(b);
    return;
  }

  // заведения, которого больше нет в меню, у гостя быть не должно
  if (gost.zavedenieId && !naytiZavedenie(yadro.menyu, gost.zavedenieId)) { gost.zavedenieId = null; sohranitGostya(); }
  if (korzina.pusta() && korzina.zavedenieId !== gost.zavedenieId) korzina.zavedenieId = gost.zavedenieId;

  sdelatPropusk();

  // Хинкалик — один на всю витрину
  try {
    yadro.hinkalik = new Hinkalik(document.body, { razmer: 80, plavayushchiy: true });
    yadro.hinkalik.naNazhatie(() => shtorkaGolosa());
  } catch (oshibka) { console.error('Хинкалик не появился', oshibka); }

  if (typeof ostanovitVolnu === 'function') ostanovitVolnu();
  document.getElementById('zagruzka')?.remove();

  obnovitKnopkuKorziny(false);
  // Первый заход: заведение не выбрано и гость не просил «сначала меню» → экран адреса
  const nachalo = razobrat(location.hash);
  // обновили страницу посреди переноса — возобновляем его, а не теряем выбор заведения молча
  const nuzhenPerenos = proveritKorzinuPriZapuske() || (nachalo.imya === 'perenos' && vosstanovitPerenos());
  if (!nuzhenPerenos) zapomnitPerenos(null);
  const glubina = 0;
  if (nuzhenPerenos) {
    history.replaceState({ hinkalnaya: true, glubina }, '', '#/');
    await zaplanirovat();
    yadro.perejti('#/perenos');
  } else if (nachalo.imya === 'glavnaya' && !gost.zavedenieId && !gost.smotritMenyu) {
    history.replaceState({ hinkalnaya: true, glubina }, '', '#/adres');
    await zaplanirovat();
  } else {
    history.replaceState({ hinkalnaya: true, glubina }, '', nachalo.put);
    await zaplanirovat();
  }

  // Приветствие на главной
  if (yadro.marshrut?.imya === 'glavnaya') {
    setTimeout(() => {
      const z = yadro.zavedenie();
      yadro.skazat(z ? 'Начнём с хинкали?' : 'Выберите заведение — покажу цены там', { srazu: true, nastroenie: 'rad' });
    }, 1400);
  }
}

zaregistrirovatSW();
zapustit();
