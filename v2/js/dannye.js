// Витрина Хинкальной v2 — модуль данных (контракт: design/vitrina_v2/BRIF.md, §5, модуль A).
// Меню, цены и доступность по заведениям, перенос корзины между заведениями,
// нечёткий поиск, расстояния, часы работы по Москве, подсказки адреса.
// Данные — menyu.json из боевой базы hinkali (7 заведений, 13 разделов, 133 блюда; banket может быть null,
// dobavki у всех пустые, часы у всех [0, 1440] — модуль этого не предполагает и работает с любой схемой §4).
// Чистый ES-модуль без зависимостей; работает и в браузере, и в node (проверка: node scripts/proverit_dannye_vitriny.mjs).

// ---------------------------------------------------------------------------
// Загрузка меню
// ---------------------------------------------------------------------------

/** Кеш меню в памяти и обещание текущей загрузки (чтобы параллельные вызовы не качали дважды). */
let menyuVPamyati = null;
let zagruzkaIdet = null;

/** Адрес menyu.json относительно этого модуля: js/dannye.js -> ../menyu.json */
const ADRES_MENYU = new URL('../menyu.json', import.meta.url);

/**
 * Загружает меню (./menyu.json) один раз и кеширует в памяти.
 * Повторные вызовы отдают тот же объект. Параллельные — ждут одну загрузку.
 * Ошибка сети НЕ кешируется: следующий вызов zagruzitMenyu() снова идёт в сеть —
 * так кнопка «Повторить» на экране «нет сети» (§6.7) работает без опций.
 * После загрузки у каждого блюда появляется поле `razdelId` и скрытая (неперечисляемая)
 * ссылка `razdel`, у блюд банкета — скрытый флаг `banket = true`.
 * @param {{zanovo?: boolean, put?: string|URL}} [opcii] zanovo=true — перечитать с сервера; put — другой адрес файла
 * @returns {Promise<object>} меню по схеме брифа §4
 */
export async function zagruzitMenyu(opcii = {}) {
  if (menyuVPamyati && !opcii.zanovo) return menyuVPamyati;
  if (zagruzkaIdet && !opcii.zanovo) return zagruzkaIdet;
  const put = opcii.put || ADRES_MENYU;
  const zagruzka = (async () => {
    try {
      const otvet = await fetch(put, { cache: 'no-cache' });
      if (!otvet.ok) throw new Error('Меню не загрузилось: ' + otvet.status);
      const menyu = await otvet.json();
      podgotovitMenyu(menyu);
      menyuVPamyati = menyu;
      return menyu;
    } finally {
      // И при успехе, и при ошибке: следующий вызов либо возьмёт кеш, либо снова пойдёт в сеть.
      if (zagruzkaIdet === zagruzka) zagruzkaIdet = null;
    }
  })();
  zagruzkaIdet = zagruzka;
  return zagruzka;
}

/**
 * Готовит уже полученный объект меню (например, из кеша сервис-воркера или из теста):
 * проставляет `razdelId`, скрытые ссылки `razdel` и флаг банкета. Идемпотентно.
 * @param {object} menyu
 * @returns {object} то же меню
 */
export function podgotovitMenyu(menyu) {
  for (const razdel of menyu.razdely || []) {
    for (const blyudo of razdel.blyuda || []) privyazat(blyudo, razdel, false);
  }
  if (menyu.banket) {
    for (const blyudo of menyu.banket.blyuda || []) privyazat(blyudo, menyu.banket, true);
  }
  return menyu;
}

/** Привязывает блюдо к разделу, не ломая JSON.stringify (ссылка неперечисляемая). */
function privyazat(blyudo, razdel, banket) {
  blyudo.razdelId = razdel.id;
  Object.defineProperty(blyudo, 'razdel', { value: razdel, enumerable: false, configurable: true, writable: true });
  if (banket) Object.defineProperty(blyudo, 'banket', { value: true, enumerable: false, configurable: true, writable: true });
}

/** Кеш плоских списков и индексов по объекту меню. */
const indeksy = new WeakMap();

function indeks(menyu) {
  let i = indeksy.get(menyu);
  if (i) return i;
  if (!menyu.razdely?.[0]?.blyuda?.[0]?.razdel) podgotovitMenyu(menyu);
  const spisok = [];
  const poId = new Map();
  for (const razdel of menyu.razdely || []) {
    for (const blyudo of razdel.blyuda || []) {
      spisok.push(blyudo);
      poId.set(blyudo.id, blyudo);
    }
  }
  const zavedeniya = new Map((menyu.zavedeniya || []).map((z) => [z.id, z]));
  i = { spisok, poId, zavedeniya };
  indeksy.set(menyu, i);
  return i;
}

/**
 * Плоский массив всех блюд меню (без банкета) — у каждого есть `razdelId` и ссылка `razdel`.
 * @param {object} menyu
 * @returns {object[]}
 */
export function vseBlyuda(menyu) {
  return indeks(menyu).spisok.slice();
}

/**
 * Находит блюдо по id (без банкета).
 * @param {object} menyu
 * @param {string} id
 * @returns {object|null}
 */
export function naytiBlyudo(menyu, id) {
  return indeks(menyu).poId.get(id) || null;
}

/**
 * Находит заведение по id.
 * @param {object} menyu
 * @param {string} id
 * @returns {object|null}
 */
export function naytiZavedenie(menyu, id) {
  return indeks(menyu).zavedeniya.get(id) || null;
}

// ---------------------------------------------------------------------------
// Цена и доступность
// ---------------------------------------------------------------------------

/**
 * Цена блюда в заведении; если заведение не выбрано или там нет своей цены — базовая `cena`.
 * @param {object} blyudo
 * @param {string|null} zavedenieId
 * @returns {number}
 */
export function cenaV(blyudo, zavedenieId) {
  if (!blyudo) return 0;
  const svoya = zavedenieId ? blyudo.po_zavedeniyam?.[zavedenieId] : null;
  const cena = svoya && typeof svoya.cena === 'number' ? svoya.cena : blyudo.cena;
  return typeof cena === 'number' ? cena : 0;
}

/**
 * Различается ли цена блюда между заведениями (тогда без выбранного заведения пишем «цена уточнится»).
 * @param {object} blyudo
 * @returns {boolean}
 */
export function cenaRaznitsya(blyudo) {
  const ceny = new Set(Object.values(blyudo?.po_zavedeniyam || {}).map((v) => v.cena));
  return ceny.size > 1;
}

/**
 * Причина недоступности блюда в заведении.
 * @param {object} blyudo
 * @param {string|null} zavedenieId
 * @returns {'net'|'stop'|null} 'net' — в этом заведении блюда нет, 'stop' — в стоп-листе, null — доступно
 */
export function prichinaNedostupnosti(blyudo, zavedenieId) {
  if (!blyudo) return 'net'; // блюда больше нет в меню (например, устаревшая позиция корзины)
  if (blyudo.banket) return 'net';
  if (!zavedenieId) return blyudo.stop_vezde ? 'stop' : null;
  const zapis = blyudo.po_zavedeniyam?.[zavedenieId];
  if (!zapis) return 'net';
  return zapis.stop ? 'stop' : null;
}

/**
 * Доступно ли блюдо в заведении. Без заведения — доступно, если не в стопе везде.
 * @param {object} blyudo
 * @param {string|null} zavedenieId
 * @returns {boolean}
 */
export function dostupnoV(blyudo, zavedenieId) {
  return prichinaNedostupnosti(blyudo, zavedenieId) === null;
}

/**
 * Список заведений, где блюдо доступно (для подписи «есть на Савёловской и Войковской»).
 * @param {object} blyudo
 * @param {object} menyu
 * @returns {object[]}
 */
export function gdeDostupno(blyudo, menyu) {
  return (menyu.zavedeniya || []).filter((z) => dostupnoV(blyudo, z.id));
}

// ---------------------------------------------------------------------------
// Текст: нормализация, раскладка, расстояние между словами
// ---------------------------------------------------------------------------

/** Латинская раскладка ЙЦУКЕН -> кириллица, по клавишам. */
const RASKLADKA = (() => {
  const lat = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>~';
  const kir = 'йцукенгшщзхъфывапролджэячсмитьбюёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ';
  const karta = new Map();
  for (let i = 0; i < lat.length; i++) karta.set(lat[i], kir[i]);
  return karta;
})();

/**
 * Переводит текст, набранный в латинской раскладке, в кириллицу: '[byrfkb' -> 'хинкали'.
 * Символы без пары остаются как есть.
 * @param {string} tekst
 * @returns {string}
 */
export function ispravitRaskladku(tekst) {
  let s = '';
  for (const ch of String(tekst || '')) s += RASKLADKA.get(ch) ?? ch;
  return s;
}

/**
 * Нормализует строку для сравнения: нижний регистр, ё->е, кавычки и знаки -> пробелы, лишние пробелы убраны.
 * @param {string} tekst
 * @returns {string}
 */
export function normalizovat(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'„“”`()[\]{},.;:!?/\\|+*_\-–—‑]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Разбивает нормализованную строку на слова. */
function slova(tekst) {
  const n = normalizovat(tekst);
  return n ? n.split(' ') : [];
}

/**
 * Расстояние Левенштейна между двумя строками (с ранним выходом при превышении предела).
 * @param {string} a
 * @param {string} b
 * @param {number} [predel=2]
 * @returns {number} расстояние или predel+1, если оно больше предела
 */
export function rasstoyanieSlov(a, b, predel = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > predel) return predel + 1;
  let pred = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) pred[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const tek = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      const cena = a[i - 1] === b[j - 1] ? 0 : 1;
      tek[j] = Math.min(pred[j] + 1, tek[j - 1] + 1, pred[j - 1] + cena);
      if (tek[j] < min) min = tek[j];
    }
    if (min > predel) return predel + 1;
    pred = tek;
  }
  return pred[b.length];
}

/** Допустимое число опечаток для слова такой длины. */
function dopustimyeOpechatki(dlina) {
  if (dlina <= 3) return 0;
  if (dlina <= 5) return 1;
  return 2;
}

/**
 * Насколько слово запроса похоже на слово из названия: 0 — не похоже, 1 — совпало.
 * Учитывает префикс (начало слова), вхождение и опечатки.
 */
function shozhestSlov(zapros, slovo) {
  if (!zapros || !slovo) return 0;
  if (zapros === slovo) return 1;
  if (slovo.startsWith(zapros)) return 0.85 + 0.1 * (zapros.length / slovo.length);
  // Вхождение в середину слова — только для запроса от 5 букв: короткое слово внутри
  // длинного почти всегда случайность («вино» в «свиной», «кола» в «руккола», «шоколадное»).
  if (zapros.length >= 5 && slovo.includes(zapros)) return 0.7;
  // Общий корень почти во всё слово запроса: «семга» ~ «сёмгой», «говядина» ~ «говядины».
  const koren = obshchiyKoren(zapros, slovo);
  if (koren >= 4 && koren >= zapros.length - 1) return 0.6;
  const predel = dopustimyeOpechatki(zapros.length);
  if (predel === 0) return 0;
  const d1 = rasstoyanieSlov(zapros, slovo, predel);
  if (d1 <= predel) return 0.65 - 0.15 * d1;
  // Опечатка внутри начала слова: «хинкли» ~ «хинкал(и)». Только для запроса от 6 букв:
  // на коротких словах одна опечатка в начале находит чужое («пиво» ~ «пиро(г)», «морс» ~ «моро(женое)»,
  // «рыба» ~ «рыча(л)»), а алкоголь из меню скрыт — гость должен увидеть честное «ничего не нашли».
  if (zapros.length >= 6 && slovo.length > zapros.length) {
    const d2 = rasstoyanieSlov(zapros, slovo.slice(0, zapros.length), predel);
    if (d2 <= predel) return 0.55 - 0.15 * d2;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

/** Варианты запроса: как набрано и с исправленной раскладкой (если была латиница). */
function variantyZaprosa(zapros) {
  const ishodnyy = normalizovat(zapros);
  const varianty = [];
  if (ishodnyy) varianty.push(ishodnyy);
  if (/[a-z\[\];',.`{}:"<>~]/i.test(String(zapros || ''))) {
    const ispravlen = normalizovat(ispravitRaskladku(zapros));
    if (ispravlen && ispravlen !== ishodnyy) varianty.push(ispravlen);
  }
  return varianty;
}

/**
 * Оценка блюда против одного варианта запроса (все слова запроса должны найтись).
 * Порядок источников: название (полный вес) → раздел (×0.9) → состав (только точное слово
 * или его начало, ×0.55 — «сыр» находит хачапури, но опечатки по составу не прощаем, чтобы не шуметь).
 */
function ocenkaBlyuda(slovaZaprosa, blyudo) {
  const slovaNazvaniya = slovaKesh(blyudo);
  const slovaRazdela = blyudo.razdel ? slovaKesh(blyudo.razdel) : [];
  let itog = 0;
  for (const q of slovaZaprosa) {
    let luchshe = 0;
    for (const w of slovaNazvaniya) luchshe = Math.max(luchshe, shozhestSlov(q, w));
    if (luchshe < 1) for (const w of slovaRazdela) luchshe = Math.max(luchshe, shozhestSlov(q, w) * 0.9);
    if (luchshe < 0.6 && q.length >= 3) {
      // Состав: слово целиком или со словоизменением (окончание до 2 букв: «сыр» ~ «сыром»),
      // но не начало другого слова («вино» ≠ «виноградные», «морс» ≠ «морская»).
      for (const w of slovaSostava(blyudo)) {
        if (w === q || (w.startsWith(q) && w.length - q.length <= 2)) luchshe = Math.max(luchshe, 0.55);
      }
    }
    // Бытовые слова, которых нет в названиях: «вода» — минеральные воды меню.
    const sinonimy = SINONIMY_POISKA.get(q);
    if (sinonimy && slovaNazvaniya.some((w) => sinonimy.includes(w))) luchshe = Math.max(luchshe, 0.8);
    if (luchshe === 0) return 0;
    itog += luchshe;
  }
  // Точное вхождение целой фразы — сверху.
  const nazvanie = normalizovat(blyudo.nazvanie);
  const fraza = slovaZaprosa.join(' ');
  if (nazvanie === fraza) itog += 2;
  else if (nazvanie.startsWith(fraza)) itog += 1;
  else if (nazvanie.includes(fraza)) itog += 0.5;
  return itog / slovaZaprosa.length;
}

const slovaKeshi = new WeakMap();
function slovaKesh(obekt) {
  let s = slovaKeshi.get(obekt);
  if (!s) {
    s = slova(obekt.nazvanie);
    slovaKeshi.set(obekt, s);
  }
  return s;
}

/**
 * Бытовые слова запроса → слова названий, которые им отвечают. Только то, чего нет в самих
 * названиях: минеральные воды меню называются маркой («Боржоми», «Рычал-Су»), а гость ищет «воду».
 * Нет таких блюд в меню — синоним просто ничего не находит.
 */
const MINERALNYE_VODY = ['боржоми', 'рычал', 'мевер', 'aquarei'];
const SINONIMY_POISKA = new Map([
  ['вода', MINERALNYE_VODY], ['воду', MINERALNYE_VODY], ['воды', MINERALNYE_VODY],
  ['минералка', MINERALNYE_VODY], ['минеральная', MINERALNYE_VODY], ['минералку', MINERALNYE_VODY],
]);

/**
 * Технологические слова состава, по которым блюдо искать бессмысленно: «вода» есть в лаваше
 * и в морсе, «кофеин» — в коле. По названию такие слова по-прежнему ищутся.
 */
const SLOVA_SOSTAVA_BEZ_POISKA = new Set([
  'вода', 'воды', 'соль', 'сахар', 'мука', 'дрожжи', 'дрожжей', 'кофеин', 'краситель', 'ароматизатор',
  'ароматизаторы', 'регулятор', 'кислота', 'кислотности', 'диоксид', 'углерода', 'подготовленная',
  'идентичный', 'натуральный', 'натуральные', 'пищевая', 'пищевой', 'немного',
]);

/** Слова состава блюда (`sostav` из базы), без служебных и технологических; кешируются. */
const slovaSostavaKeshi = new WeakMap();
function slovaSostava(blyudo) {
  let s = slovaSostavaKeshi.get(blyudo);
  if (!s) {
    s = slova(blyudo.sostav || '').filter((w) => w.length >= 3 && !SLOVA_SOSTAVA_BEZ_POISKA.has(w));
    slovaSostavaKeshi.set(blyudo, s);
  }
  return s;
}

/**
 * Нечёткий поиск блюд по названию и разделу.
 * Не зависит от регистра и ё/е, прощает опечатки (до 2 на слово, по длине слова),
 * понимает латинскую раскладку ('[byrfkb' -> 'хинкали'), ищет по названию раздела («салаты»).
 * С выбранным заведением блюда, которых там нет, не показываются; блюда в стопе идут в конце.
 * @param {string} zapros
 * @param {object} menyu
 * @param {string|null} [zavedenieId]
 * @returns {object[]} блюда по убыванию похожести
 */
export function poisk(zapros, menyu, zavedenieId = null) {
  const varianty = variantyZaprosa(zapros).map(slova).filter((v) => v.length);
  if (!varianty.length) return [];
  const rezultat = [];
  for (const blyudo of indeks(menyu).spisok) {
    const prichina = prichinaNedostupnosti(blyudo, zavedenieId);
    if (prichina === 'net') continue;
    let luchshe = 0;
    for (const v of varianty) luchshe = Math.max(luchshe, ocenkaBlyuda(v, blyudo));
    if (luchshe > 0) rezultat.push({ blyudo, ocenka: luchshe, stop: prichina === 'stop' ? 1 : 0 });
  }
  rezultat.sort((a, b) => a.stop - b.stop || b.ocenka - a.ocenka || a.blyudo.nazvanie.localeCompare(b.blyudo.nazvanie, 'ru'));
  return rezultat.map((r) => r.blyudo);
}

// Словарь слов из названий блюд (для «Может, вы искали…»), по одному на меню
const slovariMenyu = new WeakMap();

/**
 * Честная догадка для пустого поиска: «Может, вы искали …» только если догадка правда
 * что-то находит. Каждое слово запроса (и его вариант в русской раскладке) сверяется
 * со словами названий блюд с допуском по длине (до 4 букв — 1 правка, до 7 — 2, длиннее — 3).
 * Мусор вроде «zzzz» → «яяяя», «ъъъъ», «(((» догадки не даёт — вернётся null.
 * «шашлык лосось пицца» → «шашлык» (одно слово совпало, остальные — нет).
 * @param {string} zapros
 * @param {object} menyu
 * @param {string|null} [zavedenieId]
 * @returns {{tekst: string, blyuda: object[]} | null}
 */
export function ispravlenieZaprosa(zapros, menyu, zavedenieId = null) {
  if (!menyu) return null;
  let slovar = slovariMenyu.get(menyu);
  if (!slovar) {
    slovar = new Set();
    for (const b of indeks(menyu).spisok) for (const s of slova(b.nazvanie)) if (s.length >= 3 && /[а-я]/.test(s)) slovar.add(s);
    slovariMenyu.set(menyu, slovar);
  }
  const slovaZaprosa = new Set();
  for (const v of variantyZaprosa(zapros)) for (const s of slova(v)) if (s.length >= 3 && /[а-я]/.test(s)) slovaZaprosa.add(s);
  let luchshee = null;
  for (const s of slovaZaprosa) {
    const dopusk = s.length <= 4 ? 1 : s.length <= 7 ? 2 : 3;
    for (const v of slovar) {
      const d = rasstoyanieSlov(s, v, dopusk);
      if (d > dopusk) continue;
      // одна-две буквы из четырёх не догадка, а совпадение по случайности
      if (d > 0 && d * 3 > s.length) continue;
      if (!luchshee || d < luchshee.d || (d === luchshee.d && v.length > luchshee.v.length)) luchshee = { d, v };
    }
  }
  if (!luchshee) return null;
  const blyuda = poisk(luchshee.v, menyu, zavedenieId);
  if (!blyuda.length) return null;
  const normZapros = normalizovat(zapros);
  if (luchshee.v === normZapros) return null; // это и есть запрос — исправлять нечего
  return { tekst: luchshee.v, blyuda };
}

// ---------------------------------------------------------------------------
// Семейства разделов (для градиентов)
// ---------------------------------------------------------------------------

const SEMEYSTVA = [
  ['kombo', /комбо/],
  ['testo', /хинкали|пирог|хачапури|заморозк|лаваш/],
  ['zhar', /шашлык|угл|горяч|суп/],
  ['zelen', /салат|холодн|гарнир|соус|закуск|овощ/],
  ['sladkoe', /десерт|сок|напит|лимонад|сладк/],
  ['vino', /бар|вин|виски|водк|коньяк|текил|ром|шампан|мартини|пив|алког/],
];

/**
 * Семейство раздела для градиента: 'testo' | 'zhar' | 'zelen' | 'sladkoe' | 'vino' | 'kombo'.
 * Принимает объект раздела или его название. Разделы меню v2: Супы → 'zhar' (горячее),
 * Напитки (лимонады, соки, вода — без алкоголя) → 'sladkoe', как «Свежевыжатые соки» в брифе.
 * Незнакомый раздел — 'testo'.
 * @param {object|string} razdel
 * @returns {string}
 */
export function semeystvoRazdela(razdel) {
  const nazvanie = normalizovat(typeof razdel === 'string' ? razdel : razdel?.nazvanie);
  for (const [imya, shablon] of SEMEYSTVA) if (shablon.test(nazvanie)) return imya;
  return 'testo';
}

// ---------------------------------------------------------------------------
// Перенос корзины между заведениями
// ---------------------------------------------------------------------------

/** Служебные слова, которые не считаются общими при сравнении названий («хинкали из говядины» ~ «хинкали»). */
const SLUZHEBNYE_SLOVA = new Set(['из', 'с', 'со', 'и', 'в', 'на', 'по', 'для', 'без', 'под', 'к', 'от', 'шт', 'л', 'г', 'мл', 'кг']);

/** Слова названия без служебных и без чисел (объёмы «0,5», «1л» не считаются смыслом). */
function znachimyeSlova(tekst) {
  const s = slova(tekst).filter((w) => !SLUZHEBNYE_SLOVA.has(w) && !/^\d+$/.test(w));
  return s.length ? s : slova(tekst);
}

/** Похожесть двух слов: 0 — разные, 1 — одинаковые; общий корень (от 4 букв или целое короткое слово) и опечатки. */
function shozhestKorney(x, y) {
  if (x === y) return 1;
  const koren = obshchiyKoren(x, y);
  const korotkoe = Math.min(x.length, y.length);
  if (koren >= 4) return 0.7 + 0.2 * (koren / Math.max(x.length, y.length));
  if (koren >= 3 && koren === korotkoe) return 0.6; // «сыр» ~ «сырные»
  if (korotkoe >= 5 && rasstoyanieSlov(x, y, 2) <= 2) return 0.5;
  return 0;
}

/**
 * Похожесть названий по словам, симметричная: считаем, сколько значимых слов каждого названия
 * нашлось в другом (точно, по общему корню или с опечаткой), и делим на общее число слов.
 * «Хинкали» ближе к «Хинкали из говядины», чем «Хинкали из баранины»: лишних слов меньше.
 */
function shozhestNazvaniy(a, b) {
  const sa = znachimyeSlova(a);
  const sb = znachimyeSlova(b);
  if (!sa.length || !sb.length) return 0;
  let summa = 0;
  for (const x of sa) {
    let luchshe = 0;
    for (const y of sb) luchshe = Math.max(luchshe, shozhestKorney(x, y));
    summa += luchshe;
  }
  for (const y of sb) {
    let luchshe = 0;
    for (const x of sa) luchshe = Math.max(luchshe, shozhestKorney(x, y));
    summa += luchshe;
  }
  return summa / (sa.length + sb.length);
}

/** Длина общего начала двух слов. */
function obshchiyKoren(x, y) {
  let i = 0;
  const n = Math.min(x.length, y.length);
  while (i < n && x[i] === y[i]) i++;
  return i;
}

/**
 * Подбирает замены пропавшему блюду: тот же раздел, доступно в заведении,
 * ближе по названию (общие слова и корни) и по цене.
 * @param {object} blyudo пропавшее блюдо (объект меню или позиция корзины с nazvanie/cena/razdelId)
 * @param {string} zavedenieId
 * @param {object} menyu
 * @param {number} [n=3]
 * @returns {object[]} до n блюд меню
 */
export function podobratZameny(blyudo, zavedenieId, menyu, n = 3) {
  const razdelId = blyudo.razdelId || blyudo.razdel?.id;
  const razdel = (menyu.razdely || []).find((r) => r.id === razdelId);
  if (!razdel) return [];
  const cenaBylo = typeof blyudo.cena === 'number' ? blyudo.cena : 0;
  const kandidaty = [];
  for (const k of razdel.blyuda) {
    if (k.id === blyudo.id || k.id === blyudo.blyudoId) continue;
    if (!dostupnoV(k, zavedenieId)) continue;
    const poNazvaniyu = shozhestNazvaniy(blyudo.nazvanie, k.nazvanie);
    const cenaStalo = cenaV(k, zavedenieId);
    const poCene = cenaBylo > 0 ? Math.min(1, Math.abs(cenaStalo - cenaBylo) / cenaBylo) : 0;
    // Название важнее цены; при равной похожести — ближе по цене, потом короче (проще) название.
    const ocenka = poNazvaniyu - poCene * 0.35;
    kandidaty.push({ k, ocenka, poCene, dlina: k.nazvanie.length });
  }
  kandidaty.sort((a, b) => b.ocenka - a.ocenka || a.poCene - b.poCene || a.dlina - b.dlina);
  return kandidaty.slice(0, n).map((x) => x.k);
}

/**
 * Переносит корзину в заведение: что остаётся (с новой ценой), у чего изменилась цена,
 * что пропало (нет / стоп) — с заменами в один тап. Ничего не удаляет само.
 * @param {object[]} korzinaPozicii позиции корзины (см. korzina.js)
 * @param {string} zavedenieId
 * @param {object} menyu
 * @returns {{
 *   zavedenieId: string,
 *   ostaetsya: object[],
 *   izmenilasCena: {poziciya: object, bylo: number, stalo: number}[],
 *   propalo: {poziciya: object, prichina: 'net'|'stop', zameny: object[]}[],
 *   summaBylo: number, summaStalo: number
 * }} ostaetsya — все позиции, которые остаются (включая те, где цена изменилась)
 */
export function perenestiKorzinu(korzinaPozicii, zavedenieId, menyu) {
  const ostaetsya = [];
  const izmenilasCena = [];
  const propalo = [];
  let summaBylo = 0;
  let summaStalo = 0;
  for (const poziciya of korzinaPozicii || []) {
    const dobavkiSumma = (poziciya.dobavki || []).reduce((s, d) => s + (d.cena || 0), 0);
    summaBylo += (poziciya.cena + dobavkiSumma) * poziciya.kolichestvo;
    const blyudo = naytiBlyudo(menyu, poziciya.blyudoId);
    const prichina = blyudo ? prichinaNedostupnosti(blyudo, zavedenieId) : 'net';
    if (prichina) {
      const osnova = blyudo || poziciya;
      propalo.push({ poziciya, prichina, zameny: podobratZameny({ ...osnova, cena: poziciya.cena, razdelId: osnova.razdelId || poziciya.razdelId }, zavedenieId, menyu) });
      continue;
    }
    const stalo = cenaV(blyudo, zavedenieId);
    const novaya = { ...poziciya, cena: stalo };
    ostaetsya.push(novaya);
    summaStalo += (stalo + dobavkiSumma) * poziciya.kolichestvo;
    if (stalo !== poziciya.cena) izmenilasCena.push({ poziciya: novaya, bylo: poziciya.cena, stalo });
  }
  return { zavedenieId, ostaetsya, izmenilasCena, propalo, summaBylo, summaStalo };
}

// ---------------------------------------------------------------------------
// Расстояния
// ---------------------------------------------------------------------------

/**
 * Расстояние между двумя точками по гаверсинусу, в километрах.
 * @param {number} shirota1
 * @param {number} dolgota1
 * @param {number} shirota2
 * @param {number} dolgota2
 * @returns {number}
 */
export function rasstoyanieKm(shirota1, dolgota1, shirota2, dolgota2) {
  const R = 6371.0088;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(shirota2 - shirota1);
  const dLon = rad(dolgota2 - dolgota1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(shirota1)) * Math.cos(rad(shirota2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Числовая и конечная координата (не NaN, не null, не строка). */
function koordinataCela(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Заведения по возрастанию расстояния от точки.
 * Координаты гостя не числа (NaN, null, undefined) — точка неизвестна, отдаём [] (сборщику ядра —
 * показывать список заведений без километров). Заведение без своих координат не выпадает:
 * идёт в хвост списка с km: null («расстояние неизвестно»).
 * @param {number} shirota
 * @param {number} dolgota
 * @param {object} menyu
 * @returns {{zavedenie: object, km: number|null}[]} km округлены до 0,1; null — у заведения нет координат
 */
export function blizhayshieZavedeniya(shirota, dolgota, menyu) {
  if (!koordinataCela(shirota) || !koordinataCela(dolgota)) return [];
  const sKm = [];
  const bezKm = [];
  for (const zavedenie of menyu?.zavedeniya || []) {
    if (koordinataCela(zavedenie.shirota) && koordinataCela(zavedenie.dolgota)) {
      sKm.push({ zavedenie, km: Math.round(rasstoyanieKm(shirota, dolgota, zavedenie.shirota, zavedenie.dolgota) * 10) / 10 });
    } else {
      bezKm.push({ zavedenie, km: null });
    }
  }
  sKm.sort((a, b) => a.km - b.km);
  return sKm.concat(bezKm);
}

// ---------------------------------------------------------------------------
// Часы работы (минуты от полуночи по Москве)
// ---------------------------------------------------------------------------

const DNI = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const DNI_PO_ANGL = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DNI_PO_RUSSKI = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

let formatMoskvy = null;

/**
 * Московское время момента: день недели (0 = воскресенье) и минуты от полуночи.
 * Считается через Intl с timeZone 'Europe/Moscow' — гость может быть в другом поясе.
 * Невалидная дата (new Date('x'), NaN, мусор) не роняет экран: считается текущий момент.
 * @param {Date|number|string} [data=new Date()]
 * @returns {{den: number, minuty: number}}
 */
export function vremyaMoskvy(data = new Date()) {
  data = celayaData(data);
  if (!formatMoskvy) {
    formatMoskvy = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    });
  }
  const chasti = {};
  for (const ch of formatMoskvy.formatToParts(data)) chasti[ch.type] = ch.value;
  const chas = (parseInt(chasti.hour, 10) || 0) % 24;
  const minuta = parseInt(chasti.minute, 10) || 0;
  return { den: DNI_PO_ANGL[chasti.weekday] ?? 0, minuty: chas * 60 + minuta };
}

/** Приводит дату к валидному Date; невалидная → текущий момент (Intl.formatToParts на Invalid Date бросает RangeError). */
function celayaData(data) {
  const d = data instanceof Date ? data : new Date(data ?? Date.now());
  return Number.isFinite(d.getTime()) ? d : new Date();
}

/** Время закрытия для подписи: ровно полночь конца дня — «24:00», а не «0:00». */
function formatZakrytiya(minuty) {
  return minuty === 1440 ? '24:00' : formatVremeni(minuty);
}

/**
 * Форматирует минуты от полуночи как «11:00».
 * @param {number} minuty
 * @returns {string}
 */
export function formatVremeni(minuty) {
  const m = ((minuty % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Подпись режима работы для карточки заведения: «круглосуточно», «до 23:00», «откроется завтра в 11:00».
 * @param {object} zavedenie
 * @param {Date} [data=new Date()]
 * @returns {string}
 */
export function podpisRezhima(zavedenie, data = new Date()) {
  const s = otkrytoSeychas(zavedenie, data);
  if (s.chasyNeizvestny) return 'часы уточняйте';
  if (s.otkryto) return s.kruglosutochno ? 'круглосуточно' : `до ${s.zakryvaetsyaV}`;
  if (s.otkroetsya) return `откроется ${s.otkroetsya}`;
  return 'часы не указаны';
}

/** Окно работы дня: [открытие, закрытие]; закрытие 0 или раньше открытия — значит после полуночи (+1440). */
function oknoDnya(chasy, den) {
  const z = chasy?.[DNI[den]];
  if (!z || !Array.isArray(z) || z.length < 2) return null;
  const [ot, do_] = z;
  if (typeof ot !== 'number' || typeof do_ !== 'number') return null;
  return { ot, do: do_ <= ot ? do_ + 1440 : do_ };
}

/** Круглосуточное окно: с полуночи до полуночи ([0, 1440]). */
function kruglosutochnoeOkno(okno) {
  return Boolean(okno) && okno.ot === 0 && okno.do >= 1440;
}

/**
 * Часы известны? Ровно [0, 1440] во все семь дней — это значение по умолчанию в базе,
 * а не настоящий круглосуточный режим (в базе Хинкальной так у всех заведений).
 * Писать гостю «открыто круглосуточно» по нему нельзя.
 * @param {object} zavedenie
 * @returns {boolean}
 */
export function chasyIzvestny(zavedenie) {
  const chasy = zavedenie?.chasy;
  if (!chasy || typeof chasy !== 'object') return false;
  return !DNI.every((d) => Array.isArray(chasy[d]) && chasy[d][0] === 0 && chasy[d][1] === 1440);
}

/**
 * Готовая строка статуса для шапки и списка заведений:
 * «часы уточняйте» / «открыто круглосуточно» / «открыто до 23:00» / «откроется в 10:00».
 * @param {object} zavedenie
 * @param {Date} [data=new Date()]
 * @returns {{otkryto: boolean, izvestno: boolean, tekst: string}}
 *   izvestno=false — часов нет или они по умолчанию: точку «открыто» не красить зелёным
 */
export function statusRezhima(zavedenie, data = new Date()) {
  const s = otkrytoSeychas(zavedenie, data);
  if (s.chasyNeizvestny || !zavedenie?.chasy) return { otkryto: true, izvestno: false, tekst: 'часы уточняйте' };
  if (s.otkryto) return { otkryto: true, izvestno: true, tekst: s.kruglosutochno || !s.zakryvaetsyaV ? 'открыто круглосуточно' : `открыто до ${s.zakryvaetsyaV}` };
  return { otkryto: false, izvestno: true, tekst: s.otkroetsya ? `откроется ${s.otkroetsya}` : 'сейчас закрыто' };
}

/**
 * Открыто ли заведение сейчас (по Москве) и когда откроется, если закрыто.
 * Время гостя может быть в любом поясе — считается московское через Intl (timeZone 'Europe/Moscow').
 * @param {object} zavedenie объект заведения с полем chasy ({mo: [600, 1380], …, su: null})
 * @param {Date} [data=new Date()]
 * @returns {{otkryto: boolean, doZakrytiya: number|null, otkroetsya: string|null, zakryvaetsyaV: string|null, kruglosutochno: boolean}}
 *   doZakrytiya — минут до закрытия (если открыто); null — открыто и закрытия впереди нет (сегодня и завтра
 *   круглые сутки: в базе Хинкальной все 7 заведений так), «скоро закрывается» по нему не показывать;
 *   если смена до 24:00, а завтра открыто с 0:00 — считается до закрытия завтрашней смены;
 *   otkroetsya — «в 11:00», «завтра в 11:00», «в понедельник в 11:00»;
 *   zakryvaetsyaV — «23:00» / «24:00» для подписи «открыто до 23:00»; null — часов нет вообще или закрытия нет (круглосуточно);
 *   kruglosutochno — сегодня окно [0, 1440]: подпись «круглосуточно» вместо «до …»;
 *   chasyNeizvestny — true, если часы в базе по умолчанию ([0,1440] все 7 дней, см. chasyIzvestny):
 *     otkryto=true (заказ не блокируем), kruglosutochno=false, zakryvaetsyaV=null — подпись «часы уточняйте»
 *     (готовая строка — statusRezhima / podpisRezhima)
 * Невалидная дата не бросает исключение — считается текущий момент.
 */
export function otkrytoSeychas(zavedenie, data = new Date()) {
  const chasy = zavedenie?.chasy;
  const { den, minuty } = vremyaMoskvy(data);
  const net = { otkryto: false, doZakrytiya: null, otkroetsya: null, zakryvaetsyaV: null, kruglosutochno: false };
  if (!chasy) return net;
  // Часы по умолчанию ([0,1440] все дни): не мешаем заказу (считаем открытым),
  // но «круглосуточно» не обещаем — chasyNeizvestny, подпись «часы уточняйте».
  if (!chasyIzvestny(zavedenie)) {
    return { otkryto: true, doZakrytiya: null, otkroetsya: null, zakryvaetsyaV: null, kruglosutochno: false, chasyNeizvestny: true };
  }

  // Ещё длится вчерашняя смена, перевалившая за полночь?
  const vchera = oknoDnya(chasy, (den + 6) % 7);
  if (vchera && vchera.do > 1440 && minuty < vchera.do - 1440) {
    return { otkryto: true, doZakrytiya: vchera.do - 1440 - minuty, otkroetsya: null, zakryvaetsyaV: formatVremeni(vchera.do), kruglosutochno: false };
  }
  const segodnya = oknoDnya(chasy, den);
  if (segodnya && minuty >= segodnya.ot && minuty < segodnya.do) {
    const kruglosutochno = kruglosutochnoeOkno(segodnya);
    // Смена до полуночи, а завтра открыто с 0:00 — заведение не закрывается в полночь.
    const zavtra = segodnya.do === 1440 ? oknoDnya(chasy, (den + 1) % 7) : null;
    if (zavtra && zavtra.ot === 0) {
      if (kruglosutochnoeOkno(zavtra)) {
        // Работает и сегодня, и завтра круглые сутки: «скоро закрывается» здесь было бы враньём.
        return { otkryto: true, doZakrytiya: null, otkroetsya: null, zakryvaetsyaV: null, kruglosutochno: true };
      }
      return { otkryto: true, doZakrytiya: 1440 - minuty + zavtra.do, otkroetsya: null, zakryvaetsyaV: formatVremeni(zavtra.do), kruglosutochno };
    }
    return { otkryto: true, doZakrytiya: segodnya.do - minuty, otkroetsya: null, zakryvaetsyaV: formatZakrytiya(segodnya.do), kruglosutochno };
  }
  if (segodnya && minuty < segodnya.ot) {
    return { otkryto: false, doZakrytiya: null, otkroetsya: `в ${formatVremeni(segodnya.ot)}`, zakryvaetsyaV: formatZakrytiya(segodnya.do), kruglosutochno: false };
  }
  for (let sdvig = 1; sdvig <= 7; sdvig++) {
    const d = (den + sdvig) % 7;
    const okno = oknoDnya(chasy, d);
    if (!okno) continue;
    const kogda = sdvig === 1 ? 'завтра' : DNI_PO_RUSSKI[d];
    return { otkryto: false, doZakrytiya: null, otkroetsya: `${kogda} в ${formatVremeni(okno.ot)}`, zakryvaetsyaV: formatZakrytiya(okno.do), kruglosutochno: false };
  }
  return net;
}

// ---------------------------------------------------------------------------
// Популярное и «к этому берут»
// ---------------------------------------------------------------------------

/** Что считаем популярным, по порядку предпочтения (первое доступное совпадение каждого шаблона). */
const POPULYARNOE = [
  /^хинкали$/, /^хачапури по имеретински/, /^шашлык из свиной шейки/, /^салат по грузински/, /^лимонад тархун/,
  /^хинкали жареные$/, /^хачапури по мегрельски/, /^люля кебаб$/, /^цезарь с курицей/, /^харчо/,
  /^пирог лодочка/, /^шашлык из баранины/, /^оджахури/, /^пхали ассорти/, /^ткемали/, /^мацони/, /^чизкейк/,
  /^шашлык куриный/, /^греческий/, /^лимонад дюшес/,
];
const RAZDELY_POPULYARNYE = [/хинкали/, /пирог/, /шашлык/, /салат/, /горячие блюда/, /бар/];

/**
 * Детерминированная «популярная» подборка из доступных блюд: хинкали, хачапури, шашлык, салат, лимонад…
 * Одни и те же данные — один и тот же порядок.
 * @param {object} menyu
 * @param {string|null} [zavedenieId]
 * @param {number} [n=6]
 * @returns {object[]}
 */
export function populyarnye(menyu, zavedenieId = null, n = 6) {
  const spisok = indeks(menyu).spisok;
  const vybrano = [];
  const vzyato = new Set();
  for (const shablon of POPULYARNOE) {
    if (vybrano.length >= n) break;
    const b = spisok.find((x) => !vzyato.has(x.id) && dostupnoV(x, zavedenieId) && shablon.test(normalizovat(x.nazvanie)));
    if (b) { vybrano.push(b); vzyato.add(b.id); }
  }
  // Добираем из главных разделов по кругу, если шаблонов не хватило.
  for (const shablon of RAZDELY_POPULYARNYE) {
    if (vybrano.length >= n) break;
    const b = spisok.find((x) => !vzyato.has(x.id) && dostupnoV(x, zavedenieId) && shablon.test(normalizovat(x.razdel?.nazvanie)));
    if (b) { vybrano.push(b); vzyato.add(b.id); }
  }
  for (const b of spisok) {
    if (vybrano.length >= n) break;
    if (!vzyato.has(b.id) && dostupnoV(b, zavedenieId)) { vybrano.push(b); vzyato.add(b.id); }
  }
  return vybrano.slice(0, n);
}

/** К чему что предлагаем: по семейству/названию того, что уже в корзине -> шаблоны названий. */
const SPUTNIKI = [
  // Комбо-набор — уже полный стол: к нему не еда, а напитки и соусы
  { esli: /комбо|набор/, predlozhit: [/^лимонад тархун/, /^лимонад дюшес/, /^боржоми/, /^ткемали$/, /^аджика$/, /^сацебели$/] },
  { esli: /хинкали/, predlozhit: [/^сметана$/, /^ткемали$/, /^аджика$/, /^лимонад тархун/] },
  { esli: /шашлык|люля|кебаб|на углях|каре/, predlozhit: [/^ткемали$/, /^сацебели$/, /^наршараб$/, /^лаваш$/, /^овощи на углях/] },
  { esli: /хачапури|пирог/, predlozhit: [/^лимонад дюшес/, /^мацони/, /^салат по грузински/] },
  { esli: /харчо|чанахи|оджахури|чашушули|чахохбили|чкмерули|табака|жаркое|борщ|шурпа/, predlozhit: [/^лаваш$/, /^лимонад тархун/, /^аджика$/] },
  { esli: /салат|пхали|зелень|огурцы/, predlozhit: [/^лаваш$/, /^сок апельсин/, /^боржоми/] },
  { esli: /десерт|чизкейк|тирамису|мороженое|варенье|мацони/, predlozhit: [/^капучино/, /^американо/, /^эрл грей/] },
];

/**
 * «К этому берут»: соусы к хинкали и шашлыку, лимонад к горячему, лаваш к салату — только доступное и не то, что уже в корзине.
 * @param {object[]} pozicii позиции корзины
 * @param {object} menyu
 * @param {string|null} [zavedenieId]
 * @param {number} [n=4]
 * @returns {object[]}
 */
export function kEtomuBerut(pozicii, menyu, zavedenieId = null, n = 4) {
  const spisok = indeks(menyu).spisok;
  const vKorzine = new Set((pozicii || []).map((p) => p.blyudoId));
  const vybrano = [];
  const vzyato = new Set();
  // Название позиции + название её раздела: «Для дружной пятёрки» узнаётся как набор по разделу «комбо-наборы»
  const razdelPoId = new Map((menyu?.razdely || []).map((r) => [r.id, r.nazvanie]));
  const tekst = (pozicii || []).map((p) => {
    const razdel = razdelPoId.get(p.razdelId) || naytiBlyudo(menyu, p.blyudoId)?.razdel?.nazvanie || '';
    return `${normalizovat(p.nazvanie)} ${semeystvoRazdela(razdel) === 'kombo' ? 'комбо' : ''}`.trim();
  }).join(' | ');
  for (const pravilo of SPUTNIKI) {
    if (!pravilo.esli.test(tekst)) continue;
    for (const shablon of pravilo.predlozhit) {
      if (vybrano.length >= n) return vybrano;
      const b = spisok.find((x) => !vzyato.has(x.id) && !vKorzine.has(x.id) && dostupnoV(x, zavedenieId) && shablon.test(normalizovat(x.nazvanie)));
      if (b) { vybrano.push(b); vzyato.add(b.id); }
    }
  }
  if (!vybrano.length) {
    for (const b of populyarnye(menyu, zavedenieId, n + vKorzine.size)) {
      if (vybrano.length >= n) break;
      if (!vKorzine.has(b.id)) vybrano.push(b);
    }
  }
  return vybrano.slice(0, n);
}

// ---------------------------------------------------------------------------
// Подсказки адреса (Nominatim, OpenStreetMap)
// ---------------------------------------------------------------------------

const ADRES_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/**
 * Политика OSM требует называть приложение: в node без User-Agent Nominatim отвечает 403.
 * В браузере этот заголовок НЕ ставим: он не входит в безопасный список CORS, вызывает preflight,
 * на который Nominatim не отвечает, и запрос блокируется; браузер сам шлёт свой User-Agent и Referer.
 */
const AGENT_VITRINY = 'VitrinaHinkalnaya/2 (https://restoposbot.github.io/vitrina-hinkalnaya/)';
const V_BRAUZERE = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Политика Nominatim: не больше 1 запроса в секунду на приложение, ответы кешировать.
// Поэтому: кеш (память + sessionStorage), очередь с интервалом 1,1 с и пауза 30 с после 429.
const INTERVAL_ADRESA_MS = 1100;
const PAUZA_POSLE_LIMITA_MS = 30000;
const KLYUCH_KESHA_ADRESOV = 'hinkalnaya.adresa.v1';
const PREDEL_KESHA_ADRESOV = 40;
let sleduyushchiySlotAdresa = 0; // performance.now(), раньше которого новый запрос не уходит
let limitDo = 0; // до этого момента сервис сказал «слишком часто» — не дёргаем его
let keshAdresov = null; // Map: нормализованный запрос -> подсказки

/** Кеш подсказок: читаем из sessionStorage один раз (хранилище может быть закрыто — тогда только память). */
function keshAdresovGotov() {
  if (keshAdresov) return keshAdresov;
  keshAdresov = new Map();
  try {
    const syroe = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KLYUCH_KESHA_ADRESOV) : null;
    const zapisi = syroe ? JSON.parse(syroe) : [];
    if (Array.isArray(zapisi)) for (const [k, v] of zapisi) if (typeof k === 'string' && Array.isArray(v)) keshAdresov.set(k, v);
  } catch { /* битый кеш — начинаем с пустого */ }
  return keshAdresov;
}

function zapomnitAdresa(klyuch, spisok) {
  const kesh = keshAdresovGotov();
  kesh.delete(klyuch);
  kesh.set(klyuch, spisok);
  while (kesh.size > PREDEL_KESHA_ADRESOV) kesh.delete(kesh.keys().next().value);
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KLYUCH_KESHA_ADRESOV, JSON.stringify([...kesh]));
  } catch { /* хранилище недоступно — хватит памяти */ }
}

/** Пустой ответ-сбой: массив (контракт прежний), но с пометкой, что это не «адрес не найден». */
function sboyAdresa(prichina) {
  const pusto = [];
  pusto.oshibka = true;
  pusto.prichina = prichina;
  return pusto;
}

/** Пауза, которую можно прервать сигналом. */
function pauzaAdresa(ms, signal) {
  return new Promise((gotovo) => {
    if (ms <= 0) { gotovo(true); return; }
    const t = setTimeout(() => { if (signal) signal.removeEventListener?.('abort', naOtmenu); gotovo(true); }, ms);
    const naOtmenu = () => { clearTimeout(t); gotovo(false); };
    if (signal) {
      if (signal.aborted) { clearTimeout(t); gotovo(false); return; }
      signal.addEventListener?.('abort', naOtmenu, { once: true });
    }
  });
}

/**
 * Подсказки адреса через Nominatim (OSM), только Россия, до 5 штук.
 * Дребезг (debounce) — на стороне вызывающего; сама функция держит не больше одного запроса
 * в 1,1 с (политика OSM), кеширует ответы (память + sessionStorage) и после 429 30 с не ходит в сеть.
 * Всегда возвращает массив. Пустой массив бывает двух видов:
 * - адрес не найден — просто [];
 * - сбой сервиса — [] с полями `oshibka: true` и `prichina`:
 *   'limit' (429 / пауза после него), 'otvet' (другой код или не JSON), 'set' (нет сети, обрыв),
 *   'prervano' (отменили сигналом или вышел таймаут). Тогда гостю надо сказать «подсказки не отвечают»,
 *   а не «не нашли такой адрес».
 * @param {string} tekst
 * @param {{signal?: AbortSignal, taymautMs?: number}} [opcii]
 * @returns {Promise<{adres: string, kratko: string, shirota: number, dolgota: number}[] & {oshibka?: boolean, prichina?: string}>}
 */
export async function podskazatAdres(tekst, opcii = {}) {
  const zapros = String(tekst || '').trim();
  if (zapros.length < 3) return [];
  const klyuch = normalizovat(zapros);
  const izKesha = keshAdresovGotov().get(klyuch);
  if (izKesha) return izKesha.map((x) => ({ ...x }));
  if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) < limitDo) return sboyAdresa('limit');

  const url = new URL(ADRES_NOMINATIM);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'ru');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', zapros);
  let kontroller = null;
  let taymer = null;
  let signal = opcii.signal || null;
  if (!signal && typeof AbortController !== 'undefined') {
    kontroller = new AbortController();
    signal = kontroller.signal;
    taymer = setTimeout(() => kontroller.abort(), opcii.taymautMs || 6000);
  }
  // Очередь: занимаем ближайший свободный слот не раньше чем через 1,1 с после предыдущего запроса
  const seychas = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const moySlot = Math.max(seychas(), sleduyushchiySlotAdresa);
  sleduyushchiySlotAdresa = moySlot + INTERVAL_ADRESA_MS;
  try {
    const dozhdalis = await pauzaAdresa(moySlot - seychas(), signal);
    if (!dozhdalis) {
      // отменили, пока ждали очереди, — слот освобождаем, если после нас никто не встал
      if (sleduyushchiySlotAdresa === moySlot + INTERVAL_ADRESA_MS) sleduyushchiySlotAdresa = moySlot;
      return sboyAdresa('prervano');
    }
    const zagolovki = { 'Accept-Language': 'ru' };
    if (!V_BRAUZERE) zagolovki['User-Agent'] = AGENT_VITRINY;
    const otvet = await fetch(url, { headers: zagolovki, signal });
    if (otvet.status === 429) { limitDo = seychas() + PAUZA_POSLE_LIMITA_MS; return sboyAdresa('limit'); }
    if (!otvet.ok) return sboyAdresa('otvet');
    const spisok = await otvet.json();
    if (!Array.isArray(spisok)) return sboyAdresa('otvet');
    const podskazki = spisok
      .filter((x) => x && x.lat && x.lon)
      .map((x) => ({
        adres: String(x.display_name || ''),
        kratko: kratkiyAdres(x),
        shirota: parseFloat(x.lat),
        dolgota: parseFloat(x.lon),
      }))
      .filter((x) => Number.isFinite(x.shirota) && Number.isFinite(x.dolgota));
    zapomnitAdresa(klyuch, podskazki);
    return podskazki.map((x) => ({ ...x }));
  } catch (oshibka) {
    if (oshibka && oshibka.name === 'AbortError') return sboyAdresa('prervano');
    if (oshibka instanceof SyntaxError) return sboyAdresa('otvet');
    return sboyAdresa('set');
  } finally {
    if (taymer) clearTimeout(taymer);
  }
}

/** Короткая строка адреса из ответа Nominatim: улица, дом, город. */
function kratkiyAdres(x) {
  const a = x.address || {};
  const ulica = a.road || a.pedestrian || a.residential || a.neighbourhood || a.suburb || '';
  const dom = a.house_number || '';
  const gorod = a.city || a.town || a.village || a.municipality || a.state || '';
  const chasti = [[ulica, dom].filter(Boolean).join(', '), gorod].filter(Boolean);
  return chasti.length ? chasti.join(', ') : String(x.display_name || '').split(',').slice(0, 3).join(',').trim();
}
