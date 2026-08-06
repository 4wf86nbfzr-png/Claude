#!/usr/bin/env python3
"""Erzeugt die Favicons aus assets/logo/favicon-source.png.

    python3 tools/make-favicons.py

Ergebnis (wird von allen <head> referenziert):
    assets/logo/favicon-16.png        16x16
    assets/logo/favicon-32.png        32x32
    assets/logo/apple-touch-icon.png  180x180
    assets/logo/favicon.ico           16+32 kombiniert

Benötigt Pillow:  pip install Pillow
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/logo/favicon-source.png")
OUT = os.path.join(ROOT, "assets/logo")

SIZES = [(16, "favicon-16.png"), (32, "favicon-32.png"), (180, "apple-touch-icon.png")]


def main():
    if not os.path.exists(SRC):
        sys.exit("Quelle fehlt: assets/logo/favicon-source.png")
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Pillow fehlt — bitte 'pip install Pillow' ausführen.")

    src = Image.open(SRC).convert("RGBA")
    # Quadratisch zuschneiden, damit nichts verzerrt wird
    side = min(src.size)
    left, top = (src.width - side) // 2, (src.height - side) // 2
    src = src.crop((left, top, left + side, top + side))

    for px, name in SIZES:
        img = src.resize((px, px), Image.LANCZOS)
        if name == "apple-touch-icon.png":
            # iOS rendert ohne Transparenz — auf den Markenhintergrund legen
            bg = Image.new("RGBA", img.size, "#0B0713")
            img = Image.alpha_composite(bg, img).convert("RGB")
        img.save(os.path.join(OUT, name))
        print("geschrieben:", name, f"({px}x{px})")

    src.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32)])
    print("geschrieben: favicon.ico (16+32)")


main()
