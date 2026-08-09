#!/usr/bin/env bash
# VP9 im Zweipass mit Zielbitrate.
# Grund: mit reinem CRF lag VP9 hier ueber den H.264-Dateien — dann waere die
# WebM-Quelle die schlechtere Wahl, obwohl der Browser sie zuerst nimmt.
set -euo pipefail

SCR="/tmp/claude-0/-home-user-Claude/af0694ca-d080-559f-a853-f412dd7cd148/scratchpad"
MASTER="$SCR/master4k.mkv"
OUT="$SCR/out"

enc () { # name w h bitrate cpu
  local name=$1 w=$2 h=$3 br=$4 cpu=$5
  local log="$SCR/vp9-$name"
  ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
    -vf "scale=${w}:${h}:flags=lanczos" \
    -c:v libvpx-vp9 -b:v "$br" -minrate "$((${br%k} * 50 / 100))k" -maxrate "$((${br%k} * 145 / 100))k" \
    -pass 1 -passlogfile "$log" -deadline good -cpu-used 4 -row-mt 1 -tile-columns 2 \
    -g 60 -lag-in-frames 25 -pix_fmt yuv420p -f null /dev/null
  ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
    -vf "scale=${w}:${h}:flags=lanczos" \
    -c:v libvpx-vp9 -b:v "$br" -minrate "$((${br%k} * 50 / 100))k" -maxrate "$((${br%k} * 145 / 100))k" \
    -pass 2 -passlogfile "$log" -deadline good -cpu-used "$cpu" -row-mt 1 -tile-columns 2 \
    -g 60 -auto-alt-ref 1 -lag-in-frames 25 -pix_fmt yuv420p "$OUT/${name}.webm"
  rm -f "${log}"*
}

enc hero-4k 1770 3840 3000k 3
enc hero-2k 1180 2560 1350k 2
enc hero     590 1280  620k 2

echo "== Vergleich MP4 zu WebM =="
for n in hero-4k hero-2k hero; do
  printf "%-10s mp4 %6s KB   webm %6s KB\n" "$n" \
    "$(( $(stat -c%s "$OUT/$n.mp4") / 1024 ))" "$(( $(stat -c%s "$OUT/$n.webm") / 1024 ))"
done
