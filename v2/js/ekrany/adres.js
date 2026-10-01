// Витрина Хинкальной v2 — первый экран «Где вы?» (#/adres).
// Бриф §5 «Первый экран», §6 тупики 3 и 4; DIZAYN §3.16, §3.17, §4.5, §7.
// Три пути: «Я рядом» (геолокация → ближайшие), «Выбрать заведение» (все 7),
// «Указать адрес доставки» (поиск OSM по «Найти» → ближайшее заведение и км; дальше 7 км — честно).
// Маленькое «Сначала посмотрю меню» никого не запирает.
// Контракт экрана — design/vitrina_v2/YADRO.md §1: pokazat / ubrat.

import { nazhatie, poyavlenieKaskadom, pruzhina, dvizhenieSnyato, vibro } from '../dvizhenie.js';
import { blizhayshieZavedeniya, otkrytoSeychas, podskazatAdres } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { rub, tekst } from '../kartochka.js';

/** Дальше этого — доставки нет (бриф §5, тупик 3). */
const PREDEL_DOSTAVKI_KM = 7;
/**
 * Поиск адреса — только по Enter или кнопке «Найти», одно обращение на поиск.
 * Бриф §5 предлагал подсказки на каждую паузу ввода (debounce 350 мс), но политика публичного
 * сервера Nominatim прямо запрещает автодополнение из клиентского кода, а домен витрины общий
 * для всех страниц RestoPosBot: бан по Referer ударил бы по всем сразу (критик, круг 2).
 */
const MIN_DLINA_ADRESA = 3;
/** Номера тех, кто ждёт доставку в свой район (демо: никуда не уходит). */
const KLYUCH_ZHDUT = 'hinkalnaya.zhdut_dostavku.v2';
/** Минимальная сумма доставки, если в базе не задана (бриф §5). */
const MIN_DOSTAVKI = 1000;

/** Где гость, если он уже разрешал геолокацию в этой вкладке — чтобы не спрашивать дважды. */
let izvestnayaTochka = null;

/** Состояние живого экрана; null — экрана нет. */
let s = null;

const formatKm = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Мелочи
// ---------------------------------------------------------------------------

/** «2,4 км», «12 км», «1 380 км». */
function km(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const x = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `${formatKm.format(x)} км`;
}

/** «ул Башиловская, д 19» → «ул. Башиловская, 19»; без «г Москва» и «Московская обл». */
function chistyyAdres(z) {
  let a = String(z.adres || '')
    .replace(/^Московская обл,\s*/i, '')
    .replace(/^г Москва,\s*/i, '')
    .replace(/(^|,\s*)г\s+/g, '$1')
    .replace(/(^|,\s*)д\s+/g, '$1')
    .replace(/(^|,\s*)(ул|ш|пр-кт|пер|пл)\s+/g, '$1$2. ');
  const metro = String(z.metro || '');
  if (/^м\.\s/.test(metro)) a = `${metro} · ${a}`;
  return a;
}

/** Статус работы: «открыто круглосуточно» / «открыто до 23:00» / «откроется в 10:00 — оформим ко времени». */
function statusRaboty(z) {
  const st = otkrytoSeychas(z);
  // Часы в базе по умолчанию ([0,1440] все дни) — круглосуточно не обещаем, точку зелёным не красим
  if (st.chasyNeizvestny || !z?.chasy) return { otkryto: true, neizvestno: true, tekst: 'часы уточняйте' };
  if (st.otkryto) return { otkryto: true, tekst: st.kruglosutochno || !st.zakryvaetsyaV ? 'открыто круглосуточно' : `открыто до ${st.zakryvaetsyaV}` };
  if (st.otkroetsya) return { otkryto: false, tekst: `откроется ${st.otkroetsya} — оформим ко времени` };
  return { otkryto: false, tekst: 'часы работы уточняем' };
}

function tajmer(fn, ms) {
  const t = setTimeout(() => { if (s) fn(); }, ms);
  s?.tajmery.push(t);
  return t;
}

/** Реплика своего Хинкалика (прямая реакция на действие — без ограничения 20 с). */
function skazat(tekstRepliki, nastroenie = 'obychno', ms = 0) {
  const h = s?.hinkalik;
  if (!h) return;
  try { h.nastroenie(nastroenie); h.skazat(tekstRepliki, ms); } catch { /* персонаж не критичен */ }
}

/** Ждать, пока ядро покажет маршрут (для перетекания названия в шапку главной). */
function zhdatMarshruta(yadro, imya, ms = 1600) {
  return new Promise((gotovo) => {
    let otpisat = () => {};
    const t = setTimeout(() => { otpisat(); gotovo(false); }, ms);
    otpisat = yadro.na('marshrut', (m) => {
      if (m?.imya !== imya) return;
      clearTimeout(t);
      otpisat();
      gotovo(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Карточка заведения (DIZAYN §3.16)
// ---------------------------------------------------------------------------

function kartochkaZavedeniya(z, rasstoyanie, opcii = {}) {
  const st = statusRaboty(z);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'zavedenie'
    + (z.svoe === false ? ' zavedenie--partner' : '')
    + (st.otkryto ? '' : ' zakryto')
    + (st.neizvestno ? ' chasy-neizvestny' : '')
    + (opcii.vybrano ? ' vybrano' : '');
  el.dataset.zavedenie = z.id;
  const min = Number(z.min_zakaz) > 0 ? `<small>мин. заказ ${rub(z.min_zakaz)}</small>` : '';
  el.innerHTML = `
    ${opcii.blizhe ? '<span class="zavedenie__blizhe">ближе всего</span>' : ''}
    <span class="zavedenie__nazvanie">${tekst(z.nazvanie)}</span>
    <span class="zavedenie__adres">${tekst(chistyyAdres(z))}</span>
    <span class="zavedenie__status"><i class="zavedenie__tochka" aria-hidden="true"></i>${tekst(st.tekst)}</span>
    <span class="zavedenie__km"><span class="zavedenie__chislo">${km(rasstoyanie)}</span>${min}</span>`;
  nazhatie(el, { masshtab: 0.96 });
  el.addEventListener('click', () => {
    if (opcii.naVybor) opcii.naVybor(z, el);
  });
  return el;
}

// ---------------------------------------------------------------------------
// Выбор сделан → в меню (или на перенос, если корзина не пуста)
// ---------------------------------------------------------------------------

/** Клон названия заведения, который перелетит в шапку главной (DIZAYN §4.5). */
function sozdatKlon(istochnik) {
  if (!istochnik || dvizhenieSnyato()) return null;
  const r = istochnik.getBoundingClientRect();
  if (!r.width) return null;
  const klon = istochnik.cloneNode(true);
  klon.classList.add('adres__klon');
  Object.assign(klon.style, {
    left: `${r.left}px`, top: `${r.top}px`, width: `${Math.ceil(r.width) + 2}px`, height: `${r.height}px`,
  });
  document.body.appendChild(klon);
  return { klon, r };
}

/** Клон долетает до названия в шапке главной; нет цели — просто тает. */
async function dovestiKlon(k) {
  if (!k) return;
  const { klon, r } = k;
  const cel = document.querySelector('.ekran--glavnaya .mesto__nazvanie span') || document.querySelector('.ekran--glavnaya .mesto__nazvanie');
  const rc = cel?.getBoundingClientRect();
  const vidno = rc && rc.width && rc.bottom > 0 && rc.top < innerHeight;
  if (!vidno) {
    await klon.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.catch(() => {});
    klon.remove();
    return;
  }
  const m = rc.height / r.height;
  cel.style.visibility = 'hidden';
  const a = klon.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${rc.left - r.left}px, ${rc.top - r.top}px) scale(${m})`, opacity: 1 },
    ],
    { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing, fill: 'forwards' },
  );
  await a.finished.catch(() => {});
  cel.style.visibility = '';
  klon.remove();
}

/**
 * Единая развязка: заведение выбрано. Корзина не пуста и заведение другое — ядро само
 * ведёт на «Переносим заказ»; иначе — в меню, название перетекает в шапку.
 */
async function vybrano(zavedenieId, istochnik) {
  if (!s || s.zanyato) return;
  s.zanyato = true;
  const { yadro } = s;
  vibro([8, 30, 8]);
  yadro.obnovitGostya({ smotritMenyu: false });
  // Куда вернуться: пришли с оформления (или перенос прислал сюда с возвратом) — туда же (тупик 13)
  const vozvrat = s.vozvrat;
  // zamenit: экран переноса встаёт на место адреса — после переноса «назад» не возвращает на выбор
  const itog = yadro.vybratZavedenie(zavedenieId, { vozvrat, istochnik, zamenit: true });
  if (itog === 'perenos') return; // ядро уже переходит на #/perenos
  if (vozvrat !== '#/') { yadro.vernutsya(vozvrat); return; }
  const k = sozdatKlon(istochnik);
  vMenyu(yadro);
  if (k) {
    await zhdatMarshruta(yadro, 'glavnaya');
    await dovestiKlon(k);
  }
}

/** В меню: если пришли с главной — назад по истории, иначе заменить запись. */
function vMenyu(yadro) {
  // запись под нами — главная: шаг назад; иначе заменить (ядро решает по history.state.prezhniy)
  yadro.vernutsya('#/');
}

// ---------------------------------------------------------------------------
// Раскрытие кнопки в блок (DIZAYN §3.17)
// ---------------------------------------------------------------------------

const REZHIMY = {
  ryadom: { zagolovok: 'Я рядом', znak: '#ik-bulavka' },
  spisok: { zagolovok: 'Выбрать заведение', znak: '#ik-sumka' },
  dostavka: { zagolovok: 'Адрес доставки', znak: '#ik-dostavka' },
};

async function otkryt(rezhim, knopka) {
  if (!s || s.rezhim) return;
  s.rezhim = rezhim;
  const { koren, knopki, blok } = s;
  const snyato = dvizhenieSnyato();
  const r = knopka?.getBoundingClientRect();

  // остальные кнопки уезжают вниз с затуханием, 240 мс
  if (!snyato) {
    const drugie = [...knopki.querySelectorAll('.knopka--60')].filter((k) => k !== knopka);
    const uhod = drugie.map((k) => k.animate(
      [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(24px)', opacity: 0 }],
      { duration: 240, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' },
    ));
    await Promise.all(uhod.map((a) => a.finished.catch(() => {})));
    uhod.forEach((a) => a.cancel());
    if (!s || s.rezhim !== rezhim) return;
  }

  const o = REZHIMY[rezhim];
  koren.classList.add('adres--otkryt');
  knopki.hidden = true;
  s.nazadVverh.hidden = true;
  blok.hidden = false;
  const zagolovok = blok.querySelector('.adres__blok-zagolovok');
  zagolovok.innerHTML = `<svg aria-hidden="true"><use href="${o.znak}"/></svg><span>${o.zagolovok}</span>`;
  const soderzhimoe = blok.querySelector('.adres__soderzhimoe');
  soderzhimoe.innerHTML = '';

  // выбранная кнопка становится заголовком блока: призрак кнопки тает на месте заголовка, текст переезжает
  if (!snyato && r) {
    const rz = zagolovok.getBoundingClientRect();
    const prizrak = knopka.cloneNode(true);
    prizrak.classList.add('adres__prizrak');
    Object.assign(prizrak.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.appendChild(prizrak);
    prizrak.animate(
      [
        { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
        { transform: `translate(${rz.left - r.left}px, ${rz.top - r.top + (rz.height - r.height) / 2}px) scale(${Math.max(0.4, rz.width / r.width)}, ${rz.height / r.height})`, opacity: 0 },
      ],
      { duration: 380, easing: pruzhina.obychnaya.easing, fill: 'forwards' },
    ).finished.catch(() => {}).then(() => prizrak.remove());
    zagolovok.animate(
      [
        { transform: `translate(${r.left + 20 - rz.left}px, ${r.top + (r.height - rz.height) / 2 - rz.top}px)`, opacity: 0 },
        { transform: 'translate(0,0)', opacity: 1 },
      ],
      { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing },
    );
    blok.querySelector('.adres__blok-nazad').animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 400, delay: 120, easing: pruzhina.zhivaya.easing, fill: 'backwards' });
  }

  if (rezhim === 'ryadom') rezhimRyadom(soderzhimoe);
  else if (rezhim === 'spisok') rezhimSpisok(soderzhimoe);
  else rezhimDostavka(soderzhimoe);
}

function zakryt() {
  if (!s || !s.rezhim) return;
  s.rezhim = null;
  s.pokolenie++;
  otmenitPoiskAdresa();
  const { koren, knopki, blok } = s;
  koren.classList.remove('adres--otkryt');
  blok.hidden = true;
  blok.querySelector('.adres__soderzhimoe').innerHTML = '';
  knopki.hidden = false;
  s.nazadVverh.hidden = !s.mozhnoNazad;
  poyavlenieKaskadom(knopki.querySelectorAll('.knopka--60'), 80);
  skazat('Куда везти или где заберёте?', 'obychno');
}

// ---------------------------------------------------------------------------
// «Я рядом» и «Выбрать заведение»
// ---------------------------------------------------------------------------

/**
 * Точка гостя {shirota, dolgota} или отказ {oshibka: 'zapret' | 'net' | 'dolgo'}
 * (запрет доступа, нет датчика/места, долго). Промис не падает.
 */
function uznatTochku() {
  return new Promise((gotovo) => {
    if (!navigator.geolocation) { gotovo({ oshibka: 'net' }); return; }
    let konec = false;
    const t = setTimeout(() => { konec = true; gotovo({ oshibka: 'dolgo' }); }, 9000);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => { if (konec) return; clearTimeout(t); gotovo({ shirota: p.coords.latitude, dolgota: p.coords.longitude }); },
        (e) => {
          if (konec) return;
          clearTimeout(t);
          gotovo({ oshibka: e?.code === 1 ? 'zapret' : e?.code === 3 ? 'dolgo' : 'net' });
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    } catch { clearTimeout(t); gotovo({ oshibka: 'net' }); }
  });
}

/** Спокойная строка над списком: почему «Я рядом» не сработал и что делать (без нытья, тупик 4). */
function obyasnitOtkaz(metka, oshibka) {
  const el = document.createElement('p');
  el.className = 'adres__primechanie adres__otkaz';
  el.setAttribute('role', 'status');
  el.style.margin = '8px 4px 12px';
  el.textContent = oshibka === 'zapret'
    ? 'Не получилось определить, где вы. Выберите заведение из списка — а разрешить доступ к месту можно в настройках браузера.'
    : 'Не получилось определить, где вы. Выберите заведение из списка.';
  metka.after(el);
  poyavlenieKaskadom([el], 0);
}

/** Список заведений: [{zavedenie, km}] по порядку; рисует карточки с каскадом. */
function narisovatSpisok(mesto, spisok, opcii = {}) {
  const { yadro } = s;
  const tekushchee = yadro.gost.zavedenieId;
  mesto.innerHTML = '';
  const karty = spisok.map(({ zavedenie, km: rasst }, i) => kartochkaZavedeniya(zavedenie, rasst, {
    vybrano: zavedenie.id === tekushchee,
    blizhe: opcii.blizhe && i === 0 && rasst != null,
    naVybor: (z, el) => {
      yadro.obnovitGostya({ sposob: 'samovyvoz' });
      vybrano(z.id, el.querySelector('.zavedenie__nazvanie'));
    },
  }));
  karty.forEach((k) => mesto.appendChild(k));
  if (opcii.kaskad !== false) poyavlenieKaskadom(karty, 40);
  return karty;
}

/** Пересортировать уже показанный список по расстоянию — карточки переезжают на новые места (FLIP). */
function perestavit(mesto, spisok) {
  const byli = new Map([...mesto.children].map((el) => [el.dataset.zavedenie, el.getBoundingClientRect()]));
  const karty = narisovatSpisok(mesto, spisok, { blizhe: true, kaskad: false });
  if (dvizhenieSnyato()) return;
  karty.forEach((el, i) => {
    const r0 = byli.get(el.dataset.zavedenie);
    const r1 = el.getBoundingClientRect();
    if (!r0) return;
    const dy = r0.top - r1.top;
    el.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing, delay: i * 30, fill: 'backwards' },
    );
    const chislo = el.querySelector('.zavedenie__chislo');
    chislo?.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing, delay: 200 + i * 30, fill: 'backwards' });
  });
}

function vseZavedeniya() {
  return (s.yadro.menyu?.zavedeniya || []).map((zavedenie) => ({ zavedenie, km: null }));
}

function rezhimRyadom(mesto) {
  const pokolenie = s.pokolenie;
  mesto.innerHTML = '<div class="metka adres__metka">Ищем, что ближе</div><div class="spisok"></div>';
  const metka = mesto.querySelector('.metka');
  const spisokEl = mesto.querySelector('.spisok');
  // список виден сразу — геолокация только пересортирует его (тупик 4: без ожидания и без спиннера)
  narisovatSpisok(spisokEl, izvestnayaTochka ? blizhayshieZavedeniya(izvestnayaTochka.shirota, izvestnayaTochka.dolgota, s.yadro.menyu) : vseZavedeniya(), { blizhe: Boolean(izvestnayaTochka) });
  if (izvestnayaTochka) { metka.textContent = 'Ближе к вам'; skazatBlizhe(); return; }
  skazat('Смотрю, что ближе…', 'dumaet');
  uznatTochku().then((t) => {
    if (!s || s.pokolenie !== pokolenie || s.rezhim !== 'ryadom') return;
    if (!t || t.oshibka) {
      // запрет или нет датчика — список уже на экране; одной строкой объясняем, почему без расстояний
      metka.textContent = 'Все заведения';
      obyasnitOtkaz(metka, t?.oshibka);
      // подсветить список: карточки ещё раз проходят каскадом — взгляд идёт к ним, а не к «Я рядом»
      poyavlenieKaskadom(spisokEl.children, 40);
      skazat('Не вижу, где вы. Выберите заведение', 'obychno');
      return;
    }
    izvestnayaTochka = t;
    metka.textContent = 'Ближе к вам';
    perestavit(spisokEl, blizhayshieZavedeniya(t.shirota, t.dolgota, s.yadro.menyu));
    skazatBlizhe();
  });
}

function skazatBlizhe() {
  if (!izvestnayaTochka) return;
  const b = blizhayshieZavedeniya(izvestnayaTochka.shirota, izvestnayaTochka.dolgota, s.yadro.menyu)[0];
  if (b && b.km != null) skazat(`Ближе всего — ${b.zavedenie.nazvanie}, ${km(b.km)}`, 'rad');
}

function rezhimSpisok(mesto) {
  const pokolenie = s.pokolenie;
  const menyu = s.yadro.menyu;
  const vsego = (menyu?.zavedeniya || []).length;
  mesto.innerHTML = `<div class="metka adres__metka">Все заведения · ${vsego}</div><div class="spisok"></div>`;
  const spisokEl = mesto.querySelector('.spisok');
  const t = izvestnayaTochka;
  narisovatSpisok(spisokEl, t ? blizhayshieZavedeniya(t.shirota, t.dolgota, menyu) : vseZavedeniya(), { blizhe: Boolean(t) });
  skazat('Откуда заберёте?', 'obychno');
  // разрешение уже дано раньше — тихо подставим километры, не спрашивая
  if (!t && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (p.state !== 'granted') return;
      uznatTochku().then((tochka) => {
        if (!tochka || tochka.oshibka || !s || s.pokolenie !== pokolenie || s.rezhim !== 'spisok') return;
        izvestnayaTochka = tochka;
        perestavit(spisokEl, blizhayshieZavedeniya(tochka.shirota, tochka.dolgota, menyu));
      });
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// «Адрес доставки»
// ---------------------------------------------------------------------------

function otmenitPoiskAdresa() {
  if (!s) return;
  if (s.kontroller) { try { s.kontroller.abort(); } catch { /* уже отменён */ } }
  s.kontroller = null;
  s.iskomoe = null;
}

function rezhimDostavka(mesto) {
  const { yadro } = s;
  const bylo = yadro.gost.adres?.tekst || '';
  mesto.innerHTML = `
    <label class="pole adres__pole">
      <span class="pole__metka">Куда везти</span>
      <input class="pole__vvod" id="adres-vvod" type="text" autocomplete="street-address" enterkeyhint="search"
        placeholder="Город, улица, дом" value="${tekst(bylo)}">
      <span class="pole__podskazka">Напишите адрес и нажмите «Найти»</span>
    </label>
    <button type="button" class="knopka knopka--steklo knopka--60 adres__nayti" data-nayti><svg aria-hidden="true"><use href="#ik-poisk"/></svg><span>Найти</span></button>
    <div class="podskazki" role="listbox" aria-label="Найденные адреса"></div>
    <div class="adres__itog"></div>
    <small class="adres__istochnik">Адреса подсказывает OpenStreetMap</small>`;
  const vvod = mesto.querySelector('#adres-vvod');
  const pole = mesto.querySelector('.adres__pole');
  const podskazka = mesto.querySelector('.pole__podskazka');
  const knopkaNayti = mesto.querySelector('[data-nayti]');
  const spisok = mesto.querySelector('.podskazki');
  const itog = mesto.querySelector('.adres__itog');
  nazhatie(knopkaNayti, { masshtab: 0.95 });
  skazat('Напишите улицу и дом — найду ближайшую кухню', 'obychno');
  if (!dvizhenieSnyato()) tajmer(() => vvod.focus({ preventScroll: true }), 420);
  else vvod.focus({ preventScroll: true });

  const nayti = () => {
    const zapros = vvod.value.trim();
    if (zapros.length < MIN_DLINA_ADRESA) {
      // тупик 12: не молчим
      pole.classList.remove('oshibka');
      void pole.offsetWidth;
      pole.classList.add('oshibka');
      podskazka.textContent = 'Напишите город, улицу и дом';
      vibro([12, 40, 12]);
      vvod.focus({ preventScroll: true });
      return;
    }
    if (s.kontroller && s.iskomoe === zapros) return; // этот же адрес уже ищем — второй запрос не шлём
    otmenitPoiskAdresa();
    pole.classList.remove('oshibka');
    itog.innerHTML = '';
    spisok.innerHTML = '';
    podskazka.textContent = 'Ищем адрес…';
    zaprositPodskazki(zapros, vvod, podskazka, spisok, itog);
  };

  vvod.addEventListener('input', () => {
    // на каждую букву сервер не спрашиваем: старые находки убираем, ждём «Найти»
    if (vvod.value.trim() === s.naydenoDlya) return;
    otmenitPoiskAdresa();
    s.naydenoDlya = null;
    pole.classList.remove('oshibka');
    itog.innerHTML = '';
    spisok.innerHTML = '';
    podskazka.textContent = vvod.value.trim().length < MIN_DLINA_ADRESA
      ? 'Напишите адрес и нажмите «Найти»'
      : 'Нажмите «Найти» — покажем, куда привезём';
  });
  vvod.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // уже нашли по этому тексту — Enter выбирает первый адрес; иначе — новый поиск
    const pervyy = spisok.querySelector('.podskazki__punkt');
    if (pervyy && s.naydenoDlya === vvod.value.trim()) { pervyy.click(); return; }
    nayti();
  });
  knopkaNayti.addEventListener('click', nayti);
}

async function zaprositPodskazki(zapros, vvod, podskazka, spisok, itog) {
  if (!s) return;
  const kontroller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  s.kontroller = kontroller;
  s.iskomoe = zapros;
  const taymaut = kontroller ? setTimeout(() => kontroller.abort(), 7000) : null;
  const naydeno = await podskazatAdres(zapros, kontroller ? { signal: kontroller.signal } : {});
  clearTimeout(taymaut);
  if (!s || s.kontroller !== kontroller) return; // поиск отменён или начат новый
  s.kontroller = null;
  s.iskomoe = null;
  if (s.rezhim !== 'dostavka' || vvod.value.trim() !== zapros) return; // гость уже правит адрес
  s.naydenoDlya = zapros;
  spisok.innerHTML = '';
  if (naydeno.oshibka || !naydeno.length) {
    if (navigator.onLine === false || naydeno.oshibka) {
      podskazka.textContent = navigator.onLine === false
        ? 'Нет сети — адрес сейчас не найти'
        : 'Подсказки адреса сейчас не отвечают. Выберите заведение из списка';
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'knopka knopka--steklo knopka--60';
      k.innerHTML = '<svg aria-hidden="true"><use href="#ik-sumka"/></svg><span>Заберу сам — выбрать заведение</span>';
      nazhatie(k, { masshtab: 0.95 });
      k.addEventListener('click', () => { zakryt(); tajmer(() => otkryt('spisok', null), 60); });
      itog.appendChild(k);
    } else {
      podskazka.textContent = 'Не нашли такой адрес. Напишите город, улицу и дом';
    }
    return;
  }
  podskazka.textContent = 'Выберите адрес из списка';
  const punkty = naydeno.map((p) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'podskazki__punkt';
    el.setAttribute('role', 'option');
    el.innerHTML = `${tekst(p.kratko)}<small>${tekst(p.adres)}</small>`;
    nazhatie(el, { masshtab: 0.97, vibro: false });
    el.addEventListener('click', () => vybratAdres(p, vvod, podskazka, spisok, itog));
    spisok.appendChild(el);
    return el;
  });
  poyavlenieKaskadom(punkty, 40);
}

function vybratAdres(p, vvod, podskazka, spisok, itog) {
  if (!s) return;
  const { yadro } = s;
  vibro(8);
  vvod.value = p.kratko;
  vvod.blur();
  spisok.innerHTML = '';
  const adres = { tekst: p.kratko, shirota: p.shirota, dolgota: p.dolgota };
  const blizhayshee = blizhayshieZavedeniya(p.shirota, p.dolgota, yadro.menyu).find((x) => x.km != null);
  itog.innerHTML = '';
  if (!blizhayshee) {
    podskazka.textContent = 'Не смогли посчитать расстояние — выберите заведение';
    return;
  }
  const z = blizhayshee.zavedenie;
  if (blizhayshee.km <= PREDEL_DOSTAVKI_KM) {
    podskazka.textContent = 'Адрес понятен';
    const min = Number(z.min_zakaz) > 0 ? Number(z.min_zakaz) : MIN_DOSTAVKI;
    itog.innerHTML = `<div class="metka adres__metka">Привезём из</div>`;
    const karta = kartochkaZavedeniya(z, blizhayshee.km, {
      vybrano: true,
      naVybor: (zz, el) => { yadro.obnovitGostya({ sposob: 'dostavka', adres }); vybrano(zz.id, el.querySelector('.zavedenie__nazvanie')); },
    });
    itog.appendChild(karta);
    itog.insertAdjacentHTML('beforeend', `<p class="adres__primechanie">Доставка от ${rub(min)} · заберёте сами — без минимума</p>`);
    const knopka = document.createElement('button');
    knopka.type = 'button';
    knopka.className = 'knopka knopka--glavnaya knopka--60';
    knopka.innerHTML = '<svg aria-hidden="true"><use href="#ik-dostavka"/></svg><span>Везите сюда</span>';
    nazhatie(knopka, { masshtab: 0.95 });
    knopka.addEventListener('click', () => { yadro.obnovitGostya({ sposob: 'dostavka', adres }); vybrano(z.id, karta.querySelector('.zavedenie__nazvanie')); });
    itog.appendChild(knopka);
    poyavlenieKaskadom(itog.children, 60);
    skazat(`Привезём из заведения «${z.nazvanie}» — ${km(blizhayshee.km)}`, 'rad');
    return;
  }
  // Дальше 7 км — честно (бриф §6.3, DIZAYN §3.17, текст §7 №18)
  podskazka.textContent = 'Адрес понятен';
  itog.innerHTML = `
    <div class="preduprezhdenie adres__daleko">
      <b>Доставки сюда пока нет</b>
      <p>Самовывоз из ближайшего — «${tekst(z.nazvanie)}», ${km(blizhayshee.km)}. Меню можно смотреть уже сейчас.</p>
      <div class="preduprezhdenie__knopki">
        <button type="button" class="knopka knopka--glavnaya" data-samovyvoz>Самовывоз из ближайшего</button>
        <button type="button" class="knopka knopka--steklo" data-nomer>Оставить номер</button>
      </div>
      <div class="adres__nomer" hidden></div>
    </div>`;
  const blokDaleko = itog.querySelector('.adres__daleko');
  blokDaleko.querySelectorAll('.knopka').forEach((k) => nazhatie(k, { masshtab: 0.95 }));
  blokDaleko.querySelector('[data-samovyvoz]').addEventListener('click', () => {
    // адрес не теряем (тупик 14): вдруг потом переключатся на доставку
    yadro.obnovitGostya({ sposob: 'samovyvoz', adres });
    vybrano(z.id, null);
  });
  blokDaleko.querySelector('[data-nomer]').addEventListener('click', (e) => pokazatPoleNomera(blokDaleko, adres, e.currentTarget));
  poyavlenieKaskadom([blokDaleko], 0);
  skazat('Туда пока не возим. Заберёте сами?', 'grustno');
}

/** Маска телефона: «+7 (___) ___-__-__» по мере ввода. */
function maskaTelefona(znachenie) {
  let c = String(znachenie || '').replace(/\D/g, '');
  if (c.startsWith('8') || c.startsWith('7')) c = c.slice(1);
  c = c.slice(0, 10);
  let v = '+7';
  if (c.length) v += ` (${c.slice(0, 3)}`;
  if (c.length >= 3) v += ')';
  if (c.length > 3) v += ` ${c.slice(3, 6)}`;
  if (c.length > 6) v += `-${c.slice(6, 8)}`;
  if (c.length > 8) v += `-${c.slice(8, 10)}`;
  return { v, cifr: c.length };
}

function pokazatPoleNomera(blokDaleko, adres, knopkaNomera) {
  const mesto = blokDaleko.querySelector('.adres__nomer');
  if (!mesto.hidden) { mesto.querySelector('input')?.focus(); return; }
  mesto.hidden = false;
  knopkaNomera.hidden = true;
  mesto.innerHTML = `
    <label class="pole">
      <span class="pole__metka">Ваш телефон</span>
      <input class="pole__vvod" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__">
      <span class="pole__podskazka">Позвоним, когда начнём возить в ваш район</span>
    </label>
    <button type="button" class="knopka knopka--steklo">Жду доставку</button>`;
  const pole = mesto.querySelector('.pole');
  const vvod = mesto.querySelector('input');
  const podskazka = mesto.querySelector('.pole__podskazka');
  const knopka = mesto.querySelector('.knopka');
  nazhatie(knopka, { masshtab: 0.95 });
  vvod.addEventListener('input', () => {
    // каретку не гоним в конец: правка цифры в середине номера остаётся на месте
    const syroe = vvod.value;
    let kursor = null;
    try { kursor = vvod.selectionStart; } catch { /* не все поля умеют */ }
    const vKonce = kursor == null || kursor >= syroe.length;
    const levee = vKonce ? '' : syroe.slice(0, kursor);
    const sleva = Math.max(0, levee.replace(/\D/g, '').length - (levee.startsWith('+7') ? 1 : 0));
    vvod.value = maskaTelefona(syroe).v;
    if (!vKonce) {
      let poz = vvod.value.length;
      let schet = 0;
      if (sleva === 0) poz = Math.min(4, vvod.value.length);
      else for (let i = 2; i < vvod.value.length; i++) { if (/\d/.test(vvod.value[i]) && ++schet === sleva) { poz = i + 1; break; } }
      try { vvod.setSelectionRange(poz, poz); } catch { /* не все поля умеют */ }
    }
    pole.classList.remove('oshibka');
    podskazka.textContent = 'Позвоним, когда начнём возить в ваш район';
  });
  knopka.addEventListener('click', () => {
    const { v, cifr } = maskaTelefona(vvod.value);
    if (cifr < 10) {
      // тупик 12: не молчим
      pole.classList.remove('oshibka');
      void pole.offsetWidth;
      pole.classList.add('oshibka');
      podskazka.textContent = 'Не хватает цифр';
      vibro([12, 40, 12]);
      return;
    }
    try {
      const spisok = JSON.parse(localStorage.getItem(KLYUCH_ZHDUT) || '[]');
      spisok.push({ telefon: v, adres, kogda: new Date().toISOString() });
      localStorage.setItem(KLYUCH_ZHDUT, JSON.stringify(spisok.slice(-20)));
    } catch { /* хранилище недоступно — демо, не критично */ }
    s?.yadro.tost('Записали номер. Позвоним, когда начнём возить', { vid: 'uspeh' });
    skazat('Записал. А меню можно смотреть уже сейчас', 'rad');
    mesto.innerHTML = '<button type="button" class="knopka knopka--glavnaya">Смотреть меню</button>';
    const vMenyuKnopka = mesto.querySelector('.knopka');
    nazhatie(vMenyuKnopka, { masshtab: 0.95 });
    vMenyuKnopka.addEventListener('click', posmotretMenyu);
  });
  vvod.focus();
}

/** «Сначала посмотрю меню» — никого не запираем. */
function posmotretMenyu() {
  if (!s || s.zanyato) return;
  s.zanyato = true;
  s.yadro.obnovitGostya({ smotritMenyu: true });
  vMenyu(s.yadro);
}

// ---------------------------------------------------------------------------
// Экран
// ---------------------------------------------------------------------------

/**
 * Показать первый экран.
 * @param {HTMLElement} kontejner <section class="ekran ekran--adres">
 * @param {object} yadro объект ядра (YADRO.md §2)
 * @param {{ot:string|null}} parametry
 */
export function pokazat(kontejner, yadro, parametry = {}) {
  kontejner.classList.add('ekran--bez-niza');
  const gost = yadro.gost;
  const mozhnoNazad = Boolean(gost.zavedenieId || gost.smotritMenyu || parametry.ot);
  kontejner.innerHTML = `
    <div class="adres">
      <button type="button" class="ekran__nazad adres__nazad" aria-label="Назад к меню" ${mozhnoNazad ? '' : 'hidden'}><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button>
      <div class="adres__geroy"><div class="adres__hinkalik"></div></div>
      <h1 class="ekran__zagolovok adres__zagolovok">Где вы?</h1>
      <p class="ekran__pod adres__pod">Покажем цены и блюда того заведения, откуда заберёте или привезём</p>
      <div class="adres__knopki">
        <button type="button" class="knopka knopka--glavnaya knopka--60" data-rezhim="ryadom"><svg aria-hidden="true"><use href="#ik-bulavka"/></svg><span>Я рядом</span></button>
        <button type="button" class="knopka knopka--steklo knopka--60" data-rezhim="spisok"><svg aria-hidden="true"><use href="#ik-sumka"/></svg><span>Выбрать заведение</span></button>
        <button type="button" class="knopka knopka--steklo knopka--60" data-rezhim="dostavka"><svg aria-hidden="true"><use href="#ik-dostavka"/></svg><span>Указать адрес доставки</span></button>
      </div>
      <div class="adres__blok" hidden>
        <div class="adres__blok-shapka">
          <button type="button" class="ekran__nazad adres__blok-nazad" aria-label="К выбору способа"><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button>
          <div class="adres__blok-zagolovok"></div>
        </div>
        <div class="adres__soderzhimoe"></div>
      </div>
      <button type="button" class="knopka knopka--tihaya adres__potom">Сначала посмотрю меню</button>
    </div>`;

  const koren = kontejner.querySelector('.adres');
  s = {
    yadro,
    kontejner,
    koren,
    ot: parametry.ot ?? null,
    vozvrat: parametry.vozvrat || (parametry.ot === 'oformlenie' ? '#/oformlenie' : '#/'),
    knopki: koren.querySelector('.adres__knopki'),
    blok: koren.querySelector('.adres__blok'),
    nazadVverh: koren.querySelector('.adres__nazad'),
    mozhnoNazad,
    rezhim: null,
    pokolenie: 0,
    zanyato: false,
    tajmery: [],
    iskomoe: null, // адрес, который сейчас ищем (повторный «Найти» не шлёт второй запрос)
    naydenoDlya: null, // по какому тексту показаны найденные адреса
    kontroller: null,
    hinkalik: null,
  };

  // Хинкалик 120 px по центру — здоровается (DIZAYN §3.17, §6)
  try {
    s.hinkalik = new Hinkalik(koren.querySelector('.adres__hinkalik'), { razmer: 120, plavayushchiy: false });
    s.hinkalik.naNazhatie?.(() => { s?.hinkalik?.pryg(); });
  } catch (oshibka) { console.error('Экран адреса: Хинкалик не нарисовался', oshibka); }
  tajmer(() => skazat('Привет. Куда везти или где заберёте?', 'rad'), dvizhenieSnyato() ? 0 : 380);

  const knopki = [...s.knopki.querySelectorAll('.knopka--60')];
  knopki.forEach((k) => {
    nazhatie(k, { masshtab: 0.95 });
    k.addEventListener('click', () => otkryt(k.dataset.rezhim, k));
  });
  const potom = koren.querySelector('.adres__potom');
  nazhatie(potom, { masshtab: 0.95, vibro: false });
  potom.addEventListener('click', posmotretMenyu);
  nazhatie(s.nazadVverh, { masshtab: 0.9 });
  s.nazadVverh.addEventListener('click', () => { if (s && !s.zanyato) { s.zanyato = true; yadro.nazad('#/'); } });
  const blokNazad = koren.querySelector('.adres__blok-nazad');
  nazhatie(blokNazad, { masshtab: 0.9 });
  blokNazad.addEventListener('click', zakryt);

  // кнопки — каскадом 80 мс после Хинкалика (DIZAYN §4.3)
  if (!dvizhenieSnyato()) {
    const zag = koren.querySelectorAll('.adres__zagolovok, .adres__pod');
    zag.forEach((el) => el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 120, easing: pruzhina.myagkaya.easing, fill: 'backwards' }));
    tajmer(() => poyavlenieKaskadom([...knopki, potom], 80), 200);
    knopki.concat(potom).forEach((k) => { k.style.opacity = '0'; });
    tajmer(() => knopki.concat(potom).forEach((k) => { k.style.opacity = ''; }), 200);
  }
}

/** Уйти с экрана: таймеры, запросы, свой Хинкалик. */
export function ubrat() {
  if (!s) return;
  otmenitPoiskAdresa();
  s.tajmery.forEach(clearTimeout);
  try { s.hinkalik?.unichtozhit(); } catch { /* уже снят */ }
  document.querySelectorAll('.adres__prizrak').forEach((el) => el.remove());
  s = null;
}
