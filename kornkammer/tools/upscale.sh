#!/usr/bin/env bash
# Hero-Video Upscale 590x1280 -> 1770x3840 (exakt 3x, UHD-Langkante)
#
# Schritt 1  Zwischenmaster: die teure Kette laeuft genau einmal
#            hqdn3d   Rauschen daempfen, damit der Upscaler es nicht verstaerkt
#            nnedi3   kantengefuehrte neuronale Verdopplung, beide Achsen
#            lanczos  Rest auf 3x
#            cas      Mikrokontrast zurueckholen (Contrast Adaptive Sharpen)
# Schritt 2  Auslieferungsleiter aus dem Master, MP4 (H.264) und WebM (VP9)
set -euo pipefail

SRC="/root/.claude/uploads/af0694ca-d080-559f-a853-f412dd7cd148/26c45f85-hero.mp4"
SCR="/tmp/claude-0/-home-user-Claude/af0694ca-d080-559f-a853-f412dd7cd148/scratchpad"
W="$SCR/nnedi3_weights.bin"
OUT="$SCR/out"
MASTER="$SCR/master4k.mkv"
mkdir -p "$OUT"

NN="nnedi=weights=${W}:field=a:nsize=s32x4:nns=n64:qual=slow"
CHAIN="hqdn3d=1.2:1.0:5:5,format=yuv420p,${NN},transpose=2,${NN},transpose=1,scale=1770:3840:flags=lanczos+accurate_rnd+full_chroma_int,cas=0.35,unsharp=5:5:0.5:5:5:0.0,format=yuv420p"

if [ ! -s "$MASTER" ]; then
  echo "== Schritt 1: Zwischenmaster 1770x3840 =="
  ffmpeg -y -hide_banner -loglevel warning -i "$SRC" -vf "$CHAIN" -an \
    -c:v libx264 -preset ultrafast -qp 12 -pix_fmt yuv420p "$MASTER"
fi
ls -la "$MASTER"

echo "== Schritt 2a: MP4 (H.264) =="
# 4K: kein -level erzwingen, x264 setzt 6.x selbst. maxrate deckelt Spitzen.
ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
  -c:v libx264 -preset slower -crf 28 -maxrate 7000k -bufsize 14000k \
  -profile:v high -pix_fmt yuv420p -g 60 -movflags +faststart \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$OUT/hero-4k.mp4"

ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
  -vf "scale=1180:2560:flags=lanczos" \
  -c:v libx264 -preset slower -crf 26 -maxrate 3500k -bufsize 7000k \
  -profile:v high -level 5.1 -pix_fmt yuv420p -g 60 -movflags +faststart \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$OUT/hero-2k.mp4"

ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
  -vf "scale=590:1280:flags=lanczos" \
  -c:v libx264 -preset slower -crf 25 -maxrate 1600k -bufsize 3200k \
  -profile:v high -level 4.0 -pix_fmt yuv420p -g 60 -movflags +faststart \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 "$OUT/hero.mp4"

echo "== Schritt 2b: WebM (VP9) =="
ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 -tile-columns 2 \
  -g 60 -auto-alt-ref 1 -lag-in-frames 25 -pix_fmt yuv420p "$OUT/hero-4k.webm"
ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an -vf "scale=1180:2560:flags=lanczos" \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -deadline good -cpu-used 3 -row-mt 1 -tile-columns 2 \
  -g 60 -auto-alt-ref 1 -lag-in-frames 25 -pix_fmt yuv420p "$OUT/hero-2k.webm"
ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an -vf "scale=590:1280:flags=lanczos" \
  -c:v libvpx-vp9 -crf 33 -b:v 0 -deadline good -cpu-used 3 -row-mt 1 -tile-columns 1 \
  -g 60 -auto-alt-ref 1 -lag-in-frames 25 -pix_fmt yuv420p "$OUT/hero.webm"

echo "== Schritt 3: Poster =="
ffmpeg -y -hide_banner -loglevel error -ss 6.2 -i "$MASTER" -frames:v 1 "$SCR/poster.png"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -c:v libwebp -quality 82 "$OUT/hero-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -q:v 4 "$OUT/hero-poster.jpg"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf "scale=590:1280" -c:v libwebp -quality 78 "$OUT/hero-poster-sm.webp"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf "scale=32:69" -c:v libwebp -quality 55 "$OUT/hero-lqip.webp"

echo "== Ergebnis =="
ls -la "$OUT"
for f in "$OUT"/hero*.mp4 "$OUT"/hero*.webm; do
  printf "%-16s %s\n" "$(basename "$f")" "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f")"
done
