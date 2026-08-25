"""
Fotografische Produktbasis aus dem Quellfoto bauen.

Die Pizza im Foto ist perspektivisch und voll belegt — als Ausgangspunkt
fuer den Builder unbrauchbar. Sie wird deshalb zerlegt und neu aufgebaut:

  1. Rand: ein echtes Randstueck (Brot aussen, gebackener Kaese innen)
     wird ringfoermig um den Kreis gelegt (Polarabbildung, gespiegelt
     wiederholt, damit keine Naht entsteht).
  2. Flaeche: gebackener Kaese aus demselben Foto, gekachelt mit
     zufaelliger Drehung, Spiegelung und weichen Uebergaengen.
  3. Darueber Licht von oben links und eine dunkle Aussenkante.

Ergebnis ist eine Kaesepizza von oben, die vollstaendig aus echtem
Fotomaterial besteht — Belag kommt spaeter als eigene Foto-Ebene darauf.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "tools/source/pizza.webp"
OUT = "public/food/pizza"

# Ausschnitte im Quellfoto (durch Kontaktbogen bestimmt)
CRUST = (3150, 640, 3800, 1060)          # aussen Brot (unten), innen Kaese (oben)
CHEESE = [(3300, 500, 3700, 800), (3450, 600, 3800, 860), (3280, 560, 3640, 830)]


def ring_from_strip(strip: Image.Image, size: int, r_in: float, r_out: float,
                    repeats: float = 6.0, wobble: float = 0.02) -> Image.Image:
    """Streifen ringfoermig legen. Ping-Pong-Wiederholung = keine Naht."""
    s = np.asarray(strip.convert("RGB")).astype(np.float32)
    sh, sw = s.shape[:2]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    c = size / 2
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    th = (np.arctan2(dy, dx) + np.pi) / (2 * np.pi)
    u = (th * repeats) % 2.0
    u = np.where(u > 1.0, 2.0 - u, u)
    # leicht unrunder Rand, wie bei handgeformtem Teig
    edge = 1.0 + wobble * np.sin(th * 2 * np.pi * 7 + 1.3) + wobble * 0.6 * np.sin(th * 2 * np.pi * 3)
    v = (r - r_in * edge) / np.maximum(r_out * edge - r_in * edge, 1e-6)
    inside = (v >= 0) & (v <= 1)
    sx = np.clip((u * (sw - 1)).astype(int), 0, sw - 1)
    sy = np.clip((np.clip(v, 0, 1) * (sh - 1)).astype(int), 0, sh - 1)
    rgb = s[sy, sx]
    modulation = (1.0
                  + 0.09 * np.sin(th * 2 * np.pi * 5 + 0.7)
                  + 0.05 * np.sin(th * 2 * np.pi * 11 + 2.1))[..., None]
    rgb = np.clip(rgb * modulation, 0, 255).astype(np.uint8)
    alpha = (inside * 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    # Kante minimal weichzeichnen, damit sie nicht wie ausgestanzt wirkt
    a = out.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.0022))
    out.putalpha(a)
    return out


def cheese_field(im: Image.Image, size: int, radius: int, seed: int = 11) -> Image.Image:
    rng = np.random.default_rng(seed)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tiles = [im.crop(box).convert("RGBA") for box in CHEESE]
    step = int(radius * 0.36)
    for gy in range(-radius, radius + step, step):
        for gx in range(-radius, radius + step, step):
            if gx * gx + gy * gy > (radius * 1.3) ** 2:
                continue
            tile = tiles[int(rng.integers(len(tiles)))]
            if rng.random() < 0.5:
                tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            side = int(step * rng.uniform(2.2, 3.0))
            t = tile.resize((side, side), Image.LANCZOS)
            # Wichtig: weiche Ellipsenkante VOR dem Drehen setzen — sonst
            # schneidet die rechteckige Kachelkante sichtbare Kanten ins Bild.
            m = Image.new("L", (side, side), 0)
            inset = side * 0.14
            ImageDraw.Draw(m).ellipse([inset, inset, side - 1 - inset, side - 1 - inset], fill=255)
            m = m.filter(ImageFilter.GaussianBlur(side * 0.16))
            t.putalpha(m)
            t = t.rotate(float(rng.uniform(0, 360)), resample=Image.BICUBIC,
                         expand=True, fillcolor=(0, 0, 0, 0))
            w, h = t.size
            px = int(size / 2 + gx + rng.uniform(-step * 0.3, step * 0.3) - w / 2)
            py = int(size / 2 + gy + rng.uniform(-step * 0.3, step * 0.3) - h / 2)
            canvas.alpha_composite(t, (max(0, px), max(0, py))) if (px >= 0 and py >= 0 and px + w <= size and py + h <= size) else canvas.paste(t, (px, py), t)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse(
        [size / 2 - radius, size / 2 - radius, size / 2 + radius, size / 2 + radius], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.03))
    a = np.asarray(canvas.getchannel("A")).astype(np.float32) * np.asarray(mask).astype(np.float32) / 255
    canvas.putalpha(Image.fromarray(a.astype(np.uint8), "L"))
    return canvas


def crust_shading(size: int, r_in: float, r_out: float, seed: int = 5) -> np.ndarray:
    """
    Helligkeitsprofil eines aufgegangenen Randes.

    Der Rand ist ein Wulst: innen eine Kerbe (Schatten), in der Mitte die
    hoechste Stelle (Licht), aussen die abfallende Kante (Schatten). Dazu
    kommen Backflecken. Alles als Multiplikator auf die Textur — dadurch
    bleibt echte Fotokoernung erhalten.
    """
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    c = size / 2
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    th = np.arctan2(dy, dx)

    t = np.clip((r - r_in) / max(r_out - r_in, 1e-6), 0, 1)
    inside_ring = (r >= r_in - 2) & (r <= r_out)

    # Wulst: Sinus ueber die Randbreite, Kerbe innen betonen
    bulge = np.abs(np.sin(np.clip(t, 0, 1) * np.pi)) ** 0.7
    crease = np.exp(-((t - 0.02) ** 2) / 0.004) * 0.45
    outer = np.exp(-((t - 1.0) ** 2) / 0.02) * 0.35
    profile = 1.0 + 0.42 * bulge - crease - outer

    # Licht von oben links: der Wulst ist dort heller
    directional = 1.0 + 0.22 * np.cos(th + np.deg2rad(135))
    shade = np.where(inside_ring, profile * directional, 1.0)

    # Backflecken entlang des Randes
    rng = np.random.default_rng(seed)
    spots = np.zeros((size, size), np.float32)
    for _ in range(44):
        a = rng.uniform(0, 2 * np.pi)
        rr = r_in + (r_out - r_in) * rng.uniform(0.25, 0.85)
        sx, sy = c + rr * np.cos(a), c + rr * np.sin(a)
        rad = rng.uniform(size * 0.006, size * 0.018)
        spots += np.exp(-(((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * rad ** 2))) * rng.uniform(0.18, 0.42)
    shade = shade * (1.0 - np.clip(spots, 0, 0.55))
    return shade


def apply_light(img: Image.Image, strength: float = 0.3) -> Image.Image:
    size = img.size[0]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    nx, ny = (xx - size * 0.37) / size, (yy - size * 0.32) / size
    d = np.sqrt(nx ** 2 + ny ** 2)
    light = np.clip(1.16 - d * 1.25, 0.55, 1.35)[..., None]
    arr = np.asarray(img).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] * (light * strength + (1 - strength)), 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main(size: int = 1600):
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert("RGB")

    r_out = int(size * 0.49)
    r_crust_in = int(r_out * 0.78)

    # Eine durchgehende Kaeseflaeche bis zum Aussenrand — der Rand entsteht
    # nicht aus einer anderen Textur, sondern aus Licht und Form. Genau so
    # sieht er auch auf dem Vorlagenfoto aus: gebackener Kaese ueber dem
    # aufgegangenen Teigwulst.
    base = cheese_field(im, size, r_out)

    arr = np.asarray(base).astype(np.float32)
    shade = crust_shading(size, r_crust_in, r_out)[..., None]
    arr[..., :3] = np.clip(arr[..., :3] * shade, 0, 255)
    base = Image.fromarray(arr.astype(np.uint8), "RGBA")
    base = apply_light(base)

    # feines Korn, damit die Kachelung nicht als Muster liest
    arr = np.asarray(base).astype(np.float32)
    rng = np.random.default_rng(3)
    noise = rng.normal(0, 3.2, arr.shape[:2])[..., None]
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 255)
    base = Image.fromarray(arr.astype(np.uint8), "RGBA")

    base.save(f"{OUT}/base-cheese.png")
    print("geschrieben:", f"{OUT}/base-cheese.png", base.size)


if __name__ == "__main__":
    main()
