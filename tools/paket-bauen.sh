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
GEBAUT_KONTO="netlify/functions/konto.js"

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

# ---------------------------------------------------------------------------
#  Die zweite Funktion: der Bestandskundenbereich
# ---------------------------------------------------------------------------
#  Sie zieht `pg` und `@simplewebauthn/server` mit herein. Beide sind reines
#  JavaScript und lassen sich buendeln — das war der Grund, `scrypt` aus Node
#  statt Argon2id zu nehmen: ein Modul mit eigener Maschinensprache liesse
#  sich hier nicht in eine Datei packen (siehe api/_sicher.js).
echo "→ Bestandskundenbereich zu einer Datei bündeln"
# `pg-native` wird ERSETZT, nicht extern gestellt.
# ---------------------------------------------------------------------------
# `pg` bringt neben dem Treiber in JavaScript einen zweiten in
# Maschinensprache mit. Geladen wird der nur ueber `pg.native`, und das ruft
# hier niemand auf.
#
# Mit `--external:pg-native` blieb `require("pg-native")` im Bundle stehen.
# Netlify liest die fertige Funktionsdatei aber selbst noch einmal, findet
# den Aufruf und bricht den Deploy ab — dass er in einem try/catch steht,
# sieht diese Pruefung nicht. Deshalb wird das Modul durch einen Platzhalter
# ersetzt, der sich wie ein nicht installiertes verhaelt
# (api/_pg_native_fehlt.js).
npx --no-install esbuild api/_konto_netlify.js \
  --bundle --platform=node --target=node20 --format=cjs --minify \
  --alias:pg-native=./api/_pg_native_fehlt.js \
  --outfile="$GEBAUT_KONTO" --log-level=warning

echo "→ Prüfen, dass auch dieses Bündel nichts nachlädt"
node -e "
  const q = require('fs').readFileSync('./$GEBAUT_KONTO','utf8');
  const offen = [...q.matchAll(/require\(['\"]([^'\".][^'\"]*)['\"]\)/g)]
    .map(m => m[1])
    .filter(m => !require('module').builtinModules.includes(m.replace(/^node:/,'')));
  /* KEINE Ausnahmen mehr. Hier stand einmal eine fuer pg-native, weil der
     Aufruf in einem try/catch steht und nie ausgefuehrt wird. Netlify sieht
     das anders und brach den Deploy ab: eine Ausnahme, die man in die
     eigene Pruefung schreibt, gilt eben nur in der eigenen Pruefung.
     (Ohne Schraegstriche-Anfuehrung hier — der Text steht in einer
     doppelt gequoteten Shell-Zeichenkette, und die Shell liest Backticks
     als Befehl.) */
  if(offen.length){ console.error('   noch offen:', [...new Set(offen)]); process.exit(1); }
  console.log('   nur eingebaute Node-Module — nichts Externes');
"

echo "→ Prüfen, dass auch der Kundenbereich für sich allein läuft"
node -e "
  const h = require('./$GEBAUT_KONTO').handler;
  h({ httpMethod:'GET', headers:{}, body:'' }).then(a => {
    if(a.statusCode !== 405) { console.error('unerwartet:', a); process.exit(1); }
    console.log('   Antwort auf GET:', a.statusCode, a.body);
  });
"

# Dass das Buendel LAEDT, war schon vorher geprueft — und genau diese Pruefung
# hat den pg-native-Fehler durchgelassen: geladen hat es ja, der Treiber wird
# erst beim ersten Verbinden gebraucht. Steht eine Datenbank bereit, wird
# deshalb zusaetzlich einmal wirklich verbunden.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "→ Prüfen, dass das Bündel wirklich an die Datenbank kommt"
  node -e "
    const h = require('./$GEBAUT_KONTO').handler;
    h({ httpMethod:'POST', path:'/api/konto',
        headers:{ 'content-type':'application/json',
                  'x-hst-bereich':'kundenbereich',
                  origin:'http://localhost', host:'localhost' },
        body: JSON.stringify({ aktion:'stand' }) }).then(a => {
      const j = JSON.parse(a.body);
      if(a.statusCode !== 200 || !j.bereit){ console.error('unerwartet:', a); process.exit(1); }
      console.log('   Verbindung steht:', a.statusCode, 'bereit');
      process.exit(0);
    }).catch(e => { console.error('   Verbindung fehlgeschlagen:', e.message); process.exit(1); });
  "
else
  echo "   (ohne DATABASE_URL keine Datenbankprobe — das Bündel wurde nur geladen)"
fi

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
  # Das Datenbankschema. Es lag bisher im Paket und damit unter
  # https://…/db/001_kundenbereich.sql oeffentlich im Netz. Gebraucht wird
  # es dort von niemandem: es laeuft einmal von Hand gegen die Datenbank
  # (siehe README, „Eine Datenbank besorgen"). Ein Bauplan der Tabellen ist
  # kein Geheimnis, aber er gehoert nicht auf den Webserver.
  "db/*"
  # Die Website als eine Datei zum Durchklicken — ein Werkzeug fuer uns,
  # 12 MB, keine Seite verweist darauf.
  "herm-website-testdatei.html"
  # Quelldatei des Wortzeichens, 157 KB. Sie gehoert ins Repository, aber
  # keine Seite laedt sie.
  "assets/logo/logo-herm-original.png"
  # Die Vorlagen der Startseiten-Motive. Sie stehen im Repository, damit
  # sich jede Stufe neu rechnen laesst (assets/quellen/LIESMICH.md) — auf
  # dem Webserver laedt sie keine Seite.
  "assets/quellen/*"
  # Dieselbe Sache, 646 KB: die unvertonte Musikspur ist die Vorlage, aus
  # der film-vertonen.py mischt (und zwar immer aus ihr, nie aus einer schon
  # gemischten Fassung — siehe „Der Imagefilm"). Keine Seite verweist
  # darauf; nachgesehen mit grep ueber HTML, JS, CSS und das Manifest.
  "assets/video/imagefilm-musik.webm"
  # Und der vertonte Imagefilm selbst, 6,9 MB. Er ist seit September nicht
  # mehr die ausgelieferte Datei, sondern die VORLAGE, aus der
  # `tools/hintergrundfilm.sh` die vier Hintergrundfassungen schneidet —
  # ohne Vorspann, ohne Ton, in zwei Zuschnitten. Ausgeliefert werden die.
  # Mit ihm fallen die Dateien weg, die nur der Abspieler brauchte: das
  # Poster in vier Fassungen und die Untertitelspur. Ein Hintergrund hat
  # kein Poster (das Standbild liegt als <picture> darunter) und keine
  # Untertitel (er hat keinen Ton).
  "assets/video/imagefilm.webm"
  "assets/video/imagefilm-de.vtt"
  "assets/img/imagefilm-poster.jpg"
  "assets/img/imagefilm-poster.webp"
  "assets/img/imagefilm-poster.avif"
  "assets/img/imagefilm-poster-gross.jpg"
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
#  Nicht angefasst wird die eine Datei, die WIRKLICH angezeigt wird und
#  nicht in einem `<picture>` steht:
#      og-bild.jpg                Vorschau beim Teilen, von Crawlern direkt geholt
#  Die beiden Posterdateien des Films standen hier bis September daneben.
#  Der Hintergrundfilm hat kein `poster` mehr: unter ihm liegt das erste
#  Bild des Films als `<picture>`, und das ist dieselbe Aufnahme in AVIF.
# ---------------------------------------------------------------------------
BUEHNE="$(mktemp -d)"
trap 'rm -rf "$BUEHNE"' EXIT

echo "→ JPEG-Rückfallebene für das Paket verkleinern"
python3 - "$BUEHNE" <<'PY'
import os, shutil, sys
from PIL import Image

buehne = sys.argv[1]
# Drei Dateien werden WIRKLICH angezeigt und stehen in keinem `<picture>`.
ECHT = {"assets/img/og-bild.jpg"}
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
#  Den Hintergrundfilm für das Paket dichter packen
# ---------------------------------------------------------------------------
#  Der Film ist seit September kein Abspieler mehr, sondern der Hintergrund
#  der Startseite — und damit liegt er auf dem kritischen Pfad JEDES Aufrufs
#  statt nur bei denen, die auf einen Knopf drücken. Er liegt in vier
#  Dateien vor: zwei Zuschnitte (quer, hochkant) in je zwei Formaten
#  (H.264 für die Hardware-Dekodierung, VP9 für die Chromium-Baureihen ohne
#  H.264). Zusammen sind das im Repository 9,2 MB.
#
#  Im Repository ist das richtig: `tools/hintergrundfilm.sh` baut sie mit
#  CRF 30/33 beziehungsweise 36/38 in einem Durchgang, und das ist die
#  Fassung, an der die Kontrastmessung hängt.
#
#  Für die Auslieferung wird dieselbe Fassung noch einmal dichter gepackt:
#  vier Stufen höheres CRF, dazu das langsamere Preset (H.264) bzw. zwei
#  Durchgänge (VP9). Dieselbe Rechnung wie beim früheren Imagefilm — und
#  derselbe Grund, sie zu puffern: es kostet Minuten, und die Vorlagen
#  ändern sich selten.
#
#  **Was hier NICHT passiert, ist Auflösung wegnehmen.** Bestellt war
#  ausdrücklich, die Bildqualität des Films nicht für die Ladezeit zu
#  opfern. Ein zweiter Durchgang packt dichter, er rechnet nicht kleiner:
#  Kantenlänge, Laufzeit und Zuschnitt bleiben Pixel für Pixel dieselben.
# ---------------------------------------------------------------------------
LAGER=".paket-cache"
FF="$(command -v ffmpeg || true)"
if [ -z "$FF" ]; then
  FF="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"
fi

FILME=()
dichter(){   # $1 Datei  $2 crf
  local quelle="$1" crf="$2" stamm ziel stempel
  [ -f "$quelle" ] || return 0
  stamm="$(basename "$quelle")"
  ziel="$LAGER/$stamm"
  stempel="$(stat -c '%Y-%s' "$quelle")"
  if [ ! -f "$ziel" ] || [ "$(cat "$LAGER/$stamm.stempel" 2>/dev/null)" != "$stempel" ]; then
    if [ -z "$FF" ]; then
      echo "   ffmpeg fehlt — bitte installieren (apt-get install ffmpeg)." >&2
      exit 1
    fi
    echo "→ $stamm dichter packen"
    mkdir -p "$LAGER"
    case "$quelle" in
      *.mp4)
        # EIN Durchgang, dafuer ein langsameres Preset. x264 lehnt CRF mit
        # zwei Durchgaengen ausdruecklich ab („CRF/CQP is incompatible with
        # 2pass") — zwei Durchgaenge setzen eine Zielbitrate voraus, CRF
        # setzt eine Zielqualitaet. Was hier gebraucht wird, ist die
        # Qualitaet; dichter wird es ueber `veryslow` statt ueber einen
        # zweiten Lauf.
        "$FF" -y -v error -i "$quelle" -an -c:v libx264 -profile:v high -level 4.0 \
              -pix_fmt yuv420p -crf "$crf" -preset veryslow -g 125 -tune film \
              -movflags +faststart "$ziel" ;;
      *.webm)
        "$FF" -y -v error -i "$quelle" -an -c:v libvpx-vp9 -b:v 0 -crf "$crf" \
              -cpu-used 1 -row-mt 1 -deadline good -g 125 -pix_fmt yuv420p \
              -pass 1 -passlogfile "$LAGER/$stamm.log" -f null /dev/null
        "$FF" -y -v error -i "$quelle" -an -c:v libvpx-vp9 -b:v 0 -crf "$crf" \
              -cpu-used 1 -row-mt 1 -deadline good -g 125 -pix_fmt yuv420p \
              -pass 2 -passlogfile "$LAGER/$stamm.log" "$ziel"
        # Die Tonspur wird nicht kopiert, sondern bleibt weg: der
        # Hintergrundfilm hat keine (`-an` schon beim Bauen). Ein `-c:a copy`
        # waere hier eine Zeile, die nie etwas tut — und beim naechsten
        # Motiv haette sie stillschweigend Ton eingeschleppt.
        ;;
    esac
    echo "$stempel" > "$LAGER/$stamm.stempel"
  fi
  echo "   $stamm  $(du -h "$quelle" | cut -f1)  ->  $(du -h "$ziel" | cut -f1)"
  FILME+=("$quelle")
}

echo "→ Hintergrundfilm für das Paket dichter packen"
dichter assets/video/hintergrund.mp4       34
dichter assets/video/hintergrund.webm      40
dichter assets/video/hintergrund-hoch.mp4  36
dichter assets/video/hintergrund-hoch.webm 42
if [ ${#FILME[@]} -gt 0 ]; then
  AUSSEN+=("${FILME[@]}" "$LAGER/*")
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

# Erzeugnisse, die zufaellig auch auf .html enden. Diese Schleife nimmt
# sonst JEDE HTML-Datei im Baum mit — und die Testfassung der ganzen
# Website ist eine davon: 12 MB, die niemand auf dem Server braucht. Die
# Ausschlussliste weiter oben half nicht, denn die gilt nur fuer den
# ersten Durchgang von `zip`; die Seiten kommen aus der Buehne.
ERZEUGNIS = {"herm-website-testdatei.html"}

n = gross = 0
for wurzel, ordner, dateien in os.walk("."):
    ordner[:] = [o for o in ordner if o not in
                 (".git", "node_modules", "tools", "docs", "api", ".paket-cache")]
    for datei in sorted(dateien):
        if not datei.endswith(".html") or datei in ERZEUGNIS:
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
# Die dichter gepackten Filme kommen unter ihren richtigen Namen ins Paket.
if [ ${#FILME[@]} -gt 0 ]; then
  mkdir -p "$BUEHNE/assets/video"
  for f in "${FILME[@]}"; do cp "$LAGER/$(basename "$f")" "$BUEHNE/$f"; done
  ( cd "$BUEHNE" && zip -qr "$OLDPWD/$ZIEL" assets/video )
fi

echo "→ Nachsehen, dass wirklich alles drin ist"
python3 - "$ZIEL" <<'PY'
import os, posixpath, re, sys, zipfile

z = zipfile.ZipFile(sys.argv[1])
drin = set(z.namelist())

# 1) Jede Datei aus assets/ muss im Paket sein — bis auf das, was
#    absichtlich draussen bleibt.
AUSGENOMMEN = ("assets/logo/logo-herm-original.png",
               "assets/video/imagefilm-musik.webm",
               "assets/video/imagefilm.webm",
               "assets/video/imagefilm-de.vtt",
               "assets/img/imagefilm-poster.jpg",
               "assets/img/imagefilm-poster.webp",
               "assets/img/imagefilm-poster.avif",
               "assets/img/imagefilm-poster-gross.jpg",
               "assets/quellen/")
fehlt = [os.path.join(w, d)
         for w, _, ds in os.walk("assets") for d in ds
         if os.path.join(w, d) not in drin
         and os.path.join(w, d) not in AUSGENOMMEN
         # Ein Eintrag mit Schraegstrich am Ende meint den ganzen Ordner.
         and not any(os.path.join(w, d).startswith(a)
                     for a in AUSGENOMMEN if a.endswith("/"))
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

# 3) Keine erzeugte Seite im Paket.
#    Die groesste echte Seite ist kontakt.html mit 44 KB. Alles jenseits
#    von 200 KB ist keine Seite mehr, sondern ein Erzeugnis, das auf .html
#    endet — die Testfassung der ganzen Website war einmal genau das und
#    hat das Paket von 16 auf 25 MB gehoben, ohne dass eine Meldung kam.
#    Geprueft wird die Groesse und nicht der Name: die naechste erzeugte
#    Datei wird anders heissen.
dick = [(n, z.getinfo(n).file_size) for n in drin
        if n.endswith(".html") and z.getinfo(n).file_size > 200 * 1024]
if dick:
    print("   Zu grosse HTML-Datei im Paket — vermutlich ein Erzeugnis:")
    for n, g in dick:
        print(f"     {n}  ({g/1048576:.1f} MB)")
    sys.exit(1)

# 4) Nichts Fremdes im Paket.
#    `zip -r .` nimmt den ganzen Arbeitsordner; was hier gerade
#    herumliegt, wird mit veroeffentlicht. Genau das ist passiert: ein
#    Pruefskript hatte seine Bildschirmaufnahmen mangels gesetzter
#    Umgebungsvariablen in einen Ordner `undefined/` geschrieben, und
#    neunzehn PNG davon lagen anschliessend im Paket — 20 MB, und sie
#    waeren unter https://…/undefined/ oeffentlich abrufbar gewesen.
#    Gemeldet hat es niemand: Pruefung 1 sucht nach FEHLENDEM, nicht nach
#    Ueberzaehligem.
#    Geprueft wird die oberste Ebene, denn tools/, docs/, api/ und db/
#    stehen ohnehin in AUSSEN — durchrutschen kann nur ein Ordner oder
#    eine Datei, die es vorher nicht gab.
ERLAUBT = {"assets", "netlify", "dienstleistungen", "robots.txt",
           "sitemap.xml", "site.webmanifest", "netlify.toml", "_headers",
           "_redirects"}
fremd = sorted({n.split("/")[0] for n in drin
                if n.split("/")[0] not in ERLAUBT and not n.endswith(".html")})
if fremd:
    print("   Fremdes im Paket — gehoert das wirklich auf den Webserver?",
          *fremd, sep="\n     ")
    sys.exit(1)

print(f"   {len(drin)} Dateien, keine Lücke in assets/,"
      f" keine tote Bildadresse im Markup, keine erzeugte Seite,"
      f" nichts Fremdes")
PY

echo
echo "Fertig: $ZIEL  ($(du -h "$ZIEL" | cut -f1))"
echo "Die Funktionen darin: $GEBAUT ($(du -h "$GEBAUT" | cut -f1))"
echo "                      $GEBAUT_KONTO ($(du -h "$GEBAUT_KONTO" | cut -f1))"
echo
echo "Weiter geht es in README.md unter „Auf Netlify veröffentlichen“."
