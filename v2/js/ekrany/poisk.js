// Витрина Хинкальной v2 — поиск (маршрут #/poisk).
// Поле сверху с автофокусом (FLIP из поля главной, если ядро передало прямоугольник),
// результаты через dannye.poisk с задержкой 150 мс, подсветка совпадения, исправление
// раскладки подсказкой («Искали: хинкали»). Пусто — «Ничего не нашли», популярное и
// разделы (тупик 5). До ввода — «Часто ищут» и разделы.
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { flip, nazhatie, pruzhina, dvizhenieSnyato, poyavlenieKaskadom } from '../dvizhenie.js';
import { poisk, populyarnye, ispravitRaskladku, dostupnoV, normalizovat, rasstoyanieSlov } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { tekst, kartochka, obnovitKartochku, miniKartochka, znakRazdela } from '../kartochka.js';

export const nastroyki = { niz: true, hinkalik: true };

const ZADERZHKA = 150;
const LATINICA = /[a-z[\];',.`{}:"<>~]/i;
/** «Часто ищут» — короткие запросы, а не полные названия блюд. */
const KOROTKIE_ZAPROSY = ['хинкали', 'хачапури', 'шашлык', 'лимонад', 'салат', 'суп', 'пирог', 'десерт'];

let yadro = null;
let kontejner = null;
let pole = null;
let tajmer = null;
let otpiski = [];
let personazh = null;
let posledniyZapros = '';   // вернулись из шторки блюда — запрос на месте

/** Строка для сравнения при подсветке: та же длина, что у оригинала (ё → е, регистр). */
const prosto = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

/**
 * Подсветка совпадения в названии: слова запроса (и их исправленная раскладка),
 * при опечатке — самый длинный совпавший префикс не короче 3 букв.
 */
function podsvetit(nazvanie, zapros) {
  const nizh = prosto(nazvanie);
  const varianty = [zapros];
  if (LATINICA.test(zapros)) varianty.push(ispravitRaskladku(zapros));
  const slova = new Set();
  varianty.forEach((v) => prosto(v).split(/[\s,.-]+/).filter((w) => w.length >= 2).forEach((w) => slova.add(w)));
  const otrezki = [];
  for (const w of slova) {
    for (let dl = w.length; dl >= Math.max(3, w.length - 3) || dl === w.length; dl--) {
      if (dl < 2) break;
      const kusok = w.slice(0, dl);
      // сначала — с начала слова, потом где угодно
      let i = nizh.search(new RegExp(`(^|[^а-яa-z0-9])${kusok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      if (i >= 0 && !/[а-яa-z0-9]/.test(nizh[i])) i += 1;
      if (i < 0) i = nizh.indexOf(kusok);
      if (i >= 0) { otrezki.push([i, i + dl]); break; }
    }
  }
  if (!otrezki.length) return tekst(nazvanie);
  otrezki.sort((a, b) => a[0] - b[0]);
  const slito = [];
  for (const o of otrezki) {
    const posl = slito[slito.length - 1];
    if (posl && o[0] <= posl[1]) posl[1] = Math.max(posl[1], o[1]); else slito.push([...o]);
  }
  let html = '';
  let t = 0;
  for (const [a, b] of slito) {
    html += `${tekst(nazvanie.slice(t, a))}<mark>${tekst(nazvanie.slice(a, b))}</mark>`;
    t = b;
  }
  return html + tekst(nazvanie.slice(t));
}

/** Разделы, в которых есть что-то доступное здесь. */
function razdelyDlyaChipov() {
  const zavId = yadro.gost.zavedenieId;
  return (yadro.menyu?.razdely || []).filter((r) => (r.blyuda || []).some((b) => dostupnoV(b, zavId)));
}

/** Ведёт на главную и прокручивает к разделу (под липкую ленту). */
function kRazdelu(id) {
  Promise.resolve(yadro.perejti('#/')).then(() => {
    requestAnimationFrame(() => {
      const sekciya = document.getElementById(`razdel-${id}`);
      if (!sekciya) return;
      const lenta = document.querySelector('.lenta');
      const y = sekciya.getBoundingClientRect().top + window.scrollY - (lenta ? lenta.offsetHeight : 64) + 16;
      window.scrollTo({ top: Math.max(0, y), behavior: dvizhenieSnyato() ? 'auto' : 'smooth' });
    });
  });
}

function chipyRazdelov() {
  return `<div class="poisk-ekran__chipy">${razdelyDlyaChipov().map((r) => {
    const sem = yadro.semeystvo(r);
    return `<button class="poisk-ekran__chip sem-${sem}" type="button" data-razdel="${tekst(r.id)}"><span class="poisk-ekran__znak"><svg aria-hidden="true"><use href="${znakRazdela(r, sem)}"/></svg></span>${tekst(String(r.nazvanie).replace(/[‑]/g, '-'))}</button>`;
  }).join('')}</div>`;
}

function navesitChipy(koren) {
  koren.querySelectorAll('[data-razdel]').forEach((b) => {
    nazhatie(b, { masshtab: 0.94 });
    b.addEventListener('click', () => kRazdelu(b.dataset.razdel));
  });
  koren.querySelectorAll('[data-zapros]').forEach((b) => {
    nazhatie(b, { masshtab: 0.94 });
    b.addEventListener('click', () => zadatZapros(b.dataset.zapros));
  });
}

// ---------------------------------------------------------------------------
// Показ
// ---------------------------------------------------------------------------

export function pokazat(kontejner_, yadro_, parametry) {
  yadro = yadro_;
  kontejner = kontejner_;
  kontejner.classList.add('poisk-ekran');
  kontejner.innerHTML = `
    <div class="poisk-ekran__verh">
      <button class="ekran__nazad" type="button" aria-label="Назад" data-nazad><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button>
      <label class="poisk poisk-ekran__pole">
        <svg aria-hidden="true"><use href="#ik-poisk"/></svg>
        <span class="poisk__pole"><input type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Хинкали, хачапури, шашлык…" aria-label="Поиск по меню"></span>
        <button class="poisk__ochistit" type="button" aria-label="Стереть" hidden><svg aria-hidden="true"><use href="#ik-zakryt"/></svg></button>
      </label>
    </div>
    <div class="poisk-ekran__rezultat" aria-live="polite"></div>`;

  pole = kontejner.querySelector('input');
  const ochistit = kontejner.querySelector('.poisk__ochistit');
  const nazad = kontejner.querySelector('[data-nazad]');
  nazhatie(nazad, { masshtab: 0.9 });
  nazad.addEventListener('click', () => yadro.nazad('#/'));
  nazhatie(ochistit, { masshtab: 0.9 });
  ochistit.addEventListener('click', () => { zadatZapros(''); pole.focus(); });

  pole.value = posledniyZapros;
  ochistit.hidden = !pole.value;
  pole.addEventListener('input', () => {
    ochistit.hidden = !pole.value;
    clearTimeout(tajmer);
    tajmer = setTimeout(() => iskat(pole.value), ZADERZHKA);
  });
  pole.addEventListener('keydown', (s) => {
    if (s.key === 'Enter') { s.preventDefault(); clearTimeout(tajmer); iskat(pole.value); pole.blur(); }
  });

  otpiski.push(yadro.korzina.na('izmenilas', () => {
    kontejner?.querySelectorAll('.kartochka').forEach((k) => obnovitKartochku(k, yadro));
  }));
  otpiski.push(yadro.na('gost', () => iskat(pole?.value || '', true)));

  iskat(pole.value, true);

  // Поле едет к верху (FLIP из поля главной); клавиатура — в конце перехода
  const polePoiska = kontejner.querySelector('.poisk-ekran__pole');
  // ядро снимает прямоугольник источника в момент перехода (istochnikRect) — главная к этому времени спрятана
  const istochnik = parametry.istochnikRect || parametry.istochnik;
  let rect = null;
  if (istochnik && typeof istochnik.width === 'number' && !(istochnik instanceof Element)) rect = istochnik;
  else if (istochnik && istochnik.getBoundingClientRect) {
    const r = istochnik.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rect = r;
  }
  const vernulis = parametry.ot === 'blyudo';
  const fokus = () => { if (!vernulis && pole && pole.isConnected) pole.focus({ preventScroll: true }); };
  if (dvizhenieSnyato() || vernulis) { fokus(); return; }
  if (rect) {
    flip(rect, polePoiska, { ms: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing, radiusOt: '16px' }).then(fokus);
  } else {
    // главная уже спрятана и её поле не измерить — поле въезжает снизу, как будто поднялось
    polePoiska.animate([{ transform: 'translateY(96px) scale(.97)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing });
    fokus();
  }
}

export function ubrat() {
  clearTimeout(tajmer);
  otpiski.forEach((f) => { try { f(); } catch { /* уже снято */ } });
  otpiski = [];
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
  if (pole) posledniyZapros = pole.value;
  pole = null;
  kontejner = null;
}

function zadatZapros(z) {
  if (!pole) return;
  pole.value = z;
  kontejner.querySelector('.poisk__ochistit').hidden = !z;
  clearTimeout(tajmer);
  iskat(z);
}

// ---------------------------------------------------------------------------
// Поиск и отрисовка
// ---------------------------------------------------------------------------

let poslednyayaOtrisovka = null;

function iskat(zapros, pervyyRaz = false) {
  if (!kontejner) return;
  const z = String(zapros || '').trim();
  posledniyZapros = String(zapros || '');
  const mesto = kontejner.querySelector('.poisk-ekran__rezultat');
  const klyuch = `${z}|${yadro.gost.zavedenieId}`;
  if (!pervyyRaz && klyuch === poslednyayaOtrisovka) return;
  poslednyayaOtrisovka = klyuch;
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }

  if (!z) { narisovatNachalo(mesto); return; }
  const rezultat = poisk(z, yadro.menyu, yadro.gost.zavedenieId);
  const ispravleno = LATINICA.test(z) ? ispravitRaskladku(z) : '';
  const podskazkaRaskladki = ispravleno && ispravleno !== z && /[а-яё]/i.test(ispravleno) && naydetsya(ispravleno);

  if (!rezultat.length) { narisovatPusto(mesto, z, podskazkaRaskladki ? ispravleno : ''); return; }

  mesto.innerHTML = `
    ${podskazkaRaskladki ? `<p class="ispravlenie poisk-ekran__raskladka">Искали: <button type="button" data-zapros="${tekst(ispravleno)}">${tekst(ispravleno)}</button></p>` : ''}
    <p class="poisk-ekran__skolko">${skolko(rezultat.length)}</p>
    <div class="setka poisk-ekran__setka"></div>`;
  const setka = mesto.querySelector('.setka');
  rezultat.slice(0, 40).forEach((b, i) => {
    const k = kartochka(b, yadro, i);
    const imya = k.querySelector('.kartochka__nazvanie');
    if (imya) imya.innerHTML = podsvetit(b.nazvanie, z);
    // карточки главной всплывают классом pokazana (CSS vsplytie), задержка — по --i
    k.style.setProperty('--i', String(Math.min(i, 8) * 0.6));
    setka.appendChild(k);
    k.classList.add('pokazana');
  });
  navesitChipy(mesto);
}

function skolko(n) {
  const d = n % 10;
  const s = n % 100;
  const slovo = d === 1 && s !== 11 ? 'блюдо' : d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'блюда' : 'блюд';
  return `Нашли ${n} ${slovo}`;
}

/** До ввода: часто ищут (короткие запросы, по которым здесь что-то есть) и разделы. */
function narisovatNachalo(mesto) {
  const zaprosy = KOROTKIE_ZAPROSY.filter((q) => naydetsya(q)).slice(0, 6);
  mesto.innerHTML = `
    <div class="metka">Часто ищут</div>
    <div class="poisk-ekran__chipy">${zaprosy.map((q) => `<button class="poisk-ekran__chip poisk-ekran__chip--zapros" type="button" data-zapros="${tekst(q)}"><svg aria-hidden="true"><use href="#ik-poisk"/></svg>${tekst(q)}</button>`).join('')}</div>
    <div class="metka">Разделы</div>
    ${chipyRazdelov()}`;
  navesitChipy(mesto);
  poyavlenieKaskadom(mesto.querySelectorAll('.poisk-ekran__chip'), 25, { predel: 16, sdvig: 10 });
}

/** Есть ли что найти по запросу в выбранном заведении. */
function naydetsya(z) {
  return Boolean(z) && poisk(z, yadro.menyu, yadro.gost.zavedenieId).length > 0;
}

/**
 * «Может, вы искали …» — только честная догадка: исправленная раскладка или близкое слово
 * (не больше 2 опечаток, как в поиске), и только если по ней что-то находится. Иначе null.
 */
function nuytiDogadku(z, ispravleno) {
  if (ispravleno && naydetsya(ispravleno)) return ispravleno;
  const slovoZaprosa = normalizovat(ispravleno || z).split(' ').filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
  if (!slovoZaprosa || !/[а-я]/.test(slovoZaprosa)) return null;
  const predel = slovoZaprosa.length <= 5 ? 1 : 2;
  let luchshee = null;
  for (const kandidat of slovaMenyu()) {
    const r = rasstoyanieSlov(slovoZaprosa, kandidat, predel);
    if (r <= predel && (!luchshee || r < luchshee.r)) luchshee = { slovo: kandidat, r };
  }
  return luchshee && naydetsya(luchshee.slovo) ? luchshee.slovo : null;
}

let kesSlov = null;
/** Короткие запросы и слова названий блюд (от 4 букв) — словарь для догадки. */
function slovaMenyu() {
  if (kesSlov && kesSlov.menyu === yadro.menyu) return kesSlov.slova;
  const nabor = new Set(KOROTKIE_ZAPROSY);
  (yadro.menyu?.razdely || []).forEach((r) => (r.blyuda || []).forEach((b) => {
    normalizovat(b.nazvanie).split(' ').forEach((w) => { if (w.length >= 4 && /^[а-я]+$/.test(w)) nabor.add(w); });
  }));
  kesSlov = { menyu: yadro.menyu, slova: [...nabor] };
  return kesSlov.slova;
}

/** Ничего не нашли (тупик 5): Хинкалик удивлён, «может, вы искали» (если есть честная догадка), популярное и разделы. */
function narisovatPusto(mesto, z, ispravleno) {
  const pop = populyarnye(yadro.menyu, yadro.gost.zavedenieId, 6);
  const dogadka = nuytiDogadku(z, ispravleno);
  const podskazka = dogadka
    ? `По запросу «${tekst(z)}» блюд нет. Может, вы искали <button class="poisk-ekran__dogadka" type="button" data-zapros="${tekst(dogadka)}">«${tekst(dogadka)}»</button>?`
    : `По запросу «${tekst(z)}» блюд нет. Попробуйте другое слово или загляните в разделы.`;
  mesto.innerHTML = `
    <div class="pusto poisk-ekran__pusto">
      <div class="pusto__hinkalik"></div>
      <div class="pusto__zagolovok">Ничего не нашли</div>
      <p class="pusto__tekst">${podskazka}</p>
    </div>
    <div class="metka">Популярное</div>
    <div class="ryad poisk-ekran__ryad"></div>
    <div class="metka">Разделы</div>
    ${chipyRazdelov()}`;
  const ryad = mesto.querySelector('.ryad');
  pop.forEach((b) => ryad.appendChild(miniKartochka(b, yadro)));
  navesitChipy(mesto);
  try {
    personazh = new Hinkalik(mesto.querySelector('.pusto__hinkalik'), { razmer: 96, plavayushchiy: false, nastroenie: 'udivlen', podpis: 'Хинкалик' });
  } catch { /* без персонажа тоже понятно */ }
  poyavlenieKaskadom(ryad.children, 50);
}
