#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Erzeugt die Kraftlog-App-Icons (PNG) ohne Fremdbibliotheken.

Motiv: weiße Langhantel auf Blau (#0071e3) — passend zur Tab-Bar, ohne Emoji.
  python3 make_icons.py   -> apple-touch-icon.png (180), icon-192.png, icon-512.png
"""
import struct
import zlib

BLAU = (0, 113, 227)
WEISS = (255, 255, 255)


def rundes_rechteck(px, size, x0, y0, w, h, r, farbe):
    """Füllt ein abgerundetes Rechteck in das Pixel-Raster."""
    x1, y1 = x0 + w, y0 + h
    r = min(r, w / 2, h / 2)
    for y in range(max(0, int(y0)), min(size, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(size, int(x1) + 1)):
            cx = min(max(x + 0.5, x0 + r), x1 - r)
            cy = min(max(y + 0.5, y0 + r), y1 - r)
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy <= r * r:
                px[y][x] = farbe


def zeichne(size):
    px = [[BLAU] * size for _ in range(size)]
    s = size / 100.0
    cy = 50 * s
    # Stange
    rundes_rechteck(px, size, 15 * s, cy - 3.2 * s, 70 * s, 6.4 * s, 3.2 * s, WEISS)
    # innere Scheiben
    rundes_rechteck(px, size, 28 * s, cy - 17 * s, 9.5 * s, 34 * s, 4.5 * s, WEISS)
    rundes_rechteck(px, size, 62.5 * s, cy - 17 * s, 9.5 * s, 34 * s, 4.5 * s, WEISS)
    # äußere Scheiben
    rundes_rechteck(px, size, 18 * s, cy - 12 * s, 7 * s, 24 * s, 3.5 * s, WEISS)
    rundes_rechteck(px, size, 75 * s, cy - 12 * s, 7 * s, 24 * s, 3.5 * s, WEISS)
    return px


def schreibe_png(pfad, px):
    size = len(px)
    roh = b''.join(b'\x00' + b''.join(bytes(p) for p in zeile) for zeile in px)

    def chunk(typ, daten):
        c = typ + daten
        return struct.pack('>I', len(daten)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', zlib.compress(roh, 9)) + chunk(b'IEND', b''))
    with open(pfad, 'wb') as f:
        f.write(png)
    print(f'{pfad} ({size}x{size}, {len(png)} Bytes)')


if __name__ == '__main__':
    for name, size in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
        schreibe_png(name, zeichne(size))
