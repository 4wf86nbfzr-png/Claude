"""
Grosse Fotoflaechen ("Felder") fuer den Builder.

Eine gekachelte Textur verraet sich im Produkt sofort als Muster. Deshalb
wird hier einmalig eine grosse Flaeche gemischt: viele Ausschnitte aus dem
Vorlagenfoto, zufaellig gedreht, gespiegelt und mit weicher Ellipsenkante
uebereinandergelegt. Im Builder deckt ein solches Feld die Form in einem
Durchgang ab — es wiederholt sich also nicht.

Erzeugt: public/food/fields/*.webp
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

PIZZA = "tools/source/pizza.webp"
DOENER = "tools/source/doener.jpg"
OUT = "public/food/fields"

# name -> (quelle, [ausschnitte], groesse, seed, nachschaerfen, helligkeit, modus)
# modus: "blend" = viele gedrehte Ausschnitte (unregelmaessiges Material),
#        "smooth" = ein Ausschnitt gross (gleichmaessiges Material)
FIELDS = {
    "kaese": (PIZZA, [(3300, 500, 3700, 800), (3450, 600, 3800, 860), (3280, 560, 3640, 830)], 1024, 11, False, 1.0, "blend"),
    "teig": (PIZZA, [(3200, 750, 3500, 950), (3300, 700, 3600, 900)], 1024, 5, False, 1.08, "smooth"),
    "sosse": (PIZZA, [(1860, 570, 2140, 760), (1900, 600, 2180, 790)], 768, 3, False, 0.95, "blend"),
    "champignon": (PIZZA, [(1180, 1200, 1400, 1350)], 512, 9, False, 1.0, "smooth"),
    # Fladenbrot kommt aus dem Pizzafoto: das Doenerfoto hat an der Brotkante
    # ueberall Salat im Bild. Gebackener Weizen sieht ohnehin gleich aus.
    "fladenbrot": (PIZZA, [(3200, 750, 3500, 950), (3300, 700, 3600, 900)], 1024, 4, False, 1.16, "smooth"),
    "doenerfleisch": (DOENER, [(340, 168, 466, 228), (300, 190, 380, 240)], 768, 6, True, 1.05, "blend"),
    "hackfleisch": (PIZZA, [(1150, 780, 1350, 930)], 512, 8, False, 1.0, "smooth"),
}


def smooth_field(im: Image.Image, boxes, size: int, seed: int, sharpen: bool) -> Image.Image:
    """
    Fuer gleichmaessige Materialien (Teig, Brot, Schinken).

    Hier wuerde das Verwirbeln vieler gedrehter Ausschnitte Schlieren
    erzeugen. Stattdessen: ein Ausschnitt gross gezogen, die weiteren nur
    sanft darueber geblendet — das behaelt die Struktur des Originals.
    """
    rng = np.random.default_rng(seed)
    canvas = im.crop(boxes[0]).resize((size, size), Image.LANCZOS).convert("RGB")
    for box in boxes[1:]:
        layer = im.crop(box).resize((size, size), Image.LANCZOS).convert("RGBA")
        m = Image.new("L", (size, size), 0)
        for _ in range(6):
            cx, cy = rng.uniform(0, size), rng.uniform(0, size)
            r = rng.uniform(size * 0.2, size * 0.4)
            ImageDraw.Draw(m).ellipse([cx - r, cy - r, cx + r, cy + r], fill=150)
        m = m.filter(ImageFilter.GaussianBlur(size * 0.08))
        layer.putalpha(m)
        canvas.paste(layer, (0, 0), layer)
    if sharpen:
        canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=3))
    arr = np.asarray(canvas).astype(np.float32)
    arr = np.clip(arr + rng.normal(0, 2.4, arr.shape[:2])[..., None], 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def blend_field(im: Image.Image, boxes, size: int, seed: int, sharpen: bool) -> Image.Image:
    rng = np.random.default_rng(seed)
    tiles = [im.crop(b).convert("RGB") for b in boxes]
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    # Grundlage: eine gross skalierte Kachel, damit keine Luecken bleiben
    base = tiles[0].resize((size, size), Image.LANCZOS)
    canvas.paste(base, (0, 0))

    step = int(size * 0.16)
    for gy in range(-step, size + step, step):
        for gx in range(-step, size + step, step):
            tile = tiles[int(rng.integers(len(tiles)))]
            if rng.random() < 0.5:
                tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            if rng.random() < 0.5:
                tile = tile.transpose(Image.FLIP_TOP_BOTTOM)
            side = int(step * rng.uniform(2.4, 3.6))
            t = tile.resize((side, side), Image.LANCZOS).convert("RGBA")
            m = Image.new("L", (side, side), 0)
            inset = side * 0.16
            ImageDraw.Draw(m).ellipse([inset, inset, side - inset, side - inset], fill=255)
            m = m.filter(ImageFilter.GaussianBlur(side * 0.18))
            t.putalpha(m)
            t = t.rotate(float(rng.uniform(0, 360)), resample=Image.BICUBIC,
                         expand=True, fillcolor=(0, 0, 0, 0))
            px = int(gx + rng.uniform(-step * 0.4, step * 0.4) - t.width / 2)
            py = int(gy + rng.uniform(-step * 0.4, step * 0.4) - t.height / 2)
            canvas.paste(t, (px, py), t)

    if sharpen:
        canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=3))

    # feines Korn gegen den "gemalten" Eindruck
    arr = np.asarray(canvas).astype(np.float32)
    noise = rng.normal(0, 2.6, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    sources = {PIZZA: Image.open(PIZZA).convert("RGB"), DOENER: Image.open(DOENER).convert("RGB")}
    index = {}
    for name, (src, boxes, size, seed, sharpen, bright, mode) in FIELDS.items():
        maker = smooth_field if mode == "smooth" else blend_field
        field = maker(sources[src], boxes, size, seed, sharpen)
        if bright != 1.0:
            field = ImageEnhance.Brightness(field).enhance(bright)
        path = f"{OUT}/{name}.webp"
        field.save(path, "WEBP", quality=84, method=6)
        index[name] = {"file": f"/food/fields/{name}.webp", "size": size}
        print(f"  {name:14s} {size}px  {os.path.getsize(path) // 1024} KB")
    with open(f"{OUT}/index.json", "w") as f:
        json.dump(index, f, indent=1)


if __name__ == "__main__":
    main()
