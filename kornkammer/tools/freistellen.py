#!/usr/bin/env python3
"""
Stellt Produktfotos frei: heller Studiohintergrund weg, Produkt bleibt.

Aufruf im Ordner kornkammer/:   python3 tools/freistellen.py
Liest  assets/img/produkte/<id>.jpg   (erste Produktansicht)
Schreibt assets/img/produkte/frei/<id>.webp  (mit Alphakanal)

Verfahren: Hintergrundfarbe aus den Bildecken, dann Flutfüllung vom Rand
aus über alle hintergrundähnlichen Pixel. Helle Flächen *im* Produkt
(Sichtfenster der Mehltüten, Etiketten) sind nicht mit dem Rand verbunden
und bleiben erhalten. Die Kante wird leicht geglättet.
Benötigt nur Pillow. Ergebnisse sind gut genug für die Lichtbühne, aber
kein Ersatz für eine saubere Freistellung durch den Fotografen.
"""
import json, os, sys
from collections import deque
from PIL import Image, ImageFilter

BASE = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(BASE, 'assets/img/produkte')
OUT = os.path.join(SRC, 'frei')
os.makedirs(OUT, exist_ok=True)
data = json.load(open(os.path.join(BASE, 'data/produkte.json'), encoding='utf8'))

# Sonderfälle: Doppelaufnahmen werden auf die linke Tüte beschnitten
# (Anteile der Bildbreite/-höhe); zusätzliche Startpunkte öffnen
# eingeschlossene Hintergrundflächen wie das Loch im Tragegriff.
SONDER = {
    'roggenkoerner':       {'crop': (0.02, 0.02, 0.50, 0.71), 'tol': 20},
    'weizenkoerner':       {'crop': (0.02, 0.02, 0.50, 0.71), 'tol': 20},
    'weizenmehl-vollkorn': {'crop': (0.02, 0.02, 0.50, 0.71), 'tol': 20},
    'roggenmehl-vollkorn': {'crop': (0.02, 0.02, 0.50, 0.71), 'tol': 20},
    'dinkelmehl-vollkorn': {'crop': (0.02, 0.02, 0.50, 0.71), 'tol': 20},
    'kartoffeln-nicola':   {'seeds': [(0.5, y / 100) for y in range(3, 14)]},
    'kartoffeln-laura':    {'seeds': [(0.5, y / 100) for y in range(3, 14)]},
    'kartoffeln-karelia':  {'seeds': [(0.5, y / 100) for y in range(3, 14)]},
}

def freistellen(path, out, toleranz=38, sonder=None):
    sonder = sonder or {}
    toleranz = sonder.get('tol', toleranz)
    im = Image.open(path).convert('RGB')
    if 'crop' in sonder:
        l, t, r, b = sonder['crop']; W, H = im.size
        im = im.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
    w, h = im.size
    px = im.load()
    # Hintergrund: Mittel der vier Ecken
    ecken = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sum(c[i] for c in ecken) // 4 for i in range(3))
    def nah(p):
        return abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) < toleranz * 3
    mask = bytearray(w * h)        # 1 = Hintergrund
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if nah(px[x, y]) and not mask[y * w + x]: mask[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if nah(px[x, y]) and not mask[y * w + x]: mask[y * w + x] = 1; q.append((x, y))
    for fx, fy in sonder.get('seeds', []):
        x, y = int(fx * w), int(fy * h)
        if nah(px[x, y]) and not mask[y * w + x]: mask[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and nah(px[nx, ny]):
                mask[ny * w + nx] = 1; q.append((nx, ny))
    alpha = Image.frombytes('L', (w, h), bytes(255 - m * 255 for m in mask))
    # Kante: ein Pixel einziehen, dann weich machen (kein heller Saum)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.convert('RGBA'); rgba.putalpha(alpha)
    # Auf den Inhalt beschneiden, etwas Luft lassen
    bbox = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox; pad = 12
        rgba = rgba.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    rgba.save(out, 'WEBP', quality=88, method=6)
    return rgba.size, bg

NUR_FEHLENDE = '--nur-fehlende' in sys.argv
for p in data['produkte']:
    src = os.path.join(BASE, 'assets/img', p['bilder'][0])
    if not os.path.exists(src):
        print('fehlt  ', p['id']); continue
    if NUR_FEHLENDE and os.path.exists(os.path.join(OUT, p['id'] + '.webp')):
        print('bleibt ', p['id']); continue
    size, bg = freistellen(src, os.path.join(OUT, p['id'] + '.webp'), sonder=SONDER.get(p['id']))
    print('frei   ', p['id'], size, 'hintergrund', bg)
