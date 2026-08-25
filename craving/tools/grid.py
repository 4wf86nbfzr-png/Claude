"""Legt ein Koordinatengitter ueber ein Bild — damit lassen sich
Ausschnitte fuer die Zutaten-Freisteller praezise bestimmen."""
import sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 200
im = Image.open(src).convert("RGB")
W, H = im.size
scale = 1600 / W
small = im.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
d = ImageDraw.Draw(small)
sw, sh = small.size
for x in range(0, W, step):
    sx = x * scale
    d.line([(sx, 0), (sx, sh)], fill=(0, 255, 255), width=1)
    d.text((sx + 2, 2), str(x), fill=(0, 255, 255))
for y in range(0, H, step):
    sy = y * scale
    d.line([(0, sy), (sw, sy)], fill=(255, 0, 255), width=1)
    d.text((2, sy + 2), str(y), fill=(255, 0, 255))
small.save(out)
print(out, small.size, "orig", (W, H))
