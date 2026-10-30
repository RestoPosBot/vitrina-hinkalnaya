// Переводчик поверх страницы: русский текст — ключ словаря. Обходит текстовые узлы и подписи (placeholder, title,
// aria-label, alt) и меняет их значение на месте, узлы не заменяет — React сохраняет свои ссылки. Новое и изменённое
// подхватывает MutationObserver до отрисовки. Чего в словаре нет — остаётся по-русски.
// Один и тот же файл работает в панели и на сайте гостя (копия в vitrina_hinkalnaya/v2/js/perevodchik.js).
//
// Порядок слов: React режет фразу «Убрать {n} из чека?» на соседние текстовые узлы. Если у элемента одни текстовые
// узлы, переводчик склеивает их, переводит фразу образцом целиком (армянский, грузинский, узбекский, азербайджанский
// ставят глагол в конец) и пишет её в первый узел, остальные опустошает. Не нашлось образца — переводит по кускам.
// Данные заведения не трогаем: обёртка с translate="no" пропускается; короткие образцы («{0} из {1}», «с {0}»)
// принимают на месте вставок только числа — иначе «Хинкали из баранины» стал бы «Хинкали of баранины».

const RUS = /[А-Яа-яЁё]/
const ATRIBUTY = ['placeholder', 'title', 'aria-label', 'alt']
const PROPUSK = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE'])
const CHISLO = '([−+-]?\\d[\\d\\s\\u00a0.,:]*(?:\\s?[₽%])?)'

let tochnye = new Map()
/** @type {{ re: RegExp, v: string, nomera: number[], kusok: string }[]} */
let obraztsy = []
/** @type {[RegExp, string][]} */
let slova = []
const kesh = new Map()
const keshFraz = new Map()
// узел -> русский оригинал и то, что вписали мы: своё изменение не переводим повторно, а при смене языка
// возвращаемся к оригиналу без перезагрузки
const ishodnik = new WeakMap()
const napisano = new WeakMap()
const vFraze = new WeakSet() // элементы, чьи текстовые узлы переведены одной фразой
let nablyudatel = null
// знак валюты сети вместо ₽ (владелец 30.10.2026: «валюта пусть будет настраиваемая»); null — рубли, как в коде
let znak = null
const nuzhno = s => (tochnye.size > 0 && RUS.test(s)) || (znak !== null && s.includes('₽'))

/** @param {{ tochnye?: Record<string,string>, obraztsy?: Record<string,string>, slova?: Record<string,string>, valyuta?: string | null } | null} s */
export function zagruzitSlovar(s) {
  s = s || {}
  znak = s.valyuta && s.valyuta !== '₽' ? s.valyuta : null
  tochnye = new Map(Object.entries(s.tochnye || {}))
  obraztsy = Object.entries(s.obraztsy || {})
    .map(([k, v]) => ({
      re: regulyarkaObraztsa(k),
      v,
      nomera: [...k.matchAll(/\{(\d+)\}/g)].map(m => +m[1]),
      kusok: k.split(/\{\d+\}/).reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), ''),
    }))
    // длинный образец раньше короткого: «Стол {0} — {1}» прежде «Стол {0}»
    .sort((a, b) => b.re.source.length - a.re.source.length)
  slova = Object.entries(s.slova || {})
    .sort((a, b) => b[0].length - a[0].length)
    .map(([k, v]) => [new RegExp(`(^|[^А-Яа-яЁё])${ekran(k)}(?![А-Яа-яЁё])`, 'g'), v])
  kesh.clear()
  keshFraz.clear()
}

function ekran(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Образец «Стол {0}» → регулярка; короткий («{0} из {1}», «с {0}») принимает на месте вставок только числа. */
export function regulyarkaObraztsa(k) {
  const dlinnoe = (k.replace(/\{\d+\}/g, ' ').match(/[А-Яа-яЁё]+/g) || []).some(w => w.length >= 4)
  return new RegExp('^' + k.split(/\{\d+\}/).map(ekran).join(dlinnoe ? '([\\s\\S]+?)' : CHISLO) + '$')
}

/** Перевод строки; без пары в словаре — сама строка. */
export function t(s) { return perevesti(s, true) }

function perevesti(s, sSlovami) {
  if (!s || !nuzhno(s)) return s
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s)
  const yadro = m[2].replace(/\s+/g, ' ')
  const k = sSlovami ? kesh : keshFraz
  let p = k.get(yadro)
  if (p === undefined) {
    p = tochnye.size && RUS.test(yadro) ? perevestiYadro(yadro, sSlovami) : yadro
    if (znak) p = p.split('₽').join(znak)
    if (k.size > 20000) k.clear()
    k.set(yadro, p)
  }
  return p === yadro ? s : m[1] + p + m[3]
}

function perevestiYadro(s, sSlovami) {
  const tochno = tochnye.get(s)
  if (tochno !== undefined) return tochno
  for (const o of obraztsy) {
    if (o.kusok && !s.includes(o.kusok)) continue
    const m = o.re.exec(s)
    if (!m) continue
    // вставки тоже могут быть словами интерфейса: «{0} — во всех заведениях», где {0} = «Скидка»
    return o.v.replace(/\{(\d+)\}/g, (_, n) => {
      const i = o.nomera.indexOf(+n)
      const vst = i < 0 ? '' : m[i + 1]
      return perevesti(vst, true)
    })
  }
  // формы числа и месяцы стоят при числе («3 блюда», «30 октября»); без цифр строка — скорее название из меню
  if (!sSlovami || !/\d/.test(s)) return s
  let r = s
  for (const [re, v] of slova) r = r.replace(re, (_, pered) => pered + v)
  return r
}

function propustit(el) {
  for (let e = el; e; e = e.parentElement) {
    if (PROPUSK.has(e.tagName) || e.isContentEditable) return true
    if (e.getAttribute('translate') === 'no') return true
  }
  return false
}

const original = u => (napisano.get(u) === u.nodeValue ? ishodnik.get(u) : u.nodeValue) ?? ''

function zapisat(u, rus, p) {
  ishodnik.set(u, rus)
  napisano.set(u, p)
  if (u.nodeValue !== p) u.nodeValue = p
}

// Фраза из соседних текстовых узлов одного элемента — целиком, образцом. false — не вышло, переводить по кускам.
function perevestiFrazu(el) {
  const uzly = el.childNodes
  if (uzly.length < 2) return false
  for (const u of uzly) if (u.nodeType !== 3) return false
  const rus = Array.from(uzly, original)
  const vse = rus.join('')
  if (!nuzhno(vse)) return false
  const p = perevesti(vse, false)
  if (p === vse) return false
  Array.from(uzly).forEach((u, i) => zapisat(u, rus[i], i === 0 ? p : ''))
  vFraze.add(el)
  return true
}

function perevestiKusok(uzel) {
  const v = uzel.nodeValue
  if (v == null) return
  const rus = original(uzel)
  // переводить нечего (русский, рубли), но в узле наш прежний перевод — вернуть оригинал
  if (!nuzhno(rus)) { if (napisano.get(uzel) === v && v !== rus) zapisat(uzel, rus, rus); return }
  const p = t(rus)
  if (p !== v) zapisat(uzel, rus, p)
}

function perevestiTekst(uzel) {
  const rod = uzel.parentElement
  if (!rod || propustit(rod)) return
  if (perevestiFrazu(rod)) return
  if (vFraze.has(rod)) {
    // фраза больше не складывается (React поменял кусок) — вернуть куски и перевести каждый
    vFraze.delete(rod)
    for (const u of rod.childNodes) if (u.nodeType === 3) perevestiKusok(u)
    return
  }
  perevestiKusok(uzel)
}

function perevestiAtributy(el) {
  let byli = ishodnik.get(el)
  for (const a of ATRIBUTY) {
    const v = el.getAttribute(a)
    if (!v) continue
    const nashe = byli && byli[a] && byli[a].nashe === v
    const rus = nashe ? byli[a].rus : v
    if (!nuzhno(rus)) { if (nashe && v !== rus) { byli[a].nashe = rus; el.setAttribute(a, rus) } continue }
    const p = t(rus)
    if (p === v) continue
    if (!byli) ishodnik.set(el, (byli = {}))
    byli[a] = { rus, nashe: p }
    el.setAttribute(a, p)
  }
  if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && RUS.test(el.value)) el.value = t(el.value)
}

function perevestiVetku(koren) {
  if (koren.nodeType === 3) return perevestiTekst(koren)
  if (koren.nodeType !== 1 || propustit(koren)) return
  perevestiAtributy(koren)
  const hod = document.createTreeWalker(koren, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: u => (u.nodeType === 1 && (PROPUSK.has(u.tagName) || u.getAttribute('translate') === 'no')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let u = hod.nextNode(); u; u = hod.nextNode()) {
    if (u.nodeType === 1) { perevestiAtributy(u); continue }
    // фразу элемента переводит первый же его текстовый узел, остальные уже записаны
    if (u.parentElement && vFraze.has(u.parentElement) && u !== u.parentElement.firstChild && napisano.get(u) === u.nodeValue) continue
    perevestiTekst(u)
  }
}

/**
 * Перевести страницу словарём и дальше переводить всё новое. Повторный вызов с другим словарём переводит заново
 * от русских оригиналов; null — вернуть русский и остановиться.
 * @param {Parameters<typeof zagruzitSlovar>[0]} slovar
 */
export function zapustit(slovar, koren = document.documentElement) {
  ostanovit()
  zagruzitSlovar(slovar)
  perevestiVetku(koren)
  if (tochnye.size || znak) nablyudat(koren)
}

/** Дописать точные пары в словарь на ходу (меню на языке гостя приходит позже словаря) и перевести страницу ими. */
export function dopolnit(pary, koren = document.documentElement) {
  for (const [k, v] of Object.entries(pary)) if (k && v) tochnye.set(k.replace(/\s+/g, ' ').trim(), v)
  kesh.clear()
  keshFraz.clear()
  perevestiVetku(koren)
  if (!nablyudatel && tochnye.size) nablyudat(koren)
}

function nablyudat(koren) {
  nablyudatel = new MutationObserver(spisok => {
    for (const z of spisok) {
      if (z.type === 'characterData') perevestiTekst(z.target)
      else if (z.type === 'attributes') { if (!propustit(z.target)) perevestiAtributy(z.target) }
      else {
        z.addedNodes.forEach(perevestiVetku)
        // React убрал кусок фразы — пересобрать оставшееся
        if (z.removedNodes.length && vFraze.has(z.target) && z.target.firstChild) perevestiTekst(z.target.firstChild)
      }
    }
  })
  nablyudatel.observe(koren, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTY })
  // окна браузера рисует не страница — их текст переводим здесь
  if (!window.__perevodOkon) {
    window.__perevodOkon = true
    for (const imya of ['alert', 'confirm', 'prompt']) {
      const iskh = window[imya].bind(window)
      window[imya] = (soobshchenie, ...ost) => iskh(t(String(soobshchenie ?? '')), ...ost)
    }
  }
}

export function ostanovit() {
  if (nablyudatel) nablyudatel.disconnect()
  nablyudatel = null
}
