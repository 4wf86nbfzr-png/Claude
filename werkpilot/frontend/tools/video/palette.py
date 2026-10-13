"""Leitet aus dem Videomaterial eine ruhige Farbpalette ab und schreibt palette.json + palette.css.
Aufruf: python3 palette.py <video> <palette.json> <palette.css>   (braucht ffmpeg im PATH und Pillow)"""

from __future__ import annotations

import colorsys
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

video, out_json, out_css = sys.argv[1:4]
tmp = Path(tempfile.mkdtemp())
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video, "-vf", "fps=1,scale=320:-1", str(tmp / "f%03d.png")], check=True)
pixels: list[tuple[int, int, int]] = []
for f in sorted(tmp.glob("f*.png")):
    im = Image.open(f).convert("RGB").resize((64, 36))
    pixels.extend(im.getdata())
# Quantisierung über median cut (Pillow) auf 16 Farben, dann nach Rolle sortieren
img = Image.new("RGB", (len(pixels), 1)); img.putdata(pixels)
q = img.quantize(colors=16, method=Image.Quantize.MEDIANCUT)
pal = q.getpalette()[: 16 * 3]
counts = sorted(q.getcolors(), reverse=True)
colors = []
for n, idx in counts:
    r, g, b = pal[idx * 3 : idx * 3 + 3]
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    colors.append({"rgb": (r, g, b), "h": h, "l": l, "s": s, "share": n / len(pixels)})

def hexc(rgb): return "#%02x%02x%02x" % rgb
def pick(pred, default):
    c = [c for c in colors if pred(c)]
    return c[0]["rgb"] if c else default
def adjust(rgb, l_target=None, s_target=None):
    h, l, s = colorsys.rgb_to_hls(*[v / 255 for v in rgb])
    l = l if l_target is None else l_target; s = s if s_target is None else s_target
    return tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, l, s))

dark = pick(lambda c: c["l"] < 0.25, (24, 26, 29))
warm = pick(lambda c: c["s"] > 0.35 and (c["h"] < 0.14 or c["h"] > 0.9) and c["l"] > 0.3, (232, 163, 60))
cool = pick(lambda c: c["s"] > 0.15 and 0.5 < c["h"] < 0.72, (111, 138, 163))
mid = pick(lambda c: 0.35 < c["l"] < 0.65 and c["s"] < 0.35, (150, 140, 128))
palette = {
    "bg": hexc(adjust(dark, l_target=0.09, s_target=min(0.12, colorsys.rgb_to_hls(*[v/255 for v in dark])[2]))),
    "bg2": hexc(adjust(dark, l_target=0.14)),
    "ink": hexc(adjust(mid, l_target=0.95, s_target=0.08)),
    "ink2": hexc(adjust(mid, l_target=0.82, s_target=0.08)),
    "muted": hexc(adjust(mid, l_target=0.6, s_target=0.06)),
    "accent": hexc(adjust(warm, l_target=0.58, s_target=0.72)),
    "accent2": hexc(adjust(warm, l_target=0.68, s_target=0.75)),
    "steel": hexc(adjust(cool, l_target=0.55, s_target=0.25)),
    "sand": hexc(adjust(mid, l_target=0.58, s_target=0.22)),
}
Path(out_json).write_text(json.dumps({"palette": palette, "samples": [hexc(c["rgb"]) for c in colors[:8]]}, indent=1))
css = ["/* Automatisch aus dem Videomaterial abgeleitet (tools/video/palette.py). Nicht von Hand bearbeiten. */", ".landing {"]
css += [f"  --c-{k}: {v};" for k, v in palette.items()] + ["}"]
Path(out_css).write_text("\n".join(css) + "\n")
print("Palette:", palette)
