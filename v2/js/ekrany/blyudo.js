// Витрина Хинкальной v2 — карточка блюда: шторка, которая вырастает из плитки (FLIP).
// Фото без фона на градиенте семейства, название, описание, вес/время/ккал, состав,
// добавки чипами (если есть в базе), «к этому берут», степпер и кнопка
// «В корзину · N ₽» с прокруткой цифр; при добавлении — полёт в корзину.

import { shtorka, flip, pokazatChislo, nazhatie, pruzhina, dvizhenieSnyato, vibro } from '../dvizhenie.js';
import { naytiBlyudo, kEtomuBerut, gdeDostupno, cenaRaznitsya } from '../dannye.js';
import { tekst, chislo, znakRazdela, tenObekta, metaBlyuda, miniKartochka, TONKIY } from '../kartochka.js';

let yadro = null;
let upr = null;
let otpiski = [];
let zakryvaemSami = false;

const ZNAKI_META = ['#ik-ves', '#ik-chasy', '#ik-plamya'];

/** Текст для сравнения состава и описания: без регистра, пробелов и точек. */
const prostoy = (s) => String(s || '').toLowerCase().replace(/[\s.,;]+/g, ' ').trim();

/**
 * Комбо-набор: своего вырезанного фото нет (в базе рекламный баннер с надписями),
 * поэтому собираем коллаж из вырезок блюд, которые на этом баннере видны: шашлык,
 * хачапури, хинкали спереди. Фото только из меню, без генерации; блюда без фото пропускаем.
 * @returns {string} разметка коллажа или '' (тогда остаётся знак раздела)
 */
function kollazhNabora(menyu) {
  const iskat = (reRazdel, reBlyudo) => {
    const r = menyu.razdely.find((x) => reRazdel.test(x.nazvanie));
    const s = (r?.blyuda || []).filter((b) => b.foto);
    return s.find((b) => reBlyudo.test(b.nazvanie)) || s[0] || null;
  };
  const chasti = [
    { b: iskat(/шашлык/i, /шейк/i), st: 'left:-8%;top:2%;width:58%;transform:rotate(-9deg);z-index:1' },
    { b: iskat(/пирог/i, /имерет|аджар/i), st: 'right:-4%;top:0;width:58%;transform:rotate(8deg);z-index:2' },
    { b: iskat(/хинкали/i, /баранин|говяд/i), st: 'left:0;bottom:-3%;width:52%;transform:rotate(-3deg);z-index:3' },
  ].filter((c) => c.b);
  if (chasti.length < 2) return '';
  return chasti.map(({ b, st }) => `<img class="kollazh__foto" alt="" aria-hidden="true" src="${tekst(b.foto)}" decoding="async" draggable="false"
    style="position:absolute;${st};height:auto;opacity:1;object-fit:contain;filter:drop-shadow(0 16px 12px ${tenObekta(b.cvet)})">`).join('');
}

/** «На 5 персон» из названия набора («Для дружной пятёрки»); не распознали — null. */
function personyNabora(nazvanie) {
  const slova = [[/двоих|пар[ау]/i, 2], [/тро(их|йк)/i, 3], [/четвер|четырёх/i, 4], [/пят(ер|ёр|и)/i, 5], [/шест/i, 6], [/вос[ье]м/i, 8], [/десят/i, 10]];
  const n = slova.find(([re]) => re.test(nazvanie || ''));
  return n ? n[1] : null;
}

export const nastroyki = { niz: true, hinkalik: true };

export function pokazat(kontejner, yadro_, parametry) {
  yadro = yadro_;
  zakryvaemSami = false;
  const blyudo = naytiBlyudo(yadro.menyu, parametry.id);
  if (!blyudo) {
    yadro.tost('Этого блюда больше нет в меню', { vid: 'oshibka' });
    setTimeout(() => yadro.nazad('#/'), 0);
    return;
  }
  const sem = yadro.semeystvo(blyudo.razdel);
  const prichina = yadro.prichina(blyudo);
  const cena = yadro.cena(blyudo);
  const zav = yadro.zavedenie();
  const meta = metaBlyuda(blyudo, sem);
  const dobavki = Array.isArray(blyudo.dobavki) ? blyudo.dobavki : [];
  const vybrannye = new Set();
  let kolichestvo = 1;

  const el = document.createElement('div');
  el.className = `shtorka shtorka--blyudo sem-${sem}`;
  el.setAttribute('aria-label', blyudo.nazvanie);
  el.style.setProperty('--ten-obekta', tenObekta(blyudo.cvet));
  const sFoto = Boolean(blyudo.foto) && sem !== 'kombo';
  const kollazh = sem === 'kombo' ? kollazhNabora(yadro.menyu) : '';
  const persony = sem === 'kombo' ? personyNabora(blyudo.nazvanie) : null;
  const nadpisNabora = sem === 'kombo' && (persony || blyudo.ves)
    ? `<div aria-hidden="true" style="position:absolute;right:calc(var(--polya) + 4px);bottom:16px;z-index:4;color:#fff;text-align:right;font:800 1.375rem/1.05 var(--sh-zag);letter-spacing:-.02em;text-shadow:0 1px 3px rgba(110,20,50,.4)">${persony ? `На ${persony} персон` : 'Набор'}${blyudo.ves ? `<small style="display:block;margin-top:5px;font:700 .75rem/1.2 var(--sh-tekst);letter-spacing:.06em;text-transform:uppercase;opacity:.92">${chislo(blyudo.ves)}${TONKIY}г на стол</small>` : ''}</div>`
    : '';

  let nedostupno = '';
  if (prichina) {
    const gde = gdeDostupno(blyudo, yadro.menyu).map((z) => z.nazvanie);
    const zdes = zav ? `в заведении «${tekst(zav.nazvanie)}»` : 'сейчас';
    const pervaya = prichina === 'stop' ? `Сегодня закончилось ${zdes}.` : `${zav ? `В заведении «${tekst(zav.nazvanie)}»` : 'Здесь'} такого нет.`;
    nedostupno = `<div class="shtorka__nedostupno">${pervaya}${gde.length ? ` Есть: ${tekst(gde.slice(0, 4).join(', '))}${gde.length > 4 ? ' и ещё ' + (gde.length - 4) : ''}.` : ''}</div>`;
  }

  el.innerHTML = `
    <div class="shtorka__ruchka shtorka__ruchka--na-foto" data-ruchka></div>
    <button class="shtorka__zakryt" type="button" aria-label="Закрыть"><svg aria-hidden="true"><use href="#ik-zakryt"/></svg></button>
    <div class="shtorka__telo">
      <div class="shtorka__foto${kollazh ? ' s-foto' : ''}">
        <div class="shtorka__foto-vnutri">
          <div class="shtorka__kvadrat">
            <div class="plitka__znak" aria-hidden="true"><svg><use href="${znakRazdela(blyudo.razdel, sem)}"/></svg></div>
            ${sFoto ? `<img alt="${tekst(blyudo.nazvanie)}" src="${tekst(blyudo.foto)}" decoding="async" draggable="false">` : ''}
            ${kollazh}
          </div>
        </div>
        ${nadpisNabora}
      </div>
      <div class="shtorka__razdel">${tekst(blyudo.razdel?.nazvanie?.replace(/[‑]/g, '-') || '')}</div>
      <h2 class="shtorka__zagolovok">${tekst(blyudo.nazvanie)}</h2>
      ${blyudo.opisanie ? `<p class="shtorka__opisanie">${tekst(blyudo.opisanie)}</p>` : ''}
      ${meta.length ? `<div class="shtorka__meta">${meta.map((m, i) => `<span><svg aria-hidden="true"><use href="${ZNAKI_META[Math.min(i, 2)]}"/></svg>${m}</span>`).join('')}</div>` : ''}
      <div class="shtorka__cena">
        <span class="cena"><span class="cena__chislo">${chislo(cena)}</span><span class="rub">${TONKIY}₽</span>${!zav && cenaRaznitsya(blyudo) ? '<small class="cena__utochnit">цена по заведению</small>' : ''}</span>
      </div>
      ${nedostupno}
      ${blyudo.sostav && prostoy(blyudo.sostav) !== prostoy(blyudo.opisanie) ? `<div class="shtorka__sostav"><b>Состав</b>${tekst(blyudo.sostav)}</div>` : ''}
      ${!blyudo.sostav && !blyudo.opisanie && sem === 'kombo' ? `<div class="shtorka__sostav"><b>Что в наборе</b>Хачапури, хинкали, шашлык, салат, закуски и морс — стол${persony ? ` на компанию из ${['', '', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', '', 'восьми', '', 'десяти'][persony] || persony} человек` : ' на компанию'}. Точный набор блюд подскажет заведение.</div>` : ''}
      ${dobavki.length ? `<div class="metka">Добавить</div><div class="chipy">${dobavki.map((d) => `<button class="chip-dobavka" type="button" data-dobavka="${tekst(d.id)}">${tekst(d.nazvanie)}<span class="plus-cena">+${chislo(d.cena)}${TONKIY}₽</span></button>`).join('')}</div>` : ''}
      <div class="k-etomu" hidden><div class="metka">К этому берут</div><div class="ryad"></div></div>
    </div>
    <div class="shtorka__niz"></div>`;
  kontejner.appendChild(el);

  // Фото: пока грузится — виден знак раздела (s-foto ставим только по загрузке,
  // иначе на медленной сети сверху пустой градиент); ошибка — знак остаётся
  const img = el.querySelector('.shtorka__foto img:not(.kollazh__foto)');
  if (img) {
    const gotovo = () => { img.classList.add('zagruzheno'); el.querySelector('.shtorka__foto').classList.add('s-foto'); };
    img.addEventListener('load', gotovo, { once: true });
    img.addEventListener('error', () => { el.querySelector('.shtorka__foto').classList.remove('s-foto'); img.remove(); }, { once: true });
    if (img.complete && img.naturalWidth) gotovo();
  }

  // Низ шторки: степпер + «В корзину · N ₽», или путь, если блюда здесь нет
  const niz = el.querySelector('.shtorka__niz');
  let summaEl = null;
  if (prichina) {
    niz.innerHTML = '<a class="knopka knopka--steklo" href="#/adres" style="flex:1"><svg width="22" height="22" aria-hidden="true"><use href="#ik-bulavka"/></svg><span>Другое заведение</span></a>';
  } else {
    niz.innerHTML = `
      <div class="stepper stepper--vsegda stepper--steklo" role="group" aria-label="Количество">
        <button type="button" data-shag="-1" aria-label="Меньше"><svg aria-hidden="true"><use href="#ik-minus"/></svg></button>
        <b>1</b>
        <button type="button" data-shag="1" aria-label="Больше"><svg aria-hidden="true"><use href="#ik-plus"/></svg></button>
      </div>
      <button class="knopka knopka--glavnaya" type="button" data-v-korzinu><span>В корзину</span><span class="summa"><span class="summa-v">${chislo(cena)}</span>${TONKIY}₽</span></button>`;
    summaEl = niz.querySelector('.summa-v');
    const schet = niz.querySelector('.stepper b');
    let pokazano = cena;
    const pereschitat = () => {
      const dop = dobavki.filter((d) => vybrannye.has(String(d.id))).reduce((s, d) => s + (Number(d.cena) || 0), 0);
      const itog = (cena + dop) * kolichestvo;
      pokazatChislo(summaEl, pokazano, itog, 420, (v) => chislo(v));
      pokazano = itog;
    };
    niz.querySelectorAll('.stepper button').forEach((k) => {
      nazhatie(k, { masshtab: 0.86 });
      k.addEventListener('click', () => {
        const shag = Number(k.dataset.shag);
        if (kolichestvo + shag < 1) {
          if (!dvizhenieSnyato()) schet.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 240 });
          return;
        }
        kolichestvo = Math.min(99, kolichestvo + shag);
        schet.textContent = String(kolichestvo);
        if (!dvizhenieSnyato()) schet.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
        vibro(6);
        pereschitat();
      });
    });
    el.querySelectorAll('.chip-dobavka').forEach((ch) => {
      nazhatie(ch, { masshtab: 0.94 });
      ch.addEventListener('click', () => {
        const id = ch.dataset.dobavka;
        if (vybrannye.has(id)) vybrannye.delete(id); else vybrannye.add(id);
        ch.classList.toggle('vybran', vybrannye.has(id));
        if (!dvizhenieSnyato()) ch.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
        pereschitat();
      });
    });
    const vKorzinu = niz.querySelector('[data-v-korzinu]');
    nazhatie(vKorzinu, { masshtab: 0.96 });
    // двойной тап не кладёт дважды: после первого нажатия кнопка глохнет до закрытия шторки
    // (флагом, а не disabled — иначе она посереет прямо в уезжающей шторке)
    let kladem = false;
    vKorzinu.addEventListener('click', () => {
      if (kladem || zakryvaemSami) return;
      kladem = true;
      vKorzinu.setAttribute('aria-disabled', 'true');
      const ot = el.querySelector('.shtorka__foto img.zagruzheno') || el.querySelector('.shtorka__kvadrat');
      const poz = yadro.dobavitVKorzinu(blyudo, { ot, kolichestvo, dobavki: [...vybrannye] });
      if (poz) zakryt('dobavleno');
      else { kladem = false; vKorzinu.removeAttribute('aria-disabled'); }
    });
  }
  niz.querySelectorAll('a.knopka').forEach((a) => nazhatie(a, { masshtab: 0.96 }));

  // «К этому берут» — из доступного здесь
  const sputniki = prichina ? [] : kEtomuBerut([{ blyudoId: blyudo.id, nazvanie: blyudo.nazvanie }], yadro.menyu, yadro.gost.zavedenieId, 4);
  if (sputniki.length) {
    const blok = el.querySelector('.k-etomu');
    const ryad = blok.querySelector('.ryad');
    sputniki.forEach((b) => ryad.appendChild(miniKartochka(b, yadro, {
      naNazhatie: (bb, pl) => yadro.perejti(`#/blyudo/${bb.id}`, { zamenit: true, istochnik: pl }),
    })));
    blok.hidden = false;
  }

  // Закрытие
  const knopkaZakryt = el.querySelector('.shtorka__zakryt');
  nazhatie(knopkaZakryt, { masshtab: 0.9 });
  knopkaZakryt.addEventListener('click', () => zakryt('knopka'));

  upr = shtorka(el, { cvetFona: 'rgba(60, 25, 10, .28)',
    naZakrytie: (prichinaZakrytiya) => {
      if (prichinaZakrytiya !== 'kod') yadro.nazad('#/');
    },
  });

  // Параллакс фото: при прокрутке тела уходит вверх на .35 и уменьшается до .85
  const telo = el.querySelector('.shtorka__telo');
  const vnutri = el.querySelector('.shtorka__foto-vnutri');
  if (!dvizhenieSnyato()) {
    let kadr = null;
    telo.addEventListener('scroll', () => {
      if (kadr) return;
      kadr = requestAnimationFrame(() => {
        kadr = null;
        const y = Math.max(0, telo.scrollTop);
        const m = Math.max(0.85, 1 - y / 900);
        vnutri.style.transform = `translate3d(0, ${(y * 0.35).toFixed(1)}px, 0) scale(${m.toFixed(3)})`;
        vnutri.style.opacity = String(Math.max(0.2, 1 - y / 420));
      });
    }, { passive: true });
  }

  // FLIP: плитка карточки вырастает в шапку шторки, пока шторка едет снизу
  const istochnik = parametry.istochnik;
  const kvadrat = el.querySelector('.shtorka__kvadrat');
  if (istochnik && istochnik.isConnected && !dvizhenieSnyato()) {
    const ot = istochnik.querySelector?.('img.zagruzheno') || istochnik;
    const r = kvadrat.getBoundingClientRect();
    const vysota = el.getBoundingClientRect().height;
    const doRect = new DOMRect(r.left, r.top - vysota, r.width, r.height);
    flip(ot, kvadrat, { klon: true, do: doRect, ms: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing, radiusOt: '20px' });
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
  const u = upr;
  upr = null;
  if (!u) return undefined;
  const p = u.otkryta ? u.zakryt('kod') : Promise.resolve();
  return p.then(() => u.unichtozhit());
}
