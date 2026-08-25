"""
Zutaten-Freisteller, zweiter Anlauf.

Erkenntnis aus dem ersten Versuch: eine exakte Silhouette laesst sich aus
einem Foto mit geringer Schaerfentiefe nicht sauber schneiden — die Kanten
zerfallen. Stattdessen: die Farbsegmentierung liefert nur den MITTELPUNKT
einer Zutat, ausgeschnitten wird eine weich auslaufende Ellipse. Der
schmale Kaeserand, der dabei mitkommt, stoert nicht: er liegt spaeter auf
einer Kaeseflaeche und verschwindet in der weichen Kante.
"""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

from extract import rgb_to_hsv, sharpness_map, hue_mask


def elliptical_sprite(im, cx, cy, rx, ry, feather=0.22):
    x0, y0 = int(cx - rx), int(cy - ry)
    x1, y1 = int(cx + rx), int(cy + ry)
    piece = im.crop((x0, y0, x1, y1)).convert("RGB")
    w, h = piece.size
    if w < 8 or h < 8:
        return None
    mask = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(mask)
    inset = int(min(w, h) * feather)
    d.ellipse([inset, inset, w * 2 - inset, h * 2 - inset], fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2.0, min(w, h) * feather * 0.5)))
    piece.putalpha(mask)
    return piece


def run(src, spec, out_dir, sheet_path):
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.float32) / 255
    hsv = rgb_to_hsv(arr)
    sharp = sharpness_map(arr.mean(-1))
    H, W = arr.shape[:2]
    results = []

    for item in spec:
        name = item["name"]
        mask = hue_mask(hsv, *item["hsv"])
        if "region" in item:
            x0, y0, x1, y1 = item["region"]
            reg = np.zeros_like(mask)
            reg[y0:y1, x0:x1] = True
            mask &= reg
        mask = ndimage.binary_opening(mask, np.ones((7, 7)))
        mask = ndimage.binary_fill_holes(mask)
        mask = ndimage.binary_closing(mask, np.ones((11, 11)))
        labels, count = ndimage.label(mask)
        if not count:
            print(f"  {name}: nichts gefunden")
            continue
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        cands = []
        for idx in range(1, count + 1):
            area = sizes[idx - 1]
            if not (item["area"][0] <= area <= item["area"][1]):
                continue
            cy, cx = ndimage.center_of_mass(labels == idx)
            r = float(np.sqrt(area / np.pi))
            score = float(sharp[labels == idx].mean())
            cands.append((score, cx, cy, r, area))
        cands.sort(reverse=True, key=lambda c: c[0])
        take = item.get("take", 5)
        picked = []
        for score, cx, cy, r, area in cands:
            if any(abs(cx - p[1]) < r and abs(cy - p[2]) < r for p in picked):
                continue
            picked.append((score, cx, cy, r, area))
            if len(picked) >= take:
                break
        print(f"  {name}: {len(cands)} Kandidaten -> {len(picked)}")

        for n, (score, cx, cy, r, area) in enumerate(picked):
            grow = item.get("grow", 1.35)
            rx = r * grow * item.get("aspect", 1.0)
            ry = r * grow
            if cx - rx < 0 or cy - ry < 0 or cx + rx > W or cy + ry > H:
                continue
            sprite = elliptical_sprite(im, cx, cy, rx, ry, item.get("feather", 0.22))
            if sprite is None:
                continue
            path = f"{out_dir}/{name}-{n + 1}.png"
            sprite.save(path)
            results.append({"name": f"{name}-{n + 1}", "path": path,
                            "score": round(score, 4), "xy": [int(cx), int(cy)], "r": int(r)})

    # Kontaktbogen auf Schachbrett
    if results:
        cell, cols = 200, 6
        rows = (len(results) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 20)), (26, 26, 30))
        for yy in range(0, sheet.height, 20):
            for xx in range(0, sheet.width, 20):
                if (xx // 20 + yy // 20) % 2:
                    sheet.paste((46, 46, 52), (xx, yy, xx + 20, yy + 20))
        d = ImageDraw.Draw(sheet)
        for i, rres in enumerate(results):
            p = Image.open(rres["path"])
            p.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
            cx = (i % cols) * cell + (cell - p.width) // 2
            cy = (i // cols) * (cell + 20) + 18
            sheet.paste(p, (cx, cy), p)
            d.text(((i % cols) * cell + 4, (i // cols) * (cell + 20) + 3),
                   rres["name"], fill=(255, 200, 120))
        sheet.save(sheet_path)
        print("Kontaktbogen:", sheet_path)
    with open(f"{out_dir}/index.json", "w") as f:
        json.dump(results, f, indent=1)
    return results


if __name__ == "__main__":
    src, spec_file, out_dir, sheet = sys.argv[1:5]
    with open(spec_file) as f:
        run(src, json.load(f), out_dir, sheet)
