// Язык сайта гостя (30.10.2026, многоязычность): те же шесть языков, что в кассе ChikChak. Первый заход — по языку
// телефона, если среди его языков нет русского; дальше — выбор гостя в «Профиле». Переводит js/perevodchik.js
// (копия lib/perevod/perevodchik.js панели) словарём js/slova/<язык>.json; названия блюд остаются как в меню.
import { t, zapustit } from './perevodchik.js';

export const YAZYKI = [
  { kod: 'ru', nazvanie: 'Русский' },
  { kod: 'en', nazvanie: 'English' },
  { kod: 'hy', nazvanie: 'Հայերեն' },
  { kod: 'ka', nazvanie: 'ქართული' },
  { kod: 'uz', nazvanie: 'Oʻzbekcha' },
  { kod: 'az', nazvanie: 'Azərbaycanca' },
];
const KODY = YAZYKI.map((y) => y.kod);
const KLYUCH = 'yazyk';

export { t };

export function tekushchiy() {
  try {
    const y = localStorage.getItem(KLYUCH);
    if (KODY.includes(y)) return y;
  } catch { /* приватный режим */ }
  const spisok = navigator.languages?.length ? navigator.languages : [navigator.language || 'ru'];
  if (spisok.some((l) => /^ru\b/i.test(l))) return 'ru';
  for (const l of spisok) {
    const k = String(l).slice(0, 2).toLowerCase();
    if (KODY.includes(k)) return k;
  }
  return 'ru';
}

export async function vklyuchit(y = tekushchiy()) {
  const d = document.documentElement;
  d.lang = y;
  try {
    if (y === 'ru') zapustit(null);
    else {
      const otvet = await fetch(`js/slova/${y}.json`);
      zapustit(otvet.ok ? await otvet.json() : null);
    }
  } catch { zapustit(null); /* нет словаря или сети — остаёмся на русском */ }
  d.classList.remove('perevod-zhdyot');
}

export function vybrat(y) {
  if (!KODY.includes(y)) return;
  try { localStorage.setItem(KLYUCH, y); } catch { /* язык до перезагрузки */ }
  return vklyuchit(y);
}
