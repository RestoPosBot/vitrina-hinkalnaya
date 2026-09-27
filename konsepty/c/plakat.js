// Концепт «Плакат»: главный экран витрины Хинкальной.
// Данные — настоящие (menyu.json), движение — живой фон на canvas, пружины на касание,
// каскад карточек, параллакс обложек и шапки, Хинкалик с глазами.

const ZAVEDENIE_NAZVANIE = 'Савёловская';
const SKOLKO_RAZDELOV = 3;

// ---------- Пружины (WAAPI): linear() если браузер умеет, иначе cubic-bezier ----------
const umeetLinear = CSS.supports('animation-timing-function', 'linear(0, 1)');
const pruzhina = umeetLinear
  ? 'linear(0, .006, .025 2.8%, .101 6.1%, .539 18.9%, .721 25.3%, .849 31.5%, .937 38.1%, .968 41.8%, .991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001)'
  : 'cubic-bezier(.34, 1.56, .64, 1)';
const pruzhinaZhivaya = umeetLinear
  ? 'linear(0, .01, .04 2.7%, .17 6.2%, .79 15.9%, 1.06 21.6%, 1.16 25.5%, 1.15 29.4%, 1.08 34.8%, .97 43.6%, .99 55%, 1.01 65%, 1)'
  : 'cubic-bezier(.2, 1.8, .5, 1)';
const menshDvizheniya = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Семейства разделов -> градиенты ----------
export function semeystvoRazdela(nazvanie) {
  const n = nazvanie.toLowerCase();
  if (n.includes('комбо')) return 'kombo';
  if (n.includes('хинкали') || n.includes('пирог') || n.includes('заморозк')) return 'testo';
  if (n.includes('шашлык') || n.includes('горяч')) return 'zhar';
  if (n.includes('салат') || n.includes('холодн') || n.includes('гарнир') || n.includes('соус')) return 'zelen';
  if (n.includes('десерт') || n.includes('сок')) return 'sladkoe';
  return 'vino';
}
const IMYA_SEMEYSTVA = { testo: 'тесто', zhar: 'жар углей', zelen: 'зелень', sladkoe: 'сладкое', vino: 'бар', kombo: 'комбо' };
const PALITRA_FONA = {
  testo:   ['#FFB03A', '#F4C77A', '#F0532D', '#FFE3B8', '#F26B8A'],
  zhar:    ['#F0532D', '#FFB03A', '#B8213F', '#FFD2B0', '#F4C77A'],
  zelen:   ['#6FBF73', '#E4F2B8', '#FFB03A', '#F4C77A', '#3E9C5C'],
  sladkoe: ['#F26B8A', '#FFD2B0', '#FFB03A', '#F4C77A', '#B8213F'],
  vino:    ['#8E2C55', '#B8213F', '#F4C77A', '#6A1B3A', '#F0532D'],
  kombo:   ['#FFB03A', '#B8213F', '#F0532D', '#F4C77A', '#FFD2B0'],
};

// ---------- Данные ----------
export function cenaV(blyudo, zavedenieId) {
  const z = zavedenieId && blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  return z && typeof z.cena === 'number' ? z.cena : blyudo.cena;
}
export function prichinaNedostupnosti(blyudo, zavedenieId) {
  if (!zavedenieId) return blyudo.stop_vezde ? 'stop' : null;
  const z = blyudo.po_zavedeniyam && blyudo.po_zavedeniyam[zavedenieId];
  if (!z) return 'net';
  return z.stop ? 'stop' : null;
}
export function otkrytoSeychas(zavedenie, data = new Date()) {
  const klyuchi = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const seychas = data.getHours() * 60 + data.getMinutes();
  const segodnya = zavedenie.chasy[klyuchi[data.getDay()]];
  if (segodnya && seychas >= segodnya[0] && seychas < segodnya[1]) {
    return { otkryto: true, doZakrytiya: segodnya[1] - seychas, do: minutyVremya(segodnya[1]), otkroetsya: null };
  }
  if (segodnya && seychas < segodnya[0]) return { otkryto: false, do: null, otkroetsya: 'в ' + minutyVremya(segodnya[0]) };
  for (let i = 1; i <= 7; i++) {
    const ch = zavedenie.chasy[klyuchi[(data.getDay() + i) % 7]];
    if (ch) return { otkryto: false, do: null, otkroetsya: (i === 1 ? 'завтра в ' : 'в ') + minutyVremya(ch[0]) };
  }
  return { otkryto: false, do: null, otkroetsya: null };
}
function minutyVremya(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function rubli(n) { return n.toLocaleString('ru-RU'); }

// ---------- Живой фон ----------
class FonGradient {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pyatna = [];
    this.cveta = PALITRA_FONA.testo.map(hexVRgb);
    this.celi = this.cveta.map(c => c.slice());
    this.aktiven = true;
    const w = canvas.width, h = canvas.height;
    for (let i = 0; i < 5; i++) {
      this.pyatna.push({
        x: Math.random() * w, y: Math.random() * h,
        r: w * (0.55 + Math.random() * 0.35),
        vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .14,
        faza: Math.random() * Math.PI * 2,
      });
    }
    this.poslednij = 0;
    this.kadr = this.kadr.bind(this);
    document.addEventListener('visibilitychange', () => document.hidden ? this.pauza() : this.prodolzhit());
    if (menshDvizheniya) this.narisovat(0); else requestAnimationFrame(this.kadr);
  }
  zadatCveta(hexy) { this.celi = hexy.map(hexVRgb); }
  pauza() { this.aktiven = false; }
  prodolzhit() { if (!this.aktiven) { this.aktiven = true; requestAnimationFrame(this.kadr); } }
  kadr(t) {
    if (!this.aktiven) return;
    if (t - this.poslednij > 1000 / 28) { this.poslednij = t; this.narisovat(t); }
    requestAnimationFrame(this.kadr);
  }
  narisovat(t) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#FFF1DC';
    ctx.fillRect(0, 0, w, h);
    this.pyatna.forEach((p, i) => {
      // цвет плывёт к цели раздела
      const c = this.cveta[i], cel = this.celi[i];
      for (let k = 0; k < 3; k++) c[k] += (cel[k] - c[k]) * .04;
      p.x += p.vx + Math.sin(t / 3800 + p.faza) * .12;
      p.y += p.vy + Math.cos(t / 4600 + p.faza) * .12;
      if (p.x < -p.r * .3) p.vx = Math.abs(p.vx); if (p.x > w + p.r * .3) p.vx = -Math.abs(p.vx);
      if (p.y < -p.r * .3) p.vy = Math.abs(p.vy); if (p.y > h + p.r * .3) p.vy = -Math.abs(p.vy);
      const r = p.r * (1 + Math.sin(t / 2600 + p.faza) * .08);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const rgb = c.map(Math.round).join(',');
      g.addColorStop(0, `rgba(${rgb},.95)`);
      g.addColorStop(.55, `rgba(${rgb},.45)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
}
function hexVRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

// ---------- Отклик на касание: пружина ----------
function nazhatie(el, masshtab = .96) {
  const vniz = () => { el.style.transition = 'transform .12s ease-out'; el.style.transform = `scale(${masshtab})`; };
  const vverh = () => { el.style.transition = `transform .6s ${pruzhinaZhivaya}`; el.style.transform = ''; };
  el.addEventListener('pointerdown', vniz);
  el.addEventListener('pointerup', vverh);
  el.addEventListener('pointercancel', vverh);
  el.addEventListener('pointerleave', vverh);
}
function vibro(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

// ---------- Каскад появления ----------
function poyavlenieKaskadom(elementy, shag = 45) {
  elementy.forEach((el, i) => {
    el.classList.add('polosa--pokazana');
    if (menshDvizheniya) return;
    el.animate(
      [{ opacity: 0, transform: 'translateY(30px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 650, delay: i * shag, easing: pruzhina, fill: 'backwards' },
    );
  });
}

// «прокрутка» цифр
function pokazatChislo(el, ot, do_, ms = 420) {
  const start = performance.now();
  const shag = (t) => {
    const k = Math.min(1, (t - start) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = rubli(Math.round(ot + (do_ - ot) * e)) + ' ₽';
    if (k < 1) requestAnimationFrame(shag);
  };
  requestAnimationFrame(shag);
}

// ---------- Хинкалик ----------
class Hinkalik {
  constructor(kontejner) {
    this.el = kontejner;
    this.svg = kontejner.querySelector('svg');
    this.zrachki = kontejner.querySelectorAll('.zrachok');
    this.oblachko = kontejner.querySelector('.hinkalik__oblachko');
    this.poslednyayaFraza = 0;
    this.tajmerFrazy = null;
    let px = 0, py = 0, cx = 0, cy = 0;
    const sledit = (e) => { px = e.clientX; py = e.clientY; };
    document.addEventListener('pointermove', sledit, { passive: true });
    document.addEventListener('touchmove', (e) => sledit(e.touches[0]), { passive: true });
    const tik = () => {
      const r = this.el.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * .6);
      const dl = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dl / 220);
      cx += ((dx / dl) * 2.6 * k - cx) * .12;
      cy += ((dy / dl) * 2.4 * k - cy) * .12;
      this.zrachki.forEach(z => { z.style.transform = `translate(${cx}px, ${cy}px)`; });
      requestAnimationFrame(tik);
    };
    if (!menshDvizheniya) requestAnimationFrame(tik);
    this.planMorganie();
    kontejner.addEventListener('pointerdown', () => {
      this.morgnut(); setTimeout(() => this.morgnut(), 220);
      this.pryg();
      this.skazat('Скоро можно будет заказать голосом', 3200, true);
    });
  }
  planMorganie() {
    setTimeout(() => { this.morgnut(); this.planMorganie(); }, 3000 + Math.random() * 4000);
  }
  morgnut() {
    this.el.classList.add('hinkalik--morgaet');
    setTimeout(() => this.el.classList.remove('hinkalik--morgaet'), 140);
  }
  pryg() {
    if (menshDvizheniya) return;
    this.svg.animate(
      [{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(-16px) scale(.94,1.08)', offset: .4 }, { transform: 'translateY(0) scale(1.06,.94)', offset: .75 }, { transform: 'none' }],
      { duration: 620, easing: pruzhinaZhivaya },
    );
  }
  skazat(tekst, ms = 3200, pryamayaReakciya = false) {
    const seychas = Date.now();
    if (!pryamayaReakciya && seychas - this.poslednyayaFraza < 20000) return;
    this.poslednyayaFraza = seychas;
    clearTimeout(this.tajmerFrazy);
    this.oblachko.textContent = tekst;
    this.oblachko.classList.add('hinkalik__oblachko--vidno');
    this.tajmerFrazy = setTimeout(() => this.oblachko.classList.remove('hinkalik__oblachko--vidno'), ms);
  }
}

// ---------- Сторис (заглушки: картинок ещё нет) ----------
const ISTORII = [
  { metka: 'акция', zagolovok: '−20 % на первый заказ', tekst: 'при самовывозе', emodzi: '🎁', semeystvo: 'kombo', svetlyy: true },
  { metka: 'подарок', zagolovok: '10 хинкали + 2 в подарок', tekst: 'в любом заведении', emodzi: '🥟', semeystvo: 'testo' },
  { metka: 'сегодня', zagolovok: 'Хачапури дня', tekst: 'по‑аджарски из печи', emodzi: '🔥', semeystvo: 'zhar' },
  { metka: 'банкеты', zagolovok: 'Соберём стол', tekst: 'банкеты и поминки', emodzi: '🍷', semeystvo: 'vino', svetlyy: true },
  { metka: 'скоро', zagolovok: 'Заказ голосом', tekst: 'Хинкалик учится слушать', emodzi: '🎙️', semeystvo: 'sladkoe' },
];
const GRADIENT_CSS = { testo: 'var(--g-testo)', zhar: 'var(--g-zhar)', zelen: 'var(--g-zelen)', sladkoe: 'var(--g-sladkoe)', vino: 'var(--g-vino)', kombo: 'var(--g-kombo)' };

function miniPersonazh() {
  return `<svg viewBox="0 0 100 100" class="banner__personazh" aria-hidden="true">
    <use href="#hinkalik-telo"/>
    <ellipse cx="40" cy="64" rx="6.5" ry="7.5" fill="#fff" stroke="#5C4128" stroke-width="1.6"/>
    <ellipse cx="60" cy="64" rx="6.5" ry="7.5" fill="#fff" stroke="#5C4128" stroke-width="1.6"/>
    <circle cx="41.5" cy="65" r="3.4" fill="#231A14"/><circle cx="61.5" cy="65" r="3.4" fill="#231A14"/>
    <circle cx="43" cy="63" r="1.2" fill="#fff"/><circle cx="63" cy="63" r="1.2" fill="#fff"/>
    <path d="M44 78 C47 82 53 82 56 78" fill="none" stroke="#5C4128" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
}

function narisovatIstorii(kontejner) {
  kontejner.innerHTML = ISTORII.map(i => `
    <button type="button" class="banner ${i.svetlyy ? 'banner--svetlyy-tekst' : ''}" style="background:${GRADIENT_CSS[i.semeystvo]}">
      <div class="banner__metka">${i.metka}</div>
      <div class="banner__zagolovok">${i.zagolovok}</div>
      <div class="banner__tekst">${i.tekst}</div>
      <div class="banner__emodzi">${i.emodzi}</div>
      ${miniPersonazh()}
      <div class="banner__kolco"></div>
    </button>`).join('');
  kontejner.querySelectorAll('.banner').forEach(b => nazhatie(b, .965));
}

// ---------- Разделы ----------
function ikonkaPlyus() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" fill="currentColor"/></svg>';
}

// Какие снимки блюд реально лежат в foto/. В menyu.json поле foto заполнено
// с прошлой сборки, а папку могли очистить под перегенерацию — тогда каждый <img>
// давал бы 404 в консоли. Пруф спрашивает листинг папки у локального сервера
// (python http.server отдаёт его как HTML); нет листинга — верим полю foto.
let FOTO_EST = null;   // null = не проверяли, Set = список имён файлов
async function uznatKakieFotoEst() {
  try {
    const otvet = await fetch('../../foto/', { headers: { Accept: 'text/html' } });
    if (!otvet.ok) return;
    const tip = otvet.headers.get('content-type') || '';
    if (!tip.includes('text/html')) return;
    const html = await otvet.text();
    FOTO_EST = new Set([...html.matchAll(/href="([^"]+\.jpe?g)"/gi)].map(m => decodeURIComponent(m[1])));
  } catch (o) { /* сети нет — остаёмся при поле foto */ }
}
function putFoto(blyudo) {
  if (!blyudo.foto) return null;
  if (FOTO_EST && !FOTO_EST.has(blyudo.foto.replace(/^foto\//, ''))) return null;
  return '../../' + blyudo.foto;
}

function narisovatRazdel(razdel, nomer, zavId) {
  const sem = semeystvoRazdela(razdel.nazvanie);
  const blyuda = razdel.blyuda.filter(b => prichinaNedostupnosti(b, zavId) !== 'net');
  const ceny = blyuda.filter(b => !prichinaNedostupnosti(b, zavId)).map(b => cenaV(b, zavId));
  const ot = ceny.length ? Math.min(...ceny) : null;
  let glavnoe = razdel.nazvanie, hvost = '';
  if (razdel.nazvanie.length > 12 && razdel.nazvanie.includes(' и ')) {
    const [a, ...b] = razdel.nazvanie.split(' и ');
    glavnoe = a; hvost = 'и ' + b.join(' и ');
  }
  const kartochki = blyuda.map((b, indeks) => {
    const prichina = prichinaNedostupnosti(b, zavId);
    const cena = cenaV(b, zavId);
    const meta = [];
    if (b.ves) meta.push(`${b.ves} г`);
    if (b.vremya) meta.push(`≈ ${b.vremya} мин`);
    if (prichina === 'stop') meta.push('<span class="stop">нет сегодня</span>');
    const put = putFoto(b);
    const foto = put ? `<img src="${put}" alt="" loading="lazy" onerror="this.remove()">` : '';
    return `
      <article class="polosa ${prichina ? 'polosa--stop' : ''} ${indeks === 0 ? 'polosa--glavnaya' : ''}" data-id="${b.id}" data-cena="${cena}">
        <div class="polosa__foto polosa__foto--${sem}" ${put && b.cvet ? `style="background:radial-gradient(circle at 72% 82%, ${b.cvet} 0, ${b.cvet}00 62%), ${GRADIENT_CSS[sem]}"` : ''}>
          <span class="polosa__nomer">${String(indeks + 1).padStart(2, '0')}</span>${foto}
        </div>
        <div class="polosa__tekst">
          <div class="polosa__nazvanie">${b.nazvanie}</div>
          <div class="polosa__meta">${meta.join(' · ')}</div>
        </div>
        <div class="polosa__cena">
          <div class="polosa__summa">${rubli(cena)}<span>₽</span></div>
          ${prichina ? '' : `<button type="button" class="plyus" aria-label="Добавить ${b.nazvanie}">${ikonkaPlyus()}<span class="plyus__schet"></span></button>`}
        </div>
      </article>`;
  }).join('');
  return `
    <section class="razdel razdel--${sem}" id="razdel-${razdel.id}" data-semeystvo="${sem}">
      <div class="oblozhka oblozhka--${sem}">
        <div class="oblozhka__nomer">${String(nomer).padStart(2, '0')}</div>
        <div class="oblozhka__metka">раздел ${String(nomer).padStart(2, '0')} · ${IMYA_SEMEYSTVA[sem]}</div>
        <h2 class="oblozhka__zagolovok">${glavnoe}${hvost ? `<small>${hvost}</small>` : ''}</h2>
        <div class="oblozhka__niz">
          <span>${blyuda.length} ${sklonenie(blyuda.length, ['блюдо', 'блюда', 'блюд'])}</span>
          ${ot !== null ? `<span class="oblozhka__ot">от ${rubli(ot)} ₽</span>` : ''}
        </div>
      </div>
      <div class="polosy">${kartochki}</div>
    </section>`;
}
function sklonenie(n, formy) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return formy[0];
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return formy[1];
  return formy[2];
}

// ---------- Корзина (в пруфе — только счёт и сумма) ----------
const korzina = { pozicii: new Map(), summa() { let s = 0; this.pozicii.forEach(p => s += p.cena * p.kolichestvo); return s; }, kolichestvo() { let k = 0; this.pozicii.forEach(p => k += p.kolichestvo); return k; } };

// ---------- Сборка ----------
async function start() {
  const fon = new FonGradient(document.getElementById('fon'));
  const hinkalik = new Hinkalik(document.getElementById('hinkalik'));
  narisovatIstorii(document.getElementById('istorii'));
  ['mesto', 'korzina'].forEach(id => nazhatie(document.getElementById(id), .95));
  document.querySelectorAll('.niz__punkt').forEach(b => nazhatie(b, .9));

  const [otvet] = await Promise.all([fetch('../../menyu.json'), uznatKakieFotoEst()]);
  const menyu = await otvet.json();
  const zav = menyu.zavedeniya.find(z => z.nazvanie === ZAVEDENIE_NAZVANIE) || menyu.zavedeniya[0];

  // шапка: заведение, часы, штамп
  const sostoyanie = otkrytoSeychas(zav);
  const tekstChasov = sostoyanie.otkryto ? `открыто до ${sostoyanie.do}` : `откроется ${sostoyanie.otkroetsya}`;
  document.getElementById('mesto-tekst').textContent = `${zav.nazvanie} · ${tekstChasov}`;
  const shtampTekst = (sostoyanie.otkryto ? `открыто · до ${sostoyanie.do} · ` : `закрыто · ${sostoyanie.otkroetsya} · `).toUpperCase();
  const textPath = document.getElementById('shtamp-textpath');
  textPath.textContent = shtampTekst.repeat(2);
  textPath.setAttribute('textLength', '226');
  textPath.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  if (menyu.snyato) {
    document.getElementById('brend-data').textContent = new Date(menyu.snyato).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  // бегущая строка: настоящие цифры
  const vsegoBlyud = menyu.razdely.reduce((s, r) => s + r.blyuda.length, 0);
  const hinkaliOt = Math.min(...menyu.razdely[0].blyuda.map(b => cenaV(b, zav.id)));
  const stroka = `Афиша дня · <em>${menyu.razdely.length} ${sklonenie(menyu.razdely.length, ['раздел', 'раздела', 'разделов'])}</em> · ${vsegoBlyud} ${sklonenie(vsegoBlyud, ['блюдо', 'блюда', 'блюд'])} · ${menyu.zavedeniya.length} ${sklonenie(menyu.zavedeniya.length, ['заведение', 'заведения', 'заведений'])} · хинкали от <em>${rubli(hinkaliOt)} ₽</em> · хачапури из печи · шашлык на углях · `;
  document.getElementById('begushchaya').innerHTML = `<span class="begushchaya__tekst">${stroka}</span><span class="begushchaya__tekst">${stroka}</span>`;

  // лента разделов
  const lenta = document.getElementById('lenta-prokrutka');
  lenta.innerHTML = menyu.razdely.map((r, i) => `
    <button type="button" class="tabletka ${i === 0 ? 'tabletka--aktiv' : ''} ${i >= SKOLKO_RAZDELOV ? 'tabletka--dalshe' : ''}" data-id="${r.id}">${r.nazvanie}</button>`).join('');
  lenta.querySelectorAll('.tabletka').forEach(t => nazhatie(t, .92));

  // разделы
  const razdely = document.getElementById('razdely');
  const pokazannye = menyu.razdely.slice(0, SKOLKO_RAZDELOV);
  const ostalnye = menyu.razdely.slice(SKOLKO_RAZDELOV);
  const vsegoOstalos = ostalnye.reduce((s, r) => s + r.blyuda.length, 0);
  razdely.innerHTML = pokazannye.map((r, i) => narisovatRazdel(r, i + 1, zav.id)).join('') + `
    <section class="dalshe" id="dalshe">
      <div class="dalshe__zagolovok">Дальше по афише — <em>ещё ${ostalnye.length} ${sklonenie(ostalnye.length, ['раздел', 'раздела', 'разделов'])}</em>, ${vsegoOstalos} ${sklonenie(vsegoOstalos, ['блюдо', 'блюда', 'блюд'])}</div>
      <div class="dalshe__spisok">${ostalnye.map(r => `<span>${r.nazvanie}</span>`).join('')}</div>
    </section>`;

  // пружины на карточки и «+»
  razdely.querySelectorAll('.polosa').forEach(p => nazhatie(p, .975));
  razdely.querySelectorAll('.plyus').forEach(b => {
    nazhatie(b, .82);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const kartochka = b.closest('.polosa');
      const id = kartochka.dataset.id, cena = Number(kartochka.dataset.cena);
      const poz = korzina.pozicii.get(id) || { cena, kolichestvo: 0 };
      const bylo = korzina.summa();
      poz.kolichestvo += 1;
      korzina.pozicii.set(id, poz);
      b.classList.add('plyus--vzyato');
      b.querySelector('.plyus__schet').textContent = poz.kolichestvo;
      b.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.15)', offset: .5 }, { transform: 'scale(1)' }], { duration: 480, easing: pruzhinaZhivaya });
      obnovitKorzinu(bylo);
      hinkalik.pryg();
      if (korzina.kolichestvo() === 1) hinkalik.skazat('Записал. К хинкали берут соус', 3000, true);
      vibro(8);
    });
  });

  // каскад: при первом показе раздела
  const nablyudatel = new IntersectionObserver((zapisi) => {
    zapisi.forEach(z => {
      if (!z.isIntersecting) return;
      poyavlenieKaskadom([...z.target.querySelectorAll('.polosa:not(.polosa--pokazana)')]);
      nablyudatel.unobserve(z.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  razdely.querySelectorAll('.polosy').forEach(p => nablyudatel.observe(p));

  // клик по таблетке — к разделу
  lenta.addEventListener('click', (e) => {
    const t = e.target.closest('.tabletka'); if (!t) return;
    const cel = document.getElementById('razdel-' + t.dataset.id) || document.getElementById('dalshe');
    const lentaVysota = document.getElementById('lenta').offsetHeight;
    const y = cel.getBoundingClientRect().top + window.scrollY - lentaVysota;
    window.scrollTo({ top: y, behavior: menshDvizheniya ? 'auto' : 'smooth' });
  });

  // параллакс и активный раздел
  const shapkaVerh = document.querySelector('.shapka__verh');
  const oblozhki = [...razdely.querySelectorAll('.oblozhka')];
  const lentaEl = document.getElementById('lenta');
  let aktivnyy = null, zaplanirovan = false;
  const kadr = () => {
    zaplanirovan = false;
    const y = window.scrollY, vh = window.innerHeight;
    if (!menshDvizheniya) {
      shapkaVerh.style.transform = `translateY(${Math.min(y, 400) * .25}px)`;
      shapkaVerh.style.opacity = String(Math.max(0, 1 - y / 150));
    }
    const lentaVysota = lentaEl.offsetHeight;
    let novyy = null;
    oblozhki.forEach(o => {
      const r = o.getBoundingClientRect();
      const sekciya = o.parentElement;
      if (sekciya.getBoundingClientRect().top <= lentaVysota + 120) novyy = sekciya;
      if (r.bottom < 0 || r.top > vh) return;
      const d = Math.max(-vh, Math.min(vh, lentaVysota - r.top));   // >0 — обложка ушла под ленту
      if (menshDvizheniya) return;
      o.querySelector('.oblozhka__zagolovok').style.transform = `translateY(${Math.max(0, d) * .32}px)`;
      o.querySelector('.oblozhka__nomer').style.transform = `translateY(${-d * .22}px) rotate(${d * .02}deg)`;
    });
    if (novyy !== aktivnyy) {
      aktivnyy = novyy;
      const id = aktivnyy ? aktivnyy.id.replace('razdel-', '') : null;
      lenta.querySelectorAll('.tabletka').forEach(t => t.classList.toggle('tabletka--aktiv', t.dataset.id === id));
      const akt = lenta.querySelector('.tabletka--aktiv');
      if (akt) akt.scrollIntoView({ inline: 'center', block: 'nearest', behavior: menshDvizheniya ? 'auto' : 'smooth' });
      fon.zadatCveta(PALITRA_FONA[aktivnyy ? aktivnyy.dataset.semeystvo : 'testo'] || PALITRA_FONA.testo);
    }
  };
  window.addEventListener('scroll', () => { if (!zaplanirovan) { zaplanirovan = true; requestAnimationFrame(kadr); } }, { passive: true });
  kadr();

  // Хинкалик здоровается один раз
  setTimeout(() => hinkalik.skazat('Привет! Начнём с хинкали?', 3600), 900);
}

function obnovitKorzinu(bylo) {
  const knopka = document.getElementById('korzina');
  knopka.classList.toggle('korzina--pusto', korzina.kolichestvo() === 0);
  document.getElementById('korzina-schet').textContent = korzina.kolichestvo();
  pokazatChislo(document.getElementById('korzina-summa'), bylo, korzina.summa());
  knopka.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .35 }, { transform: 'scale(1)' }], { duration: 520, easing: pruzhinaZhivaya });
}

start().catch(o => {
  document.getElementById('zagruzka').textContent = 'Меню не загрузилось: ' + o.message;
});
