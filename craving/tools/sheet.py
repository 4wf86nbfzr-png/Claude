"""Kontaktbogen: mehrere Ausschnitte nebeneinander, mit Beschriftung.
Damit lassen sich Kandidaten fuer Freisteller schnell beurteilen."""
import sys, json
from PIL import Image, ImageDraw

src = sys.argv[1]
out = sys.argv[2]
crops = json.loads(sys.argv[3])  # [[name,x,y,w,h], ...]
im = Image.open(src).convert("RGB")
cell = 260
cols = min(5, len(crops))
rows = (len(crops) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 22)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
for i, (name, x, y, w, h) in enumerate(crops):
    piece = im.crop((x, y, x + w, y + h))
    piece.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
    cx = (i % cols) * cell + (cell - piece.width) // 2
    cy = (i // cols) * (cell + 22) + 20 + (cell - 8 - piece.height) // 2
    sheet.paste(piece, (cx, cy))
    d.text(((i % cols) * cell + 6, (i // cols) * (cell + 22) + 4), f"{name} {x},{y} {w}x{h}", fill=(255, 210, 120))
sheet.save(out)
print(out, sheet.size)
