#!/usr/bin/env bash
# ============================================================================
#  Baut das ZIP, das bei Netlify per Drag-and-drop hochgeladen wird.
# ----------------------------------------------------------------------------
#  Beim Ziehen-und-Ablegen führt Netlify keinen Build aus — es veröffentlicht,
#  was im Paket liegt. Eine Funktion, die `require('pdfkit')` sagt, findet
#  dort also nichts. Deshalb wird sie hier vorher gebündelt: aus
#  api/_netlify.js samt aller Abhängigkeiten wird eine einzige Datei unter
#  netlify/functions/formular.js. Die braucht kein node_modules und keinen
#  Bündler auf der Gegenseite — sie läuft, wo immer sie landet.
#
#  Nebeneffekt: das Paket ist ein Bruchteil so groß, weil node_modules nicht
#  mit hinein muss.
#
#  Aufruf:  bash tools/paket-bauen.sh
#  Ergebnis: herm-website-netlify.zip im Projektordner
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ZIEL="herm-website-netlify.zip"
GEBAUT="netlify/functions/formular.js"

echo "→ Abhängigkeiten sicherstellen"
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null

echo "→ Funktion zu einer Datei bündeln"
mkdir -p netlify/functions
# --minify: die Funktion ist Maschinenteil, kein Lesestoff. Gemessen
# 3,77 -> 2,02 MB, ohne dass sich am Verhalten etwas ändert (die Prüfungen
# unten laufen gegen genau dieses Bündel).
npx --no-install esbuild api/_netlify.js \
  --bundle --platform=node --target=node20 --format=cjs --minify \
  --outfile="$GEBAUT" --log-level=warning

echo "→ Prüfen, dass das Bündel für sich allein läuft"
node -e "
  const h = require('./$GEBAUT').handler;
  h({ httpMethod:'GET', headers:{}, body:'' }).then(a => {
    if(a.statusCode !== 405) { console.error('unerwartet:', a); process.exit(1); }
    console.log('   Antwort auf GET:', a.statusCode, a.body);
  });
"

echo "→ Prüfen, dass das Bündel wirklich nichts nachlädt"
node -e "
  const q = require('fs').readFileSync('./$GEBAUT','utf8');
  const offen = [...q.matchAll(/require\(['\"]([^'\".][^'\"]*)['\"]\)/g)]
    .map(m => m[1])
    .filter(m => !require('module').builtinModules.includes(m.replace(/^node:/,'')));
  if(offen.length){ console.error('   noch offen:', [...new Set(offen)]); process.exit(1); }
  console.log('   nur eingebaute Node-Module — nichts Externes');
"

AUSSEN=(
  "*.git*"          "tools/*"        "docs/*"
  "*.md"            ".vorschau-stand"
  "vercel.json"     ".vercelignore"  ".htaccess"  ".nojekyll"
  "node_modules/*"  "package.json"   "package-lock.json"
  "api/*"           "$ZIEL"          ".mcp.json"
  # Quelldatei des Wortzeichens, 157 KB. Sie gehoert ins Repository, aber
  # keine Seite laedt sie.
  "assets/logo/logo-herm-original.png"
)

# ---------------------------------------------------------------------------
#  Die JPEG-Rueckfallebene fuer das Paket verkleinern
# ---------------------------------------------------------------------------
#  Jedes randlose Foto liegt dreifach vor: als WebP in zwei Stufen und als
#  JPEG. Das JPEG ist reine Rueckfallebene — es steht im `<img>` innerhalb
#  eines `<picture>` und wird von jedem Browser seit 2020 nie geholt.
#
#  Im Repository bleibt es trotzdem in voller Groesse: `bilder-vergroessern.py`
#  und `bilder-menue.py` rechnen daraus die WebP-Stufen. Waere es dort schon
#  klein, wuerde beim naechsten Lauf aus einer kleineren Vorlage
#  hochgerechnet — und niemand saehe es.
#
#  Im Paket dagegen sind 4,9 MB fuer Bilder, die praktisch niemand abruft,
#  genau das, was Netlify beim Ziehen-und-Ablegen zurueckweist. Hier werden
#  sie deshalb auf 1400 px verkleinert, bevor das ZIP zugeht. Die Seiten-
#  verhaeltnisse bleiben exakt gleich, damit die width/height-Angaben im
#  Markup weiter stimmen.
#
#  Nicht angefasst werden drei Dateien, die WIRKLICH angezeigt werden und
#  nicht in einem `<picture>` stehen:
#      og-bild.jpg                Vorschau beim Teilen, von Crawlern direkt geholt
#      imagefilm-poster.jpg       poster="" des Videos
#      imagefilm-poster-gross.jpg dieselbe, scharfe Fassung fuer Retina
# ---------------------------------------------------------------------------
BUEHNE="$(mktemp -d)"
trap 'rm -rf "$BUEHNE"' EXIT

echo "→ JPEG-Rückfallebene für das Paket verkleinern"
python3 - "$BUEHNE" <<'PY'
import os, shutil, sys
from PIL import Image

buehne = sys.argv[1]
# Drei Dateien werden WIRKLICH angezeigt und stehen in keinem `<picture>`.
ECHT = {"assets/img/og-bild.jpg",
        "assets/img/imagefilm-poster.jpg",
        "assets/img/imagefilm-poster-gross.jpg"}
KANTE, QUALITAET = 1100, 70

vorher = nachher = 0
for wurzel, _, dateien in os.walk("assets/img"):
    for datei in sorted(dateien):
        if not datei.endswith(".jpg"):
            continue
        quelle = os.path.join(wurzel, datei)
        ziel = os.path.join(buehne, quelle)          # Ordnerbaum spiegeln,
        os.makedirs(os.path.dirname(ziel), exist_ok=True)   # auch team/
        vorher += os.path.getsize(quelle)
        if quelle in ECHT:
            shutil.copy2(quelle, ziel)
        else:
            im = Image.open(quelle).convert("RGB")
            b, h = im.size
            f = KANTE / max(b, h)
            if f < 1:
                im = im.resize((max(1, round(b * f)), max(1, round(h * f))), Image.LANCZOS)
            im.save(ziel, "JPEG", quality=QUALITAET, optimize=True, progressive=True)
        nachher += os.path.getsize(ziel)

print(f"   {vorher/1048576:.2f} MB  ->  {nachher/1048576:.2f} MB"
      f"   ({(1-nachher/vorher)*100:.0f} % gespart)")
PY

# ---------------------------------------------------------------------------
#  Den Imagefilm für das Paket dichter packen
# ---------------------------------------------------------------------------
#  Im Repository liegt der Film so, wie ihn `film-bauen.js` und
#  `film-vertonen.py` erzeugen: CRF 31, ein Durchgang. Das ist der richtige
#  Wert beim Bauen aus Einzelbildern (nachgemessen, siehe CLAUDE.md).
#
#  Für die Auslieferung lässt sich derselbe Film noch einmal dichter packen:
#  zwei Durchgänge, `-cpu-used 1`, CRF 36. Nachgemessen gegen die Vorlage
#  ergibt das SSIM 0,9917 und PSNR 46,8 dB — jenseits dessen, was ein Auge
#  unterscheidet — bei 6,56 statt 4,69 MB. Tonspur und Länge bleiben
#  unangetastet (`-c:a copy`, 44,92 s).
#
#  Das kostet rund vier Minuten. Deshalb wird das Ergebnis zwischengespeichert
#  und nur neu gerechnet, wenn sich die Vorlage geändert hat.
# ---------------------------------------------------------------------------
FILM="assets/video/imagefilm.webm"
LAGER=".paket-cache"
FILM_KLEIN="$LAGER/imagefilm.webm"
if [ -f "$FILM" ]; then
  STEMPEL="$(stat -c '%Y-%s' "$FILM")"
  if [ ! -f "$FILM_KLEIN" ] || [ "$(cat "$LAGER/imagefilm.stempel" 2>/dev/null)" != "$STEMPEL" ]; then
    echo "→ Imagefilm für das Paket dichter packen (dauert ein paar Minuten)"
    mkdir -p "$LAGER"
    FF="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
    "$FF" -y -i "$FILM" -c:v libvpx-vp9 -b:v 0 -crf 36 -cpu-used 1 -row-mt 1 \
          -deadline good -pass 1 -passlogfile "$LAGER/log" -an -f null /dev/null 2>/dev/null
    "$FF" -y -i "$FILM" -c:v libvpx-vp9 -b:v 0 -crf 36 -cpu-used 1 -row-mt 1 \
          -deadline good -pass 2 -passlogfile "$LAGER/log" -c:a copy "$FILM_KLEIN" 2>/dev/null
    echo "$STEMPEL" > "$LAGER/imagefilm.stempel"
  else
    echo "→ Imagefilm: die dichtere Fassung liegt schon vor"
  fi
  echo "   $(du -h "$FILM" | cut -f1)  ->  $(du -h "$FILM_KLEIN" | cut -f1)"
  AUSSEN+=("$FILM" "$LAGER/*")
fi

echo "→ Paket schnüren"
rm -f "$ZIEL"
# Erst alles ohne JPEGs, dann die verkleinerten aus der Bühne nachlegen.
# Achtung: `*` im Ausschlussmuster von zip laeuft ueber Ordnergrenzen —
# "assets/img/*.jpg" trifft also auch assets/img/team/*.jpg. Genau deshalb
# spiegelt die Buehne oben den ganzen Ordnerbaum, und genau deshalb steht
# unten die Vollstaendigkeitspruefung.
zip -qr "$ZIEL" . -x "${AUSSEN[@]}" "assets/img/*.jpg"
( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" assets )
# Der dichter gepackte Film kommt unter seinem richtigen Namen ins Paket.
if [ -f "$FILM_KLEIN" ]; then
  mkdir -p "$BUEHNE/assets/video"
  cp "$FILM_KLEIN" "$BUEHNE/$FILM"
  ( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" "$FILM" )
fi

echo "→ Nachsehen, dass wirklich alles drin ist"
python3 - "$ZIEL" <<'PY'
import os, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
drin = set(z.namelist())
fehlt = []
for wurzel, _, dateien in os.walk("assets"):
    for d in dateien:
        p = os.path.join(wurzel, d)
        if p == "assets/logo/logo-herm-original.png":
            continue
        if p not in drin:
            fehlt.append(p)
if fehlt:
    print("   FEHLT im Paket:", *fehlt, sep="\n     ")
    sys.exit(1)
print(f"   {len(drin)} Dateien, keine Lücke in assets/")
PY

echo
echo "Fertig: $ZIEL  ($(du -h "$ZIEL" | cut -f1))"
echo "Die Funktion darin: $GEBAUT ($(du -h "$GEBAUT" | cut -f1), eine Datei)"
echo
echo "Weiter geht es in README.md unter „Auf Netlify veröffentlichen“."
