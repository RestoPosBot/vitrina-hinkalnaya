/**
 * Движение витрины Хинкальной (модуль B).
 *
 * Пружины через `linear()`-easing (строки считаются из физики пружины при
 * загрузке модуля), отклик на касание, FLIP-переходы, полёт блюда в корзину,
 * вибрация, прокрутка цифр, живой градиентный фон на canvas, параллакс,
 * наблюдение за разделами, нижняя шторка, тост и каскадное появление.
 *
 * Правила: в анимациях только transform и opacity; без зависимостей;
 * при `prefers-reduced-motion: reduce` движение снимается, отклик цветом
 * и прозрачностью остаётся.
 */

// ---------------------------------------------------------------------------
// Среда: что умеет браузер
// ---------------------------------------------------------------------------

const estOkno = typeof window !== 'undefined' && typeof document !== 'undefined';

/** Поддерживает ли браузер easing `linear(...)` (Chrome 113+, Safari 17.2+, Firefox 112+). */
export const podderzhkaLinear = estOkno && typeof CSS !== 'undefined' && CSS.supports
  ? CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)')
  : false;

/** Поддерживает ли браузер `offset-path: path(...)` для полёта по дуге. */
export const podderzhkaOffsetPath = estOkno && typeof CSS !== 'undefined' && CSS.supports
  ? CSS.supports('offset-path', 'path("M 0 0 L 10 10")')
  : false;

/** Поддерживает ли браузер прокрутку как таймлайн анимации (`animation-timeline: scroll()`). */
export const podderzhkaScrollTimeline = estOkno && typeof CSS !== 'undefined' && CSS.supports
  ? CSS.supports('animation-timeline', 'scroll()')
  : false;

const zaprosSnyatiya = estOkno && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Просил ли гость убрать движение (`prefers-reduced-motion: reduce`).
 * Читается при каждом вызове — настройка может смениться на лету.
 * @returns {boolean}
 */
export function dvizhenieSnyato() {
  return Boolean(zaprosSnyatiya && zaprosSnyatiya.matches);
}

// ---------------------------------------------------------------------------
// Пружины: физика -> строка linear(...)
// ---------------------------------------------------------------------------

/**
 * Считает траекторию затухающей пружины x(t) от 0 к 1 (масса, жёсткость,
 * затухание) полуявным методом Эйлера с шагом 1 мс и возвращает точки
 * и время успокоения.
 * @param {number} zhestkost жёсткость k
 * @param {number} zatuhanie коэффициент трения c
 * @param {number} massa масса m
 * @returns {{tochki:number[], ms:number}}
 */
function rasschitatPruzhinu(zhestkost, zatuhanie, massa) {
  const dt = 0.001;
  let x = 0;
  let v = 0;
  const tochki = [];
  let poslednijShum = 0;
  const maxMs = 3000;
  for (let i = 0; i < maxMs; i++) {
    const uskorenie = (-zhestkost * (x - 1) - zatuhanie * v) / massa;
    v += uskorenie * dt;
    x += v * dt;
    tochki.push(x);
    if (Math.abs(x - 1) > 0.003 || Math.abs(v) > 0.12) poslednijShum = i;
    if (i - poslednijShum > 40 && i > 120) break;
  }
  return { tochki, ms: poslednijShum + 1 };
}

/**
 * Собирает строку `linear(...)` из траектории пружины: берёт ~64 точки,
 * равномерно по времени, последнюю доводит до 1.
 * @param {number[]} tochki
 * @param {number} ms
 * @param {number} kolichestvo
 * @returns {string}
 */
function stroitLinear(tochki, ms, kolichestvo = 64) {
  const znacheniya = [];
  for (let i = 0; i <= kolichestvo; i++) {
    const t = Math.min(ms - 1, Math.round((i / kolichestvo) * (ms - 1)));
    const x = i === kolichestvo ? 1 : tochki[t];
    znacheniya.push(Number(x.toFixed(4)).toString());
  }
  return `linear(${znacheniya.join(', ')})`;
}

/**
 * Делает пресет пружины.
 * `easing` — то, что подставлять в WAAPI/CSS сейчас (linear() или запасная кривая),
 * `ms` — рекомендуемая длительность, при которой пружина успевает успокоиться.
 * @param {number} zhestkost
 * @param {number} zatuhanie
 * @param {number} massa
 * @param {string} zapasnoy запасной cubic-bezier для старых браузеров
 * @returns {{easing:string, linear:string, zapasnoy:string, ms:number, toString():string}}
 */
function sozdatPruzhinu(zhestkost, zatuhanie, massa, zapasnoy) {
  const { tochki, ms } = rasschitatPruzhinu(zhestkost, zatuhanie, massa);
  const linear = stroitLinear(tochki, ms);
  const preset = {
    linear,
    zapasnoy,
    ms,
    easing: podderzhkaLinear ? linear : zapasnoy,
    zhestkost,
    zatuhanie,
    massa,
    toString() { return this.easing; },
  };
  return preset;
}

/**
 * Четыре пружины витрины. Каждая — объект со строкой `easing` (готовая для
 * WAAPI: `linear(...)`, а в старом браузере — запасной `cubic-bezier`),
 * полями `linear`, `zapasnoy`, `ms` (длительность до успокоения).
 * Объект приводится к строке, так что `easing: pruzhina.zhivaya` тоже работает.
 *
 * - myagkaya — почти без перелёта: шторки, появление, крупные сдвиги;
 * - obychnaya — лёгкий перелёт: переезд «таблетки», FLIP;
 * - zhivaya — заметный перелёт: отпускание кнопки, подскоки;
 * - rezkaya — быстрая и упругая: счётчики, мелкие значки.
 */
export const pruzhina = {
  myagkaya: sozdatPruzhinu(120, 20, 1, 'cubic-bezier(.22, 1, .36, 1)'),
  obychnaya: sozdatPruzhinu(200, 22, 1, 'cubic-bezier(.3, 1.25, .5, 1)'),
  zhivaya: sozdatPruzhinu(300, 18, 1, 'cubic-bezier(.34, 1.56, .64, 1)'),
  rezkaya: sozdatPruzhinu(600, 28, 1, 'cubic-bezier(.3, 1.4, .5, 1)'),
};

/**
 * Числовая кубическая кривая Безье (как CSS cubic-bezier) — нужна там, где
 * анимация идёт покадрово через rAF, а не через WAAPI.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(t:number)=>number}
 */
export function krivayaBezye(x1, y1, x2, y2) {
  const a = (p1, p2) => 1 - 3 * p2 + 3 * p1;
  const b = (p1, p2) => 3 * p2 - 6 * p1;
  const c = (p1) => 3 * p1;
  const bezye = (t, p1, p2) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const naklon = (t, p1, p2) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = bezye(t, x1, x2) - x;
      const n = naklon(t, x1, x2);
      if (Math.abs(dx) < 1e-5 || n === 0) break;
      t -= dx / n;
    }
    return bezye(t, y1, y2);
  };
}

// ---------------------------------------------------------------------------
// Вибрация
// ---------------------------------------------------------------------------

/**
 * Короткая вибрация телефона. Тихо молчит, если `navigator.vibrate` нет
 * или браузер запрещает (например, до первого касания).
 * @param {number|number[]} msIliUzor миллисекунды или узор [вкл, пауза, вкл…]
 * @returns {boolean} удалось ли попросить вибрацию
 */
export function vibro(msIliUzor = 8) {
  if (!estOkno || dvizhenieSnyato()) return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return Boolean(navigator.vibrate(msIliUzor));
    }
  } catch (oshibka) {
    // некоторые браузеры бросают, если вызвать без жеста пользователя — это не ошибка витрины
  }
  return false;
}

// ---------------------------------------------------------------------------
// Отклик на касание
// ---------------------------------------------------------------------------

const easeOutChislo = (p) => 1 - Math.pow(1 - p, 3);

// Нажатия обслуживаются делегированием: на всю витрину три слушателя на window,
// а не по четыре на каждую кнопку (133 карточки × «+» и степпер давали сотни).
const zaregistrirovannye = new WeakMap(); // элемент -> состояние нажатия
const nazhatyePoPalcu = new Map(); // pointerId -> [состояния, сжатые этим пальцем]
let delegirovanieGotovo = false;

/** Все зарегистрированные элементы на пути события (от цели к корню). */
function sostoyaniyaNaPuti(sobytie) {
  const put = typeof sobytie.composedPath === 'function' ? sobytie.composedPath() : [];
  const naydeno = [];
  for (const uzel of put) {
    const s = uzel && uzel.nodeType === 1 ? zaregistrirovannye.get(uzel) : null;
    if (s) naydeno.push(s);
  }
  return naydeno;
}

/** Вешает общие слушатели нажатия один раз. */
function nastroitDelegirovanie() {
  if (delegirovanieGotovo || !estOkno) return;
  delegirovanieGotovo = true;
  window.addEventListener('pointerdown', (sobytie) => {
    if (sobytie.pointerType === 'mouse' && sobytie.button !== 0) return;
    const spisok = sostoyaniyaNaPuti(sobytie);
    if (!spisok.length) return;
    for (const s of spisok) s.vniz();
    nazhatyePoPalcu.set(sobytie.pointerId, spisok);
  }, { capture: true, passive: true });
  const otpustit = (sobytie) => {
    const spisok = nazhatyePoPalcu.get(sobytie.pointerId);
    if (!spisok) return;
    nazhatyePoPalcu.delete(sobytie.pointerId);
    for (const s of spisok) s.vverh(sobytie);
  };
  window.addEventListener('pointerup', otpustit, { capture: true, passive: true });
  window.addEventListener('pointercancel', otpustit, { capture: true, passive: true });
  // Мышь ушла с элемента — считаем отпусканием; палец «ушёл» (touch) — это уже pointercancel
  window.addEventListener('pointerout', (sobytie) => {
    if (sobytie.pointerType !== 'mouse') return;
    const spisok = nazhatyePoPalcu.get(sobytie.pointerId);
    if (!spisok) return;
    const kuda = sobytie.relatedTarget;
    const ostalis = [];
    for (const s of spisok) {
      if (kuda && s.element.contains(kuda)) ostalis.push(s);
      else s.vverh(sobytie);
    }
    if (ostalis.length) nazhatyePoPalcu.set(sobytie.pointerId, ostalis);
    else nazhatyePoPalcu.delete(sobytie.pointerId);
  }, { capture: true, passive: true });
}

/**
 * Отклик на касание: палец лёг — элемент мягко сжимается до `masshtab`,
 * палец ушёл — возвращается с перелётом (пружина `zhivaya`) и короткой
 * вибрацией. Анимация складывается с существующим transform (composite: add),
 * поэтому не ломает вёрстку. При reduced-motion вместо сжатия — прозрачность.
 * Слушатели общие на всю витрину (делегирование), на сам элемент не вешаются.
 * @param {HTMLElement} element
 * @param {{masshtab?:number, vibro?:number|false, ms?:number}} [opcii]
 * @returns {() => void} функция отключения
 */
export function nazhatie(element, opcii = {}) {
  if (!element || !element.animate) return () => {};
  nastroitDelegirovanie();
  const masshtab = opcii.masshtab ?? 0.96;
  const vibroMs = opcii.vibro === false ? 0 : (opcii.vibro ?? 8);
  const msNazhatiya = opcii.ms ?? 140;
  let animNazhatiya = null;
  let animOtpuska = null;
  let nazhato = false;

  const tekushchiyMasshtab = () => {
    if (!animNazhatiya) return 1;
    const t = animNazhatiya.effect.getComputedTiming();
    const p = t.progress == null ? 1 : t.progress;
    return 1 - (1 - masshtab) * easeOutChislo(p);
  };

  const vniz = () => {
    nazhato = true;
    if (animOtpuska) { animOtpuska.cancel(); animOtpuska = null; }
    if (animNazhatiya) animNazhatiya.cancel();
    if (dvizhenieSnyato()) {
      animNazhatiya = element.animate([{ opacity: 1 }, { opacity: 0.72 }], { duration: 80, fill: 'forwards' });
      return;
    }
    animNazhatiya = element.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${masshtab})` }],
      { duration: msNazhatiya, easing: 'cubic-bezier(.2, .8, .4, 1)', fill: 'forwards', composite: 'add' },
    );
  };

  const vverh = (sobytie) => {
    if (!nazhato) return;
    nazhato = false;
    // pointercancel — палец ушёл в прокрутку: возвращаем форму тихо, без вибрации и перелёта
    const otmena = Boolean(sobytie && sobytie.type === 'pointercancel');
    if (vibroMs && !otmena && sobytie && sobytie.type === 'pointerup') vibro(vibroMs);
    if (dvizhenieSnyato()) {
      if (animNazhatiya) animNazhatiya.cancel();
      animNazhatiya = null;
      animOtpuska = element.animate([{ opacity: 0.72 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    const ot = tekushchiyMasshtab();
    if (animNazhatiya) animNazhatiya.cancel();
    animNazhatiya = null;
    animOtpuska = element.animate(
      [{ transform: `scale(${ot.toFixed(4)})` }, { transform: 'scale(1)' }],
      otmena
        ? { duration: 160, easing: 'cubic-bezier(.2, .8, .4, 1)', composite: 'add' }
        : { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, composite: 'add' },
    );
    animOtpuska.onfinish = () => { animOtpuska = null; };
  };

  zaregistrirovannye.set(element, { element, vniz, vverh });
  if (!element.style.touchAction) element.style.touchAction = 'manipulation';
  if (!element.style.webkitTapHighlightColor) element.style.webkitTapHighlightColor = 'transparent';

  return () => {
    zaregistrirovannye.delete(element);
    if (animNazhatiya) animNazhatiya.cancel();
    if (animOtpuska) animOtpuska.cancel();
  };
}

// ---------------------------------------------------------------------------
// FLIP-переход
// ---------------------------------------------------------------------------

/**
 * Снимок прямоугольника: принимает элемент или готовый DOMRect-подобный объект.
 * @param {HTMLElement|DOMRect|{left:number,top:number,width:number,height:number}} chto
 */
function pryamougolnik(chto) {
  if (!chto) return null;
  if (typeof chto.getBoundingClientRect === 'function') return chto.getBoundingClientRect();
  return typeof chto.width === 'number' ? chto : null;
}

/**
 * FLIP-переход: элемент `elementDo` появляется там, где стоял `elementOt`,
 * и «доезжает» на своё место анимацией transform (сдвиг + масштаб) и
 * borderRadius. `elementOt` на время перехода прячется прозрачностью.
 *
 * Прямоугольники можно передать готовыми: `elementOt` — DOMRect, `opcii.do` —
 * DOMRect цели (нужно, когда цель ещё не на месте, например в шторке, которая
 * только выезжает). В режиме `opcii.klon` летит не сам `elementDo`, а его
 * клон в fixed-слое над всем — так переход не ломается, если родитель цели
 * в это время сам движется (шторка, экран). Настоящий `elementDo` в это время
 * прозрачен и проявляется по прилёте.
 * @param {HTMLElement|DOMRect} elementOt откуда (элемент или его DOMRect)
 * @param {HTMLElement} elementDo куда
 * @param {{ms?:number, easing?:string, pryatatOt?:boolean, radiusOt?:string, do?:DOMRect, klon?:boolean}} [opcii]
 * @returns {Promise<void>}
 */
export function flip(elementOt, elementDo, opcii = {}) {
  if (!elementDo || !elementDo.animate) return Promise.resolve();
  const ot = pryamougolnik(elementOt);
  const do_ = pryamougolnik(opcii.do) || elementDo.getBoundingClientRect();
  if (!ot || !ot.width || !do_.width || !do_.height) return Promise.resolve();

  if (dvizhenieSnyato()) {
    const a = elementDo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    return a.finished.then(() => undefined).catch(() => undefined);
  }

  const dx = ot.left - do_.left + (ot.width - do_.width) / 2;
  const dy = ot.top - do_.top + (ot.height - do_.height) / 2;
  const sx = ot.width / do_.width;
  const sy = ot.height / do_.height;
  const radiusDo = getComputedStyle(elementDo).borderRadius;
  const estElementOt = elementOt && typeof elementOt.getBoundingClientRect === 'function';
  const radiusOt = opcii.radiusOt ?? (estElementOt ? getComputedStyle(elementOt).borderRadius : radiusDo);
  const preset = pruzhina.obychnaya;
  const ms = opcii.ms ?? preset.ms;
  const easing = opcii.easing ?? preset.easing;

  const pryatat = opcii.pryatatOt !== false && estElementOt && elementOt.animate;
  let animOt = null;
  if (pryatat) animOt = elementOt.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });

  // Кто летит: сам элемент или его клон в fixed-слое
  let letit = elementDo;
  let animSkrytiyaDo = null;
  if (opcii.klon) {
    letit = elementDo.cloneNode(true);
    Object.assign(letit.style, {
      position: 'fixed',
      left: `${do_.left}px`,
      top: `${do_.top}px`,
      width: `${do_.width}px`,
      height: `${do_.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '9999',
      willChange: 'transform',
    });
    letit.setAttribute('aria-hidden', 'true');
    document.body.appendChild(letit);
    animSkrytiyaDo = elementDo.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
  }

  const staryyOrigin = letit.style.transformOrigin;
  letit.style.transformOrigin = 'center center';
  const anim = letit.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: radiusOt },
      { transform: 'translate(0, 0) scale(1, 1)', borderRadius: radiusDo },
    ],
    { duration: ms, easing, fill: 'backwards' },
  );
  return anim.finished
    .catch(() => undefined)
    .then(() => {
      letit.style.transformOrigin = staryyOrigin;
      if (animOt) animOt.cancel();
      if (opcii.klon) {
        if (animSkrytiyaDo) animSkrytiyaDo.cancel();
        letit.remove();
      }
    });
}

// ---------------------------------------------------------------------------
// Полёт в корзину
// ---------------------------------------------------------------------------

const easeVPolete = krivayaBezye(0.45, 0.05, 0.8, 0.4);

/**
 * Точка на квадратичной кривой Безье.
 * @param {{x:number,y:number}} s начало
 * @param {{x:number,y:number}} c контрольная точка
 * @param {{x:number,y:number}} e конец
 * @param {number} t 0..1
 */
function tochkaBezye(s, c, e, t) {
  const u = 1 - t;
  return {
    x: u * u * s.x + 2 * u * t * c.x + t * t * e.x,
    y: u * u * s.y + 2 * u * t * c.y + t * t * e.y,
  };
}

/**
 * Подскок цели (значка корзины) после прилёта: scale 1 → 1.25 → 1 с пружиной.
 * @param {HTMLElement} element
 * @returns {Promise<void>}
 */
function podskokCeli(element) {
  if (!element || !element.animate) return Promise.resolve();
  if (dvizhenieSnyato()) {
    return element.animate([{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }], { duration: 240 }).finished.then(() => undefined).catch(() => undefined);
  }
  const a = element.animate(
    [
      { transform: 'scale(1)', easing: 'cubic-bezier(.2, .8, .4, 1)' },
      { transform: 'scale(1.28)', offset: 0.28, easing: pruzhina.zhivaya.easing },
      { transform: 'scale(1)' },
    ],
    { duration: 120 + pruzhina.zhivaya.ms, composite: 'add' },
  );
  return a.finished.then(() => undefined).catch(() => undefined);
}

/**
 * Полёт блюда в корзину: клон `elementOt` (картинка или плитка карточки)
 * летит по дуге Безье в центр `elementDo`, по пути ускоряется и сжимается,
 * в конце исчезает, а цель подскакивает с пружиной и телефон коротко
 * вибрирует. Через `offset-path` (WAAPI), а где его нет — покадрово rAF.
 * @param {HTMLElement} elementOt что летит (клонируется, сам элемент не трогаем)
 * @param {HTMLElement} elementDo куда (значок корзины)
 * @param {{ms?:number, klon?:HTMLElement, vysota?:number, masshtabVKonce?:number, vibro?:number|false, podskok?:boolean, naPrilet?:()=>void}} [opcii]
 *   naPrilet — зовётся в момент прилёта (клон исчез, цель ещё подскакивает): самое время обновить счётчик
 * @returns {Promise<void>} когда клон исчез и цель подскочила
 */
export function poletVKorzinu(elementOt, elementDo, opcii = {}) {
  if (!estOkno || !elementOt || !elementDo) return Promise.resolve();
  const ot = elementOt.getBoundingClientRect();
  const do_ = elementDo.getBoundingClientRect();
  const vibroMs = opcii.vibro === false ? 0 : (opcii.vibro ?? 12);
  const podskok = opcii.podskok !== false;
  const naPrilet = typeof opcii.naPrilet === 'function' ? opcii.naPrilet : null;

  if (dvizhenieSnyato() || !ot.width || !do_.width) {
    if (vibroMs) vibro(vibroMs);
    if (naPrilet) naPrilet();
    return podskok ? podskokCeli(elementDo) : Promise.resolve();
  }

  const ms = opcii.ms ?? 640;
  const masshtabVKonce = opcii.masshtabVKonce ?? 0.18;
  const s = { x: ot.left + ot.width / 2, y: ot.top + ot.height / 2 };
  const e = { x: do_.left + do_.width / 2, y: do_.top + do_.height / 2 };
  const dx = e.x - s.x;
  const vysota = opcii.vysota ?? Math.max(90, Math.abs(dx) * 0.25 + 60);
  const c = { x: s.x + dx * 0.45, y: Math.min(s.y, e.y) - vysota };

  const klon = opcii.klon ?? elementOt.cloneNode(true);
  const stil = getComputedStyle(elementOt);
  Object.assign(klon.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${ot.width}px`,
    height: `${ot.height}px`,
    margin: '0',
    borderRadius: stil.borderRadius,
    objectFit: stil.objectFit,
    pointerEvents: 'none',
    zIndex: '9999',
    willChange: 'transform, opacity',
    transformOrigin: 'center center',
    boxShadow: '0 18px 40px rgba(120, 60, 20, .28)',
  });
  klon.setAttribute('aria-hidden', 'true');
  document.body.appendChild(klon);

  const kadry = [
    { transform: 'scale(1)', opacity: 1, offset: 0 },
    { transform: 'scale(.9)', opacity: 1, offset: 0.35 },
    { transform: `scale(${masshtabVKonce})`, opacity: 0.9, offset: 0.92 },
    { transform: `scale(${masshtabVKonce * 0.6})`, opacity: 0, offset: 1 },
  ];

  let polet;
  if (podderzhkaOffsetPath && klon.animate) {
    const put = `path("M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}")`;
    klon.style.offsetPath = put;
    klon.style.offsetRotate = '0deg';
    klon.style.offsetDistance = '0%';
    const dvizhenie = klon.animate(
      [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
      { duration: ms, easing: 'cubic-bezier(.45, .05, .8, .4)', fill: 'forwards' },
    );
    const forma = klon.animate(kadry, { duration: ms, easing: 'linear', fill: 'forwards' });
    polet = Promise.all([dvizhenie.finished, forma.finished]).catch(() => undefined);
  } else {
    // Покадрово: положение по той же кривой, ускорение по той же кривой Безье
    klon.style.left = `${s.x - ot.width / 2}px`;
    klon.style.top = `${s.y - ot.height / 2}px`;
    polet = new Promise((gotovo) => {
      const start = performance.now();
      const kadr = (seychas) => {
        const p = Math.min(1, (seychas - start) / ms);
        const t = easeVPolete(p);
        const { x, y } = tochkaBezye(s, c, e, t);
        let masshtab;
        let opacity = 1;
        if (p < 0.35) masshtab = 1 - 0.1 * (p / 0.35);
        else if (p < 0.92) masshtab = 0.9 - (0.9 - masshtabVKonce) * ((p - 0.35) / 0.57);
        else { masshtab = masshtabVKonce * (1 - 0.4 * ((p - 0.92) / 0.08)); opacity = 1 - (p - 0.92) / 0.08; }
        klon.style.transform = `translate(${(x - s.x).toFixed(1)}px, ${(y - s.y).toFixed(1)}px) scale(${masshtab.toFixed(3)})`;
        klon.style.opacity = opacity.toFixed(3);
        if (p < 1) requestAnimationFrame(kadr); else gotovo();
      };
      requestAnimationFrame(kadr);
    });
  }

  return polet.then(() => {
    klon.remove();
    if (vibroMs) vibro(vibroMs);
    if (naPrilet) naPrilet();
    return podskok ? podskokCeli(elementDo) : undefined;
  });
}

// ---------------------------------------------------------------------------
// Прокрутка цифр
// ---------------------------------------------------------------------------

const formatChisla = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/**
 * «Прокрутка» числа в элементе от `ot` до `do_` за `ms` (ease-out, rAF).
 * Пишет только текст — обёртку с «₽» держите снаружи или передайте `format`.
 * При reduced-motion ставит конечное число сразу.
 * @param {HTMLElement} element
 * @param {number} ot
 * @param {number} do_
 * @param {number} [ms]
 * @param {(n:number)=>string} [format] по умолчанию — разряды через пробел (ru-RU)
 * @returns {Promise<void>}
 */
export function pokazatChislo(element, ot, do_, ms = 600, format = (n) => formatChisla.format(n)) {
  if (!element) return Promise.resolve();
  // Прошлый вызов на этом же элементе перебит: гасим его кадр и отпускаем его Promise,
  // чтобы тот, кто его ждал (например, разблокировка кнопки), не завис навсегда.
  if (element._dvizhenieChislo) cancelAnimationFrame(element._dvizhenieChislo);
  element._dvizhenieChislo = null;
  if (element._dvizhenieChisloGotovo) { const proshlyy = element._dvizhenieChisloGotovo; element._dvizhenieChisloGotovo = null; proshlyy(); }
  const okrug = (n) => Math.round(n);
  if (!estOkno || dvizhenieSnyato() || ms <= 0 || ot === do_) {
    element.textContent = format(okrug(do_));
    return Promise.resolve();
  }
  return new Promise((gotovo) => {
    element._dvizhenieChisloGotovo = gotovo;
    const start = performance.now();
    const kadr = (seychas) => {
      const p = Math.min(1, (seychas - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      element.textContent = format(okrug(ot + (do_ - ot) * e));
      if (p < 1) element._dvizhenieChislo = requestAnimationFrame(kadr);
      else { element._dvizhenieChislo = null; element._dvizhenieChisloGotovo = null; gotovo(); }
    };
    element._dvizhenieChislo = requestAnimationFrame(kadr);
  });
}

// ---------------------------------------------------------------------------
// Живой градиентный фон
// ---------------------------------------------------------------------------

/**
 * hex-цвет -> [r, g, b].
 * @param {string} hex '#RGB' или '#RRGGBB'
 * @returns {number[]}
 */
function hexVRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [255, 247, 236];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Живой градиент на canvas за всей витриной: 4–5 мягких пятен медленно
 * дрейфуют («дышат»), холст маленький (~1/6 экрана) и растянут CSS-ом
 * с размытием, поэтому рисование дешёвое. 24–30 кадров/с. Цвета плавно
 * перетекают к палитре раздела (`zadatCveta`), при скрытой вкладке — пауза,
 * при reduced-motion — один статичный кадр.
 *
 * Важно для вёрстки: со `stil` по умолчанию холст стоит `position:fixed; z-index:-1`,
 * то есть под всем содержимым. Поэтому у `body` не должно быть своего непрозрачного
 * фона, если фон задан и у `html` — тогда фон `body` рисуется поверх холста и живой
 * градиент молча пропадает. Фон-подложку держите на `html` (или только на `body`,
 * без фона у `html` — тогда он уходит на весь холст страницы и не мешает), а плашки
 * содержимого — полупрозрачными. Иначе передайте `stil:false` и расставьте слои сами.
 */
export class FonGradient {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cveta?:string[], kadrovVSek?:number, delitel?:number, stil?:boolean, skorost?:number, fon?:string}} [opcii]
   *   cveta — стартовая палитра (4–5 hex), delitel — во сколько раз холст меньше экрана,
   *   stil — ставить ли инлайн-стили холста (fixed, blur), skorost — множитель дрейфа,
   *   fon — цвет подложки (по умолчанию первый из палитры).
   */
  constructor(canvas, opcii = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.kadrovVSek = opcii.kadrovVSek ?? 27;
    this.delitel = opcii.delitel ?? 6;
    this.skorost = opcii.skorost ?? 1;
    this._naPauze = false;
    this._skrytaVkladka = false;
    this._kadr = null;
    this._poslednijKadr = 0;
    this._t0 = performance.now();
    this._perehod = null;
    this._unichtozhen = false;
    // Заморозка дрейфа (круг 2: холст 27 кадров/с грузил процессор и в покое):
    // html.pokoy (9 с без касаний, ставит index.html) или открыта шторка — пятна стоят,
    // а начатый переход палитры доигрывается. Время дрейфа на заморозке не идёт — без скачка.
    this._zamorozhen = false;
    this._zamorozhenS = 0;
    this._pokoy = false;
    this._podShtorkoy = false;

    const startovye = (opcii.cveta && opcii.cveta.length ? opcii.cveta : ['#FFF3DF', '#F4C77A', '#FFB03A', '#F6E7D2', '#FFD2B0']).slice(0, 5);
    while (startovye.length < 4) startovye.push(startovye[startovye.length - 1]);
    this.cveta = startovye.map(hexVRgb);
    this.fonCvet = hexVRgb(opcii.fon ?? startovye[0]);
    this._celFon = this.fonCvet;

    // Пятна: базовое место (доли холста), радиус, амплитуда и частота дрейфа
    const shablony = [
      { x: 0.2, y: 0.22, r: 0.75, ax: 0.14, ay: 0.12, fx: 0.11, fy: 0.09, faza: 0.0 },
      { x: 0.82, y: 0.3, r: 0.7, ax: 0.12, ay: 0.16, fx: 0.08, fy: 0.13, faza: 1.7 },
      { x: 0.3, y: 0.78, r: 0.8, ax: 0.16, ay: 0.1, fx: 0.07, fy: 0.11, faza: 3.1 },
      { x: 0.85, y: 0.85, r: 0.65, ax: 0.1, ay: 0.14, fx: 0.12, fy: 0.08, faza: 4.4 },
      { x: 0.55, y: 0.5, r: 0.55, ax: 0.2, ay: 0.2, fx: 0.06, fy: 0.07, faza: 2.3 },
    ];
    this.pyatna = shablony.slice(0, this.cveta.length);

    if (opcii.stil !== false) {
      Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        filter: 'blur(22px) saturate(1.2)',
        transform: 'scale(1.15)',
        zIndex: '-1',
      });
      canvas.setAttribute('aria-hidden', 'true');
    }

    this._naVidimost = () => {
      this._skrytaVkladka = document.hidden;
      if (document.hidden) this._stop(); else this._start();
    };
    this._naRazmer = () => { this._podognat(); this._narisovat(performance.now()); };
    document.addEventListener('visibilitychange', this._naVidimost);
    window.addEventListener('resize', this._naRazmer);
    if (zaprosSnyatiya && zaprosSnyatiya.addEventListener) {
      this._naSnyatie = () => { this._stop(); this._narisovat(performance.now()); this._start(); };
      zaprosSnyatiya.addEventListener('change', this._naSnyatie);
    }

    const html = document.documentElement;
    this._pokoy = html.classList.contains('pokoy');
    if (typeof MutationObserver === 'function') {
      this._nablPokoy = new MutationObserver(() => {
        const p = html.classList.contains('pokoy');
        if (p !== this._pokoy) { this._pokoy = p; this._obnovitZamorozku(); }
      });
      this._nablPokoy.observe(html, { attributes: true, attributeFilter: ['class'] });
    }
    this._slushatelShtorki = {
      zaperto: () => { this._podShtorkoy = true; this._obnovitZamorozku(); },
      otperto: () => { this._podShtorkoy = false; this._obnovitZamorozku(); },
    };
    slushateliBlokirovki.add(this._slushatelShtorki);

    this._podognat();
    this._obnovitZamorozku();
    this._narisovat(performance.now());
    this._start();
  }

  /** Покой или шторка — дрейф замирает; ожили — продолжается с того же места. */
  _obnovitZamorozku() {
    const nado = this._pokoy || this._podShtorkoy;
    if (nado === this._zamorozhen) return;
    const seychas = performance.now();
    if (nado) {
      this._zamorozhen = true;
      this._zamorozhenS = seychas;
      if (!this._perehod) this._stop();
    } else {
      this._zamorozhen = false;
      this._t0 += seychas - this._zamorozhenS;   // пятна продолжают с того места, где замерли
      this._start();
    }
  }

  /** Подгоняет размер холста под экран (в `delitel` раз меньше). */
  _podognat() {
    const w = Math.max(40, Math.round((window.innerWidth || 390) / this.delitel));
    const h = Math.max(40, Math.round((window.innerHeight || 844) / this.delitel));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  _start() {
    if (this._kadr || this._naPauze || this._skrytaVkladka || this._unichtozhen) return;
    if (dvizhenieSnyato() && !this._perehod) return; // статичный кадр уже нарисован
    if (this._zamorozhen && !this._perehod) return;   // покой/шторка: кадр уже на экране
    const shag = (seychas) => {
      this._kadr = null;
      if (this._naPauze || this._skrytaVkladka || this._unichtozhen) return;
      if (seychas - this._poslednijKadr >= 1000 / this.kadrovVSek) {
        this._poslednijKadr = seychas;
        this._narisovat(seychas);
      }
      if (dvizhenieSnyato() && !this._perehod) return;
      if (this._zamorozhen && !this._perehod) return;
      this._kadr = requestAnimationFrame(shag);
    };
    this._kadr = requestAnimationFrame(shag);
  }

  _stop() {
    if (this._kadr) cancelAnimationFrame(this._kadr);
    this._kadr = null;
  }

  /**
   * Рисует кадр: подложка + пятна радиальными градиентами.
   * @param {number} seychas performance.now()
   */
  _narisovat(seychas) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const t = dvizhenieSnyato() ? 0 : (((this._zamorozhen ? this._zamorozhenS : seychas) - this._t0) / 1000) * this.skorost;

    if (this._perehod) {
      const p = Math.min(1, (seychas - this._perehod.start) / this._perehod.ms);
      const e = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
      this.cveta = this._perehod.ot.map((c, i) => c.map((k, j) => k + (this._perehod.do[i][j] - k) * e));
      this.fonCvet = this._perehod.fonOt.map((k, j) => k + (this._perehod.fonDo[j] - k) * e);
      if (p >= 1) this._perehod = null;
    }

    const f = this.fonCvet;
    ctx.fillStyle = `rgb(${f[0] | 0}, ${f[1] | 0}, ${f[2] | 0})`;
    ctx.fillRect(0, 0, w, h);
    const min = Math.min(w, h);
    for (let i = 0; i < this.pyatna.length; i++) {
      const p = this.pyatna[i];
      const c = this.cveta[i] || this.cveta[this.cveta.length - 1];
      const x = (p.x + p.ax * Math.sin(t * p.fx * 2 * Math.PI + p.faza)) * w;
      const y = (p.y + p.ay * Math.cos(t * p.fy * 2 * Math.PI + p.faza)) * h;
      const r = p.r * min * (1 + 0.08 * Math.sin(t * 0.05 * 2 * Math.PI + p.faza));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const rgb = `${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}`;
      g.addColorStop(0, `rgba(${rgb}, .95)`);
      g.addColorStop(0.55, `rgba(${rgb}, .45)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * Плавно переводит палитру к новым цветам (lerp по RGB за `ms`).
   * Первый цвет становится и подложкой, если не передать `fon`.
   * @param {string[]} cveta 4–5 hex-цветов раздела
   * @param {number} [ms]
   * @param {string} [fon] цвет подложки
   */
  zadatCveta(cveta, ms = 900, fon) {
    if (!cveta || !cveta.length) return;
    const novye = cveta.slice(0, this.pyatna.length).map(hexVRgb);
    while (novye.length < this.pyatna.length) novye.push(novye[novye.length - 1]);
    const fonDo = hexVRgb(fon ?? cveta[0]);
    if (dvizhenieSnyato() || ms <= 0) {
      this.cveta = novye;
      this.fonCvet = fonDo;
      this._perehod = null;
      this._narisovat(performance.now());
      return;
    }
    this._perehod = { ot: this.cveta.map((c) => c.slice()), do: novye, fonOt: this.fonCvet.slice(), fonDo, start: performance.now(), ms };
    this._start();
  }

  /** Останавливает дыхание (кадр остаётся на экране). */
  pauza() {
    this._naPauze = true;
    this._stop();
  }

  /** Возобновляет дыхание после `pauza()`. */
  prodolzhit() {
    this._naPauze = false;
    this._start();
  }

  /** Снимает слушатели и останавливает рисование. */
  unichtozhit() {
    this._unichtozhen = true;
    this._stop();
    document.removeEventListener('visibilitychange', this._naVidimost);
    window.removeEventListener('resize', this._naRazmer);
    if (this._nablPokoy) this._nablPokoy.disconnect();
    slushateliBlokirovki.delete(this._slushatelShtorki);
    if (this._naSnyatie && zaprosSnyatiya) zaprosSnyatiya.removeEventListener('change', this._naSnyatie);
  }
}


// ---------------------------------------------------------------------------
// Параллакс
// ---------------------------------------------------------------------------

/**
 * Ближайший прокручиваемый предок элемента (overflow auto/scroll), иначе — окно.
 * @param {HTMLElement} element
 * @returns {HTMLElement|Window}
 */
function prokruchivaemyyPredok(element) {
  let tekushchiy = element.parentElement;
  while (tekushchiy && tekushchiy !== document.body && tekushchiy !== document.documentElement) {
    const stil = getComputedStyle(tekushchiy);
    if (/(auto|scroll)/.test(stil.overflowY)) return tekushchiy;
    tekushchiy = tekushchiy.parentElement;
  }
  return window;
}

/**
 * Параллакс: при прокрутке контейнера элемент едет медленнее содержимого.
 * `koeff` — доля скорости (0.5 = вдвое медленнее, 0 = стоит на месте,
 * 1 = обычная прокрутка). Где есть scroll-driven animations (`ScrollTimeline`),
 * сдвиг считает браузер на композиторе без JS; иначе — passive scroll + rAF.
 * Меняется только `transform`. При reduced-motion ничего не делает.
 * @param {HTMLElement} element
 * @param {number} [koeff]
 * @param {{kontejner?:HTMLElement|Window, predel?:number}} [opcii] контейнер прокрутки (по умолчанию ближайший) и предел сдвига в px
 * @returns {() => void} функция отключения
 */
export function parallaks(element, koeff = 0.5, opcii = {}) {
  if (!estOkno || !element || dvizhenieSnyato() || koeff === 1) return () => {};
  const kontejner = opcii.kontejner ?? prokruchivaemyyPredok(element);
  const predel = opcii.predel ?? Infinity;
  const dolya = 1 - koeff; // на сколько отстаём от прокрутки
  element.style.willChange = 'transform';

  const scrollTop = () => (kontejner === window ? window.scrollY : kontejner.scrollTop);
  const dlina = () => (kontejner === window
    ? document.documentElement.scrollHeight - window.innerHeight
    : kontejner.scrollHeight - kontejner.clientHeight);

  // Пока шторка заперла страницу (body fixed, scrollY = 0), параллакс замораживаем
  // на текущем сдвиге — иначе под затемнением баннер съезжал бы к нулю.
  let zamorozhen = false;

  // Путь 1: CSS scroll-driven animation через WAAPI (Chrome 115+)
  if (podderzhkaScrollTimeline && typeof ScrollTimeline === 'function' && element.animate) {
    let anim = null;
    const postroit = () => {
      if (zamorozhen) return;
      if (anim) anim.cancel();
      const vsego = Math.max(1, dlina());
      const polnyy = vsego * dolya; // сдвиг в самом низу без предела
      // Таймлайн идёт по всей длине прокрутки, а сдвиг = scrollTop * dolya.
      // С пределом — излом: предел наступает при scrollTop = predel / dolya, дальше стоим.
      // (Без излома предел растягивался на всю страницу и параллакс был почти не виден.)
      const kadry = predel < polnyy
        ? [
          { transform: 'translateY(0px)', offset: 0 },
          { transform: `translateY(${predel.toFixed(1)}px)`, offset: Math.min(1, Math.max(0, predel / dolya / vsego)) },
          { transform: `translateY(${predel.toFixed(1)}px)`, offset: 1 },
        ]
        : [{ transform: 'translateY(0px)' }, { transform: `translateY(${polnyy.toFixed(1)}px)` }];
      anim = element.animate(kadry, {
        timeline: new ScrollTimeline({ source: kontejner === window ? document.documentElement : kontejner, axis: 'block' }),
        fill: 'both',
        easing: 'linear',
      });
    };
    const slushatel = {
      zaperto: () => {
        // снимаем текущий сдвиг и держим его инлайном, пока страница заперта
        const sdvig = getComputedStyle(element).transform;
        if (anim) { anim.cancel(); anim = null; }
        element.style.transform = sdvig === 'none' ? '' : sdvig;
        zamorozhen = true;
      },
      otperto: () => { zamorozhen = false; element.style.transform = ''; postroit(); },
    };
    slushateliBlokirovki.add(slushatel);
    if (prokrutkaZaperta()) zamorozhen = true; else postroit();
    // при изменении высоты содержимого пересчитываем пробег
    const nabl = typeof ResizeObserver === 'function' ? new ResizeObserver(postroit) : null;
    if (nabl) nabl.observe(kontejner === window ? document.documentElement : kontejner);
    return () => {
      slushateliBlokirovki.delete(slushatel);
      if (anim) anim.cancel();
      if (nabl) nabl.disconnect();
      element.style.transform = '';
      element.style.willChange = '';
    };
  }

  // Путь 2: passive scroll + rAF
  let zapros = null;
  const primenit = () => {
    zapros = null;
    if (zamorozhen) return;
    const sdvig = Math.min(predel, scrollTop() * dolya);
    element.style.transform = `translateY(${sdvig.toFixed(1)}px)`;
  };
  const naScroll = () => { if (!zapros) zapros = requestAnimationFrame(primenit); };
  const slushatel = {
    zaperto: () => { zamorozhen = true; },
    otperto: () => { zamorozhen = false; primenit(); },
  };
  slushateliBlokirovki.add(slushatel);
  kontejner.addEventListener('scroll', naScroll, { passive: true });
  if (prokrutkaZaperta()) zamorozhen = true; else primenit();
  return () => {
    slushateliBlokirovki.delete(slushatel);
    kontejner.removeEventListener('scroll', naScroll);
    if (zapros) cancelAnimationFrame(zapros);
    element.style.transform = '';
    element.style.willChange = '';
  };
}

// ---------------------------------------------------------------------------
// Наблюдение за разделами
// ---------------------------------------------------------------------------

/**
 * Следит, какой раздел сейчас в середине экрана, и зовёт `obrabotchik(razdelId)`
 * при смене. Разделы — потомки `kontejner` с атрибутом `data-razdel` (или
 * `opcii.selektor`). Работает через IntersectionObserver с полосой в центре
 * экрана; когда контейнер докручен до низа, активным считается последний раздел.
 * @param {HTMLElement} kontejner прокручиваемый контейнер или общий родитель разделов
 * @param {(razdelId:string, element:HTMLElement)=>void} obrabotchik
 * @param {{selektor?:string, polosa?:number}} [opcii] polosa — доля высоты экрана вокруг центра (по умолчанию 0.2)
 * @returns {(() => void) & {obnovit: () => void}} функция отключения; `obnovit()` — пересобрать список разделов после смены DOM
 */
export function nablyudatRazdely(kontejner, obrabotchik, opcii = {}) {
  const pusto = () => {};
  pusto.obnovit = () => {};
  if (!estOkno || !kontejner || typeof IntersectionObserver !== 'function') return pusto;
  const selektor = opcii.selektor ?? '[data-razdel]';
  const polosa = Math.min(0.9, Math.max(0.05, opcii.polosa ?? 0.2));
  const kray = `${((1 - polosa) / 2 * 100).toFixed(1)}%`;
  const prokrutka = prokruchivaemyyPredok(kontejner.firstElementChild || kontejner);
  const root = prokrutka === window ? null : prokrutka;
  let tekushchiy = null;
  let elementy = [];
  let uNiza = false;
  let kadr = 0;
  const vidimye = new Set();

  const soobshchit = (element) => {
    if (!element) return;
    const id = element.dataset.razdel ?? element.id;
    if (id === tekushchiy) return;
    tekushchiy = id;
    obrabotchik(id, element);
  };

  // Ни одного чтения геометрии: всё знают наблюдатели. Раньше здесь на каждый scroll
  // читались scrollY/scrollHeight — после записей параллакса это форсировало макет
  // (на слабом телефоне 650 мс из 7,6 с прокрутки, круг 2).
  const vybrat = () => {
    // Пока шторка заперла страницу, body в position:fixed — разделы и «низ» врут.
    // Раздел под шторкой не меняется, поэтому молчим, а после отпирания пересчитаем.
    if (prokrutkaZaperta()) return;
    // внизу — последний раздел, иначе первый по порядку из тех, кто пересёк полосу
    if (uNiza && elementy.length) { soobshchit(elementy[elementy.length - 1]); return; }
    const kandidat = elementy.find((e) => vidimye.has(e));
    if (kandidat) soobshchit(kandidat);
  };
  // не чаще раза за кадр, сколько бы записей ни пришло
  const zaprositVybor = () => {
    if (kadr) return;
    kadr = requestAnimationFrame(() => { kadr = 0; vybrat(); });
  };

  const nabl = new IntersectionObserver((zapisi) => {
    for (const z of zapisi) { if (z.isIntersecting) vidimye.add(z.target); else vidimye.delete(z.target); }
    zaprositVybor();
  }, { root, rootMargin: `-${kray} 0px -${kray} 0px`, threshold: 0 });

  // «Докручено до низа» — сторож высотой 1 px в самом конце прокручиваемой области:
  // виден в нижних 2 px экрана ровно тогда, когда scrollTop + высота >= scrollHeight - 2.
  const storozh = document.createElement('div');
  storozh.setAttribute('aria-hidden', 'true');
  storozh.dataset.storozhNiza = '';
  storozh.style.cssText = 'height:1px;margin-top:-1px;pointer-events:none;visibility:hidden;contain:strict';
  const mestoStorozha = root || document.body;
  const nablNiz = new IntersectionObserver((zapisi) => {
    const z = zapisi[zapisi.length - 1];
    uNiza = z.isIntersecting;
    zaprositVybor();
  }, { root, rootMargin: '0px 0px 2px 0px', threshold: 0 });
  const postavitStorozha = () => {
    // кто-то дописал статичный блок после сторожа — сторож снова в конец
    if (mestoStorozha.lastElementChild !== storozh) mestoStorozha.appendChild(storozh);
  };

  // после отпирания шторки страница вернулась на место — пересчитать
  const slushatel = { zaperto: () => {}, otperto: () => { postavitStorozha(); zaprositVybor(); } };
  slushateliBlokirovki.add(slushatel);

  const obnovit = () => {
    nabl.disconnect();
    vidimye.clear();
    elementy = Array.from(kontejner.querySelectorAll(selektor));
    elementy.forEach((e) => nabl.observe(e));
    postavitStorozha();
  };
  obnovit();
  nablNiz.observe(storozh);

  const otklyuchit = () => {
    nabl.disconnect();
    nablNiz.disconnect();
    storozh.remove();
    slushateliBlokirovki.delete(slushatel);
    if (kadr) cancelAnimationFrame(kadr);
    kadr = 0;
  };
  otklyuchit.obnovit = obnovit;
  return otklyuchit;
}

// ---------------------------------------------------------------------------
// Блокировка прокрутки фона (общая для шторок)
// ---------------------------------------------------------------------------

let glubinaBlokirovki = 0;
let sohranennyyScroll = 0;
let sohranennyeStili = null;
// Кто хочет знать о запирании: пока body в position:fixed, window.scrollY = 0,
// и всё, что считает от прокрутки окна (параллакс, активный раздел), врало бы.
// Элемент — { zaperto(), otperto() }.
const slushateliBlokirovki = new Set();

/** Страница сейчас заперта шторкой? */
function prokrutkaZaperta() {
  return glubinaBlokirovki > 0;
}

/** Запирает прокрутку страницы (считает вложенность: две шторки — два вызова). */
function zaperetProkrutku() {
  glubinaBlokirovki += 1;
  if (glubinaBlokirovki > 1) return;
  // сначала заморозить слушателей — они снимают своё состояние при живой прокрутке
  slushateliBlokirovki.forEach((s) => { try { s.zaperto(); } catch (o) { /* чужая ошибка не ломает шторку */ } });
  const body = document.body;
  sohranennyyScroll = window.scrollY;
  sohranennyeStili = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow, width: body.style.width };
  // position:fixed — единственный способ остановить фон и на iOS Safari
  Object.assign(body.style, { position: 'fixed', top: `-${sohranennyyScroll}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
}

/** Отпирает прокрутку и возвращает страницу на прежнее место. */
function otperetProkrutku() {
  if (glubinaBlokirovki === 0) return;
  glubinaBlokirovki -= 1;
  if (glubinaBlokirovki > 0) return;
  Object.assign(document.body.style, sohranennyeStili || {});
  sohranennyeStili = null;
  // 'instant' — чтобы scroll-behavior:smooth в стилях витрины не прокатывал страницу заново
  try { window.scrollTo({ top: sohranennyyScroll, left: 0, behavior: 'instant' }); } catch (o) { window.scrollTo(0, sohranennyyScroll); }
  slushateliBlokirovki.forEach((s) => { try { s.otperto(); } catch (o) { /* см. выше */ } });
}

// ---------------------------------------------------------------------------
// Модальность шторок: стек, инертный фон, ловушка фокуса
// ---------------------------------------------------------------------------

// Открытые шторки по порядку открытия: Escape и Tab обслуживает только верхняя.
const stekShtorok = [];
// Инертный фон со счётчиком: две шторки подряд делают фон инертным дважды,
// и закрытие верхней не должно снять инертность, которую держит нижняя.
const schetchikInert = new Map(); // элемент -> сколько шторок его держат
const nashiInert = new Set(); // кому inert поставили мы (чужой inert не трогаем)
// Кого не глушим: затемнения, тосты («Вернуть» должен нажиматься), летящие клоны
const NE_GLUSHIT = /(^|\s)(shtorka-fon|tosty|polet)(\s|$)/;

/**
 * Делает инертным всё вокруг шторки: соседей шторки и соседей каждого её предка до body.
 * Инертное не получает ни фокуса, ни касаний, скрыто от чтеца экрана.
 * @param {HTMLElement} element шторка
 * @param {HTMLElement|null} fon её затемнение
 * @returns {HTMLElement[]} кого заглушили (для снятия)
 */
function zaglushitFon(element, fon) {
  const spisok = [];
  let uzel = element;
  while (uzel && uzel.parentElement && uzel !== document.body && uzel !== document.documentElement) {
    for (const sosed of uzel.parentElement.children) {
      if (sosed === uzel || sosed === fon) continue;
      if (NE_GLUSHIT.test(sosed.className && typeof sosed.className === 'string' ? sosed.className : '')) continue;
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE|META)$/.test(sosed.tagName)) continue;
      spisok.push(sosed);
    }
    uzel = uzel.parentElement;
  }
  for (const el of spisok) {
    const n = schetchikInert.get(el) || 0;
    if (n === 0 && !el.inert) { el.inert = true; nashiInert.add(el); }
    schetchikInert.set(el, n + 1);
  }
  return spisok;
}

/** Снимает инертность, поставленную zaglushitFon (с учётом других открытых шторок). */
function vernutFon(spisok) {
  for (const el of spisok) {
    const n = (schetchikInert.get(el) || 1) - 1;
    if (n > 0) { schetchikInert.set(el, n); continue; }
    schetchikInert.delete(el);
    if (nashiInert.has(el)) { el.inert = false; nashiInert.delete(el); }
  }
}

/** Видимые элементы шторки, на которые можно перейти Tab-ом. */
function fokusiruemye(element) {
  const vse = element.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  return [...vse].filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
}

// ---------------------------------------------------------------------------
// Нижняя шторка
// ---------------------------------------------------------------------------

/**
 * Нижняя шторка. Элемент верстается снаружи (fixed внизу, свой фон и радиус),
 * модуль отвечает за движение: открытие/закрытие с пружиной, перетаскивание за
 * ручку (`[data-ruchka]` внутри или `opcii.ruchka`), порог сброса по расстоянию
 * и скорости, затемнение фона, запирание прокрутки страницы, Escape и тап по
 * затемнению. Содержимое внутри `element` прокручивается само.
 *
 * Возвращает управление:
 * - `otkryt()` → Promise, когда шторка доехала;
 * - `zakryt(prichina)` → Promise, когда ушла (или когда закрытие отменил новый `otkryt()` — тогда
 *   шторка остаётся открытой, `naZakrytie` не зовётся); prichina попадает в `naZakrytie` и `zhdatZakrytiya()`
 *   ('ruchka' | 'fon' | 'escape' | своя строка);
 * - `zhdatZakrytiya()` → Promise<prichina> ближайшего закрытия;
 * - `otkryta` — флаг, `unichtozhit()` — снять слушатели.
 * @param {HTMLElement} element
 * @param {{ruchka?:HTMLElement|string, fon?:HTMLElement|false, porog?:number, naZakrytie?:(prichina:string)=>void, zakryvatFonom?:boolean, zakryvatEscape?:boolean, zapiratProkrutku?:boolean, cvetFona?:string}} [opcii]
 *   porog — доля высоты шторки, после которой отпускание закрывает (по умолчанию 0.3)
 * @returns {{otkryt:()=>Promise<void>, zakryt:(prichina?:string)=>Promise<void>, zhdatZakrytiya:()=>Promise<string>, otkryta:boolean, element:HTMLElement, fon:HTMLElement|null, unichtozhit:()=>void}}
 */
export function shtorka(element, opcii = {}) {
  const porog = opcii.porog ?? 0.3;
  const zakryvatFonom = opcii.zakryvatFonom !== false;
  const zakryvatEscape = opcii.zakryvatEscape !== false;
  const zapirat = opcii.zapiratProkrutku !== false;

  // Затемнение: своё или созданное здесь (перед шторкой, чтобы лежать под ней)
  let fon = null;
  if (opcii.fon !== false) {
    fon = opcii.fon ?? document.createElement('div');
    if (!opcii.fon) {
      const zIndex = getComputedStyle(element).zIndex;
      fon.className = 'shtorka-fon';
      Object.assign(fon.style, {
        position: 'fixed',
        inset: '0',
        background: opcii.cvetFona ?? 'rgba(35, 26, 20, .42)',
        zIndex: zIndex !== 'auto' ? String(Number(zIndex) - 1) : '',
        pointerEvents: 'none',
        opacity: '0',
      });
      element.parentNode.insertBefore(fon, element);
    }
    fon.setAttribute('aria-hidden', 'true');
  }

  if (!element.getAttribute('role')) element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
  element.style.visibility = 'hidden';
  element.style.transform = 'translateY(100%)';

  const ruchka = typeof opcii.ruchka === 'string'
    ? element.querySelector(opcii.ruchka)
    : (opcii.ruchka ?? element.querySelector('[data-ruchka]'));
  if (ruchka) { ruchka.style.touchAction = 'none'; ruchka.style.cursor = 'grab'; }

  const upravlenie = { element, fon, otkryta: false };
  let animShtorki = null;
  let animFona = null;
  let fokusDo = null;
  let ozhidayushchie = [];
  let zakrytiePromise = null;

  const dvigatFon = (do_, ms, easing = 'ease') => {
    if (!fon) return Promise.resolve();
    if (animFona) animFona.cancel();
    const ot = Number(getComputedStyle(fon).opacity);
    animFona = fon.animate([{ opacity: ot }, { opacity: do_ }], { duration: ms, easing, fill: 'forwards' });
    return animFona.finished.catch(() => undefined);
  };

  const vysota = () => element.getBoundingClientRect().height || element.offsetHeight || 1;

  /** Текущий сдвиг шторки в px (из анимации или инлайн-стиля). */
  const sdvigSeychas = () => {
    try {
      const m = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Number.isFinite(m.m42) ? m.m42 : 0;
    } catch (o) { return 0; }
  };

  /**
   * Довозит шторку от сдвига `otPx` к 0 (открыта) или к своей высоте (закрыта).
   * @param {number} otPx
   * @param {boolean} otkryt
   */
  const doehat = (otPx, otkryt) => {
    if (animShtorki) animShtorki.cancel();
    const h = vysota();
    const doPx = otkryt ? 0 : h;
    if (dvizhenieSnyato()) {
      element.style.transform = 'translateY(0)';
      animShtorki = element.animate([{ opacity: otkryt ? 0 : 1 }, { opacity: otkryt ? 1 : 0 }], { duration: 180, fill: 'forwards' });
    } else {
      const preset = pruzhina.myagkaya;
      const ms = otkryt ? preset.ms : Math.max(160, Math.round(260 * Math.abs(doPx - otPx) / h));
      animShtorki = element.animate(
        [{ transform: `translateY(${otPx.toFixed(1)}px)` }, { transform: `translateY(${doPx}px)` }],
        { duration: ms, easing: otkryt ? preset.easing : 'cubic-bezier(.4, 0, .8, .6)', fill: 'forwards' },
      );
    }
    const tekushchaya = animShtorki;
    return tekushchaya.finished.catch(() => undefined).then(() => {
      if (animShtorki !== tekushchaya) return; // перебили другой анимацией
      element.style.transform = otkryt ? 'translateY(0)' : 'translateY(100%)';
      element.style.opacity = '';
      animShtorki.cancel();
      animShtorki = null;
    });
  };

  const naKlavishu = (sobytie) => {
    // Две шторки друг над другом: клавиши достаются только верхней
    if (sobytie.defaultPrevented || stekShtorok[stekShtorok.length - 1] !== upravlenie) return;
    if (zakryvatEscape && sobytie.key === 'Escape') { sobytie.preventDefault(); zakryt('escape'); return; }
    if (sobytie.key !== 'Tab') return;
    // Ловушка фокуса: Tab ходит по кругу внутри шторки и не уходит на фон
    const spisok = fokusiruemye(element);
    const aktivnyy = document.activeElement;
    if (!spisok.length) { sobytie.preventDefault(); try { element.focus({ preventScroll: true }); } catch (o) { /* ничего */ } return; }
    const pervyy = spisok[0];
    const posledniy = spisok[spisok.length - 1];
    const vnutri = element.contains(aktivnyy);
    if (sobytie.shiftKey && (!vnutri || aktivnyy === pervyy || aktivnyy === element)) {
      sobytie.preventDefault(); posledniy.focus({ preventScroll: true });
    } else if (!sobytie.shiftKey && (!vnutri || aktivnyy === posledniy)) {
      sobytie.preventDefault(); pervyy.focus({ preventScroll: true });
    }
  };
  const naFon = () => zakryt('fon');

  // Модальность: место в стеке и инертный фон держатся, пока шторка открыта
  let zaglushennye = null;
  let tajmerFona = null;
  const statModalnoy = () => {
    const i = stekShtorok.indexOf(upravlenie);
    if (i >= 0) stekShtorok.splice(i, 1);
    stekShtorok.push(upravlenie);
    if (!zaglushennye) zaglushennye = zaglushitFon(element, fon);
  };
  const perestatBytModalnoy = () => {
    const i = stekShtorok.indexOf(upravlenie);
    if (i >= 0) stekShtorok.splice(i, 1);
    if (zaglushennye) { vernutFon(zaglushennye); zaglushennye = null; }
    clearTimeout(tajmerFona);
  };

  // Номер текущего закрытия: открытие посреди уезжающей шторки его сбивает,
  // и хвост старого закрытия (visibility:hidden, отпирание, naZakrytie) не выполняется.
  let nomerZakrytiya = 0;
  // Эта шторка сейчас держит запирание прокрутки (ровно один раз, без двойного счёта)
  let derzhitBlokirovku = false;

  const otkryt = () => {
    if (upravlenie.otkryta) return Promise.resolve();
    upravlenie.otkryta = true;
    // Открыли, пока шторка уезжала: разворачиваем её с текущего места,
    // прокрутка всё ещё заперта этой же шторкой, фокус-возврат прежний.
    const razvorot = zakrytiePromise !== null;
    const otPx = razvorot ? Math.max(0, sdvigSeychas()) : vysota();
    nomerZakrytiya += 1;
    zakrytiePromise = null;
    if (!razvorot) { fokusDo = document.activeElement; vremyaOtkrytiya = performance.now(); }
    if (zapirat && !derzhitBlokirovku) { zaperetProkrutku(); derzhitBlokirovku = true; }
    element.style.visibility = 'visible';
    element.style.opacity = '';
    statModalnoy();
    // Затемнение принимает касания не сразу: второй тап быстрого двойного
    // (или click, пришедший следом за pointerup, по которому открыли) не должен закрыть шторку.
    if (fon) {
      fon.style.pointerEvents = 'none';
      clearTimeout(tajmerFona);
      if (zakryvatFonom) tajmerFona = setTimeout(() => { if (upravlenie.otkryta) fon.style.pointerEvents = 'auto'; }, 350);
    }
    dvigatFon(1, 260);
    document.addEventListener('keydown', naKlavishu);
    if (fon && zakryvatFonom) fon.addEventListener('click', naFon);
    return doehat(otPx, true).then(() => {
      if (!upravlenie.otkryta) return; // пока ехала — закрыли
      try { element.focus({ preventScroll: true }); } catch (o) { /* фокус не критичен */ }
    });
  };

  const zakryt = (prichina = 'kod') => {
    if (!upravlenie.otkryta) return zakrytiePromise || Promise.resolve();
    upravlenie.otkryta = false;
    document.removeEventListener('keydown', naKlavishu);
    perestatBytModalnoy();
    if (fon) { fon.removeEventListener('click', naFon); fon.style.pointerEvents = 'none'; }
    dvigatFon(0, 220);
    nomerZakrytiya += 1;
    const moy = nomerZakrytiya;
    zakrytiePromise = doehat(sdvigSeychas(), false).then(() => {
      // шторку успели открыть снова — это закрытие отменено, ничего не прячем
      if (moy !== nomerZakrytiya || upravlenie.otkryta) return;
      element.style.visibility = 'hidden';
      if (derzhitBlokirovku) { otperetProkrutku(); derzhitBlokirovku = false; }
      if (fokusDo && fokusDo.focus) { try { fokusDo.focus({ preventScroll: true }); } catch (o) { /* ничего */ } }
      zakrytiePromise = null;
      if (opcii.naZakrytie) opcii.naZakrytie(prichina);
      const spisok = ozhidayushchie;
      ozhidayushchie = [];
      spisok.forEach((gotovo) => gotovo(prichina));
    });
    return zakrytiePromise;
  };

  // Перетаскивание за ручку
  let tyanem = false;
  let startY = 0;
  let poslednie = []; // [{t, y}] за последние ~100 мс — для скорости броска
  const rezina = (dy) => (dy >= 0 ? dy : -Math.pow(-dy, 0.7)); // вверх тянется как резина
  const naVniz = (sobytie) => {
    if (!upravlenie.otkryta || (sobytie.pointerType === 'mouse' && sobytie.button !== 0)) return;
    tyanem = true;
    // Схватили, пока шторка ещё едет: продолжаем с текущего места, а не прыгаем наверх
    const sdvig = Math.max(0, sdvigSeychas());
    startY = sobytie.clientY - sdvig;
    poslednie = [{ t: performance.now(), y: sobytie.clientY }];
    if (animShtorki) { animShtorki.cancel(); animShtorki = null; }
    element.style.transform = `translateY(${sdvig.toFixed(1)}px)`;
    try { ruchka.setPointerCapture(sobytie.pointerId); } catch (o) { /* не во всех браузерах */ }
    ruchka.style.cursor = 'grabbing';
  };
  const naDvizhenie = (sobytie) => {
    if (!tyanem) return;
    const dy = sobytie.clientY - startY;
    element.style.transform = `translateY(${rezina(dy).toFixed(1)}px)`;
    if (fon) { if (animFona) { animFona.cancel(); animFona = null; } fon.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / vysota())); }
    const t = performance.now();
    poslednie.push({ t, y: sobytie.clientY });
    while (poslednie.length > 2 && t - poslednie[0].t > 100) poslednie.shift();
  };
  const naVverh = (sobytie) => {
    if (!tyanem) return;
    tyanem = false;
    ruchka.style.cursor = 'grab';
    const dy = sobytie.clientY - startY;
    const pervyy = poslednie[0];
    const seychas = performance.now();
    const skorost = pervyy && seychas > pervyy.t ? (sobytie.clientY - pervyy.y) / (seychas - pervyy.t) : 0; // px/мс
    if (sobytie.type !== 'pointercancel' && (dy > vysota() * porog || skorost > 0.55)) {
      vibro(6);
      zakryt('ruchka');
    } else {
      dvigatFon(1, 200);
      doehat(Math.max(0, rezina(dy)), true);
    }
  };
  if (ruchka) {
    ruchka.addEventListener('pointerdown', naVniz);
    ruchka.addEventListener('pointermove', naDvizhenie);
    ruchka.addEventListener('pointerup', naVverh);
    ruchka.addEventListener('pointercancel', naVverh);
  }
  // Не даём затемнению прокручивать страницу пальцем
  const naTouchFona = (sobytie) => sobytie.preventDefault();
  if (fon) fon.addEventListener('touchmove', naTouchFona, { passive: false });
  // «Призрачный» тап: второй тап быстрого двойного попадает уже в выезжающую шторку
  // (на месте кнопки корзины внизу оказывается её кнопка «В меню») и закрывает её.
  // Нажатия внутри шторки в первые 350 мс после открытия не принимаем.
  let vremyaOtkrytiya = -Infinity;
  const naRanniyKlik = (sobytie) => {
    if (performance.now() - vremyaOtkrytiya < 350) { sobytie.preventDefault(); sobytie.stopPropagation(); }
  };
  element.addEventListener('click', naRanniyKlik, true);

  upravlenie.otkryt = otkryt;
  upravlenie.zakryt = zakryt;
  upravlenie.zhdatZakrytiya = () => new Promise((gotovo) => { ozhidayushchie.push(gotovo); });
  upravlenie.unichtozhit = () => {
    upravlenie.otkryta = false;
    nomerZakrytiya += 1;
    if (derzhitBlokirovku) { otperetProkrutku(); derzhitBlokirovku = false; }
    document.removeEventListener('keydown', naKlavishu);
    perestatBytModalnoy();
    if (ruchka) {
      ruchka.removeEventListener('pointerdown', naVniz);
      ruchka.removeEventListener('pointermove', naDvizhenie);
      ruchka.removeEventListener('pointerup', naVverh);
      ruchka.removeEventListener('pointercancel', naVverh);
    }
    if (fon) {
      fon.removeEventListener('click', naFon);
      fon.removeEventListener('touchmove', naTouchFona);
      if (!opcii.fon) fon.remove();
    }
    element.removeEventListener('click', naRanniyKlik, true);
    if (animShtorki) animShtorki.cancel();
  };
  return upravlenie;
}

// ---------------------------------------------------------------------------
// Тост
// ---------------------------------------------------------------------------

let kontejnerTostov = null;
let tekushchiyTost = null;

/**
 * Всплывашка снизу над навигацией: появляется с пружиной, уходит сама.
 * Новый тост сменяет предыдущий. Отступ снизу берётся из CSS-переменной
 * `--tost-otstup` на `:root` (по умолчанию 88px + safe-area). Внешний вид
 * задаётся классом `tost` (и `opcii.klass`), базовые стили — инлайн, чтобы
 * тост читался и без стилей витрины.
 * @param {string} tekst
 * @param {{ms?:number, deystvie?:{tekst:string, naNazhatie:()=>void}, klass?:string, vibro?:boolean}} [opcii]
 * @returns {{element:HTMLElement, zakryt:()=>Promise<void>, gotovo:Promise<void>}}
 */
export function pokazatTost(tekst, opcii = {}) {
  const ms = opcii.ms ?? 2600;
  if (!kontejnerTostov || !kontejnerTostov.isConnected) {
    kontejnerTostov = document.createElement('div');
    kontejnerTostov.className = 'tosty';
    kontejnerTostov.setAttribute('aria-live', 'polite');
    Object.assign(kontejnerTostov.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: 'calc(var(--tost-otstup, 88px) + env(safe-area-inset-bottom, 0px))',
      // сетка с одной ячейкой: уходящий и новый тост лежат друг на друге,
      // а не бок о бок в строке (иначе новый прыгает в центр, когда старый исчезнет)
      display: 'grid',
      justifyItems: 'center',
      alignItems: 'end',
      pointerEvents: 'none',
      zIndex: '1200',
      padding: '0 16px',
    });
    document.body.appendChild(kontejnerTostov);
  }
  if (tekushchiyTost) tekushchiyTost.zakryt();

  const element = document.createElement('div');
  element.className = `tost${opcii.klass ? ` ${opcii.klass}` : ''}`;
  element.setAttribute('role', 'status');
  Object.assign(element.style, {
    gridArea: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '420px',
    padding: '12px 16px',
    borderRadius: '16px',
    background: 'rgba(35, 26, 20, .92)',
    color: '#FFF7EC',
    font: '500 15px/1.3 Onest, system-ui, sans-serif',
    boxShadow: '0 12px 32px rgba(120, 60, 20, .28)',
    pointerEvents: 'auto',
    willChange: 'transform, opacity',
  });
  const nadpis = document.createElement('span');
  nadpis.textContent = tekst;
  element.appendChild(nadpis);
  if (opcii.deystvie) {
    const knopka = document.createElement('button');
    knopka.type = 'button';
    knopka.textContent = opcii.deystvie.tekst;
    Object.assign(knopka.style, {
      border: '0',
      background: 'transparent',
      color: '#FFB03A',
      font: '700 15px/1 Unbounded, Onest, system-ui, sans-serif',
      padding: '8px 4px',
      minHeight: '44px',
      cursor: 'pointer',
    });
    knopka.addEventListener('click', () => { opcii.deystvie.naNazhatie(); zakryt(); });
    nazhatie(knopka, { masshtab: 0.92 });
    element.appendChild(knopka);
  }
  kontejnerTostov.appendChild(element);
  if (opcii.vibro) vibro(6);

  const snyato = dvizhenieSnyato();
  const vhod = element.animate(
    snyato
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateY(28px) scale(.94)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
    { duration: snyato ? 160 : pruzhina.zhivaya.ms, easing: snyato ? 'ease' : pruzhina.zhivaya.easing, fill: 'backwards' },
  );

  let zakryt_ = null;
  let taymer = null;
  const gotovo = new Promise((resh) => {
    zakryt_ = () => {
      if (!element.isConnected) return Promise.resolve();
      clearTimeout(taymer);
      if (tekushchiyTost && tekushchiyTost.element === element) tekushchiyTost = null;
      vhod.cancel();
      element.style.pointerEvents = 'none'; // уходящий не ловит тапы
      const uhod = element.animate(
        snyato
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(16px) scale(.96)', opacity: 0 }],
        { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' },
      );
      return uhod.finished.catch(() => undefined).then(() => { element.remove(); resh(); });
    };
    taymer = setTimeout(zakryt_, ms);
  });
  const zakryt = () => zakryt_();
  tekushchiyTost = { element, zakryt, gotovo };
  return tekushchiyTost;
}

// ---------------------------------------------------------------------------
// Каскадное появление
// ---------------------------------------------------------------------------

/**
 * Появление списка карточек лесенкой: каждая следующая — на `shag` мс позже,
 * снизу-вверх с пружиной. Задержка растёт только у первых `opcii.predel`
 * элементов (по умолчанию 12) — остальные появляются вместе с последним,
 * чтобы длинный раздел не «капал» секундами. При reduced-motion — короткое
 * проявление без сдвига.
 * @param {Iterable<HTMLElement>|NodeList|HTMLElement[]} elementy
 * @param {number} [shag]
 * @param {{predel?:number, sdvig?:number, ms?:number}} [opcii]
 * @returns {Promise<void>} когда все доехали
 */
export function poyavlenieKaskadom(elementy, shag = 40, opcii = {}) {
  const spisok = Array.from(elementy || []).filter((e) => e && e.animate);
  if (!spisok.length) return Promise.resolve();
  const predel = opcii.predel ?? 12;
  const sdvig = opcii.sdvig ?? 18;
  const snyato = dvizhenieSnyato();
  const preset = pruzhina.myagkaya;
  const ms = opcii.ms ?? (snyato ? 160 : preset.ms);
  const animacii = spisok.map((element, i) => {
    const zaderzhka = Math.min(i, predel) * shag;
    return element.animate(
      snyato
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateY(${sdvig}px) scale(.98)`, opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }],
      { duration: ms, delay: zaderzhka, easing: snyato ? 'ease' : preset.easing, fill: 'backwards' },
    );
  });
  return Promise.all(animacii.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
}
