"""
Fototexturen fuer den Food-Builder.

Aus den Vorlagenfotos werden kleine, nahtlos kachelbare Ausschnitte
erzeugt. Sie fuellen im Builder die Formen (Kaesedecke, Teigrand, Salami-
scheibe, Fleischstreifen ...). Dadurch besteht jede Ebene aus echtem
Fotomaterial, waehrend Form und Bewegung weiter aus dem Code kommen.

Nahtlos wird eine Kachel durch Spiegelung: das Viertel wird gespiegelt
zusammengesetzt, dadurch stossen an jeder Kante identische Pixel aufeinander.
"""
import json
import os
from PIL import Image, ImageEnhance, ImageFilter

PIZZA = "tools/source/pizza.webp"
DOENER = "tools/source/doener.jpg"
OUT = "public/food/textures"

# name -> (quelle, box, zielgroesse, kontrast, helligkeit)
TEXTURES = {
    "kaese":        (PIZZA, (3320, 520, 3660, 780), 320, 1.05, 1.02),
    "teig":         (PIZZA, (3390, 840, 3720, 1040), 320, 1.04, 1.04),
    "tomatensosse": (PIZZA, (1860, 570, 2140, 760), 256, 1.10, 0.98),
    "salami":       (PIZZA, (3230, 240, 3500, 390), 256, 1.06, 1.00),
    "olive":        (PIZZA, (2840, 470, 2980, 590), 192, 1.10, 1.05),
    "paprika":      (PIZZA, (1990, 1230, 2180, 1330), 192, 1.08, 1.02),
    "zwiebel":      (PIZZA, (2560, 660, 2740, 760), 192, 1.05, 1.02),
    "champignon":   (PIZZA, (1200, 1220, 1380, 1330), 192, 1.06, 1.04),
    "hackfleisch":  (PIZZA, (1160, 790, 1330, 910), 192, 1.08, 1.00),
    "schinken":     (PIZZA, (2420, 710, 2580, 810), 192, 1.05, 1.02),
    "fladenbrot":   (DOENER, (300, 70, 470, 120), 256, 1.05, 1.03),
    "doenerfleisch": (DOENER, (342, 169, 462, 225), 256, 1.08, 1.02),
    "salat":        (DOENER, (300, 150, 380, 200), 192, 1.08, 1.02),
    "tomate":       (DOENER, (420, 126, 500, 158), 192, 1.06, 1.02),
    "rotzwiebel":   (DOENER, (400, 128, 462, 170), 192, 1.06, 1.02),
}


def mirror_tile(im: Image.Image, size: int) -> Image.Image:
    """Aus einem Ausschnitt eine nahtlose Kachel spiegeln."""
    q = im.resize((size // 2, size // 2), Image.LANCZOS)
    tile = Image.new("RGB", (size, size))
    tile.paste(q, (0, 0))
    tile.paste(q.transpose(Image.FLIP_LEFT_RIGHT), (size // 2, 0))
    tile.paste(q.transpose(Image.FLIP_TOP_BOTTOM), (0, size // 2))
    tile.paste(q.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_TOP_BOTTOM), (size // 2, size // 2))
    return tile


def main():
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for name, (src, box, size, contrast, bright) in TEXTURES.items():
        im = Image.open(src).convert("RGB").crop(box)
        im = ImageEnhance.Contrast(im).enhance(contrast)
        im = ImageEnhance.Brightness(im).enhance(bright)
        if im.width < 200:                      # kleine Quelle: leicht schaerfen
            im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=90, threshold=3))
        tile = mirror_tile(im, size)
        path = f"{OUT}/{name}.webp"
        tile.save(path, "WEBP", quality=88, method=6)
        index[name] = {"file": f"/food/textures/{name}.webp", "size": size,
                       "bytes": os.path.getsize(path)}
        print(f"  {name:14s} {size}px  {os.path.getsize(path) // 1024} KB")
    with open(f"{OUT}/index.json", "w") as f:
        json.dump(index, f, indent=1)


if __name__ == "__main__":
    main()
