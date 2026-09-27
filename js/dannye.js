// Витрина Хинкальной v2 — модуль данных.
// Меню, цены и доступность по заведениям, перенос корзины между заведениями,
// нечёткий поиск, расстояния, часы работы по Москве, подсказки адреса.
// Чистый ES-модуль без зависимостей; работает и в браузере, и в node (для тестов).

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
 * После загрузки у каждого блюда появляется поле `razdelId` и скрытая (неперечисляемая)
 * ссылка `razdel`, у блюд банкета — скрытый флаг `banket = true`.
 * @param {{zanovo?: boolean, put?: string|URL}} [opcii] zanovo=true — перечитать с сервера; put — другой адрес файла
 * @returns {Promise<object>} меню по схеме брифа §4
 */
export async function zagruzitMenyu(opcii = {}) {
  if (menyuVPamyati && !opcii.zanovo) return menyuVPamyati;
  if (zagruzkaIdet && !opcii.zanovo) return zagruzkaIdet;
  const put = opcii.put || ADRES_MENYU;
  zagruzkaIdet = (async () => {
    const otvet = await fetch(put, { cache: 'no-cache' });
    if (!otvet.ok) throw new Error('Меню не загрузилось: ' + otvet.status);
    const menyu = await otvet.json();
    podgotovitMenyu(menyu);
    menyuVPamyati = menyu;
    zagruzkaIdet = null;
    return menyu;
  })();
  return zagruzkaIdet;
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
  const ceny = new Set(Object.values(blyudo.po_zavedeniyam || {}).map((v) => v.cena));
  return ceny.size > 1;
}

/**
 * Причина недоступности блюда в заведении.
 * @param {object} blyudo
 * @param {string|null} zavedenieId
 * @returns {'net'|'stop'|null} 'net' — в этом заведении блюда нет, 'stop' — в стоп-листе, null — доступно
 */
export function prichinaNedostupnosti(blyudo, zavedenieId) {
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
  if (zapros.length >= 3 && slovo.includes(zapros)) return 0.7;
  // Общий корень почти во всё слово запроса: «семга» ~ «сёмгой», «говядина» ~ «говядины».
  const koren = obshchiyKoren(zapros, slovo);
  if (koren >= 4 && koren >= zapros.length - 1) return 0.6;
  const predel = dopustimyeOpechatki(zapros.length);
  if (predel === 0) return 0;
  const d1 = rasstoyanieSlov(zapros, slovo, predel);
  if (d1 <= predel) return 0.65 - 0.15 * d1;
  // Опечатка внутри начала слова: «хинкли» ~ «хинкал(и)»
  if (slovo.length > zapros.length) {
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

/** Оценка блюда против одного варианта запроса (все слова запроса должны найтись). */
function ocenkaBlyuda(slovaZaprosa, blyudo) {
  const slovaNazvaniya = slovaKesh(blyudo);
  const slovaRazdela = blyudo.razdel ? slovaKesh(blyudo.razdel) : [];
  let itog = 0;
  for (const q of slovaZaprosa) {
    let luchshe = 0;
    for (const w of slovaNazvaniya) luchshe = Math.max(luchshe, shozhestSlov(q, w));
    if (luchshe < 1) for (const w of slovaRazdela) luchshe = Math.max(luchshe, shozhestSlov(q, w) * 0.9);
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

// ---------------------------------------------------------------------------
// Семейства разделов (для градиентов)
// ---------------------------------------------------------------------------

const SEMEYSTVA = [
  ['kombo', /комбо/],
  ['testo', /хинкали|пирог|заморозк/],
  ['zhar', /шашлык|угл|горяч/],
  ['zelen', /салат|холодн|гарнир|соус/],
  ['sladkoe', /десерт|сок/],
  ['vino', /бар|вин|виски|водк|коньяк|текил|ром|шампан|мартини|пив/],
];

/**
 * Семейство раздела для градиента: 'testo' | 'zhar' | 'zelen' | 'sladkoe' | 'vino' | 'kombo'.
 * Принимает объект раздела или его название. Незнакомый раздел — 'testo'.
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

/**
 * Заведения по возрастанию расстояния от точки.
 * @param {number} shirota
 * @param {number} dolgota
 * @param {object} menyu
 * @returns {{zavedenie: object, km: number}[]} km округлены до 0,1
 */
export function blizhayshieZavedeniya(shirota, dolgota, menyu) {
  const spisok = (menyu.zavedeniya || [])
    .filter((z) => typeof z.shirota === 'number' && typeof z.dolgota === 'number')
    .map((zavedenie) => ({ zavedenie, km: Math.round(rasstoyanieKm(shirota, dolgota, zavedenie.shirota, zavedenie.dolgota) * 10) / 10 }));
  spisok.sort((a, b) => a.km - b.km);
  return spisok;
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
 * @param {Date} [data=new Date()]
 * @returns {{den: number, minuty: number}}
 */
export function vremyaMoskvy(data = new Date()) {
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

/**
 * Форматирует минуты от полуночи как «11:00».
 * @param {number} minuty
 * @returns {string}
 */
export function formatVremeni(minuty) {
  const m = ((minuty % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Окно работы дня: [открытие, закрытие]; закрытие 0 или раньше открытия — значит после полуночи (+1440). */
function oknoDnya(chasy, den) {
  const z = chasy?.[DNI[den]];
  if (!z || !Array.isArray(z) || z.length < 2) return null;
  const [ot, do_] = z;
  if (typeof ot !== 'number' || typeof do_ !== 'number') return null;
  return { ot, do: do_ <= ot ? do_ + 1440 : do_ };
}

/**
 * Открыто ли заведение сейчас (по Москве) и когда откроется, если закрыто.
 * @param {object} zavedenie объект заведения с полем chasy
 * @param {Date} [data=new Date()]
 * @returns {{otkryto: boolean, doZakrytiya: number|null, otkroetsya: string|null, zakryvaetsyaV: string|null}}
 *   doZakrytiya — минут до закрытия (если открыто); otkroetsya — «в 11:00», «завтра в 11:00», «в понедельник в 11:00»;
 *   zakryvaetsyaV — «23:00» для подписи «открыто до 23:00»; null — часов нет вообще
 */
export function otkrytoSeychas(zavedenie, data = new Date()) {
  const chasy = zavedenie?.chasy;
  const { den, minuty } = vremyaMoskvy(data);
  const net = { otkryto: false, doZakrytiya: null, otkroetsya: null, zakryvaetsyaV: null };
  if (!chasy) return net;

  // Ещё длится вчерашняя смена, перевалившая за полночь?
  const vchera = oknoDnya(chasy, (den + 6) % 7);
  if (vchera && vchera.do > 1440 && minuty < vchera.do - 1440) {
    return { otkryto: true, doZakrytiya: vchera.do - 1440 - minuty, otkroetsya: null, zakryvaetsyaV: formatVremeni(vchera.do) };
  }
  const segodnya = oknoDnya(chasy, den);
  if (segodnya && minuty >= segodnya.ot && minuty < segodnya.do) {
    return { otkryto: true, doZakrytiya: segodnya.do - minuty, otkroetsya: null, zakryvaetsyaV: formatVremeni(segodnya.do) };
  }
  if (segodnya && minuty < segodnya.ot) {
    return { otkryto: false, doZakrytiya: null, otkroetsya: `в ${formatVremeni(segodnya.ot)}`, zakryvaetsyaV: formatVremeni(segodnya.do) };
  }
  for (let sdvig = 1; sdvig <= 7; sdvig++) {
    const d = (den + sdvig) % 7;
    const okno = oknoDnya(chasy, d);
    if (!okno) continue;
    const kogda = sdvig === 1 ? 'завтра' : DNI_PO_RUSSKI[d];
    return { otkryto: false, doZakrytiya: null, otkroetsya: `${kogda} в ${formatVremeni(okno.ot)}`, zakryvaetsyaV: formatVremeni(okno.do) };
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
  const tekst = (pozicii || []).map((p) => normalizovat(p.nazvanie)).join(' | ');
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
 * Подсказки адреса через Nominatim (OSM), только Россия, до 5 штук.
 * Дребезг (debounce) — на стороне вызывающего. При любой ошибке сети или ответа — [].
 * @param {string} tekst
 * @param {{signal?: AbortSignal, taymautMs?: number}} [opcii]
 * @returns {Promise<{adres: string, kratko: string, shirota: number, dolgota: number}[]>}
 */
export async function podskazatAdres(tekst, opcii = {}) {
  const zapros = String(tekst || '').trim();
  if (zapros.length < 3) return [];
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
  try {
    const otvet = await fetch(url, { headers: { 'Accept-Language': 'ru' }, signal });
    if (!otvet.ok) return [];
    const spisok = await otvet.json();
    if (!Array.isArray(spisok)) return [];
    return spisok
      .filter((x) => x && x.lat && x.lon)
      .map((x) => ({
        adres: String(x.display_name || ''),
        kratko: kratkiyAdres(x),
        shirota: parseFloat(x.lat),
        dolgota: parseFloat(x.lon),
      }))
      .filter((x) => Number.isFinite(x.shirota) && Number.isFinite(x.dolgota));
  } catch {
    return [];
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
