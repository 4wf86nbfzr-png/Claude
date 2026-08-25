"""
Foto-Freisteller der einzelnen Zutaten.

Aus den Vorlagenfotos werden echte Zutatenstuecke ausgeschnitten — eine
weich auslaufende Ellipse um das Stueck herum. Der schmale Rand, der dabei
mitkommt, verschwindet spaeter auf der Kaeseflaeche.

Diese Bilder liegen im Builder als Ebene auf dem Produkt und dienen
gleichzeitig als runde Auswahl-Chips in der Wischleiste.
"""
import json
import os
from PIL import Image, ImageDraw, ImageFilter

PIZZA = "tools/source/pizza.webp"
DOENER = "tools/source/doener.jpg"
OUT = "public/food/sprites"

# name: (quelle, mittelpunkt x, y, radius, breitenfaktor, zielgroesse)
SPRITES = {
    "olive-1":    (PIZZA, 2858, 600, 108, 1.05, 240),
    "olive-2":    (PIZZA, 1973, 1217, 112, 1.05, 240),
    "olive-3":    (PIZZA, 2513, 627, 80, 1.05, 220),
    "paprika-1":  (PIZZA, 3021, 560, 47, 1.6, 240),
    "paprika-2":  (PIZZA, 586, 876, 78, 1.5, 260),
    "paprika-3":  (PIZZA, 2636, 440, 64, 1.5, 240),
    "salami-1":   (PIZZA, 3281, 274, 107, 1.1, 300),
    "salami-2":   (PIZZA, 2141, 394, 116, 1.1, 300),
    "salami-3":   (PIZZA, 256, 1075, 114, 1.1, 300),
    # Doener-Foto: kleinere Quelle, deshalb behutsam hochskaliert
    "dnfleisch-1": (DOENER, 383, 196, 26, 1.5, 200),
    "dnfleisch-2": (DOENER, 331, 208, 22, 1.6, 200),
    "dnfleisch-3": (DOENER, 302, 168, 20, 1.5, 200),
    "dnsalat-1":   (DOENER, 331, 172, 24, 1.3, 200),
    "dnsalat-2":   (DOENER, 489, 110, 22, 1.3, 200),
    "dnsalat-3":   (DOENER, 268, 232, 20, 1.3, 200),
    "dntomate-1":  (DOENER, 462, 142, 22, 1.7, 200),
    "dntomate-2":  (DOENER, 360, 192, 20, 1.7, 200),
    "dnzwiebel-1": (DOENER, 437, 150, 22, 1.6, 200),
    "dnzwiebel-2": (DOENER, 283, 224, 20, 1.6, 200),
}


def cut(im, cx, cy, r, aspect, target, feather=0.12):
    rx, ry = r * aspect, r
    box = (int(cx - rx), int(cy - ry), int(cx + rx), int(cy + ry))
    piece = im.crop(box).convert("RGB")
    w, h = piece.size
    if w < 6 or h < 6:
        return None
    mask = Image.new("L", (w * 3, h * 3), 0)
    inset = int(min(w, h) * feather * 3)
    ImageDraw.Draw(mask).ellipse([inset, inset, w * 3 - inset, h * 3 - inset], fill=255)
    mask = mask.resize((w, h), Image.LANCZOS).filter(
        ImageFilter.GaussianBlur(max(1.5, min(w, h) * feather * 0.42)))
    piece.putalpha(mask)
    scale = target / max(w, h)
    if scale > 1:   # kleine Quelle: hochskalieren und nachschaerfen
        piece = piece.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        rgb = piece.convert("RGB").filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=2))
        rgb.putalpha(piece.getchannel("A"))
        piece = rgb
    else:
        piece = piece.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return piece


def main():
    os.makedirs(OUT, exist_ok=True)
    sources = {PIZZA: Image.open(PIZZA).convert("RGB"), DOENER: Image.open(DOENER).convert("RGB")}
    index = {}
    for name, (src, cx, cy, r, aspect, target) in SPRITES.items():
        piece = cut(sources[src], cx, cy, r, aspect, target)
        if piece is None:
            print("  uebersprungen:", name)
            continue
        path = f"{OUT}/{name}.webp"
        piece.save(path, "WEBP", quality=90, method=6)
        index[name] = {"file": f"/food/sprites/{name}.webp",
                       "width": piece.width, "height": piece.height}
        print(f"  {name:14s} {piece.width}x{piece.height}  {os.path.getsize(path) // 1024} KB")
    with open(f"{OUT}/index.json", "w") as f:
        json.dump(index, f, indent=1)


if __name__ == "__main__":
    main()
