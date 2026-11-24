#!/usr/bin/env bash
# Formats QML, JavaScript and shell sources in place.
# With --check, lists files that are not formatted or have lines longer than
# MAX_LINE_LENGTH, and exits non-zero without changing anything.
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
qmlformat="${QMLFORMAT:-/usr/lib/qt6/bin/qmlformat}"
max_line_length=120
check=false
if [[ "${1:-}" == "--check" ]]; then
    check=true
elif [[ $# -gt 0 ]]; then
    echo "usage: $0 [--check]" >&2
    exit 2
fi

for tool in "$qmlformat" shfmt; do
    if ! command -v "$tool" >/dev/null; then
        echo "$tool not found" >&2
        exit 1
    fi
done

cd "$repo_dir"
# Tracked and new files that exist in the working tree.
existing_files() {
    git ls-files -co --exclude-standard --deduplicate -- "$@" | while read -r file; do
        if [[ -f "$file" ]]; then
            echo "$file"
        fi
    done
}

mapfile -t qml_files < <(existing_files '*.qml' '*.js')
mapfile -t shell_files < <(existing_files '*.sh')

status=0
for file in "${qml_files[@]}"; do
    if $check; then
        if ! "$qmlformat" "$file" | cmp -s - "$file"; then
            echo "$file: not formatted"
            status=1
        fi
    else
        # Rewrite only files that change, so untouched files keep their
        # timestamps and a running shell does not reload them.
        if ! "$qmlformat" "$file" | cmp -s - "$file"; then
            "$qmlformat" -i "$file"
        fi
    fi
done

if $check; then
    shfmt -l "${shell_files[@]}" | sed 's/$/: not formatted/' | grep . && status=1
else
    shfmt -w "${shell_files[@]}"
fi

# qmlformat neither wraps nor keeps manual wrapping, so long expressions are
# split into named parts. String literal contents do not count, because a
# literal cannot be split without qmlformat joining it again.
long_lines="$(LC_ALL=C.UTF-8 awk -v max="$max_line_length" '
    {
        line = $0
        gsub(/"([^"\\]|\\.)*"/, "\"\"", line)
        gsub(/\047([^\047\\]|\\.)*\047/, "\047\047", line)
        gsub(/`([^`\\]|\\.)*`/, "``", line)
        if (length(line) > max)
            printf "%s:%d: %d characters\n", FILENAME, FNR, length(line)
    }' "${qml_files[@]}" "${shell_files[@]}")"
if [[ -n "$long_lines" ]]; then
    echo "$long_lines"
    echo "Lines above $max_line_length characters: split them into named properties, functions or variables."
    status=1
fi

exit "$status"
