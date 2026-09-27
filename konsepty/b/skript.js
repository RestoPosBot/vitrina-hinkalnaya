// Концепт «Стекло и крем» — скрипт пруфа главного экрана.
// Данные настоящие: ../../menyu.json. Показываем заведение «Савёловская»
// и первые три раздела. Движение: живой фон на canvas, пружины через WAAPI linear(),
// каскад карточек, параллакс заголовков, капля в навигации, Хинкалик.

const ZAVEDENIE_NAZVANIE = 'Савёловская';
const SKOLKO_RAZDELOV = 3;
const KOREN_VITRINY = '../../';
// ?bezfoto — не подключать <img> вовсе: проверка консоли без 404 от ещё не сгенерированных снимков
const BEZ_FOTO = new URL(location.href).searchParams.has('bezfoto');

const umenshitDvizhenie = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Пружины ----------

// Аппроксимация затухающей пружины строкой linear(...) для WAAPI и CSS.
function sdelatPruzhinu(zhestkost, zatuhanie, massa = 1) {
  const w0 = Math.sqrt(zhestkost / massa);
  const zeta = zatuhanie / (2 * Math.sqrt(zhestkost * massa));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const dlitelnost = Math.min(1.6, 5 / (zeta * w0)); // секунд до покоя
  const tochek = 48;
  const tochki = [];
  for (let i = 0; i <= tochek; i++) {
    const t = (i / tochek) * dlitelnost;
    const x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
    tochki.push(x.toFixed(4));
  }
  tochki[tochek] = '1';
  return { easing: `linear(${tochki.join(',')})`, ms: Math.round(dlitelnost * 1000) };
}

const podderzhkaLinear = CSS.supports('animation-timing-function', 'linear(0, 1)');
const pruzhina = {
  myagkaya: podderzhkaLinear ? sdelatPruzhinu(120, 20) : { easing: 'cubic-bezier(.22,1,.36,1)', ms: 600 },
  obychnaya: podderzhkaLinear ? sdelatPruzhinu(170, 18) : { easing: 'cubic-bezier(.34,1.56,.64,1)', ms: 500 },
  zhivaya: podderzhkaLinear ? sdelatPruzhinu(210, 13) : { easing: 'cubic-bezier(.34,1.56,.64,1)', ms: 650 },
};
document.documentElement.style.setProperty('--pruzhina', pruzhina.obychnaya.easing);
document.documentElement.style.setProperty('--pruzhina-myagkaya', pruzhina.myagkaya.easing);

function vibro(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* не страшно */ } }
}

// Отклик на касание: вниз — сжатие, вверх — пружина с перелётом.
function nazhatie(element, masshtab = .96) {
  if (umenshitDvizhenie) return;
  let nazhat = false;
  element.addEventListener('pointerdown', () => {
    nazhat = true;
    element.animate([{ transform: 'scale(1)' }, { transform: `scale(${masshtab})` }],
      { duration: 110, easing: 'ease-out', fill: 'forwards' });
  });
  const otpustit = () => {
    if (!nazhat) return;
    nazhat = false;
    element.animate([{ transform: `scale(${masshtab})` }, { transform: 'scale(1)' }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, fill: 'forwards' });
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(s => element.addEventListener(s, otpustit));
}

// ---------- Живой фон ----------

class FonMesh {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pyatna = [
      { cvet: '255, 159, 90',  x: .12, y: .10, r: .62, sk: .00011, faza: 0.0 },   // персик
      { cvet: '244, 199, 122', x: .88, y: .28, r: .58, sk: .00009, faza: 1.9 },   // мёд
      { cvet: '242, 107, 138', x: .72, y: .82, r: .60, sk: .00013, faza: 3.7 },   // малина
      { cvet: '111, 191, 115', x: .16, y: .68, r: .50, sk: .00010, faza: 5.1, sila: .72 },   // эстрагон — мягче остальных
    ];
    this.posledniy = 0;
    this.aktiven = true;
    this.izmerit();
    addEventListener('resize', () => this.izmerit());
    document.addEventListener('visibilitychange', () => { this.aktiven = !document.hidden; if (this.aktiven) requestAnimationFrame(t => this.kadr(t)); });
    if (umenshitDvizhenie) this.risovat(0); else requestAnimationFrame(t => this.kadr(t));
  }
  izmerit() {
    // Canvas маленький, растягивается CSS — размытие бесплатно
    const w = 72;
    this.canvas.width = w;
    this.canvas.height = Math.max(40, Math.round(w * innerHeight / innerWidth));
    this.risovat(performance.now());
  }
  kadr(t) {
    if (!this.aktiven) return;
    if (t - this.posledniy > 1000 / 26) { this.posledniy = t; this.risovat(t); }
    requestAnimationFrame(tt => this.kadr(tt));
  }
  risovat(t) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const sdvig = (scrollY / innerHeight) * h * .08;
    ctx.fillStyle = '#FFF4E4';
    ctx.fillRect(0, 0, w, h);
    for (const p of this.pyatna) {
      const x = (p.x + .10 * Math.sin(t * p.sk + p.faza)) * w;
      const y = (p.y + .09 * Math.cos(t * p.sk * 1.27 + p.faza)) * h - sdvig;
      const r = p.r * Math.max(w, h) * (1 + .06 * Math.sin(t * p.sk * .7 + p.faza));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const sila = p.sila || 1;
      g.addColorStop(0, `rgba(${p.cvet}, ${(.92 * sila).toFixed(2)})`);
      g.addColorStop(.55, `rgba(${p.cvet}, ${(.38 * sila).toFixed(2)})`);
      g.addColorStop(1, `rgba(${p.cvet}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

// ---------- Данные ----------

function semeystvoRazdela(nazvanie) {
  const n = nazvanie.toLowerCase();
  if (/хинкали|пирог|заморозк/.test(n)) return 'testo';
  if (/шашлык|угл|горяч/.test(n)) return 'zhar';
  if (/салат|холодн|гарнир|соус/.test(n)) return 'zelen';
  if (/десерт|сок/.test(n)) return 'sladkoe';
  if (/бар|вино|виски|водка|коньяк|текила|шампан/.test(n)) return 'vino';
  if (/комбо/.test(n)) return 'kombo';
  return 'testo';
}

const PODPISI_SEMEYSTV = {
  testo: 'из теста', zhar: 'на углях', zelen: 'свежее', sladkoe: 'сладкое', vino: 'бар', kombo: 'наборы',
};

// Значки семейств — простые контурные SVG
const ZNACHKI = {
  testo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.5 3.5 6.5 5.5 6.5 10.5a6.5 6.5 0 0 1-13 0C5.5 8.5 9.5 6.5 12 3z"/><path d="M12 3v10M9 6.5l3 6.5M15 6.5l-3 6.5"/></svg>',
  zhar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s5.5 4.5 5.5 10a5.5 5.5 0 0 1-11 0c0-2.5 1.5-4.5 2.5-5.5 0 2 1 3.5 2.5 3.5C12.5 9 11 6 12 3z"/></svg>',
  zelen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z"/><path d="M4 20l9-9"/></svg>',
  sladkoe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5-8-11a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11z"/></svg>',
  vino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v7M8 20h8"/></svg>',
  kombo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>',
};

// Водяные знаки семейств — крупные заливки для плитки без фото
const ZNAKI_FONA = {
  // хинкали: мешочек с хвостиком, складки — прорези
  testo: '<svg viewBox="0 0 64 64" fill="currentColor" fill-rule="evenodd"><path d="M32 3c2.6 0 4.6 2.4 3.6 5.4-.9 2.8-1.5 5.6-.7 9.2C45 21.2 55 30 55 43c0 10.5-10.3 17-23 17S9 53.5 9 43c0-13 10-21.8 20.1-25.4.8-3.6.2-6.4-.7-9.2C27.4 5.4 29.4 3 32 3zm0 16.5c-1 5-1 13-1 23h2c0-10 0-18-1-23zm-4.2.9c-4.5 4.4-7.7 11-8.6 21l1.9.3c.9-9.5 3.8-15.6 7.8-19.8zm8.4 0-1.1 1.5c4 4.2 6.9 10.3 7.8 19.8l1.9-.3c-.9-10-4.1-16.6-8.6-21z"/></svg>',
  zhar: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M35 3c1.5 10.5 13 15.5 13 30 0 11-7.5 20-16.5 20S15 44 15 34c0-6.5 3.3-11.4 7-14.8-.3 6.2 2.4 9.6 6.2 9.8C31.8 21 25.8 13.4 35 3z"/></svg>',
  zelen: '<svg viewBox="0 0 64 64" fill="currentColor" fill-rule="evenodd"><path d="M57 7C30 5 8 22 8 55c1 1 1.6 1.4 3 2C42 58 61 38 57 7zM14 51c7-14 18-25 33-34-15 7-27 19-35 34z"/></svg>',
  sladkoe: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 57S6 41 6 22.5A13 13 0 0 1 32 17a13 13 0 0 1 26 5.5C58 41 32 57 32 57z"/></svg>',
  vino: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M15 5h34l-2.6 23A14.5 14.5 0 0 1 35 41.8V54h10v5H19v-5h10V41.8A14.5 14.5 0 0 1 17.6 28z"/></svg>',
  kombo: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 4l8.3 18.2L60 24.5 45 38l4.2 19.8L32 47.6 14.8 57.8 19 38 4 24.5l19.7-2.3z"/></svg>',
};

// Детерминированный хеш строки — чтобы у каждого блюда была своя плитка, но одна и та же при каждом открытии
function hesh(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PLYUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const MINUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';

function cenaV(blyudo, zavedenieId) {
  const z = blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  return z && typeof z.cena === 'number' ? z.cena : blyudo.cena;
}
function dostupnoV(blyudo, zavedenieId) {
  const z = blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  return !!z && !z.stop;
}
function formatCeny(n) {
  return n.toLocaleString('ru-RU') + ' ₽';
}
function chasyZavedeniya(zavedenie, data = new Date()) {
  const klyuchi = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const segodnya = zavedenie.chasy && zavedenie.chasy[klyuchi[data.getDay()]];
  if (!segodnya) return 'сегодня выходной';
  const minutSeychas = data.getHours() * 60 + data.getMinutes();
  // В базе встречаются хвосты вроде 1321 (22:01) — округляем до 5 минут для витрины
  const okruglit = m => Math.round(m / 5) * 5;
  const vremya = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [ot, doo] = segodnya.map(okruglit);
  if (minutSeychas < ot) return `откроется в ${vremya(ot)}`;
  if (minutSeychas >= doo) return 'закрыто, откроется завтра';
  return `открыто до ${vremya(doo)}`;
}

// ---------- Сторис (заглушки без картинок) ----------

const ZNACHKI_ISTORIY = {
  podarok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5 0-4.5-.5-4.5-2.5S10 3 12 8zM12 8c1.5 0 4.5-.5 4.5-2.5S14 3 12 8z"/></svg>',
  syr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-6 9 6v8H3z"/><circle cx="8.5" cy="15" r="1.3"/><circle cx="14" cy="13" r="1"/><circle cx="16.5" cy="17" r="1.1"/></svg>',
  mikrofon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
};
const ISTORII = [
  { zagolovok: '−20 % первый', grad: 'linear-gradient(160deg,#FF9F5A,#F2547D)', znak: ZNACHKI_ISTORIY.podarok },
  { zagolovok: '10 + 2 хинкали', grad: 'linear-gradient(160deg,#FFD98A,#E89A2E)', znak: ZNACHKI.testo },
  { zagolovok: 'Хачапури дня', grad: 'linear-gradient(160deg,#FFB03A,#F0532D)', znak: ZNACHKI_ISTORIY.syr },
  { zagolovok: 'Банкеты', grad: 'linear-gradient(160deg,#8E2C55,#4E1030)', znak: ZNACHKI.vino },
  { zagolovok: 'Заказ голосом', grad: 'linear-gradient(160deg,#9ED67A,#3E9C5C)', znak: ZNACHKI_ISTORIY.mikrofon },
];

function narisovatIstorii() {
  const kontejner = document.getElementById('istorii');
  ISTORII.forEach((ist, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'istoriya';
    el.setAttribute('role', 'listitem');
    el.innerHTML = `<span class="istoriya-krug" style="animation-delay:${-i * 1.7}s"><span class="istoriya-vnutri" style="--grad:${ist.grad}">${ist.znak}</span></span><span>${ist.zagolovok}</span>`;
    nazhatie(el, .92);
    kontejner.appendChild(el);
  });
}

// ---------- Лента разделов ----------

let tabletka, lentaVnutri, lenta;
let aktivnyyRazdelId = null;
let lentaZanyataDo = 0; // пока едем по тапу, наблюдатель не перехватывает

function narisovatLentu(razdely) {
  lenta = document.getElementById('lenta');
  lentaVnutri = document.getElementById('lenta-vnutri');
  tabletka = document.getElementById('lenta-tabletka');
  razdely.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.nazvanie;
    b.dataset.razdel = r.id;
    if (i === 0) b.classList.add('aktiv');
    b.addEventListener('click', () => {
      lentaZanyataDo = performance.now() + 900;
      vybratRazdel(r.id, true);
      const sekciya = document.getElementById('razdel-' + r.id);
      if (sekciya) {
        const y = sekciya.getBoundingClientRect().top + scrollY - 76;
        scrollTo({ top: y, behavior: umenshitDvizhenie ? 'auto' : 'smooth' });
      }
    });
    lentaVnutri.appendChild(b);
  });
  requestAnimationFrame(() => vybratRazdel(razdely[0].id, false));
}

function vybratRazdel(id, plavno) {
  if (aktivnyyRazdelId === id) return;
  aktivnyyRazdelId = id;
  const knopki = [...lentaVnutri.querySelectorAll('button')];
  const cel = knopki.find(k => k.dataset.razdel === id);
  if (!cel) return;
  knopki.forEach(k => k.classList.toggle('aktiv', k === cel));
  const x = cel.offsetLeft, w = cel.offsetWidth;
  const bylo = tabletka.getBoundingClientRect();
  tabletka.style.width = w + 'px';
  tabletka.style.transform = `translateX(${x}px)`;
  if (plavno && !umenshitDvizhenie) {
    // FLIP: откуда ехали — считаем от прошлого прямоугольника
    const stalo = tabletka.getBoundingClientRect();
    const dx = bylo.left - stalo.left;
    const sw = bylo.width / stalo.width;
    tabletka.animate(
      [{ transform: `translateX(${x + dx}px) scaleX(${sw})` }, { transform: `translateX(${x}px) scaleX(1)` }],
      { duration: pruzhina.obychnaya.ms, easing: pruzhina.obychnaya.easing });
  }
  // Держим активную таблетку в поле зрения ленты
  const vidimo = lenta.clientWidth;
  const celevoy = Math.max(0, x - vidimo / 2 + w / 2);
  lenta.scrollTo({ left: celevoy, behavior: plavno && !umenshitDvizhenie ? 'smooth' : 'auto' });
}

// ---------- Карточки ----------

const korzina = new Map(); // blyudoId -> { blyudo, kolichestvo, cena }

function narisovatRazdely(razdely, zavedenieId) {
  const kontejner = document.getElementById('razdely');
  razdely.forEach(r => {
    const sem = semeystvoRazdela(r.nazvanie);
    const dostupnye = r.blyuda.filter(b => dostupnoV(b, zavedenieId));
    const sekciya = document.createElement('section');
    sekciya.className = 'razdel';
    sekciya.id = 'razdel-' + r.id;
    sekciya.dataset.razdel = r.id;
    sekciya.innerHTML = `
      <div class="razdel-shapka">
        <h2>${r.nazvanie}<small>${dostupnye.length}</small></h2>
        <span class="razdel-podpis"><i style="--grad:var(--grad-${sem})"></i>${PODPISI_SEMEYSTV[sem]}</span>
      </div>
      <div class="setka"></div>`;
    const setka = sekciya.querySelector('.setka');
    dostupnye.forEach(b => setka.appendChild(sdelatKartochku(b, sem, zavedenieId)));
    kontejner.appendChild(sekciya);
  });
}

function sdelatKartochku(b, sem, zavedenieId) {
  const el = document.createElement('article');
  el.className = 'kartochka steklo';
  el.dataset.id = b.id;
  el.style.opacity = '0';
  const cena = cenaV(b, zavedenieId);
  const meta = [b.ves ? `${b.ves} г` : null, b.vremya ? `~${b.vremya} мин` : null].filter(Boolean).join(' · ');
  // Монограмма: первые буквы двух слов («Хинкали жареные» → «ХЖ»), одно слово — одна буква
  const slova = (b.nazvanie || '?').replace(/["«»]/g, '').split(/[\s-]+/).filter(s => /[а-яёa-z0-9]/i.test(s));
  const bukva = slova.slice(0, 2).map(s => s.charAt(0).toUpperCase()).join('') || '?';
  // Своя плитка у каждого блюда: угол градиента, поворот знака, положение блика, задержка блика
  const h = hesh(b.id);
  const ugolPlitki = 120 + (h % 60);            // 120…179°
  const povorot = ((h >> 6) % 25) - 12;         // −12…12°
  const blikX = 10 + ((h >> 11) % 40);          // 10…50 %
  const zaderzhka = ((h >> 16) % 70) / 10;      // 0…6.9 с
  el.innerHTML = `
    <div class="plitka" style="--c1:var(--${sem}-1);--c2:var(--${sem}-2);--ugol-plitki:${ugolPlitki}deg;--povorot-znaka:${povorot}deg;--blik-x:${blikX}%;--zaderzhka-blika:-${zaderzhka}s">
      <span class="znak-fon" aria-hidden="true">${ZNAKI_FONA[sem]}</span>
      <span class="monogramma" aria-hidden="true">${bukva}</span>
      <button class="plyus" type="button" aria-label="Добавить ${b.nazvanie}">${PLYUS_SVG}</button>
      <span class="stepper" role="group" aria-label="Количество">
        <button type="button" class="minus" aria-label="Убрать одну">${MINUS_SVG}</button>
        <output>1</output>
        <button type="button" class="eshche-plyus" aria-label="Добавить ещё">${PLYUS_SVG}</button>
      </span>
    </div>
    <div class="kartochka-tekst">
      <h3>${b.nazvanie}</h3>
      <p class="meta">${meta || (b.dobavki && b.dobavki.length ? `${b.dobavki.length} добавок` : '&nbsp;')}</p>
      <div class="cena">${formatCeny(cena)}${b.dobavki && b.dobavki.length && meta ? '<small>+ добавки</small>' : ''}</div>
    </div>`;

  // Фото: подключаем только если путь есть в данных; при ошибке — <img> убирается, карточка остаётся на градиенте
  if (b.foto && !BEZ_FOTO) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onload = () => img.classList.add('zagruzheno');
    img.onerror = () => img.remove();
    img.src = KOREN_VITRINY + b.foto;
    el.querySelector('.plitka').insertBefore(img, el.querySelector('.plyus'));
  }

  nazhatie(el, .965);
  const plyus = el.querySelector('.plyus');
  const stepper = el.querySelector('.stepper');
  const vyvod = el.querySelector('output');
  nazhatie(plyus, .86);

  const obnovit = () => {
    const poz = korzina.get(b.id);
    const n = poz ? poz.kolichestvo : 0;
    vyvod.textContent = n;
    el.classList.toggle('v-korzine', n > 0);
    if (!umenshitDvizhenie) {
      stepper.animate([{ transform: n > 0 ? 'scale(.6)' : 'scale(1)' }, { transform: n > 0 ? 'scale(1)' : 'scale(0)' }],
        { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, fill: 'forwards' });
    }
    obnovitKorzinu();
  };
  const dobavit = (ot) => {
    const poz = korzina.get(b.id) || { blyudo: b, kolichestvo: 0, cena };
    poz.kolichestvo += 1;
    korzina.set(b.id, poz);
    vibro(8);
    poletVKorzinu(ot, el.querySelector('.plitka'));
    obnovit();
    if (poz.kolichestvo === 1) hinkalik.pryg();
  };
  plyus.addEventListener('click', e => { e.stopPropagation(); dobavit(plyus); });
  el.querySelector('.eshche-plyus').addEventListener('click', e => { e.stopPropagation(); dobavit(e.currentTarget); });
  el.querySelector('.minus').addEventListener('click', e => {
    e.stopPropagation();
    const poz = korzina.get(b.id);
    if (!poz) return;
    poz.kolichestvo -= 1;
    if (poz.kolichestvo <= 0) korzina.delete(b.id);
    vibro(8);
    obnovit();
  });
  return el;
}

// Появление карточек каскадом — по мере входа в экран, пачками
function nablyudatKaskad() {
  const kartochki = document.querySelectorAll('.kartochka');
  if (umenshitDvizhenie || !('IntersectionObserver' in window)) {
    kartochki.forEach(k => k.style.opacity = '');
    return;
  }
  const io = new IntersectionObserver(zapisi => {
    let i = 0;
    for (const z of zapisi) {
      if (!z.isIntersecting) continue;
      const el = z.target;
      io.unobserve(el);
      el.style.opacity = '';
      el.animate(
        [{ opacity: 0, transform: 'translateY(26px) scale(.94)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: pruzhina.myagkaya.ms, delay: i * 55, easing: pruzhina.myagkaya.easing, fill: 'backwards' });
      i++;
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  kartochki.forEach(k => io.observe(k));
}

// Какой раздел сейчас под лентой — подсвечиваем таблетку
function nablyudatRazdely() {
  const sekcii = [...document.querySelectorAll('.razdel')];
  if (!sekcii.length) return;
  const proverit = () => {
    if (performance.now() < lentaZanyataDo) return;
    const liniya = 120;
    let tekushchiy = sekcii[0];
    for (const s of sekcii) {
      if (s.getBoundingClientRect().top <= liniya) tekushchiy = s;
    }
    vybratRazdel(tekushchiy.dataset.razdel, true);
  };
  addEventListener('scroll', () => requestAnimationFrame(proverit), { passive: true });
}

// Параллакс: шапка уходит медленнее контента, заголовки разделов плывут навстречу
function parallaks() {
  if (umenshitDvizhenie) return;
  const shapka = document.getElementById('shapka');
  const zagolovki = [...document.querySelectorAll('.razdel-shapka')];
  let zaplanirovan = false;
  const kadr = () => {
    zaplanirovan = false;
    const y = scrollY;
    shapka.style.transform = `translateY(${Math.min(y * .35, 160)}px)`;
    shapka.style.opacity = String(Math.max(0, 1 - y / 300));
    const vh = innerHeight;
    for (const z of zagolovki) {
      const r = z.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) continue;
      const progress = (r.top - 90) / vh; // 0 — под лентой, ~0.9 — внизу экрана
      const sdvig = Math.max(-22, Math.min(26, progress * 36));
      const prozrachnost = Math.max(0, Math.min(1, (r.top - 30) / 60));
      z.style.transform = `translateY(${sdvig.toFixed(1)}px)`;
      z.style.opacity = prozrachnost.toFixed(2);
    }
  };
  addEventListener('scroll', () => { if (!zaplanirovan) { zaplanirovan = true; requestAnimationFrame(kadr); } }, { passive: true });
  kadr();
}

// ---------- Корзина и полёт ----------

function obnovitKorzinu() {
  let n = 0, summa = 0;
  for (const p of korzina.values()) { n += p.kolichestvo; summa += p.kolichestvo * p.cena; }
  const schet = document.getElementById('nav-schet');
  const podpis = document.getElementById('nav-korzina-podpis');
  const bylo = schet.textContent;
  schet.textContent = n;
  schet.classList.toggle('viden', n > 0);
  podpis.textContent = n > 0 ? formatCeny(summa) : 'Корзина';
  if (n > 0 && String(n) !== bylo && !umenshitDvizhenie) {
    schet.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing });
  }
}

function poletVKorzinu(ot, plitka) {
  if (umenshitDvizhenie) return;
  const cel = document.getElementById('nav-korzina').querySelector('svg');
  const a = ot.getBoundingClientRect();
  const b = cel.getBoundingClientRect();
  const klon = document.createElement('span');
  klon.className = 'polet';
  const img = plitka.querySelector('img.zagruzheno');
  const stil = getComputedStyle(plitka);
  klon.style.background = `linear-gradient(135deg, ${stil.getPropertyValue('--c1').trim() || '#FF9F5A'}, ${stil.getPropertyValue('--c2').trim() || '#F2547D'})`;
  if (img) klon.style.background = `center / cover url("${img.src}")`;
  klon.style.left = (a.left + a.width / 2 - 15) + 'px';
  klon.style.top = (a.top + a.height / 2 - 15) + 'px';
  document.body.appendChild(klon);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = klon.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
    { transform: `translate(${dx * .45}px, ${dy * .35 - 110}px) scale(.95)`, opacity: 1, offset: .5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: .7, offset: 1 },
  ], { duration: 620, easing: 'cubic-bezier(.3,.05,.6,1)' });
  anim.onfinish = () => {
    klon.remove();
    cel.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing });
  };
}

// ---------- Нижняя навигация ----------

function navigaciya() {
  const nav = document.getElementById('nav');
  const kaplya = document.getElementById('nav-kaplya');
  const knopki = [...nav.querySelectorAll('button')];
  let tekushchiy = 0;
  knopki.forEach((k, i) => {
    nazhatie(k, .9);
    k.addEventListener('click', () => {
      if (i === tekushchiy) return;
      const ot = tekushchiy;
      tekushchiy = i;
      knopki.forEach((kk, j) => kk.classList.toggle('aktiv', j === i));
      vibro(6);
      if (umenshitDvizhenie) { kaplya.style.transform = `translateX(${i * 100}%)`; return; }
      const napr = i > ot ? 1 : -1;
      kaplya.animate([
        { transform: `translateX(${ot * 100}%) scale(1,1)` },
        { transform: `translateX(${(ot + (i - ot) * .5) * 100}%) scale(1.22,.84)`, offset: .4 },
        { transform: `translateX(${i * 100}%) scale(1,1)` },
      ], { duration: pruzhina.obychnaya.ms + 120, easing: pruzhina.obychnaya.easing, fill: 'forwards' });
      // капля чуть «качнётся» по направлению движения
      kaplya.animate([{ rotate: '0deg' }, { rotate: `${napr * 6}deg`, offset: .35 }, { rotate: '0deg' }],
        { duration: 700, easing: pruzhina.zhivaya.easing, composite: 'add' });
    });
  });
}

// ---------- Поиск: живая подсказка ----------

function zhivayaPodskazka() {
  const slova = ['Хинкали', 'Хачапури по-мегрельски', 'Люля-кебаб', 'Лимонад', 'Чанахи'];
  const el = document.getElementById('poisk-podskazka');
  const vvod = document.getElementById('poisk-vvod');
  let i = 0;
  const spryatat = () => el.style.visibility = (vvod.value || document.activeElement === vvod) ? 'hidden' : '';
  vvod.addEventListener('input', spryatat);
  vvod.addEventListener('focus', spryatat);
  vvod.addEventListener('blur', spryatat);
  if (umenshitDvizhenie) return;
  setInterval(() => {
    if (vvod.value || document.activeElement === vvod) return;
    const uhod = el.animate([{ opacity: 1, transform: 'translateY(-50%)' }, { opacity: 0, transform: 'translateY(-130%)' }],
      { duration: 260, easing: 'ease-in', fill: 'forwards' });
    uhod.onfinish = () => {
      i = (i + 1) % slova.length;
      el.textContent = slova[i];
      el.animate([{ opacity: 0, transform: 'translateY(20%)' }, { opacity: 1, transform: 'translateY(-50%)' }],
        { duration: pruzhina.myagkaya.ms, easing: pruzhina.myagkaya.easing, fill: 'forwards' });
    };
  }, 2800);
}

// ---------- Хинкалик ----------

const hinkalik = {
  el: null, telo: null, oblachko: null, zrachki: [], glaza: [], taymerOblachka: null,
  sozdat() {
    this.el = document.getElementById('hinkalik');
    this.telo = document.getElementById('hinkalik-telo');
    this.oblachko = document.getElementById('hinkalik-oblachko');
    this.telo.innerHTML = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="testo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF3DA"/><stop offset="1" stop-color="#E8BE7C"/>
    </linearGradient>
    <radialGradient id="rumyanec" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#F2547D" stop-opacity=".35"/><stop offset="1" stop-color="#F2547D" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="50" cy="96" rx="26" ry="3.5" fill="rgba(120,60,20,.14)"/>
  <!-- хвостик: вытянутый, сборчатый, чуть покачивается -->
  <g class="hvostik">
    <path d="M43 37 C40 27 42 12 51 3 C55 -1 62 3 58 8 C53 14 55 27 57 37 Z" fill="url(#testo)" stroke="#C9985A" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M47 29 q4 -1.5 8 0 M46.5 22 q4 -1.5 8 0 M47 15 q3.5 -1.3 7 0 M49 9 q3 -1.2 6 0" fill="none" stroke="#C9985A" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
  </g>
  <!-- тело: мешочек, узкий сверху, полный снизу -->
  <path d="M42 35 C31 41 15 52 15 69 C15 85 31 95 50 95 C69 95 85 85 85 69 C85 52 69 41 58 35 Z" fill="url(#testo)" stroke="#C9985A" stroke-width="1.6" stroke-linejoin="round"/>
  <!-- складки от узла -->
  <path d="M50 35 C40 42 32 52 29 64 M50 35 C45 44 42 54 42 64 M50 35 C55 44 58 54 58 64 M50 35 C60 42 68 52 71 64" fill="none" stroke="#B98A4E" stroke-width="1.5" stroke-linecap="round" opacity=".5"/>
  <!-- щёчки -->
  <circle cx="30" cy="79" r="6" fill="url(#rumyanec)"/><circle cx="70" cy="79" r="6" fill="url(#rumyanec)"/>
  <!-- брови -->
  <path class="brov" d="M33 62 q7 -4 13 -1" fill="none" stroke="#5A3B1E" stroke-width="1.9" stroke-linecap="round"/>
  <path class="brov" d="M54 61 q6 -3 13 1" fill="none" stroke="#5A3B1E" stroke-width="1.9" stroke-linecap="round"/>
  <!-- глаза -->
  <g class="glaz"><ellipse cx="40" cy="73" rx="6.4" ry="7" fill="#fff" stroke="#D9B27A" stroke-width=".8"/><circle class="zrachok" cx="40.8" cy="73.8" r="3.3" fill="#2B1D14"/><circle class="blik" cx="42.4" cy="71.6" r="1.2" fill="#fff"/></g>
  <g class="glaz"><ellipse cx="60" cy="73" rx="6.4" ry="7" fill="#fff" stroke="#D9B27A" stroke-width=".8"/><circle class="zrachok" cx="60.8" cy="73.8" r="3.3" fill="#2B1D14"/><circle class="blik" cx="62.4" cy="71.6" r="1.2" fill="#fff"/></g>
  <!-- рот -->
  <path class="rot" d="M45 85 q5 4.5 10 0" fill="none" stroke="#8A3A2A" stroke-width="1.9" stroke-linecap="round"/>
</svg>`;
    this.zrachki = [...this.telo.querySelectorAll('.zrachok, .blik')];
    this.glaza = [...this.telo.querySelectorAll('.glaz')];
    this.telo.addEventListener('click', () => { this.pryg(); this.morgnut(true); this.skazat('Скоро закажете голосом'); vibro(10); });
    nazhatie(this.telo, .9);
    if (!umenshitDvizhenie) {
      addEventListener('pointermove', e => this.smotret(e.clientX, e.clientY), { passive: true });
      addEventListener('touchmove', e => { const t = e.touches[0]; if (t) this.smotret(t.clientX, t.clientY); }, { passive: true });
      this.planMorganiya();
    }
    setTimeout(() => this.skazat('Привет. Начнём с хинкали?', 3600), 1400);
  },
  smotret(x, y) {
    const r = this.telo.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * .73;
    const dx = x - cx, dy = y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / 220) * 2.4;
    const sx = (dx / dist) * k, sy = (dy / dist) * k;
    this.zrachki.forEach(z => { z.style.transform = `translate(${sx.toFixed(2)}px, ${sy.toFixed(2)}px)`; });
  },
  morgnut(dvazhdy = false) {
    const raz = () => this.glaza.forEach(g => g.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)' }, { transform: 'scaleY(1)' }], { duration: 170, easing: 'ease-in-out' }));
    raz();
    if (dvazhdy) setTimeout(raz, 240);
  },
  planMorganiya() {
    setTimeout(() => { this.morgnut(); this.planMorganiya(); }, 3000 + Math.random() * 4000);
  },
  pryg() {
    if (umenshitDvizhenie) return;
    this.el.animate([
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(2px) scale(1.08,.9)', offset: .18 },
      { transform: 'translateY(-22px) scale(.95,1.06)', offset: .5 },
      { transform: 'translateY(0) scale(1.04,.96)', offset: .82 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 620, easing: 'ease-in-out' });
  },
  skazat(tekst, ms = 3200) {
    clearTimeout(this.taymerOblachka);
    this.oblachko.textContent = tekst;
    this.oblachko.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: pruzhina.zhivaya.ms, easing: pruzhina.zhivaya.easing, fill: 'forwards' });
    this.taymerOblachka = setTimeout(() => {
      this.oblachko.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' });
    }, ms);
  },
};

// ---------- Хвост ----------

function narisovatHvost(razdely, banket) {
  const hvost = document.getElementById('hvost');
  const ostalnye = razdely.slice(SKOLKO_RAZDELOV).map(r => r.nazvanie);
  const eshche = document.createElement('div');
  eshche.className = 'eshche steklo';
  eshche.innerHTML = `<b>Дальше ещё ${ostalnye.length} разделов</b>${ostalnye.slice(0, 6).join(' · ')} и другие — в пруфе показаны первые три.`;
  hvost.appendChild(eshche);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'plitka-ssylka';
  b.style.setProperty('--grad', 'var(--grad-vino)');
  b.innerHTML = `<b>${banket ? banket.nazvanie : 'Банкеты'} — соберём стол</b><span>Дни рождения, поминки, корпоративы. Пакеты «на человека», меню согласуем.</span><em>Позвонить</em>`;
  nazhatie(b, .975);
  hvost.appendChild(b);
}

// ---------- Старт ----------

async function start() {
  new FonMesh(document.getElementById('fon'));
  navigaciya();
  hinkalik.sozdat();
  narisovatIstorii();
  zhivayaPodskazka();
  nazhatie(document.getElementById('mesto'), .96);
  nazhatie(document.querySelector('.avatar'), .9);

  const otvet = await fetch(KOREN_VITRINY + 'menyu.json');
  const menyu = await otvet.json();
  const zavedenie = menyu.zavedeniya.find(z => z.nazvanie === ZAVEDENIE_NAZVANIE) || menyu.zavedeniya[0];
  document.getElementById('mesto-nazvanie').textContent = zavedenie.nazvanie;
  const status = chasyZavedeniya(zavedenie);
  document.getElementById('mesto-status').textContent = status;
  document.querySelector('.tochka').classList.toggle('zakryto', !status.startsWith('открыто'));

  narisovatLentu(menyu.razdely);
  narisovatRazdely(menyu.razdely.slice(0, SKOLKO_RAZDELOV), zavedenie.id);
  narisovatHvost(menyu.razdely, menyu.banket);
  nablyudatKaskad();
  nablyudatRazdely();
  parallaks();
}

start().catch(o => {
  // Показываем ошибку человеку, а не только в консоль
  const el = document.getElementById('razdely');
  el.innerHTML = `<div class="eshche steklo"><b>Меню не загрузилось</b>${o && o.message ? o.message : o}</div>`;
});
