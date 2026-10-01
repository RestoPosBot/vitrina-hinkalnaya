// Витрина Хинкальной v2 — главная: шапка с заведением, поиск, сторис, «Акция дня»,
// бегущая строка, липкая лента разделов с бегущей таблеткой, разделы с параллаксом
// заголовков и сеткой карточек 2 в ряд, плитка «Банкеты». Живёт всё время
// (ядро прячет её, а не удаляет) — поэтому pauza()/prodolzhit().

import { nazhatie, nablyudatRazdely, pruzhina, dvizhenieSnyato, parallaks } from '../dvizhenie.js';
import { statusRezhima, populyarnye } from '../dannye.js';
import { zagruzitIstorii, krugIstorii, pokazatIstorii } from '../istorii.js';
import { svgHinkalika } from '../hinkalik.js';
import { kartochka, obnovitKartochku, tekst, rub, chislo, znakRazdela } from '../kartochka.js';

/** Подписи семейств для метки над заголовком (DIZAYN §2.2). */
const PODPISI_SEMEYSTV = { testo: 'из теста', zhar: 'на огне', zelen: 'свежее', sladkoe: 'сладкое', napitki: 'напитки', kombo: 'наборы' };

let yadro = null;
let koren = null;
let otpiski = [];
let otklyuchitNablyudatel = null;
let tajmerPodskazki = null;
let nablyudatelKartochek = null;
let nablyudatelZagolovkov = null;
let vidimyeZagolovki = new Set();
let kadrParallaksa = null;
let lentaZanyataDo = 0;
let aktivnyyRazdel = null;
let posledneeZavedenie = undefined;
let naPauze = false;
let otmenaParallaksaBannera = null;

/** Склонение: 1 блюдо, 2 блюда, 5 блюд. */
function sklon(n, [odin, dva, pyat]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return pyat;
  if (b > 1 && b < 5) return dva;
  if (b === 1) return odin;
  return pyat;
}

/** Размер заголовка раздела по длине (DIZAYN §3.6). */
function klassZagolovka(nazvanie) {
  const n = Array.from(nazvanie).length;
  if (n <= 8) return '';
  if (n <= 11) return 'sredniy';
  return 'dlinnyy';
}

/** Разделы, которые показываем: непустые; при выбранном заведении — где есть хоть что-то доступное. */
function vidimyeRazdely() {
  return (yadro.menyu.razdely || []).filter((r) => {
    if (!r.blyuda || !r.blyuda.length) return false;
    if (!yadro.gost.zavedenieId) return true;
    return r.blyuda.some((b) => yadro.prichina(b) !== 'net');
  });
}

/** Блюда раздела: доступные первыми, недоступные — в конце, приглушённые. */
function blyudaRazdela(razdel) {
  const dostupnye = [];
  const net = [];
  for (const b of razdel.blyuda) (yadro.prichina(b) ? net : dostupnye).push(b);
  return dostupnye.concat(net);
}

// ---------------------------------------------------------------------------
// Шапка
// ---------------------------------------------------------------------------

function narisovatShapku(shapka) {
  const z = yadro.zavedenie();
  const g = yadro.gost;
  let status;
  if (z) {
    // готовая строка из dannye. Часы в базе по умолчанию (все 7 заведений) — строку статуса
    // не рисуем вовсе: «часы уточняйте» под каждым названием выглядит недоделкой. Остаётся метро.
    const s = statusRezhima(z);
    if (!s.izvestno) status = z.metro ? `<span>${tekst(z.metro)}</span>` : '';
    else status = s.otkryto
      ? `<i class="tochka"></i><span>${tekst(s.tekst)}</span>`
      : `<i class="tochka zakryto"></i><span>${tekst(s.tekst)} — оформим ко времени</span>`;
  } else {
    const n = yadro.menyu.zavedeniya.length;
    status = `<i class="tochka net"></i><span>${n} ${sklon(n, ['заведение', 'заведения', 'заведений'])} · выберите своё</span>`;
  }
  const dostavka = g.sposob === 'dostavka';
  const adresStroka = dostavka && g.adres?.tekst ? `<span class="mesto__adres">${tekst(g.adres.tekst)}</span>` : '';
  const sposobTekst = g.sposob === 'dostavka' ? 'Доставка' : g.sposob === 'samovyvoz' ? 'Самовывоз' : 'Получение';
  shapka.querySelector('.shapka__verh').innerHTML = `
    <button class="mesto" type="button" aria-label="Сменить заведение">
      <span class="mesto__set">Хинкальная</span>
      <span class="mesto__nazvanie"><span>${tekst(z ? z.nazvanie : 'Выберите заведение')}</span><svg aria-hidden="true"><use href="#ik-vniz"/></svg></span>
      ${adresStroka}
      ${status ? `<span class="mesto__status">${status}</span>` : ''}
    </button>
    <button class="chip" type="button" aria-label="Способ получения: ${sposobTekst}">
      <svg aria-hidden="true"><use href="${dostavka ? '#ik-dostavka' : '#ik-sumka'}"/></svg>${sposobTekst}
    </button>`;
  const mesto = shapka.querySelector('.mesto');
  nazhatie(mesto, { masshtab: 0.97 });
  mesto.addEventListener('click', () => yadro.perejti('#/adres', { istochnik: mesto.querySelector('.mesto__nazvanie') }));
  const chip = shapka.querySelector('.chip');
  nazhatie(chip, { masshtab: 0.93 });
  chip.addEventListener('click', vybratSposob);
}

function vybratSposob() {
  const g = yadro.gost;
  yadro.malayaShtorka({
    zagolovok: 'Как получите заказ?',
    tekst: 'Самовывоз — без минимальной суммы. Доставка — от ' + rub(yadro.minZakaz()) + '.',
    knopki: [
      { tekst: 'Заберу сам', znak: '#ik-sumka', klass: g.sposob === 'samovyvoz' ? 'knopka--glavnaya knopka--60' : 'knopka--steklo knopka--60', naNazhatie: () => yadro.obnovitGostya({ sposob: 'samovyvoz' }) },
      {
        tekst: 'Доставка',
        znak: '#ik-dostavka',
        klass: g.sposob === 'dostavka' ? 'knopka--glavnaya knopka--60' : 'knopka--steklo knopka--60',
        naNazhatie: () => {
          yadro.obnovitGostya({ sposob: 'dostavka' });
          if (!yadro.gost.adres) setTimeout(() => yadro.perejti('#/adres'), 320);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Поиск с живой подсказкой
// ---------------------------------------------------------------------------

function sdelatPoisk() {
  const knopka = document.createElement('button');
  knopka.type = 'button';
  knopka.className = 'poisk';
  knopka.setAttribute('aria-label', 'Поиск по меню');
  const imena = populyarnye(yadro.menyu, yadro.gost.zavedenieId, 6).map((b) => b.nazvanie);
  knopka.innerHTML = `<svg aria-hidden="true"><use href="#ik-poisk"/></svg><span class="poisk__pole"><span class="poisk__podskazka">${tekst(imena[0] || 'Хинкали')}</span></span>`;
  nazhatie(knopka, { masshtab: 0.98, vibro: false });
  knopka.addEventListener('click', () => yadro.perejti('#/poisk', { istochnik: knopka }));
  const podskazka = knopka.querySelector('.poisk__podskazka');
  let i = 0;
  if (!dvizhenieSnyato() && imena.length > 1) {
    tajmerPodskazki = setInterval(() => {
      if (naPauze || document.hidden) return;
      i = (i + 1) % imena.length;
      podskazka.textContent = imena[i];
      podskazka.classList.remove('smena');
      void podskazka.offsetWidth;
      podskazka.classList.add('smena');
    }, 2800);
  }
  return knopka;
}

// ---------------------------------------------------------------------------
// Сторис, баннер, бегущая строка
// ---------------------------------------------------------------------------

function vypolnitDeystvie(d) {
  if (!d) return;
  if (d.tip === 'razdel') prokrutitKRazdelu(d.id);
  else if (d.tip === 'blyudo') yadro.perejti(`#/blyudo/${d.id}`);
  else if (d.tip === 'ssylka' && d.id) {
    if (String(d.id).startsWith('#/')) yadro.perejti(d.id);
    else window.open(d.id, '_blank', 'noopener');
  }
}

async function narisovatIstorii(ryad, mestoBannera) {
  const spisok = await zagruzitIstorii();
  if (!koren || !spisok.length) { ryad.hidden = true; mestoBannera.remove(); return; }
  const otkryt = (i) => pokazatIstorii(spisok, i, { naDeystvie: (d) => vypolnitDeystvie(d) });
  spisok.forEach((ist, i) => {
    const krug = krugIstorii(ist);
    krug.addEventListener('click', () => otkryt(i));
    ryad.appendChild(krug);
  });
  // «Акция дня»: первая сторис с действием
  const indeks = spisok.findIndex((s) => s.deystvie);
  if (indeks < 0) { mestoBannera.remove(); return; }
  const ist = spisok[indeks];
  const sem = ['testo', 'zhar', 'zelen', 'sladkoe', 'napitki', 'kombo'].includes(ist.cvet) ? ist.cvet : 'zhar';
  const banner = document.createElement('div');
  banner.className = `banner sem-${sem}${sem === 'kombo' ? ' banner--svetlyy' : ''}`;
  banner.style.setProperty('--gr', `var(--gr-${sem})`);
  // Сам баннер — не кнопка: внутри уже есть настоящая кнопка, а вложенные
  // интерактивные элементы ломают читалку и клавиатуру (Enter на кнопке всплывал
  // в баннер и открывал сторис). Тап по баннеру мимо кнопки открывает сторис —
  // для пальца; с клавиатуры сторис открываются кружком в ряду выше.
  banner.innerHTML = `
    <div class="banner__metka"><svg aria-hidden="true"><use href="#ik-zvezda"/></svg>Акция дня</div>
    <div class="banner__zagolovok">${tekst(ist.zagolovok)}</div>
    <div class="banner__tekst">${tekst(ist.tekst || '')}</div>
    <button class="banner__knopka" type="button">${tekst(ist.knopka || 'Смотреть')}<svg aria-hidden="true"><use href="#ik-strelka"/></svg></button>
    <div class="banner__sloy" aria-hidden="true"><div class="banner__personazh">${svgHinkalika({ nastroenie: 'rad' })}</div></div>`;
  nazhatie(banner, { masshtab: 0.97, vibro: false });
  banner.addEventListener('click', (s) => {
    if (s.target.closest('.banner__knopka')) { vypolnitDeystvie(ist.deystvie); return; }
    otkryt(indeks);
  });
  nazhatie(banner.querySelector('.banner__knopka'), { masshtab: 0.92 });
  mestoBannera.replaceWith(banner);
  // персонаж на баннере чуть отстаёт от прокрутки
  // главная прокручивается окном — предка-скроллера не ищем (getComputedStyle по цепочке)
  otmenaParallaksaBannera = parallaks(banner.querySelector('.banner__sloy'), 0.75, { predel: 40, kontejner: window });
}

function sdelatBegushchuyu() {
  // продающие слова про еду и условия, а не внутренние счётчики проекта.
  // Цифры только из данных: «от» — самая низкая цена хинкали в выбранном заведении.
  // Минимальной суммы доставки и скидки самовывоза в базе нет — их не выдумываем.
  const m = yadro.menyu;
  const otCeny = (re) => {
    const r = m.razdely.find((x) => re.test(x.nazvanie));
    if (!r) return null;
    const c = Math.min(...r.blyuda.filter((b) => !yadro.prichina(b)).map((b) => yadro.cena(b)).filter((c) => c > 0));
    return Number.isFinite(c) ? c : null;
  };
  const ot = otCeny(/хинкали/i);
  const chasti = [
    ot ? `хинкали от <em>${chislo(ot)}&#8239;₽</em>` : 'хинкали ручной лепки',
    'хачапури <em>из печи</em>',
    'шашлык <em>на углях</em>',
    'супы, салаты, закуски',
    'самовывоз и доставка',
  ];
  const stroka = chasti.join(' · ') + ' · ';
  const el = document.createElement('div');
  el.className = 'begushchaya';
  el.setAttribute('aria-hidden', 'true');
  // 11 px читались мелко — 13 px (правило размера в stil.css чужое, переопределяем на месте)
  const st = 'font-size:0.8125rem';
  el.innerHTML = `<span class="begushchaya__tekst" style="${st}">${stroka}</span><span class="begushchaya__tekst" style="${st}">${stroka}</span>`;
  return el;
}

// ---------------------------------------------------------------------------
// Лента разделов с бегущей таблеткой (DIZAYN §3.5, код Б)
// ---------------------------------------------------------------------------

function narisovatLentu(lenta, razdely) {
  const vnutri = lenta.querySelector('.lenta__vnutri');
  vnutri.innerHTML = '<i class="lenta__tabletka" aria-hidden="true"></i>';
  for (const r of razdely) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tabletka';
    b.textContent = r.nazvanie.replace(/[‑]/g, '-');
    b.dataset.razdel = r.id;
    nazhatie(b, { masshtab: 0.92 });
    b.addEventListener('click', () => {
      lentaZanyataDo = performance.now() + 1100;
      vybratRazdel(r.id, true);
      prokrutitKRazdelu(r.id);
    });
    vnutri.appendChild(b);
  }
  aktivnyyRazdel = null;
  // Таблетку ставим в следующем кадре: offsetLeft сразу после пересборки сотни карточек
  // заставил бы браузер пересчитать весь макет синхронно (на слабом телефоне — секунды)
  if (razdely[0]) {
    const id = razdely[0].id;
    requestAnimationFrame(() => { if (!aktivnyyRazdel) vybratRazdel(id, false); });
  }
}

function vybratRazdel(id, plavno) {
  if (!koren) return;
  const lenta = koren.querySelector('.lenta');
  const vnutri = lenta.querySelector('.lenta__vnutri');
  const tabletka = vnutri.querySelector('.lenta__tabletka');
  const knopki = [...vnutri.querySelectorAll('.tabletka')];
  const cel = knopki.find((k) => k.dataset.razdel === id);
  if (!cel) return;
  const smena = aktivnyyRazdel !== id;
  aktivnyyRazdel = id;
  knopki.forEach((k) => k.classList.toggle('aktivna', k === cel));
  const x = cel.offsetLeft;
  const w = cel.offsetWidth;
  const bylo = tabletka.getBoundingClientRect();
  tabletka.style.width = `${w}px`;
  tabletka.style.transform = `translateX(${x}px)`;
  if (plavno && smena && !dvizhenieSnyato() && bylo.width) {
    const stalo = tabletka.getBoundingClientRect();
    const dx = bylo.left - stalo.left;
    const sw = bylo.width / stalo.width;
    tabletka.animate(
      [{ transform: `translateX(${x + dx}px) scaleX(${sw})` }, { transform: `translateX(${x}px) scaleX(1)` }],
      { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing },
    );
  }
  const celevoy = Math.max(0, x - lenta.clientWidth / 2 + w / 2);
  lenta.scrollTo({ left: celevoy, behavior: plavno && !dvizhenieSnyato() ? 'smooth' : 'auto' });
  // фон плывёт к палитре раздела
  if (smena && yadro.marshrut?.imya === 'glavnaya') {
    const razdel = yadro.menyu.razdely.find((r) => r.id === id);
    if (razdel) yadro.palitra(yadro.semeystvo(razdel));
  }
}

function prokrutitKRazdelu(id) {
  const sekciya = koren?.querySelector(`section.razdel[data-razdel="${CSS.escape(id)}"]`);
  if (!sekciya) return;
  lentaZanyataDo = performance.now() + 1100;
  vybratRazdel(id, true);
  const lenta = koren.querySelector('.lenta');
  const y = sekciya.getBoundingClientRect().top + window.scrollY - lenta.offsetHeight + 16;
  window.scrollTo({ top: Math.max(0, y), behavior: dvizhenieSnyato() ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------------------
// Разделы и карточки
// ---------------------------------------------------------------------------

function narisovatRazdely(mesto, bezAnimacii = false) {
  if (nablyudatelKartochek) nablyudatelKartochek.disconnect();
  if (nablyudatelZagolovkov) nablyudatelZagolovkov.disconnect();
  vidimyeZagolovki = new Set();
  // при пересборке готовые карточки переиспользуем: создать заново 130 плиток с фото — сотни мс на слабом телефоне
  const gotovye = bezAnimacii ? new Map([...mesto.querySelectorAll('.kartochka')].map((k) => [k.dataset.blyudo, k])) : new Map();
  mesto.innerHTML = '';
  const razdely = vidimyeRazdely();
  let schetchik = 0;
  for (const r of razdely) {
    const sem = yadro.semeystvo(r);
    const sekciya = document.createElement('section');
    sekciya.className = `razdel sem-${sem}`;
    sekciya.dataset.razdel = r.id;
    sekciya.id = `razdel-${r.id}`;
    const blyuda = blyudaRazdela(r);
    const dostupno = blyuda.filter((b) => !yadro.prichina(b)).length;
    const imya = r.nazvanie.replace(/[‑]/g, '-');
    sekciya.innerHTML = `
      <header class="zagolovok">
        <div class="zagolovok__dvizh">
          <div class="zagolovok__pod">${podpisRazdela(sem, dostupno)}</div>
          <h2 class="${klassZagolovka(imya)}">${tekst(imya)}</h2>
        </div>
      </header>
      <div class="setka"></div>`;
    const setka = sekciya.querySelector('.setka');
    blyuda.forEach((b, i) => {
      let k = gotovye.get(String(b.id));
      if (k) obnovitKartochku(k, yadro);
      else k = kartochka(b, yadro, schetchik + i);
      if (bezAnimacii) k.classList.add('byla');
      setka.appendChild(k);
    });
    schetchik += blyuda.length;
    mesto.appendChild(sekciya);
  }

  // Каскад: карточки всплывают, когда доезжают до экрана; не больше 8 в очереди
  if (!bezAnimacii && typeof IntersectionObserver === 'function') {
    let ochered = 0;
    let sbros = null;
    nablyudatelKartochek = new IntersectionObserver((zapisi) => {
      for (const z of zapisi) {
        if (!z.isIntersecting) continue;
        const el = z.target;
        nablyudatelKartochek.unobserve(el);
        el.style.setProperty('--i', String(Math.min(ochered, 8)));
        ochered += 1;
        el.classList.add('pokazana');
      }
      clearTimeout(sbros);
      sbros = setTimeout(() => { ochered = 0; }, 120);
    }, { rootMargin: '0px 0px 60px 0px', threshold: 0.05 });
    mesto.querySelectorAll('.kartochka').forEach((k) => nablyudatelKartochek.observe(k));
  } else {
    mesto.querySelectorAll('.kartochka').forEach((k) => k.classList.add('byla'));
  }

  // Параллакс заголовков — только у видимых
  if (typeof IntersectionObserver === 'function' && !dvizhenieSnyato()) {
    nablyudatelZagolovkov = new IntersectionObserver((zapisi) => {
      for (const z of zapisi) {
        const el = z.target.querySelector('.zagolovok__dvizh');
        if (z.isIntersecting) vidimyeZagolovki.add(el);
        else { vidimyeZagolovki.delete(el); }
      }
      zaprositParallaks();
    }, { rootMargin: '80px 0px 80px 0px' });
    mesto.querySelectorAll('.zagolovok').forEach((z) => nablyudatelZagolovkov.observe(z));
  }

  // Лента и наблюдатель разделов
  narisovatLentu(koren.querySelector('.lenta'), razdely);
  // наблюдатель уже есть (пересборка после смены заведения) — только пересчитать разделы:
  // новый искал бы предка-скроллера через getComputedStyle по свежему DOM
  if (otklyuchitNablyudatel && typeof otklyuchitNablyudatel.obnovit === 'function') { otklyuchitNablyudatel.obnovit(); return; }
  if (otklyuchitNablyudatel) otklyuchitNablyudatel();
  otklyuchitNablyudatel = nablyudatRazdely(mesto, (id) => {
    if (performance.now() < lentaZanyataDo || naPauze) return;
    vybratRazdel(id, true);
  }, { polosa: 0.2 });
}

// Параллакс заголовка (DIZAYN §4.4): отстаёт на .13 от прокрутки и тает под лентой
function zaprositParallaks() {
  if (kadrParallaksa || naPauze) return;
  kadrParallaksa = requestAnimationFrame(() => {
    kadrParallaksa = null;
    // отсчёт — чуть ниже липкой ленты: пока заголовок ниже, он стоит; выше — отстаёт и тает
    const otschet = 190;
    // сначала все чтения, потом все записи — без чередования, которое пересчитывает макет на каждом заголовке
    const zamery = [...vidimyeZagolovki].map((el) => [el, el.parentElement.getBoundingClientRect().top]);
    const lenta = koren?.querySelector('.lenta');
    const prilipla = lenta ? lenta.getBoundingClientRect().top <= 0.5 && window.scrollY > 50 : false;
    for (const [el, top] of zamery) {
      const sdvig = Math.max(0, Math.min(64, (otschet - top) * 0.13));
      const prozrachnost = Math.max(0, Math.min(1, (top + 40) / 160));
      el.style.transform = `translate3d(0, ${sdvig.toFixed(1)}px, 0)`;
      el.style.opacity = prozrachnost.toFixed(3);
    }
    if (lenta) lenta.classList.toggle('prilipla', prilipla);
  });
}
// Главная спрятана (другой экран) — прокрутка чужая, ничего не мерим
const naProkrutku = () => {
  if (naPauze || !koren) return;
  zaprositParallaks();
};

function obnovitKartochki() {
  if (!koren) return;
  koren.querySelectorAll('.kartochka').forEach((k) => obnovitKartochku(k, yadro));
}

/** Подпись над заголовком раздела: «из теста · 12 блюд». */
function podpisRazdela(sem, dostupno) {
  // всё закончилось — «0 блюд» над тремя карточками противоречит содержимому
  if (!dostupno) return `${tekst(PODPISI_SEMEYSTV[sem] || '')} · сегодня закончилось`;
  return `${tekst(PODPISI_SEMEYSTV[sem] || '')} · ${dostupno} ${sklon(dostupno, ['блюдо', 'блюда', 'блюд'])}`;
}

/**
 * Сменили заведение: меняются только цены и доступность. Если набор видимых разделов
 * и карточек тот же — обновляем карточки на месте и переставляем недоступные в конец,
 * без пересборки 130 карточек. Вернёт false, если нужна полная пересборка.
 */
function obnovitRazdelyNaMeste(mesto) {
  const razdely = vidimyeRazdely();
  const sekcii = [...mesto.querySelectorAll(':scope > .razdel')];
  if (sekcii.length !== razdely.length) return false;
  const plan = [];
  for (let i = 0; i < razdely.length; i++) {
    const r = razdely[i];
    const s = sekcii[i];
    if (s.dataset.razdel !== String(r.id)) return false;
    const setka = s.querySelector('.setka');
    const poId = new Map([...setka.children].map((k) => [k.dataset.blyudo, k]));
    const blyuda = blyudaRazdela(r);
    if (blyuda.length !== poId.size) return false;
    const kartochki = blyuda.map((b) => poId.get(String(b.id)));
    if (kartochki.some((k) => !k)) return false;
    plan.push({ s, setka, sem: yadro.semeystvo(r), kartochki });
  }
  for (const { s, setka, sem, kartochki } of plan) {
    let dostupno = 0;
    kartochki.forEach((k, j) => {
      obnovitKartochku(k, yadro);
      if (!yadro.prichina(k._blyudo)) dostupno += 1;
      if (setka.children[j] !== k) setka.insertBefore(k, setka.children[j] || null);
    });
    const pod = s.querySelector('.zagolovok__pod');
    if (pod) pod.innerHTML = podpisRazdela(sem, dostupno);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Плитка «Банкеты» и подвал
// ---------------------------------------------------------------------------

function sdelatBanket() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'banket';
  b.innerHTML = `
    <div>
      <div class="banket__metka">Банкеты и поминки</div>
      <div class="banket__zagolovok">Банкеты — соберём стол</div>
      <div class="banket__tekst">Позвоните в заведение — подберём меню на компанию</div>
    </div>
    <svg class="banket__znak" aria-hidden="true"><use href="#ik-nabor"/></svg>`;
  nazhatie(b, { masshtab: 0.97 });
  b.addEventListener('click', async () => {
    const spisok = await zagruzitIstorii();
    const i = spisok.findIndex((s) => /банкет/i.test(`${s.id} ${s.zagolovok}`));
    if (i >= 0) pokazatIstorii(spisok, i, { naDeystvie: (d) => vypolnitDeystvie(d) });
    else {
      const kombo = yadro.menyu.razdely.find((r) => yadro.semeystvo(r) === 'kombo');
      if (kombo) prokrutitKRazdelu(kombo.id);
    }
  });
  return b;
}

function sdelatPodval() {
  const f = document.createElement('footer');
  f.className = 'podval';
  const n = yadro.menyu.zavedeniya.length;
  f.innerHTML = `<p><b>Хинкальная</b> · ${n} ${sklon(n, ['заведение', 'заведения', 'заведений'])} · меню и цены из базы заведений</p><p>Заказ в демонстрационном режиме — никуда не уходит</p>`;
  return f;
}

// ---------------------------------------------------------------------------
// Экран
// ---------------------------------------------------------------------------

export function pokazat(kontejner, yadro_, parametry) {
  yadro = yadro_;
  koren = kontejner;
  naPauze = false;
  posledneeZavedenie = yadro.gost.zavedenieId;
  kontejner.innerHTML = `
    <h1 class="skryto-vizualno">Меню Хинкальной</h1>
    <header class="shapka"><div class="shapka__verh"></div></header>
    <section class="istorii" aria-label="Акции"></section>
    <div class="banner-mesto"></div>
    <nav class="lenta" aria-label="Разделы меню"><div class="lenta__vnutri"></div></nav>
    <div class="razdely"></div>`;
  const shapka = kontejner.querySelector('.shapka');
  narisovatShapku(shapka);
  shapka.appendChild(sdelatPoisk());
  const mestoBannera = kontejner.querySelector('.banner-mesto');
  // место под «Акцию дня» держим заранее (баннер 214 px на 390, 231 на 360, плюс отступ 6): если сторис
  // доедут после первого кадра, разделы не прыгнут вниз на глазах у гостя
  mestoBannera.style.minHeight = '220px';
  mestoBannera.after(sdelatBegushchuyu());
  narisovatIstorii(kontejner.querySelector('.istorii'), mestoBannera).catch((o) => console.error('Сторис не загрузились', o));
  const razdely = kontejner.querySelector('.razdely');
  narisovatRazdely(razdely);
  razdely.after(sdelatBanket());
  kontejner.appendChild(sdelatPodval());

  // шрифты доехали — ширины таблеток поменялись
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (aktivnyyRazdel) { const id = aktivnyyRazdel; aktivnyyRazdel = null; vybratRazdel(id, false); } });

  window.addEventListener('scroll', naProkrutku, { passive: true });
  window.addEventListener('resize', zaprositParallaks);
  otpiski.push(() => window.removeEventListener('scroll', naProkrutku));
  otpiski.push(() => window.removeEventListener('resize', zaprositParallaks));

  otpiski.push(yadro.korzina.na('izmenilas', () => obnovitKartochki()));
  otpiski.push(yadro.na('gost', (g) => {
    narisovatShapku(shapka);
    if (g.zavedenieId !== posledneeZavedenie) {
      posledneeZavedenie = g.zavedenieId;
      if (!obnovitRazdelyNaMeste(razdely)) narisovatRazdely(razdely, true);
    } else obnovitKartochki();
  }));

  // первый раздел задаёт палитру фона
  const pervyy = vidimyeRazdely()[0];
  if (pervyy) yadro.palitra(yadro.semeystvo(pervyy));
  zaprositParallaks();

  // Каскад шапки при первом входе
  if (!dvizhenieSnyato()) {
    [shapka, kontejner.querySelector('.istorii')].forEach((el, i) => {
      el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: pruzhina.myagkaya.ms, delay: i * 60, easing: pruzhina.myagkaya.easing, fill: 'backwards' });
    });
  }
}

/** Ядро прячет главную (ушли на другой экран) — останавливаем лишнее. */
export function pauza() {
  naPauze = true;
}

/** Главная снова видна: палитра раздела, лента на месте. */
export function prodolzhit() {
  naPauze = false;
  if (!koren) return;
  if (yadro.gost.zavedenieId !== posledneeZavedenie) {
    posledneeZavedenie = yadro.gost.zavedenieId;
    const mesto = koren.querySelector('.razdely');
    if (!obnovitRazdelyNaMeste(mesto)) narisovatRazdely(mesto, true);
  }
  const id = aktivnyyRazdel;
  const razdel = id && yadro.menyu.razdely.find((r) => r.id === id);
  if (razdel) yadro.palitra(yadro.semeystvo(razdel));
  zaprositParallaks();
}

export function ubrat() {
  otpiski.forEach((f) => { try { f(); } catch { /* уже снято */ } });
  otpiski = [];
  if (otklyuchitNablyudatel) otklyuchitNablyudatel();
  otklyuchitNablyudatel = null;
  if (otmenaParallaksaBannera) otmenaParallaksaBannera();
  if (nablyudatelKartochek) nablyudatelKartochek.disconnect();
  if (nablyudatelZagolovkov) nablyudatelZagolovkov.disconnect();
  clearInterval(tajmerPodskazki);
  if (kadrParallaksa) cancelAnimationFrame(kadrParallaksa);
  kadrParallaksa = null;
  koren = null;
}
