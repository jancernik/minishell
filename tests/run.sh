#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runner="${QMLTESTRUNNER:-/usr/lib/qt6/bin/qmltestrunner}"
if [[ "$runner" != */* ]]; then
    runner="$(command -v "$runner" 2>/dev/null || true)"
fi
if [[ -z "$runner" || ! -x "$runner" ]]; then
    echo "Qt 6 qmltestrunner not found" >&2
    exit 1
fi

python3 -m json.tool "$repo_dir/config/schema.json" >/dev/null
# Tests read config/schema.json through XMLHttpRequest.
QML_XHR_ALLOW_FILE_READ=1 QT_QPA_PLATFORM=offscreen "$runner" \
    -input "$repo_dir/tests" \
    -import "$repo_dir/tests/imports"
