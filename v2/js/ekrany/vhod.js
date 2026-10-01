// Витрина Хинкальной v2 — вход гостя по номеру телефона (маршрут #/vhod).
// Шторка снизу: номер → код из СМС → вошли. После входа показывает телефон,
// личную скидку в выбранном заведении и кнопку «Выйти».
// Зачем вход: личная скидка живёт в Resto Postbot у телефона гостя; без входа
// витрина её не знает и не показывает, а сервер не вычтет её из заказа.
// Эндпоинты: POST /customers/request-code, POST /customers/verify-code (js/rpb.js).
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { shtorka, nazhatie, vibro, dvizhenieSnyato, poyavlenieKaskadom } from '../dvizhenie.js';
import { tekst } from '../kartochka.js';
import { zaprositKod, podtverditKod, cifryTelefona } from '../rpb.js';

export const nastroyki = { niz: true, hinkalik: true };

/** Сколько секунд ждать до повторной отправки кода. */
const PAUZA_POVTORA = 60;
/** Длина кода из СМС (customer.service.ts: generateRandomCode(6)). */
const DLINA_KODA = 6;

let yadro = null;
let upr = null;
let el = null;
let otpiski = [];
let shag = 'telefon';        // 'telefon' | 'kod' | 'voshel'
let telefon = '';
let zanyato = false;
let tajmer = null;
let ostalos = 0;

/** +7 (916) 123-45-67 из цифр. */
function maska(cifry) {
  const d = cifryTelefona(cifry);
  const ch = d.startsWith('7') ? d.slice(1, 11) : d.slice(0, 10);
  let s = '+7';
  if (ch.length) s += ` (${ch.slice(0, 3)}`;
  if (ch.length >= 3) s += ') ';
  if (ch.length > 3) s += ch.slice(3, 6);
  if (ch.length > 6) s += `-${ch.slice(6, 8)}`;
  if (ch.length > 8) s += `-${ch.slice(8, 10)}`;
  return s;
}

function zakryt(prichina) {
  if (upr) upr.zakryt(prichina);
}

export function pokazat(kontejner, yadro_, parametry = {}) {
  yadro = yadro_;
  zanyato = false;
  const uzheVoshel = Boolean(yadro.gostRPB());
  shag = uzheVoshel ? 'voshel' : 'telefon';
  telefon = uzheVoshel ? yadro.gostRPB().telefon : '';

  el = document.createElement('div');
  el.className = 'shtorka shtorka--vhod';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Вход по номеру телефона');
  el.innerHTML = `
    <div class="shtorka__shapka-korziny">
      <div class="shtorka__ruchka" data-ruchka></div>
      <button class="shtorka__zakryt vhod__zakryt" type="button" aria-label="Закрыть"><svg aria-hidden="true"><use href="#ik-zakryt"/></svg></button>
      <h2 class="vhod__zagolovok">Вход</h2>
      <p class="korzina__pod vhod__pod"></p>
    </div>
    <div class="shtorka__telo vhod__telo"></div>`;
  kontejner.appendChild(el);

  const knopkaZakryt = el.querySelector('.vhod__zakryt');
  nazhatie(knopkaZakryt, { masshtab: 0.9 });
  knopkaZakryt.addEventListener('click', () => zakryt('knopka'));

  narisovat();
  otpiski.push(yadro.na('skidka', () => { if (shag === 'voshel') narisovat(); }));

  upr = shtorka(el, {
    cvetFona: 'rgba(60, 25, 10, .28)',
    naZakrytie: (prichina) => { if (prichina !== 'kod') yadro.nazad(parametry.vozvrat || '#/'); },
  });
  return upr.otkryt();
}

export function ubrat() {
  otpiski.forEach((f) => { try { f(); } catch { /* уже снято */ } });
  otpiski = [];
  if (tajmer) { clearInterval(tajmer); tajmer = null; }
  const u = upr;
  upr = null;
  el = null;
  if (!u) return undefined;
  const p = u.otkryta ? u.zakryt('kod') : Promise.resolve();
  return p.then(() => u.unichtozhit());
}

// ---------------------------------------------------------------------------
// Разметка
// ---------------------------------------------------------------------------

function narisovat() {
  if (!el) return;
  const telo = el.querySelector('.vhod__telo');
  const pod = el.querySelector('.vhod__pod');
  const zagolovok = el.querySelector('.vhod__zagolovok');

  if (shag === 'voshel') {
    const skidka = yadro.skidka(0);
    const zav = yadro.zavedenie();
    zagolovok.textContent = 'Вы вошли';
    pod.textContent = maska(telefon);
    telo.innerHTML = `
      <div class="kartochka-belaya vhod__karta">
        ${skidka.procent > 0
          ? `<div class="vhod__skidka"><b>Ваша скидка −${skidka.procent} %</b><span>${zav ? `в заведении «${tekst(zav.nazvanie)}»` : 'в выбранном заведении'}. Вычитается из заказа сама.</span></div>`
          : `<div class="vhod__skidka vhod__skidka--net"><b>Личной скидки пока нет</b><span>${zav ? `в заведении «${tekst(zav.nazvanie)}»` : 'в выбранном заведении'}. Она появится, когда её назначат в заведении.</span></div>`}
        <button class="knopka knopka--tihaya vhod__vyyti" type="button">Выйти</button>
      </div>`;
    const vyyti = telo.querySelector('.vhod__vyyti');
    nazhatie(vyyti, { masshtab: 0.96 });
    vyyti.addEventListener('click', () => {
      yadro.vyytiGostyu();
      shag = 'telefon';
      telefon = '';
      narisovat();
    });
  } else if (shag === 'telefon') {
    zagolovok.textContent = 'Вход';
    pod.textContent = 'Чтобы увидеть свою скидку';
    telo.innerHTML = `
      <div class="kartochka-belaya vhod__karta">
        <label class="pole vhod__pole" data-pole="vhod">
          <span class="pole__metka">Телефон</span>
          <input class="pole__vvod" name="vhod-telefon" type="tel" inputmode="tel" autocomplete="tel"
                 placeholder="+7 (___) ___-__-__" value="${tekst(telefon ? maska(telefon) : '')}">
        </label>
        <p class="vhod__podskazka">Пришлём код в СМС. Номер нужен только для скидки и заказа.</p>
        <button class="knopka knopka--glavnaya vhod__dalshe" type="button">Выслать код</button>
        <p class="vhod__oshibka" hidden></p>
      </div>`;
    const vvod = telo.querySelector('input');
    vvod.addEventListener('input', () => {
      const bylo = vvod.value;
      vvod.value = maska(bylo);
      telefon = cifryTelefona(vvod.value);
    });
    const dalshe = telo.querySelector('.vhod__dalshe');
    nazhatie(dalshe, { masshtab: 0.96 });
    dalshe.addEventListener('click', () => poslatKod(dalshe));
    vvod.addEventListener('keydown', (e) => { if (e.key === 'Enter') poslatKod(dalshe); });
    if (!dvizhenieSnyato()) poyavlenieKaskadom([...telo.querySelectorAll('.vhod__pole, .vhod__podskazka, .knopka')], 60);
  } else {
    zagolovok.textContent = 'Код из СМС';
    pod.textContent = `Отправили на ${maska(telefon)}`;
    telo.innerHTML = `
      <div class="kartochka-belaya vhod__karta">
        <label class="pole vhod__pole" data-pole="vhod">
          <span class="pole__metka">Код</span>
          <input class="pole__vvod" name="vhod-kod" type="text" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="${DLINA_KODA}" placeholder="${'•'.repeat(DLINA_KODA)}">
        </label>
        <button class="knopka knopka--glavnaya vhod__podtverdit" type="button">Войти</button>
        <button class="knopka knopka--tihaya vhod__povtor" type="button">Выслать ещё раз</button>
        <button class="knopka knopka--tihaya vhod__drugoy" type="button">Другой номер</button>
        <p class="vhod__oshibka" hidden></p>
      </div>`;
    const vvod = telo.querySelector('input');
    setTimeout(() => vvod.focus({ preventScroll: true }), 250);
    vvod.addEventListener('input', () => {
      vvod.value = vvod.value.replace(/\D/g, '').slice(0, DLINA_KODA);
      if (vvod.value.length === DLINA_KODA) proveritKod(vvod.value);
    });
    const podtverdit = telo.querySelector('.vhod__podtverdit');
    nazhatie(podtverdit, { masshtab: 0.96 });
    podtverdit.addEventListener('click', () => proveritKod(vvod.value));
    const povtor = telo.querySelector('.vhod__povtor');
    nazhatie(povtor, { masshtab: 0.96 });
    povtor.addEventListener('click', () => { if (!ostalos) poslatKod(povtor); });
    const drugoy = telo.querySelector('.vhod__drugoy');
    nazhatie(drugoy, { masshtab: 0.96 });
    drugoy.addEventListener('click', () => { shag = 'telefon'; narisovat(); });
    obnovitOtschet();
  }
}

function pokazatOshibku(soobshchenie) {
  const p = el?.querySelector('.vhod__oshibka');
  if (!p) return;
  p.hidden = !soobshchenie;
  p.textContent = soobshchenie || '';
}

/** Обратный отсчёт до повторной отправки: кнопка «Выслать ещё раз» до нуля неактивна. */
function obnovitOtschet() {
  const knopka = el?.querySelector('.vhod__povtor');
  if (!knopka) return;
  knopka.disabled = ostalos > 0;
  knopka.textContent = ostalos > 0 ? `Выслать ещё раз через ${ostalos} с` : 'Выслать ещё раз';
}

function zapustitOtschet() {
  ostalos = PAUZA_POVTORA;
  if (tajmer) clearInterval(tajmer);
  tajmer = setInterval(() => {
    ostalos -= 1;
    if (ostalos <= 0) { clearInterval(tajmer); tajmer = null; ostalos = 0; }
    obnovitOtschet();
  }, 1000);
  obnovitOtschet();
}

// ---------------------------------------------------------------------------
// Запросы
// ---------------------------------------------------------------------------

async function poslatKod(knopka) {
  if (zanyato) return;
  const cifry = cifryTelefona(telefon);
  if (cifry.length < 11) {
    pokazatOshibku('Не хватает цифр в номере');
    vibro([30, 40, 30]);
    return;
  }
  zanyato = true;
  const bylo = knopka.textContent;
  knopka.disabled = true;
  knopka.textContent = 'Отправляем…';
  try {
    await zaprositKod(cifry);
    shag = 'kod';
    narisovat();
    zapustitOtschet();
    vibro(10);
  } catch (oshibka) {
    console.warn('Код не ушёл', oshibka);
    knopka.disabled = false;
    knopka.textContent = bylo;
    pokazatOshibku(oshibka?.kod >= 500
      ? 'Сервер не отвечает — попробуйте позже'
      : (oshibka?.message || 'Не получилось выслать код'));
  } finally {
    zanyato = false;
  }
}

async function proveritKod(kod) {
  if (zanyato) return;
  const chistyy = String(kod || '').replace(/\D/g, '');
  if (chistyy.length < DLINA_KODA) {
    pokazatOshibku(`В коде ${DLINA_KODA} цифр`);
    return;
  }
  zanyato = true;
  const knopka = el?.querySelector('.vhod__podtverdit');
  if (knopka) { knopka.disabled = true; knopka.textContent = 'Проверяем…'; }
  try {
    await podtverditKod(telefon, chistyy);
    await yadro.obnovitSkidku();
    shag = 'voshel';
    narisovat();
    vibro([10, 40, 20]);
    const skidka = yadro.skidka(0);
    yadro.tost(skidka.procent > 0 ? `Вошли. Ваша скидка −${skidka.procent} %` : 'Вошли');
  } catch (oshibka) {
    console.warn('Код не подошёл', oshibka);
    if (knopka) { knopka.disabled = false; knopka.textContent = 'Войти'; }
    pokazatOshibku(oshibka?.message === 'Неправильный код' ? 'Неправильный код — проверьте цифры' : (oshibka?.message || 'Код не подошёл'));
    vibro([30, 40, 30]);
  } finally {
    zanyato = false;
  }
}
