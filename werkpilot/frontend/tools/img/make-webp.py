#!/usr/bin/env python3
"""Erzeugt WebP-Fassungen der Screenshots und Standbilder in mehreren Breiten.

Aufruf aus `frontend/`: python3 tools/img/make-webp.py
Quelle bleibt die PNG/JPG-Datei; die WebP-Dateien liegen daneben (`name-1080.webp`, `name-2160.webp`).
Wer ein Bild austauscht, führt das Skript erneut aus, sonst zeigt die WebP-Fassung den alten Stand.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "public"
JOBS = [
    (ROOT / "screens", "*.png", [1080, 2160], 80),
    (ROOT / "video" / "stills", "*.jpg", [960, 1600], 78),
    (ROOT / "video", "poster-*.jpg", [None], 78),
]

total_src = total_out = 0
for folder, pattern, widths, quality in JOBS:
    for src in sorted(folder.glob(pattern)):
        total_src += src.stat().st_size
        with Image.open(src) as im:
            im = im.convert("RGB")
            for w in widths:
                out = src.with_name(f"{src.stem}-{w}.webp") if w else src.with_suffix(".webp")
                img = im if (w is None or im.width <= w) else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
                img.save(out, "WEBP", quality=quality, method=6)
                total_out += out.stat().st_size
                print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KiB")
print(f"Quellen: {total_src // 1024} KiB, WebP gesamt: {total_out // 1024} KiB")
