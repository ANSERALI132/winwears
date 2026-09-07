#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Keeps the navigation and footer identical across every page.
#
#   bash tools/build-chrome.sh extract   # refresh partials from index.html
#   bash tools/build-chrome.sh apply     # push partials into every page
#
# Pages mark their chrome with:
#     <!-- #nav -->   ... <!-- /nav -->
#     <!-- #footer -->... <!-- /footer -->
# Everything between the markers is replaced. Pages inside products/ get a
# "../" prefix added to every relative href/src automatically.
#
# The generated pages are plain standalone HTML — this script is a
# convenience, not a build step. You can edit the pages directly instead.
# --------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/frontend"
PARTS="$ROOT/tools/partials"
mkdir -p "$PARTS"

extract () {
  awk '/<!-- #nav -->/{f=1;next} /<!-- \/nav -->/{f=0} f' "$SITE/index.html" > "$PARTS/nav.html"
  awk '/<!-- #footer -->/{f=1;next} /<!-- \/footer -->/{f=0} f' "$SITE/index.html" > "$PARTS/footer.html"
  echo "extracted: $(wc -l < "$PARTS/nav.html") lines nav, $(wc -l < "$PARTS/footer.html") lines footer"
}

# Rewrite relative href/src values so they resolve from a subdirectory.
reroot () {
  sed -e 's|href="http|href="\x01http|g' \
      -e 's|src="http|src="\x01http|g' \
      -e 's|href="mailto:|href="\x01mailto:|g' \
      -e 's|href="#|href="\x01#|g' \
      -e 's|href="|href="../|g' \
      -e 's|src="|src="../|g' \
      -e 's|href="../\x01|href="|g' \
      -e 's|src="../\x01|src="|g'
}

inject () {           # inject <file> <marker> <partial>
  local file="$1" name="$2" partial="$3" tmp
  tmp="$(mktemp)"
  if [[ "$file" == *"/products/"* ]]; then
    reroot < "$partial" > "$tmp.part"
  else
    cp "$partial" "$tmp.part"
  fi
  awk -v start="<!-- #$name -->" -v stop="<!-- /$name -->" -v partfile="$tmp.part" '
    index($0, start) { print; while ((getline line < partfile) > 0) print line; close(partfile); skip=1; next }
    index($0, stop)  { skip=0 }
    !skip { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
  rm -f "$tmp.part"
}

apply () {
  local n=0
  while IFS= read -r f; do
    grep -q '<!-- #nav -->'    "$f" && inject "$f" nav    "$PARTS/nav.html"    || true
    grep -q '<!-- #footer -->' "$f" && inject "$f" footer "$PARTS/footer.html" || true
    n=$((n+1))
    echo "  chrome -> ${f#$SITE/}"
  done < <(find "$SITE" -name '*.html' -not -name 'index.html')
  echo "updated $n pages"
}

case "${1:-apply}" in
  extract) extract ;;
  apply)   apply ;;
  all)     extract; apply ;;
  *) echo "usage: build-chrome.sh [extract|apply|all]"; exit 1 ;;
esac
