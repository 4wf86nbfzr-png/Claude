"""Erzeugt die Testseite für den Pasta-Film.

python3 make-film-test.py repo      -> saplaca/film-test.html (alle Frames, per Doppelklick)
python3 make-film-test.py artifact  -> <out>/film-test.html + Liste der Frames (jedes 2. Bild)
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILM = ROOT / "assets" / "film"
mode = sys.argv[1]
stride = 1 if mode == "repo" else 2
anchors = {m: json.loads((FILM / f"anchors-{m}.json").read_text())[::stride] for m in ("wide", "tall")}
n = len(anchors["wide"])

if mode == "repo":
    frame_path = "assets/film/${m}/${pad4(i * " + str(stride) + " + 1)}.webp"
    font_base = "assets/fonts/"
    head = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    mid, tail = '</head>\n<body>\n', '</body>\n</html>\n'
    out = ROOT / "film-test.html"
else:
    frame_path = "f/${m}/${pad4(i * " + str(stride) + " + 1)}.webp"
    font_base = "fonts/"
    head, mid, tail = '', '', ''
    out = Path(sys.argv[2]) / "film-test.html"

tpl = (Path(__file__).parent / "film-test.tpl.html").read_text()
html = (tpl.replace("@@HEAD@@", head).replace("@@MID@@", mid).replace("@@TAIL@@", tail)
        .replace("@@FRAMES@@", str(n)).replace("@@FRAMEPATH@@", frame_path)
        .replace("@@FONTS@@", font_base)
        .replace("@@ANCHORS@@", json.dumps(anchors, separators=(",", ":"))))
out.write_text(html)
print(out, n, "Frames je Format,", round(len(html) / 1024), "KB")
