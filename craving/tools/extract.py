"""
Zutaten-Freisteller aus einem Foto.

Sucht per Farbsegmentierung nach Instanzen einer Zutat (Olive, Paprika,
Zwiebel, Pilz, Hackfleisch ...), bewertet sie nach Schaerfe und schneidet
die besten mit weicher Alphakante aus. Ergebnis: echte Foto-Ebenen fuer
den Food-Builder statt gezeichneter Formen.
"""
import json
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def rgb_to_hsv(arr: np.ndarray) -> np.ndarray:
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx, mn = arr.max(-1), arr.min(-1)
    df = mx - mn + 1e-8
    h = np.zeros_like(mx)
    m = mx == r
    h[m] = (60 * ((g - b) / df) % 360)[m]
    m = mx == g
    h[m] = (60 * ((b - r) / df) + 120)[m]
    m = mx == b
    h[m] = (60 * ((r - g) / df) + 240)[m]
    s = np.where(mx == 0, 0, df / (mx + 1e-8))
    return np.stack([h, s, mx], -1)


def sharpness_map(gray: np.ndarray) -> np.ndarray:
    """Lokale Kantenenergie — Mass fuer die Schaerfe im Ausschnitt."""
    blur = ndimage.uniform_filter(gray, 9)
    detail = np.abs(gray - blur)
    return ndimage.uniform_filter(detail, 25)


def hue_mask(hsv, h_lo, h_hi, s_lo, s_hi, v_lo, v_hi):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if h_lo <= h_hi:
        hm = (h >= h_lo) & (h <= h_hi)
    else:  # ueber 0 Grad hinweg
        hm = (h >= h_lo) | (h <= h_hi)
    return hm & (s >= s_lo) & (s <= s_hi) & (v >= v_lo) & (v <= v_hi)


def extract(src, spec, out_dir, sheet_path=None):
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.float32) / 255
    hsv = rgb_to_hsv(arr)
    gray = arr.mean(-1)
    sharp = sharpness_map(gray)

    results = []
    for item in spec:
        name = item["name"]
        mask = hue_mask(hsv, *item["hsv"])
        if "region" in item:
            x0, y0, x1, y1 = item["region"]
            reg = np.zeros_like(mask)
            reg[y0:y1, x0:x1] = True
            mask &= reg
        # Loecher schliessen, Rauschen entfernen
        mask = ndimage.binary_opening(mask, np.ones((5, 5)))
        mask = ndimage.binary_closing(mask, np.ones((9, 9)))
        labels, count = ndimage.label(mask)
        if count == 0:
            print(f"  {name}: keine Instanz gefunden")
            continue
        objects = ndimage.find_objects(labels)
        cands = []
        for idx, sl in enumerate(objects, start=1):
            ys, xs = sl
            h, w = ys.stop - ys.start, xs.stop - xs.start
            area = int((labels[sl] == idx).sum())
            if not (item["area"][0] <= area <= item["area"][1]):
                continue
            ratio = w / max(h, 1)
            if not (item.get("ratio", (0.25, 4.0))[0] <= ratio <= item.get("ratio", (0.25, 4.0))[1]):
                continue
            score = float(sharp[sl][labels[sl] == idx].mean())
            cands.append((score, idx, sl, area))
        cands.sort(reverse=True, key=lambda c: c[0])
        picked = cands[: item.get("take", 4)]
        print(f"  {name}: {len(cands)} Kandidaten, {len(picked)} genommen")

        for n, (score, idx, sl, area) in enumerate(picked):
            ys, xs = sl
            pad = item.get("pad", 12)
            y0, y1 = max(0, ys.start - pad), min(arr.shape[0], ys.stop + pad)
            x0, x1 = max(0, xs.start - pad), min(arr.shape[1], xs.stop + pad)
            piece = im.crop((x0, y0, x1, y1))
            m = (labels[y0:y1, x0:x1] == idx).astype(np.uint8) * 255
            alpha = Image.fromarray(m, "L")
            # Kante leicht einziehen und weichzeichnen -> kein Farbsaum
            alpha = alpha.filter(ImageFilter.MinFilter(3))
            alpha = alpha.filter(ImageFilter.GaussianBlur(item.get("feather", 2.0)))
            piece.putalpha(alpha)
            path = f"{out_dir}/{name}-{n + 1}.png"
            piece.save(path)
            results.append({"name": name, "path": path, "score": round(score, 4),
                            "size": piece.size, "area": area})

    if sheet_path and results:
        cell = 200
        cols = 6
        rows = (len(results) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 20)), (24, 24, 28))
        # Schachbrett, damit die Alphakante sichtbar wird
        for yy in range(0, sheet.height, 20):
            for xx in range(0, sheet.width, 20):
                if (xx // 20 + yy // 20) % 2:
                    sheet.paste((44, 44, 50), (xx, yy, xx + 20, yy + 20))
        from PIL import ImageDraw
        d = ImageDraw.Draw(sheet)
        for i, r in enumerate(results):
            p = Image.open(r["path"])
            p.thumbnail((cell - 10, cell - 10), Image.LANCZOS)
            cx = (i % cols) * cell + (cell - p.width) // 2
            cy = (i // cols) * (cell + 20) + 18
            sheet.paste(p, (cx, cy), p)
            d.text(((i % cols) * cell + 4, (i // cols) * (cell + 20) + 3),
                   f'{r["name"]}-{i}', fill=(255, 200, 120))
        sheet.save(sheet_path)
        print("Kontaktbogen:", sheet_path)
    return results


if __name__ == "__main__":
    src, spec_file, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    sheet = sys.argv[4] if len(sys.argv) > 4 else None
    with open(spec_file) as f:
        spec = json.load(f)
    extract(src, spec, out_dir, sheet)
