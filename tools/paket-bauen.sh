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
# 1100 px war richtig, solange das JPEG die ZWEITE Ebene war. Seit es AVIF
# gibt, ist es die vierte: AVIF, WebP, JPEG — und geholt wird es nur von
# Browsern ohne WebP, also von vor 2020. Die stolpern ohnehin ueber
# `clamp()`, `svh` und die Masken. 900 px reichen dort; gespart sind
# dadurch 0,73 MB, und das Paket bleibt so gross wie das, das Netlify
# angenommen hat.
KANTE, QUALITAET = 900, 66

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

# ---------------------------------------------------------------------------
#  Stylesheet und Skript fuer das Paket verdichten
# ---------------------------------------------------------------------------
#  `styles.css` ist zu 49 % Kommentar, `main.js` zu einem grossen Teil auch.
#  Im Repository ist das genau richtig: dort steht die Begruendung neben der
#  Regel, und ohne sie waere das Stylesheet in einem halben Jahr nicht mehr
#  wartbar (siehe CLAUDE.md). Ausgeliefert werden muss sie nicht — der
#  Browser liest keine Kommentare.
#
#  esbuild ist ohnehin schon da (die Funktion wird damit gebuendelt).
# ---------------------------------------------------------------------------
echo "→ Stylesheet und Skript für das Paket verdichten"
mkdir -p "$BUEHNE/assets/css" "$BUEHNE/assets/js"
# Eine Warnung von esbuild ist hier ein Abbruchgrund, kein Hinweis: sie
# bedeutet, dass im Stylesheet etwas steht, was keine gueltige Regel ist.
# Genau so ist einmal beim Aufraeumen das Ende eines Kommentars verloren
# gegangen — im Browser sah man nichts davon, weil er den kaputten Block
# einfach uebersprang, und die Seite haette den Fehler still ausgeliefert.
for QUELLE in assets/css/styles.css assets/js/main.js; do
  MELDUNG="$(npx --no-install esbuild "$QUELLE" --minify --target=es2020 \
              --outfile="$BUEHNE/$QUELLE" 2>&1 | grep -c "WARNING" || true)"
  if [ "$MELDUNG" != "0" ]; then
    echo "   ABBRUCH: esbuild meldet $MELDUNG Warnung(en) in $QUELLE"
    npx --no-install esbuild "$QUELLE" --minify --target=es2020 --outfile=/dev/null 2>&1 | head -20
    exit 1
  fi
done
python3 - "$BUEHNE" <<'PY2'
import os, sys
b = sys.argv[1]
for p in ("assets/css/styles.css", "assets/js/main.js"):
    vor, nach = os.path.getsize(p), os.path.getsize(os.path.join(b, p))
    print(f"   {p:24s} {vor/1024:6.1f} KB  ->  {nach/1024:6.1f} KB"
          f"   ({(1-nach/vor)*100:.0f} % gespart)")
PY2

# ---------------------------------------------------------------------------
#  Die zweite WebP-Stufe aus dem Paket nehmen
# ---------------------------------------------------------------------------
#  Seit es AVIF gibt, liegt jedes randlose Foto vierfach vor: AVIF in zwei
#  Stufen, WebP in zwei Stufen, JPEG als Rueckfallebene. Der Browser nimmt
#  die erste Zeile, die er versteht.
#
#  Wer holt dann noch `…-gross.webp`? Nur ein Browser, der WebP kann, AVIF
#  aber nicht — und der zugleich an einem Bildschirm mit hoher Pixeldichte
#  sitzt. Das sind Safari 15 bis 16.3 und Firefox 88 bis 92. Fuer diese
#  Gruppe faellt die Darstellung auf die 1600er Stufe zurueck: genau der
#  Zustand, in dem die Website vor der zweiten Stufe ausgeliefert wurde.
#
#  Dafuer 3,04 MB im Paket — und die Paketgroesse ist genau das, woran der
#  erste Netlify-Versuch gescheitert ist. Im Repository bleibt die Stufe
#  vollstaendig: dort gibt es keine Groessengrenze, und auf Vercel wird sie
#  ausgeliefert.
#
#  Damit kein Browser eine Datei anfordert, die nicht da ist, wird das
#  Markup mitgezogen: die Kandidatin verschwindet aus dem `srcset`, und
#  `data-gross` der Galerie zeigt auf die Grundstufe. Die Pruefung unten
#  geht anschliessend jede Bildadresse im Markup durch.
# ---------------------------------------------------------------------------
echo "→ Die zweite WebP-Stufe aus dem Paket nehmen"
python3 - "$BUEHNE" <<'PY3'
import os, re, sys

buehne = sys.argv[1]
KANDIDAT = re.compile(r',\s*[^"\s,]*?-gross\.webp \d+w')
GALERIE  = re.compile(r'(data-gross=")([^"]*?)-gross\.webp(")')

n = gross = 0
for wurzel, ordner, dateien in os.walk("."):
    ordner[:] = [o for o in ordner if o not in
                 (".git", "node_modules", "tools", "docs", "api", ".paket-cache")]
    for datei in sorted(dateien):
        if not datei.endswith(".html"):
            continue
        p = os.path.normpath(os.path.join(wurzel, datei))
        s = open(p, encoding="utf-8").read()
        neu = GALERIE.sub(r'\1\2.webp\3', KANDIDAT.sub("", s))
        ziel = os.path.join(buehne, p)
        os.makedirs(os.path.dirname(ziel), exist_ok=True)
        open(ziel, "w", encoding="utf-8").write(neu)
        if neu != s:
            n += 1

for datei in os.listdir("assets/img"):
    if datei.endswith("-gross.webp"):
        gross += os.path.getsize(os.path.join("assets/img", datei))
print(f"   {n} Seiten umgeschrieben, {gross/1048576:.2f} MB gespart")
PY3
AUSSEN+=("assets/img/*-gross.webp")

echo "→ Paket schnüren"
rm -f "$ZIEL"
# Erst alles ohne JPEGs, dann die verkleinerten aus der Bühne nachlegen.
# Achtung: `*` im Ausschlussmuster von zip laeuft ueber Ordnergrenzen —
# "assets/img/*.jpg" trifft also auch assets/img/team/*.jpg. Genau deshalb
# spiegelt die Buehne oben den ganzen Ordnerbaum, und genau deshalb steht
# unten die Vollstaendigkeitspruefung.
zip -qr "$ZIEL" . -x "${AUSSEN[@]}" "assets/img/*.jpg" \
  "assets/css/styles.css" "assets/js/main.js" "*.html"
( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" assets )
( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" . -i "*.html" )
# Der dichter gepackte Film kommt unter seinem richtigen Namen ins Paket.
if [ -f "$FILM_KLEIN" ]; then
  mkdir -p "$BUEHNE/assets/video"
  cp "$FILM_KLEIN" "$BUEHNE/$FILM"
  ( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" "$FILM" )
fi

echo "→ Nachsehen, dass wirklich alles drin ist"
python3 - "$ZIEL" <<'PY'
import os, posixpath, re, sys, zipfile

z = zipfile.ZipFile(sys.argv[1])
drin = set(z.namelist())

# 1) Jede Datei aus assets/ muss im Paket sein — bis auf das, was
#    absichtlich draussen bleibt.
AUSGENOMMEN = ("assets/logo/logo-herm-original.png",)
fehlt = [os.path.join(w, d)
         for w, _, ds in os.walk("assets") for d in ds
         if os.path.join(w, d) not in drin
         and os.path.join(w, d) not in AUSGENOMMEN
         and not os.path.join(w, d).endswith("-gross.webp")]
if fehlt:
    print("   FEHLT im Paket:", *fehlt, sep="\n     ")
    sys.exit(1)

# 2) Und umgekehrt: jede Bildadresse, die im Markup des PAKETS steht, muss
#    im Paket auch liegen. Das ist die eigentliche Sicherung gegen die
#    Streichung der zweiten WebP-Stufe — schluepft eine Kandidatin durch,
#    fordert ein Browser sie an und bekommt nichts.
ADRESSE = re.compile(r'(?:src|href|data-gross)="([^"]+\.(?:avif|webp|jpe?g|png))"'
                     r'|([\w./-]+\.(?:avif|webp))\s+\d+w')
tot = []
for name in sorted(n for n in drin if n.endswith(".html")):
    text = z.read(name).decode("utf-8")
    ordner = posixpath.dirname(name)
    for m in ADRESSE.finditer(text):
        adresse = m.group(1) or m.group(2)
        if adresse.startswith(("http:", "https:", "data:", "#", "mailto:", "tel:")):
            continue
        ziel = posixpath.normpath(posixpath.join(ordner, adresse))
        if ziel not in drin:
            tot.append(f"{name}: {adresse}")
if tot:
    print("   Adresse im Markup ohne Datei im Paket:", *sorted(set(tot)), sep="\n     ")
    sys.exit(1)

print(f"   {len(drin)} Dateien, keine Lücke in assets/,"
      f" keine tote Bildadresse im Markup")
PY

echo
echo "Fertig: $ZIEL  ($(du -h "$ZIEL" | cut -f1))"
echo "Die Funktion darin: $GEBAUT ($(du -h "$GEBAUT" | cut -f1), eine Datei)"
echo
echo "Weiter geht es in README.md unter „Auf Netlify veröffentlichen“."
