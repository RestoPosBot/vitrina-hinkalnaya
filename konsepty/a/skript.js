// Концепт A «Жар и мёд» — пруф главного экрана. Данные настоящие: ../../menyu.json.
// Здесь: загрузка меню, отрисовка шапки/сторис/ленты/разделов, живой фон-градиент на канвасе,
// пружинный отклик на касание, каскадное появление карточек, параллакс заголовков, Хинкалик.

const MENYU_URL = '../../menyu.json';
const FOTO_KOREN = '../../';
const ZAVEDENIE_NAZVANIE = 'Савёловская';
const SKOLKO_RAZDELOV = 3;

const menshe_dvizheniya = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Семейства разделов и их цвета ----------
const SEMEYSTVA = {
  testo: ['Хинкали', 'Пироги', 'Заморозка'],
  zhar: ['Шашлыки', 'Шашлыки и блюда на углях', 'Горячие блюда', 'Горячее', 'Горячие закуски'],
  zelen: ['Салаты', 'Холодные закуски', 'Гарниры', 'Соусы'],
  sladkoe: ['Десерты', 'Свежевыжатые соки'],
  vino: ['Бар', 'Вино бутылочное', 'Вино розлив', 'Виски', 'Водка', 'Коньяк', 'Текила и Ром', 'Шампанское и Мартини'],
  kombo: ['Кавказские комбо-наборы'],
};
const PODPISI = { testo: 'из теста', zhar: 'на углях', zelen: 'свежее', sladkoe: 'сладкое', vino: 'бар', kombo: 'наборы' };
// Значок на плитке без фото: по семейству, с уточнением по разделу
const ZNAKI_SEMEYSTV = { testo: 'ik-hinkali', zhar: 'ik-plamya', zelen: 'ik-list', sladkoe: 'ik-yagoda', vino: 'ik-bokal', kombo: 'ik-nabor' };
const ZNAKI_RAZDELOV = { 'Пироги': 'ik-hachapuri', 'Шашлыки': 'ik-shampur', 'Шашлыки и блюда на углях': 'ik-shampur' };
// Цвет значка и подписи на плитке по семействам
const ZNAK_CVET = {
  testo: 'rgba(255,255,255,.82)', zhar: 'rgba(255,255,255,.86)', zelen: 'rgba(255,255,255,.88)',
  sladkoe: 'rgba(255,255,255,.86)', vino: 'rgba(244,199,122,.9)', kombo: 'rgba(255,255,255,.86)',
};
const PODPIS_CVET = {
  testo: 'rgba(120,60,20,.62)', zhar: 'rgba(255,255,255,.85)', zelen: 'rgba(30,80,40,.6)',
  sladkoe: 'rgba(255,255,255,.85)', vino: 'rgba(244,199,122,.85)', kombo: 'rgba(255,255,255,.85)',
};
const TENI = {
  testo: 'rgba(233,164,72,.75)', zhar: 'rgba(240,83,45,.65)', zelen: 'rgba(79,168,94,.6)',
  sladkoe: 'rgba(232,86,125,.55)', vino: 'rgba(74,15,46,.6)', kombo: 'rgba(168,28,61,.6)',
};
// Палитры живого фона по семействам: 6 пятен (см. порядок пятен в FonGradient)
const PALITRY = {
  testo: ['#FFB03A', '#F0532D', '#F6B75A', '#FF8A3D', '#E8452E', '#FFC76A'],
  zhar: ['#F0532D', '#FFB03A', '#D9302F', '#FF7A2F', '#B8213F', '#FFAE4A'],
  zelen: ['#F4C77A', '#6FBF73', '#FFB03A', '#B7DF8A', '#F0532D', '#8FD08A'],
  sladkoe: ['#F26B8A', '#FFB03A', '#FFB08A', '#F0532D', '#E8567D', '#FFC76A'],
  vino: ['#8E2C55', '#B8213F', '#F4C77A', '#6A1B3A', '#F0532D', '#A33A66'],
  kombo: ['#FFB03A', '#B8213F', '#F0532D', '#F6B75A', '#E0432F', '#FF8A3D'],
};

function normalizovat(tekst) { return (tekst || '').replace(/[‑‐–]/g, '-').trim(); }
function semeystvoRazdela(razdel) {
  const imya = normalizovat(razdel.nazvanie);
  for (const [sem, spisok] of Object.entries(SEMEYSTVA)) if (spisok.includes(imya)) return sem;
  return 'testo';
}
function cenaV(blyudo, zavedenieId) {
  const z = zavedenieId && blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  return z && typeof z.cena === 'number' ? z.cena : blyudo.cena;
}
function dostupnoV(blyudo, zavedenieId) {
  if (!zavedenieId) return !blyudo.stop_vezde;
  const z = blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  return !!z && !z.stop;
}

// ---------- Часы работы ----------
function minutyVStroku(m) {
  // В базе встречаются опечатки вроде 1321 (22:01) — для показа округляем до 5 минут
  m = Math.round(m / 5) * 5;
  const ch = Math.floor(m / 60) % 24, mi = m % 60;
  return String(ch).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
function seychasVMoskve() {
  // Пруфу можно подсунуть время: ?chas=14 — чтобы увидеть состояние «открыто» ночью
  const p = new URLSearchParams(location.search);
  const chasti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false }).formatToParts(new Date());
  const kart = Object.fromEntries(chasti.map(x => [x.type, x.value]));
  const dni = { Sun: 'su', Mon: 'mo', Tue: 'tu', Wed: 'we', Thu: 'th', Fri: 'fr', Sat: 'sa' };
  let minuty = (parseInt(kart.hour, 10) % 24) * 60 + parseInt(kart.minute, 10);
  if (p.has('chas')) minuty = parseInt(p.get('chas'), 10) * 60;
  return { den: dni[kart.weekday] || 'mo', minuty };
}
function otkrytoSeychas(zavedenie) {
  const { den, minuty } = seychasVMoskve();
  const chasy = zavedenie.chasy || {};
  const segodnya = chasy[den];
  if (segodnya && minuty >= segodnya[0] && minuty < (segodnya[1] || 1440)) {
    return { otkryto: true, tekst: 'открыто до ' + minutyVStroku(segodnya[1] || 0) };
  }
  if (segodnya && minuty < segodnya[0]) return { otkryto: false, tekst: 'откроется в ' + minutyVStroku(segodnya[0]) };
  // Ищем следующий рабочий день
  const poryadok = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  let i = poryadok.indexOf(den);
  for (let shag = 1; shag <= 7; shag++) {
    const d = poryadok[(i + shag) % 7];
    if (chasy[d]) return { otkryto: false, tekst: (shag === 1 ? 'откроется завтра в ' : 'откроется в ') + minutyVStroku(chasy[d][0]) };
  }
  return { otkryto: false, tekst: 'закрыто' };
}

// ---------- Пружинный отклик на касание ----------
const PRUZHINA_OBRATNO = [
  { transform: 'scale(.955)' },
  { transform: 'scale(1.025)', offset: .42 },
  { transform: 'scale(.993)', offset: .72 },
  { transform: 'scale(1)' },
];
function vibro(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* не страшно */ } } }
function nazhatie(el, masshtab = .955) {
  if (menshe_dvizheniya) return;
  let nazhat = false, tekushchaya = null;
  const vniz = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    nazhat = true;
    el.classList.add('nazhata');
    if (tekushchaya) tekushchaya.cancel();
    tekushchaya = el.animate([{ transform: 'scale(1)' }, { transform: `scale(${masshtab})` }], { duration: 110, easing: 'ease-out', fill: 'forwards' });
    vibro(8);
  };
  const vverh = () => {
    if (!nazhat) return;
    nazhat = false;
    el.classList.remove('nazhata');
    if (tekushchaya) { tekushchaya.cancel(); tekushchaya = null; }
    el.animate(PRUZHINA_OBRATNO.map(k => ({ ...k, transform: k.transform.replace('.955', String(masshtab)) })), { duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)' });
  };
  el.addEventListener('pointerdown', vniz);
  el.addEventListener('pointerup', vverh);
  el.addEventListener('pointercancel', vverh);
  el.addEventListener('pointerleave', vverh);
}

// ---------- Живой фон: свет из печи ----------
class FonGradient {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    // Шесть пятен света: два сверху (шафран/паприка), два по бокам, «жерло печи» снизу
    // и блуждающий блик в середине. Порядок совпадает с палитрами PALITRY.
    this.pyatna = [
      { x: .15, y: .04, r: .72, a: .035, s: .00022 },
      { x: .90, y: .18, r: .64, a: .045, s: .00030 },
      { x: 1.06, y: .58, r: .58, a: .040, s: .00020 },
      { x: -.06, y: .70, r: .60, a: .045, s: .00027 },
      { x: .50, y: 1.10, r: .90, a: .030, s: .00018 },
      { x: .58, y: .44, r: .42, a: .060, s: .00036 },
    ];
    this.cveta = PALITRY.testo.map(hexVRgb);
    this.cel = this.cveta.map(c => [...c]);
    this.scroll = 0;
    this.pauza = false;
    this.poslednyKadr = 0;
    this.razmer();
    addEventListener('resize', () => this.razmer());
    document.addEventListener('visibilitychange', () => { this.pauza = document.hidden; if (!this.pauza) this.tik(performance.now()); });
    if (menshe_dvizheniya) this.risovat(0); else requestAnimationFrame(t => this.tik(t));
  }
  razmer() {
    const k = innerHeight / innerWidth;
    this.c.width = 96;
    this.c.height = Math.max(48, Math.round(96 * k));
    this.risovat(performance.now());
  }
  zadatCveta(hexy) { this.cel = hexy.map(hexVRgb); }
  tik(t) {
    if (this.pauza) return;
    if (t - this.poslednyKadr >= 1000 / 30) { this.poslednyKadr = t; this.risovat(t); }
    requestAnimationFrame(tt => this.tik(tt));
  }
  risovat(t) {
    const { ctx, c } = this;
    const w = c.width, h = c.height;
    // плавно подтягиваем цвета к целевой палитре
    for (let i = 0; i < this.cveta.length; i++) for (let j = 0; j < 3; j++) this.cveta[i][j] += (this.cel[i][j] - this.cveta[i][j]) * .04;
    ctx.globalCompositeOperation = 'source-over';
    // подложка: сверху крем, к низу тёплый персик — фон не бледнеет между пятнами
    const podlozhka = ctx.createLinearGradient(0, 0, 0, h);
    podlozhka.addColorStop(0, '#FFEFD6');
    podlozhka.addColorStop(1, '#FFD9B0');
    ctx.fillStyle = podlozhka;
    ctx.fillRect(0, 0, w, h);
    const sdvig = this.scroll / innerHeight * .16; // параллакс: свет плывёт при прокрутке
    this.pyatna.forEach((p, i) => {
      const x = (p.x + Math.sin(t * p.s + i * 1.7) * p.a) * w;
      let y = (p.y + Math.cos(t * p.s * 1.3 + i * .9) * p.a) - sdvig;
      y = ((y + .3) % 1.6 + 1.6) % 1.6 - .3;
      y *= h;
      const r = p.r * Math.max(w, h * .6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const [R, G, B] = this.cveta[i].map(Math.round);
      g.addColorStop(0, `rgba(${R},${G},${B},.95)`);
      g.addColorStop(.55, `rgba(${R},${G},${B},.55)`);
      g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
}
function hexVRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------- Корзина (в памяти, только для пруфа) ----------
const korzina = new Map(); // blyudoId -> { nazvanie, cena, kolichestvo }
function korzinaSumma() { let s = 0; for (const p of korzina.values()) s += p.cena * p.kolichestvo; return s; }
function korzinaShtuk() { let s = 0; for (const p of korzina.values()) s += p.kolichestvo; return s; }
let pokazannayaSumma = 0;
function obnovitKorzinu() {
  const schet = document.getElementById('korzina-schet');
  const summa = document.getElementById('korzina-summa');
  const tekst = document.getElementById('korzina-tekst');
  const shtuk = korzinaShtuk();
  schet.hidden = shtuk === 0;
  schet.textContent = shtuk;
  tekst.textContent = shtuk ? 'Корзина ·' : 'Корзина';
  pokazatChislo(summa, pokazannayaSumma, korzinaSumma(), 420);
  pokazannayaSumma = korzinaSumma();
}
function pokazatChislo(el, ot, do_, ms) {
  if (do_ === 0) { el.textContent = ''; return; }
  if (menshe_dvizheniya) { el.textContent = formatCena(do_); return; }
  const start = performance.now();
  const shag = (t) => {
    const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = formatCena(Math.round(ot + (do_ - ot) * e));
    if (p < 1) requestAnimationFrame(shag);
  };
  requestAnimationFrame(shag);
}
function formatCena(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

function poletVKorzinu(plitka) {
  const cel = document.getElementById('korzina-knopka');
  const a = plitka.getBoundingClientRect(), b = cel.getBoundingClientRect();
  if (menshe_dvizheniya) { cel.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300 }); return; }
  const klon = document.createElement('div');
  klon.className = 'polet';
  klon.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;background:${getComputedStyle(plitka).backgroundImage}`;
  const img = plitka.querySelector('img');
  if (img && img.complete && img.naturalWidth) { const i = img.cloneNode(); klon.appendChild(i); }
  document.body.appendChild(klon);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const an = klon.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '18px' },
    { transform: `translate(${dx * .45}px, ${dy * .35 - 90}px) scale(.55)`, opacity: .95, offset: .5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: .4, borderRadius: '50%' },
  ], { duration: 640, easing: 'cubic-bezier(.35,.6,.35,1)' });
  an.onfinish = () => {
    klon.remove();
    cel.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(.98)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    vibro([10, 30, 10]);
  };
}

// ---------- Тост ----------
let tostTaymer = 0;
function pokazatTost(tekst) {
  const el = document.getElementById('tost');
  el.textContent = tekst;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(tostTaymer);
  tostTaymer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- Хинкалик ----------
class Hinkalik {
  constructor(el) {
    this.el = el;
    this.glaza = [...el.querySelectorAll('.hinkalik__glaz')];
    this.zrachki = [...el.querySelectorAll('.hinkalik__zrachok')];
    this.oblachko = el.querySelector('.hinkalik__oblachko');
    this.rot = el.querySelector('#hinkalik-rot');
    this.cel = { x: 0, y: 0 };
    this.tek = { x: 0, y: 0 };
    if (!menshe_dvizheniya) {
      addEventListener('pointermove', e => this.smotret(e.clientX, e.clientY), { passive: true });
      addEventListener('touchmove', e => { const t = e.touches[0]; if (t) this.smotret(t.clientX, t.clientY); }, { passive: true });
      this.planMorganie();
      this.tik();
    }
    el.addEventListener('click', () => { this.pryg(); this.morgnut(true); this.skazat('Скоро закажете голосом. Пока — тапайте по хинкали.'); });
  }
  smotret(x, y) {
    const r = this.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * .6;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 220) * 2.3;
    this.cel = { x: dx / d * k, y: dy / d * k };
  }
  tik() {
    this.tek.x += (this.cel.x - this.tek.x) * .12;
    this.tek.y += (this.cel.y - this.tek.y) * .12;
    for (const z of this.zrachki) z.setAttribute('transform', `translate(${this.tek.x.toFixed(2)} ${this.tek.y.toFixed(2)})`);
    requestAnimationFrame(() => this.tik());
  }
  planMorganie() {
    setTimeout(() => { this.morgnut(); this.planMorganie(); }, 3000 + Math.random() * 4000);
  }
  morgnut(dvazhdy = false) {
    const k = [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: .45 }, { transform: 'scaleY(1)' }];
    for (const g of this.glaza) g.animate(k, { duration: 160, easing: 'ease-in-out' });
    if (dvazhdy) setTimeout(() => { for (const g of this.glaza) g.animate(k, { duration: 160 }); }, 220);
  }
  pryg() {
    if (menshe_dvizheniya) return;
    this.el.animate([
      { transform: 'translateY(0) scale(1,1)' },
      { transform: 'translateY(2px) scale(1.08,.9)', offset: .18 },
      { transform: 'translateY(-22px) scale(.94,1.08)', offset: .5 },
      { transform: 'translateY(0) scale(1.05,.95)', offset: .82 },
      { transform: 'translateY(0) scale(1,1)' },
    ], { duration: 620, easing: 'cubic-bezier(.3,.7,.3,1)' });
    this.rot.setAttribute('d', 'M42 84 C 45 92, 55 92, 58 84');
    setTimeout(() => this.rot.setAttribute('d', 'M44 85 C 47 89, 53 89, 56 85'), 1200);
  }
  skazat(tekst, ms = 3400) {
    this.oblachko.textContent = tekst;
    this.oblachko.hidden = false;
    this.oblachko.style.animation = 'none'; void this.oblachko.offsetWidth; this.oblachko.style.animation = '';
    clearTimeout(this.taymer);
    this.taymer = setTimeout(() => { this.oblachko.hidden = true; }, ms);
  }
}

// ---------- Сторис ----------
const ISTORII = [
  { id: 'skidka', podpis: '−20 % на первый', sem: 'zhar', znak: '<b>−20%</b>' },
  { id: 'podarok', podpis: '10 + 2 хинкали', sem: 'testo', znak: '<svg aria-hidden="true"><use href="#ik-hinkali"/></svg>' },
  { id: 'hachapuri', podpis: 'Хачапури дня', sem: 'kombo', znak: '🧀' },
  { id: 'banket', podpis: 'Банкеты', sem: 'vino', znak: '🍷' },
  { id: 'golos', podpis: 'Голосом — скоро', sem: 'sladkoe', znak: '🎤' },
];
function narisovatIstorii() {
  const k = document.getElementById('istorii');
  k.innerHTML = ISTORII.map(i => `
    <button class="istoriya" type="button" data-id="${i.id}">
      <span class="istoriya__krug"><span class="istoriya__vnutri" style="--gr: var(--gr-${i.sem})">${i.znak}</span></span>
      <span class="istoriya__podpis">${i.podpis}</span>
    </button>`).join('');
  for (const b of k.querySelectorAll('.istoriya')) {
    nazhatie(b, .92);
    b.addEventListener('click', () => pokazatTost('Сторис откроются в полной версии'));
  }
}

// ---------- Лента разделов ----------
let aktivnyyRazdel = null;
function narisovatLentu(razdely) {
  const lenta = document.getElementById('lenta');
  lenta.innerHTML = razdely.map((r, i) => `<button class="tabletka${i === 0 ? ' aktivna' : ''}" type="button" data-id="${r.id}" data-i="${i}">${r.nazvanie}</button>`).join('');
  for (const t of lenta.querySelectorAll('.tabletka')) {
    nazhatie(t, .94);
    t.addEventListener('click', () => {
      const sec = document.getElementById('razdel-' + t.dataset.id);
      if (sec) {
        const y = sec.getBoundingClientRect().top + scrollY - lenta.offsetHeight - 4;
        scrollTo({ top: y, behavior: menshe_dvizheniya ? 'auto' : 'smooth' });
      } else pokazatTost('В пруфе только первые три раздела');
    });
  }
  // липкость: тень, когда лента прилипла
  const strazh = document.createElement('div');
  lenta.before(strazh);
  new IntersectionObserver(([e]) => lenta.classList.toggle('prilipla', !e.isIntersecting), { threshold: 0 }).observe(strazh);
}
function aktivirovatTabletku(razdelId) {
  if (aktivnyyRazdel === razdelId) return;
  aktivnyyRazdel = razdelId;
  const lenta = document.getElementById('lenta');
  for (const t of lenta.querySelectorAll('.tabletka')) {
    const da = t.dataset.id === razdelId;
    t.classList.toggle('aktivna', da);
    if (da) {
      t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: menshe_dvizheniya ? 'auto' : 'smooth' });
      if (!menshe_dvizheniya) t.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }
}

// ---------- Разделы и карточки ----------
function klassZagolovka(nazvanie) {
  const dl = nazvanie.length;
  if (dl <= 8) return '';
  if (dl <= 11) return 'sredniy';
  return 'dlinnyy';
}
function narisovatRazdely(menyu, zavedenieId) {
  const koren = document.getElementById('razdely');
  const razdely = menyu.razdely.slice(0, SKOLKO_RAZDELOV);
  koren.innerHTML = '';
  for (const r of razdely) {
    const sem = semeystvoRazdela(r);
    const blyuda = r.blyuda.filter(b => dostupnoV(b, zavedenieId));
    const sec = document.createElement('section');
    sec.className = 'razdel';
    sec.id = 'razdel-' + r.id;
    sec.dataset.sem = sem;
    sec.dataset.id = r.id;
    sec.innerHTML = `
      <div class="zagolovok">
        <div class="zagolovok__pod">${PODPISI[sem]} · ${blyuda.length} ${sklonenie(blyuda.length)}</div>
        <h2 class="${klassZagolovka(r.nazvanie)}">${r.nazvanie}</h2>
      </div>
      <div class="setka"></div>`;
    const setka = sec.querySelector('.setka');
    blyuda.forEach((b, i) => setka.appendChild(kartochka(b, sem, zavedenieId, r, i)));
    koren.appendChild(sec);
  }
}
function sklonenie(n) {
  const o = n % 10, d = n % 100;
  if (d >= 11 && d <= 14) return 'блюд';
  if (o === 1) return 'блюдо';
  if (o >= 2 && o <= 4) return 'блюда';
  return 'блюд';
}
function meta(b) {
  const ch = [];
  if (b.ves) ch.push(b.ves + ' г');
  if (b.vremya && b.vremya < 60) ch.push(b.vremya + ' мин');
  return ch.join(' · ') || '&nbsp;';
}
function tenIzCveta(hex, sem) {
  if (!hex) return TENI[sem];
  const [r, g, bl] = hexVRgb(hex);
  return `rgba(${r},${g},${bl},.72)`;
}
function dnoIzCveta(hex) {
  // средний цвет будущего фото — тёплым дном плитки, пока снимка нет
  if (!hex) return 'rgba(120,60,20,.22)';
  const [r, g, bl] = hexVRgb(hex);
  return `rgba(${r},${g},${bl},.38)`;
}

// Какие фото уже лежат в foto/. Локальный сервер отдаёт список папки — берём его,
// чтобы не запрашивать несуществующие снимки (иначе консоль полна 404).
// На GitHub Pages списка нет -> null -> пробуем все фото, битые прячет onerror.
let fotoEst = null;
async function uznatKakieFotoEst() {
  try {
    const o = await fetch(FOTO_KOREN + 'foto/', { headers: { Accept: 'text/html' } });
    if (!o.ok || !(o.headers.get('content-type') || '').includes('text/html')) return null;
    const t = await o.text();
    const nabor = new Set();
    for (const m of t.matchAll(/href="([^"]+\.(?:jpe?g|webp|png))"/gi)) nabor.add(decodeURIComponent(m[1]).split('/').pop());
    return nabor;
  } catch (e) { return null; }
}
function estFoto(b) {
  if (!b.foto) return false;
  if (fotoEst === null) return true;
  return fotoEst.has(b.foto.split('/').pop());
}
function znakRazdela(razdel, sem) {
  return ZNAKI_RAZDELOV[normalizovat(razdel.nazvanie)] || ZNAKI_SEMEYSTV[sem];
}
function kartochka(b, sem, zavedenieId, razdel, nomer) {
  const cena = cenaV(b, zavedenieId);
  const el = document.createElement('article');
  el.className = 'kartochka';
  el.dataset.id = b.id;
  const foto = estFoto(b) ? `<img src="${FOTO_KOREN}${b.foto}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  // каждая плитка чуть по-своему повёрнута — как снимки с разных ракурсов, а не штамп
  const povorot = ((nomer % 4) - 1.5) * 5;
  const naklon = ((nomer % 3) - 1) * 1.2;
  el.innerHTML = `
    <div class="plitka" style="--gr: var(--pl-${sem}); --ten-cvet: ${tenIzCveta(b.cvet, sem)}; --cvet-dno: ${dnoIzCveta(b.cvet)}; --znak: ${ZNAK_CVET[sem]}; --podpis: ${PODPIS_CVET[sem]}; --povorot: ${povorot}deg; --naklon: ${naklon}deg; --sdvig-x: ${(nomer % 2) * 3 - 1}%; --sdvig-y: ${(nomer % 3) * 2 - 3}%">
      <span class="plitka__znak" aria-hidden="true"><svg><use href="#${znakRazdela(razdel, sem)}"/></svg></span>
      <span class="plitka__podpis" aria-hidden="true">${PODPISI[sem]}</span>
      ${foto}
    </div>
    <div class="kartochka__nazvanie">${b.nazvanie}</div>
    <div class="kartochka__meta">${meta(b)}</div>
    <div class="kartochka__niz">
      <div class="cena">${cena.toLocaleString('ru-RU')}<span class="rub">₽</span></div>
      <button class="plyus" type="button" aria-label="Добавить ${b.nazvanie}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <div class="stepper">
        <button type="button" data-shag="-1" aria-label="Меньше"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        <b>1</b>
        <button type="button" data-shag="1" aria-label="Больше"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </div>`;
  nazhatie(el, .96);
  const plitka = el.querySelector('.plitka');
  const schetchik = el.querySelector('.stepper b');
  const izmenit = (shag) => {
    const bylo = korzina.get(b.id) || { nazvanie: b.nazvanie, cena, kolichestvo: 0 };
    bylo.kolichestvo = Math.max(0, bylo.kolichestvo + shag);
    if (bylo.kolichestvo === 0) korzina.delete(b.id); else korzina.set(b.id, bylo);
    schetchik.textContent = bylo.kolichestvo;
    el.classList.toggle('v-korzine', bylo.kolichestvo > 0);
    if (shag > 0) { poletVKorzinu(plitka); hinkalik && hinkalik.pryg(); }
    obnovitKorzinu();
  };
  el.querySelector('.plyus').addEventListener('click', (e) => { e.stopPropagation(); izmenit(1); });
  for (const k of el.querySelectorAll('.stepper button')) {
    k.addEventListener('click', (e) => { e.stopPropagation(); izmenit(parseInt(k.dataset.shag, 10)); vibro(6); });
    k.addEventListener('pointerdown', e => e.stopPropagation());
  }
  el.querySelector('.plyus').addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', () => pokazatTost(b.nazvanie + ' — карточка откроется в полной версии'));
  return el;
}

// ---------- Появление каскадом ----------
function nablyudatKartochki() {
  if (menshe_dvizheniya) { document.querySelectorAll('.kartochka').forEach(k => k.classList.add('pokazana')); return; }
  const io = new IntersectionObserver((zapisi) => {
    let i = 0;
    for (const z of zapisi) {
      if (!z.isIntersecting) continue;
      z.target.style.setProperty('--i', i++);
      z.target.classList.add('pokazana');
      io.unobserve(z.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: .08 });
  document.querySelectorAll('.kartochka').forEach(k => io.observe(k));
}

// ---------- Какой раздел в центре — лента и палитра фона ----------
function nablyudatRazdely(fon) {
  const sekcii = [...document.querySelectorAll('.razdel')];
  const io = new IntersectionObserver((zapisi) => {
    for (const z of zapisi) if (z.isIntersecting) {
      aktivirovatTabletku(z.target.dataset.id);
      fon.zadatCveta(PALITRY[z.target.dataset.sem]);
    }
  }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
  sekcii.forEach(s => io.observe(s));
}

// ---------- Параллакс заголовков ----------
function parallaksZagolovkov(fon) {
  const zagolovki = [...document.querySelectorAll('.zagolovok')];
  // Точка отсчёта: где раздел был при загрузке (если уже на экране) или низ экрана (если войдёт снизу).
  // Так заголовок в исходном положении стоит на месте, а при прокрутке отстаёт от ленты.
  const otschet = new Map();
  const zapomnit = () => { for (const z of zagolovki) otschet.set(z, Math.min(innerHeight, z.parentElement.getBoundingClientRect().top + scrollY)); };
  zapomnit();
  addEventListener('resize', zapomnit);
  let zaplanirovan = false;
  const shag = () => {
    zaplanirovan = false;
    fon.scroll = scrollY;
    if (menshe_dvizheniya) return;
    for (const z of zagolovki) {
      const r = z.parentElement.getBoundingClientRect();
      const sdvig = Math.min(64, Math.max(0, (otschet.get(z) - r.top) * .13));
      z.style.transform = `translate3d(0, ${sdvig.toFixed(1)}px, 0)`;
      z.style.opacity = String(Math.min(1, Math.max(0, (r.top + 40) / 160)));
    }
  };
  addEventListener('scroll', () => { if (!zaplanirovan) { zaplanirovan = true; requestAnimationFrame(shag); } }, { passive: true });
  shag();
}

// ---------- Запуск ----------
let hinkalik = null;
async function start() {
  const fon = new FonGradient(document.getElementById('fon'));
  hinkalik = new Hinkalik(document.getElementById('hinkalik'));
  narisovatIstorii();

  const [otvet, spisokFoto] = await Promise.all([fetch(MENYU_URL), uznatKakieFotoEst()]);
  const menyu = await otvet.json();
  fotoEst = spisokFoto;
  const zavedenie = menyu.zavedeniya.find(z => z.nazvanie === ZAVEDENIE_NAZVANIE) || menyu.zavedeniya[0];

  document.getElementById('mesto-nazvanie').textContent = zavedenie.nazvanie;
  const status = otkrytoSeychas(zavedenie);
  const st = document.getElementById('mesto-status');
  st.querySelector('span').textContent = status.tekst;
  st.querySelector('.tochka').classList.toggle('zakryto', !status.otkryto);

  narisovatLentu(menyu.razdely);
  narisovatRazdely(menyu, zavedenie.id);
  nablyudatKartochki();
  nablyudatRazdely(fon);
  parallaksZagolovkov(fon);
  obnovitKorzinu();

  for (const b of document.querySelectorAll('.niz__punkt, .niz__korzina, .chip, .mesto, .plyus')) nazhatie(b, .93);
  document.getElementById('korzina-knopka').addEventListener('click', () => pokazatTost(korzinaShtuk() ? 'Корзина откроется в полной версии' : 'В корзине пусто — начните с хинкали'));
  document.getElementById('mesto').addEventListener('click', () => pokazatTost('Выбор заведения — в полной версии'));
  document.getElementById('sposob').addEventListener('click', () => pokazatTost('Самовывоз ↔ доставка — в полной версии'));
  for (const b of document.querySelectorAll('.niz__punkt')) b.addEventListener('click', () => pokazatTost('Этот экран — в полной версии'));

  setTimeout(() => hinkalik.skazat(status.otkryto ? 'Начнём с хинкали?' : 'Сейчас закрыто, но заказ ко времени соберём'), 1400);
}

start().catch(o => { console.error(o); pokazatTost('Не удалось загрузить меню'); });
