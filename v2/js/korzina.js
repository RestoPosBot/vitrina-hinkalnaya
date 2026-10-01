// Витрина Хинкальной v2 — корзина.
// Состояние в localStorage (ключ 'hinkalnaya.korzina.v2'), события об изменениях,
// объединение одинаковых позиций, перенос между заведениями, «прошлый заказ».
// Чистый ES-модуль; в node для тестов достаточно заглушки globalThis.localStorage.

import { cenaV, naytiBlyudo, prichinaNedostupnosti } from './dannye.js';

/** Ключ корзины в localStorage (по брифу §5). */
export const KLYUCH_KORZINY = 'hinkalnaya.korzina.v2';
/** Ключ «прошлого заказа» — отдельный, чтобы очистка корзины его не трогала. */
export const KLYUCH_PROSHLOGO_ZAKAZA = 'hinkalnaya.proshlyy_zakaz.v2';
/** Ключ счётчика номеров заказов (демо: заказ никуда не уходит, номер нужен для экрана «Готово»). */
export const KLYUCH_NOMERA_ZAKAZA = 'hinkalnaya.nomer_zakaza.v2';
/** Больше этого в одной позиции не даём — защита от залипшего «+». */
export const MAKS_KOLICHESTVO = 99;

const SPOSOBY = new Set(['samovyvoz', 'dostavka']);

// ---------------------------------------------------------------------------
// Хранилище (localStorage может быть недоступен: приватный режим Safari, node без заглушки)
// ---------------------------------------------------------------------------

function hranilishche() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function prochitatIzHranilishcha(klyuch) {
  try {
    const s = hranilishche()?.getItem(klyuch);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function zapisatVHranilishche(klyuch, znachenie) {
  try {
    const h = hranilishche();
    if (!h) return false;
    if (znachenie === null || znachenie === undefined) h.removeItem(klyuch);
    else h.setItem(klyuch, JSON.stringify(znachenie));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Позиции
// ---------------------------------------------------------------------------

/**
 * Ключ позиции: блюдо + набор добавок. Одинаковые блюда с одинаковыми добавками
 * складываются в одну позицию, с разными добавками — живут отдельно.
 * @param {string} blyudoId
 * @param {{id: string}[]|string[]} [dobavki]
 * @returns {string}
 */
export function klyuchPozicii(blyudoId, dobavki = []) {
  const ids = (dobavki || []).map((d) => (typeof d === 'string' ? d : d?.id)).filter(Boolean).sort();
  return ids.length ? `${blyudoId}|${ids.join(',')}` : String(blyudoId);
}

/**
 * Стоимость одной позиции: (цена блюда + добавки) × количество.
 * @param {object} poziciya
 * @returns {number}
 */
export function summaPozicii(poziciya) {
  const dobavki = (poziciya.dobavki || []).reduce((s, d) => s + (Number(d.cena) || 0), 0);
  return ((Number(poziciya.cena) || 0) + dobavki) * (Number(poziciya.kolichestvo) || 0);
}

function celoeKolichestvo(kolichestvo, poUmolchaniyu = 1) {
  const n = Math.round(Number(kolichestvo));
  if (!Number.isFinite(n)) return poUmolchaniyu;
  return Math.max(0, Math.min(MAKS_KOLICHESTVO, n));
}

/**
 * Приводит выбранные добавки к виду [{id, nazvanie, cena}], сверяя со списком добавок блюда.
 * Принимает id строками или объекты. Неизвестные блюду добавки отбрасываются;
 * если у блюда списка добавок нет — берутся объекты как есть.
 */
function normalizovatDobavki(blyudo, vybrano) {
  const spisok = Array.isArray(blyudo?.dobavki) ? blyudo.dobavki : null;
  const itog = [];
  const vzyato = new Set();
  for (const v of vybrano || []) {
    const id = typeof v === 'string' ? v : v?.id;
    if (!id || vzyato.has(id)) continue;
    let d = spisok ? spisok.find((x) => x.id === id) : null;
    if (!d && !spisok && typeof v === 'object') d = v;
    if (!d) continue;
    vzyato.add(id);
    itog.push({ id: d.id, nazvanie: String(d.nazvanie ?? ''), cena: Number(d.cena) || 0 });
  }
  itog.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return itog;
}

/** Строит позицию корзины из блюда меню. */
function sobratPoziciyu(blyudo, kolichestvo, dobavki, zavedenieId) {
  return {
    klyuch: klyuchPozicii(blyudo.id, dobavki),
    blyudoId: blyudo.id,
    nazvanie: String(blyudo.nazvanie ?? ''),
    cena: cenaV(blyudo, zavedenieId),
    kolichestvo,
    dobavki,
    foto: blyudo.foto ?? null,
    cvet: blyudo.cvet ?? null,
    razdelId: blyudo.razdelId ?? blyudo.razdel?.id ?? null,
    ves: typeof blyudo.ves === 'number' ? blyudo.ves : null,
    vremya: typeof blyudo.vremya === 'number' ? blyudo.vremya : null,
  };
}

/** Проверяет позицию из хранилища: битые записи не пускаем в корзину. */
function poziciyaCela(p) {
  return p && typeof p === 'object'
    && typeof p.klyuch === 'string' && p.klyuch
    && typeof p.blyudoId === 'string'
    && typeof p.nazvanie === 'string'
    && Number.isFinite(Number(p.cena))
    && Number.isFinite(Number(p.kolichestvo)) && Number(p.kolichestvo) > 0;
}

function ochistitPoziciyu(p) {
  return {
    klyuch: p.klyuch,
    blyudoId: p.blyudoId,
    nazvanie: p.nazvanie,
    cena: Number(p.cena),
    kolichestvo: celoeKolichestvo(p.kolichestvo, 1) || 1,
    dobavki: Array.isArray(p.dobavki)
      ? p.dobavki.filter((d) => d && d.id).map((d) => ({ id: d.id, nazvanie: String(d.nazvanie ?? ''), cena: Number(d.cena) || 0 }))
      : [],
    foto: p.foto ?? null,
    cvet: p.cvet ?? null,
    razdelId: p.razdelId ?? null,
    ves: typeof p.ves === 'number' ? p.ves : null,
    vremya: typeof p.vremya === 'number' ? p.vremya : null,
  };
}

function ochistitAdres(adres) {
  if (!adres || typeof adres !== 'object') return null;
  const tekst = String(adres.tekst ?? '').trim();
  const shirota = Number(adres.shirota);
  const dolgota = Number(adres.dolgota);
  if (!tekst && !Number.isFinite(shirota)) return null;
  return {
    tekst,
    shirota: Number.isFinite(shirota) ? shirota : null,
    dolgota: Number.isFinite(dolgota) ? dolgota : null,
  };
}

// ---------------------------------------------------------------------------
// Корзина
// ---------------------------------------------------------------------------

/**
 * Корзина гостя. Обычно нужен единственный экземпляр `korzina` (ниже);
 * класс экспортирован для тестов и для отдельных корзин с другим ключом хранилища.
 */
export class Korzina {
  #pozicii = [];
  #zavedenieId = null;
  #sposob = null;
  #adres = null;
  #obrabotchiki = new Map();
  #klyuch;
  #klyuchZakaza;
  #klyuchNomera;
  /** Обработчик события storage (другая вкладка) — хранится, чтобы otklyuchit() мог его снять. */
  #naStorage = null;

  /**
   * @param {{klyuch?: string, klyuchZakaza?: string, klyuchNomera?: string, slushatVkladki?: boolean}} [opcii]
   *   slushatVkladki — подхватывать изменения из других вкладок (событие storage); по умолчанию да, в браузере.
   *   Экземпляр, который больше не нужен, отключают методом otklyuchit() — иначе слушатель держит его в памяти.
   */
  constructor(opcii = {}) {
    this.#klyuch = opcii.klyuch || KLYUCH_KORZINY;
    this.#klyuchZakaza = opcii.klyuchZakaza || KLYUCH_PROSHLOGO_ZAKAZA;
    this.#klyuchNomera = opcii.klyuchNomera || KLYUCH_NOMERA_ZAKAZA;
    this.perechitat();
    const slushat = opcii.slushatVkladki ?? true;
    if (slushat && typeof globalThis.addEventListener === 'function' && typeof globalThis.document !== 'undefined') {
      this.#naStorage = (s) => {
        if (s && s.key === this.#klyuch) {
          this.perechitat();
          this.#soobshchit({ tip: 'izmeneno', klyuch: null, prichina: 'drugaya_vkladka' });
        }
      };
      globalThis.addEventListener('storage', this.#naStorage);
    }
  }

  /**
   * Снимает слушатель storage и всех подписчиков — экземпляр можно отдать сборщику мусора.
   * Данные в localStorage не трогает. Повторный вызов безвреден.
   */
  otklyuchit() {
    if (this.#naStorage && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('storage', this.#naStorage);
    }
    this.#naStorage = null;
    this.#obrabotchiki.clear();
  }

  /** Слушает ли экземпляр другие вкладки (для проверок). */
  get slushaetVkladki() {
    return this.#naStorage !== null;
  }

  // --- состояние ------------------------------------------------------------

  /** Позиции корзины: [{ klyuch, blyudoId, nazvanie, cena, kolichestvo, dobavki, foto, cvet, razdelId, ves, vremya }]. Массив живой — менять через методы. */
  get pozicii() {
    return this.#pozicii;
  }

  /**
   * Выбранное заведение (id) или null. Присваивание сохраняется и оповещает подписчиков.
   * ВАЖНО: прямое присваивание НЕ пересчитывает цены позиций (у корзины нет меню, а скрытая
   * смена цены — тот самый тупик §6.1). Сменить заведение при непустой корзине —
   * только через perenestiKorzinu(korzina.pozicii, id, menyu) → экран «Переносим заказ» →
   * korzina.primenitPerenos(...), даже если ничего не пропало и поменялись одни цены.
   * Событие присваивания несёт nuzhenPerenos: true, если в корзине есть позиции.
   */
  get zavedenieId() {
    return this.#zavedenieId;
  }

  set zavedenieId(id) {
    const novoe = id ? String(id) : null;
    if (novoe === this.#zavedenieId) return;
    this.#zavedenieId = novoe;
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch: null, pole: 'zavedenieId', nuzhenPerenos: this.#pozicii.length > 0 });
  }

  /** Способ получения: 'samovyvoz' | 'dostavka' | null. */
  get sposob() {
    return this.#sposob;
  }

  set sposob(sposob) {
    const novoe = SPOSOBY.has(sposob) ? sposob : null;
    if (novoe === this.#sposob) return;
    this.#sposob = novoe;
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch: null, pole: 'sposob' });
  }

  /** Адрес доставки {tekst, shirota, dolgota} или null. */
  get adres() {
    return this.#adres;
  }

  set adres(adres) {
    const novoe = ochistitAdres(adres);
    if (JSON.stringify(novoe) === JSON.stringify(this.#adres)) return;
    this.#adres = novoe;
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch: null, pole: 'adres' });
  }

  /**
   * Снимок состояния (то, что лежит в localStorage) — для отладки и экрана оформления.
   * @returns {{pozicii: object[], zavedenieId: string|null, sposob: string|null, adres: object|null}}
   */
  sostoyanie() {
    return {
      pozicii: this.#pozicii.map((p) => ({ ...p, dobavki: p.dobavki.map((d) => ({ ...d })) })),
      zavedenieId: this.#zavedenieId,
      sposob: this.#sposob,
      adres: this.#adres ? { ...this.#adres } : null,
    };
  }

  /** Перечитывает корзину из localStorage (битые данные → пустая корзина, без исключений). */
  perechitat() {
    const dannye = prochitatIzHranilishcha(this.#klyuch);
    const pozicii = Array.isArray(dannye?.pozicii) ? dannye.pozicii.filter(poziciyaCela).map(ochistitPoziciyu) : [];
    // Склеиваем дубли по ключу, если хранилище кто-то испортил руками.
    const poKlyuchu = new Map();
    for (const p of pozicii) {
      const est = poKlyuchu.get(p.klyuch);
      if (est) est.kolichestvo = celoeKolichestvo(est.kolichestvo + p.kolichestvo, est.kolichestvo);
      else poKlyuchu.set(p.klyuch, p);
    }
    this.#pozicii = [...poKlyuchu.values()];
    this.#zavedenieId = typeof dannye?.zavedenieId === 'string' && dannye.zavedenieId ? dannye.zavedenieId : null;
    this.#sposob = SPOSOBY.has(dannye?.sposob) ? dannye.sposob : null;
    this.#adres = ochistitAdres(dannye?.adres);
    return this;
  }

  #sohranit() {
    zapisatVHranilishche(this.#klyuch, {
      pozicii: this.#pozicii,
      zavedenieId: this.#zavedenieId,
      sposob: this.#sposob,
      adres: this.#adres,
      obnovleno: new Date().toISOString(),
    });
  }

  // --- позиции --------------------------------------------------------------

  /**
   * Находит позицию по ключу.
   * @param {string} klyuch
   * @returns {object|null}
   */
  poziciya(klyuch) {
    return this.#pozicii.find((p) => p.klyuch === klyuch) || null;
  }

  /**
   * Сколько штук этого блюда в корзине (по всем наборам добавок) — для степпера на карточке.
   * @param {string} blyudoId
   * @returns {number}
   */
  kolichestvoBlyuda(blyudoId) {
    return this.#pozicii.filter((p) => p.blyudoId === blyudoId).reduce((s, p) => s + p.kolichestvo, 0);
  }

  /**
   * Почему блюдо нельзя положить в корзину сейчас (для подписи на неактивной «+»).
   * @param {object} blyudo
   * @returns {null|'banket'|'net'|'stop'} null — можно; 'banket' — пакет банкета (звонок, не корзина);
   *   'net' — в выбранном заведении такого блюда нет; 'stop' — в стоп-листе (без заведения — в стопе везде)
   */
  pochemuNelzya(blyudo) {
    if (!blyudo || typeof blyudo !== 'object' || !blyudo.id) return 'net';
    if (blyudo.banket) return 'banket';
    return prichinaNedostupnosti(blyudo, this.#zavedenieId);
  }

  /**
   * Кладёт блюдо в корзину. Одинаковые (блюдо + тот же набор добавок) складываются в одну позицию.
   * Цена берётся для выбранного заведения (или базовая); при слиянии вся позиция получает
   * актуальную цену заведения — в одной позиции не бывает двух цен.
   * Не кладёт (возвращает null): банкет, блюдо, которого нет в выбранном заведении или оно в стопе
   * (причину даёт pochemuNelzya(blyudo) — «+» на такой карточке должна быть неактивной с подписью).
   * @param {object} blyudo объект блюда из меню
   * @param {number} [kolichestvo=1]
   * @param {(string|{id: string})[]} [dobavki=[]] id добавок или сами добавки из blyudo.dobavki
   * @returns {object|null} позиция или null, если положить нельзя
   */
  dobavit(blyudo, kolichestvo = 1, dobavki = []) {
    if (this.pochemuNelzya(blyudo) !== null) return null;
    const n = celoeKolichestvo(kolichestvo, 1);
    if (n <= 0) return null;
    const vybrannye = normalizovatDobavki(blyudo, dobavki);
    const klyuch = klyuchPozicii(blyudo.id, vybrannye);
    let poziciya = this.poziciya(klyuch);
    if (poziciya) {
      poziciya.kolichestvo = celoeKolichestvo(poziciya.kolichestvo + n, poziciya.kolichestvo);
      // Заведение могли сменить присваиванием без переноса — не складываем штуки по устаревшей цене.
      poziciya.cena = cenaV(blyudo, this.#zavedenieId);
    } else {
      poziciya = sobratPoziciyu(blyudo, n, vybrannye, this.#zavedenieId);
      this.#pozicii.push(poziciya);
    }
    this.#sohranit();
    this.#soobshchit({ tip: 'dobavleno', klyuch, poziciya, skolko: n });
    return poziciya;
  }

  /**
   * Убирает позицию целиком.
   * @param {string} klyuch
   * @returns {object|null} убранная позиция или null, если такой не было
   */
  ubrat(klyuch) {
    const i = this.#pozicii.findIndex((p) => p.klyuch === klyuch);
    if (i < 0) return null;
    const [poziciya] = this.#pozicii.splice(i, 1);
    this.#sohranit();
    this.#soobshchit({ tip: 'ubrano', klyuch, poziciya });
    return poziciya;
  }

  /**
   * Меняет количество позиции; 0 и меньше — убирает её.
   * @param {string} klyuch
   * @param {number} kolichestvo
   * @returns {object|null} позиция после изменения (null — убрана или не найдена)
   */
  izmenit(klyuch, kolichestvo) {
    const poziciya = this.poziciya(klyuch);
    if (!poziciya) return null;
    const n = celoeKolichestvo(kolichestvo, poziciya.kolichestvo);
    if (n <= 0) {
      this.ubrat(klyuch);
      return null;
    }
    if (n === poziciya.kolichestvo) return poziciya;
    poziciya.kolichestvo = n;
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch, poziciya });
    return poziciya;
  }

  /** Очищает позиции (заведение, способ и адрес остаются — это выбор гостя, а не заказ). */
  ochistit() {
    if (!this.#pozicii.length) return;
    this.#pozicii = [];
    this.#sohranit();
    this.#soobshchit({ tip: 'ochishcheno', klyuch: null });
  }

  /**
   * Итог корзины в рублях: сумма (цена + добавки) × количество по всем позициям.
   * @returns {number}
   */
  summa() {
    return this.#pozicii.reduce((s, p) => s + summaPozicii(p), 0);
  }

  /**
   * Число штук во всех позициях (для значка на кнопке корзины).
   * @returns {number}
   */
  kolichestvo() {
    return this.#pozicii.reduce((s, p) => s + p.kolichestvo, 0);
  }

  /** Пуста ли корзина. */
  pusta() {
    return this.#pozicii.length === 0;
  }

  // --- перенос между заведениями -------------------------------------------

  /**
   * Применяет результат `perenestiKorzinu` из dannye.js после того, как гость всё увидел на экране «Переносим заказ».
   * Остающиеся позиции получают новую цену; для пропавших действует решение гостя:
   *   'zamena:<blyudoId>' — заменить блюдом из `zameny` (или из меню, если оно передано), с тем же количеством
   *   и теми добавками, которые есть у замены; 'ubrat' или отсутствие решения — убрать (экран уже показал пропажу).
   * Замена, которой в заведении переноса нет или она в стопе (возможно только через `menyu`, список `zameny`
   * уже проверен), в корзину не попадает — считается как ubrano.
   * Заведение корзины становится заведением переноса.
   * @param {{zavedenieId: string, ostaetsya: object[], propalo: {poziciya: object, prichina: string, zameny: object[]}[]}} rezultat
   * @param {Object<string, string>} [resheniya] {klyuch: 'zamena:<blyudoId>' | 'ubrat'}
   * @param {object|null} [menyu] меню — чтобы искать замену не только среди предложенных
   * @returns {{ostalos: number, zameneno: number, ubrano: number}}
   */
  primenitPerenos(rezultat, resheniya = {}, menyu = null) {
    if (!rezultat || typeof rezultat !== 'object') return { ostalos: 0, zameneno: 0, ubrano: 0 };
    const zavedenieId = rezultat.zavedenieId ? String(rezultat.zavedenieId) : this.#zavedenieId;
    const novye = new Map();
    const polozhit = (p) => {
      const est = novye.get(p.klyuch);
      if (est) est.kolichestvo = celoeKolichestvo(est.kolichestvo + p.kolichestvo, est.kolichestvo);
      else novye.set(p.klyuch, p);
    };
    let ostalos = 0;
    let zameneno = 0;
    let ubrano = 0;
    for (const p of rezultat.ostaetsya || []) {
      if (!poziciyaCela(p)) continue;
      polozhit(ochistitPoziciyu(p));
      ostalos++;
    }
    for (const propazha of rezultat.propalo || []) {
      const poziciya = propazha?.poziciya;
      if (!poziciya) continue;
      const reshenie = String((resheniya || {})[poziciya.klyuch] || 'ubrat');
      if (!reshenie.startsWith('zamena:')) {
        ubrano++;
        continue;
      }
      const id = reshenie.slice('zamena:'.length);
      const zamena = (propazha.zameny || []).find((b) => b && b.id === id) || (menyu ? naytiBlyudo(menyu, id) : null);
      if (!zamena || zamena.banket || prichinaNedostupnosti(zamena, zavedenieId) !== null) {
        ubrano++;
        continue;
      }
      const dobavki = normalizovatDobavki(zamena, poziciya.dobavki || []);
      polozhit(sobratPoziciyu(zamena, poziciya.kolichestvo, dobavki, zavedenieId));
      zameneno++;
    }
    this.#pozicii = [...novye.values()];
    this.#zavedenieId = zavedenieId;
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch: null, prichina: 'perenos', ostalos, zameneno, ubrano });
    return { ostalos, zameneno, ubrano };
  }

  // --- прошлый заказ ---------------------------------------------------------

  /**
   * Запоминает текущую корзину как «прошлый заказ» (демо: заказ никуда не отправляется).
   * Корзину не очищает — это делает экран после показа номера.
   * @param {object} [dop] что ещё сохранить: имя, телефон, время, комментарий и т.п.
   * @returns {object|null} запись заказа {nomer, kogda, pozicii, zavedenieId, sposob, adres, summa, kolichestvo, ...dop} или null, если корзина пуста
   */
  zapomnitZakaz(dop = {}) {
    if (!this.#pozicii.length) return null;
    const predydushchiy = Number(prochitatIzHranilishcha(this.#klyuchNomera)) || 1000;
    const nomer = predydushchiy + 1;
    zapisatVHranilishche(this.#klyuchNomera, nomer);
    const zapis = {
      ...(dop && typeof dop === 'object' ? dop : {}),
      nomer,
      kogda: new Date().toISOString(),
      zavedenieId: this.#zavedenieId,
      sposob: this.#sposob,
      adres: this.#adres ? { ...this.#adres } : null,
      pozicii: this.sostoyanie().pozicii,
      summa: this.summa(),
      kolichestvo: this.kolichestvo(),
    };
    zapisatVHranilishche(this.#klyuchZakaza, zapis);
    return zapis;
  }

  /**
   * Прошлый заказ из localStorage — для кнопки «повторить прошлый заказ».
   * @returns {object|null}
   */
  proshlyyZakaz() {
    const zapis = prochitatIzHranilishcha(this.#klyuchZakaza);
    if (!zapis || !Array.isArray(zapis.pozicii)) return null;
    const pozicii = zapis.pozicii.filter(poziciyaCela).map(ochistitPoziciyu);
    if (!pozicii.length) return null;
    return { ...zapis, pozicii };
  }

  /**
   * Повторяет прошлый заказ: кладёт его позиции в корзину (к тому, что уже есть).
   * С меню — берёт блюда из меню с актуальной ценой (пропавшие из меню пропускаются);
   * без меню — копирует позиции как были. Заведение и способ из прошлого заказа
   * подставляются, только если сейчас они не выбраны.
   * Блюда, которых в выбранном заведении сейчас нет или они в стопе, всё равно кладутся
   * (гость должен их увидеть, §6.1), но перечисляются в `nedostupno` — сборщику ядра сразу после
   * повтора звать perenestiKorzinu (§6.8), чтобы стоп-блюдо не уехало в оформление.
   * @param {object|null} [menyu]
   * @returns {{dobavleno: number, propushcheno: number, nedostupno: {klyuch: string, blyudoId: string, nazvanie: string, prichina: 'net'|'stop'}[]}}
   */
  povtoritZakaz(menyu = null) {
    const zakaz = this.proshlyyZakaz();
    if (!zakaz) return { dobavleno: 0, propushcheno: 0, nedostupno: [] };
    if (!this.#zavedenieId && zakaz.zavedenieId) this.#zavedenieId = String(zakaz.zavedenieId);
    if (!this.#sposob && SPOSOBY.has(zakaz.sposob)) this.#sposob = zakaz.sposob;
    if (!this.#adres && zakaz.adres) this.#adres = ochistitAdres(zakaz.adres);
    let dobavleno = 0;
    let propushcheno = 0;
    const nedostupno = [];
    for (const p of zakaz.pozicii) {
      let novaya;
      if (menyu) {
        const blyudo = naytiBlyudo(menyu, p.blyudoId);
        if (!blyudo) {
          propushcheno++;
          continue;
        }
        novaya = sobratPoziciyu(blyudo, p.kolichestvo, normalizovatDobavki(blyudo, p.dobavki), this.#zavedenieId);
        const prichina = prichinaNedostupnosti(blyudo, this.#zavedenieId);
        if (prichina) nedostupno.push({ klyuch: novaya.klyuch, blyudoId: blyudo.id, nazvanie: novaya.nazvanie, prichina });
      } else {
        novaya = ochistitPoziciyu(p);
      }
      const est = this.poziciya(novaya.klyuch);
      if (est) est.kolichestvo = celoeKolichestvo(est.kolichestvo + novaya.kolichestvo, est.kolichestvo);
      else this.#pozicii.push(novaya);
      dobavleno++;
    }
    this.#sohranit();
    this.#soobshchit({ tip: 'izmeneno', klyuch: null, prichina: 'povtor', dobavleno, propushcheno, nedostupno });
    return { dobavleno, propushcheno, nedostupno };
  }

  // --- события --------------------------------------------------------------

  /**
   * Подписка на события. 'izmenilas' — любое изменение корзины; обработчик получает
   * {tip: 'dobavleno'|'ubrano'|'izmeneno'|'ochishcheno', klyuch, poziciya?, pole?, prichina?}.
   * @param {string} sobytie
   * @param {(dannye: object, korzina: Korzina) => void} obrabotchik
   * @returns {() => void} функция отписки
   */
  na(sobytie, obrabotchik) {
    if (typeof obrabotchik !== 'function') return () => {};
    if (!this.#obrabotchiki.has(sobytie)) this.#obrabotchiki.set(sobytie, new Set());
    const nabor = this.#obrabotchiki.get(sobytie);
    nabor.add(obrabotchik);
    return () => nabor.delete(obrabotchik);
  }

  #soobshchit(dannye) {
    const nabor = this.#obrabotchiki.get('izmenilas');
    if (!nabor) return;
    for (const obrabotchik of [...nabor]) {
      try {
        obrabotchik(dannye, this);
      } catch (oshibka) {
        // Один сломанный подписчик не должен ронять остальных.
        if (typeof console !== 'undefined') console.error('Корзина: ошибка в обработчике', oshibka);
      }
    }
  }
}

/** Единственная корзина витрины (ключ 'hinkalnaya.korzina.v2'). */
export const korzina = new Korzina();
