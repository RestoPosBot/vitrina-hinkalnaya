// Витрина Хинкальной v2 — «Заказ принят» (маршрут #/gotovo/<номер>).
// Хинкалик 140 px радуется и подпрыгивает, номер заказа градиентом, что дальше
// (сколько готовим, где забрать / куда везём), список и итог, «К меню» и «Повторить
// заказ». Заказ уже создан в Resto Postbot и записан как «прошлый заказ».
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { flip, nazhatie, pruzhina, dvizhenieSnyato, vibro, poyavlenieKaskadom } from '../dvizhenie.js';
import { naytiZavedenie, perenestiKorzinu } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { tekst, rub, TONKIY, strokaPozicii } from '../kartochka.js';

export const nastroyki = { niz: false, hinkalik: false, palitra: 'gotovo' };

let yadro = null;
let personazh = null;
let tajmery = [];

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
  // Заказ настоящий: он создан в Resto Postbot и виден на кухне заведения.
  let chtoDalshe;
  if (kogda.tip === 'ko_vremeni') chtoDalshe = dostavka ? `Привезём ${tekst(kogda.podpis)}` : `Будет готово ${tekst(kogda.podpis)}`;
  else chtoDalshe = dostavka ? `Готовим ~${kogda.minut || 20}${TONKIY}мин, потом везём` : `Готовим ~${kogda.minut || 20}${TONKIY}минут`;
  const gde = dostavka
    ? `<b>Адрес доставки</b><span>${tekst(zakaz.adres?.tekst || 'адрес из заказа')}</span>${zav ? `<small>Заведение: ${tekst(zav.nazvanie)}</small>` : ''}`
    : `<b>Самовывоз из «${tekst(zav?.nazvanie || zakaz.zavedenieNazvanie || 'заведения')}»</b>${zav ? `<span>${tekst([zav.adres, zav.metro].filter(Boolean).join(' · '))}</span>` : ''}`;
  const plashka = bezSeti
    ? '<b>Сети не было — заказ сохранён только на этом телефоне</b><p>В заведение он не ушёл. Как появится сеть, соберите его заново кнопкой «Повторить заказ».</p>'
    : '<b>Заказ принят</b><p>Он уже на кухне заведения. Позвоним по телефону из заказа, если что-то закончилось.</p>';

  kontejner.innerHTML = `
    <div class="gotovo__hinkalik"></div>
    <h1 class="ekran__zagolovok">${bezSeti ? 'Заказ сохранён' : 'Заказ оформлен'}</h1>
    <div class="kartochka-belaya gotovo__kartochka">
      <div class="gotovo__podpis">Номер заказа</div>
      <div class="gotovo__nomer"><small>№</small>${tekst(nomer)}</div>
      <div class="preduprezhdenie gotovo__demo" style="margin-top:14px;text-align:left">${plashka}</div>
      <div class="gotovo__shagi">
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-chasy"/></svg></span><div><b>${chtoDalshe}</b><span>${zakaz.imya ? `${tekst(zakaz.imya)}, ` : ''}${zakaz.telefon ? `позвонили бы на ${tekst(zakaz.telefon)}, если что-то закончится` : 'позвонили бы, если что-то закончится'}</span></div></div>
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-${dostavka ? 'dostavka' : 'bulavka'}"/></svg></span><div>${gde}</div></div>
        <div class="gotovo__shag"><span class="gotovo__znak"><svg aria-hidden="true"><use href="#ik-sumka"/></svg></span><div><b>Оплата при получении</b><span>Картой или наличными</span></div></div>
      </div>
    </div>
    <div class="metka">Что в заказе</div>
    <div class="kartochka-belaya gotovo__spisok">
      <div class="gotovo__pozicii"></div>
      ${skidka?.rub ? `<div class="korzina__stroka korzina__skidka" style="padding-top:10px"><span>Ваша скидка −${skidka.procent}${TONKIY}%</span><span>−${rub(skidka.rub)}</span></div>` : ''}
      <div class="itog"><span>Итого</span><b class="itog__summa">${rub(skidka?.rub ? skidka.itogo : zakaz.summa)}</b></div>
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

  sozdatPersonazha(kontejner, 'rad', bezSeti ? 'Сохранил на телефоне' : 'Вот так это будет');

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
  tajmery.forEach((t) => clearTimeout(t));
  tajmery = [];
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
}
