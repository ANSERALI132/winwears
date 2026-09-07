#!/usr/bin/env bash
# Copies the supplied source assets into the deployable frontend/assets/img tree.
# Source folders are never modified. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/frontend/assets/img"

copy_category () {
  local src_dir="$1" out_key="$2" prefix="$3"
  local i=0
  mkdir -p "$OUT/products/$out_key"
  while IFS= read -r sub; do
    i=$((i+1))
    local id
    id=$(printf "%s-%02d" "$prefix" "$i")
    mkdir -p "$OUT/products/$out_key/$id"
    local n=0
    while IFS= read -r f; do
      n=$((n+1))
      cp "$f" "$OUT/products/$out_key/$id/$n.jpeg"
    done < <(find "$src_dir/$sub" -maxdepth 1 -type f \( -iname '*.jpeg' -o -iname '*.jpg' -o -iname '*.png' \) | sort -V)
    echo "$id  <-  $sub  ($n images)"
  done < <(cd "$src_dir" && find . -maxdepth 1 -mindepth 1 -type d -printf '%f\n' | sort -V)
}

mkdir -p "$OUT/logo" "$OUT/factory"
cp "$ROOT/LOGO/"*.jpeg "$OUT/logo/win-wears-logo.jpeg"
cp "$ROOT/OUR FACTORY/"*.jpeg "$OUT/factory/win-wears-factory.jpeg"
echo "logo + factory copied"

copy_category "$ROOT/Catagories/HYBRID BALL"                "hybrid"   "hyb"
copy_category "$ROOT/Catagories/hand made match ball"       "handmade" "hm"
copy_category "$ROOT/Catagories/Thermal bonded match ball"  "thermal"  "tb"
copy_category "$ROOT/Catagories/TPU BALL"                   "tpu"      "tpu"
