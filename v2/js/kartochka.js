// Витрина Хинкальной v2 — общие куски разметки блюд (сборщик ядра).
// Плитка «фото на весу», карточка сетки, мини-карточка, строка позиции.
// Одни и те же на главной, в поиске, корзине, переносе и «готово» — чтобы блюдо
// везде выглядело одинаково. Контракт — design/vitrina_v2/YADRO.md §2.

import { nazhatie } from './dvizhenie.js';
import { cenaRaznitsya } from './dannye.js';
import { klyuchPozicii, summaPozicii } from './korzina.js';

const formatChisla = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** Узкий неразрывный пробел перед «₽» (DIZAYN §7: рубли через тонкий пробел). */
export const TONKIY = ' ';

/** Число с разрядами: 1250 → «1 250». */
export function chislo(n) {
  return formatChisla.format(Math.round(Number(n) || 0));
}

/** Сумма в рублях: 1250 → «1 250 ₽». */
export function rub(n) {
  return `${chislo(n)}${TONKIY}₽`;
}

/** Экранирование текста для вставки в разметку. */
export function tekst(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Нормализация названия раздела (неразрывные дефисы, регистр). */
function imyaRazdela(razdel) {
  return String(razdel?.nazvanie ?? razdel ?? '').toLowerCase().replace(/[‑‐–—]/g, '-');
}

/**
 * Значок раздела — id символа из index.html (DIZAYN §2.2).
 * @param {object|string} razdel
 * @param {string} [semeystvo]
 * @returns {string} '#ik-…'
 */
export function znakRazdela(razdel, semeystvo) {
  const imya = imyaRazdela(razdel);
  if (/хинкали/.test(imya)) return '#ik-hinkali';
  if (/пирог|хачапури/.test(imya)) return '#ik-hachapuri';
  if (/шашлык/.test(imya)) return '#ik-shampur';
  if (/суп/.test(imya)) return '#ik-kazan';
  if (/комбо|набор/.test(imya)) return '#ik-nabor';
  if (/напит|лимонад|сок/.test(imya)) return '#ik-butylka';
  if (/десерт/.test(imya)) return '#ik-yagoda';
  switch (semeystvo) {
    case 'zhar': return '#ik-plamya';
    case 'zelen': return '#ik-list';
    case 'sladkoe': return '#ik-yagoda';
    case 'napitki': return '#ik-butylka';
    case 'kombo': return '#ik-nabor';
    default: return '#ik-hinkali';
  }
}

/** Тень под объектом фото из среднего цвета блюда: rgba(r,g,b,.45). */
export function tenObekta(cvet) {
  const h = String(cvet || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 'rgba(120, 60, 20, .4)';
  const n = parseInt(h, 16);
  // средний цвет фото обычно тёмный (доска, сланец) — подмешиваем тепла, чтобы тень была цветной, а не серой
  const r = Math.min(255, ((n >> 16) & 255) * 0.7 + 70);
  const g = Math.min(255, ((n >> 8) & 255) * 0.7 + 25);
  const b = Math.min(255, (n & 255) * 0.6 + 5);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, .55)`;
}

/** Мета блюда: «90 г · 8 мин · 295 ккал» — только поля, что есть в базе. */
export function metaBlyuda(blyudo, semeystvo) {
  const chasti = [];
  // вес 1–9 в базе — это «штука/порция», а не граммы: не показываем
  if (blyudo.ves >= 10) chasti.push(`${chislo(blyudo.ves)}${TONKIY}${semeystvo === 'napitki' ? 'мл' : 'г'}`);
  if (blyudo.vremya) chasti.push(`${blyudo.vremya}${TONKIY}мин`);
  if (blyudo.kkal) chasti.push(`${chislo(blyudo.kkal)}${TONKIY}ккал`);
  return chasti;
}

/** Подпись недоступности на плитке. */
export function podpisNedostupnosti(prichina) {
  if (prichina === 'stop') return 'закончилось';
  if (prichina === 'net') return 'нет здесь';
  return '';
}

/** Вешает на <img> загрузку: класс zagruzheno, у родителя — gotovo; ошибка — картинку убрать, знак остаётся. */
/**
 * Превью фото 400 px (foto/m/<id>.webp, scripts/sdelat_prevyu_foto.py) для «foto/<id>.webp»; иначе null.
 * Сервис-воркер докеширует и превью (PREVYU_V_DOKESH), так что без сети они тоже есть.
 */
function prevyuFoto(foto) {
  const m = /^(\.\/)?foto\/([^/]+\.webp)$/.exec(String(foto || ''));
  return m ? `foto/m/${m[2]}` : null;
}

function podklyuchitFoto(img, rodith) {
  const gotovo = () => { img.classList.add('zagruzheno'); rodith.classList.add('gotovo'); };
  img.addEventListener('load', gotovo, { once: true });
  img.addEventListener('error', () => { rodith.classList.remove('s-foto'); img.remove(); }, { once: true });
  if (img.complete && img.naturalWidth) gotovo();
}

/**
 * Плитка блюда: градиент семейства, знак раздела, фото без фона «на весу».
 * @param {object} blyudo
 * @param {object} yadro
 * @param {{i?:number, shirokaya?:boolean, bezFoto?:boolean}} [opcii]
 * @returns {HTMLDivElement}
 */
export function plitka(blyudo, yadro, opcii = {}) {
  const i = opcii.i ?? 0;
  const sem = yadro.semeystvo(blyudo.razdel);
  const el = document.createElement('div');
  el.className = 'plitka';
  el.style.setProperty('--naklon', `${((i % 3) - 1) * 1.2}deg`);
  el.style.setProperty('--povorot-foto', `${((i % 4) - 1.5) * 2.5}deg`);
  el.style.setProperty('--povorot', `${((i % 4) - 1.5) * 5}deg`);
  el.style.setProperty('--ten-obekta', tenObekta(blyudo.cvet));
  el.innerHTML = `<div class="plitka__znak" aria-hidden="true"><svg><use href="${znakRazdela(blyudo.razdel, sem)}"/></svg></div>`;
  const sFoto = blyudo.foto && !opcii.bezFoto && !opcii.shirokaya;
  if (sFoto) {
    el.classList.add('s-foto');
    const img = document.createElement('img');
    img.className = 'plitka__foto';
    img.alt = '';
    img.loading = opcii.srazu ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    const prevyu = prevyuFoto(blyudo.foto);
    if (prevyu) {
      img.sizes = '(min-width: 600px) 240px, 46vw';
      img.srcset = `${prevyu} 400w, ${blyudo.foto} 720w`;
    }
    img.src = blyudo.foto;
    el.appendChild(img);
    podklyuchitFoto(img, el);
  }
  return el;
}

/**
 * Маленькая плитка (корзина, перенос, поиск, мини-карточки).
 * @param {object} blyudoIliPoziciya блюдо из меню или позиция корзины ({foto, cvet, razdelId, nazvanie})
 * @param {object} yadro
 * @param {{razmer?:number}} [opcii]
 */
export function miniPlitka(blyudoIliPoziciya, yadro, opcii = {}) {
  const b = blyudoIliPoziciya || {};
  const razdel = b.razdel || yadro.menyu?.razdely?.find((r) => r.id === b.razdelId) || null;
  const sem = yadro.semeystvo(razdel);
  const el = document.createElement('div');
  el.className = `mini-plitka sem-${sem}`;
  if (opcii.razmer) el.style.setProperty('--razmer', `${opcii.razmer}px`);
  el.style.setProperty('--ten-obekta', tenObekta(b.cvet));
  el.innerHTML = `<svg aria-hidden="true"><use href="${znakRazdela(razdel, sem)}"/></svg>`;
  const kombo = sem === 'kombo';
  if (b.foto && !kombo) {
    el.classList.add('s-foto');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    const prevyu = prevyuFoto(b.foto);
    if (prevyu) {
      // превью не нашлось (старый кеш, 204 без сети) — пробуем оригинал, потом знак раздела
      img.addEventListener('error', (s) => {
        if (img.dataset.original) return;
        s.stopImmediatePropagation();
        img.dataset.original = '1';
        img.src = b.foto;
      });
      img.src = prevyu;
    } else img.src = b.foto;
    el.appendChild(img);
    podklyuchitFoto(img, el);
  }
  return el;
}

/** Разметка цены: число отдельно — чтобы его можно было крутить pokazatChislo. */
function razmetkaCeny(cena, utochnit) {
  return `<span class="cena"><span class="cena__chislo">${chislo(cena)}</span><span class="rub">${TONKIY}₽</span>${utochnit ? '<small class="cena__utochnit">цена по заведению</small>' : ''}</span>`;
}

/**
 * Карточка блюда для сетки 2 в ряд: плитка, название, описание, мета, цена, «+»/степпер.
 * Тап по карточке → '#/blyudo/<id>' с FLIP из плитки. Состояние («в корзине», цена,
 * доступность) обновляет obnovitKartochku() — зовите её по событиям корзины и гостя.
 * @param {object} blyudo
 * @param {object} yadro
 * @param {number} [i] порядковый номер (наклон плитки, каскад)
 * @returns {HTMLElement}
 */
export function kartochka(blyudo, yadro, i = 0) {
  const sem = yadro.semeystvo(blyudo.razdel);
  const shirokaya = sem === 'kombo';
  const el = document.createElement('article');
  el.className = `kartochka sem-${sem}${shirokaya ? ' kartochka--shirokaya' : ''}`;
  el.dataset.blyudo = blyudo.id;
  el._blyudo = blyudo;
  el.tabIndex = 0;
  el.setAttribute('aria-label', blyudo.nazvanie);

  const pl = plitka(blyudo, yadro, { i, shirokaya });
  if (shirokaya) {
    const nadpis = document.createElement('div');
    nadpis.className = 'plitka__nadpis';
    const persony = /пят/i.test(blyudo.nazvanie) ? 'На 5 персон' : 'Набор';
    nadpis.innerHTML = `${persony}${blyudo.ves ? `<small>${chislo(blyudo.ves)}${TONKIY}г на стол</small>` : ''}`;
    pl.appendChild(nadpis);
  }
  el.appendChild(pl);

  const meta = metaBlyuda(blyudo, sem);
  const telo = document.createElement('div');
  telo.style.display = 'contents';
  telo.innerHTML = `
    <div class="kartochka__nazvanie">${tekst(blyudo.nazvanie)}</div>
    ${blyudo.opisanie ? `<div class="kartochka__opisanie">${tekst(blyudo.opisanie)}</div>` : ''}
    ${meta.length ? `<div class="kartochka__meta">${meta.join(' · ')}</div>` : ''}
    <div class="kartochka__niz">
      <span class="kartochka__cena"></span>
      <button class="plyus" type="button" aria-label="Добавить «${tekst(blyudo.nazvanie)}» в корзину"><svg aria-hidden="true"><use href="#ik-plus"/></svg></button>
      <div class="stepper" role="group" aria-label="Количество">
        <button type="button" data-shag="-1" aria-label="Меньше"><svg aria-hidden="true"><use href="#ik-minus"/></svg></button>
        <b>1</b>
        <button type="button" data-shag="1" aria-label="Больше"><svg aria-hidden="true"><use href="#ik-plus"/></svg></button>
      </div>
    </div>`;
  el.appendChild(telo);

  const plyus = el.querySelector('.plyus');
  const stepper = el.querySelector('.stepper');
  nazhatie(el, { masshtab: 0.96, vibro: false });
  nazhatie(plyus, { masshtab: 0.9 });
  stepper.querySelectorAll('button').forEach((k) => nazhatie(k, { masshtab: 0.86 }));

  // Нажатие карточки: плитка «проседает» (класс nazhata), тап открывает шторку блюда
  el.addEventListener('pointerdown', () => el.classList.add('nazhata'));
  const otpustit = () => el.classList.remove('nazhata');
  el.addEventListener('pointerup', otpustit);
  el.addEventListener('pointercancel', otpustit);
  el.addEventListener('pointerleave', otpustit);

  el.addEventListener('click', (s) => {
    if (s.target.closest('.plyus, .stepper')) return;
    yadro.perejti(`#/blyudo/${blyudo.id}`, { istochnik: pl });
  });
  el.addEventListener('keydown', (s) => {
    if ((s.key === 'Enter' || s.key === ' ') && s.target === el) { s.preventDefault(); yadro.perejti(`#/blyudo/${blyudo.id}`, { istochnik: pl }); }
  });
  plyus.addEventListener('click', (s) => {
    s.stopPropagation();
    yadro.dobavitVKorzinu(blyudo, { ot: pl });
  });
  stepper.addEventListener('click', (s) => {
    s.stopPropagation();
    const k = s.target.closest('button[data-shag]');
    if (!k) return;
    if (k.dataset.shag === '1') yadro.dobavitVKorzinu(blyudo, { ot: pl, tiho: true });
    else yadro.umenshit(klyuchPozicii(blyudo.id, []));
  });

  el.addEventListener('animationend', (s) => {
    if (s.target !== el || !el.classList.contains('pokazana')) return;
    if (!/^vsplytie/.test(s.animationName)) return;
    el.classList.replace('pokazana', 'byla');
  });

  obnovitKartochku(el, yadro, true);
  return el;
}

/**
 * Обновляет карточку: цену в выбранном заведении, доступность, «+»/степпер.
 * @param {HTMLElement} el карточка из kartochka()
 * @param {object} yadro
 * @param {boolean} [pervyyRaz]
 */
export function obnovitKartochku(el, yadro, pervyyRaz = false) {
  const blyudo = el._blyudo;
  if (!blyudo) return;
  const prichina = yadro.prichina(blyudo);
  const cena = yadro.cena(blyudo);
  const utochnit = !yadro.gost.zavedenieId && cenaRaznitsya(blyudo);
  const mestoCeny = el.querySelector('.kartochka__cena');
  const klyuchCeny = `${cena}|${utochnit}|${prichina}`;
  if (mestoCeny.dataset.klyuch !== klyuchCeny) {
    mestoCeny.dataset.klyuch = klyuchCeny;
    mestoCeny.innerHTML = razmetkaCeny(cena, utochnit);
  }
  el.classList.toggle('nedostupna', Boolean(prichina));
  const pl = el.querySelector('.plitka');
  let stop = pl.querySelector('.plitka__stop');
  if (prichina) {
    if (!stop) { stop = document.createElement('span'); stop.className = 'plitka__stop'; pl.appendChild(stop); }
    stop.textContent = podpisNedostupnosti(prichina);
  } else if (stop) stop.remove();

  const n = prichina ? 0 : yadro.korzina.kolichestvoBlyuda(blyudo.id);
  const bylo = el.classList.contains('v-korzine');
  el.classList.toggle('v-korzine', n > 0);
  const stepper = el.querySelector('.stepper');
  stepper.querySelector('b').textContent = String(n || 1);
  if (n > 0 && !bylo && !pervyyRaz) {
    // «+» превращается в степпер: растёт от правого края пружиной
    stepper.classList.remove('poyavilsya');
    void stepper.offsetWidth;
    stepper.classList.add('poyavilsya');
  }
}

/**
 * Мини-карточка 132 px: плитка 84, название, цена и кнопка.
 * @param {object} blyudo
 * @param {object} yadro
 * @param {{knopka?:'plyus'|'zamenit'|null, naKnopku?:(blyudo:object, plitka:HTMLElement)=>void, naNazhatie?:(blyudo:object, plitka:HTMLElement)=>void}} [opcii]
 *   по умолчанию: «+» кладёт в корзину с полётом, тап по карточке открывает блюдо
 */
export function miniKartochka(blyudo, yadro, opcii = {}) {
  const vid = opcii.knopka === undefined ? 'plyus' : opcii.knopka;
  const el = document.createElement('div');
  el.className = 'mini-kartochka';
  el.dataset.blyudo = blyudo.id;
  // внутри своя кнопка «+»/«Заменить» — вложенная role=button запрещена; группа с именем и Enter/пробел
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', blyudo.nazvanie);
  el.tabIndex = 0;
  const pl = miniPlitka(blyudo, yadro);
  el.appendChild(pl);
  const cena = yadro.cena(blyudo);
  el.insertAdjacentHTML('beforeend', `
    <div class="mini-kartochka__nazvanie">${tekst(blyudo.nazvanie)}</div>
    <div class="mini-kartochka__niz">${razmetkaCeny(cena, false)}${vid === 'plyus' ? `<button class="plyus" type="button" aria-label="Добавить «${tekst(blyudo.nazvanie)}»"><svg aria-hidden="true"><use href="#ik-plus"/></svg></button>` : ''}</div>
    ${vid === 'zamenit' ? '<button class="knopka knopka--glavnaya knopka--40" type="button" data-zamenit>Заменить</button>' : ''}`);
  nazhatie(el, { masshtab: 0.95, vibro: false });
  const knopka = el.querySelector('.plyus, [data-zamenit]');
  if (knopka) {
    nazhatie(knopka, { masshtab: 0.9 });
    knopka.addEventListener('click', (s) => {
      s.stopPropagation();
      if (opcii.naKnopku) opcii.naKnopku(blyudo, pl);
      else yadro.dobavitVKorzinu(blyudo, { ot: pl });
    });
  }
  const otkryt = () => {
    if (opcii.naNazhatie) opcii.naNazhatie(blyudo, pl);
    else yadro.perejti(`#/blyudo/${blyudo.id}`, { istochnik: pl });
  };
  el.addEventListener('click', otkryt);
  el.addEventListener('keydown', (s) => {
    if ((s.key === 'Enter' || s.key === ' ') && s.target === el) { s.preventDefault(); otkryt(); }
  });
  return el;
}

/**
 * Строка позиции корзины: мини-плитка, название, «2 × 90 ₽», справа сумма.
 * Степпер и прочие кнопки экран добавляет сам (в .poziciya есть место справа).
 * @param {object} poziciya позиция корзины
 * @param {object} yadro
 * @returns {HTMLDivElement}
 */
export function strokaPozicii(poziciya, yadro) {
  const el = document.createElement('div');
  el.className = 'poziciya';
  el.dataset.klyuch = poziciya.klyuch;
  el.appendChild(miniPlitka(poziciya, yadro));
  const dobavki = (poziciya.dobavki || []).map((d) => d.nazvanie).join(', ');
  el.insertAdjacentHTML('beforeend', `
    <div class="poziciya__tekst">
      <div class="poziciya__nazvanie">${tekst(poziciya.nazvanie)}</div>
      <div class="poziciya__meta">${poziciya.kolichestvo}${TONKIY}×${TONKIY}${rub(poziciya.cena)}${dobavki ? ` · ${tekst(dobavki)}` : ''}</div>
    </div>
    <div class="poziciya__cena">${rub(summaPozicii(poziciya))}</div>`);
  return el;
}
