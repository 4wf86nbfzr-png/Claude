#!/usr/bin/env bash
# Auslieferungsleiter aus dem 4K-Zwischenmaster.
# Ziel: 4K unter ~8 MB, 2K unter ~3 MB, SD unter ~1,5 MB bei 16,9 s.
set -euo pipefail

SCR="/tmp/claude-0/-home-user-Claude/af0694ca-d080-559f-a853-f412dd7cd148/scratchpad"
MASTER="$SCR/master4k.mkv"
OUT="$SCR/out"
mkdir -p "$OUT"

# aq-mode=3 haelt Struktur in den dunklen Flaechen; ohne das saeuft der
# Acker bei diesen Bitraten ab.
X264="-preset slower -profile:v high -pix_fmt yuv420p -g 60 -movflags +faststart \
-colorspace bt709 -color_primaries bt709 -color_trc bt709 -x264-params aq-mode=3:aq-strength=1.1"

enc_mp4 () { # name w h crf maxrate
  local name=$1 w=$2 h=$3 crf=$4 max=$5
  # shellcheck disable=SC2086
  ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
    -vf "scale=${w}:${h}:flags=lanczos" \
    -c:v libx264 -crf "$crf" -maxrate "$max" -bufsize "$((${max%k} * 2))k" $X264 \
    "$OUT/${name}.mp4"
}

enc_webm () { # name w h crf
  local name=$1 w=$2 h=$3 crf=$4
  ffmpeg -y -hide_banner -loglevel error -i "$MASTER" -an \
    -vf "scale=${w}:${h}:flags=lanczos" \
    -c:v libvpx-vp9 -crf "$crf" -b:v 0 -deadline good -cpu-used 2 -row-mt 1 \
    -tile-columns 2 -g 60 -auto-alt-ref 1 -lag-in-frames 25 -pix_fmt yuv420p \
    "$OUT/${name}.webm"
}

echo "== MP4 =="
enc_mp4 hero-4k 1770 3840 33 3800k
enc_mp4 hero-2k 1180 2560 32 1700k
enc_mp4 hero     590 1280 31  800k

echo "== WebM =="
enc_webm hero-4k 1770 3840 40
enc_webm hero-2k 1180 2560 38
enc_webm hero     590 1280 36

echo "== Poster =="
ffmpeg -y -hide_banner -loglevel error -ss 6.2 -i "$MASTER" -frames:v 1 "$SCR/poster.png"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -c:v libwebp -quality 80 "$OUT/hero-poster.webp"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -q:v 4 "$OUT/hero-poster.jpg"
ffmpeg -y -hide_banner -loglevel error -i "$SCR/poster.png" -vf scale=590:1280 -c:v libwebp -quality 76 "$OUT/hero-poster-sm.webp"

echo "== Ergebnis =="
for f in "$OUT"/hero*.mp4 "$OUT"/hero*.webm "$OUT"/hero-poster*; do
  printf "%-22s %8s KB  %s\n" "$(basename "$f")" "$(( $(stat -c%s "$f") / 1024 ))" \
    "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f" 2>/dev/null)"
done
