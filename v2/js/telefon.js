// Витрина Хинкальной v2 — телефон гостя: одна маска на вход, оформление и «позвоним, когда начнём возить».
// 25.10.2026 владелец: «маска не годится никуда, стереть не могу». Было три копии; у входа десятая цифра
// сдвигала номер («+7 (791) 680-54-57»), а стирание заполняло поле семёрками.
// Россия: +7 (916) 805-45-70. Первая 7 или 8 — код страны; «+7 916…», «8 916…», «916…» вставляются как есть.
// Номера любых стран (владелец 30.10.2026: сначала Грузия и Узбекистан): с «+» — по коду страны, «+995 599 12 34 56».
// Та же логика у кассы: панель lib/kassa/telefonVvod.ts.

// трёхзначные коды раньше «7» и «90»: «+995…» не должен стать Турцией
const STRANY = [
  { kod: '995', dlina: 9, gruppy: [3, 2, 2, 2] },   // Грузия
  { kod: '998', dlina: 9, gruppy: [2, 3, 2, 2] },   // Узбекистан
  { kod: '374', dlina: 8, gruppy: [2, 2, 2, 2] },   // Армения
  { kod: '994', dlina: 9, gruppy: [2, 3, 2, 2] },   // Азербайджан
  { kod: '375', dlina: 9, gruppy: [2, 3, 2, 2] },   // Беларусь
  { kod: '996', dlina: 9, gruppy: [3, 3, 3] },      // Киргизия
  { kod: '992', dlina: 9, gruppy: [2, 3, 2, 2] },   // Таджикистан
  { kod: '90', dlina: 10, gruppy: [3, 3, 2, 2] },   // Турция
  { kod: '7', dlina: 10, gruppy: [3, 3, 2, 2] },    // Россия, Казахстан
];
const poNachalu = (d) => STRANY.find((s) => d.startsWith(s.kod));

/**
 * Номер без кода страны, набран ли код, сколько цифр кода срезано слева и страна:
 * «+7 (916) 8» → {nomer: '9168', kod: true, srezano: 1, strana: '7'}. Страны нет в списке («+44…») — strana: '',
 * nomer — все цифры. Без «+» до 10 цифр — Россия; больше 10 цифр — номер с кодом страны (так он лежит в базе).
 */
export function razobratNomer(s) {
  const stroka = String(s || '').trim();
  let d = stroka.replace(/\D/g, '');
  const sKodom = stroka.startsWith('+') || d.length > 10;
  const strana = sKodom && d ? (/^8/.test(d) ? STRANY[STRANY.length - 1] : poNachalu(d)) : STRANY[STRANY.length - 1];
  if (!strana) return { nomer: d.slice(0, 15), kod: true, srezano: 0, strana: '' };
  let srezano = 0;
  if (strana.kod === '7') {
    const kod = /^[78]/.test(d) || sKodom;
    if (/^[78]/.test(d)) { d = d.slice(1); srezano++; }
    // код набрали дважды («+7 » и привычное «8 916…») — лишняя 7/8 видна, когда цифр стало больше десяти
    if (d.length > 10 && /^[78]/.test(d)) { d = d.slice(1); srezano++; }
    return { nomer: d.slice(0, 10), kod, srezano, strana: '7' };
  }
  d = d.slice(strana.kod.length); srezano = strana.kod.length;
  if (d.length > strana.dlina && d.startsWith(strana.kod)) { d = d.slice(strana.kod.length); srezano += strana.kod.length; }
  return { nomer: d.slice(0, strana.dlina), kod: true, srezano, strana: strana.kod };
}

/** «+7 (916) 805-45-70», «+995 599 12 34 56» по мере набора; набран только код — «+7 », пусто — ''. */
export function maskaNomera(nomer, kod = true, strana = '7') {
  if (!strana) return nomer ? `+${nomer}` : '';
  if (!nomer) return kod ? `+${strana} ` : '';
  if (strana === '7') {
    let s = `+7 (${nomer.slice(0, 3)}`;
    if (nomer.length > 3) s += `) ${nomer.slice(3, 6)}`;
    if (nomer.length > 6) s += `-${nomer.slice(6, 8)}`;
    if (nomer.length > 8) s += `-${nomer.slice(8, 10)}`;
    return s;
  }
  const chasti = [];
  let i = 0;
  for (const g of STRANY.find((x) => x.kod === strana)?.gruppy ?? [nomer.length]) {
    if (i >= nomer.length) break;
    chasti.push(nomer.slice(i, i + g)); i += g;
  }
  return `+${strana} ${chasti.join(' ')}`;
}

/** Номер в любом виде (поле, база, черновик) — красиво: «79168054570» → «+7 (916) 805-45-70». */
export function krasivo(s) {
  const r = razobratNomer(s);
  return maskaNomera(r.nomer, false, r.strana);
}

/** Скольких цифр не хватает до полного номера (страны нет в списке — нужно хотя бы 8). */
export function nehvataet(s) {
  const r = razobratNomer(s);
  const nado = r.strana ? STRANY.find((x) => x.kod === r.strana).dlina : 8;
  return Math.max(0, nado - r.nomer.length);
}

/** Позиция каретки сразу после n-й цифры номера (код страны — не номер). */
function poziciya(s, n) {
  const nachalo = s.startsWith('+7 (') ? 4 : s.indexOf(' ') + 1;
  if (n <= 0) return Math.min(nachalo, s.length);
  let schet = 0;
  for (let i = nachalo; i < s.length; i++) if (/\d/.test(s[i]) && ++schet === n) return i + 1;
  return s.length;
}

/**
 * Вешает маску на поле. Каретка остаётся у той же цифры, стёртая скобка или дефис стирает цифру рядом
 * (иначе маска возвращает знак и стереть нельзя), стёртый «+7 » очищает поле.
 * @param {HTMLInputElement} vvod
 * @param {(znachenie: string) => void} [naIzmenenie] — номер в поле, с кодом страны («+995 599 12 34 56»)
 */
export function maskaNaPole(vvod, naIzmenenie) {
  let bylo = razobratNomer(vvod.value).nomer;
  vvod.addEventListener('input', (e) => {
    const syroe = vvod.value;
    let kursor = syroe.length;
    try { kursor = vvod.selectionStart ?? syroe.length; } catch { /* не все поля умеют */ }
    let { nomer, kod, srezano, strana } = razobratNomer(syroe);
    // сколько цифр номера левее каретки — по ним вернём её на место после маски
    let sleva = Math.min(nomer.length, Math.max(0, syroe.slice(0, kursor).replace(/\D/g, '').length - srezano));
    const udalenie = String(e.inputType || '').startsWith('delete');
    if (strana && udalenie && nomer === bylo) {
      if (!nomer) kod = false;
      else if (e.inputType === 'deleteContentBackward' && sleva > 0) { nomer = nomer.slice(0, sleva - 1) + nomer.slice(sleva); sleva -= 1; }
      else if (e.inputType === 'deleteContentForward' && sleva < nomer.length) nomer = nomer.slice(0, sleva) + nomer.slice(sleva + 1);
    }
    bylo = nomer;
    // набрали только «+» — ждём 7 гостя, а не подставляем свою: иначе его «+7» становилось «+7 (7…» (Б-25, 26.10.2026)
    vvod.value = syroe.trim() === '+' ? '+' : maskaNomera(nomer, kod, strana);
    const poz = kursor >= syroe.length ? vvod.value.length : poziciya(vvod.value, sleva);
    try { vvod.setSelectionRange(poz, poz); } catch { /* не все поля умеют */ }
    if (naIzmenenie) naIzmenenie(vvod.value);
  });
}
