/**
 * Хинкалик — персонаж-помощник витрины Хинкальной (модуль C).
 *
 * Настоящий хинкали: мешочек теста с широким низом, складки, собранные
 * к вытянутому хвостику-«ножке» сверху. Два глаза с бликами, зрачки следят
 * за пальцем, веки моргают, брови и рот меняют настроение, облачко реплики
 * с пружиной. В плавающем режиме живёт справа снизу над навигацией
 * (отступ снизу — CSS-переменная `--hinkalik-otstup`, по умолчанию 84px),
 * слегка покачивается, смахивается вправо за край — торчит «ушко»-хвостик,
 * тап по нему возвращает персонажа.
 *
 * Без зависимостей. Стили модуль добавляет в `<head>` сам, один раз.
 * При `prefers-reduced-motion: reduce` покачивание, подскок и пружины
 * снимаются, остаются мягкие смены прозрачности.
 *
 * Использование:
 *   import { Hinkalik, volnaZagruzki } from './hinkalik.js';
 *   const hinkalik = new Hinkalik(document.body);        // плавающий, 88 px
 *   hinkalik.skazat('Начнём с хинкали?');
 *   hinkalik.nastroenie('rad'); hinkalik.pryg();
 */

// ---------------------------------------------------------------------------
// Среда
// ---------------------------------------------------------------------------

const estOkno = typeof window !== 'undefined' && typeof document !== 'undefined';
const zaprosSnyatiya = estOkno && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Просил ли гость убрать движение (`prefers-reduced-motion: reduce`).
 * @returns {boolean}
 */
function dvizhenieSnyato() {
  return Boolean(zaprosSnyatiya && zaprosSnyatiya.matches);
}

/** Пружинистые кривые для переходов (запасной вариант без `linear()`). */
const PRUZHINA = {
  zhivaya: 'cubic-bezier(.34, 1.56, .64, 1)',
  obychnaya: 'cubic-bezier(.3, 1.25, .5, 1)',
  myagkaya: 'cubic-bezier(.22, 1, .36, 1)',
};

// ---------------------------------------------------------------------------
// Геометрия персонажа (рисуем в поле 120×150, видимое окно — viewBox 0 22 120 128, хвостик сверху, дно внизу)
// ---------------------------------------------------------------------------

/**
 * Мешочек одним контуром: широкое мягкое дно, плечи плавно сходятся
 * к узкой шейке под хвостиком — силуэт капли, а не купола.
 */
const PUT_MESHOCHKA = 'M47.5 58 C44 64.5, 34 68, 24 78 C12 90, 6 108, 9 124 C12 139, 34 145, 60 145 C86 145, 108 139, 111 124 C114 108, 108 90, 96 78 C86 68, 76 64.5, 72.5 58 Z';

/**
 * Хвостик-«ножка»: плотный скрученный узел теста, чуть завален вправо,
 * сверху — защипнутая «коронка» из трёх бугорков.
 */
const PUT_HVOSTIKA = 'M48.5 62 C47.8 56, 50.6 52, 50.2 48 C49.8 44, 51.8 41.4, 51.8 38.6 C51.6 35.2, 55 33, 57.8 34.2 C59.6 31.4, 65 31.2, 66.6 33.8 C69.8 33, 73 35.4, 72.2 38.6 C71.6 41.4, 73 44.6, 71.8 48.4 C70.8 52.4, 72.4 56.6, 71.5 62 Z';

/** Витки скрутки на хвостике: снизу-слева вверх-направо. */
const SKLADKI_HVOSTIKA = [
  'M49.5 54 C52.5 49, 54.8 43.5, 56.5 36.5',
  'M53 61 C57 54.5, 60 46, 62 35',
  'M59 62 C62.5 55.5, 65.5 47, 67.6 37',
  'M65 62 C67.6 57.5, 69.8 52, 71.4 45',
];

/** Макушка хвостика: защипнутая серединка «коронки». */
const MAKUSHKA = { cx: 62.3, cy: 35, rx: 4.2, ry: 1.6 };

/**
 * Складки мешочка. Тесто собрано к шейке и чуть закручено, поэтому каждая
 * складка — S-кривая: от шейки уходит вправо-вниз, к низу раскрывается веером.
 * Крайние складки срезаются контуром (clipPath) — так они «уходят за бок».
 * @returns {string[]} пути складок
 */
function postroitSkladki() {
  const skladki = [];
  for (let i = -4; i <= 4; i += 1) {
    const x0 = 60 + i * 2.4;
    const y0 = 59 - Math.abs(i) * 0.3;
    const x1 = 60 + i * 11.5 + 1;
    const y1 = 85 - Math.abs(i) * 2.6;
    const c1x = x0 + 7 + i * 0.6;
    const c1y = y0 + 5;
    const c2x = x1 + 4 - i * 0.4;
    const c2y = y1 - 11;
    skladki.push(`M${ch(x0)} ${ch(y0)} C${ch(c1x)} ${ch(c1y)}, ${ch(c2x)} ${ch(c2y)}, ${ch(x1)} ${ch(y1)}`);
  }
  return skladki;
}
const SKLADKI_MESHOCHKA = postroitSkladki();

/** Цвет контура теста — тёплый, мягкий, не чёрный. */
const KONTUR = '#CE9E5F';
/** Цвет складок. */
const SKLADKA = '#C4935A';

/** Центры глаз и их размеры. */
const GLAZA = { l: { cx: 43, cy: 105 }, r: { cx: 77, cy: 105 }, rx: 11, ry: 12.2, zrachok: 5.9 };

/** Опорная точка фигуры для наклона — середина дна. */
const OPORA = { x: 60, y: 142 };

/**
 * Лица по настроениям. Брови — 4 точки кубической кривой (8 чисел),
 * рот — замкнутая фигура из двух кубических кривых (12 чисел: угол, две
 * контрольные нижней губы, угол, две контрольные верхней губы). У «линейных»
 * ртов верхняя и нижняя кривые совпадают, заливка выключена (`rotZaliv: 0`).
 */
const LICA = {
  obychno: {
    brovL: [35, 91, 39, 87, 46, 86, 52, 89], brovR: [68, 89, 74, 86, 81, 87, 85, 91],
    rot: [53, 123, 56, 128, 64, 128, 67, 123, 64, 128, 56, 128], rotZaliv: 0, yazyk: 0,
    glaza: 1, zrachok: [0, 0], zrachokMasshtab: 1, naklon: 0, masshtab: 1, shcheki: 0.22,
  },
  rad: {
    brovL: [34, 87, 38, 82, 47, 82, 52, 86], brovR: [68, 86, 73, 82, 82, 82, 86, 87],
    rot: [48, 121, 52, 136, 68, 136, 72, 121, 68, 124, 52, 124], rotZaliv: 1, yazyk: 1,
    glaza: 0.84, zrachok: [0, 0], zrachokMasshtab: 1, naklon: -3, masshtab: 1, shcheki: 0.42,
  },
  udivlen: {
    brovL: [34, 84, 37, 76, 47, 76, 52, 82], brovR: [68, 82, 73, 76, 83, 76, 86, 84],
    rot: [55, 123, 55, 132, 65, 132, 65, 123, 65, 115, 55, 115], rotZaliv: 1, yazyk: 0,
    glaza: 1.12, zrachok: [0, 0], zrachokMasshtab: 0.8, naklon: 0, masshtab: 1.05, shcheki: 0.22,
  },
  grustno: {
    brovL: [34, 92, 40, 91, 47, 87, 52, 85], brovR: [68, 85, 73, 87, 80, 91, 86, 92],
    rot: [53, 128, 56, 122, 64, 122, 67, 128, 64, 122, 56, 122], rotZaliv: 0, yazyk: 0,
    glaza: 0.86, zrachok: [0, 2], zrachokMasshtab: 1, naklon: 4, masshtab: 0.98, shcheki: 0.16,
  },
  dumaet: {
    brovL: [34, 86, 38, 81, 47, 81, 52, 85], brovR: [68, 92, 73, 90, 81, 90, 86, 92],
    rot: [54, 126, 57, 122, 63, 128, 66, 124, 63, 128, 57, 122], rotZaliv: 0, yazyk: 0,
    glaza: 0.95, zrachok: [2.6, -3], zrachokMasshtab: 1, naklon: -6, masshtab: 1, shcheki: 0.22,
  },
  spit: {
    brovL: [35, 94, 39, 92, 46, 92, 52, 94], brovR: [68, 94, 74, 92, 81, 92, 85, 94],
    rot: [56, 125, 58, 128, 62, 128, 64, 125, 62, 128, 58, 128], rotZaliv: 0, yazyk: 0,
    glaza: 1, zrachok: [0, 0], zrachokMasshtab: 1, naklon: 7, masshtab: 1, shcheki: 0.22,
  },
};

/** Список допустимых настроений. */
export const NASTROENIYA = Object.keys(LICA);

/**
 * Строка пути брови из 8 чисел.
 * @param {number[]} t
 * @returns {string}
 */
function putBrovi(t) {
  return `M${ch(t[0])} ${ch(t[1])} C${ch(t[2])} ${ch(t[3])}, ${ch(t[4])} ${ch(t[5])}, ${ch(t[6])} ${ch(t[7])}`;
}

/**
 * Строка замкнутого пути рта из 12 чисел.
 * @param {number[]} t
 * @returns {string}
 */
function putRta(t) {
  return `M${ch(t[0])} ${ch(t[1])} C${ch(t[2])} ${ch(t[3])}, ${ch(t[4])} ${ch(t[5])}, ${ch(t[6])} ${ch(t[7])} `
    + `C${ch(t[8])} ${ch(t[9])}, ${ch(t[10])} ${ch(t[11])}, ${ch(t[0])} ${ch(t[1])} Z`;
}

/** Число с двумя знаками, без хвостовых нулей. */
function ch(n) {
  return String(Math.round(n * 100) / 100);
}

/**
 * Разметка SVG-персонажа. Чистая функция: работает и в браузере, и в node
 * (для сохранения значка). Если `zhivoy` — трансформации лица не вписываются
 * атрибутами, ими управляет класс `Hinkalik`.
 *
 * @param {object} [opcii]
 * @param {string} [opcii.nastroenie='rad'] одно из NASTROENIYA
 * @param {string} [opcii.prefiks] префикс id для градиентов (уникален на экземпляр)
 * @param {boolean} [opcii.zhivoy=false] без статичных transform-атрибутов
 * @param {string} [opcii.klass=''] дополнительный класс на <svg>
 * @param {number|null} [opcii.razmer=null] явные width/height в px (иначе 100 %)
 * @param {boolean} [opcii.sTenyu=true] тень на полу под персонажем
 * @returns {string} разметка <svg>
 */
export function svgHinkalika(opcii = {}) {
  const {
    nastroenie = 'rad',
    prefiks = 'hk' + Math.random().toString(36).slice(2, 8),
    zhivoy = false,
    klass = '',
    razmer = null,
    sTenyu = true,
  } = opcii;
  const lico = LICA[nastroenie] || LICA.rad;
  const p = prefiks;
  // Точка опоры для CSS-трансформаций — только у живого персонажа: у статичного
  // трансформации вписаны атрибутами, и transform-origin сдвинул бы их второй раз.
  const opora = (x, y) => (zhivoy ? `style="transform-origin:${x}px ${y}px"` : '');

  const glaz = (storona) => {
    const g = GLAZA[storona];
    const s = lico.glaza;
    const transformVek = zhivoy ? '' : ` transform="translate(0 ${ch(g.cy * (1 - s))}) scale(1 ${ch(s)})"`;
    const transformZrachok = zhivoy ? '' : ` transform="translate(${ch(lico.zrachok[0])} ${ch(lico.zrachok[1])})"`;
    const m = lico.zrachokMasshtab;
    const transformZenica = zhivoy || m === 1 ? '' : ` transform="translate(${ch(g.cx * (1 - m))} ${ch(g.cy * (1 - m))}) scale(${ch(m)})"`;
    return `
      <g class="hinkalik__glaz hinkalik__glaz--${storona}" ${opora(g.cx, g.cy)} opacity="${nastroenie === 'spit' ? 0 : 1}"${transformVek}>
        <ellipse cx="${g.cx}" cy="${g.cy}" rx="${GLAZA.rx}" ry="${GLAZA.ry}" fill="#FFFFFF" stroke="#CFA872" stroke-width="1"/>
        <g class="hinkalik__zrachok"${transformZrachok}>
          <circle class="hinkalik__zenica" cx="${g.cx}" cy="${g.cy + 0.6}" r="${GLAZA.zrachok}" fill="#2B1A10" ${opora(g.cx, g.cy + 0.6)}${transformZenica}/>
          <circle cx="${g.cx + 2.1}" cy="${g.cy - 2.4}" r="2.2" fill="#FFFFFF"/>
          <circle cx="${g.cx - 1.8}" cy="${g.cy + 2.6}" r="1" fill="#FFFFFF" opacity=".85"/>
        </g>
      </g>`;
  };

  const transformFigury = zhivoy ? ''
    : ` transform="translate(${OPORA.x} ${OPORA.y}) rotate(${lico.naklon}) scale(${lico.masshtab}) translate(${-OPORA.x} ${-OPORA.y})"`;
  const atributyRazmera = razmer ? ` width="${razmer}" height="${Math.round(razmer * 128 / 120)}"` : ' width="100%" height="100%"';
  const klassy = ['hinkalik__svg', klass].filter(Boolean).join(' ');

  return `<svg class="${klassy}" xmlns="http://www.w3.org/2000/svg" viewBox="0 22 120 128"${atributyRazmera} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${p}-testo" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FFFAEE"/>
      <stop offset="0.5" stop-color="#FBE6BF"/>
      <stop offset="1" stop-color="#EDC286"/>
    </linearGradient>
    <linearGradient id="${p}-hvost" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#EDCB92"/>
      <stop offset="0.45" stop-color="#FFF5DD"/>
      <stop offset="1" stop-color="#DDB072"/>
    </linearGradient>
    <linearGradient id="${p}-ten" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.5" stop-color="#A56E2E" stop-opacity="0"/>
      <stop offset="1" stop-color="#A56E2E" stop-opacity="0.26"/>
    </linearGradient>
    <radialGradient id="${p}-blik" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="${p}-razmytie" x="-30%" y="-200%" width="160%" height="500%">
      <feGaussianBlur stdDeviation="2.4"/>
    </filter>
    <clipPath id="${p}-rot-klip"><path class="hinkalik__rot-klip" d="${putRta(lico.rot)}"/></clipPath>
    <clipPath id="${p}-klip-telo"><path d="${PUT_MESHOCHKA}"/></clipPath>
    <clipPath id="${p}-klip-hvost"><path d="${PUT_HVOSTIKA}"/></clipPath>
    <linearGradient id="${p}-skladka" gradientUnits="userSpaceOnUse" x1="0" y1="57" x2="0" y2="90">
      <stop offset="0" stop-color="${SKLADKA}" stop-opacity=".95"/>
      <stop offset="0.55" stop-color="${SKLADKA}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${SKLADKA}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}-skladka-svet" gradientUnits="userSpaceOnUse" x1="0" y1="57" x2="0" y2="88">
      <stop offset="0" stop-color="#FFFCF2" stop-opacity=".9"/>
      <stop offset="1" stop-color="#FFFCF2" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${sTenyu ? `<ellipse class="hinkalik__pol" cx="60" cy="145.5" rx="34" ry="4" fill="#8A5A2B" opacity=".22" filter="url(#${p}-razmytie)"/>` : ''}
  <g class="hinkalik__figura" ${opora(OPORA.x, OPORA.y)}${transformFigury}>
    <path d="${PUT_HVOSTIKA}" fill="url(#${p}-hvost)" stroke="${KONTUR}" stroke-width="1.5" stroke-linejoin="round"/>
    <g clip-path="url(#${p}-klip-hvost)" fill="none" stroke-linecap="round">
      <g stroke="#FFFBEF" stroke-width="1.1" opacity=".8" transform="translate(1.1 .2)">${SKLADKI_HVOSTIKA.map((d) => `<path d="${d}"/>`).join('')}</g>
      <g stroke="${SKLADKA}" stroke-width="1.15" opacity=".8">${SKLADKI_HVOSTIKA.map((d) => `<path d="${d}"/>`).join('')}</g>
    </g>
    <ellipse cx="${MAKUSHKA.cx}" cy="${MAKUSHKA.cy}" rx="${MAKUSHKA.rx}" ry="${MAKUSHKA.ry}" fill="${SKLADKA}" opacity=".45"/>
    <path d="${PUT_MESHOCHKA}" fill="url(#${p}-testo)"/>
    <path d="${PUT_MESHOCHKA}" fill="url(#${p}-ten)"/>
    <g clip-path="url(#${p}-klip-telo)">
      <ellipse cx="60" cy="59" rx="14" ry="5" fill="#A56E2E" opacity=".24" filter="url(#${p}-razmytie)"/>
      <ellipse cx="33" cy="98" rx="12" ry="7" fill="url(#${p}-blik)" transform="rotate(-38 33 98)"/>
      <g fill="none" stroke-linecap="round">
        <g stroke="url(#${p}-skladka-svet)" stroke-width="1.8" transform="translate(1.5 .2)">${SKLADKI_MESHOCHKA.map((d) => `<path d="${d}"/>`).join('')}</g>
        <g stroke="url(#${p}-skladka)" stroke-width="1.7">${SKLADKI_MESHOCHKA.map((d) => `<path d="${d}"/>`).join('')}</g>
      </g>
    </g>
    <path d="${PUT_MESHOCHKA}" fill="none" stroke="${KONTUR}" stroke-width="1.6" stroke-linejoin="round"/>
    <g class="hinkalik__shcheki" fill="#F0532D" opacity="${lico.shcheki}">
      <circle cx="27" cy="118" r="5.5"/><circle cx="93" cy="118" r="5.5"/>
    </g>
    ${glaz('l')}
    ${glaz('r')}
    <g class="hinkalik__veki" fill="none" stroke="#6B4A2A" stroke-width="2.4" stroke-linecap="round" opacity="${nastroenie === 'spit' ? 1 : 0}">
      <path d="M${GLAZA.l.cx - 8} ${GLAZA.l.cy} C${GLAZA.l.cx - 4} ${GLAZA.l.cy + 6}, ${GLAZA.l.cx + 4} ${GLAZA.l.cy + 6}, ${GLAZA.l.cx + 8} ${GLAZA.l.cy}"/>
      <path d="M${GLAZA.r.cx - 8} ${GLAZA.r.cy} C${GLAZA.r.cx - 4} ${GLAZA.r.cy + 6}, ${GLAZA.r.cx + 4} ${GLAZA.r.cy + 6}, ${GLAZA.r.cx + 8} ${GLAZA.r.cy}"/>
    </g>
    <g fill="none" stroke="#6B4A2A" stroke-width="2.6" stroke-linecap="round">
      <path class="hinkalik__brov hinkalik__brov--l" d="${putBrovi(lico.brovL)}"/>
      <path class="hinkalik__brov hinkalik__brov--r" d="${putBrovi(lico.brovR)}"/>
    </g>
    <path class="hinkalik__rot" d="${putRta(lico.rot)}" fill="#7B2D3B" fill-opacity="${lico.rotZaliv}" stroke="#6B4A2A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse class="hinkalik__yazyk" cx="60" cy="134" rx="6.5" ry="4" fill="#E8607C" opacity="${lico.yazyk}" clip-path="url(#${p}-rot-klip)"/>
    <g class="hinkalik__zzz${nastroenie === 'spit' ? ' hinkalik__zzz--spit' : ''}" fill="#8A6A44" font-family="Unbounded, system-ui, sans-serif" font-weight="700" opacity="${nastroenie === 'spit' ? 1 : 0}">
      <text class="hinkalik__z" x="80" y="44" font-size="11">z</text>
      <text class="hinkalik__z" x="90" y="30" font-size="8">z</text>
      <text class="hinkalik__z" x="99" y="19" font-size="6">z</text>
    </g>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Стили (добавляются в <head> один раз)
// ---------------------------------------------------------------------------

const STILI = `
.hinkalik{--razmer:88px;--ushko:30px;position:relative;display:inline-block;width:var(--razmer);height:var(--razmer);vertical-align:bottom;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;transition:transform .45s ${PRUZHINA.obychnaya},opacity .3s ease-out}
.hinkalik--plavayushchiy{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(var(--hinkalik-otstup,84px) + env(safe-area-inset-bottom,0px));z-index:60;touch-action:pan-y;translate:0 var(--uvorot,0px);transition:transform .55s ${PRUZHINA.obychnaya},translate .45s ${PRUZHINA.obychnaya},opacity .25s ease-out}
.hinkalik--plavayushchiy.hinkalik--pritih{opacity:0;pointer-events:none;translate:calc(var(--razmer) * .7) var(--uvorot,0px)}
.hinkalik--plavayushchiy.hinkalik--vyglyadyvaet:not(.hinkalik--spryatan):not(.hinkalik--ubran){transform:translateX(var(--vyglyad-sdvig,calc(var(--razmer) * .58 + 14px)))}
.hinkalik--vyglyadyvaet:not(.hinkalik--spryatan) .hinkalik__svg{transform:rotate(-9deg)}
.hinkalik--tashchat{transition:none}
.hinkalik--spryatan{transform:translateX(calc(var(--razmer) - var(--ushko)))}
.hinkalik--ubran{opacity:0;pointer-events:none;transform:scale(.6)}
.hinkalik--ubran.hinkalik--plavayushchiy{transform:translateX(calc(var(--razmer) + 24px))}
.hinkalik__kach{width:100%;height:100%;animation:hinkalik-kach 4s ease-in-out infinite}
.hinkalik[data-nastroenie="spit"] .hinkalik__kach{animation:hinkalik-dyshit 3.4s ease-in-out infinite}
.hinkalik--spryatan .hinkalik__kach{animation:hinkalik-ushko 3s ease-in-out infinite}
.hinkalik__telo{display:block;width:100%;height:100%;padding:0;margin:0;border:0;background:none;cursor:pointer;color:inherit;font:inherit;transform-origin:50% 100%;-webkit-tap-highlight-color:transparent;transition:transform .14s ease-out}
.hinkalik__telo:focus-visible{outline:3px solid #FFB03A;outline-offset:4px;border-radius:999px}
.hinkalik__telo--nazhat{transform:scale(.93)}
.hinkalik__svg{display:block;width:100%;height:100%;overflow:visible;transform-origin:50% 50%;transition:transform .55s ${PRUZHINA.obychnaya};filter:drop-shadow(0 6px 10px rgba(120,60,20,.16))}
.hinkalik--spryatan .hinkalik__svg{transform:rotate(-82deg)}
.hinkalik__figura{transition:transform .45s ${PRUZHINA.zhivaya}}
.hinkalik__glaz{transition:transform .35s ease-out,opacity .25s ease-out}
.hinkalik__veki{transition:opacity .25s ease-out}
.hinkalik__zenica{transition:transform .35s ease-out}
.hinkalik__shcheki,.hinkalik__yazyk,.hinkalik__zzz{transition:opacity .35s ease-out}
/* «z-z-z» анимируются только во сне: невидимые буквы раньше крутились всегда — пересчёт SVG каждый кадр (круг 2) */
.hinkalik__z{opacity:0}
.hinkalik__zzz--spit .hinkalik__z{animation:hinkalik-z 2.4s ease-in-out infinite}
.hinkalik__zzz--spit .hinkalik__z:nth-child(2){animation-delay:.5s}
.hinkalik__zzz--spit .hinkalik__z:nth-child(3){animation-delay:1s}
.hinkalik__oblachko{position:absolute;bottom:calc(100% + 10px);right:4px;width:max-content;max-width:min(240px,calc(100vw - 48px));pointer-events:none;z-index:1}
.hinkalik:not(.hinkalik--plavayushchiy) .hinkalik__oblachko{right:auto;left:50%;transform:translateX(-50%);max-width:min(300px,calc(100vw - 48px))}
.hinkalik__oblachko-telo{position:relative;background:#FFFFFF;color:#231A14;font-family:Onest,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:clamp(14px,calc(var(--razmer) * .17),17px);font-weight:500;line-height:1.3;padding:10px 14px;border-radius:16px;box-shadow:0 10px 26px rgba(120,60,20,.18),0 1px 0 rgba(120,60,20,.06);transform-origin:100% 100%;opacity:0;transform:scale(.6);will-change:transform,opacity}
.hinkalik:not(.hinkalik--plavayushchiy) .hinkalik__oblachko-telo{transform-origin:50% 100%}
.hinkalik__oblachko-telo::after{content:"";position:absolute;bottom:-6px;right:calc(var(--razmer) * .36);width:14px;height:14px;background:#FFFFFF;border-radius:3px;transform:rotate(45deg);box-shadow:4px 4px 8px rgba(120,60,20,.06)}
.hinkalik:not(.hinkalik--plavayushchiy) .hinkalik__oblachko-telo::after{right:auto;left:50%;margin-left:-7px}
.hinkalik__oblachko--vidno .hinkalik__oblachko-telo{opacity:1;transform:scale(1)}
.hinkalik-volna{display:flex;align-items:flex-end;justify-content:center;gap:10px;padding:14px 8px 6px}
.hinkalik-volna__el{position:relative;width:38px;height:48px}
.hinkalik-volna__el .hinkalik__svg{filter:none;transform-origin:50% 100%;animation:hinkalik-volna-pryg 1.15s cubic-bezier(.4,.1,.5,1) infinite}
.hinkalik-volna__ten{position:absolute;left:50%;bottom:-3px;width:26px;height:6px;margin-left:-13px;border-radius:999px;background:#8A5A2B;opacity:.2;filter:blur(1.5px);transform-origin:50% 50%;animation:hinkalik-volna-ten 1.15s cubic-bezier(.4,.1,.5,1) infinite}
/* покой (html.pokoy, 9 с без касаний — ставит index.html): качание и «z-z-z» замирают */
html.pokoy .hinkalik__kach,html.pokoy .hinkalik__z{animation-play-state:paused}
@keyframes hinkalik-kach{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-2.6px) rotate(-1.4deg)}70%{transform:translateY(-.8px) rotate(1.2deg)}}
@keyframes hinkalik-dyshit{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1px) scale(1.025,.975)}}
@keyframes hinkalik-ushko{0%,100%{transform:translateX(0)}50%{transform:translateX(-3px)}}
@keyframes hinkalik-z{0%{transform:translate(0,0);opacity:0}25%{opacity:1}100%{transform:translate(4px,-10px);opacity:0}}
@keyframes hinkalik-volna-pryg{0%,100%{transform:translateY(0) scale(1,1)}12%{transform:translateY(2px) scale(1.14,.84)}40%{transform:translateY(-18px) scale(.9,1.12)}58%{transform:translateY(0) scale(1.1,.88)}72%{transform:translateY(0) scale(.98,1.03)}}
@keyframes hinkalik-volna-ten{0%,100%{transform:scale(1);opacity:.2}40%{transform:scale(.55);opacity:.08}58%{transform:scale(1.15);opacity:.24}}
@keyframes hinkalik-volna-tiho{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){
  .hinkalik__kach,.hinkalik[data-nastroenie="spit"] .hinkalik__kach,.hinkalik--spryatan .hinkalik__kach{animation:none}
  .hinkalik--plavayushchiy,.hinkalik__svg,.hinkalik__figura,.hinkalik__glaz,.hinkalik__zenica,.hinkalik__telo{transition-duration:.01s;transition-timing-function:ease-out}
  .hinkalik__oblachko-telo{transition:opacity .2s ease-out;transform:none}
  .hinkalik__oblachko--vidno .hinkalik__oblachko-telo{transform:none}
  .hinkalik__z{animation:none;opacity:1}
  .hinkalik-volna__el .hinkalik__svg{animation:hinkalik-volna-tiho 1.4s ease-in-out infinite}
  .hinkalik-volna__ten{animation:none}
}
`;

let stiliDobavleny = false;

/** Добавляет стили персонажа в документ, если их ещё нет. */
function dobavitStili() {
  if (stiliDobavleny || !estOkno) return;
  if (!document.getElementById('hinkalik-stili')) {
    const stil = document.createElement('style');
    stil.id = 'hinkalik-stili';
    stil.textContent = STILI;
    document.head.appendChild(stil);
  }
  stiliDobavleny = true;
}

// ---------------------------------------------------------------------------
// Персонаж
// ---------------------------------------------------------------------------

/** Плавное «с перелётом» — для морфинга бровей и рта. */
function plavnoSPereletom(t) {
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

let schetchikEkzemplyarov = 0;

/**
 * Хинкалик — персонаж-помощник.
 *
 * @example
 * const h = new Hinkalik(document.body, { razmer: 88, plavayushchiy: true });
 * h.skazat('В корзине пусто — начать с хинкали?');
 */
export class Hinkalik {
  /**
   * @param {HTMLElement} kontejner куда вставить персонажа (в плавающем режиме — обычно document.body)
   * @param {object} [opcii]
   * @param {number} [opcii.razmer=88] размер стороны квадрата в px
   * @param {boolean} [opcii.plavayushchiy=true] фиксированный справа снизу, смахивается
   * @param {string} [opcii.nastroenie='obychno'] стартовое настроение
   * @param {boolean} [opcii.sledit=true] следить зрачками за пальцем/курсором самому
   * @param {boolean} [opcii.morgaet=true] моргать самому раз в 3–7 с
   * @param {string} [opcii.podpis='Хинкалик, помощник'] aria-label кнопки
   */
  constructor(kontejner, opcii = {}) {
    if (!estOkno) throw new Error('Hinkalik: нужен браузер');
    const {
      razmer = 88, plavayushchiy = true, nastroenie = 'obychno', sledit = true, morgaet = true,
      podpis = 'Хинкалик, помощник',
    } = opcii;
    dobavitStili();

    this.razmer = razmer;
    this.plavayushchiy = plavayushchiy;
    this.prefiks = 'hk' + (++schetchikEkzemplyarov) + Math.random().toString(36).slice(2, 6);
    this.obrabotchikiNazhatiya = [];
    this.spryatan = false;
    this.ubran = false;
    this.tekushcheeNastroenie = nastroenie in LICA ? nastroenie : 'obychno';

    // Разметка
    this.el = document.createElement('div');
    this.el.className = 'hinkalik' + (plavayushchiy ? ' hinkalik--plavayushchiy' : '');
    this.el.style.setProperty('--razmer', razmer + 'px');
    this.el.style.setProperty('--ushko', Math.round(Math.max(30, razmer * 0.5)) + 'px');
    this.el.dataset.nastroenie = this.tekushcheeNastroenie;
    this.el.innerHTML = `
      <div class="hinkalik__oblachko" aria-live="polite"><div class="hinkalik__oblachko-telo"></div></div>
      <div class="hinkalik__kach">
        <button type="button" class="hinkalik__telo" aria-label="${podpis}">${svgHinkalika({ nastroenie: this.tekushcheeNastroenie, prefiks: this.prefiks, zhivoy: true })}</button>
      </div>`;
    kontejner.appendChild(this.el);

    this.telo = this.el.querySelector('.hinkalik__telo');
    this.svg = this.el.querySelector('.hinkalik__svg');
    this.figura = this.el.querySelector('.hinkalik__figura');
    this.glaza = [...this.el.querySelectorAll('.hinkalik__glaz')];
    this.zrachki = [...this.el.querySelectorAll('.hinkalik__zrachok')];
    this.zenicy = [...this.el.querySelectorAll('.hinkalik__zenica')];
    this.brovL = this.el.querySelector('.hinkalik__brov--l');
    this.brovR = this.el.querySelector('.hinkalik__brov--r');
    this.rot = this.el.querySelector('.hinkalik__rot');
    this.rotKlip = this.el.querySelector('.hinkalik__rot-klip');
    this.yazyk = this.el.querySelector('.hinkalik__yazyk');
    this.shcheki = this.el.querySelector('.hinkalik__shcheki');
    this.zzz = this.el.querySelector('.hinkalik__zzz');
    this.veki = this.el.querySelector('.hinkalik__veki');
    this.oblachko = this.el.querySelector('.hinkalik__oblachko');
    this.oblachkoTelo = this.el.querySelector('.hinkalik__oblachko-telo');

    // Лицо: текущие точки для морфинга
    const lico = LICA[this.tekushcheeNastroenie];
    this.licoTekushchee = { brovL: [...lico.brovL], brovR: [...lico.brovR], rot: [...lico.rot], rotZaliv: lico.rotZaliv };
    this.morfing = null;
    this.primenitLico(lico, true);

    // Взгляд
    this.vzglyadCel = { x: 0, y: 0 };
    this.vzglyadTek = { x: 0, y: 0 };
    this.vzglyadZatuhaet = null;
    this.vzglyadZhivoy = true;

    // Реплика
    this.tajmerRepliki = null;

    // Слушатели
    this.spisokSlushateley = [];
    if (sledit) this.vklyuchitSlezhenie();
    if (morgaet) this.planirovatMorganie();
    this.navesitKasanie();
    this.navesitVidimost();
    if (plavayushchiy) {
      // в покое выглядывает из-за правого края (видна треть с одним глазом),
      // целиком выходит на реплику, подскок и касание — и не закрывает меню
      this.vyglyadyvaet = true;
      this.el.classList.add('hinkalik--vyglyadyvaet');
      this.navesitUvorot();
    }
    this.tik = this.tik.bind(this);
    this.kadr = null;
    this.razbuditVzglyad();
  }

  // ------------------------------------------------------------------ взгляд

  /**
   * Зрачки смотрят в точку экрана. Сам вызывается на pointermove/touchmove;
   * через 2,5 с без движения взгляд возвращается к центру.
   * @param {number} x clientX
   * @param {number} y clientY
   */
  smotret(x, y) {
    const r = this.svg.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.7;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const sila = Math.min(1, d / 260) * 3.2;
    this.vzglyadCel = { x: (dx / d) * sila, y: (dy / d) * sila };
    this.razbuditVzglyad();
    clearTimeout(this.vzglyadZatuhaet);
    this.vzglyadZatuhaet = setTimeout(() => { this.vzglyadCel = { x: 0, y: 0 }; this.razbuditVzglyad(); }, 2500);
  }

  /** Подписка на движение пальца/курсора по окну. */
  vklyuchitSlezhenie() {
    if (dvizhenieSnyato()) return;
    const naPointer = (e) => this.smotret(e.clientX, e.clientY);
    const naTouch = (e) => { const t = e.touches[0]; if (t) this.smotret(t.clientX, t.clientY); };
    window.addEventListener('pointermove', naPointer, { passive: true });
    window.addEventListener('touchmove', naTouch, { passive: true });
    window.addEventListener('pointerdown', naPointer, { passive: true });
    this.spisokSlushateley.push(
      () => window.removeEventListener('pointermove', naPointer),
      () => window.removeEventListener('touchmove', naTouch),
      () => window.removeEventListener('pointerdown', naPointer),
    );
  }

  /** Кадр: зрачки догоняют цель с затуханием. */
  tik() {
    // Цикл кадров живёт, только пока зрачки догоняют цель: в покое ни одного кадра (круг 2)
    this.kadr = null;
    if (!this.vzglyadZhivoy) return;
    const lico = LICA[this.tekushcheeNastroenie];
    const celX = this.vzglyadCel.x + lico.zrachok[0];
    const celY = this.vzglyadCel.y + lico.zrachok[1];
    const ddx = celX - this.vzglyadTek.x;
    const ddy = celY - this.vzglyadTek.y;
    if (Math.abs(ddx) < 0.005 && Math.abs(ddy) < 0.005) return;
    this.kadr = requestAnimationFrame(this.tik);
    this.vzglyadTek.x += ddx * 0.14;
    this.vzglyadTek.y += ddy * 0.14;
    const t = `translate(${this.vzglyadTek.x.toFixed(2)}px, ${this.vzglyadTek.y.toFixed(2)}px)`;
    for (const z of this.zrachki) z.style.transform = t;
  }

  /** Запустить цикл зрачков, если он стоит (новая цель взгляда, смена настроения). */
  razbuditVzglyad() {
    if (!this.kadr && this.vzglyadZhivoy !== false) this.kadr = requestAnimationFrame(this.tik);
  }

  /** Пауза rAF при скрытой вкладке. */
  navesitVidimost() {
    const naVidimost = () => {
      this.vzglyadZhivoy = !document.hidden;
      if (this.vzglyadZhivoy) this.razbuditVzglyad();
    };
    document.addEventListener('visibilitychange', naVidimost);
    this.spisokSlushateley.push(() => document.removeEventListener('visibilitychange', naVidimost));
  }

  // ------------------------------------------------------------ уворот (плавающий)

  /**
   * Плавающий персонаж не должен мешать гостю читать меню (круг 2: сидел на названиях блюд):
   * - в покое он выглядывает из-за правого края — видна полоска ~34 px с одним глазом,
   *   это поле страницы и самый край карточки; целиком выходит только на реплику,
   *   подскок, касание и фокус с клавиатуры (`vyyti`), потом снова прячется (`vyglyanut`);
   * - пока под ним прокручивают страницу — приглушается и уезжает к краю, касания проходят сквозь;
   * - через 600 мс покоя возвращается, но только туда, где под видимой частью нет ни кнопок
   *   («+», степпер), ни строк текста (название, описание, цена, заголовок раздела):
   *   если место занято — поднимается выше, а если свободного нет — ждёт в стороне;
   * - на экране уже есть другой Хинкалик (баннер, пустой поиск, шторка) — уступает ему.
   * Место перепроверяется по событиям (касание, смена экрана, конец прокрутки, размер окна)
   * и изредка для страховки — но не в покое (html.pokoy) и не на скрытой вкладке.
   */
  navesitUvorot() {
    this.uvorot = 0;
    this.prokruchivayut = false;
    let tajmerPokoya = null;
    let tajmerProverki = null;
    const zaplanirovat = (ms) => {
      clearTimeout(tajmerProverki);
      tajmerProverki = setTimeout(() => this.proveritMesto(), ms);
    };
    this.zaplanirovatProverku = zaplanirovat;
    const naProkrutku = (sobytie) => {
      if (this.ubran || this.spryatan) return;
      // Прокрутка вдали (например, горизонтальная лента сторис наверху) персонажа не касается
      const cel = sobytie.target;
      if (cel && cel.nodeType === 1 && cel !== document.documentElement && cel !== document.body) {
        const r = cel.getBoundingClientRect();
        const m = this.bazovyyPryamougolnik();
        if (r.bottom < m.top || r.top > m.bottom || r.right < m.left || r.left > m.right) return;
      }
      this.prokruchivayut = true;
      this.el.classList.add('hinkalik--pritih');
      clearTimeout(tajmerPokoya);
      tajmerPokoya = setTimeout(() => { this.prokruchivayut = false; this.proveritMesto(); }, 600);
    };
    document.addEventListener('scroll', naProkrutku, { capture: true, passive: true });
    const naRazmer = () => zaplanirovat(120);
    // «+» превращается в степпер, открывается шторка, меняется экран — всё это после касания
    const naKasanie = (e) => { if (!this.el.contains(e.target)) zaplanirovat(420); };
    const naMarshrut = () => zaplanirovat(500);
    window.addEventListener('resize', naRazmer, { passive: true });
    document.addEventListener('click', naKasanie, { capture: true, passive: true });
    // ввод в поиске перерисовывает выдачу без касаний
    document.addEventListener('input', naMarshrut, { capture: true, passive: true });
    window.addEventListener('hashchange', naMarshrut);
    // страховка от изменений без касания (данные дорисовались) — редко и только когда страница жива
    this.tajmerMesta = setInterval(() => {
      if (!document.hidden && !document.documentElement.classList.contains('pokoy')) this.proveritMesto();
    }, 2500);
    this.spisokSlushateley.push(
      () => document.removeEventListener('scroll', naProkrutku, { capture: true }),
      () => window.removeEventListener('resize', naRazmer),
      () => document.removeEventListener('click', naKasanie, { capture: true }),
      () => window.removeEventListener('hashchange', naMarshrut),
      () => document.removeEventListener('input', naMarshrut, { capture: true }),
      () => clearInterval(this.tajmerMesta),
      () => clearTimeout(tajmerPokoya),
      () => clearTimeout(tajmerProverki),
      () => clearTimeout(this.tajmerVyhoda),
    );
    // фокус с клавиатуры — выйти целиком, чтобы обводку было видно
    this.telo.addEventListener('focus', () => { if (this.telo.matches(':focus-visible')) this.vyyti(0); });
    this.telo.addEventListener('blur', () => { if (!this.vyglyadyvaet) this.vyyti(900); });
    setTimeout(() => this.proveritMesto(), 0);
  }

  /** Сдвиг вправо в режиме «выглядывает»: на экране остаётся ~42 % персонажа. */
  sdvigVyglyada() {
    const pravyyZazor = Math.max(0, window.innerWidth - (this.el.offsetLeft + this.razmer));
    // на десктопе персонаж у края колонки, а не экрана — выглядывает из-за края колонки
    return Math.round(this.razmer * 0.58 + Math.min(pravyyZazor, 24));
  }

  /**
   * Выйти из-за края целиком (реплика, подскок, касание).
   * @param {number} ms через сколько снова выглядывать; 0 — пока не позовут `vyglyanut`
   */
  vyyti(ms = 3000) {
    if (!this.plavayushchiy) return;
    clearTimeout(this.tajmerVyhoda);
    if (this.vyglyadyvaet) {
      this.vyglyadyvaet = false;
      this.el.classList.remove('hinkalik--vyglyadyvaet');
      if (this.zaplanirovatProverku) this.zaplanirovatProverku(30);
    }
    if (ms > 0) this.tajmerVyhoda = setTimeout(() => this.vyglyanut(), ms);
  }

  /** Снова спрятаться за край по пояс — если не говорит, не тащат и не в фокусе. */
  vyglyanut() {
    if (!this.plavayushchiy || this.vyglyadyvaet) return;
    clearTimeout(this.tajmerVyhoda);
    const zanyat = this.oblachko.classList.contains('hinkalik__oblachko--vidno')
      || this.el.classList.contains('hinkalik--tashchat')
      || (document.activeElement === this.telo && this.telo.matches(':focus-visible'));
    if (zanyat) { this.tajmerVyhoda = setTimeout(() => this.vyglyanut(), 1200); return; }
    this.vyglyadyvaet = true;
    this.el.style.setProperty('--vyglyad-sdvig', this.sdvigVyglyada() + 'px');
    this.el.classList.add('hinkalik--vyglyadyvaet');
    if (this.zaplanirovatProverku) this.zaplanirovatProverku(80);
  }

  /** Место персонажа без уворота и без переходов (offset* не видят transform/translate). */
  bazovyyPryamougolnik() {
    const left = this.el.offsetLeft;
    const top = this.el.offsetTop;
    return { left, top, right: left + this.razmer, bottom: top + this.razmer };
  }

  /** Виден ли на экране другой Хинкалик (герой баннера, пустого состояния, шторки). */
  estDrugoyHinkalik() {
    const shir = window.innerWidth;
    const vys = window.innerHeight;
    for (const s of document.querySelectorAll('.hinkalik__svg, .hinkalik-volna')) {
      if (this.el.contains(s) || s.closest('[inert]')) continue;
      const b = s.getBoundingClientRect();
      if (b.width < 24 || b.height < 24) continue;
      // видно хотя бы 40 % фигуры
      const vidimX = Math.min(b.right, shir) - Math.max(b.left, 0);
      const vidimY = Math.min(b.bottom, vys) - Math.max(b.top, 0);
      if (vidimX <= 0 || vidimY <= 0 || (vidimX * vidimY) / (b.width * b.height) < 0.4) continue;
      if (typeof s.checkVisibility === 'function' && !s.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      return true;
    }
    return false;
  }

  /**
   * Есть ли строка текста элемента (или двух его предков) внутри прямоугольника.
   * Сравниваются настоящие строки (Range.getClientRects), а не коробка блока:
   * короткое название не занимает пустое место справа от себя.
   */
  tekstVPolose(el, p, diapazon) {
    for (let e = el, i = 0; e && i < 3 && e !== document.body; e = e.parentElement, i++) {
      let ramka = null;
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !n.data.trim()) continue;
        // строка с многоточием (text-overflow) длиннее видимой — режем её рамкой родителя
        if (!ramka) ramka = e.getBoundingClientRect();
        diapazon.selectNodeContents(n);
        for (const r of diapazon.getClientRects()) {
          const left = Math.max(r.left, ramka.left);
          const right = Math.min(r.right, ramka.right);
          if (right - left > 0 && right > p.left && left < p.right && r.bottom > p.top && r.top < p.bottom) return true;
        }
      }
    }
    return false;
  }

  /**
   * Свободно ли место под видимой частью персонажа (со сдвигом dy вверх/вниз):
   * нет ни кнопки, которую он закроет, ни строки текста.
   * Большие кликабельные области (вся карточка) не в счёт — у них есть свободное место.
   * @param {number} dy
   * @param {boolean} [celikom=false] проверять всю фигуру (вышел поговорить), а не полоску у края
   */
  mestoSvobodno(dy, celikom = false) {
    const m = this.bazovyyPryamougolnik();
    const r = this.razmer;
    if (m.top + dy < 72) return false; // не лезть на шапку
    // место выбирается по полоске «выглядывает»: выходит целиком он ненадолго (реплика, касание)
    const sdvig = celikom ? 0 : this.sdvigVyglyada();
    // видимая в покое часть — полоска у правого края
    const p = {
      left: m.left + sdvig + 2,
      right: Math.min(m.right + sdvig, window.innerWidth) - 2,
      top: m.top + dy + r * 0.06,
      bottom: m.top + dy + r * 0.96,
    };
    if (p.right - p.left < 8) return true;
    const ploshchadPredel = r * r * 2.5;
    const diapazon = document.createRange();
    const provereny = new Set();
    const shir = p.right - p.left;
    for (const fy of [0.08, 0.3, 0.52, 0.74, 0.94]) {
      for (const fx of [0.12, 0.5, 0.88]) {
        const t = document.elementFromPoint(p.left + shir * fx, p.top + (p.bottom - p.top) * fy);
        if (!t || this.el.contains(t) || provereny.has(t)) continue;
        provereny.add(t);
        const k = t.closest('button, a[href], input, select, textarea, label, [role="button"], [tabindex]:not([tabindex="-1"])');
        if (k) {
          const b = k.getBoundingClientRect();
          if (b.width * b.height < ploshchadPredel) return false;
        }
        if (this.tekstVPolose(t, p, diapazon)) return false;
      }
    }
    return true;
  }

  /** Решает, где стоять плавающему персонажу: на месте, выше или в стороне. */
  proveritMesto() {
    if (!this.plavayushchiy || !this.el.isConnected) return;
    if (this.ubran || this.spryatan) { this.el.classList.remove('hinkalik--pritih'); return; }
    // Под модальной шторкой (фон инертен) персонаж не виден — не дёргаем его
    if (this.el.closest('[inert]') || this.prokruchivayut || this.el.classList.contains('hinkalik--tashchat')) return;
    if (this.estDrugoyHinkalik()) { this.el.classList.add('hinkalik--pritih'); return; }
    if (this.vyglyadyvaet) this.el.style.setProperty('--vyglyad-sdvig', this.sdvigVyglyada() + 'px');
    // На время замера касания сквозь персонажа, иначе elementFromPoint вернёт его самого
    const byloPe = this.el.style.pointerEvents;
    this.el.style.pointerEvents = 'none';
    let vybor = null;
    try {
      const shag = Math.round(this.razmer * 0.5);
      const kandidaty = [0, this.uvorot];
      for (let i = 1; i <= 6; i++) kandidaty.push(-shag * i);
      // вышел целиком (говорит) — сначала ищем место, где и вся фигура не на тексте;
      // нет такого — стоит там, где свободна полоска «выглядывает» (облачко недолгое)
      if (!this.vyglyadyvaet) {
        for (const dy of kandidaty) {
          if (this.mestoSvobodno(dy, true)) { vybor = dy; break; }
        }
      }
      if (vybor === null) {
        for (const dy of kandidaty) {
          if (this.mestoSvobodno(dy)) { vybor = dy; break; }
        }
      }
    } finally {
      this.el.style.pointerEvents = byloPe;
    }
    if (vybor === null) { this.el.classList.add('hinkalik--pritih'); return; }
    if (vybor !== this.uvorot) {
      this.uvorot = vybor;
      this.el.style.setProperty('--uvorot', vybor + 'px');
    }
    this.el.classList.remove('hinkalik--pritih');
  }

  // ---------------------------------------------------------------- моргание

  /**
   * Моргнуть. Сам моргает раз в 3–7 с; при касании — дважды.
   * @param {boolean} [dvazhdy=false]
   */
  morgnut(dvazhdy = false) {
    if (this.tekushcheeNastroenie === 'spit') return;
    const o = LICA[this.tekushcheeNastroenie].glaza;
    const kadry = [
      { transform: `scaleY(${o})` },
      { transform: 'scaleY(0.06)', offset: 0.45 },
      { transform: `scaleY(${o})` },
    ];
    const igrat = () => { for (const g of this.glaza) g.animate(kadry, { duration: 150, easing: 'ease-in-out' }); };
    igrat();
    if (dvazhdy) setTimeout(igrat, 210);
  }

  /** Случайное моргание раз в 3–7 с. */
  planirovatMorganie() {
    const shag = () => {
      this.tajmerMorganiya = setTimeout(() => { this.morgnut(); shag(); }, 3000 + Math.random() * 4000);
    };
    shag();
    this.spisokSlushateley.push(() => clearTimeout(this.tajmerMorganiya));
  }

  // -------------------------------------------------------------- настроение

  /**
   * Сменить настроение: брови, рот, веки, зрачки, наклон.
   * @param {'obychno'|'rad'|'udivlen'|'grustno'|'dumaet'|'spit'} vid
   */
  nastroenie(vid) {
    if (!(vid in LICA)) return;
    this.tekushcheeNastroenie = vid;
    this.el.dataset.nastroenie = vid;
    this.razbuditVzglyad();   // у настроения свой наклон зрачков
    this.primenitLico(LICA[vid], dvizhenieSnyato());
  }

  /**
   * Применить лицо: веки/зрачки/наклон — через CSS-переходы, брови и рот —
   * морфингом точек по rAF.
   * @param {object} lico запись из LICA
   * @param {boolean} srazu без анимации
   */
  primenitLico(lico, srazu) {
    for (const g of this.glaza) g.style.transform = `scaleY(${lico.glaza})`;
    for (const z of this.zenicy) z.style.transform = `scale(${lico.zrachokMasshtab})`;
    this.figura.style.transform = `rotate(${lico.naklon}deg) scale(${lico.masshtab})`;
    this.shcheki.style.opacity = lico.shcheki;
    this.yazyk.style.opacity = lico.yazyk;
    const spit = this.tekushcheeNastroenie === 'spit';
    this.zzz.style.opacity = spit ? 1 : 0;
    this.zzz.classList.toggle('hinkalik__zzz--spit', spit);
    this.veki.style.opacity = spit ? 1 : 0;
    for (const g of this.glaza) g.style.opacity = spit ? 0 : 1;

    const ot = {
      brovL: [...this.licoTekushchee.brovL], brovR: [...this.licoTekushchee.brovR],
      rot: [...this.licoTekushchee.rot], rotZaliv: this.licoTekushchee.rotZaliv,
    };
    const risovat = (t) => {
      const k = plavnoSPereletom(t);
      const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
      this.licoTekushchee.brovL = lerp(ot.brovL, lico.brovL);
      this.licoTekushchee.brovR = lerp(ot.brovR, lico.brovR);
      this.licoTekushchee.rot = lerp(ot.rot, lico.rot);
      this.licoTekushchee.rotZaliv = ot.rotZaliv + (lico.rotZaliv - ot.rotZaliv) * Math.min(1, Math.max(0, k));
      this.brovL.setAttribute('d', putBrovi(this.licoTekushchee.brovL));
      this.brovR.setAttribute('d', putBrovi(this.licoTekushchee.brovR));
      const dRta = putRta(this.licoTekushchee.rot);
      this.rot.setAttribute('d', dRta);
      this.rotKlip.setAttribute('d', dRta);
      this.rot.setAttribute('fill-opacity', ch(this.licoTekushchee.rotZaliv));
    };
    if (this.morfing) cancelAnimationFrame(this.morfing);
    if (srazu) { risovat(1); return; }
    const nachalo = performance.now();
    const dlitelnost = 380;
    const shag = (sejchas) => {
      const t = Math.min(1, (sejchas - nachalo) / dlitelnost);
      risovat(t);
      if (t < 1) this.morfing = requestAnimationFrame(shag);
      else this.morfing = null;
    };
    this.morfing = requestAnimationFrame(shag);
  }

  // ------------------------------------------------------------------ реплика

  /**
   * Сказать фразу в облачке. Появляется с пружиной, следующая фраза сменяет
   * предыдущую. Пустой текст — убрать облачко.
   * @param {string} tekst
   * @param {number} [ms=3200] сколько держать; 0 — пока не сменят
   */
  skazat(tekst, ms = 3200) {
    clearTimeout(this.tajmerRepliki);
    if (!tekst) { this.ubratRepliku(); return; }
    if (this.plavayushchiy && !this.spryatan) this.vyyti(0);
    const byloVidno = this.oblachko.classList.contains('hinkalik__oblachko--vidno');
    this.oblachkoTelo.textContent = tekst;
    this.oblachko.classList.add('hinkalik__oblachko--vidno');
    if (!dvizhenieSnyato()) {
      const kadry = byloVidno
        ? [{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.4 }, { transform: 'scale(1)' }]
        : [
          { transform: 'scale(.55)', opacity: 0 },
          { transform: 'scale(1.06)', opacity: 1, offset: 0.62 },
          { transform: 'scale(.98)', offset: 0.82 },
          { transform: 'scale(1)', opacity: 1 },
        ];
      this.oblachkoTelo.animate(kadry, { duration: byloVidno ? 180 : 440, easing: 'ease-out' });
    }
    if (ms > 0) this.tajmerRepliki = setTimeout(() => this.ubratRepliku(), ms);
  }

  /** Убрать облачко с мягким уходом. */
  ubratRepliku() {
    if (!this.oblachko.classList.contains('hinkalik__oblachko--vidno')) return;
    const zakonchit = () => {
      this.oblachko.classList.remove('hinkalik__oblachko--vidno');
      // договорил — через секунду снова выглядывает из-за края
      if (this.plavayushchiy) { clearTimeout(this.tajmerVyhoda); this.tajmerVyhoda = setTimeout(() => this.vyglyanut(), 1100); }
    };
    if (dvizhenieSnyato()) { zakonchit(); return; }
    const a = this.oblachkoTelo.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.85)', opacity: 0 }],
      { duration: 200, easing: 'ease-in', fill: 'forwards' },
    );
    a.onfinish = () => { zakonchit(); a.cancel(); };
  }

  // ------------------------------------------------------------------ подскок

  /** Короткий подскок с приседом и растяжением (при добавлении в корзину). */
  pryg() {
    if (this.plavayushchiy && !this.spryatan) this.vyyti(1800);
    if (dvizhenieSnyato() || this.spryatan) return;
    const v = Math.max(14, Math.round(this.razmer * 0.26));
    this.telo.animate([
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: `translateY(${Math.round(v * 0.12)}px) scale(1.12, .86)`, offset: 0.16 },
      { transform: `translateY(-${v}px) scale(.92, 1.1)`, offset: 0.5 },
      { transform: 'translateY(0) scale(1.08, .9)', offset: 0.8 },
      { transform: 'translateY(0) scale(.99, 1.02)', offset: 0.92 },
      { transform: 'translateY(0) scale(1, 1)' },
    ], { duration: 640, easing: 'cubic-bezier(.3,.7,.3,1)' });
    this.morgnut();
  }

  // ------------------------------------------------------ показать / спрятать

  /** Вернуть персонажа из-за края (или из скрытого состояния). */
  pokazat() {
    this.ubran = false;
    this.spryatan = false;
    this.el.classList.remove('hinkalik--ubran', 'hinkalik--spryatan', 'hinkalik--tashchat', 'hinkalik--pritih');
    this.el.style.transform = '';
    if (this.podpisTela) this.telo.setAttribute('aria-label', this.podpisTela);
    // вернулся на экран — сразу проверить, не встал ли на кнопку или рядом с другим Хинкаликом
    if (this.plavayushchiy) { this.vyyti(2600); setTimeout(() => this.proveritMesto(), 60); }
  }

  /**
   * Спрятать. В плавающем режиме — уезжает за правый край, торчит «ушко»
   * (хвостик), тап по нему возвращает. `polnostyu` — убрать совсем.
   * @param {boolean} [polnostyu=false]
   */
  spryatat(polnostyu = false) {
    this.ubratRepliku();
    this.el.classList.remove('hinkalik--tashchat', 'hinkalik--pritih');
    this.el.style.transform = '';
    if (polnostyu || !this.plavayushchiy) {
      this.ubran = true;
      this.el.classList.add('hinkalik--ubran');
      return;
    }
    this.spryatan = true;
    this.el.classList.add('hinkalik--spryatan');
    if (!this.podpisTela) this.podpisTela = this.telo.getAttribute('aria-label');
    this.telo.setAttribute('aria-label', 'Показать Хинкалика');
  }

  // ------------------------------------------------------------------ касание

  /**
   * Подписаться на тап по персонажу.
   * @param {(hinkalik: Hinkalik) => void} obrabotchik
   * @returns {() => void} отписка
   */
  naNazhatie(obrabotchik) {
    this.obrabotchikiNazhatiya.push(obrabotchik);
    return () => { this.obrabotchikiNazhatiya = this.obrabotchikiNazhatiya.filter((o) => o !== obrabotchik); };
  }

  /** Отклик на касание, отличение тапа от смахивания, смахивание за край. */
  navesitKasanie() {
    let nachaloX = 0;
    let nachaloY = 0;
    let dx = 0;
    let tashchim = false;
    let aktivno = false;

    const naDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      aktivno = true;
      tashchim = false;
      dx = 0;
      nachaloX = e.clientX;
      nachaloY = e.clientY;
      this.telo.classList.add('hinkalik__telo--nazhat');
      if (this.el.setPointerCapture) { try { this.el.setPointerCapture(e.pointerId); } catch (o) { /* не критично */ } }
    };
    const naMove = (e) => {
      if (!aktivno || !this.plavayushchiy) return;
      dx = e.clientX - nachaloX;
      const dy = e.clientY - nachaloY;
      if (!tashchim && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        tashchim = true;
        this.el.classList.add('hinkalik--tashchat');
        this.telo.classList.remove('hinkalik__telo--nazhat');
      }
      if (!tashchim) return;
      const baza = this.spryatan ? this.razmer - parseFloat(this.el.style.getPropertyValue('--ushko'))
        : (this.vyglyadyvaet ? this.sdvigVyglyada() : 0);
      const sdvig = dx > 0 ? dx * 0.9 : dx * (this.spryatan ? 0.9 : 0.25);
      this.el.style.transform = `translateX(${Math.max(-this.razmer * 0.3, baza + sdvig)}px)`;
    };
    const naUp = (e) => {
      if (!aktivno) return;
      aktivno = false;
      this.telo.classList.remove('hinkalik__telo--nazhat');
      if (tashchim) {
        this.el.classList.remove('hinkalik--tashchat');
        this.el.style.transform = '';
        if (!this.spryatan && dx > 34) this.spryatat();
        else if (this.spryatan && dx < -24) this.pokazat();
        else if (this.vyglyadyvaet && dx < -24) this.vyyti(4000);
        return;
      }
      if (e.type === 'pointercancel') return;
      // Тап
      if (this.spryatan) { this.pokazat(); this.morgnut(true); return; }
      if (!dvizhenieSnyato()) {
        this.telo.animate(
          [{ transform: 'scale(.93)' }, { transform: 'scale(1.06)', offset: 0.5 }, { transform: 'scale(1)' }],
          { duration: 360, easing: PRUZHINA.zhivaya },
        );
      }
      this.morgnut(true);
      if (this.plavayushchiy) this.vyyti(4000);
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (o) { /* не везде */ } }
      for (const o of this.obrabotchikiNazhatiya) o(this);
    };
    this.el.addEventListener('pointerdown', naDown);
    this.el.addEventListener('pointermove', naMove);
    this.el.addEventListener('pointerup', naUp);
    this.el.addEventListener('pointercancel', naUp);
    this.telo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); naDown({ clientX: 0, clientY: 0 }); naUp({ type: 'keydown' }); }
    });
    this.spisokSlushateley.push(() => {
      this.el.removeEventListener('pointerdown', naDown);
      this.el.removeEventListener('pointermove', naMove);
      this.el.removeEventListener('pointerup', naUp);
      this.el.removeEventListener('pointercancel', naUp);
    });
  }

  // ------------------------------------------------------------------ уборка

  /** Снять слушатели и убрать персонажа из документа. */
  unichtozhit() {
    cancelAnimationFrame(this.kadr);
    if (this.morfing) cancelAnimationFrame(this.morfing);
    clearTimeout(this.tajmerRepliki);
    clearTimeout(this.vzglyadZatuhaet);
    for (const snyat of this.spisokSlushateley) snyat();
    this.spisokSlushateley = [];
    this.el.remove();
  }
}

// ---------------------------------------------------------------------------
// Волна загрузки
// ---------------------------------------------------------------------------

/**
 * Загрузка: волна из пяти маленьких хинкали — по очереди приседают,
 * подпрыгивают, приминаются и выпрямляются, тень под каждым сжимается
 * в полёте. При `prefers-reduced-motion` — мягкое мерцание вместо прыжков.
 *
 * @param {HTMLElement} kontejner куда вставить волну
 * @param {object} [opcii]
 * @param {number} [opcii.shag=130] задержка между соседями, мс
 * @param {string} [opcii.podpis='Загружаем'] aria-label
 * @returns {() => void} stop — убирает волну
 */
export function volnaZagruzki(kontejner, opcii = {}) {
  if (!estOkno) return () => {};
  dobavitStili();
  const { shag = 130, podpis = 'Загружаем' } = opcii;
  const nastroeniya = ['rad', 'obychno', 'rad', 'udivlen', 'rad'];
  const volna = document.createElement('div');
  volna.className = 'hinkalik-volna';
  volna.setAttribute('role', 'status');
  volna.setAttribute('aria-label', podpis);
  volna.innerHTML = nastroeniya.map((n, i) => `
    <div class="hinkalik-volna__el">
      <div class="hinkalik-volna__ten" style="animation-delay:${i * shag}ms"></div>
      ${svgHinkalika({ nastroenie: n, prefiks: 'hv' + i + Math.random().toString(36).slice(2, 6), sTenyu: false })}
    </div>`).join('');
  for (const [i, svg] of [...volna.querySelectorAll('.hinkalik__svg')].entries()) {
    svg.style.animationDelay = `${i * shag}ms`;
  }
  kontejner.appendChild(volna);
  let ubrana = false;
  return function stop() {
    if (ubrana) return;
    ubrana = true;
    if (dvizhenieSnyato()) { volna.remove(); return; }
    const a = volna.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = () => volna.remove();
  };
}
