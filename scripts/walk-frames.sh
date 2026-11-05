#!/bin/bash
# Rebuilds the opening walk: cuts five Mixkit clips into one continuous film (city street -> up the steps ->
# the tower -> inside -> the view), grades it to the site's green and writes it as a few packs of frames.
#   scripts/walk-frames.sh [clips-dir]     (downloads the clips when no directory is given)
# Needs ffmpeg, ImageMagick with WebP, curl and bc. Writes assets/walk/{d,p}/coarse.bin, chunk-00..NN.bin and
# poster.webp.
#
# Each scene keeps RATE frames per second of its real motion, so neighbouring frames are close and blend
# cleanly; scenes are joined with 0.4 s crossfades. A pack is WebP files laid end to end (each WebP states its
# own length): coarse.bin holds every 16th frame, the whole walk in one small request, and chunk-NN.bin holds
# the other frames of 32 in a row, which the page fetches nearest the visitor first.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLUT="$ROOT/scripts/walk-clut.png" # green to ivory, the duotone used on the site's pictures
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
CLIPS="${1:-$WORK/clips}"
FPS=24; XF=0.4; COARSE=16; CHUNK=32
#        mixkit id  in   out  rate  phone-crop-x (0..1)
SCENES=("40637 0.0 13.0 10 0.50" "25269 0.0 10.5 12 0.58" "40701 0.0 5.0 12 0.50" "15795 0.4 8.6 10 0.50" "3516 0.0 8.0 12 0.55")

if [ -z "${1:-}" ]; then
  mkdir -p "$CLIPS"
  for s in "${SCENES[@]}"; do
    f=${s%% *}
    curl -fsS -o "$CLIPS/$f.mp4" "https://assets.mixkit.co/videos/$f/$f-1080.mp4" ||
      curl -fsS -o "$CLIPS/$f.mp4" "https://assets.mixkit.co/videos/$f/$f-720.mp4"
  done
fi

build() { # $1 = d (1280x720, landscape screens) | p (540x960, phones)
  local set=$1 W H graph="" inputs=() i=0 last len n off
  if [ "$set" = d ]; then W=1280; H=720; else W=540; H=960; fi
  for s in "${SCENES[@]}"; do
    read -r f a b r cx <<<"$s"
    inputs+=(-i "$CLIPS/$f.mp4")
    if [ "$set" = d ]; then
      if [ "$f" = 40701 ]; then fit="crop=iw:iw*9/16:0:(ih-iw*9/16)*0.45,scale=$W:$H" # a portrait clip
      else fit="scale=$W:$H:force_original_aspect_ratio=increase,crop=$W:$H"; fi
    else
      fit="scale=-2:$H,crop=$W:$H:(iw-$W)*$cx:0"
    fi
    # keep r frames per real second: stretch time by r/FPS, then resample at FPS
    graph+="[$i:v]trim=$a:$b,setpts=(PTS-STARTPTS)*$r/$FPS,fps=$FPS,$fit,setsar=1,format=yuv420p[s$i];"
    i=$((i + 1))
  done
  len=$(echo "${SCENES[0]}" | awk -v f=$FPS '{print ($3-$2)*$4/f}'); last=s0
  for ((j = 1; j < ${#SCENES[@]}; j++)); do
    n=$(echo "${SCENES[$j]}" | awk -v f=$FPS '{print ($3-$2)*$4/f}')
    off=$(echo "$len - $XF" | bc -l)
    graph+="[$last][s$j]xfade=transition=fade:duration=$XF:offset=$off[x$j];"
    last="x$j"; len=$(echo "$len + $n - $XF" | bc -l)
  done
  mkdir -p "$WORK/raw-$set" "$WORK/$set"
  ffmpeg -v error -y "${inputs[@]}" -filter_complex "${graph%;}" -map "[$last]" -fps_mode passthrough "$WORK/raw-$set/%03d.png"
  local q; [ "$set" = d ] && q=54 || q=50
  # grade: 70% colour, 45% of the green-to-ivory duotone over it, soft edge darkening
  ls "$WORK/raw-$set"/*.png | xargs -P "$(nproc)" -I{} sh -c '
    b=$(basename {} .png); n=$(printf "%03d" $(expr $b - 1))
    convert {} -modulate 100,70 \( +clone -colorspace Gray -level 2%,96%,1.1 -sigmoidal-contrast 2.5,45% '"$CLUT"' -clut \) \
      -compose blend -define compose:args=45 -composite \
      \( -size '"${W}x${H}"' radial-gradient:white-"#707070" \) -compose multiply -composite \
      -strip -quality '"$q"' -define webp:method=6 "'"$WORK/$set"'/$n.webp"'
  local out="$ROOT/assets/walk/$set" frames
  frames=$(ls "$WORK/$set" | wc -l)
  mkdir -p "$out" && rm -f "$out"/*.bin
  for ((f = 0; f < frames; f += COARSE)); do cat "$WORK/$set/$(printf %03d $f).webp"; done > "$out/coarse.bin"
  for ((c = 0; c * CHUNK < frames; c++)); do
    for ((f = c * CHUNK; f < (c + 1) * CHUNK && f < frames; f++)); do
      if ((f % COARSE)); then cat "$WORK/$set/$(printf %03d $f).webp"; fi
    done > "$out/chunk-$(printf %02d $c).bin"
  done
  cp "$WORK/$set/000.webp" "$out/poster.webp"
  echo "$set: $frames frames, coarse $(du -h "$out/coarse.bin" | cut -f1), $c chunks, $(du -ch "$out"/*.bin | tail -1 | cut -f1)"
}
build d
build p
