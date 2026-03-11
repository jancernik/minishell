#!/usr/bin/env bash

# Process Lucide SVG icons idempotently for use with the Icon component in AGS.

set -euo pipefail

ICONS_DIR="$(dirname "$0")/icons"
STROKE="#eeeeee"

shopt -s nullglob
icons=("$ICONS_DIR"/*.svg)

[[ ${#icons[@]} -eq 0 ]] && { echo "No SVG files found in $ICONS_DIR" >&2; exit 1; }

for file in "${icons[@]}"; do
  # Patch stroke on the root svg element
  sed -i "0,/stroke=\"[^\"]*\"/s//stroke=\"$STROKE\"/" "$file"
  basename "$file"
done
