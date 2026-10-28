// Витрина Хинкальной v2 — «Заказ принят» (маршрут #/gotovo/<номер>).
// Хинкалик 140 px радуется и подпрыгивает, номер заказа градиентом, что дальше
// (сколько готовим, где забрать / куда везём), список и итог, «К меню» и «Повторить
// заказ». Заказ уже создан в ChikChak и записан как «прошлый заказ».
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { flip, nazhatie, pruzhina, dvizhenieSnyato, vibro, poyavlenieKaskadom } from '../dvizhenie.js';
import { naytiZavedenie, perenestiKorzinu } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { tekst, rub, TONKIY, strokaPozicii } from '../kartochka.js';
import { tokenOplaty, oplatitOnlayn } from '../rpb.js';

export const nastroyki = { niz: false, hinkalik: false, palitra: 'gotovo' };

let yadro = null;
let personazh = null;
let tajmery = [];
/** Форма оплаты ЮKassa на этом экране (29.10.2026): гость платит у нас, без перехода на yoomoney.ru. */
let forma = null;
let zagruzkaVidzheta = null;
const SKRIPT_VIDZHETA = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';

function vidzhetYukassy() {
  if (window.YooMoneyCheckoutWidget) return Promise.resolve(window.YooMoneyCheckoutWidget);
  if (zagruzkaVidzheta) return zagruzkaVidzheta;
  zagruzkaVidzheta = new Promise((gotovo, oshibka) => {
    const s = document.createElement('script');
    s.src = SKRIPT_VIDZHETA;
    s.onload = () => (window.YooMoneyCheckoutWidget ? gotovo(window.YooMoneyCheckoutWidget) : oshibka(new Error('Форма оплаты не загрузилась')));
    s.onerror = () => { zagruzkaVidzheta = null; oshibka(new Error('Форма оплаты не загрузилась — проверьте интернет')); };
    document.head.appendChild(s);
  });
  return zagruzkaVidzheta;
}

function ubratFormu() {
  if (forma) { try { forma.destroy(); } catch { /* уже убрана */ } forma = null; }
}

export function pokazat(kontejner, yadro_, parametry) {
  yadro = yadro_;
  kontejner.classList.add('ekran--bez-niza');
  const nomer = String(parametry.nomer || '');
  const zakaz = yadro.korzina.proshlyyZakaz();
  const svoy = zakaz && (String(zakaz.nomerPokaz || '') === nomer || String(zakaz.nomer) === nomer);

  if (!svoy) {
    // прямая ссылка на чужой или старый номер — честно, без выдумок
    kontejner.innerHTML = `
      <div class="gotovo__hinkalik"></div>
      <h1 class="ekran__zagolovok">${nomer ? `Заказ № ${tekst(nomer)}` : 'Заказ'}</h1>
      <p class="ekran__pod">Этот заказ мы не нашли на этом телефоне. Соберём новый?</p>
      <div class="gotovo__knopki"><a class="knopka knopka--glavnaya" href="#/"><svg width="22" height="22" aria-hidden="true"><use href="#ik-menyu"/></svg><span>К меню</span></a></div>`;
    sozdatPersonazha(kontejner, 'dumaet', null);
    return;
  }

  const zav = zakaz.zavedenieId ? naytiZavedenie(yadro.menyu, zakaz.zavedenieId) : null;
  const dostavka = zakaz.sposob === 'dostavka';
  // личная скидка гостя, вычтенная сервером (у старых записей её нет — тогда итог = сумма блюд)
  const skidka = zakaz.skidka && Number(zakaz.skidka.rub) > 0 ? zakaz.skidka : null;
  const bezSeti = Boolean(zakaz.otlozhen);
  const kogda = zakaz.kogda_poluchit || {};
  // Заказ настоящий: он создан в ChikChak и виден на кухне заведения.
  let chtoDalshe;
  if (kogda.tip === 'ko_vremeni') chtoDalshe = dostavka ? `Привезём ${tekst(kogda.podpis)}` : `Будет готово ${tekst(kogda.podpis)}`;
  else chtoDalshe = dostavka ? `Готовим ~${kogda.minut || 20}${TONKIY}мин, потом везём` : `Готовим ~${kogda.minut || 20}${TONKIY}минут`;
  const gde = dostavka
    ? `<b>Адрес доставки</b><span>${tekst(zakaz.adres?.tekst || 'адрес из заказа')}</span>${zav ? `<small>Заведение: ${tekst(zav.nazvanie)}</small>` : ''}`
    : `<b>Самовывоз из «${tekst(zav?.nazvanie || zakaz.zavedenieNazvanie || 'заведения')}»</b>${zav ? `<span>${tekst([zav.adres, zav.metro].filter(Boolean).join(' · '))}</span>` : ''}`;
  // онлайн и ещё не оплачен — форма оплаты здесь же; кухня ждёт денег
  const zhdemOplatu = !bezSeti && zakaz.oplata === 'onlayn' && !zakaz.oplacheno && Boolean(zakaz.zakazId);
  const plashka = bezSeti
    ? '<b>Сети не было — заказ сохранён только на этом телефоне</b><p>В заведение он не ушёл. Как появится сеть, соберите его заново кнопкой «Повторить заказ».</p>'
    : zhdemOplatu
      ? '<b>Осталось оплатить</b><p>Форма оплаты — ниже, прямо здесь. Как только оплата пройдёт, заказ уйдёт на кухню.</p>'
      : '<b>Заказ принят</b><p>Он уже на кухне заведения. Позвоним по телефону из заказа, если что-то закончилось.</p>';
  const itogo = skidka?.rub ? skidka.itogo : zakaz.summa;

  kontejner.innerHTML = `
    <div class="gotovo__hinkalik"></div>
    <h1 class="ekran__zagolovok">${bezSeti ? 'Заказ сохранён' : 'Заказ оформлен'}</h1>
    <div class="kartochka-belaya gotovo__kartochka">
      <div class="gotovo__podpis">Номер заказа</div>
      <div class="gotovo__nomer"><small>№</small>${tekst(nomer)}</div>
      <div class="preduprezhdenie gotovo__demo" style="margin-top:14px;text-align:left">${plashka}</div>
      ${zhdemOplatu ? `<div class="gotovo__oplata"><div class="metka">Оплата ${rub(itogo)}</div><div class="gotovo__forma"><p class="gotovo__zhdem">Открываем форму оплаты…</p></div></div>` : ''}
      <div class="gotovo__shagi">
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-chasy"/></svg></span><div><b>${chtoDalshe}</b><span>${zakaz.imya ? `${tekst(zakaz.imya)}, ` : ''}${zakaz.telefon ? `позвоним на ${tekst(zakaz.telefon)}, если что-то закончится` : 'позвоним, если что-то закончится'}</span></div></div>
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-${dostavka ? 'dostavka' : 'bulavka'}"/></svg></span><div>${gde}</div></div>
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-sumka"/></svg></span><div>${zakaz.oplata === 'onlayn' ? (zakaz.oplacheno ? '<b>Оплачено картой онлайн</b><span>Заказ ушёл на кухню</span>' : '<b>Оплата картой онлайн</b><span>Как только оплата пройдёт, заказ уйдёт на кухню</span>') : '<b>Оплата при получении</b><span>Картой или наличными</span>'}</div></div>
      </div>
    </div>
    <div class="metka">Что в заказе</div>
    <div class="kartochka-belaya gotovo__spisok">
      <div class="gotovo__pozicii"></div>
      ${skidka?.rub ? `<div class="korzina__stroka korzina__skidka" style="padding-top:10px"><span>${tekst(skidka.podpis || `Скидка −${skidka.procent} %`)}</span><span>−${rub(skidka.rub)}</span></div>` : ''}
      <div class="itog"><span>Итого</span><b class="itog__summa">${rub(itogo)}</b></div>
    </div>
    <div class="gotovo__knopki">
      <a class="knopka knopka--glavnaya" href="#/" data-v-menyu><svg width="22" height="22" aria-hidden="true"><use href="#ik-menyu"/></svg><span>К меню</span></a>
      <button class="knopka knopka--tihaya" type="button" data-povtorit>Повторить заказ — он сохранён</button>
    </div>`;

  const pozicii = kontejner.querySelector('.gotovo__pozicii');
  zakaz.pozicii.forEach((p) => pozicii.appendChild(strokaPozicii(p, yadro)));

  const vMenyu = kontejner.querySelector('[data-v-menyu]');
  nazhatie(vMenyu, { masshtab: 0.96 });
  vMenyu.addEventListener('click', (s) => { s.preventDefault(); s.stopPropagation(); yadro.perejti('#/', { zamenit: true }); });

  const povtorit = kontejner.querySelector('[data-povtorit]');
  nazhatie(povtorit, { masshtab: 0.96 });
  povtorit.addEventListener('click', () => {
    const itog = yadro.korzina.povtoritZakaz(yadro.menyu);
    vibro([10, 30, 10]);
    if (!itog.dobavleno) { yadro.tost('Этих блюд больше нет в меню', { vid: 'oshibka' }); return; }
    const zavId = yadro.gost.zavedenieId;
    if (zavId && itog.nedostupno.length) {
      const rezultat = perenestiKorzinu(yadro.korzina.pozicii, zavId, yadro.menyu);
      if (rezultat.propalo.length || rezultat.izmenilasCena.length) {
        yadro.perenos = { zavedenieId: zavId, rezultat, vozvrat: '#/korzina', bylo: zavId };
        yadro.perejti('#/perenos', { zamenit: true });
        return;
      }
    }
    Promise.resolve(yadro.perejti('#/', { zamenit: true })).then(() => yadro.perejti('#/korzina', { istochnik: yadro.knopkaKorziny }));
  });

  sozdatPersonazha(kontejner, 'rad', bezSeti ? 'Сохранил на телефоне' : zhdemOplatu ? 'Осталось оплатить' : 'Вот так это будет');
  let ushliNaSayt = false;
  try { ushliNaSayt = zhdemOplatu && sessionStorage.getItem(`oplata-na-sayte-${zakaz.zakazId}`) === '1'; } catch { /* нет хранилища */ }
  if (ushliNaSayt) {
    const mesto = kontejner.querySelector('.gotovo__forma');
    mesto.innerHTML = '<div class="gotovo__oplacheno"><b>Оплата на странице ЮKassa</b><span>Если оплатили — заказ уйдёт на кухню, как только банк подтвердит.</span></div><button class="knopka knopka--tihaya gotovo__zapas" type="button" data-ne-oplatil>Не оплатил — открыть форму</button>';
    mesto.querySelector('[data-ne-oplatil]').addEventListener('click', () => {
      try { sessionStorage.removeItem(`oplata-na-sayte-${zakaz.zakazId}`); } catch { /* нет хранилища */ }
      otkrytOplatu(kontejner, zakaz, true);
    });
  } else if (zhdemOplatu) otkrytOplatu(kontejner, zakaz);

  // Движение: кнопка «Заказать» растёт в карточку с номером, остальное — лесенкой
  if (!dvizhenieSnyato()) {
    const kartochka = kontejner.querySelector('.gotovo__kartochka');
    const istochnik = parametry.istochnik;
    if (istochnik && typeof istochnik.width === 'number' && !(istochnik instanceof Element)) {
      flip(istochnik, kartochka, { ms: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing, radiusOt: '16px' });
    }
    const nomerEl = kontejner.querySelector('.gotovo__nomer');
    nomerEl.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: pruzhina.zhivaya.ms, delay: 260, easing: pruzhina.zhivaya.easing, fill: 'backwards' });
    poyavlenieKaskadom([...kontejner.querySelectorAll('.gotovo__demo, .gotovo__shag, .metka, .gotovo__spisok, .gotovo__knopki')], 70);
  }
}

/** Форма ЮKassa в .gotovo__forma. Без return_url: иначе ЮKassa уводит на свою страницу, а события success/fail не приходят. */
/** Номер попытки оплаты заказа на этом телефоне: только растёт — у новой попытки новый платёж, старый отклонённый не вернётся.
 * Перезагрузка «готово» берёт ту же попытку — тот же ещё не оплаченный платёж. */
function popytkaOplaty(zakazId, novaya) {
  const klyuch = `oplata-popytka-${zakazId}`;
  let n = 0;
  try { n = Number(sessionStorage.getItem(klyuch)) || 0; } catch { /* нет хранилища */ }
  if (novaya) n += 1;
  try { sessionStorage.setItem(klyuch, String(n)); } catch { /* нет хранилища */ }
  return n;
}

async function otkrytOplatu(kontejner, zakaz, novaya = false) {
  const mesto = kontejner.querySelector('.gotovo__forma');
  if (!mesto) return;
  const popytka = popytkaOplaty(zakaz.zakazId, novaya);
  ubratFormu();
  mesto.innerHTML = '<p class="gotovo__zhdem">Открываем форму оплаты…</p>';
  let token;
  let Vidzhet;
  try {
    [{ token }, Vidzhet] = await Promise.all([tokenOplaty(zakaz.zakazId, popytka), vidzhetYukassy()]);
  } catch (oshibka) {
    neVyshlo(kontejner, zakaz, String(oshibka?.message || 'Форма оплаты не открылась'));
    return;
  }
  if (!mesto.isConnected) return;
  mesto.innerHTML = '<div id="yukassa-forma"></div>';
  forma = new Vidzhet({
    confirmation_token: token,
    error_callback: (o) => { console.warn('ЮKassa', o); neVyshlo(kontejner, zakaz, 'Форма оплаты не открылась'); },
  });
  forma.on('success', () => {
    ubratFormu();
    yadro.korzina.otmetitOplatu();
    vibro([10, 40, 20]);
    mesto.innerHTML = '<div class="gotovo__oplacheno"><b>Оплачено</b><span>Заказ ушёл на кухню. Спасибо!</span></div>';
    const plashka = kontejner.querySelector('.gotovo__demo');
    if (plashka) plashka.innerHTML = '<b>Заказ принят и оплачен</b><p>Позвоним по телефону из заказа, если что-то закончилось.</p>';
    const shag = [...kontejner.querySelectorAll('.gotovo__shag b')].find((b) => b.textContent === 'Оплата картой онлайн');
    if (shag) { shag.textContent = 'Оплачено картой онлайн'; shag.nextElementSibling.textContent = 'Заказ ушёл на кухню'; }
    personazh?.pryg();
    personazh?.skazat('Оплачено!', 3200);
  });
  forma.on('fail', () => { ubratFormu(); neVyshlo(kontejner, zakaz, 'Оплата не прошла'); });
  forma.render('yukassa-forma');
  // запасной выход: у гостя не открывается yoomoney.ru в рамке (29.10.2026 так было на Redmi) — оплата на странице ЮKassa
  tajmery.push(setTimeout(() => {
    if (!mesto.isConnected || !mesto.querySelector('#yukassa-forma') || mesto.querySelector('[data-sayt-yukassy]')) return;
    mesto.insertAdjacentHTML('beforeend', '<button class="knopka knopka--tihaya gotovo__zapas" type="button" data-sayt-yukassy>Форма не открылась? Оплатить на странице ЮKassa</button>');
    const k = mesto.querySelector('[data-sayt-yukassy]');
    nazhatie(k, { masshtab: 0.96 });
    k.addEventListener('click', async () => {
      try {
        const { url } = await oplatitOnlayn(zakaz.zakazId, location.href);
        // вернувшись с ЮKassa, гость не должен увидеть форму снова и заплатить второй раз
        try { sessionStorage.setItem(`oplata-na-sayte-${zakaz.zakazId}`, '1'); } catch { /* без хранилища — форма покажется снова */ }
        if (url) location.href = url;
      } catch (o) { yadro.tost(String(o?.message || 'Оплата не открылась — оплатите при получении'), { vid: 'oshibka' }); }
    });
  }, 12000));
}

function neVyshlo(kontejner, zakaz, prichina) {
  const mesto = kontejner.querySelector('.gotovo__forma');
  if (!mesto) return;
  ubratFormu();
  mesto.innerHTML = `
    <div class="preduprezhdenie" style="text-align:left">
      <b>${tekst(prichina)}</b>
      <p>Деньги не списаны. Попробуйте ещё раз или оплатите при получении — заказ уже у кассира.</p>
      <div class="preduprezhdenie__knopki"><button class="knopka knopka--glavnaya" type="button" data-snova>Оплатить ещё раз</button></div>
    </div>`;
  const snova = mesto.querySelector('[data-snova]');
  nazhatie(snova, { masshtab: 0.96 });
  snova.addEventListener('click', () => otkrytOplatu(kontejner, zakaz, true));
}

function sozdatPersonazha(kontejner, nastroenie, fraza) {
  const mesto = kontejner.querySelector('.gotovo__hinkalik');
  if (!mesto) return;
  try {
    personazh = new Hinkalik(mesto, { razmer: 140, plavayushchiy: false, nastroenie, podpis: 'Хинкалик' });
    if (nastroenie === 'rad') {
      tajmery.push(setTimeout(() => personazh?.pryg(), 320));
      tajmery.push(setTimeout(() => personazh?.pryg(), 1100));
    }
    if (fraza) tajmery.push(setTimeout(() => personazh?.skazat(fraza, 4200), 600));
    personazh.naNazhatie?.(() => { personazh?.pryg(); vibro(8); });
  } catch { /* без персонажа экран всё равно понятен */ }
}

export function ubrat() {
  ubratFormu();
  tajmery.forEach((t) => clearTimeout(t));
  tajmery = [];
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
}
