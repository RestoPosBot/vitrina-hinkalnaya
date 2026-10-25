// Витрина Хинкальной v2 — телефон гостя: одна маска на вход, оформление и «позвоним, когда начнём возить».
// 25.10.2026 владелец: «маска не годится никуда, стереть не могу». Было три копии; у входа десятая цифра
// сдвигала номер («+7 (791) 680-54-57»), а стирание заполняло поле семёрками.
// Россия: +7 (916) 805-45-70. Первая 7 или 8 — код страны; «+7 916…», «8 916…», «916…» вставляются как есть.

/** Номер без кода страны (до 10 цифр), набран ли код и сколько цифр кода срезано слева: «+7 (916) 8» → {nomer: '9168', kod: true, srezano: 1}. */
export function razobratNomer(s) {
  const stroka = String(s || '');
  let d = stroka.replace(/\D/g, '');
  const kod = /^[78]/.test(d) || stroka.trim().startsWith('+');
  let srezano = 0;
  if (/^[78]/.test(d)) { d = d.slice(1); srezano++; }
  // код набрали дважды («+7 » и привычное «8 916…») — лишняя 7/8 видна, когда цифр стало больше десяти
  if (d.length > 10 && /^[78]/.test(d)) { d = d.slice(1); srezano++; }
  return { nomer: d.slice(0, 10), kod, srezano };
}

/** «+7 (916) 805-45-70» по мере набора; набран только код — «+7 », пусто — ''. */
export function maskaNomera(nomer, kod = true) {
  if (!nomer) return kod ? '+7 ' : '';
  let s = `+7 (${nomer.slice(0, 3)}`;
  if (nomer.length > 3) s += `) ${nomer.slice(3, 6)}`;
  if (nomer.length > 6) s += `-${nomer.slice(6, 8)}`;
  if (nomer.length > 8) s += `-${nomer.slice(8, 10)}`;
  return s;
}

/** Позиция каретки сразу после n-й цифры номера («+7 (» — не номер). */
function poziciya(s, n) {
  if (n <= 0) return Math.min(4, s.length);
  let schet = 0;
  for (let i = 4; i < s.length; i++) if (/\d/.test(s[i]) && ++schet === n) return i + 1;
  return s.length;
}

/**
 * Вешает маску на поле. Каретка остаётся у той же цифры, стёртая скобка или дефис стирает цифру рядом
 * (иначе маска возвращает знак и стереть нельзя), стёртый «+7 » очищает поле.
 * @param {HTMLInputElement} vvod
 * @param {(nomer: string) => void} [naIzmenenie] — номер без кода, до 10 цифр
 */
export function maskaNaPole(vvod, naIzmenenie) {
  let bylo = razobratNomer(vvod.value).nomer;
  vvod.addEventListener('input', (e) => {
    const syroe = vvod.value;
    let kursor = syroe.length;
    try { kursor = vvod.selectionStart ?? syroe.length; } catch { /* не все поля умеют */ }
    let { nomer, kod, srezano } = razobratNomer(syroe);
    // сколько цифр номера левее каретки — по ним вернём её на место после маски
    let sleva = Math.min(nomer.length, Math.max(0, syroe.slice(0, kursor).replace(/\D/g, '').length - srezano));
    const udalenie = String(e.inputType || '').startsWith('delete');
    if (udalenie && nomer === bylo) {
      if (!nomer) kod = false;
      else if (e.inputType === 'deleteContentBackward' && sleva > 0) { nomer = nomer.slice(0, sleva - 1) + nomer.slice(sleva); sleva -= 1; }
      else if (e.inputType === 'deleteContentForward' && sleva < nomer.length) nomer = nomer.slice(0, sleva) + nomer.slice(sleva + 1);
    }
    bylo = nomer;
    // набрали только «+» — ждём 7 гостя, а не подставляем свою: иначе его «+7» становилось «+7 (7…» (Б-25, 26.10.2026)
    vvod.value = syroe.trim() === '+' ? '+' : maskaNomera(nomer, kod);
    const poz = kursor >= syroe.length ? vvod.value.length : poziciya(vvod.value, sleva);
    try { vvod.setSelectionRange(poz, poz); } catch { /* не все поля умеют */ }
    if (naIzmenenie) naIzmenenie(nomer);
  });
}
