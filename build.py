#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kraftlog Build-Skript.

Aufrufe (aus diesem Ordner):
  python3 build.py app       -> Dateien in die Kraftlog.app kopieren
  python3 build.py artifact  -> dist/kraftlog-artifact.html erzeugen (alles inline, fuer iPhone/Artifact)
  python3 build.py all       -> beides
Optional:
  python3 build.py all --bump  -> vorher alle ?v=N in index.html hochzaehlen
"""
import datetime
import re
import shutil
import sys
from pathlib import Path

QUELLE = Path(__file__).resolve().parent
APP_ZIEL = Path.home() / 'Desktop' / 'Kraftlog.app' / 'Contents' / 'Resources' / 'app'
DIST = QUELLE / 'dist'
DATEIEN = ['index.html', 'style.css', 'exercises.js', 'charts.js', 'timer.js', 'app.js',
           'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']


def bump():
    index = QUELLE / 'index.html'
    text = index.read_text(encoding='utf-8')

    def hoch(m):
        return '?v=' + str(int(m.group(1)) + 1)

    neu, n = re.subn(r'\?v=(\d+)', hoch, text)
    index.write_text(neu, encoding='utf-8')
    print(f'Version hochgezaehlt ({n} Stellen): {index}')

    # Service-Worker-Version synchron halten (neuer Cache -> Update beim naechsten Besuch)
    v = re.search(r'\?v=(\d+)', neu).group(1)
    sw = QUELLE / 'sw.js'
    sw_text, n_sw = re.subn(r"const VERSION = '\d+';", f"const VERSION = '{v}';", sw.read_text(encoding='utf-8'))
    if n_sw != 1:
        sys.exit('FEHLER: VERSION-Zeile in sw.js nicht (eindeutig) gefunden.')
    sw.write_text(sw_text, encoding='utf-8')
    print(f'sw.js auf Version {v} gesetzt.')


def build_app():
    if not APP_ZIEL.parent.parent.exists():
        sys.exit(f'FEHLER: Kraftlog.app nicht gefunden ({APP_ZIEL.parent.parent}). '
                 'Zuerst mit osacompile erzeugen (siehe LIESMICH.txt).')
    APP_ZIEL.mkdir(parents=True, exist_ok=True)
    for name in DATEIEN:
        shutil.copy2(QUELLE / name, APP_ZIEL / name)
    print(f'{len(DATEIEN)} Dateien nach {APP_ZIEL} kopiert.')


def build_artifact():
    html = (QUELLE / 'index.html').read_text(encoding='utf-8')

    # PWA-Verweise entfernen — die Single-File-Variante ist bewusst hüllenlos
    html = re.sub(r'\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>', '', html)

    # Stylesheet inline
    css = (QUELLE / 'style.css').read_text(encoding='utf-8')
    html, n_css = re.subn(
        r'<link rel="stylesheet" href="style\.css[^"]*">',
        lambda m: '<style>\n' + css + '\n</style>',
        html)

    # Skripte inline (Reihenfolge bleibt erhalten)
    n_js = 0

    def inline_script(m):
        nonlocal n_js
        js = (QUELLE / m.group(1)).read_text(encoding='utf-8')
        if '</scr' + 'ipt>' in js:
            sys.exit(f'FEHLER: literales </scr'+ f'ipt> in {m.group(1)} — wuerde das Inlining brechen.')
        n_js += 1
        return '<script>\n' + js + '\n</script>'

    html = re.sub(r'<script src="([^"?]+)[^"]*"></script>', inline_script, html)

    if n_css != 1 or n_js != 6:
        sys.exit(f'FEHLER: Unerwartete Ersetzungen (css={n_css}, js={n_js}) — index.html pruefen.')

    # Sanity-Checks: keine lokalen Referenzen, keine externen URLs
    rest = re.findall(r'(?:src|href)="(?!#|data:)[^"]+"', html)
    if rest:
        sys.exit(f'FEHLER: verbleibende src/href-Referenzen: {rest}')
    extern = [u for u in re.findall(r'https?://[^\s"\'<>]+', html)
              if not u.startswith('http://www.w3.org/')]  # XML-Namespaces sind keine Requests
    if extern:
        sys.exit(f'FEHLER: externe URLs gefunden (CSP!): {extern[:5]}')

    stempel = datetime.date.today().isoformat()
    kommentar = f'<!-- Kraftlog — Single-File-Build {stempel} (generiert von build.py, nicht von Hand bearbeiten) -->\n'

    DIST.mkdir(exist_ok=True)
    ziel = DIST / 'kraftlog-artifact.html'
    ziel.write_text(kommentar + html, encoding='utf-8')
    print(f'Standalone-Datei gebaut: {ziel} ({len(html) // 1024} KB)')

    # Variante ohne Dokument-Huelle fuer das Artifact-Hosting (liefert doctype/head/body selbst):
    # <title> + <style> + Body-Inhalt
    m_title = re.search(r'<title>.*?</title>', html, re.S)
    m_style = re.search(r'<style>.*?</style>', html, re.S)
    m_body = re.search(r'<body>(.*)</body>', html, re.S)
    if not (m_title and m_style and m_body):
        sys.exit('FEHLER: title/style/body fuer die Artifact-Variante nicht gefunden.')
    body_ziel = DIST / 'kraftlog-artifact-body.html'
    body_ziel.write_text(kommentar + m_title.group(0) + '\n' + m_style.group(0) + m_body.group(1),
                         encoding='utf-8')
    print(f'Artifact-Variante gebaut: {body_ziel}')


if __name__ == '__main__':
    args = sys.argv[1:]
    modus = args[0] if args else 'all'
    if '--bump' in args:
        bump()
    if modus in ('app', 'all'):
        build_app()
    if modus in ('artifact', 'all'):
        build_artifact()
    if modus not in ('app', 'artifact', 'all'):
        sys.exit(__doc__)
