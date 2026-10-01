// Витрина Хинкальной v2 — оформление заказа (маршрут #/oformlenie).
// Способ (самовывоз / доставка — переключение ничего не теряет), заведение или адрес
// (тап — на #/adres, выбор возвращает сюда), время («сейчас» или «ко времени» по часам
// работы), имя, телефон с маской +7 и подсказкой, комментарий, оплата при получении
// (демо), итог. «Заказать» запоминает заказ, чистит корзину и ведёт на #/gotovo/<номер>.
// Заведение закрыто — не блокируем: оформляем ко времени (тупик 2).
// Контракт экрана — design/vitrina_v2/YADRO.md §1.

import { flip, nazhatie, pruzhina, dvizhenieSnyato, vibro, poyavlenieKaskadom, pokazatChislo } from '../dvizhenie.js';
import { otkrytoSeychas, statusRezhima, vremyaMoskvy, formatVremeni, naytiBlyudo, perenestiKorzinu, rasstoyanieKm, blizhayshieZavedeniya } from '../dannye.js';
import { tekst, chislo, rub, TONKIY, strokaPozicii } from '../kartochka.js';
import { KLYUCH_NOMERA_ZAKAZA } from '../korzina.js';
import { Hinkalik } from '../hinkalik.js';

// Плавающий Хинкалик на экране без нижней навигации закрывал суммы и поля —
// здесь свой, маленький, в шапке рядом с заголовком.
export const nastroyki = { niz: false, hinkalik: false };

/** Радиус доставки — тот же, что на экране адреса (бриф §6.3). */
const PREDEL_DOSTAVKI_KM = 7;
/** «Сейчас» предлагаем, только если до закрытия успеем приготовить и отдать с запасом. */
const ZAPAS_DO_ZAKRYTIYA = 10;
/** Пока приёма заказов нет, витрина учебная — говорим это прямо над кнопкой. */
const TEKST_DEMO = 'Демо: заказ никуда не отправится, витрина учебная';
const TEKST_OFLAYN = 'Нет сети: заказ сохранится только на телефоне, в заведение не уйдёт';

/** Черновик контактов (удобство гостя: имя и телефон не набирать заново). */
const KLYUCH_CHERNOVIKA = 'hinkalnaya.oformlenie.v2';
const SHAG_SLOTA = 30;            // минут между слотами «ко времени»
const ZAPAS_DO_SLOTA = 40;        // первый слот не раньше, чем через столько минут
const SLOTOV = 12;

// Состояние формы живёт в модуле: уход на #/adres и возврат ничего не теряют (тупик 14)
const forma = { imya: '', telefon: '', kommentariy: '', kogda: null, slot: null };
let chernovikProchitan = false;

let yadro = null;
let kontejner = null;
let niz = null;
let otpiski = [];
let pokazannayaSumma = 0;
let zakazano = false;        // заказ ушёл: очистка корзины не должна уводить на главную
let personazh = null;        // свой Хинкалик в шапке
let tajmerNastroeniya = null;

/** Хинкалик в шапке реагирует лицом и прыжком — без облачка, чтобы ничего не закрывать. */
function otreagirovat(nastroenie) {
  if (!personazh) return;
  try {
    personazh.nastroenie(nastroenie);
    personazh.pryg();
    clearTimeout(tajmerNastroeniya);
    tajmerNastroeniya = setTimeout(() => { try { personazh?.nastroenie('obychno'); } catch { /* убран */ } }, 2600);
  } catch { /* не критично */ }
}

function prochitatChernovik() {
  if (chernovikProchitan) return;
  chernovikProchitan = true;
  try {
    const d = JSON.parse(localStorage.getItem(KLYUCH_CHERNOVIKA) || 'null');
    if (d && typeof d === 'object') {
      forma.imya = String(d.imya || '');
      forma.telefon = String(d.telefon || '');
      forma.kommentariy = String(d.kommentariy || '');
    }
  } catch { /* без хранилища — просто пустые поля */ }
}

function sohranitChernovik() {
  try {
    localStorage.setItem(KLYUCH_CHERNOVIKA, JSON.stringify({ imya: forma.imya, telefon: forma.telefon, kommentariy: forma.kommentariy }));
  } catch { /* приватный режим — не страшно */ }
}

// ---------------------------------------------------------------------------
// Телефон: маска +7 (___) ___-__-__
// ---------------------------------------------------------------------------

/** Десять цифр номера без кода страны. */
function cifryTelefona(znachenie) {
  const s = String(znachenie || '').trim();
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+7')) d = d.slice(1);                                  // «+7» маски — не цифра номера
  if (d.length >= 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);   // вставили «8 916 …» целиком
  return d.slice(0, 10);
}

/** Форматирует цифры по маске по мере набора. */
function maskaTelefona(d) {
  if (!d) return '';
  let s = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) s += ')';
  if (d.length > 3) s += ` ${d.slice(3, 6)}`;
  if (d.length > 6) s += `-${d.slice(6, 8)}`;
  if (d.length > 8) s += `-${d.slice(8, 10)}`;
  return s;
}

/** Сколько цифр номера (без «7» кода страны) стоит левее позиции pos в строке. */
function cifrSleva(stroka, pos) {
  const levee = String(stroka || '').slice(0, pos);
  let n = levee.replace(/\D/g, '').length;
  if (levee.startsWith('+7')) n -= 1;
  return Math.max(0, n);
}

/** Позиция каретки сразу после n-й цифры номера в отформатированной строке. */
function poziciyaPoCifram(stroka, n) {
  const nachalo = stroka.startsWith('+7 (') ? 4 : 0;
  if (n <= 0) return Math.min(nachalo, stroka.length);
  let schet = 0;
  for (let i = nachalo; i < stroka.length; i++) {
    if (/\d/.test(stroka[i]) && ++schet === n) return i + 1;
  }
  return stroka.length;
}

// ---------------------------------------------------------------------------
// Время: «сейчас» и слоты «ко времени» по часам работы
// ---------------------------------------------------------------------------

const DNI = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

/** Сколько готовим: самое долгое блюдо корзины, не меньше 20 минут. */
function vremyaGotovki() {
  const max = yadro.korzina.pozicii.reduce((m, p) => Math.max(m, Number(p.vremya) || 0), 0);
  return Math.max(20, Math.min(60, max + 5));
}

/** Подпись момента по Москве: «14:30», «завтра 10:00», «в субботу 12:00». */
function podpisMomenta(ms, segodnyaDen) {
  const { den, minuty } = vremyaMoskvy(new Date(ms));
  const vremya = formatVremeni(minuty);
  if (den === segodnyaDen) return { korotko: vremya, polno: `сегодня к ${vremya}` };
  if (den === (segodnyaDen + 1) % 7) return { korotko: `завтра ${vremya}`, polno: `завтра к ${vremya}` };
  return { korotko: `${DNI[den].replace(/^во? /, '')} ${vremya}`, polno: `${DNI[den]} к ${vremya}` };
}

/** Слоты по 30 минут, когда заведение открыто (без заведения или без часов — любые). */
function slotyVremeni(zav) {
  const seychas = Date.now();
  const shag = SHAG_SLOTA * 60000;
  const start = Math.ceil((seychas + ZAPAS_DO_SLOTA * 60000) / shag) * shag;
  const segodnyaDen = vremyaMoskvy(new Date(seychas)).den;
  const sloty = [];
  for (let i = 0; i < 48 * 2 && sloty.length < SLOTOV; i++) {
    const t = start + i * shag;
    if (zav && zav.chasy && !otkrytoSeychas(zav, new Date(t)).otkryto) continue;
    sloty.push({ ms: t, ...podpisMomenta(t, segodnyaDen) });
  }
  return sloty;
}

// ---------------------------------------------------------------------------
// Номер заказа: дата + счётчик (детерминированно, из localStorage)
// ---------------------------------------------------------------------------

function sleduyushchiyNomer() {
  let n = 1000;
  try { n = Number(JSON.parse(localStorage.getItem(KLYUCH_NOMERA_ZAKAZA) || '1000')) || 1000; } catch { /* по умолчанию */ }
  const d = new Date();
  const data = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${data}-${String((n + 1) % 1000).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Показ
// ---------------------------------------------------------------------------

export function pokazat(kontejner_, yadro_, parametry) {
  yadro = yadro_;
  kontejner = kontejner_;
  prochitatChernovik();
  zakazano = false;
  kontejner.classList.add('ekran--bez-niza', 'oformlenie');

  if (yadro.korzina.pusta()) {
    kontejner.innerHTML = `
      <div class="ekran__shapka"><div><h1 class="ekran__zagolovok">Оформление</h1></div>
        <button class="ekran__nazad" type="button" aria-label="Назад" data-nazad><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button></div>
      <div class="pusto"><div class="pusto__zagolovok">В корзине пусто</div><p class="pusto__tekst">Соберите заказ в меню — оформим за минуту.</p></div>
      <a class="knopka knopka--glavnaya" href="#/" style="margin-top:18px"><svg width="22" height="22" aria-hidden="true"><use href="#ik-menyu"/></svg><span>К меню</span></a>`;
    kontejner.querySelector('[data-nazad]').addEventListener('click', () => yadro.nazad('#/'));
    return;
  }

  kontejner.innerHTML = `
    <div class="ekran__shapka oformlenie__shapka">
      <button class="ekran__nazad" type="button" aria-label="Назад в корзину" data-nazad><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button>
      <div class="oformlenie__hinkalik" style="position:relative;width:60px;height:60px;margin-left:auto;flex:0 0 auto"></div>
    </div>
    <div class="oformlenie__zag">
      <h1 class="ekran__zagolovok">Оформление</h1>
      <p class="ekran__pod oformlenie__pod"></p>
    </div>

    <section class="oformlenie__blok" data-blok="sposob">
      <div class="metka">Как получить</div>
      <div class="pereklyuchatel" role="tablist">
        <i class="pereklyuchatel__begunok"></i>
        <button type="button" role="tab" data-sposob="samovyvoz"><svg aria-hidden="true"><use href="#ik-sumka"/></svg>Самовывоз</button>
        <button type="button" role="tab" data-sposob="dostavka"><svg aria-hidden="true"><use href="#ik-dostavka"/></svg>Доставка</button>
      </div>
      <div class="oformlenie__mesto"></div>
      <div class="oformlenie__minimum"></div>
    </section>

    <section class="oformlenie__blok" data-blok="vremya">
      <div class="metka">Когда</div>
      <div class="oformlenie__zakryto"></div>
      <div class="vybor oformlenie__kogda"></div>
      <div class="ryad oformlenie__sloty" hidden></div>
    </section>

    <section class="oformlenie__blok" data-blok="kontakty">
      <div class="metka">Контакты</div>
      <div class="oformlenie__polya">
        <label class="pole" data-pole="imya">
          <span class="pole__metka">Имя</span>
          <input class="pole__vvod" name="imya" autocomplete="given-name" enterkeyhint="next" placeholder="Как к вам обращаться" maxlength="60">
          <span class="pole__podskazka" hidden></span>
        </label>
        <label class="pole" data-pole="telefon">
          <span class="pole__metka">Телефон</span>
          <input class="pole__vvod" name="telefon" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="+7 (___) ___-__-__" maxlength="18">
          <span class="pole__podskazka">Позвоним, только если что-то закончится</span>
        </label>
        <label class="pole pole--tekst" data-pole="kommentariy">
          <span class="pole__metka">Комментарий</span>
          <textarea class="pole__vvod" name="kommentariy" rows="3" maxlength="300" placeholder="Подъезд, этаж, без лука — всё сюда"></textarea>
        </label>
      </div>
    </section>

    <section class="oformlenie__blok" data-blok="oplata">
      <div class="metka">Оплата</div>
      <div class="kartochka-belaya oformlenie__oplata">
        <span class="oformlenie__znak"><svg aria-hidden="true"><use href="#ik-sumka"/></svg></span>
        <div><b>При получении</b><small>Картой или наличными. Предоплаты нет.</small></div>
      </div>
    </section>

    <section class="oformlenie__blok" data-blok="itog">
      <div class="metka">Заказ</div>
      <div class="kartochka-belaya oformlenie__itog">
        <div class="oformlenie__pozicii"></div>
        <div class="korzina__stroka oformlenie__skidka" style="padding-top:10px" hidden><span class="oformlenie__skidka-podpis"></span><span class="oformlenie__skidka-rub"></span></div>
        <div class="itog"><span>Итого</span><b class="itog__summa"></b></div>
      </div>
    </section>`;

  // Нижняя кнопка — в body: фиксированный элемент внутри въезжающего экрана съехал бы вместе с ним.
  // Над кнопкой всегда видно, что витрина учебная: заказ никуда не уходит (честно, не мелким шрифтом внизу).
  niz = document.createElement('div');
  niz.className = 'oformlenie__niz';
  // строка «Демо» над кнопкой — на плотной подложке, чтобы сквозь неё не просвечивал текст формы
  niz.style.background = 'linear-gradient(to top, rgb(255, 247, 236) calc(100% - 14px), rgba(255, 247, 236, 0))';
  niz.innerHTML = `
    <p class="oformlenie__set" style="font-weight:700">${TEKST_DEMO}</p>
    <button class="knopka knopka--korzina oformlenie__zakazat" type="button">
      <svg width="22" height="22" aria-hidden="true"><use href="#ik-strelka"/></svg>
      <span>Заказать</span>
      <span class="summa"><span class="summa-v">${chislo(yadro.skidka().itogo)}</span>${TONKIY}₽</span>
    </button>`;
  document.body.appendChild(niz);
  pokazannayaSumma = yadro.skidka().itogo;

  // Назад — в корзину
  const nazad = kontejner.querySelector('[data-nazad]');
  nazhatie(nazad, { masshtab: 0.9 });
  nazad.addEventListener('click', () => yadro.nazad('#/korzina'));

  try {
    personazh = new Hinkalik(kontejner.querySelector('.oformlenie__hinkalik'), { razmer: 60, plavayushchiy: false, podpis: 'Хинкалик' });
    personazh.naNazhatie?.(() => { personazh?.pryg(); vibro(8); });
  } catch { personazh = null; /* без персонажа форма всё равно понятна */ }

  navesitSposob();
  navesitPolya();
  obnovitVse();

  const zakazat = niz.querySelector('.oformlenie__zakazat');
  nazhatie(zakazat, { masshtab: 0.96 });
  zakazat.addEventListener('click', () => zakazat_());

  otpiski.push(yadro.na('gost', () => obnovitVse()));
  otpiski.push(yadro.korzina.na('izmenilas', () => {
    if (zakazano) return;
    if (yadro.korzina.pusta()) { yadro.perejti('#/', { zamenit: true }); return; }
    obnovitVse();
  }));
  const naSet = () => { const p = niz?.querySelector('.oformlenie__set'); if (p) p.textContent = navigator.onLine === false ? TEKST_OFLAYN : TEKST_DEMO; };
  window.addEventListener('online', naSet);
  window.addEventListener('offline', naSet);
  otpiski.push(() => { window.removeEventListener('online', naSet); window.removeEventListener('offline', naSet); });
  naSet();

  // Въезд: блоки лесенкой, кнопка снизу; итог «перетекает» из кнопки корзины (FLIP)
  if (!dvizhenieSnyato()) {
    poyavlenieKaskadom(kontejner.querySelectorAll('.oformlenie__blok'), 70);
    const istochnik = parametry.istochnik;
    if (istochnik && typeof istochnik.width === 'number' && !(istochnik instanceof HTMLElement)) {
      flip(istochnik, zakazat, { ms: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing, radiusOt: '16px' });
    } else {
      niz.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing });
    }
  }
}

export function ubrat() {
  otpiski.forEach((f) => { try { f(); } catch { /* уже снято */ } });
  otpiski = [];
  clearTimeout(tajmerNastroeniya);
  if (personazh) { try { personazh.unichtozhit(); } catch { /* уже убран */ } personazh = null; }
  const n = niz;
  niz = null;
  kontejner = null;
  if (!n) return undefined;
  if (dvizhenieSnyato() || !n.animate) { n.remove(); return undefined; }
  const a = n.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(40%)', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => n.remove());
}

// ---------------------------------------------------------------------------
// Способ получения и место
// ---------------------------------------------------------------------------

function navesitSposob() {
  const p = kontejner.querySelector('.pereklyuchatel');
  p.querySelectorAll('button').forEach((b) => {
    nazhatie(b, { masshtab: 0.95 });
    b.addEventListener('click', () => {
      const sposob = b.dataset.sposob;
      if (yadro.gost.sposob === sposob) return;
      vibro(8);
      yadro.obnovitGostya({ sposob });   // → событие 'gost' → obnovitVse()
    });
  });
}

function sposobSeychas() {
  return yadro.gost.sposob === 'dostavka' ? 'dostavka' : 'samovyvoz';
}

const koordinaty = (o) => o && Number.isFinite(o.shirota) && Number.isFinite(o.dolgota);

function kmTekst(km) {
  return `${km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : chislo(Math.round(km))}${TONKIY}км`;
}

/**
 * Возим ли по адресу гостя (тупик 3). Адрес мог остаться с экрана адреса, где сказали «доставки нет»
 * и выбрали самовывоз, — при переключении на доставку сверяем расстояние заново.
 * @returns {null | { km: number, zav: object|null, blizhe: {zavedenie, km}|null }} null — возим или проверить нечем
 */
function dalekoDlyaDostavki() {
  const a = yadro.gost.adres;
  if (!koordinaty(a)) return null;
  const zav = yadro.zavedenie();
  const spisok = blizhayshieZavedeniya(a.shirota, a.dolgota, yadro.menyu).filter((x) => x.km != null);
  const blizhe = spisok.find((x) => x.km <= PREDEL_DOSTAVKI_KM) || null;
  if (koordinaty(zav)) {
    const km = rasstoyanieKm(a.shirota, a.dolgota, zav.shirota, zav.dolgota);
    if (km <= PREDEL_DOSTAVKI_KM) return null;
    return { km, zav, blizhe: blizhe && blizhe.zavedenie.id !== zav.id ? blizhe : null };
  }
  if (!spisok.length || blizhe) return null;
  return { km: spisok[0].km, zav: spisok[0].zavedenie, blizhe: null };
}

/** Заведение или адрес: карточка, тап — на #/adres (экран адреса возвращает сюда по parametry.ot). */
function narisovatMesto() {
  const mesto = kontejner.querySelector('.oformlenie__mesto');
  const zav = yadro.zavedenie();
  const g = yadro.gost;
  const sposob = sposobSeychas();
  let html = '';
  if (sposob === 'dostavka') {
    if (g.adres?.tekst) {
      const daleko = dalekoDlyaDostavki();
      html = `<button class="zavedenie oformlenie__vybor" type="button" data-k-adresu>
        <span class="zavedenie__nazvanie">${tekst(g.adres.tekst)}</span>
        <span class="zavedenie__adres">${daleko ? `${daleko.zav ? `До «${tekst(daleko.zav.nazvanie)}» ` : ''}${kmTekst(daleko.km)}` : zav ? `Готовит ${tekst(zav.nazvanie)}` : 'Заведение подберём ближайшее'}</span>
        <span class="zavedenie__km oformlenie__smenit">Изменить</span></button>`;
      if (daleko && daleko.blizhe) {
        const bz = daleko.blizhe.zavedenie;
        html += `<div class="preduprezhdenie oformlenie__daleko" style="margin-top:12px">
          <b>«${tekst(daleko.zav.nazvanie)}» сюда не возит</b>
          <p>Ближе всех «${tekst(bz.nazvanie)}», ${kmTekst(daleko.blizhe.km)} — привезём оттуда. Или заберите сами.</p>
          <div class="preduprezhdenie__knopki">
            <button type="button" class="knopka knopka--glavnaya" data-blizhe="${tekst(bz.id)}">Везти из «${tekst(bz.nazvanie)}»</button>
            <button type="button" class="knopka knopka--steklo" data-sam-daleko>Заберу сам</button>
          </div></div>`;
      } else if (daleko) {
        html += `<div class="preduprezhdenie oformlenie__daleko" style="margin-top:12px">
          <b>Доставки сюда пока нет</b>
          <p>Возим до ${PREDEL_DOSTAVKI_KM}${TONKIY}км от заведения. Заберите сами — без минимальной суммы — или укажите другой адрес.</p>
          <div class="preduprezhdenie__knopki">
            <button type="button" class="knopka knopka--glavnaya" data-sam-daleko>Заберу сам</button>
            <button type="button" class="knopka knopka--steklo" data-drugoy-adres>Другой адрес</button>
          </div></div>`;
      }
    } else {
      html = `<button class="knopka knopka--steklo knopka--60 oformlenie__pusto-mesto" type="button" data-k-adresu><svg aria-hidden="true"><use href="#ik-bulavka"/></svg><span>Указать адрес доставки</span></button>`;
    }
  } else if (zav) {
    // statusRezhima: часы по умолчанию в базе = «часы уточняйте» с шафрановой точкой, не зелёное «открыто»
    const st = statusRezhima(zav);
    html = `<button class="zavedenie oformlenie__vybor vybrano${st.otkryto ? '' : ' zakryto'}${st.izvestno ? '' : ' chasy-neizvestny'}${zav.svoe === false ? ' zavedenie--partner' : ''}" type="button" data-k-adresu>
      <span class="zavedenie__nazvanie">${tekst(zav.nazvanie)}</span>
      <span class="zavedenie__adres">${tekst([zav.adres, zav.metro].filter(Boolean).join(' · '))}</span>
      <span class="zavedenie__status"><i class="oformlenie__tochka${st.izvestno ? (st.otkryto ? ' otkryto' : '') : ' zavedenie__tochka'}" aria-hidden="true"></i>${tekst(st.tekst)}</span>
      <span class="zavedenie__km oformlenie__smenit">Сменить</span></button>`;
  } else {
    html = `<button class="knopka knopka--steklo knopka--60 oformlenie__pusto-mesto" type="button" data-k-adresu><svg aria-hidden="true"><use href="#ik-bulavka"/></svg><span>Выбрать заведение</span></button>`;
  }
  if (mesto.dataset.html === html) return;
  mesto.dataset.html = html;
  mesto.innerHTML = html;
  mesto.classList.remove('oshibka');
  const knopka = mesto.querySelector('[data-k-adresu]');
  nazhatie(knopka, { masshtab: 0.97 });
  knopka.addEventListener('click', () => yadro.perejti('#/adres', { istochnik: knopka }));
  const sam = mesto.querySelector('[data-sam-daleko]');
  if (sam) {
    nazhatie(sam, { masshtab: 0.95 });
    sam.addEventListener('click', () => { vibro(8); yadro.obnovitGostya({ sposob: 'samovyvoz' }); });
  }
  const blizhe = mesto.querySelector('[data-blizhe]');
  if (blizhe) {
    nazhatie(blizhe, { masshtab: 0.95 });
    blizhe.addEventListener('click', () => { vibro(8); yadro.vybratZavedenie(blizhe.dataset.blizhe, { vozvrat: '#/oformlenie' }); });
  }
  const drugoy = mesto.querySelector('[data-drugoy-adres]');
  if (drugoy) {
    nazhatie(drugoy, { masshtab: 0.95 });
    drugoy.addEventListener('click', () => yadro.perejti('#/adres', { istochnik: knopka }));
  }
}

/** Минимальная сумма доставки: полоса и путь к самовывозу (тупик 9). */
function narisovatMinimum() {
  const blok = kontejner.querySelector('.oformlenie__minimum');
  const summa = yadro.korzina.summa();
  const min = yadro.minZakaz();
  // сюда не возят вовсе — полоса минимума только запутает, там уже блок «Доставки сюда пока нет»
  const nuzhen = sposobSeychas() === 'dostavka' && summa < min && !dalekoDlyaDostavki();
  if (!nuzhen) { blok.innerHTML = ''; blok.dataset.klyuch = ''; return; }
  const klyuch = `${summa}|${min}`;
  if (blok.dataset.klyuch === klyuch) return;
  blok.dataset.klyuch = klyuch;
  blok.innerHTML = `
    <div class="minimum">
      <div class="minimum__polosa"><i style="width:${Math.max(4, Math.round((summa / min) * 100))}%"></i></div>
      <p class="minimum__tekst">До доставки не хватает <b>${rub(min - summa)}</b> — или заберите сами, без минимума</p>
      <div class="oformlenie__min-knopki">
        <button class="knopka knopka--steklo knopka--40" type="button" data-sam><svg width="18" height="18" aria-hidden="true"><use href="#ik-sumka"/></svg><span>Заберу сам</span></button>
        <button class="knopka knopka--tihaya knopka--40" type="button" data-dobavit>Добавить блюд</button>
      </div>
    </div>`;
  const sam = blok.querySelector('[data-sam]');
  nazhatie(sam, { masshtab: 0.95 });
  sam.addEventListener('click', () => yadro.obnovitGostya({ sposob: 'samovyvoz' }));
  blok.querySelector('[data-dobavit]').addEventListener('click', () => yadro.perejti('#/korzina', { zamenit: true }));
}

// ---------------------------------------------------------------------------
// Время
// ---------------------------------------------------------------------------

function narisovatVremya() {
  const zav = yadro.zavedenie();
  const s = zav ? otkrytoSeychas(zav) : null;
  const gotovka = vremyaGotovki();
  const otkrytoVoobshche = !zav || !zav.chasy || s.otkryto;
  // Открыто, но закроется раньше, чем успеем приготовить, — «сейчас» было бы пустым обещанием
  const neUspeem = Boolean(otkrytoVoobshche && s && s.otkryto && s.doZakrytiya != null && s.doZakrytiya < gotovka + ZAPAS_DO_ZAKRYTIYA);
  const otkryto = otkrytoVoobshche && !neUspeem;
  const zakryto = kontejner.querySelector('.oformlenie__zakryto');
  if (neUspeem) {
    zakryto.innerHTML = `<div class="preduprezhdenie oformlenie__zakryto-pred"><b>${tekst(zav.nazvanie)} закрывается в ${tekst(s.zakryvaetsyaV || '')}</b><p>Приготовить сегодня уже не успеем — выберите время, оформим заранее.</p></div>`;
  } else {
    zakryto.innerHTML = otkryto ? '' : `<div class="preduprezhdenie oformlenie__zakryto-pred"><b>${tekst(zav.nazvanie)} сейчас закрыто</b><p>${s.otkroetsya ? `Откроется ${tekst(s.otkroetsya)} — оформим ко времени.` : 'Выберите время — оформим заранее.'}</p></div>`;
  }
  if (!otkryto) forma.kogda = 'ko_vremeni';
  else if (!forma.kogda) forma.kogda = 'seychas';

  const sloty = slotyVremeni(zav);
  if (forma.slot && !sloty.some((x) => x.ms === forma.slot)) forma.slot = null;
  if (forma.kogda === 'ko_vremeni' && !forma.slot && sloty.length) forma.slot = sloty[0].ms;

  const kogda = kontejner.querySelector('.oformlenie__kogda');
  const zhdat = sposobSeychas() === 'dostavka' ? `готовим ~${gotovka}${TONKIY}мин` : `~${gotovka}${TONKIY}мин`;
  const html = `
    ${otkryto ? `<button class="chip-dobavka${forma.kogda === 'seychas' ? ' vybran' : ''}" type="button" data-kogda="seychas">Сейчас<span class="plus-cena">${zhdat}</span></button>` : ''}
    <button class="chip-dobavka${forma.kogda === 'ko_vremeni' ? ' vybran' : ''}" type="button" data-kogda="ko_vremeni"><svg class="oformlenie__chasy" aria-hidden="true"><use href="#ik-chasy"/></svg>Ко времени</button>`;
  if (kogda.dataset.html !== html) {
    kogda.dataset.html = html;
    kogda.innerHTML = html;
    kogda.querySelectorAll('[data-kogda]').forEach((b) => {
      nazhatie(b, { masshtab: 0.94 });
      b.addEventListener('click', () => {
        forma.kogda = b.dataset.kogda;
        vibro(6);
        narisovatVremya();
        const vybran = kontejner.querySelector(`[data-kogda="${forma.kogda}"]`);
        if (vybran && !dvizhenieSnyato()) vybran.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
      });
    });
  }

  const ryad = kontejner.querySelector('.oformlenie__sloty');
  const pokazatSloty = forma.kogda === 'ko_vremeni';
  const bylSkryt = ryad.hidden;
  ryad.hidden = !pokazatSloty;
  if (!pokazatSloty) return;
  if (!sloty.length) {
    ryad.innerHTML = '<p class="oformlenie__net-slotov">Ближайших окон нет — напишите удобное время в комментарии.</p>';
    return;
  }
  ryad.innerHTML = sloty.map((x) => `<button class="oformlenie__slot${x.ms === forma.slot ? ' vybran' : ''}" type="button" data-slot="${x.ms}">${tekst(x.korotko)}</button>`).join('');
  ryad.querySelectorAll('[data-slot]').forEach((b) => {
    nazhatie(b, { masshtab: 0.93 });
    b.addEventListener('click', () => {
      forma.slot = Number(b.dataset.slot);
      vibro(6);
      ryad.querySelectorAll('.oformlenie__slot').forEach((x) => x.classList.toggle('vybran', x === b));
      if (!dvizhenieSnyato()) b.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: pruzhina.rezkaya.ms, easing: pruzhina.rezkaya.easing });
      obnovitPodzagolovok();
    });
  });
  if (bylSkryt) {
    poyavlenieKaskadom(ryad.children, 30, { sdvig: 10 });
    const v = ryad.querySelector('.vybran');
    if (v) ryad.scrollLeft += v.getBoundingClientRect().left - ryad.getBoundingClientRect().left - 16;
  }
}

// ---------------------------------------------------------------------------
// Поля
// ---------------------------------------------------------------------------

function navesitPolya() {
  const imya = kontejner.querySelector('[name="imya"]');
  const tel = kontejner.querySelector('[name="telefon"]');
  const komm = kontejner.querySelector('[name="kommentariy"]');
  imya.value = forma.imya;
  tel.value = maskaTelefona(cifryTelefona(forma.telefon));
  komm.value = forma.kommentariy;

  imya.addEventListener('input', () => {
    forma.imya = imya.value;
    if (forma.imya.trim()) snyatOshibku('imya');
    sohranitChernovik();
  });

  let bylo = cifryTelefona(tel.value);
  tel.addEventListener('input', (s) => {
    const syroe = tel.value;
    let kursor = null;
    try { kursor = tel.selectionStart; } catch { /* не все поля умеют */ }
    const vKonce = kursor == null || kursor >= syroe.length;
    let d = cifryTelefona(syroe);
    // сколько цифр номера левее каретки — по ним вернём её на место после маски
    let sleva = vKonce ? d.length : Math.min(d.length, cifrSleva(syroe, kursor));
    // стёрли скобку или дефис — стираем и цифру перед ним, иначе маска вернёт знак обратно
    if (s.inputType === 'deleteContentBackward' && d === bylo && d.length && sleva > 0) {
      d = d.slice(0, sleva - 1) + d.slice(sleva);
      sleva -= 1;
    }
    bylo = d;
    tel.value = maskaTelefona(d);
    const poz = vKonce ? tel.value.length : poziciyaPoCifram(tel.value, sleva);
    try { tel.setSelectionRange(poz, poz); } catch { /* не все поля умеют */ }
    forma.telefon = d;
    sohranitChernovik();
    if (d.length === 10) snyatOshibku('telefon');
  });
  tel.addEventListener('focus', () => {
    if (!tel.value) { tel.value = '+7 ('; }
  });
  // тупик 12: неполный номер — подсказка у поля сразу при уходе с него, а не молчание
  tel.addEventListener('blur', () => {
    const d = cifryTelefona(tel.value);
    if (!d.length) { tel.value = ''; return; }
    if (d.length < 10) pokazatOshibku('telefon', `Не хватает цифр: ещё ${10 - d.length}`);
  });
  komm.addEventListener('input', () => { forma.kommentariy = komm.value; sohranitChernovik(); });
  imya.addEventListener('keydown', (s) => { if (s.key === 'Enter') { s.preventDefault(); tel.focus(); } });
  tel.addEventListener('keydown', (s) => { if (s.key === 'Enter') { s.preventDefault(); komm.focus(); } });
}

function pokazatOshibku(imya, soobshchenie) {
  const pole = kontejner?.querySelector(`[data-pole="${imya}"]`);
  if (!pole) return;
  const p = pole.querySelector('.pole__podskazka');
  if (p) {
    if (!p.dataset.obychno) p.dataset.obychno = p.textContent;
    p.textContent = soobshchenie;
    p.hidden = false;
  }
  pole.classList.remove('oshibka');
  void pole.offsetWidth;   // перезапуск дрожи
  pole.classList.add('oshibka');
}

function snyatOshibku(imya) {
  const pole = kontejner?.querySelector(`[data-pole="${imya}"]`);
  if (!pole || !pole.classList.contains('oshibka')) return;
  pole.classList.remove('oshibka');
  const p = pole.querySelector('.pole__podskazka');
  if (p) {
    if (p.dataset.obychno) p.textContent = p.dataset.obychno;
    else p.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Итог и подзаголовок
// ---------------------------------------------------------------------------

function obnovitPodzagolovok() {
  const pod = kontejner?.querySelector('.oformlenie__pod');
  if (!pod) return;
  const n = yadro.korzina.kolichestvo();
  const zav = yadro.zavedenie();
  let kogda = '';
  if (forma.kogda === 'ko_vremeni' && forma.slot) kogda = podpisMomenta(forma.slot, vremyaMoskvy().den).polno;
  else kogda = sposobSeychas() === 'dostavka' ? `готовим ~${vremyaGotovki()}${TONKIY}мин` : `через ~${vremyaGotovki()}${TONKIY}мин`;
  const gde = sposobSeychas() === 'dostavka' ? 'доставка' : (zav ? `заберёте в «${zav.nazvanie}»` : 'самовывоз');
  pod.textContent = `${n} шт. · ${gde}, ${kogda}`;
}

function narisovatItog() {
  const mesto = kontejner.querySelector('.oformlenie__pozicii');
  const pozicii = yadro.korzina.pozicii;
  const klyuch = pozicii.map((p) => `${p.klyuch}:${p.kolichestvo}:${p.cena}`).join('|');
  if (mesto.dataset.klyuch !== klyuch) {
    mesto.dataset.klyuch = klyuch;
    mesto.innerHTML = '';
    pozicii.forEach((p) => {
      const s = strokaPozicii(p, yadro);
      const b = naytiBlyudo(yadro.menyu, p.blyudoId);
      if (!b || yadro.prichina(b)) s.classList.add('nedostupna');
      mesto.appendChild(s);
    });
  }
  // скидка самовывоза (акция «Самовывоз» из базы — её обещают сторис); при доставке строки нет
  const sk = yadro.skidka();
  const stroka = kontejner.querySelector('.oformlenie__skidka');
  stroka.hidden = !sk.rub;
  if (sk.rub) {
    stroka.querySelector('.oformlenie__skidka-podpis').textContent = `Самовывоз −${sk.procent}${TONKIY}%`;
    stroka.querySelector('.oformlenie__skidka-rub').textContent = `−${rub(sk.rub)}`;
  }
  kontejner.querySelector('.itog__summa').textContent = rub(sk.itogo);
  const v = niz?.querySelector('.summa-v');
  if (v) {
    pokazatChislo(v, pokazannayaSumma, sk.itogo, 420, (x) => chislo(x));
    pokazannayaSumma = sk.itogo;
  }
}

function obnovitVse() {
  if (!kontejner || !kontejner.querySelector('.pereklyuchatel')) return;
  const sposob = sposobSeychas();
  const p = kontejner.querySelector('.pereklyuchatel');
  p.classList.toggle('vtoroy', sposob === 'dostavka');
  p.querySelectorAll('button').forEach((b) => {
    const akt = b.dataset.sposob === sposob;
    b.classList.toggle('aktiven', akt);
    b.setAttribute('aria-selected', String(akt));
  });
  narisovatMesto();
  narisovatMinimum();
  narisovatVremya();
  narisovatItog();
  obnovitPodzagolovok();
}

// ---------------------------------------------------------------------------
// Заказать
// ---------------------------------------------------------------------------

function prokrutitK(element) {
  if (!element) return;
  const y = element.getBoundingClientRect().top + window.scrollY - 90;
  try { window.scrollTo({ top: Math.max(0, y), behavior: dvizhenieSnyato() ? 'auto' : 'smooth' }); } catch { window.scrollTo(0, y); }
}

/** Перезапуск дрожи у блока с ошибкой. */
function drozh(el) {
  if (!el) return;
  el.classList.remove('oshibka');
  void el.offsetWidth;
  el.classList.add('oshibka');
  // у блока места дрожь в CSS (.oformlenie__mesto.oshibka), остальным — тем же рисунком здесь
  if (!el.classList.contains('oformlenie__mesto') && el.animate && !dvizhenieSnyato()) {
    el.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 400, easing: 'ease-out' });
  }
}

function zakazat_() {
  // двойной тап: второй клик приходит, когда экран уже убран
  if (zakazano || !kontejner || !niz) return;
  const zav = yadro.zavedenie();
  const sposob = sposobSeychas();
  const oshibki = [];

  // Место: без заведения / адреса заказать некуда — показываем, где выбрать.
  // Тексты ошибок — у самих полей и в карточках; облачко Хинкалика ничего не закрывает.
  const mesto = kontejner.querySelector('.oformlenie__mesto');
  if ((sposob === 'samovyvoz' && !zav) || (sposob === 'dostavka' && !yadro.gost.adres?.tekst)) {
    drozh(mesto);
    oshibki.push({ el: mesto, tost: sposob === 'dostavka' ? 'Куда везти? Укажите адрес' : 'Откуда заберёте? Выберите заведение' });
  } else if (sposob === 'dostavka' && dalekoDlyaDostavki()) {
    // тупик 3: по адресу, куда не возим, заказ на доставку не принимаем
    drozh(mesto);
    oshibki.push({ el: mesto, tost: 'Сюда пока не возим — можно забрать самим' });
  }
  // Недобор на доставку — карточка минимума уже говорит, сколько не хватает, и предлагает самовывоз
  const blokMinimuma = kontejner.querySelector('.oformlenie__minimum .minimum');
  if (sposob === 'dostavka' && yadro.korzina.summa() < yadro.minZakaz() && blokMinimuma) {
    drozh(blokMinimuma);
    oshibki.push({ el: kontejner.querySelector('.oformlenie__minimum') });
  }
  if (!forma.imya.trim()) {
    pokazatOshibku('imya', 'Напишите имя — так вас узнают на выдаче');
    oshibki.push({ el: kontejner.querySelector('[data-pole="imya"]') });
  }
  const d = cifryTelefona(forma.telefon);
  if (d.length < 10) {
    pokazatOshibku('telefon', d.length ? `Не хватает цифр: ещё ${10 - d.length}` : 'Нужен телефон — позвоним, если что-то закончится');
    oshibki.push({ el: kontejner.querySelector('[data-pole="telefon"]') });
  }
  // Блюда, которых в заведении нет, — сначала разобрать на переносе (тупик 1)
  if (!oshibki.length && zav) {
    const rezultat = perenestiKorzinu(yadro.korzina.pozicii, zav.id, yadro.menyu);
    if (rezultat.propalo.length) {
      yadro.perenos = { zavedenieId: zav.id, rezultat, vozvrat: '#/oformlenie', bylo: zav.id };
      yadro.perejti('#/perenos');
      return;
    }
  }
  if (oshibki.length) {
    vibro([30, 40, 30]);
    prokrutitK(oshibki[0].el);
    otreagirovat('udivlen');
    if (oshibki[0].tost) yadro.tost(oshibki[0].tost, { vid: 'oshibka' });
    const pervoe = oshibki[0].el?.querySelector?.('input');
    if (pervoe) setTimeout(() => pervoe.focus({ preventScroll: true }), 350);
    return;
  }

  const nomer = sleduyushchiyNomer();
  const kogda = forma.kogda === 'ko_vremeni' && forma.slot
    ? { tip: 'ko_vremeni', ms: forma.slot, podpis: podpisMomenta(forma.slot, vremyaMoskvy().den).polno }
    : { tip: 'seychas', minut: vremyaGotovki() };
  const zapis = yadro.korzina.zapomnitZakaz({
    nomerPokaz: nomer,
    imya: forma.imya.trim(),
    telefon: maskaTelefona(d),
    kommentariy: forma.kommentariy.trim(),
    kogda_poluchit: kogda,
    zavedenieNazvanie: zav?.nazvanie || null,
    oplata: 'pri_poluchenii',
    otlozhen: navigator.onLine === false,
    skidka: yadro.skidka(),   // {procent, rub, itogo} — «готово» показывает итог к оплате
  });
  if (!zapis) { yadro.perejti('#/', { zamenit: true }); return; }
  vibro([10, 40, 20]);
  forma.kogda = null;
  forma.slot = null;
  const knopka = niz?.querySelector('.oformlenie__zakazat');
  const rect = knopka ? knopka.getBoundingClientRect() : null;
  // сначала уходим на «готово» (ядро снимет наши подписки), потом чистим корзину — экран не мигнёт пустым
  zakazano = true;
  const k = yadro.korzina;
  Promise.resolve(yadro.perejti(`#/gotovo/${encodeURIComponent(zapis.nomerPokaz || nomer)}`, { zamenit: true, istochnik: rect }))
    .finally(() => k.ochistit());
}
