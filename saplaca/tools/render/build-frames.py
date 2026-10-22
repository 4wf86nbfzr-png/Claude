"""Gerenderte PNG-Frames (RGBA) für die Seite und als Video aufbereiten.

- assets/film/<format>/0001.webp …  Einzelbilder MIT Transparenz; den Hintergrund
  (Weinrot -> Creme mit Welle) zeichnet die Seite selbst.
- assets/film/pasta-<format>.mp4     derselbe Film mit eingerechnetem Hintergrund
- assets/film/pasta-wide-poster.jpg  letztes Bild, für Besucher ohne JavaScript
- assets/film/anchors-<format>.json  Bildschirmpositionen der Zutaten je Frame

Aufruf:  python3 build-frames.py <render-out> <saplaca/assets/film>
"""
import json, math, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

CREAM = (243, 239, 230)
PLATE_AT = .82  # muss zu index.html passen


def io(t):
    return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


def background(size, q):
    """Wie drawBg() in index.html: Weinrot, darüber Creme mit Wellenkante."""
    w, h = size
    k = io(min(1, max(0, (q - .14) / .22)))
    img = Image.new("RGB", size, CREAM)
    if k < 1:
        # radialer Verlauf Weinrot
        wine = Image.new("RGB", size)
        px = wine.load()
        cx, cy, r = w * .66, h * .4, max(w, h) * .9
        stops = [(0, (0x6b, 0x22, 0x19)), (.45, (0x52, 0x18, 0x12)), (1, (0x32, 0x0c, 0x08))]
        for y in range(h):
            for x in range(w):
                d = min(1, math.hypot(x - cx, y - cy) / r)
                for (a, ca), (b, cb) in zip(stops, stops[1:]):
                    if d <= b:
                        t = (d - a) / (b - a)
                        px[x, y] = tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
                        break
        img = wine
        yb = h * 1.06 - h * 1.22 * k
        amp = h * .09 * math.sin(math.pi * k)
        pts = []
        for i in range(65):  # Bézier wie im Browser
            t = i / 64
            P = [(0, yb + amp), (w * .3, yb - amp * 1.2), (w * .66, yb + amp * .7), (w, yb - amp)]
            x = sum(c * P[j][0] for j, c in enumerate([(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3]))
            y = sum(c * P[j][1] for j, c in enumerate([(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3]))
            pts.append((x, y))
        ImageDraw.Draw(img).polygon(pts + [(w, h), (0, h)], fill=CREAM)
    return img


src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
for mode, size in (("wide", (1280, 720)), ("tall", (720, 1280))):
    frames = sorted((src / mode).glob("f*.png"))
    n = len(frames)
    out = dst / mode
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    small = (size[0] // 4, size[1] // 4)
    for i, f in enumerate(frames, 1):
        im = Image.open(f).convert("RGBA").resize(size, Image.LANCZOS)
        im.save(out / f"{i:04d}.webp", quality=80, alpha_quality=90, method=6)
        q = min(1, (i - 1) / (n - 1) / PLATE_AT)
        bg = background(small, q).resize(size, Image.BILINEAR).convert("RGBA")
        bg.alpha_composite(im)
        rgb = bg.convert("RGB")
        rgb.save(tmp / f"{i:04d}.png")
        if i == n and mode == "wide":
            rgb.save(dst / "pasta-wide-poster.jpg", quality=86)
    shutil.copy(src / mode / "anchors.json", dst / f"anchors-{mode}.json")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", str(tmp / "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
                    "-movflags", "+faststart", str(dst / f"pasta-{mode}.mp4")], check=True)
    shutil.rmtree(tmp)
    print(mode, n, "frames")
