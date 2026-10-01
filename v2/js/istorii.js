/**
 * Модуль D — сторис витрины Хинкальной.
 *
 * Два лица модуля:
 *  - `krugIstorii(istoriya, prosmotrena)` — круглое превью 72 px с градиентным
 *    кольцом (не просмотрена) или серым (просмотрена) для ряда на главной;
 *  - `pokazatIstorii(spisok, startIndex, opcii)` — полноэкранный просмотрщик:
 *    полоски прогресса сверху (5 с на кадр), пауза при удержании пальца,
 *    тап справа/слева — вперёд/назад, свайп вниз — закрыть, кнопка действия
 *    внизу с пружиной, переход между сторис «кубом», картинка с лёгким зумом
 *    Кена Бёрнса и параллаксом за пальцем. Возвращает Promise, который
 *    разрешается при закрытии.
 *
 * Модуль самодостаточен: стили вставляет сам (один `<style>` на страницу),
 * пружины считает сам — чтобы его можно было открыть в демо без остального
 * ядра. Просмотренные сторис помнит в localStorage под ключом
 * `hinkalnaya.istorii.v2`. Картинка сторис ждёт `kartinki/istorii/<id>.jpg`
 * (720×1280); пока её нет — кадр живёт на градиенте семейства с крупной
 * типографикой.
 *
 * Данные — `istorii.json`:
 *   [{ id, zagolovok, tekst, podpis, znak, kartinka, cvet, knopka,
 *      deystvie: { tip: 'razdel'|'blyudo'|'ssylka', id } }]
 *   `cvet` — имя семейства градиента ('testo'|'zhar'|'zelen'|'sladkoe'|'vino'|'kombo')
 *   или свой hex (`#B8213F`) — тогда градиент строится от него.
 */

const KLYUCH_HRANILISHCHA = 'hinkalnaya.istorii.v2';
const SOBYTIE_PROSMOTRA = 'hinkalnaya:istoriya-prosmotrena';
const DLITELNOST_KADRA = 5000;
const ZADERZHKA_UDERZHANIYA = 220; // после стольких мс пальца на экране — пауза; короче — это тап
const POROG_TAPA_MS = 320;
const POROG_SVAYPA_PX = 56;
const POROG_ZAKRYTIYA_PX = 120;

/** Семейства градиентов из брифа §3: цвета сверху вниз и цвет текста на них. */
const SEMEYSTVA = {
  testo: { cveta: ['#FFF3DF', '#F4C77A'], tekst: 'temnyy' },
  zhar: { cveta: ['#FFB03A', '#F0532D'], tekst: 'svetlyy' },
  zelen: { cveta: ['#E4F2B8', '#6FBF73'], tekst: 'temnyy' },
  sladkoe: { cveta: ['#FFD2B0', '#F26B8A'], tekst: 'svetlyy' },
  vino: { cveta: ['#8E2C55', '#4E1030'], tekst: 'svetlyy' },
  kombo: { cveta: ['#FFB03A', '#B8213F'], tekst: 'svetlyy' },
};

const estOkno = typeof window !== 'undefined' && typeof document !== 'undefined';
const podderzhkaLinear = estOkno && typeof CSS !== 'undefined' && CSS.supports
  && CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)');

// ---------------------------------------------------------------------------
// Пружины (локальная копия подхода из dvizhenie.js, чтобы модуль жил сам)
// ---------------------------------------------------------------------------

/**
 * Траектория затухающей пружины 0 → 1 полуявным Эйлером, шаг 1 мс.
 * @param {number} zhestkost
 * @param {number} zatuhanie
 * @returns {{tochki:number[], ms:number}}
 */
function rasschitatPruzhinu(zhestkost, zatuhanie) {
  const dt = 0.001;
  let x = 0;
  let v = 0;
  const tochki = [];
  let poslednijShum = 0;
  for (let i = 0; i < 3000; i++) {
    const uskorenie = -zhestkost * (x - 1) - zatuhanie * v;
    v += uskorenie * dt;
    x += v * dt;
    tochki.push(x);
    if (Math.abs(x - 1) > 0.003 || Math.abs(v) > 0.12) poslednijShum = i;
    if (i - poslednijShum > 40 && i > 120) break;
  }
  return { tochki, ms: poslednijShum + 1 };
}

/**
 * Пресет пружины: строка easing для WAAPI (`linear(...)` или запасной
 * cubic-bezier) и длительность, за которую пружина успокаивается.
 * @param {number} zhestkost
 * @param {number} zatuhanie
 * @param {string} zapasnoy
 * @returns {{easing:string, ms:number}}
 */
function sozdatPruzhinu(zhestkost, zatuhanie, zapasnoy) {
  const { tochki, ms } = rasschitatPruzhinu(zhestkost, zatuhanie);
  const znacheniya = [];
  for (let i = 0; i <= 64; i++) {
    const t = Math.min(ms - 1, Math.round((i / 64) * (ms - 1)));
    znacheniya.push(Number((i === 64 ? 1 : tochki[t]).toFixed(4)).toString());
  }
  return { easing: podderzhkaLinear ? `linear(${znacheniya.join(', ')})` : zapasnoy, ms };
}

const pruzhina = {
  myagkaya: sozdatPruzhinu(120, 20, 'cubic-bezier(.22, 1, .36, 1)'),
  obychnaya: sozdatPruzhinu(200, 22, 'cubic-bezier(.3, 1.25, .5, 1)'),
  zhivaya: sozdatPruzhinu(300, 18, 'cubic-bezier(.34, 1.56, .64, 1)'),
};

/** Снято ли движение настройкой «уменьшить движение». */
function dvizhenieSnyato() {
  return estOkno && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Короткая вибрация, если телефон умеет.
 * @param {number|number[]} uzor
 */
function vibro(uzor = 8) {
  try {
    if (!estOkno || !navigator.vibrate) return;
    // Без жеста пользователя Chrome пишет ошибку в консоль — не дёргаем
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(uzor);
  } catch (oshibka) { /* некоторые браузеры бросают без жеста пользователя — молчим */ }
}

/**
 * Отклик на касание: pointerdown — сжатие, pointerup — обратно с перелётом.
 * @param {HTMLElement} element
 * @param {number} szhatie
 */
function nazhatie(element, szhatie = 0.94) {
  const snyato = dvizhenieSnyato();
  let nazhat = false;
  element.addEventListener('pointerdown', (sobytie) => {
    if (sobytie.pointerType === 'mouse' && sobytie.button !== 0) return;
    nazhat = true;
    if (snyato) { element.style.opacity = '.75'; return; }
    element.animate([{ transform: 'scale(1)' }, { transform: `scale(${szhatie})` }],
      { duration: 120, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
  });
  // Отпускаем только то, что нажимали: иначе уход мыши с кнопки дёргал бы её пружиной
  const otpustit = () => {
    if (!nazhat) return;
    nazhat = false;
    if (snyato) { element.style.opacity = ''; return; }
    element.animate([{ transform: `scale(${szhatie})` }, { transform: 'scale(1)' }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, fill: 'forwards' });
  };
  element.addEventListener('pointerup', otpustit);
  element.addEventListener('pointercancel', otpustit);
  element.addEventListener('pointerleave', otpustit);
}

// ---------------------------------------------------------------------------
// Цвета
// ---------------------------------------------------------------------------

/**
 * Разбирает hex `#RRGGBB` в [r, g, b].
 * @param {string} hex
 * @returns {number[]}
 */
function hexVRgb(hex) {
  const chistyy = hex.replace('#', '');
  const polnyy = chistyy.length === 3 ? chistyy.split('').map((c) => c + c).join('') : chistyy;
  const n = parseInt(polnyy, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Относительная яркость по WCAG — чтобы выбрать тёмный или светлый текст.
 * @param {string} hex
 * @returns {number}
 */
function yarkost(hex) {
  const [r, g, b] = hexVRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Смешивает hex с чёрным/белым на долю `dolya` (отрицательная — затемнить).
 * @param {string} hex
 * @param {number} dolya
 * @returns {string}
 */
function sdvinutCvet(hex, dolya) {
  const cel = dolya < 0 ? 0 : 255;
  const k = Math.abs(dolya);
  return '#' + hexVRgb(hex).map((c) => Math.round(c + (cel - c) * k).toString(16).padStart(2, '0')).join('');
}

/**
 * Оформление сторис по полю `cvet`: два цвета градиента и тон текста.
 * @param {object} istoriya
 * @returns {{cveta:string[], tekst:'temnyy'|'svetlyy', podlozhka:string, gradient:string, kolco:string}}
 *   `podlozhka` — «r, g, b» подложки под текст для rgba()
 */
function oformlenie(istoriya) {
  const cvet = (istoriya && istoriya.cvet) || 'zhar';
  let cveta;
  let tekst;
  if (SEMEYSTVA[cvet]) {
    ({ cveta, tekst } = SEMEYSTVA[cvet]);
  } else if (/^#[0-9a-f]{3,6}$/i.test(cvet)) {
    cveta = [sdvinutCvet(cvet, 0.28), sdvinutCvet(cvet, -0.22)];
    tekst = yarkost(cveta[1]) > 0.35 ? 'temnyy' : 'svetlyy';
  } else {
    ({ cveta, tekst } = SEMEYSTVA.zhar);
  }
  // Подложка под текст поверх фото — не бурый, а глубокий тон своего семейства:
  // для светлого текста — нижний цвет, затемнённый на 62 % (белый на нём ≥ 7:1),
  // для тёмного — верхний, высветленный к крему (уголь на нём ≥ 12:1)
  const [r, g, b] = hexVRgb(tekst === 'svetlyy' ? sdvinutCvet(cveta[1], -0.62) : sdvinutCvet(cveta[0], 0.6));
  return {
    cveta,
    tekst,
    podlozhka: `${r}, ${g}, ${b}`,
    gradient: `linear-gradient(168deg, ${cveta[0]} 0%, ${cveta[1]} 100%)`,
    kolco: `conic-gradient(from var(--istoriya-ugol, 0deg), ${cveta[1]}, ${cveta[0]}, #FFB03A, ${cveta[1]})`,
  };
}

// ---------------------------------------------------------------------------
// Просмотренные — localStorage
// ---------------------------------------------------------------------------

/**
 * Читает карту просмотров { id: время } из localStorage; при любой беде — {}.
 * @returns {Record<string, number>}
 */
function prochitatProsmotry() {
  try {
    const syroe = localStorage.getItem(KLYUCH_HRANILISHCHA);
    const dannye = syroe ? JSON.parse(syroe) : {};
    return dannye && typeof dannye === 'object' ? dannye : {};
  } catch (oshibka) {
    return {};
  }
}

/**
 * Просмотрена ли сторис с таким id.
 * @param {string} id
 * @returns {boolean}
 */
export function prosmotrenaLi(id) {
  return Boolean(prochitatProsmotry()[id]);
}

/**
 * Отмечает сторис просмотренной: пишет в localStorage и шлёт на `document`
 * событие `hinkalnaya:istoriya-prosmotrena` с `detail.id` — кружки ряда
 * перекрашиваются сами.
 * @param {string} id
 */
export function otmetitProsmotrennoy(id) {
  const prosmotry = prochitatProsmotry();
  if (prosmotry[id]) return;
  prosmotry[id] = Date.now();
  try {
    localStorage.setItem(KLYUCH_HRANILISHCHA, JSON.stringify(prosmotry));
  } catch (oshibka) { /* приватный режим — просто не запомним */ }
  if (estOkno) document.dispatchEvent(new CustomEvent(SOBYTIE_PROSMOTRA, { detail: { id } }));
}

/** Забывает все просмотры (кольца снова цветные). */
export function sbrositProsmotry() {
  const byli = Object.keys(prochitatProsmotry());
  try {
    localStorage.removeItem(KLYUCH_HRANILISHCHA);
  } catch (oshibka) { /* нечего сбрасывать */ }
  if (estOkno) document.dispatchEvent(new CustomEvent(SOBYTIE_PROSMOTRA, { detail: { id: null, sbros: true, byli } }));
}

// ---------------------------------------------------------------------------
// Данные
// ---------------------------------------------------------------------------

let keshIstoriy = null;

/**
 * Загружает `istorii.json` (лежит рядом с папкой js/), кеширует в памяти.
 * При ошибке сети возвращает [] — ряд просто не показывается.
 * @returns {Promise<object[]>}
 */
export async function zagruzitIstorii() {
  if (keshIstoriy) return keshIstoriy;
  try {
    const otvet = await fetch(new URL('../istorii.json', import.meta.url));
    if (!otvet.ok) throw new Error(`istorii.json: ${otvet.status}`);
    const spisok = await otvet.json();
    keshIstoriy = Array.isArray(spisok) ? spisok : [];
  } catch (oshibka) {
    keshIstoriy = [];
  }
  return keshIstoriy;
}

/**
 * Адрес картинки сторис относительно корня витрины (модуль лежит в js/).
 * @param {object} istoriya
 * @returns {string|null}
 */
function adresKartinki(istoriya) {
  if (!istoriya || !istoriya.kartinka) return null;
  if (/^(https?:)?\/\//.test(istoriya.kartinka) || istoriya.kartinka.startsWith('data:')) return istoriya.kartinka;
  return new URL('../' + istoriya.kartinka.replace(/^\.?\//, ''), import.meta.url).href;
}

/**
 * Короткий крупный знак для заглушки и кружка: поле `znak` («−20%», «10+2»)
 * или первое слово заголовка. Эмодзи отбрасываются — на разных телефонах они
 * рисуются по-разному, а заглушка — это типографика.
 * @param {object} istoriya
 * @returns {string}
 */
function tekstZnakaIstorii(istoriya) {
  const bezEmodzi = (s) => String(s || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').trim();
  const znak = bezEmodzi(istoriya && istoriya.znak);
  if (znak) return znak;
  const slovo = bezEmodzi(istoriya && istoriya.zagolovok).split(/\s+/)[0] || '';
  return Array.from(slovo).slice(0, 5).join('');
}

/**
 * Заранее тянет картинку сторис в кеш браузера, чтобы следующий кадр
 * не мигал градиентом. Ошибки глушим — картинки может ещё не быть.
 * @param {object} istoriya
 */
function podgruzitKartinku(istoriya) {
  const adres = adresKartinki(istoriya);
  if (!adres || podgruzheno.has(adres)) return;
  podgruzheno.add(adres);
  const img = new Image();
  img.decoding = 'async';
  img.onerror = () => {};
  img.src = adres;
}
const podgruzheno = new Set();

/**
 * Текст кнопки действия: своё поле `knopka` или подпись по типу действия.
 * @param {object} istoriya
 * @returns {string}
 */
function tekstKnopki(istoriya) {
  if (istoriya.knopka) return istoriya.knopka;
  const tip = istoriya.deystvie && istoriya.deystvie.tip;
  if (tip === 'blyudo') return 'К блюду';
  if (tip === 'razdel') return 'В раздел';
  if (tip === 'ssylka') return 'Открыть';
  return 'Смотреть меню';
}

// ---------------------------------------------------------------------------
// Стили — вставляются один раз
// ---------------------------------------------------------------------------

const STILI = `
@property --istoriya-ugol { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes istoriya-kolco-vrashchenie { to { --istoriya-ugol: 360deg; } }
@keyframes istoriya-ken-berns { from { transform: scale(1.04) translate(0, 0); } to { transform: scale(1.16) translate(-1.5%, -2%); } }
@keyframes istoriya-pulsaciya { 0%, 100% { opacity: .55; } 50% { opacity: .9; } }

.istoriya-krug {
  --istoriya-razmer: 72px;
  appearance: none; border: 0; background: none; padding: 0; margin: 0;
  display: inline-flex; flex-direction: column; align-items: center; gap: 6px;
  width: calc(var(--istoriya-razmer) + 12px); cursor: pointer; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent; font: inherit; color: #231A14;
  transform-origin: 50% 40%;
}
.istoriya-krug:focus-visible { outline: 2px solid #F0532D; outline-offset: 4px; border-radius: 12px; }
.istoriya-krug__kolco {
  position: relative; width: var(--istoriya-razmer); height: var(--istoriya-razmer); border-radius: 999px;
  padding: 3px; box-sizing: border-box;
  background: var(--istoriya-kolco);
  animation: istoriya-kolco-vrashchenie 5s linear infinite;
  box-shadow: 0 8px 18px -8px rgba(120, 60, 20, .35);
}
.istoriya-krug--prosmotrena .istoriya-krug__kolco { background: #D9CDBB; animation: none; box-shadow: none; }
.istoriya-krug__vnutri {
  position: relative; display: block; width: 100%; height: 100%; border-radius: 999px; overflow: hidden;
  border: 2px solid #FFF7EC; box-sizing: border-box;
  background: var(--istoriya-gradient);
}
.istoriya-krug__vnutri img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
}
.istoriya-krug__vnutri b {
  position: absolute; inset: 0; display: grid; place-items: center; white-space: nowrap;
  font-family: 'Unbounded', 'Onest', system-ui, sans-serif; font-weight: 800; font-size: 17px; letter-spacing: -.03em;
  color: #fff; text-shadow: 0 2px 8px rgba(80, 20, 0, .35); pointer-events: none;
}
.istoriya-krug--temnyy .istoriya-krug__vnutri b { color: #231A14; text-shadow: 0 1px 0 rgba(255, 255, 255, .5); }
.istoriya-krug--prosmotrena .istoriya-krug__vnutri { filter: saturate(.55); opacity: .85; }
.istoriya-krug__podpis {
  font-family: 'Onest', system-ui, sans-serif; font-size: 13px; line-height: 1.15; font-weight: 600;
  text-align: center; max-width: 100%; overflow: hidden;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; text-wrap: balance;
}
.istoriya-krug--prosmotrena .istoriya-krug__podpis { opacity: .6; }

.istorii-prosmotr {
  position: fixed; inset: 0; z-index: 1000; background: rgba(20, 8, 4, 1);
  color: #fff; font-family: 'Onest', system-ui, sans-serif; overflow: hidden;
  touch-action: none; -webkit-user-select: none; user-select: none; overscroll-behavior: contain;
  --istorii-verh: env(safe-area-inset-top, 0px); --istorii-niz: env(safe-area-inset-bottom, 0px);
}
.istorii-prosmotr__telefon {
  position: absolute; inset: 0; margin: 0 auto; max-width: 520px; overflow: hidden;
  background: #1a0a06; will-change: transform; border-radius: 0;
}
@media (min-width: 560px) { .istorii-prosmotr__telefon { inset: 16px 0; border-radius: 28px; max-height: 960px; } }
.istorii-prosmotr__scena { position: absolute; inset: 0; perspective: 1400px; transform-style: preserve-3d; }
.istorii-prosmotr__kadr {
  position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; will-change: transform;
  background: var(--istoriya-gradient); --px: 0; --py: 0;
  container-type: inline-size;
}
.istorii-prosmotr__sloy {
  position: absolute; inset: 0; transform-origin: 50% 40%;
  translate: calc(var(--px) * -7px) calc(var(--py) * -5px);
  transition: translate .4s cubic-bezier(.2, .8, .3, 1);
}
.istorii-prosmotr__sloy--dvizhetsya { animation: istoriya-ken-berns ${DLITELNOST_KADRA + 800}ms cubic-bezier(.3, .1, .6, .9) forwards; }
.istorii-prosmotr__kartinka {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0;
  transition: opacity .5s ease;
}
.istorii-prosmotr__kartinka--gotova { opacity: 1; }
.istorii-prosmotr__kartinka--net { display: none; }
.istorii-prosmotr__zaglushka {
  position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; pointer-events: none;
}
.istorii-prosmotr__zaglushka::before {
  content: ''; position: absolute; width: 130vw; height: 130vw; max-width: 720px; max-height: 720px;
  border-radius: 999px; left: 50%; top: 36%; translate: -50% -50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, .34), rgba(255, 255, 255, 0));
  animation: istoriya-pulsaciya 4s ease-in-out infinite;
}
.istorii-prosmotr__zaglushka b {
  position: relative; font-family: 'Unbounded', 'Onest', system-ui, sans-serif; font-weight: 900; font-size: min(38cqw, 190px);
  letter-spacing: -.05em; line-height: 1; color: rgba(255, 255, 255, .94); margin-top: -30%; white-space: nowrap;
  text-shadow: 0 18px 40px rgba(80, 20, 0, .28); rotate: -6deg; transform-origin: center;
}
/* Эхо знака контуром — второй план типографики, чуть сдвинут и крупнее */
.istorii-prosmotr__zaglushka b::after {
  content: attr(data-znak); position: absolute; left: 0; top: 0; z-index: -1;
  translate: .06em .5em; scale: 1.08; color: transparent; text-shadow: none;
  -webkit-text-stroke: 2px rgba(255, 255, 255, .45);
}
.istorii-prosmotr__kadr--temnyy .istorii-prosmotr__zaglushka b { color: rgba(35, 26, 20, .86); text-shadow: 0 2px 0 rgba(255, 255, 255, .55); }
.istorii-prosmotr__kadr--temnyy .istorii-prosmotr__zaglushka b::after { -webkit-text-stroke-color: rgba(106, 27, 58, .28); }
.istorii-prosmotr__zaglushka--skryta { display: none; }
/* Цвет семейства поверх фото: мягкий свет градиента, чтобы кадр «звучал» своим цветом */
.istorii-prosmotr__ottenok {
  position: absolute; inset: 0; pointer-events: none; background: var(--istoriya-gradient);
  mix-blend-mode: soft-light; opacity: 0; transition: opacity .6s ease;
}
.istorii-prosmotr__kadr--s-foto .istorii-prosmotr__ottenok { opacity: .55; }
.istorii-prosmotr__zatemnenie {
  position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, .42) 0%, rgba(0, 0, 0, 0) 22%),
    linear-gradient(0deg, rgba(var(--istoriya-podlozhka), .9) 0%, rgba(var(--istoriya-podlozhka), .62) 26%, rgba(var(--istoriya-podlozhka), 0) 58%);
}
.istorii-prosmotr__kadr--temnyy .istorii-prosmotr__zatemnenie {
  background:
    linear-gradient(180deg, rgba(0, 0, 0, .4) 0%, rgba(0, 0, 0, 0) 22%),
    linear-gradient(0deg, rgba(var(--istoriya-podlozhka), .94) 0%, rgba(var(--istoriya-podlozhka), .68) 26%, rgba(var(--istoriya-podlozhka), 0) 58%);
}
.istorii-prosmotr__tekst {
  position: absolute; left: 0; right: 0; bottom: calc(var(--istorii-niz) + 112px); padding: 0 22px;
  translate: calc(var(--px) * 5px) calc(var(--py) * 3px);
  transition: translate .4s cubic-bezier(.2, .8, .3, 1), opacity .25s ease;
}
.istorii-prosmotr__zagolovok {
  margin: 0 0 12px; font-family: 'Unbounded', 'Onest', system-ui, sans-serif; font-weight: 800;
  font-size: clamp(26px, 8.4vw, 36px); line-height: 1.06; letter-spacing: -.02em; text-wrap: balance;
  text-shadow: 0 4px 22px rgba(60, 15, 0, .35);
}
.istorii-prosmotr__opisanie {
  margin: 0; font-size: 17px; line-height: 1.35; font-weight: 500; max-width: 34ch;
  text-shadow: 0 2px 12px rgba(60, 15, 0, .35);
}
.istorii-prosmotr__kadr--temnyy { color: #231A14; }
.istorii-prosmotr__kadr--temnyy .istorii-prosmotr__zagolovok,
.istorii-prosmotr__kadr--temnyy .istorii-prosmotr__opisanie { text-shadow: 0 1px 0 rgba(255, 255, 255, .5); }
.istorii-prosmotr__verh {
  position: absolute; left: 0; right: 0; top: 0; padding: calc(var(--istorii-verh) + 10px) 12px 0; z-index: 3;
  transition: opacity .25s ease;
}
.istorii-prosmotr__poloski { display: flex; gap: 4px; }
.istorii-prosmotr__poloska {
  flex: 1; height: 3px; border-radius: 999px; background: rgba(255, 255, 255, .32); overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .15);
}
.istorii-prosmotr__poloska i {
  display: block; height: 100%; width: 100%; background: #fff; transform: scaleX(0); transform-origin: left center;
  border-radius: inherit;
}
.istorii-prosmotr__poloska--byla i { transform: scaleX(1); }
.istorii-prosmotr__shapka { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.istorii-prosmotr__marka {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Unbounded', 'Onest', system-ui, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: .01em;
  color: #fff; text-shadow: 0 1px 6px rgba(0, 0, 0, .35); padding-left: 4px;
}
.istorii-prosmotr__marka i {
  width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center; flex: none;
  background: linear-gradient(150deg, #FFB03A, #F0532D); box-shadow: 0 2px 6px rgba(0, 0, 0, .25);
}
.istorii-prosmotr__marka svg { width: 22px; height: 22px; }
.istorii-prosmotr__zakryt {
  appearance: none; border: 0; width: 44px; height: 44px; border-radius: 999px; cursor: pointer;
  background: rgba(0, 0, 0, .28); color: #fff; display: grid; place-items: center; -webkit-tap-highlight-color: transparent;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.istorii-prosmotr__zakryt svg { width: 20px; height: 20px; }
.istorii-prosmotr__tap {
  position: absolute; top: calc(var(--istorii-verh) + 70px); bottom: calc(var(--istorii-niz) + 96px); z-index: 2;
  appearance: none; border: 0; background: transparent; padding: 0; margin: 0; cursor: pointer; -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
.istorii-prosmotr__tap--nazad { left: 0; width: 34%; }
.istorii-prosmotr__tap--vpered { right: 0; width: 66%; }
.istorii-prosmotr__niz {
  position: absolute; left: 0; right: 0; bottom: 0; padding: 0 20px calc(var(--istorii-niz) + 22px); z-index: 3;
  display: flex; justify-content: center; transition: opacity .25s ease;
}
.istorii-prosmotr__deystvie {
  appearance: none; border: 0; cursor: pointer; -webkit-tap-highlight-color: transparent;
  min-height: 54px; padding: 0 26px; border-radius: 16px; width: 100%; max-width: 420px;
  font-family: 'Unbounded', 'Onest', system-ui, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: .005em;
  color: #231A14; background: #FFF7EC;
  box-shadow: 0 12px 28px -8px rgba(60, 15, 0, .45), inset 0 -2px 0 rgba(120, 60, 20, .12);
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
}
.istorii-prosmotr__deystvie svg { width: 18px; height: 18px; flex: none; }
.istorii-prosmotr--temnyy .istorii-prosmotr__deystvie { color: #fff; background: linear-gradient(135deg, #F0532D, #B8213F); }
.istorii-prosmotr--temnyy .istorii-prosmotr__podskazka { color: #231A14; }
.istorii-prosmotr:focus { outline: none; }
.istorii-prosmotr--derzhat .istorii-prosmotr__verh,
.istorii-prosmotr--derzhat .istorii-prosmotr__niz,
.istorii-prosmotr--derzhat .istorii-prosmotr__tekst { opacity: 0; }
.istorii-prosmotr__podskazka {
  position: absolute; left: 0; right: 0; bottom: calc(var(--istorii-niz) + 86px); text-align: center; pointer-events: none;
  font-size: 13px; opacity: .6; z-index: 3; letter-spacing: .02em;
}
@media (prefers-reduced-motion: reduce) {
  .istoriya-krug__kolco { animation: none; }
  .istorii-prosmotr__sloy--dvizhetsya { animation: none; }
  .istorii-prosmotr__zaglushka::before { animation: none; }
}
`;

/** Кладёт стили модуля в `<head>`, если их там ещё нет. */
function vstavitStili() {
  if (!estOkno || document.getElementById('istorii-stili')) return;
  const stil = document.createElement('style');
  stil.id = 'istorii-stili';
  stil.textContent = STILI;
  document.head.appendChild(stil);
}

// ---------------------------------------------------------------------------
// Кружок превью
// ---------------------------------------------------------------------------

/**
 * Круглое превью сторис 72 px: градиентное кольцо (conic-gradient, медленно
 * вращается), внутри — картинка `kartinki/istorii/<id>.jpg` или знак на
 * градиенте семейства, снизу подпись. Просмотренная — серое кольцо. Кружок
 * сам слушает событие просмотра и перекрашивается; тап — с пружиной.
 * Открытие просмотрщика вешает вызывающий: `krug.addEventListener('click', …)`.
 * @param {object} istoriya запись из istorii.json
 * @param {boolean} [prosmotrena] по умолчанию — из localStorage
 * @returns {HTMLButtonElement}
 */
export function krugIstorii(istoriya, prosmotrena = prosmotrenaLi(istoriya.id)) {
  vstavitStili();
  const oform = oformlenie(istoriya);
  const knopka = document.createElement('button');
  knopka.type = 'button';
  knopka.className = 'istoriya-krug';
  if (oform.tekst === 'temnyy') knopka.classList.add('istoriya-krug--temnyy');
  knopka.dataset.id = istoriya.id;
  knopka.style.setProperty('--istoriya-kolco', oform.kolco);
  knopka.style.setProperty('--istoriya-gradient', oform.gradient);
  knopka.setAttribute('aria-label', `Сторис: ${istoriya.zagolovok}`);

  const kolco = document.createElement('span');
  kolco.className = 'istoriya-krug__kolco';
  const vnutri = document.createElement('span');
  vnutri.className = 'istoriya-krug__vnutri';
  const znak = document.createElement('b');
  znak.textContent = tekstZnakaIstorii(istoriya);
  // В 62 px внутреннего круга: 4 знака — 17 px, длиннее — мельче
  znak.style.fontSize = `${Math.min(17, Math.floor(64 / Math.max(3, Array.from(znak.textContent).length)))}px`;
  vnutri.appendChild(znak);
  const adres = adresKartinki(istoriya);
  if (adres) {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.addEventListener('load', () => { znak.style.display = 'none'; });
    // кружок 62 px — превью 160 px из kartinki/istorii/m/; нет превью — оригинал; нет и его — знак
    const prevyu = /\/kartinki\/istorii\/[^/]+\.jpg$/.test(adres) ? adres.replace(/\/kartinki\/istorii\//, '/kartinki/istorii/m/') : null;
    img.addEventListener('error', () => {
      if (prevyu && img.src === prevyu) { img.src = adres; return; }
      img.remove();
    });
    img.src = prevyu || adres;
    vnutri.appendChild(img);
  }
  kolco.appendChild(vnutri);
  const podpis = document.createElement('span');
  podpis.className = 'istoriya-krug__podpis';
  podpis.textContent = istoriya.podpis || istoriya.zagolovok;
  knopka.append(kolco, podpis);

  const pometit = (da) => knopka.classList.toggle('istoriya-krug--prosmotrena', Boolean(da));
  pometit(prosmotrena);
  // Кружок, который уже убрали со страницы (ряд пересобрали), отписывается сам — чтобы не копить слушатели
  const naProsmotr = (sobytie) => {
    if (!knopka.isConnected && knopka.dataset.byl === '1') {
      document.removeEventListener(SOBYTIE_PROSMOTRA, naProsmotr);
      return;
    }
    if (knopka.isConnected) knopka.dataset.byl = '1';
    const detail = sobytie.detail || {};
    if (detail.sbros) pometit(false);
    else if (detail.id === istoriya.id) pometit(true);
  };
  document.addEventListener(SOBYTIE_PROSMOTRA, naProsmotr);
  nazhatie(knopka, 0.9);
  return knopka;
}

// ---------------------------------------------------------------------------
// Просмотрщик
// ---------------------------------------------------------------------------

const ZNACHOK_ZAKRYT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
/** Хинкали-мешочек с хвостиком и глазками — значок марки в шапке сторис. */
const ZNACHOK_HINKALI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 16.6C4.2 11.6 7.6 8.4 10.9 5.8V3.4c0-.7 2.2-.7 2.2 0v2.4c3.3 2.6 6.7 5.8 6.7 10.8 0 3.2-3.7 4.6-7.8 4.6s-7.8-1.4-7.8-4.6z" fill="#F7E6C4" stroke="#9A6330" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 6.2 7.2 14.4M12 6.2l-2 9.6M12 6.2l2 9.6M12 6.2l4.8 8.2" stroke="#C99A62" stroke-width=".9" stroke-linecap="round" fill="none"/><circle cx="9.9" cy="16.9" r="1.05" fill="#231A14"/><circle cx="14.1" cy="16.9" r="1.05" fill="#231A14"/></svg>';
const ZNACHOK_STRELKA ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

/**
 * Собирает DOM одного кадра сторис: градиент семейства, картинка (если
 * загрузится), заглушка с крупным знаком, затемнение и текст.
 * @param {object} istoriya
 * @param {{bezKartinok?:boolean}} opcii
 * @returns {HTMLElement}
 */
function sobratKadr(istoriya, opcii) {
  const oform = oformlenie(istoriya);
  const kadr = document.createElement('article');
  kadr.className = 'istorii-prosmotr__kadr';
  if (oform.tekst === 'temnyy') kadr.classList.add('istorii-prosmotr__kadr--temnyy');
  kadr.style.setProperty('--istoriya-gradient', oform.gradient);
  kadr.style.setProperty('--istoriya-podlozhka', oform.podlozhka);
  kadr.dataset.id = istoriya.id;

  const sloy = document.createElement('div');
  sloy.className = 'istorii-prosmotr__sloy';
  if (!dvizhenieSnyato()) sloy.classList.add('istorii-prosmotr__sloy--dvizhetsya');

  // Место под картинку: пока её нет — крупная типографика Unbounded на градиенте семейства
  const zaglushka = document.createElement('div');
  zaglushka.className = 'istorii-prosmotr__zaglushka';
  const znak = document.createElement('b');
  const tekstZnaka = tekstZnakaIstorii(istoriya);
  znak.textContent = tekstZnaka;
  znak.dataset.znak = tekstZnaka;
  // Крупно, но чтобы влезло в ширину кадра (cqw — от кадра, а не окна: на планшете кадр уже окна)
  znak.style.fontSize = `min(${(84 / Math.max(2, Array.from(tekstZnaka).length)).toFixed(1)}cqw, 190px)`;
  zaglushka.appendChild(znak);
  sloy.appendChild(zaglushka);

  const adres = opcii.bezKartinok ? null : adresKartinki(istoriya);
  if (adres) {
    const img = document.createElement('img');
    img.className = 'istorii-prosmotr__kartinka';
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('load', () => {
      img.classList.add('istorii-prosmotr__kartinka--gotova');
      kadr.classList.add('istorii-prosmotr__kadr--s-foto');
      zaglushka.classList.add('istorii-prosmotr__zaglushka--skryta');
    });
    // Картинки ещё нет (или не загрузилась) — прячем, кадр остаётся на градиенте с типографикой
    img.addEventListener('error', () => { img.classList.add('istorii-prosmotr__kartinka--net'); });
    img.src = adres;
    sloy.appendChild(img);
  }
  const ottenok = document.createElement('div');
  ottenok.className = 'istorii-prosmotr__ottenok';
  sloy.appendChild(ottenok);
  kadr.appendChild(sloy);

  const zatemnenie = document.createElement('div');
  zatemnenie.className = 'istorii-prosmotr__zatemnenie';
  kadr.appendChild(zatemnenie);

  const tekst = document.createElement('div');
  tekst.className = 'istorii-prosmotr__tekst';
  const zagolovok = document.createElement('h2');
  zagolovok.className = 'istorii-prosmotr__zagolovok';
  zagolovok.textContent = istoriya.zagolovok || '';
  const opisanie = document.createElement('p');
  opisanie.className = 'istorii-prosmotr__opisanie';
  opisanie.textContent = istoriya.tekst || '';
  tekst.append(zagolovok, opisanie);
  kadr.appendChild(tekst);
  return kadr;
}

/**
 * Полноэкранный просмотрщик сторис.
 *
 * Управление: полоски прогресса сверху, 5 с на кадр; удержание пальца —
 * пауза (интерфейс прячется); тап по правым двум третям — вперёд, по левой
 * трети — назад; свайп влево/вправо — вперёд/назад; свайп вниз — закрыть
 * (экран уезжает за пальцем и уменьшается); крестик, Escape и кнопка «назад»
 * телефона — закрыть. Кнопка действия внизу выезжает с пружиной; нажатие
 * закрывает просмотрщик и зовёт `opcii.naDeystvie(deystvie, istoriya)` —
 * уже после того, как своя запись history снята, так что обработчик может
 * спокойно менять адрес (`#/blyudo/<id>`). Пока сторис открыта, в history
 * лежит запись с `state.hinkalnayaIstorii === true` — маршрутизатору её
 * стоит пропускать. Показанные кадры отмечаются просмотренными.
 *
 * @param {object[]} spisok записи istorii.json
 * @param {number} [startIndex=0] с какой сторис начать
 * @param {object} [opcii]
 * @param {(deystvie:object, istoriya:object)=>void} [opcii.naDeystvie] обработчик кнопки действия
 * @param {(istoriya:object, index:number)=>void} [opcii.naPokaz] вызывается при показе каждого кадра
 * @param {boolean} [opcii.bezKartinok=false] не грузить картинки — только градиент и типографика (для проверки заглушки)
 * @param {boolean} [opcii.istoriyaBrauzera=true] класть запись в history, чтобы «назад» закрывал сторис, а не витрину
 * @param {number} [opcii.dlitelnost=5000] мс на кадр
 * @param {number} [opcii.perekhodMs=520] длительность «куба» между кадрами (при reduced-motion — 200, кроссфейд)
 * @param {HTMLElement} [opcii.kontejner=document.body] куда вставить просмотрщик
 * @returns {Promise<{prichina:'zakryto'|'konec'|'deystvie', istoriya:object|null, index:number}>} разрешается при закрытии
 */
export function pokazatIstorii(spisok, startIndex = 0, opcii = {}) {
  vstavitStili();
  const istorii = Array.isArray(spisok) ? spisok.filter(Boolean) : [];
  if (!istorii.length) return Promise.resolve({ prichina: 'zakryto', istoriya: null, index: -1 });
  const nastroyki = {
    naDeystvie: null,
    naPokaz: null,
    bezKartinok: false,
    istoriyaBrauzera: true,
    dlitelnost: DLITELNOST_KADRA,
    perekhodMs: 520,
    kontejner: document.body,
    ...opcii,
  };
  const snyato = dvizhenieSnyato();
  const dlitelnostPerekhoda = snyato ? 200 : nastroyki.perekhodMs;

  // ----- DOM
  const koren = document.createElement('div');
  koren.className = 'istorii-prosmotr';
  koren.setAttribute('role', 'dialog');
  koren.setAttribute('aria-modal', 'true');
  koren.setAttribute('aria-label', 'Сторис Хинкальной');
  koren.innerHTML = `
    <div class="istorii-prosmotr__telefon">
      <div class="istorii-prosmotr__scena"></div>
      <div class="istorii-prosmotr__verh">
        <div class="istorii-prosmotr__poloski">${istorii.map(() => '<span class="istorii-prosmotr__poloska"><i></i></span>').join('')}</div>
        <div class="istorii-prosmotr__shapka">
          <span class="istorii-prosmotr__marka"><i>${ZNACHOK_HINKALI}</i>Хинкальная</span>
          <button type="button" class="istorii-prosmotr__zakryt" aria-label="Закрыть">${ZNACHOK_ZAKRYT}</button>
        </div>
      </div>
      <button type="button" class="istorii-prosmotr__tap istorii-prosmotr__tap--nazad" aria-label="Предыдущая сторис"></button>
      <button type="button" class="istorii-prosmotr__tap istorii-prosmotr__tap--vpered" aria-label="Следующая сторис"></button>
      <div class="istorii-prosmotr__podskazka">свайп вниз — закрыть</div>
      <div class="istorii-prosmotr__niz">
        <button type="button" class="istorii-prosmotr__deystvie"><span></span>${ZNACHOK_STRELKA}</button>
      </div>
    </div>`;
  const telefon = koren.querySelector('.istorii-prosmotr__telefon');
  const scena = koren.querySelector('.istorii-prosmotr__scena');
  const poloski = Array.from(koren.querySelectorAll('.istorii-prosmotr__poloska'));
  const knopkaZakryt = koren.querySelector('.istorii-prosmotr__zakryt');
  const knopkaDeystvie = koren.querySelector('.istorii-prosmotr__deystvie');
  const tekstDeystviya = knopkaDeystvie.querySelector('span');
  const podskazka = koren.querySelector('.istorii-prosmotr__podskazka');
  const zonyTapa = Array.from(koren.querySelectorAll('.istorii-prosmotr__tap'));

  // ----- состояние
  let tekushchiy = Math.min(Math.max(0, startIndex | 0), istorii.length - 1);
  let kadr = null;
  let progress = null;
  let zanyat = false;
  let zakryt = false;
  let naPauze = false;
  let resolvePromise;
  const obeshchanie = new Promise((resolve) => { resolvePromise = resolve; });
  const bylOverflow = document.body.style.overflow;
  const bylAktivnyy = document.activeElement;
  let zapisVIstorii = false;
  let zakryvaemPoPopstate = false;

  /** Ставит полоски: до текущей — полные, текущая — по анимации, после — пустые. */
  function obnovitPoloski() {
    poloski.forEach((p, i) => {
      p.classList.toggle('istorii-prosmotr__poloska--byla', i < tekushchiy);
      if (i !== tekushchiy) {
        const zapolnenie = p.firstElementChild;
        zapolnenie.getAnimations().forEach((a) => a.cancel());
        zapolnenie.style.transform = i < tekushchiy ? 'scaleX(1)' : 'scaleX(0)';
      }
    });
  }

  /** Запускает таймер кадра — анимацию заполнения текущей полоски. */
  function zapustitProgress() {
    const zapolnenie = poloski[tekushchiy].firstElementChild;
    zapolnenie.getAnimations().forEach((a) => a.cancel());
    zapolnenie.style.transform = '';
    progress = zapolnenie.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: nastroyki.dlitelnost, easing: 'linear', fill: 'forwards' },
    );
    progress.onfinish = () => { if (!zakryt && !zanyat) dalshe('avto'); };
    if (naPauze) progress.pause();
  }

  /** Пауза таймера и зума (удержание пальца, скрытая вкладка). */
  function pauza() {
    if (naPauze) return;
    naPauze = true;
    if (progress) progress.pause();
    kadr && kadr.querySelectorAll('.istorii-prosmotr__sloy').forEach((s) => s.getAnimations().forEach((a) => a.pause()));
    koren.classList.add('istorii-prosmotr--derzhat');
  }

  function prodolzhit() {
    if (!naPauze) return;
    naPauze = false;
    if (progress && progress.playState === 'paused') progress.play();
    kadr && kadr.querySelectorAll('.istorii-prosmotr__sloy').forEach((s) => s.getAnimations().forEach((a) => a.play()));
    koren.classList.remove('istorii-prosmotr--derzhat');
  }

  /** Пружинное появление кнопки действия при каждом новом кадре. */
  function pokazatKnopku(istoriya) {
    tekstDeystviya.textContent = tekstKnopki(istoriya);
    knopkaDeystvie.hidden = !istoriya.deystvie;
    if (snyato || !istoriya.deystvie) return;
    knopkaDeystvie.animate(
      [{ transform: 'translateY(26px) scale(.92)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, delay: 120, fill: 'backwards' },
    );
  }

  /**
   * Показывает кадр с индексом `index`; `napravlenie` 1 — вперёд (куб крутится
   * влево), -1 — назад, 0 — первый показ без перехода.
   * @returns {Promise<void>}
   */
  async function pokazatKadr(index, napravlenie) {
    zanyat = true;
    const istoriya = istorii[index];
    const staryy = kadr;
    tekushchiy = index;
    kadr = sobratKadr(istoriya, nastroyki);
    scena.appendChild(kadr);
    koren.classList.toggle('istorii-prosmotr--temnyy', kadr.classList.contains('istorii-prosmotr__kadr--temnyy'));
    obnovitPoloski();
    pokazatKnopku(istoriya);
    otmetitProsmotrennoy(istoriya.id);
    if (!nastroyki.bezKartinok) podgruzitKartinku(istorii[index + 1]);
    if (typeof nastroyki.naPokaz === 'function') nastroyki.naPokaz(istoriya, index);

    if (staryy && napravlenie) {
      vibro(6);
      const animacii = [];
      if (snyato) {
        animacii.push(staryy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dlitelnostPerekhoda, easing: 'ease', fill: 'forwards' }));
        animacii.push(kadr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dlitelnostPerekhoda, easing: 'ease', fill: 'forwards' }));
      } else {
        // Настоящий «куб»: обе грани вращаются вокруг оси, стоящей на глубине
        // половины ширины за экраном. Вперёд — старая грань уходит влево, новая
        // приходит справа; назад — зеркально. Середину пути куб чуть отъезжает
        // вглубь, чтобы было видно ребро.
        const easing = 'cubic-bezier(.45, .05, .2, 1)';
        const polovina = (scena.getBoundingClientRect().width || 390) / 2;
        const os = `50% 50% -${polovina}px`;
        const ugol = napravlenie > 0 ? 90 : -90;
        staryy.style.transformOrigin = os;
        kadr.style.transformOrigin = os;
        animacii.push(staryy.animate(
          [
            { transform: 'translateZ(0) rotateY(0deg)', filter: 'brightness(1)' },
            { transform: `translateZ(-${polovina * 0.35}px) rotateY(${-ugol / 2}deg)`, filter: 'brightness(.8)', offset: 0.5 },
            { transform: `translateZ(0) rotateY(${-ugol}deg)`, filter: 'brightness(.45)' },
          ],
          { duration: dlitelnostPerekhoda, easing, fill: 'forwards' },
        ));
        animacii.push(kadr.animate(
          [
            { transform: `translateZ(0) rotateY(${ugol}deg)`, filter: 'brightness(.45)' },
            { transform: `translateZ(-${polovina * 0.35}px) rotateY(${ugol / 2}deg)`, filter: 'brightness(.8)', offset: 0.5 },
            { transform: 'translateZ(0) rotateY(0deg)', filter: 'brightness(1)' },
          ],
          { duration: dlitelnostPerekhoda, easing, fill: 'forwards' },
        ));
      }
      await Promise.all(animacii.map((a) => a.finished.catch(() => {})));
      staryy.remove();
      kadr.style.transformOrigin = '';
      animacii.forEach((a) => a.cancel());
    } else if (staryy) {
      staryy.remove();
    }
    zanyat = false;
    if (!zakryt) zapustitProgress();
  }

  /** Вперёд; в конце списка — закрыть с причиной «конец». */
  function dalshe(istochnik) {
    if (zanyat || zakryt) return;
    if (tekushchiy + 1 >= istorii.length) {
      zakrytie('konec');
      return;
    }
    pokazatKadr(tekushchiy + 1, 1);
    if (istochnik !== 'avto') vibro(6);
  }

  /** Назад; на первой — перезапуск текущего кадра. */
  function nazad() {
    if (zanyat || zakryt) return;
    if (tekushchiy === 0) { zapustitProgress(); return; }
    pokazatKadr(tekushchiy - 1, -1);
  }

  // ----- закрытие
  function ubratSlushateli() {
    document.removeEventListener('keydown', naKlavishu);
    document.removeEventListener('visibilitychange', naVidimost);
    window.removeEventListener('popstate', naPopstate);
    window.removeEventListener('deviceorientation', naOrientaciyu);
  }

  /**
   * Снимает свою запись из history (если она ещё верхняя) и ждёт, пока браузер
   * действительно вернётся: только после этого можно менять адрес — иначе
   * `history.back()` отменил бы переход, который сделал `naDeystvie`.
   * @returns {Promise<void>}
   */
  function snyatZapisIstorii() {
    const nasha = zapisVIstorii && !zakryvaemPoPopstate && history.state && history.state.hinkalnayaIstorii;
    zapisVIstorii = false;
    if (!nasha) return Promise.resolve();
    return new Promise((resolve) => {
      let taymer = 0;
      const gotovo = () => {
        window.removeEventListener('popstate', gotovo);
        clearTimeout(taymer);
        resolve();
      };
      window.addEventListener('popstate', gotovo);
      taymer = setTimeout(gotovo, 400); // страховка: popstate не пришёл
      history.back();
    });
  }

  /**
   * Закрывает просмотрщик: анимация ухода вниз, снятие записи history,
   * снятие блокировки прокрутки, возврат фокуса, Promise.
   * @param {'zakryto'|'konec'|'deystvie'} prichina
   * @param {Function} [posleIstorii] вызвать, когда запись history уже снята (переход по кнопке действия)
   */
  async function zakrytie(prichina, posleIstorii) {
    if (zakryt) return;
    zakryt = true;
    if (progress) progress.cancel();
    ubratSlushateli();
    const istoriyaGotova = snyatZapisIstorii().then(() => {
      if (typeof posleIstorii === 'function') {
        try { posleIstorii(); } catch (oshibka) { setTimeout(() => { throw oshibka; }); }
      }
    });
    const tekushchiyY = Number(telefon.dataset.smeshchenie || 0);
    const uhod = snyato
      ? koren.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease', fill: 'forwards' })
      : telefon.animate(
        [{ transform: `translateY(${tekushchiyY}px) scale(${1 - tekushchiyY / 2400})`, opacity: 1 }, { transform: 'translateY(70vh) scale(.82)', opacity: 0 }],
        { duration: 340, easing: 'cubic-bezier(.5, 0, .8, .4)', fill: 'forwards' },
      );
    if (!snyato) koren.animate([{ background: koren.style.background || 'rgba(20,8,4,1)' }, { background: 'rgba(20,8,4,0)' }], { duration: 340, easing: 'ease', fill: 'forwards' });
    await Promise.all([uhod.finished.catch(() => {}), istoriyaGotova]);
    koren.remove();
    document.body.style.overflow = bylOverflow;
    if (bylAktivnyy && typeof bylAktivnyy.focus === 'function') {
      try { bylAktivnyy.focus({ preventScroll: true }); } catch (oshibka) { /* элемент мог исчезнуть */ }
    }
    resolvePromise({ prichina, istoriya: istorii[tekushchiy] || null, index: tekushchiy });
  }

  function naKlavishu(sobytie) {
    if (sobytie.key === 'Escape') { sobytie.preventDefault(); zakrytie('zakryto'); }
    else if (sobytie.key === 'ArrowRight') dalshe('klavisha');
    else if (sobytie.key === 'ArrowLeft') nazad();
    else if (sobytie.key === ' ') { sobytie.preventDefault(); naPauze ? prodolzhit() : pauza(); }
  }

  function naVidimost() {
    if (document.hidden) pauza();
    else prodolzhit();
  }

  function naPopstate() {
    if (zakryt) return;
    zakryvaemPoPopstate = true;
    zapisVIstorii = false;
    zakrytie('zakryto');
  }

  /** Наклон телефона слегка сдвигает слои — параллакс без пальца (Android; iOS спрашивает разрешение — не трогаем). */
  function naOrientaciyu(sobytie) {
    if (!kadr || snyato || sobytie.gamma == null) return;
    const px = Math.max(-1, Math.min(1, sobytie.gamma / 30));
    const py = Math.max(-1, Math.min(1, (sobytie.beta - 45) / 30));
    kadr.style.setProperty('--px', px.toFixed(3));
    kadr.style.setProperty('--py', py.toFixed(3));
  }

  // ----- жесты на зонах тапа: удержание — пауза, тап — вперёд/назад, свайп вниз — закрыть, свайп вбок — листать
  let zhest = null;
  function naPointerDown(sobytie) {
    if (zakryt || zhest) return;
    if (sobytie.pointerType === 'mouse' && sobytie.button !== 0) return;
    zhest = {
      id: sobytie.pointerId, x0: sobytie.clientX, y0: sobytie.clientY, t0: performance.now(),
      dx: 0, dy: 0, tyanem: false, taymer: null, byloUderzhanie: false, zona: sobytie.currentTarget,
    };
    try { sobytie.currentTarget.setPointerCapture(sobytie.pointerId); } catch (oshibka) { /* не критично */ }
    zhest.taymer = setTimeout(() => {
      if (zhest && !zhest.tyanem) { zhest.byloUderzhanie = true; pauza(); }
    }, ZADERZHKA_UDERZHANIYA);
  }

  function naPointerMove(sobytie) {
    if (!zhest || sobytie.pointerId !== zhest.id) return;
    zhest.dx = sobytie.clientX - zhest.x0;
    zhest.dy = sobytie.clientY - zhest.y0;
    // Параллакс за пальцем
    if (kadr && !snyato && !zhest.tyanem) {
      // Считаем от прямоугольника кадра, а не окна: на планшете кадр стоит по центру
      const ramka = telefon.getBoundingClientRect();
      const shirina = ramka.width || 390;
      const vysota = ramka.height || 844;
      const px = Math.max(-1, Math.min(1, ((sobytie.clientX - ramka.left) / shirina) * 2 - 1));
      const py = Math.max(-1, Math.min(1, ((sobytie.clientY - ramka.top) / vysota) * 2 - 1));
      kadr.style.setProperty('--px', px.toFixed(3));
      kadr.style.setProperty('--py', py.toFixed(3));
    }
    if (!zhest.tyanem && zhest.dy > 14 && zhest.dy > Math.abs(zhest.dx) * 1.2) {
      zhest.tyanem = true;
      clearTimeout(zhest.taymer);
      pauza();
    }
    if (zhest.tyanem) {
      const y = Math.max(0, zhest.dy);
      telefon.dataset.smeshchenie = String(y);
      telefon.style.transform = `translateY(${y}px) scale(${1 - y / 2400})`;
      telefon.style.borderRadius = `${Math.min(28, y / 4)}px`;
      koren.style.background = `rgba(20, 8, 4, ${Math.max(0.15, 1 - y / 500)})`;
    }
  }

  function naPointerUp(sobytie) {
    if (!zhest || sobytie.pointerId !== zhest.id) return;
    const z = zhest;
    zhest = null;
    clearTimeout(z.taymer);
    const dlitelnost = performance.now() - z.t0;
    if (z.tyanem) {
      if (z.dy > POROG_ZAKRYTIYA_PX || (z.dy > 40 && dlitelnost < 260)) {
        vibro(10);
        zakrytie('zakryto');
        return;
      }
      // Не дотянули — возвращаем с пружиной
      const y = Math.max(0, z.dy);
      telefon.dataset.smeshchenie = '0';
      telefon.style.transform = '';
      telefon.style.borderRadius = '';
      koren.style.background = '';
      if (!snyato) {
        telefon.animate(
          [{ transform: `translateY(${y}px) scale(${1 - y / 2400})` }, { transform: 'translateY(0) scale(1)' }],
          { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing },
        );
      }
      prodolzhit();
      return;
    }
    const byloUderzhanie = z.byloUderzhanie;
    prodolzhit();
    if (Math.abs(z.dx) > POROG_SVAYPA_PX && Math.abs(z.dx) > Math.abs(z.dy)) {
      if (z.dx < 0) dalshe('svayp'); else nazad();
      return;
    }
    if (byloUderzhanie || dlitelnost > POROG_TAPA_MS) return;
    if (z.zona.classList.contains('istorii-prosmotr__tap--nazad')) nazad(); else dalshe('tap');
  }

  function naPointerCancel(sobytie) {
    if (!zhest || sobytie.pointerId !== zhest.id) return;
    clearTimeout(zhest.taymer);
    zhest = null;
    telefon.dataset.smeshchenie = '0';
    telefon.style.transform = '';
    telefon.style.borderRadius = '';
    koren.style.background = '';
    prodolzhit();
  }

  zonyTapa.forEach((zona) => {
    zona.addEventListener('pointerdown', naPointerDown);
    zona.addEventListener('pointermove', naPointerMove);
    zona.addEventListener('pointerup', naPointerUp);
    zona.addEventListener('pointercancel', naPointerCancel);
    // click отдаём жестам: иначе Playwright/мышь кликнут дважды
    zona.addEventListener('click', (sobytie) => sobytie.preventDefault());
  });
  knopkaZakryt.addEventListener('click', () => { vibro(6); zakrytie('zakryto'); });
  nazhatie(knopkaZakryt, 0.86);
  nazhatie(knopkaDeystvie, 0.95);
  knopkaDeystvie.addEventListener('click', () => {
    if (zakryt) return;
    const istoriya = istorii[tekushchiy];
    vibro([8, 30, 8]);
    // Сначала снимаем свою запись history, потом отдаём действие наружу:
    // переход (#/blyudo/<id>) ляжет поверх чистой истории и не будет отменён
    zakrytie('deystvie', () => {
      if (typeof nastroyki.naDeystvie === 'function') nastroyki.naDeystvie(istoriya.deystvie, istoriya);
    });
  });
  // Пока палец на кнопке действия — таймер стоит, чтобы кадр не уехал из-под пальца
  knopkaDeystvie.addEventListener('pointerdown', pauza);
  knopkaDeystvie.addEventListener('pointerup', prodolzhit);
  knopkaDeystvie.addEventListener('pointercancel', prodolzhit);

  document.addEventListener('keydown', naKlavishu);
  document.addEventListener('visibilitychange', naVidimost);
  if (nastroyki.istoriyaBrauzera && typeof history !== 'undefined' && history.pushState) {
    try {
      history.pushState({ hinkalnayaIstorii: true }, '');
      zapisVIstorii = true;
      window.addEventListener('popstate', naPopstate);
    } catch (oshibka) { zapisVIstorii = false; }
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', naOrientaciyu, { passive: true });
  }

  // ----- открытие
  document.body.style.overflow = 'hidden';
  nastroyki.kontejner.appendChild(koren);
  if (!snyato) {
    telefon.animate(
      [{ transform: 'translateY(60vh) scale(.86)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
      { duration: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing },
    );
    koren.animate([{ background: 'rgba(20,8,4,0)' }, { background: 'rgba(20,8,4,1)' }], { duration: 300, easing: 'ease' });
    podskazka.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 3200, delay: 600, fill: 'forwards' });
  } else {
    podskazka.style.display = 'none';
  }
  koren.tabIndex = -1;
  koren.focus({ preventScroll: true });
  pokazatKadr(tekushchiy, 0);
  vibro(6);
  return obeshchanie;
}
