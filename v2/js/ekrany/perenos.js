// Витрина Хинкальной v2 — «Переносим заказ» (#/perenos).
// Бриф §6 тупики 1, 8, 13; DIZAYN §3.18, §4.3, §7 (№14–16).
// Гость сменил заведение при непустой корзине (или меню обновилось): показываем три группы —
// что остаётся, у чего другая цена (было → стало), чего здесь нет (с заменами в один тап или «убрать»).
// Ничего не удаляется без показа. «Продолжить с тем, что есть» → yadro.zavershitPerenos(resheniya).
// Контракт экрана — design/vitrina_v2/YADRO.md §1, хук переноса — §3.

import { nazhatie, poyavlenieKaskadom, flip, pokazatChislo, pruzhina, dvizhenieSnyato, vibro } from '../dvizhenie.js';
import { naytiZavedenie, cenaV } from '../dannye.js';
import { Hinkalik } from '../hinkalik.js';
import { rub, chislo, tekst, strokaPozicii, miniKartochka } from '../kartochka.js';
import { summaPozicii } from '../korzina.js';

/** Состояние живого экрана; null — экрана нет. */
let s = null;

// ---------------------------------------------------------------------------
// Счёт
// ---------------------------------------------------------------------------

/** Позиция-замена: то же количество, цена заведения переноса (добавок в базе нет). */
function poziciyaZameny(blyudo, byla, zavedenieId) {
  return {
    klyuch: `zamena-${byla.klyuch}`,
    blyudoId: blyudo.id,
    nazvanie: blyudo.nazvanie,
    cena: cenaV(blyudo, zavedenieId),
    kolichestvo: byla.kolichestvo,
    dobavki: [],
    foto: blyudo.foto,
    cvet: blyudo.cvet,
    razdelId: blyudo.razdelId || blyudo.razdel?.id,
    razdel: blyudo.razdel,
  };
}

/** Сумма после переноса с учётом выбранных замен. */
function summaPosle() {
  const r = s.p.rezultat;
  let summa = (r.ostaetsya || []).reduce((acc, p) => acc + summaPozicii(p), 0);
  for (const propazha of r.propalo || []) {
    const reshenie = s.resheniya[propazha.poziciya.klyuch];
    if (!reshenie || !reshenie.startsWith('zamena:')) continue;
    const b = propazha.zameny.find((z) => z.id === reshenie.slice(7));
    if (b) summa += cenaV(b, s.p.zavedenieId) * propazha.poziciya.kolichestvo;
  }
  return summa;
}

/** Кнопка внизу: текст и сумма (цифры крутятся). */
function obnovitNiz(animirovat = true) {
  if (!s) return;
  const r = s.p.rezultat;
  const summa = summaPosle();
  const nereshennye = (r.propalo || []).filter((x) => !String(s.resheniya[x.poziciya.klyuch] || '').startsWith('zamena:')).length;
  const nichego = summa <= 0;
  s.tekstKnopki.textContent = nichego
    ? 'Продолжить без этих блюд'
    : nereshennye ? 'Продолжить с тем, что есть' : 'Продолжить';
  s.summaEl.hidden = nichego;
  if (!nichego) pokazatChislo(s.summaEl, animirovat ? s.pokazannayaSumma : summa, summa, 420, (n) => rub(n));
  s.pokazannayaSumma = summa;
}

// ---------------------------------------------------------------------------
// Группы
// ---------------------------------------------------------------------------

function gruppa(metka, klass) {
  const el = document.createElement('section');
  el.className = `perenos__gruppa ${klass}`;
  el.innerHTML = `<h2 class="metka">${metka}</h2>`;
  return el;
}

/** «ОСТАЁТСЯ» — тонкие строки. */
function gruppaOstaetsya(pozicii) {
  const g = gruppa(`Остаётся · ${pozicii.length}`, 'perenos__ostaetsya');
  const karta = document.createElement('div');
  karta.className = 'kartochka-belaya perenos__karta';
  pozicii.forEach((p) => karta.appendChild(strokaPozicii(p, s.yadro)));
  g.appendChild(karta);
  return g;
}

/** «ЦЕНА ИЗМЕНИЛАСЬ» — было зачёркнуто → стало. */
function gruppaCena(spisok) {
  const g = gruppa(`Цена другая · ${spisok.length}`, 'perenos__cena');
  const karta = document.createElement('div');
  karta.className = 'kartochka-belaya perenos__karta';
  for (const { poziciya, bylo, stalo } of spisok) {
    const stroka = strokaPozicii(poziciya, s.yadro);
    const tekstEl = stroka.querySelector('.poziciya__tekst');
    tekstEl.insertAdjacentHTML('beforeend',
      `<span class="bylo-stalo${stalo < bylo ? ' deshevle' : ''}"><s>${rub(bylo)}</s><span aria-hidden="true">→</span><b>${rub(stalo)}</b><small>${stalo < bylo ? 'дешевле' : 'дороже'}</small></span>`);
    karta.appendChild(stroka);
  }
  g.appendChild(karta);
  return g;
}

/** «ЗДЕСЬ НЕТ» — карточки пропавших блюд с заменами. */
function gruppaPropalo(spisok) {
  const g = gruppa(`Здесь нет · ${spisok.length}`, 'perenos__propalo');
  for (const propazha of spisok) {
    const karta = document.createElement('div');
    karta.className = 'propalo';
    karta.dataset.klyuch = propazha.poziciya.klyuch;
    g.appendChild(karta);
    narisovatPropazhu(karta, propazha, null);
  }
  return g;
}

/** Подпись причины: «нет в этом заведении» / «закончилось сегодня». */
function prichinaTekstom(prichina) {
  return prichina === 'stop' ? 'закончилось сегодня' : 'в этом заведении не готовят';
}

/**
 * Рисует карточку пропавшего блюда в одном из трёх состояний:
 * решения нет (пропажа + замены + «Убрать»), выбрана замена, решено убрать.
 * @param {HTMLElement} karta
 * @param {object} propazha {poziciya, prichina, zameny}
 * @param {DOMRect|null} otkuda откуда прилетает плитка замены (FLIP)
 */
function narisovatPropazhu(karta, propazha, otkuda) {
  const { yadro, p } = s;
  const poz = propazha.poziciya;
  const reshenie = s.resheniya[poz.klyuch] || null;
  const zamena = reshenie?.startsWith('zamena:') ? propazha.zameny.find((z) => z.id === reshenie.slice(7)) : null;
  karta.classList.toggle('propalo--zamena', Boolean(zamena));
  karta.classList.toggle('propalo--ubrano', reshenie === 'ubrat');
  karta.innerHTML = '';

  if (zamena) {
    const nova = poziciyaZameny(zamena, poz, p.zavedenieId);
    const stroka = strokaPozicii(nova, yadro);
    stroka.querySelector('.poziciya__meta').insertAdjacentHTML('beforeend', `<span class="perenos__vmesto">вместо «${tekst(poz.nazvanie)}»</span>`);
    karta.appendChild(stroka);
    karta.appendChild(knopkaTihaya('Вернуть как было', () => reshit(karta, propazha, null)));
    if (otkuda && !dvizhenieSnyato()) {
      flip(otkuda, stroka.querySelector('.mini-plitka'), { ms: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing, radiusOt: '16px' });
      stroka.querySelector('.poziciya__tekst').animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 120, easing: 'ease-out', fill: 'backwards' });
    }
    return;
  }

  const stroka = strokaPozicii(poz, yadro);
  stroka.classList.add('nedostupna');
  stroka.querySelector('.poziciya__meta').insertAdjacentHTML('beforeend',
    `<span class="perenos__prichina">${reshenie === 'ubrat' ? 'уберём из заказа' : prichinaTekstom(propazha.prichina)}</span>`);
  const cena = stroka.querySelector('.poziciya__cena');
  cena.outerHTML = `<span class="bejdzh">${propazha.prichina === 'stop' ? 'стоп' : 'нет'}</span>`;
  karta.appendChild(stroka);

  if (reshenie === 'ubrat') {
    karta.appendChild(knopkaTihaya('Вернуть', () => reshit(karta, propazha, null)));
    return;
  }

  if (propazha.zameny.length) {
    const podpis = document.createElement('div');
    podpis.className = 'perenos__pohozhee';
    podpis.textContent = 'Похожее здесь — заменить в один тап';
    karta.appendChild(podpis);
    const ryad = document.createElement('div');
    ryad.className = 'zameny';
    for (const b of propazha.zameny) {
      const mk = miniKartochka(b, yadro, {
        knopka: 'zamenit',
        naKnopku: (blyudo, plitkaEl) => zamenit(karta, propazha, blyudo, plitkaEl),
        naNazhatie: (blyudo, plitkaEl) => zamenit(karta, propazha, blyudo, plitkaEl),
      });
      // цена — заведения, куда переносим (ядро ещё считает старое заведение)
      const chisloEl = mk.querySelector('.cena__chislo');
      if (chisloEl) chisloEl.textContent = chislo(cenaV(b, p.zavedenieId));
      mk.querySelector('.cena__utochnit')?.remove();
      ryad.appendChild(mk);
    }
    karta.appendChild(ryad);
  } else {
    karta.insertAdjacentHTML('beforeend', '<p class="perenos__pohozhee">Похожего здесь нет</p>');
  }
  karta.appendChild(knopkaTihaya('Убрать', () => reshit(karta, propazha, 'ubrat')));
}

function knopkaTihaya(nadpis, naNazhatie) {
  const k = document.createElement('button');
  k.type = 'button';
  k.className = 'knopka knopka--tihaya propalo__deystvie';
  k.textContent = nadpis;
  nazhatie(k, { masshtab: 0.95, vibro: false });
  k.addEventListener('click', naNazhatie);
  return k;
}

function zamenit(karta, propazha, blyudo, plitkaEl) {
  if (!s) return;
  vibro([8, 30, 8]);
  const otkuda = plitkaEl?.getBoundingClientRect() || null;
  s.resheniya[propazha.poziciya.klyuch] = `zamena:${blyudo.id}`;
  narisovatPropazhu(karta, propazha, otkuda);
  obnovitNiz();
  if (!s.skazalZamena) {
    s.skazalZamena = true;
    skazat('Хороший выбор', 'rad', 2600);
  }
}

function reshit(karta, propazha, reshenie) {
  if (!s) return;
  vibro(8);
  if (reshenie) s.resheniya[propazha.poziciya.klyuch] = reshenie;
  else delete s.resheniya[propazha.poziciya.klyuch];
  narisovatPropazhu(karta, propazha, null);
  if (!dvizhenieSnyato()) karta.animate([{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing });
  obnovitNiz();
}

function skazat(tekstRepliki, nastroenie = 'obychno', ms = 0) {
  const h = s?.hinkalik;
  if (!h) return;
  try { h.nastroenie(nastroenie); h.skazat(tekstRepliki, ms); } catch { /* персонаж не критичен */ }
}

// ---------------------------------------------------------------------------
// Экран
// ---------------------------------------------------------------------------

/**
 * Показать экран переноса. Читает yadro.perenos; нет его (прямая ссылка) — назад.
 * @param {HTMLElement} kontejner <section class="ekran ekran--perenos">
 * @param {object} yadro
 */
export function pokazat(kontejner, yadro, parametry = {}) {
  const p = yadro.perenos;
  if (!p || !p.rezultat) {
    yadro.nazad('#/');
    return;
  }
  kontejner.classList.add('ekran--bez-niza');
  const r = p.rezultat;
  const menyu = yadro.menyu;
  const kuda = p.zavedenieId ? naytiZavedenie(menyu, p.zavedenieId) : null;
  const otkuda = p.bylo && p.bylo !== p.zavedenieId ? naytiZavedenie(menyu, p.bylo) : null;
  const klyuchiCeny = new Set((r.izmenilasCena || []).map((x) => x.poziciya.klyuch));
  const ostaetsya = (r.ostaetsya || []).filter((x) => !klyuchiCeny.has(x.klyuch));

  const put = p.priZapuske
    ? `Меню обновилось${kuda ? ` · <b>${tekst(kuda.nazvanie)}</b>` : ''}`
    : `${otkuda ? `${tekst(otkuda.nazvanie)} <span aria-hidden="true">→</span> ` : 'в '}<b>${tekst(kuda?.nazvanie || 'новое заведение')}</b>`;

  kontejner.innerHTML = `
    <div class="perenos">
      <div class="perenos__verh">
        ${p.priZapuske ? '' : '<button type="button" class="ekran__nazad perenos__nazad" aria-label="Не переносить"><svg aria-hidden="true"><use href="#ik-nazad"/></svg></button>'}
        <div class="perenos__hinkalik"></div>
      </div>
      <h1 class="ekran__zagolovok">Переносим заказ</h1>
      <p class="ekran__pod perenos__put">${put}</p>
      <div class="perenos__gruppy"></div>
      <div class="perenos__niz" style="background:linear-gradient(180deg, rgba(255, 239, 214, 0), rgb(255, 239, 214) 30%)">
        <button type="button" class="knopka knopka--korzina knopka--60 perenos__dalshe">
          <span class="perenos__tekst-knopki"></span><span class="summa"></span>
        </button>
        ${p.priZapuske ? '' : '<button type="button" class="knopka knopka--tihaya perenos__drugoe">Выбрать другое заведение</button>'}
      </div>
    </div>`;

  const koren = kontejner.querySelector('.perenos');
  const knopka = koren.querySelector('.perenos__dalshe');
  s = {
    yadro,
    p,
    resheniya: {},
    hinkalik: null,
    tekstKnopki: knopka.querySelector('.perenos__tekst-knopki'),
    summaEl: knopka.querySelector('.summa'),
    pokazannayaSumma: r.summaBylo || 0,
    tajmery: [],
    zanyato: false,
    skazalZamena: false,
  };

  // Группы: остаётся, цена другая, здесь нет — каскадом 90 мс (DIZAYN §4.3)
  const mestoGrupp = koren.querySelector('.perenos__gruppy');
  const gruppy = [];
  if (ostaetsya.length) gruppy.push(gruppaOstaetsya(ostaetsya));
  if (r.izmenilasCena?.length) gruppy.push(gruppaCena(r.izmenilasCena));
  if (r.propalo?.length) gruppy.push(gruppaPropalo(r.propalo));
  gruppy.forEach((g) => mestoGrupp.appendChild(g));
  poyavlenieKaskadom(gruppy, 90);

  obnovitNiz(false);
  if (!dvizhenieSnyato() && r.summaBylo) {
    // сумма «переезжает» из старой в новую — видно, что пересчитали
    s.pokazannayaSumma = r.summaBylo;
    s.tajmery.push(setTimeout(() => obnovitNiz(true), 450));
  }

  // Хинкалик 72 px справа, облачко слева от него
  try {
    s.hinkalik = new Hinkalik(koren.querySelector('.perenos__hinkalik'), { razmer: 72, plavayushchiy: false });
    s.hinkalik.naNazhatie?.(() => s?.hinkalik?.pryg());
  } catch (oshibka) { console.error('Перенос: Хинкалик не нарисовался', oshibka); }
  const estZameny = (r.propalo || []).some((x) => x.zameny.length);
  const replika = r.propalo?.length
    ? (estZameny ? ['Тут этого нет, но есть похожее', 'dumaet'] : ['Тут этого нет — остальное перенесём', 'grustno'])
    : ['Здесь цены немного другие', 'udivlen'];
  s.tajmery.push(setTimeout(() => skazat(replika[0], replika[1]), dvizhenieSnyato() ? 0 : 420));

  nazhatie(knopka, { masshtab: 0.96 });
  knopka.addEventListener('click', () => {
    if (!s || s.zanyato) return;
    s.zanyato = true;
    vibro([10, 30, 10]);
    const nazvanie = kuda?.nazvanie;
    const itog = yadro.zavershitPerenos({ ...s.resheniya });
    if (itog && nazvanie) yadro.tost(`Заказ перенесён · ${nazvanie}`, { vid: 'uspeh' });
  });
  const nazad = koren.querySelector('.perenos__nazad');
  if (nazad) {
    nazhatie(nazad, { masshtab: 0.9 });
    nazad.addEventListener('click', () => { if (s && !s.zanyato) { s.zanyato = true; yadro.otmenitPerenos(); } });
  }
  const drugoe = koren.querySelector('.perenos__drugoe');
  if (drugoe) {
    nazhatie(drugoe, { masshtab: 0.95, vibro: false });
    drugoe.addEventListener('click', () => {
      if (!s || s.zanyato) return;
      s.zanyato = true;
      // адрес встаёт на место переноса и помнит, куда потом вернуться (оформление, корзина, меню);
      // сам перенос ядро забудет, уходя с маршрута
      yadro.perejti('#/adres', { zamenit: true, vozvrat: p.vozvrat || '#/' });
    });
  }

  // Название выбранного заведения перетекает в подзаголовок (DIZAYN §4.5)
  const rect = parametry.istochnikRect;
  const cel = koren.querySelector('.perenos__put b');
  if (rect && cel && !dvizhenieSnyato()) {
    const r = cel.getBoundingClientRect();
    if (r.width > 0) {
      const m = Math.min(1.6, Math.max(0.6, rect.height / Math.max(1, r.height)));
      cel.style.display = 'inline-block';
      cel.style.transformOrigin = '0 0';
      cel.animate(
        [
          { transform: `translate(${rect.left - r.left}px, ${rect.top - r.top}px) scale(${m})`, opacity: 0.4 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        { duration: pruzhina.obychnaya.ms || 520, easing: pruzhina.obychnaya.easing },
      );
    }
  }
}

/** Уйти с экрана: таймеры и свой Хинкалик. */
export function ubrat() {
  if (!s) return;
  s.tajmery.forEach(clearTimeout);
  try { s.hinkalik?.unichtozhit(); } catch { /* уже снят */ }
  s = null;
}

