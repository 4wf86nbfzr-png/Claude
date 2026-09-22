#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Aus dem Imagefilm wird der Hintergrund der Startseite
# ---------------------------------------------------------------------------
#  Der Film lag bisher als Abspieler in einem eigenen Abschnitt: schwarzer
#  Vorspann, Poster, Knopf, Untertitel, Tonspur. Als HINTERGRUND taugt genau
#  das nicht, bestellt war „kein schwarzer Screen davor, kein Ton, laeuft von
#  selbst, laeuft endlos".
#
#  Vier Dinge passieren deshalb hier und nicht im Stylesheet:
#
#  1. DER SCHWARZE VORSPANN FAELLT WEG. Gemessen (mittlere Helligkeit eines
#     64x36-Rasters) liegt das Bild bis 0,8 s bei 6,6 und ab 1,2 s bei 49.
#     Geschnitten wird bei 1,0 s. Damit ist das ERSTE Bild des Hintergrunds
#     schon ein Motiv, und genau dieses Bild liegt als Standbild darunter:
#     der Wechsel vom Standbild zum Film ist deshalb nicht zu sehen.
#  2. DIE TONSPUR FAELLT WEG, und zwar wirklich (`-an`), nicht nur ueber
#     `muted`. Ein Hintergrundfilm, dessen Ansage nur stummgeschaltet ist,
#     spielt sie ab, sobald irgendetwas die Stummschaltung aufhebt. Was
#     nicht da ist, kann nicht aufgehen.
#  3. H.264 STATT VP9. Das ist der einzige Punkt, an dem die Auslieferung
#     hier vom Rest des Projekts abweicht (sonst gilt „das modernste Format
#     zuerst"). Ein Hintergrundfilm laeuft DAUERND, und H.264 wird auf jedem
#     Telefon von eigener Hardware dekodiert, VP9 nicht ueberall. Auf einem
#     Akku ist das der Unterschied zwischen warm und heiss, und es ist
#     zugleich das Format, das jeder Browser und jedes iOS abspielt.
#  4. ZWEI ZUSCHNITTE, nicht zwei Groessen. Warum, steht unten beim
#     Hochkant-Schnitt.
#
#      bash tools/hintergrundfilm.sh
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

QUELLE=assets/video/imagefilm.webm
START=1.0          # hier ist der schwarze Vorspann vorbei (gemessen)

[ -f "$QUELLE" ] || { echo "Fehlt: $QUELLE"; exit 1; }

bauen(){   # $1 Filter  $2 crf-h264  $3 crf-vp9  $4 Stamm
  echo "→ $4.mp4  (H.264, crf $2, ohne Ton)"
  ffmpeg -hide_banner -v error -y -ss "$START" -i "$QUELLE" \
    -an -vf "$1" \
    -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
    -crf "$2" -preset slow -g 125 -tune film \
    -movflags +faststart \
    "$4.mp4"
  echo "   $(du -h "$4.mp4" | cut -f1)"
  # Und dieselbe Fassung als VP9. Nicht der Bytes wegen, sondern weil es
  # Chromium-Baureihen ohne H.264 gibt (jede Linux-Distribution, die die
  # patentbehafteten Codecs auslaesst). Ohne diese Datei saehen die nur das
  # Standbild. H.264 steht im Markup zuerst: wo beides geht, ist es das mit
  # der Hardware-Dekodierung.
  echo "→ $4.webm (VP9, crf $3, ohne Ton)"
  ffmpeg -hide_banner -v error -y -ss "$START" -i "$QUELLE" \
    -an -vf "$1" \
    -c:v libvpx-vp9 -crf "$3" -b:v 0 -row-mt 1 -cpu-used 2 -g 125 \
    -pix_fmt yuv420p \
    "$4.webm"
  echo "   $(du -h "$4.webm" | cut -f1)"
}

# QUER, fuer alles ab 901 px.
# 1600 und nicht 1920: der Film ist aus Fotos von 1129 bis 1600 px gebaut
# (siehe „Der Imagefilm" in CLAUDE.md). Seine 1920 waren schon hochgerechnet;
# 1600 ist die Kante, an der wirklich noch Bilddetail steht. Das spart ein
# Drittel der Datei, ohne dass ein Pixel Detail verlorengeht.
bauen "scale=1600:900:flags=lanczos" 30 36 assets/video/hintergrund

# HOCHKANT, fuer das Telefon, und das ist der eigentliche Punkt.
# `object-fit:cover` deckt ueber die LAENGERE RELATIVE Kante. In einem
# Fenster von 390 x 844 bei dreifacher Dichte sind das 2532 Geraetepixel
# HOEHE. Eine 16:9-Datei muesste dafuer um das 3,5-fache hochgerechnet
# werden, genau die Unschaerfe, die beanstandet war. Ein Zuschnitt auf 9:16
# bringt denselben Bildausschnitt auf 1,76-fach herunter.
# Dieselbe Rechnung wie bei den Fotos („bei object-fit:cover misst man die
# falsche Kante"), nur mit bewegtem Bild.
bauen "crop=608:1080:656:0,scale=810:1440:flags=lanczos" 33 38 assets/video/hintergrund-hoch

# Die beiden Standbilder sind die ERSTEN BILDER der beiden Fassungen, nicht
# irgendein Motiv. Nur so ist der Wechsel vom Standbild auf den Film nicht zu
# sehen, und nur deshalb gibt es keine schwarze Flaeche davor.
echo "→ Standbilder aus dem jeweils ersten Bild"
ffmpeg -hide_banner -v error -y -i assets/video/hintergrund.mp4 \
  -frames:v 1 -q:v 2 assets/img/filmstart.jpg
ffmpeg -hide_banner -v error -y -i assets/video/hintergrund-hoch.mp4 \
  -frames:v 1 -q:v 2 assets/img/filmstart-hoch.jpg
python3 -c "from PIL import Image; import sys; [print('  ', p, Image.open(p).size) for p in sys.argv[1:]]" \
  assets/img/filmstart.jpg assets/img/filmstart-hoch.jpg

echo
echo "Fertig. Danach: python3 tools/bilder-vergroessern.py (Standbilder in AVIF/WebP)"
