#!/usr/bin/env bash
# Erzeugt die Auslieferungsstufen aus dem 4K-Zwischenmaster neu.
#
# WICHTIG · der gruene Rand
# nnedi laesst in Verbindung mit transpose links eine unbrauchbare Spalte
# stehen, sechs Pixel breit, in reinem Gruen. Im fertigen Bild faellt das
# kaum auf — bis `object-fit: cover` den Clip auf einem Querformat-Fenster
# um das Sechsfache streckt. Dann steht da ein fetter gruener Balken.
# Deshalb werden links acht Pixel abgeschnitten und die Breite wieder
# aufgezogen. Der Versatz von 0,45 Prozent ist unsichtbar.
set -euo pipefail

SCR="/tmp/claude-0/-home-user-Claude/af0694ca-d080-559f-a853-f412dd7cd148/scratchpad"
MASTER="$SCR/master4k.mkv"
ZIEL="/home/user/Claude/kornkammer/public/video"

# 1770 - 8 = 1762
SCHNITT="crop=1762:3840:8:0"

X264="-preset slower -profile:v high -pix_fmt yuv420p -g 60 -movflags +faststart \
-colorspace bt709 -color_primaries bt709 -color_trc bt709 -x264-params aq-mode=3:aq-strength=1.1"

mp4 () { # name w h crf maxrate
  local name=$1 w=$2 h=$3 crf=$4 max=$5
  # shellcheck disable=SC2086
  ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
    -vf "${SCHNITT},scale=${w}:${h}:flags=lanczos" \
    -c:v libx264 -crf "$crf" -maxrate "$max" -bufsize "$((${max%k} * 2))k" $X264 \
    "$ZIEL/${name}.mp4"
}

webm () { # name w h bitrate cpu
  local name=$1 w=$2 h=$3 br=$4 cpu=$5
  local log="$SCR/vp9-$name"
  for pass in 1 2; do
    ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
      -vf "${SCHNITT},scale=${w}:${h}:flags=lanczos" \
      -c:v libvpx-vp9 -b:v "$br" -maxrate "$((${br%k} * 145 / 100))k" \
      -pass "$pass" -passlogfile "$log" -deadline good -cpu-used "$([ $pass -eq 1 ] && echo 4 || echo "$cpu")" \
      -row-mt 1 -tile-columns 2 -g 60 -lag-in-frames 25 -pix_fmt yuv420p \
      $([ $pass -eq 1 ] && echo "-f null /dev/null" || echo "$ZIEL/${name}.webm")
  done
  rm -f "${log}"*
}

echo "== MP4 =="
mp4 hero-4k 1770 3840 33 3800k
mp4 hero-2k 1180 2560 32 1700k
mp4 hero     590 1280 31  800k
# Sparsame Fassung fuer die Einzeldatei-Demo: als Daten-URL soll sie klein
# bleiben, damit auch Safari sie annimmt.
mp4 hero-demo 590 1280 33 450k

echo "== WebM =="
webm hero-4k 1770 3840 3000k 3
webm hero-2k 1180 2560 1350k 2
webm hero     590 1280  620k 2
webm hero-demo 590 1280 330k 2

echo "== Poster =="
ffmpeg -y -hide_banner -loglevel error -ss 6.2 -i "$MASTER" -vf "$SCHNITT" -frames:v 1 "$SCR/poster.png"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf "scale=1770:3840" -c:v libwebp -quality 80 "$ZIEL/hero-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf "scale=1770:3840" -q:v 4 "$ZIEL/hero-poster.jpg"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf "scale=590:1280" -c:v libwebp -quality 76 "$ZIEL/hero-poster-sm.webp"

echo "== Ergebnis =="
for f in "$ZIEL"/hero*.mp4 "$ZIEL"/hero*.webm; do
  printf "%-18s %8s KB  %s\n" "$(basename "$f")" "$(( $(stat -c%s "$f") / 1024 ))" \
    "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f")"
done
