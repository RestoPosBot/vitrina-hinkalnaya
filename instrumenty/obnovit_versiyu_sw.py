# -*- coding: utf-8 -*-
"""Версии сервис-воркера витрины v2 по содержимому файлов.

sw.js хранит два ключа кеша: VERSIYA (оболочка: html, css, js, данные, шрифты, значки)
и VERSIYA_FOTO (папка foto/). Если файл изменился, а версия осталась прежней, гость
и проверочный проход получают старый код из кеша — именно так 02.10.2026 проход
показывал пустые экраны. Поэтому версии считаются от самих файлов, а не руками.

py -X utf8 vitrina_hinkalnaya/instrumenty/obnovit_versiyu_sw.py             — пересчитать и записать
py -X utf8 .../obnovit_versiyu_sw.py --proverit                            — только проверить (1, если устарело)
py -X utf8 .../obnovit_versiyu_sw.py --zhurnal <файл>                      — написать итог в файл
"""
import hashlib
import re
import sys
from pathlib import Path

VITRINA = Path(__file__).resolve().parent.parent / 'v2'
SW = VITRINA / 'sw.js'

# Что входит в оболочку: всё, что sw.js кладёт в снимок, кроме фото.
OBOLOCHKA = ['index.html', 'stil.css', 'manifest.webmanifest', 'menyu.json', 'zavedeniya.json',
             'dopolnenie.json', 'istorii.json', 'sw.js']
PAPKI_OBOLOCHKI = ['js', 'shrifty', 'ikonki']


def otpechatok(fayly):
    h = hashlib.sha256()
    for f in sorted(fayly, key=lambda p: str(p).lower()):
        if not f.is_file():
            continue
        h.update(f.name.encode('utf-8'))
        h.update(f.read_bytes() if f.suffix != '.js' or f.name != 'sw.js' else b'')
    return h.hexdigest()[:10]


def sobrat_spisok():
    obolochka = [VITRINA / i for i in OBOLOCHKA]
    for papka in PAPKI_OBOLOCHKI:
        obolochka += sorted((VITRINA / papka).rglob('*')) if (VITRINA / papka).exists() else []
    foto = sorted((VITRINA / 'foto').rglob('*')) if (VITRINA / 'foto').exists() else []
    return obolochka, foto


def main():
    tolko_proverit = '--proverit' in sys.argv
    zhurnal = None
    if '--zhurnal' in sys.argv:
        zhurnal = Path(sys.argv[sys.argv.index('--zhurnal') + 1])

    tekst = SW.read_text(encoding='utf-8')
    bylo_v = re.search(r"const VERSIYA = '([^']+)'", tekst).group(1)
    bylo_f = re.search(r"const VERSIYA_FOTO = '([^']+)'", tekst).group(1)

    obolochka, foto = sobrat_spisok()
    nado_v = f'k-{otpechatok(obolochka)}'
    nado_f = f'f-{otpechatok(foto)}'

    itog = (f'VERSIYA: было {bylo_v}, по файлам {nado_v}; '
            f'VERSIYA_FOTO: было {bylo_f}, по файлам {nado_f}; ')
    ustarelo = (bylo_v != nado_v) or (bylo_f != nado_f)

    if not ustarelo:
        itog += 'версии актуальны, sw.js не менялся'
    elif tolko_proverit:
        itog += 'УСТАРЕЛО: пересчитать версии перед проверкой'
    else:
        tekst = tekst.replace(f"const VERSIYA = '{bylo_v}'", f"const VERSIYA = '{nado_v}'")
        tekst = tekst.replace(f"const VERSIYA_FOTO = '{bylo_f}'", f"const VERSIYA_FOTO = '{nado_f}'")
        SW.write_text(tekst, encoding='utf-8', newline='')
        itog += 'версии обновлены'
        ustarelo = False

    print(itog)
    if zhurnal:
        zhurnal.parent.mkdir(parents=True, exist_ok=True)
        zhurnal.write_text(itog, encoding='utf-8')
    return 1 if ustarelo else 0


if __name__ == '__main__':
    sys.exit(main())
