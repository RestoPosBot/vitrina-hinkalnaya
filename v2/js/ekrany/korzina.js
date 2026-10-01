// Витрина Хинкальной v2 — корзина: шторка снизу поверх главной (маршрут #/korzina).
// Кнопка корзины «вырастает» в шапку шторки (FLIP), позиции появляются лесенкой,
// степперы с пружиной, «к этому берут» из доступного в заведении, итог с прокруткой
// цифр, полоса минимальной суммы доставки (при самовывозе её нет), кнопка «Оформить».
// Пустая корзина — Хинкалик предлагает популярное и «повторить прошлый заказ».
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { shtorka, flip, pokazatChislo, nazhatie, pruzhina, dvizhenieSnyato, vibro, poyavlenieKaskadom } from '../dvizhenie.js';
import { naytiBlyudo, kEtomuBerut, populyarnye, perenestiKorzinu, otkrytoSeychas } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { tekst, chislo, rub, TONKIY, strokaPozicii, miniKartochka, metaBlyuda } from '../kartochka.js';
import { summaPozicii } from '../korzina.js';

export const nastroyki = { niz: true, hinkalik: true };

let yadro = null;
let upr = null;
let el = null;
let otpiski = [];
let zakryvaemSami = false;
let personazh = null;          // Хинкалик пустой корзины
let bylaPusta = null;          // что сейчас нарисовано: пустая или с позициями
let pokazannyyItog = 0;        // для прокрутки цифр итога
let pokazannayaNaKnopke = 0;
let klyuchSovetov = '';        // чтобы не перерисовывать «к этому берут» без нужды

/** «3 блюда» — склонение по числу. */
function blyud(n) {
  const d = n % 10;
  const s = n % 100;
  if (d === 1 && s !== 11) return `${n} блюдо`;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return `${n} блюда`;
  return `${n} блюд`;
}

/** Подзаголовок шапки: сколько и как получить. */
function podzagolovok() {
  const n = yadro.korzina.kolichestvo();
  const zav = yadro.zavedenie();
  const g = yadro.gost;
  const chasti = [];
  if (n) chasti.push(blyud(yadro.korzina.pozicii.length));
  if (g.sposob === 'dostavka') chasti.push(g.adres?.tekst ? `доставка: ${g.adres.tekst}` : 'доставка');
  else if (zav) chasti.push(`самовывоз, ${zav.nazvanie}`);
  else chasti.push('заведение выберем при оформлении');
  return chasti.join(' · ');
}

/** Нужна ли сейчас полоса минимальной суммы. */
function nuzhenMinimum() {
  const summa = yadro.korzina.summa();
  return yadro.gost.sposob === 'dostavka' && summa > 0 && summa < yadro.minZakaz();
}

// ---------------------------------------------------------------------------
// Показ
// ---------------------------------------------------------------------------

export function pokazat(kontejner, yadro_, parametry) {
  yadro = yadro_;
  zakryvaemSami = false;
  bylaPusta = null;
  pokazannyyItog = 0;
  pokazannayaNaKnopke = 0;
  klyuchSovetov = '';

  el = document.createElement('div');
  el.className = 'shtorka shtorka--korzina';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Корзина');
  el.innerHTML = `
    <div class="shtorka__shapka-korziny">
      <div class="shtorka__ruchka" data-ruchka></div>
      <button class="shtorka__zakryt korzina__zakryt" type="button" aria-label="Закрыть"><svg aria-hidden="true"><use href="#ik-zakryt"/></svg></button>
      <h2>Корзина</h2>
      <p class="korzina__pod"></p>
    </div>
    <div class="shtorka__telo korzina__telo"></div>
    <div class="shtorka__niz korzina__niz"></div>`;
  kontejner.appendChild(el);

  const knopkaZakryt = el.querySelector('.korzina__zakryt');
  nazhatie(knopkaZakryt, { masshtab: 0.9 });
  knopkaZakryt.addEventListener('click', () => zakryt('knopka'));

  narisovat();

  otpiski.push(yadro.korzina.na('izmenilas', (sobytie) => obnovit(sobytie)));
  otpiski.push(yadro.na('gost', () => obnovit({ tip: 'gost' })));

  upr = shtorka(el, {
    cvetFona: 'rgba(60, 25, 10, .28)',
    naZakrytie: (prichina) => { if (prichina !== 'kod') yadro.nazad('#/'); },
  });

  // FLIP: кнопка корзины растёт в шапку шторки, пока шторка едет снизу
  const istochnik = parametry.istochnik;
  const shapka = el.querySelector('.shtorka__shapka-korziny');
  if (istochnik && istochnik.isConnected && !dvizhenieSnyato()) {
    const r = shapka.getBoundingClientRect();
    const vysota = el.getBoundingClientRect().height;
    const doRect = new DOMRect(r.left, r.top - vysota, r.width, r.height);
    flip(istochnik, shapka, { klon: true, do: doRect, ms: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing, radiusOt: '999px', pryatatOt: false });
  }
  return upr.otkryt();
}

function zakryt(prichina) {
  if (!upr || zakryvaemSami) return;
  zakryvaemSami = true;
  upr.zakryt(prichina);
}

export function ubrat() {
  otpiski.forEach((f) => { try { f(); } catch { /* уже снято */ } });
  otpiski = [];
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
  const u = upr;
  upr = null;
  el = null;
  if (!u) return undefined;
  const p = u.otkryta ? u.zakryt('kod') : Promise.resolve();
  return p.then(() => u.unichtozhit());
}

// ---------------------------------------------------------------------------
// Разметка: целиком (смена «пусто ↔ есть») и точечно (по событиям корзины)
// ---------------------------------------------------------------------------

function narisovat() {
  if (!el) return;
  const pusta = yadro.korzina.pusta();
  bylaPusta = pusta;
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
  el.classList.toggle('korzina--pusta', pusta);
  el.querySelector('.korzina__pod').textContent = pusta ? 'Пока ничего не выбрано' : podzagolovok();
  if (pusta) narisovatPustuyu();
  else narisovatPozicii();
}

/** Пустая корзина (тупик 6): Хинкалик, популярное, «повторить прошлый заказ». */
function narisovatPustuyu() {
  const telo = el.querySelector('.korzina__telo');
  const niz = el.querySelector('.korzina__niz');
  const proshlyy = yadro.korzina.proshlyyZakaz();
  telo.innerHTML = `
    <div class="pusto korzina__pusto">
      <div class="pusto__hinkalik"></div>
      <div class="pusto__zagolovok">В корзине пусто</div>
      <p class="pusto__tekst">Вот что берут чаще всего — нажмите «+», и блюдо сразу окажется здесь.</p>
    </div>
    <div class="metka">Популярное</div>
    <div class="ryad korzina__populyarnoe"></div>
    ${proshlyy ? `<button class="knopka knopka--steklo korzina__povtorit" type="button"><svg width="22" height="22" aria-hidden="true"><use href="#ik-chasy"/></svg><span>Повторить прошлый заказ</span><span class="summa">${rub(proshlyy.summa || proshlyy.pozicii.reduce((s, p) => s + summaPozicii(p), 0))}</span></button>
      <p class="korzina__proshlyy">${tekst(proshlyy.pozicii.slice(0, 3).map((p) => p.nazvanie).join(', '))}${proshlyy.pozicii.length > 3 ? ` и ещё ${proshlyy.pozicii.length - 3}` : ''}</p>` : ''}`;
  niz.innerHTML = '<a class="knopka knopka--glavnaya" href="#/" data-v-menyu><svg width="22" height="22" aria-hidden="true"><use href="#ik-menyu"/></svg><span>К меню</span></a>';

  // Хинкалик 96 px — задумался, потом предлагает хинкали
  const mesto = telo.querySelector('.pusto__hinkalik');
  try {
    personazh = new Hinkalik(mesto, { razmer: 96, plavayushchiy: false, nastroenie: 'dumaet', podpis: 'Хинкалик' });
    setTimeout(() => {
      if (!personazh) return;
      personazh.nastroenie('obychno');
      personazh.skazat('Начнём с хинкали?', 3600);
    }, 700);
  } catch { /* без персонажа пустое состояние всё равно понятно */ }

  const ryad = telo.querySelector('.korzina__populyarnoe');
  const spisok = populyarnye(yadro.menyu, yadro.gost.zavedenieId, 6);
  spisok.forEach((b) => ryad.appendChild(miniKartochka(b, yadro, {
    naKnopku: (blyudo) => polozhitTiho(blyudo),
    naNazhatie: (blyudo, pl) => yadro.perejti(`#/blyudo/${blyudo.id}`, { zamenit: true, istochnik: pl }),
  })));
  poyavlenieKaskadom(ryad.children, 50);

  const povtorit = telo.querySelector('.korzina__povtorit');
  if (povtorit) {
    nazhatie(povtorit, { masshtab: 0.96 });
    povtorit.addEventListener('click', povtoritProshlyy);
  }
  const vMenyu = niz.querySelector('[data-v-menyu]');
  nazhatie(vMenyu, { masshtab: 0.96 });
  vMenyu.addEventListener('click', (s) => { s.preventDefault(); s.stopPropagation(); zakryt('knopka'); });
}

/** Повтор прошлого заказа; недоступное в выбранном заведении — сразу на «Переносим заказ» (тупик 8). */
function povtoritProshlyy() {
  const itog = yadro.korzina.povtoritZakaz(yadro.menyu);
  vibro([10, 30, 10]);
  if (!itog.dobavleno) {
    yadro.tost('Этих блюд больше нет в меню', { vid: 'oshibka' });
    return;
  }
  const zavId = yadro.gost.zavedenieId;
  if (zavId && itog.nedostupno.length) {
    const rezultat = perenestiKorzinu(yadro.korzina.pozicii, zavId, yadro.menyu);
    if (rezultat.propalo.length || rezultat.izmenilasCena.length) {
      yadro.perenos = { zavedenieId: zavId, rezultat, vozvrat: '#/korzina', bylo: zavId };
      yadro.perejti('#/perenos', { zamenit: true });
      return;
    }
  }
  yadro.tost(itog.propushcheno ? `Вернули ${blyud(itog.dobavleno)}, ${itog.propushcheno} уже нет в меню` : 'Прошлый заказ в корзине', { vid: 'uspeh' });
}

/** Положить из шторки без полёта: кнопка корзины под затемнением, лететь некуда. */
function polozhitTiho(blyudo) {
  const poz = yadro.dobavitVKorzinu(blyudo, { tiho: true });
  if (poz) yadro.tost(`${blyudo.nazvanie} в корзине`, { vid: 'uspeh' });
}

/** Корзина с позициями. */
function narisovatPozicii() {
  const telo = el.querySelector('.korzina__telo');
  const niz = el.querySelector('.korzina__niz');
  telo.innerHTML = `
    <div class="korzina__preduprezhdenie"></div>
    <div class="kartochka-belaya korzina__spisok"></div>
    <div class="minimum korzina__minimum" hidden>
      <div class="minimum__polosa"><i></i></div>
      <p class="minimum__tekst"></p>
      <button class="knopka knopka--steklo knopka--40 korzina__sam" type="button"><svg width="18" height="18" aria-hidden="true"><use href="#ik-sumka"/></svg><span>Заберу сам</span></button>
    </div>
    <div class="k-etomu korzina__k-etomu" hidden><div class="metka">К этому берут</div><div class="ryad"></div></div>
    <div class="kartochka-belaya korzina__itog">
      <div class="korzina__stroka"><span class="korzina__shtuk"></span><span class="korzina__summa-blyud"></span></div>
      <div class="korzina__stroka korzina__skidka" hidden><span class="korzina__skidka-podpis"></span><span class="korzina__skidka-rub"></span></div>
      <div class="itog"><span>Итого</span><b class="itog__summa">0${TONKIY}₽</b></div>
    </div>`;
  niz.innerHTML = `
    <button class="knopka knopka--korzina korzina__oformit" type="button">
      <svg width="22" height="22" aria-hidden="true"><use href="#ik-strelka"/></svg>
      <span class="korzina__oformit-tekst">Оформить</span>
      <span class="summa"><span class="summa-v">0</span>${TONKIY}₽</span>
    </button>`;

  const spisok = telo.querySelector('.korzina__spisok');
  const stroki = yadro.korzina.pozicii.map((p) => sdelatStroku(p));
  stroki.forEach((s) => spisok.appendChild(s));
  poyavlenieKaskadom(stroki, 35);

  const sam = telo.querySelector('.korzina__sam');
  nazhatie(sam, { masshtab: 0.95 });
  sam.addEventListener('click', () => {
    yadro.obnovitGostya({ sposob: 'samovyvoz' });
    yadro.tost('Заберёте сами — без минимальной суммы', { vid: 'uspeh' });
  });

  const oformit = niz.querySelector('.korzina__oformit');
  nazhatie(oformit, { masshtab: 0.96 });
  oformit.addEventListener('click', () => {
    // тупик 9: сумма доставки не набрана — кнопка не мёртвая, предлагает забрать самим
    if (nuzhenMinimum()) yadro.obnovitGostya({ sposob: 'samovyvoz' });
    yadro.perejti('#/oformlenie', { istochnik: oformit.getBoundingClientRect() });
  });

  obnovitSvodku(true);
}

/** Строка позиции: мини-плитка, название, цена за штуку, справа сумма и степпер. */
function sdelatStroku(p) {
  const s = strokaPozicii(p, yadro);
  s.classList.add('korzina__poziciya');
  s.querySelector('.poziciya__cena')?.remove();
  const prava = document.createElement('div');
  prava.className = 'korzina__prava';
  prava.innerHTML = `
    <b class="korzina__summa"><span class="summa-v">${chislo(summaPozicii(p))}</span>${TONKIY}₽</b>
    <div class="stepper stepper--malyy stepper--steklo" role="group" aria-label="Количество">
      <button type="button" data-shag="-1" aria-label="Меньше"><svg aria-hidden="true"><use href="#ik-minus"/></svg></button>
      <b>${p.kolichestvo}</b>
      <button type="button" data-shag="1" aria-label="Больше"><svg aria-hidden="true"><use href="#ik-plus"/></svg></button>
    </div>`;
  s.appendChild(prava);
  s._summa = summaPozicii(p);
  obnovitMetu(s, p);

  prava.querySelectorAll('button').forEach((k) => {
    nazhatie(k, { masshtab: 0.84 });
    k.addEventListener('click', () => {
      const tek = yadro.korzina.poziciya(p.klyuch);
      if (!tek) return;
      if (k.dataset.shag === '1') {
        if (tek.kolichestvo >= 99) return;
        yadro.korzina.izmenit(p.klyuch, tek.kolichestvo + 1);
        vibro(6);
      } else {
        yadro.umenshit(p.klyuch);
      }
    });
  });
  // тап по строке (не по степперу) — открыть блюдо
  s.addEventListener('click', (sob) => {
    if (sob.target.closest('.stepper')) return;
    const b = naytiBlyudo(yadro.menyu, p.blyudoId);
    if (b) yadro.perejti(`#/blyudo/${b.id}`, { zamenit: true, istochnik: s.querySelector('.mini-plitka') });
  });
  return s;
}

/** Мета строки: цена за штуку, вес, добавки; недоступное здесь — бейдж. */
function obnovitMetu(s, p) {
  const blyudo = naytiBlyudo(yadro.menyu, p.blyudoId);
  const prichina = blyudo ? yadro.prichina(blyudo) : 'net';
  const chasti = [];
  if (blyudo) {
    const ves = metaBlyuda(blyudo, yadro.semeystvo(blyudo.razdel)).find((m) => /г|мл/.test(m) && !/ккал/.test(m));
    if (ves) chasti.push(ves);
  }
  chasti.push(`${rub(p.cena)} за шт.`);
  const dobavki = (p.dobavki || []).map((d) => d.nazvanie).join(', ');
  if (dobavki) chasti.push(dobavki);
  const meta = s.querySelector('.poziciya__meta');
  meta.innerHTML = `${prichina ? `<span class="bejdzh">${prichina === 'stop' ? 'нет сегодня' : 'нет здесь'}</span> ` : ''}${tekst(chasti.join(' · '))}`;
  s.classList.toggle('nedostupna', Boolean(prichina));
}

/** Итог, кнопка, полоса минимума, подзаголовок, предупреждения, «к этому берут». */
function obnovitSvodku(pervyyRaz = false) {
  if (!el || bylaPusta) return;
  const k = yadro.korzina;
  const summa = k.summa();
  const n = k.kolichestvo();
  el.querySelector('.korzina__pod').textContent = podzagolovok();
  el.querySelector('.korzina__shtuk').textContent = `${blyud(k.pozicii.length)}, ${n} шт.`;
  el.querySelector('.korzina__summa-blyud').textContent = rub(summa);

  // личная скидка гостя из Resto Postbot — ровно та, что вычтет сервер; не вошёл — строки нет
  const sk = yadro.skidka(summa);
  const strokaSkidki = el.querySelector('.korzina__skidka');
  strokaSkidki.hidden = !sk.rub;
  if (sk.rub) {
    strokaSkidki.querySelector('.korzina__skidka-podpis').textContent = `Ваша скидка −${sk.procent}${TONKIY}%`;
    strokaSkidki.querySelector('.korzina__skidka-rub').textContent = `−${rub(sk.rub)}`;
  }

  const itogEl = el.querySelector('.itog__summa');
  itogEl.innerHTML = `<span class="summa-v"></span>${TONKIY}₽`;
  pokazatChislo(itogEl.firstElementChild, pervyyRaz ? 0 : pokazannyyItog, sk.itogo, 420, (v) => chislo(v));
  pokazannyyItog = sk.itogo;

  // кнопка: при недоборе на доставку честно предлагает забрать самим (тупик 9)
  const knopka = el.querySelector('.korzina__oformit');
  const min = yadro.minZakaz();
  const nedobor = nuzhenMinimum();
  knopka.querySelector('.korzina__oformit-tekst').textContent = nedobor ? 'Заберу сам' : 'Оформить';
  pokazatChislo(knopka.querySelector('.summa-v'), pervyyRaz ? 0 : pokazannayaNaKnopke, sk.itogo, 420, (v) => chislo(v));
  pokazannayaNaKnopke = sk.itogo;

  // полоса минимальной суммы доставки (при самовывозе — нет)
  const blokMin = el.querySelector('.korzina__minimum');
  blokMin.hidden = !nedobor;
  if (nedobor) {
    blokMin.querySelector('.minimum__polosa > i').style.width = `${Math.max(4, Math.round((summa / min) * 100))}%`;
    blokMin.querySelector('.minimum__tekst').innerHTML = `До доставки не хватает <b>${rub(min - summa)}</b> — или заберите сами: без минимума`;
  }

  // заведение закрыто — не блокируем, оформим ко времени (тупик 2); блюда не отсюда — к переносу
  const zav = yadro.zavedenie();
  const pred = el.querySelector('.korzina__preduprezhdenie');
  const nedostupnye = k.pozicii.filter((p) => { const b = naytiBlyudo(yadro.menyu, p.blyudoId); return !b || yadro.prichina(b); });
  let html = '';
  if (nedostupnye.length && zav) {
    html = `<div class="preduprezhdenie korzina__pred"><b>${nedostupnye.length === 1 ? 'Одного блюда' : 'Части блюд'} нет в заведении «${tekst(zav.nazvanie)}»</b><p>Покажем, чем заменить, — ничего не пропадёт молча.</p><div class="preduprezhdenie__knopki"><button class="knopka knopka--glavnaya knopka--40" type="button" data-razobratsya>Подобрать замену</button></div></div>`;
  } else if (zav) {
    const s = otkrytoSeychas(zav);
    if (!s.otkryto && zav.chasy) html = `<div class="korzina__zakryto"><svg aria-hidden="true"><use href="#ik-chasy"/></svg><span>${tekst(zav.nazvanie)} ${s.otkroetsya ? `откроется ${tekst(s.otkroetsya)}` : 'сейчас закрыто'} — оформим ко времени</span></div>`;
  }
  if (pred.dataset.html !== html) {
    pred.dataset.html = html;
    pred.innerHTML = html;
    const razobr = pred.querySelector('[data-razobratsya]');
    if (razobr) {
      nazhatie(razobr, { masshtab: 0.95 });
      razobr.addEventListener('click', () => {
        const rezultat = perenestiKorzinu(yadro.korzina.pozicii, zav.id, yadro.menyu);
        yadro.perenos = { zavedenieId: zav.id, rezultat, vozvrat: '#/korzina', bylo: zav.id };
        yadro.perejti('#/perenos', { zamenit: true });
      });
    }
  }

  obnovitSovety();
}

/** «К этому берут»: соусы к хинкали и шашлыку, лимонад к горячему — только доступное здесь. */
function obnovitSovety() {
  const blok = el.querySelector('.korzina__k-etomu');
  const sovety = kEtomuBerut(yadro.korzina.pozicii, yadro.menyu, yadro.gost.zavedenieId, 4);
  const klyuch = sovety.map((b) => b.id).join('|');
  if (klyuch === klyuchSovetov) return;
  klyuchSovetov = klyuch;
  const ryad = blok.querySelector('.ryad');
  ryad.innerHTML = '';
  sovety.forEach((b) => ryad.appendChild(miniKartochka(b, yadro, {
    naKnopku: (blyudo) => polozhitTiho(blyudo),
    naNazhatie: (blyudo, pl) => yadro.perejti(`#/blyudo/${blyudo.id}`, { zamenit: true, istochnik: pl }),
  })));
  blok.hidden = !sovety.length;
  if (sovety.length) poyavlenieKaskadom(ryad.children, 40);
}

/** Точечное обновление по событию корзины или гостя. */
function obnovit(sobytie = {}) {
  if (!el) return;
  const pusta = yadro.korzina.pusta();
  if (pusta !== bylaPusta) {
    // стала пустой — даём строке уехать, потом рисуем пустое состояние
    if (pusta) {
      const poslednyaya = el.querySelector('.korzina__poziciya');
      const pauza = poslednyaya && !dvizhenieSnyato() ? svernutStroku(poslednyaya) : Promise.resolve();
      pauza.then(() => { if (el && yadro.korzina.pusta()) narisovat(); });
    } else {
      narisovat();
    }
    return;
  }
  if (pusta) return;

  const spisok = el.querySelector('.korzina__spisok');
  const pozicii = yadro.korzina.pozicii;
  const est = new Map([...spisok.querySelectorAll('.korzina__poziciya')].filter((s) => !s.classList.contains('uhodit')).map((s) => [s.dataset.klyuch, s]));

  // ушедшие позиции — сворачиваются
  for (const [klyuch, s] of est) {
    if (!pozicii.some((p) => p.klyuch === klyuch)) { svernutStroku(s); est.delete(klyuch); }
  }
  // новые и изменённые — по порядку корзины
  let pred = null;
  for (const p of pozicii) {
    let s = est.get(p.klyuch);
    if (!s) {
      s = sdelatStroku(p);
      if (pred) pred.after(s); else spisok.prepend(s);
      if (!dvizhenieSnyato()) {
        s.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.96)', background: 'rgba(255, 176, 58, .28)' }, { opacity: 1, transform: 'none', background: 'rgba(255, 176, 58, 0)' }], { duration: 700, easing: pruzhina.zhivaya.easing });
      }
    } else {
      obnovitStroku(s, p);
    }
    pred = s;
  }
  obnovitSvodku(false);
  if (sobytie.tip === 'gost') el.querySelectorAll('.korzina__poziciya').forEach((s) => { const p = yadro.korzina.poziciya(s.dataset.klyuch); if (p) obnovitMetu(s, p); });
}

/** Количество и сумма строки: цифра подпрыгивает пружиной, сумма крутится. */
function obnovitStroku(s, p) {
  const b = s.querySelector('.stepper b');
  if (b.textContent !== String(p.kolichestvo)) {
    const bolshe = Number(b.textContent) < p.kolichestvo;
    b.textContent = String(p.kolichestvo);
    if (!dvizhenieSnyato()) {
      b.animate([{ transform: `translateY(${bolshe ? 8 : -8}px) scale(.6)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
    }
  }
  const summa = summaPozicii(p);
  if (s._summa !== summa) {
    pokazatChislo(s.querySelector('.korzina__summa .summa-v'), s._summa || 0, summa, 420, (v) => chislo(v));
    s._summa = summa;
  }
  obnovitMetu(s, p);
}

/** Строка уходит: тает и схлопывается по высоте. */
function svernutStroku(s) {
  s.classList.add('uhodit');
  if (dvizhenieSnyato() || !s.animate) { s.remove(); return Promise.resolve(); }
  const h = s.getBoundingClientRect().height;
  const a = s.animate([
    { opacity: 1, height: `${h}px`, transform: 'none' },
    { opacity: 0, height: `${h}px`, transform: 'translateX(-24px)', offset: 0.45 },
    { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', transform: 'translateX(-24px)' },
  ], { duration: 380, easing: 'ease-in-out', fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => s.remove());
}
