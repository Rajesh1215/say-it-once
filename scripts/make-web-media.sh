#!/usr/bin/env bash
# Web copies of the shorts for deployment: 720×1280, H.264 crf 26, fast start, BT.709 kept — roughly 4–8× smaller than
# the 1080×1920 masters. Writes media/web/<name>.mp4; point the page at media/web/ when you deploy. Heavy-ish: ~1 min
# per minute of video on an M2. Usage: scripts/make-web-media.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p media/web
for f in media/*.mp4; do
  n=$(basename "$f")
  ffmpeg -v error -y -i "$f" -vf "scale=720:-2:flags=lanczos" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 128k -movflags +faststart "media/web/$n"
  echo "$n -> media/web/$n ($(du -h "media/web/$n" | cut -f1))"
done
