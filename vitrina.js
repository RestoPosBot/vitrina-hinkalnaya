/* Витрина Хинкальной. Одна страница, четыре экрана, адрес после решётки.
   Меню берётся из menyu.json — снимок настоящего меню с боевого сервера. */

(() => {
  'use strict';

  const ekran = document.getElementById('ekran');
  const niz = document.getElementById('niz');
  const schetchikUzel = document.getElementById('schetchik');

  let menyu = null;
  const korzina = zagruzitKorzinu();

  /* ---------------- хранение корзины ---------------- */

  function zagruzitKorzinu() {
    try {
      return JSON.parse(localStorage.getItem('korzina') || '{}');
    } catch (e) {
      return {};
    }
  }

  function sohranitKorzinu() {
    try {
      localStorage.setItem('korzina', JSON.stringify(korzina));
    } catch (e) { /* режим инкогнито — просто не сохраняем */ }
    obnovitSchetchik();
  }

  function vsegoShtuk() {
    return Object.values(korzina).reduce((s, p) => s + p.skolko, 0);
  }

  function vsegoDeneg() {
    return Object.values(korzina).reduce((s, p) => s + p.skolko * p.cena, 0);
  }

  function obnovitSchetchik() {
    const n = vsegoShtuk();
    schetchikUzel.hidden = n === 0;
    schetchikUzel.textContent = n;
  }

  /* ---------------- мелочи ---------------- */

  const deneg = (n) => n.toLocaleString('ru-RU') + ' ₽';

  /* «1 позиция, 2 позиции, 5 позиций» — иначе интерфейс выглядит машинным */
  function sklonenie(chislo, odna, dve, pyat) {
    const ost100 = chislo % 100;
    if (ost100 >= 11 && ost100 <= 14) return pyat;
    const ost10 = chislo % 10;
    if (ost10 === 1) return odna;
    if (ost10 >= 2 && ost10 <= 4) return dve;
    return pyat;
  }

  /* Показывать ли фотографии. В тестовой базе они случайные: у хинкали
     макароны, у жареных — шаурма. Пока это так, гость может их отключить. */
  const fotoVidny = () => localStorage.getItem('bez-foto') !== '1';

  function hinkaliZnachok() {
    return '<svg viewBox="0 0 46 58" aria-hidden="true"><use href="#hinkali"/></svg>';
  }

  function ekranirovat(s) {
    return String(s).replace(/[&<>"']/g, (z) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]
    ));
  }

  let vspyskTaymer = null;
  function skazat(tekst) {
    let u = document.querySelector('.vspysk');
    if (!u) {
      u = document.createElement('div');
      u.className = 'vspysk';
      document.body.appendChild(u);
    }
    u.textContent = tekst;
    requestAnimationFrame(() => u.classList.add('vidno'));
    clearTimeout(vspyskTaymer);
    vspyskTaymer = setTimeout(() => u.classList.remove('vidno'), 1600);
  }

  function vseBlyuda() {
    return menyu.razdely.flatMap((r) => r.blyuda.map((b) => ({ ...b, razdel: r.nazvanie })));
  }

  function nayti(id) {
    return vseBlyuda().find((b) => b.id === id);
  }

  /* ---------------- корзина: действия ---------------- */

  function polozhit(blyudo, skolko = 1) {
    const est = korzina[blyudo.id];
    if (est) {
      est.skolko += skolko;
    } else {
      korzina[blyudo.id] = {
        id: blyudo.id, nazvanie: blyudo.nazvanie, cena: blyudo.cena,
        foto: blyudo.foto, skolko,
      };
    }
    if (korzina[blyudo.id].skolko <= 0) delete korzina[blyudo.id];
    sohranitKorzinu();
  }

  /* ---------------- разметка кусков ---------------- */

  function kartinkaBlyuda(b, klass) {
    if (!b.foto || !fotoVidny()) return `<div class="${klass}">${hinkaliZnachok()}</div>`;
    return `<div class="${klass}">${hinkaliZnachok()}
      <img src="${ekranirovat(b.foto)}" alt="" loading="lazy" decoding="async"
           onload="this.classList.add('vidno')"
           onerror="this.remove()">
    </div>`;
  }

  function upravlenie(b) {
    const v = korzina[b.id];
    if (!v) {
      return `<button class="plyus" data-polozhit="${b.id}" aria-label="Добавить ${ekranirovat(b.nazvanie)}">+</button>`;
    }
    return `<span class="schet">
      <button data-menshe="${b.id}" aria-label="Убрать одну">−</button>
      <span class="skolko">${v.skolko}</span>
      <button data-bolshe="${b.id}" aria-label="Добавить ещё">+</button>
    </span>`;
  }

  function kartochkaBlyuda(b) {
    if (!fotoVidny()) {
      // Прайс-лист: без фотографий рамка с пустотой только ест экран
      return `<article class="blyudo stroka-menyu">
        <a href="#/blyudo/${b.id}" class="zvanie">${ekranirovat(b.nazvanie)}
          ${b.ves ? `<small>${b.ves} г</small>` : ''}</a>
        <span class="cena">${deneg(b.cena)}</span>
        ${upravlenie(b)}
      </article>`;
    }
    return `<article class="blyudo">
      <a href="#/blyudo/${b.id}">${kartinkaBlyuda(b, 'foto')}</a>
      <div class="telo">
        <a href="#/blyudo/${b.id}" class="nazvanie">${ekranirovat(b.nazvanie)}</a>
        ${b.ves ? `<span class="ves">${b.ves} г</span>` : ''}
        <div class="nizhe">
          <span class="cena">${deneg(b.cena)}</span>
          ${upravlenie(b)}
        </div>
      </div>
    </article>`;
  }

  /* ---------------- экраны ---------------- */

  function ekranZagruzki() {
    const hinkali = Array.from({ length: 5 }, () =>
      `<span class="mesto"><span class="ten"></span>
       <svg class="hinkali" viewBox="0 0 46 58"><use href="#hinkali"/></svg></span>`).join('');
    ekran.innerHTML = `<div class="zagruzka-ekran">
      <div class="zagruzka" role="status" aria-label="Загружаем меню">${hinkali}</div>
      <p style="color:var(--tusklo);font-size:14px">Ставим хинкали на огонь…</p>
    </div>`;
  }

  function ekranMenyu() {
    const lenta = menyu.razdely.map((r, i) =>
      `<button data-k-razdelu="r${i}">${ekranirovat(r.nazvanie)}</button>`).join('');

    const razdely = menyu.razdely.map((r, i) => `
      <section class="razdel">
        <h2 id="r${i}">${ekranirovat(r.nazvanie)}</h2>
        <div class="setka${fotoVidny() ? '' : ' spisok'}">${r.blyuda.map(kartochkaBlyuda).join('')}</div>
      </section>`).join('');

    ekran.innerHTML = `
      <header class="shapka">
        <h1>Хинкальная</h1>
        <p class="pod">${vseBlyuda().length} ${sklonenie(vseBlyuda().length, 'блюдо', 'блюда', 'блюд')} · самовывоз и доставка</p>
        <button class="perekl-foto" data-perekl-foto>${fotoVidny() ? 'без фото' : 'с фото'}</button>
      </header>
      <div class="lenta">${lenta}</div>
      <div class="poyavlenie">${razdely}</div>`;

    sleditZaRazdelami();
  }

  /* Лента сверху подсвечивает тот раздел, который сейчас на экране */
  function sleditZaRazdelami() {
    const knopki = [...document.querySelectorAll('.lenta button')];
    const zagolovki = [...document.querySelectorAll('.razdel h2')];
    if (!zagolovki.length) return;

    const nablyudatel = new IntersectionObserver((zapisi) => {
      zapisi.forEach((z) => {
        if (!z.isIntersecting) return;
        const nomer = zagolovki.indexOf(z.target);
        knopki.forEach((k, i) => k.setAttribute('aria-current', String(i === nomer)));
        const aktivnaya = knopki[nomer];
        if (aktivnaya) {
          aktivnaya.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }
      });
    }, { rootMargin: '-110px 0px -75% 0px' });

    zagolovki.forEach((z) => nablyudatel.observe(z));
  }

  function ekranBlyuda(id) {
    const b = nayti(id);
    if (!b) return ekranMenyu();
    const v = korzina[id];

    ekran.innerHTML = `
      <div class="podrobno poyavlenie">
        <div style="position:relative">
          <a class="nazad" href="#/" aria-label="Назад">←</a>
          ${kartinkaBlyuda(b, 'kartinka')}
        </div>
        <div class="telo">
          <h1>${ekranirovat(b.nazvanie)}</h1>
          <p class="svedeniya">${ekranirovat(b.razdel)}${b.ves ? ' · ' + b.ves + ' г' : ''}</p>
          ${b.sostav ? `<p class="sostav">${ekranirovat(b.sostav)}</p>` : ''}
        </div>
      </div>
      <div class="polosa-vnizu">
        ${v ? `<span class="schet" style="background:var(--zhar)">
                 <button data-menshe="${b.id}" aria-label="Убрать одну">−</button>
                 <span class="skolko">${v.skolko}</span>
                 <button data-bolshe="${b.id}" aria-label="Добавить ещё">+</button>
               </span>` : ''}
        <button class="glavnaya-knopka" data-polozhit="${b.id}">
          ${v ? 'В корзине · ' + deneg(v.skolko * b.cena) : 'В корзину · ' + deneg(b.cena)}
        </button>
      </div>`;

    niz.hidden = true;
  }

  function ekranPoiska(zapros = '') {
    const nayidennye = zapros.trim().length < 2 ? [] :
      vseBlyuda().filter((b) => b.nazvanie.toLowerCase().includes(zapros.trim().toLowerCase()));

    ekran.innerHTML = `
      <header class="shapka"><h1>Поиск</h1></header>
      <div style="padding:0 18px 12px">
        <label class="pole">
          <input id="poisk-pole" type="search" placeholder="Хинкали, хачапури, вино…"
                 value="${ekranirovat(zapros)}" autocomplete="off">
        </label>
      </div>
      <div class="razdel">
        ${zapros.trim().length < 2
          ? '<p style="color:var(--tusklo);font-size:14px">Наберите хотя бы две буквы.</p>'
          : (nayidennye.length
              ? `<p style="color:var(--tusklo);font-size:13px;margin:0 0 12px">Нашлось ${nayidennye.length}</p>
                 <div class="setka${fotoVidny() ? '' : ' spisok'}">${nayidennye.map(kartochkaBlyuda).join('')}</div>`
              : `<div class="pusto">${hinkaliZnachok()}<p>Ничего не нашли. Попробуйте другое слово.</p></div>`)}
      </div>`;

    const pole = document.getElementById('poisk-pole');
    pole.focus();
    pole.selectionStart = pole.value.length;
    let taymer = null;
    pole.addEventListener('input', () => {
      clearTimeout(taymer);
      taymer = setTimeout(() => {
        const znachenie = pole.value;
        ekranPoiska(znachenie);
      }, 250);
    });
  }

  function ekranKorziny() {
    const pozicii = Object.values(korzina);

    if (!pozicii.length) {
      ekran.innerHTML = `
        <header class="shapka"><h1>Корзина</h1></header>
        <div class="pusto">
          ${hinkaliZnachok()}
          <p>Пока пусто.<br>Меню ждёт.</p>
          <p style="margin-top:18px"><a href="#/" style="color:var(--zhar)">Открыть меню</a></p>
        </div>`;
      return;
    }

    ekran.innerHTML = `
      <header class="shapka"><h1>Корзина</h1></header>
      <div class="razdel poyavlenie">
        ${pozicii.map((p) => `
          <div class="stroka">
            ${p.foto ? `<img class="mini" src="${ekranirovat(p.foto)}" alt="" loading="lazy">`
                     : `<div class="mini" style="display:flex;align-items:center;justify-content:center">${hinkaliZnachok()}</div>`}
            <span class="zvanie">${ekranirovat(p.nazvanie)}<small>${deneg(p.cena)} за штуку</small></span>
            <span class="schet">
              <button data-menshe="${p.id}" aria-label="Убрать одну">−</button>
              <span class="skolko">${p.skolko}</span>
              <button data-bolshe="${p.id}" aria-label="Добавить ещё">+</button>
            </span>
          </div>`).join('')}
        <div class="itogo"><span>Итого</span><b>${deneg(vsegoDeneg())}</b></div>
      </div>
      <div class="polosa-vnizu">
        <a class="glavnaya-knopka" href="#/oformlenie">Оформить заказ</a>
      </div>`;
  }

  function ekranOformleniya() {
    if (!vsegoShtuk()) return (location.hash = '#/korzina');

    ekran.innerHTML = `
      <header class="shapka">
        <h1>Оформление</h1>
        <p class="pod">${vsegoShtuk()} ${sklonenie(vsegoShtuk(), 'позиция', 'позиции', 'позиций')} на ${deneg(vsegoDeneg())}</p>
      </header>
      <form class="razdel poyavlenie" id="zakaz">
        <div class="vybor" role="group" aria-label="Способ получения">
          <button type="button" data-sposob="samovyvoz" aria-pressed="true">Самовывоз</button>
          <button type="button" data-sposob="dostavka" aria-pressed="false">Доставка</button>
        </div>
        <label class="pole"><span>Имя</span><input name="imya" required autocomplete="name"></label>
        <label class="pole"><span>Телефон</span>
          <input name="telefon" required type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00"></label>
        <label class="pole" id="pole-adresa" hidden><span>Адрес</span>
          <input name="adres" autocomplete="street-address" placeholder="Улица, дом, квартира"></label>
        <label class="pole"><span>Пожелания к заказу</span>
          <textarea name="kommentariy" rows="3" placeholder="Например: хинкали поострее"></textarea></label>
      </form>
      <div class="polosa-vnizu">
        <button class="glavnaya-knopka" form="zakaz" type="submit">Отправить · ${deneg(vsegoDeneg())}</button>
      </div>`;

    const forma = document.getElementById('zakaz');
    const poleAdresa = document.getElementById('pole-adresa');

    forma.querySelectorAll('[data-sposob]').forEach((k) => {
      k.addEventListener('click', () => {
        forma.querySelectorAll('[data-sposob]').forEach((d) =>
          d.setAttribute('aria-pressed', String(d === k)));
        const dostavka = k.dataset.sposob === 'dostavka';
        poleAdresa.hidden = !dostavka;
        poleAdresa.querySelector('input').required = dostavka;
      });
    });

    forma.addEventListener('submit', (s) => {
      s.preventDefault();
      ekran.innerHTML = `
        <div class="pusto poyavlenie" style="padding-top:96px">
          ${hinkaliZnachok()}
          <h1 style="font-size:22px;margin:10px 0 8px;color:var(--tekst)">Спасибо!</h1>
          <p>Это демонстрация: заказ никуда не ушёл.<br>
             В рабочей версии он попадёт на кухню.</p>
          <p style="margin-top:22px"><a href="#/" style="color:var(--zhar)">Вернуться в меню</a></p>
        </div>`;
      document.querySelector('.polosa-vnizu')?.remove();
      Object.keys(korzina).forEach((k) => delete korzina[k]);
      sohranitKorzinu();
    });
  }

  /* ---------------- переходы между экранами ---------------- */

  function pokazat() {
    const adres = location.hash.replace(/^#/, '') || '/';
    niz.hidden = false;
    window.scrollTo({ top: 0 });

    if (adres.startsWith('/blyudo/')) {
      ekranBlyuda(adres.slice('/blyudo/'.length));
    } else if (adres.startsWith('/poisk')) {
      ekranPoiska();
    } else if (adres.startsWith('/korzina')) {
      ekranKorziny();
    } else if (adres.startsWith('/oformlenie')) {
      ekranOformleniya();
    } else {
      ekranMenyu();
    }

    const vkladka = adres.startsWith('/poisk') ? 'poisk'
      : (adres.startsWith('/korzina') || adres.startsWith('/oformlenie')) ? 'korzina' : 'menyu';
    document.querySelectorAll('.vkladka').forEach((v) =>
      v.setAttribute('aria-current', v.dataset.vkladka === vkladka ? 'page' : 'false'));
  }

  /* ---------------- нажатия ---------------- */

  document.addEventListener('click', (s) => {
    const kRazdelu = s.target.closest('[data-k-razdelu]');
    if (kRazdelu) {
      document.getElementById(kRazdelu.dataset.kRazdelu)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (s.target.closest('[data-perekl-foto]')) {
      localStorage.setItem('bez-foto', fotoVidny() ? '1' : '0');
      pokazatZanovoMyagko();
      return;
    }

    const polozhit_ = s.target.closest('[data-polozhit]');
    const bolshe = s.target.closest('[data-bolshe]');
    const menshe = s.target.closest('[data-menshe]');
    if (!polozhit_ && !bolshe && !menshe) return;

    s.preventDefault();
    const uzel = polozhit_ || bolshe || menshe;
    const id = uzel.dataset.polozhit || uzel.dataset.bolshe || uzel.dataset.menshe;

    const blyudo = nayti(id);
    if (!blyudo) return;

    polozhit(blyudo, menshe ? -1 : 1);
    if (polozhit_ && !menshe) skazat(blyudo.nazvanie + ' — в корзине');
    pokazatZanovoMyagko();
  });

  /* Перерисовываем текущий экран, сохраняя прокрутку: иначе после «плюса»
     список прыгает наверх и гость теряет место. */
  function pokazatZanovoMyagko() {
    const bylo = window.scrollY;
    pokazat();
    window.scrollTo({ top: bylo });
  }

  window.addEventListener('hashchange', pokazat);

  /* ---------------- запуск ---------------- */

  ekranZagruzki();

  fetch('menyu.json')
    .then((o) => o.json())
    .then((d) => {
      menyu = d;
      obnovitSchetchik();
      pokazat();
    })
    .catch(() => {
      ekran.innerHTML = `<div class="pusto">${hinkaliZnachok()}
        <p>Меню не загрузилось.<br>Проверьте связь и обновите страницу.</p></div>`;
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ });
    });
  }
})();
