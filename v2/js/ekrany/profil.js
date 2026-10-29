// Витрина Хинкальной v2 — «Профиль» (маршрут #/profil, пункт нижнего меню), 29.10.2026.
// Владелец: «в клиентской части не вижу раздела профиль и истории заказов». Как у Додо и Яндекс Еды:
// кто я (имя, телефон), личная скидка и код для кассира, мои заказы с «Повторить», адреса доставки, выход.
// Не вошёл — объясняем, зачем входить, и ведём на вход по номеру (#/skidka).
// Заказы — GET /orders/customer/:id с токеном гостя (только свои, order.controller.ts), туда же попадают
// заказы из зала, к которым кассир привязал гостя по QR.

import { nazhatie, poyavlenieKaskadom, vibro } from '../dvizhenie.js';
import { naytiBlyudo, naytiZavedenie } from '../dannye.js';
import { tekst, rub } from '../kartochka.js';
import { moiZakazy, moiAdresa } from '../rpb.js';
import { maskaNomera, razobratNomer } from '../telefon.js';

export const nastroyki = { niz: true, hinkalik: true };

const STATUS = { CREATED: 'Принят', CONFIRMED: 'Принят', PREPARING: 'Готовится', READY: 'Готов', DELIVERING: 'Везёт курьер', COMPLETED: 'Выдан' };
const TIP = { TAKEAWAY: 'С собой', DELIVERY: 'Доставка', DINE_IN: 'В зале', BANQUET: 'Банкет' };
const DATA = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

let yadro = null;
let kontejner = null;
let pokolenie = 0;

function knopka(el, fn) {
  nazhatie(el, { masshtab: 0.96 });
  el.addEventListener('click', fn);
}

/** Блюда заказа, которые гость получил: без черновиков, отменённых и возвратов. */
function blyudaZakaza(o) {
  return (o.items || []).filter((i) => !i.isDraft && !i.isRefund && !i.isComboChild && i.status !== 'CANCELLED' && i.status !== 'REFUNDED' && !i.parentOrderItemId);
}

/** «Повторить»: то, что есть в меню сейчас, — в корзину, остальное называем. */
function povtorit(o) {
  let dobavleno = 0;
  const net = [];
  for (const i of blyudaZakaza(o)) {
    const b = naytiBlyudo(yadro.menyu, i.product?.id);
    const poz = b && yadro.dobavitVKorzinu(b, { kolichestvo: i.quantity || 1, tiho: true });
    if (poz) dobavleno += 1; else net.push(i.product?.title || 'блюдо');
  }
  vibro([10, 30, 10]);
  if (!dobavleno) { yadro.tost('Этих блюд сейчас нет в меню', { vid: 'oshibka' }); return; }
  yadro.tost(net.length ? `В корзине. Нет сейчас: ${net.slice(0, 3).join(', ')}` : 'Заказ снова в корзине', { vid: 'uspeh' });
  yadro.perejti('#/korzina', { istochnik: yadro.knopkaKorziny });
}

function kartochkaZakaza(o) {
  const el = document.createElement('article');
  el.className = 'kartochka-belaya profil__zakaz';
  const blyuda = blyudaZakaza(o);
  const sostav = blyuda.slice(0, 4).map((i) => `${i.product?.title || 'Блюдо'}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ') + (blyuda.length > 4 ? ` и ещё ${blyuda.length - 4}` : '');
  const kogda = o.createdAt ? DATA.format(new Date(o.createdAt)) : '';
  el.innerHTML = `
    <div class="profil__zakaz-verh">
      <b>№ ${tekst(String(o.number || ''))}</b>
      <span class="profil__status${o.status === 'COMPLETED' ? '' : ' profil__status--idet'}">${tekst(STATUS[o.status] || '')}</span>
    </div>
    <div class="profil__zakaz-gde">${tekst([kogda, TIP[o.type], naytiZavedenie(yadro.menyu, o.restaurant?.id)?.nazvanie || o.restaurant?.name].filter(Boolean).join(' · '))}</div>
    <div class="profil__zakaz-sostav">${tekst(sostav || 'Без блюд')}</div>
    <div class="profil__zakaz-niz">
      <b>${rub(Number(o.totalAmount) || 0)}</b>
      ${blyuda.length ? '<button class="knopka knopka--steklo profil__povtorit" type="button">Повторить</button>' : ''}
    </div>`;
  const k = el.querySelector('.profil__povtorit');
  if (k) knopka(k, () => povtorit(o));
  return el;
}

async function narisovatZakazy(mesto, moe) {
  mesto.innerHTML = '<p class="profil__tiho">Загружаем заказы…</p>';
  let spisok;
  try { spisok = await moiZakazy(); } catch (oshibka) {
    if (moe !== pokolenie) return;
    if (oshibka?.kod === 401) { narisovat(); return; }   // вход истёк — экран входа
    mesto.innerHTML = '<p class="profil__tiho">Заказы не загрузились — похоже, нет сети.</p>';
    return;
  }
  if (moe !== pokolenie) return;
  if (!spisok.length) {
    mesto.innerHTML = '<p class="profil__tiho">Заказов пока нет. Первый — в меню.</p>';
    return;
  }
  mesto.innerHTML = '';
  spisok.forEach((o) => mesto.appendChild(kartochkaZakaza(o)));
  poyavlenieKaskadom(mesto.children, 40);
}

async function narisovatAdresa(mesto, moe) {
  const adresa = await moiAdresa();
  if (moe !== pokolenie || !adresa.length) return;
  mesto.innerHTML = `<div class="metka">Адреса доставки</div>
    <div class="kartochka-belaya profil__adresa">${adresa.slice(0, 3).map((a) => `<div class="profil__adres">${tekst(a.kratko)}${a.adres ? `<small>${tekst(a.adres)}</small>` : ''}</div>`).join('')}</div>`;
}

function narisovat() {
  const moe = ++pokolenie;
  const g = yadro.gostRPB();
  if (!g) {
    kontejner.innerHTML = `
      <div class="ekran__shapka"><div><h1 class="ekran__zagolovok">Профиль</h1>
        <p class="ekran__pod">Войдите по номеру телефона — здесь будут ваши заказы, личная скидка и адреса</p></div></div>
      <button class="knopka knopka--glavnaya knopka--60" type="button" data-voyti><svg aria-hidden="true"><use href="#ik-telefon"/></svg><span>Войти по номеру</span></button>`;
    knopka(kontejner.querySelector('[data-voyti]'), () => yadro.perejti('#/skidka'));
    return;
  }
  const sk = yadro.skidka();
  const zav = yadro.zavedenie();
  const telefon = maskaNomera(razobratNomer(g.telefon).nomer);
  kontejner.innerHTML = `
    <div class="ekran__shapka"><div><h1 class="ekran__zagolovok">${tekst(g.imya || 'Профиль')}</h1>
      <p class="ekran__pod">${tekst(telefon)}</p></div></div>
    <button class="kartochka-belaya profil__skidka" type="button" data-kod>
      <b>${sk.procentGostya > 0 ? `Ваша скидка −${sk.procentGostya} %${zav ? ` · ${tekst(zav.nazvanie)}` : ''}` : 'Код для кассира'}</b>
      <span>${sk.procentGostya > 0 ? 'Покажите код кассиру — скидка встанет в заказ в зале' : 'Покажите кассиру — заказ в зале попадёт в вашу историю'}</span>
    </button>
    <div class="metka">Мои заказы</div>
    <div class="profil__zakazy"></div>
    <div class="profil__adresa-mesto"></div>
    <button class="knopka knopka--tihaya profil__vyyti" type="button" data-vyyti>Выйти</button>`;
  knopka(kontejner.querySelector('[data-kod]'), () => yadro.perejti('#/skidka'));
  knopka(kontejner.querySelector('[data-vyyti]'), () => { yadro.vyytiGostyu(); yadro.tost('Вы вышли', { vid: 'uspeh' }); narisovat(); });
  narisovatZakazy(kontejner.querySelector('.profil__zakazy'), moe);
  narisovatAdresa(kontejner.querySelector('.profil__adresa-mesto'), moe);
}

let otpiska = null;

export function pokazat(kontejner_, yadro_) {
  yadro = yadro_;
  kontejner = kontejner_;
  kontejner.classList.add('profil');
  narisovat();
  // вошёл или вышел в шторке «Скидка» поверх профиля — перерисовать
  otpiska = yadro.na('gost', () => { if (kontejner) narisovat(); });
}

export function ubrat() {
  pokolenie += 1;
  if (otpiska) { try { otpiska(); } catch { /* уже снята */ } otpiska = null; }
  kontejner = null;
}
