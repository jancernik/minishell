#!/usr/bin/env python3
"""Lint every QML file with qmllint.

Quickshell serves the shell as the `qs` module from a generated tree of
symlinks and qmldir files that only exists while it runs. This script builds
an equivalent tree in a temporary directory so linting works without a running
shell. Tests are linted against the stub modules in tests/imports.

Several installed Quickshell submodules omit `depends Quickshell` from their
qmldir although their types derive from core types, which leaves those types
unresolved. The lint run puts corrected copies of those qmldir files first on
the import path.

Any finding, including infos, fails the run. Settings come from .qmllint.ini.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QT_QML = Path(os.environ.get("QT_QML_DIR", "/usr/lib/qt6/qml"))
SKIPPED_DIRS = {".git", "tests", "tools", "config", "design"}


def find_tool(name):
    configured = os.environ.get(name.upper())
    candidates = [configured, f"/usr/lib/qt6/bin/{name}", shutil.which(f"{name}6"), shutil.which(name)]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    sys.exit(f"{name} not found; set {name.upper()} to its path")


def shell_directories():
    for directory, subdirectories, files in os.walk(ROOT):
        subdirectories[:] = sorted(d for d in subdirectories if d not in SKIPPED_DIRS and not d.startswith("."))
        sources = sorted(name for name in files if name.endswith((".qml", ".js")))
        if sources:
            yield Path(directory), sources


def build_module_tree(target):
    """Copy the shell sources into a `qs` module tree under `target`, with a qmldir per directory.

    Returns each QML copy mapped to its source. The files must be copies: qmllint follows
    a symlinked file to its real directory, which has no qmldir, so a directory's own
    singletons would depend on the order files are linted.
    """
    copies = {}
    for directory, files in shell_directories():
        relative = directory.relative_to(ROOT)
        module_dir = target / "qs" / relative
        module_dir.mkdir(parents=True, exist_ok=True)
        module = ".".join(("qs", *relative.parts))
        entries = [f"module {module}"]
        for name in files:
            source = directory / name
            copy = module_dir / name
            shutil.copyfile(source, copy)
            if not name.endswith(".qml"):
                continue
            copies[str(copy)] = source
            if relative.parts:
                singleton = "pragma Singleton" in source.read_text(encoding="utf-8")
                entries.append(f"{'singleton ' if singleton else ''}{name[:-4]} 1.0 {name}")
        (module_dir / "qmldir").write_text("\n".join(entries) + "\n", encoding="utf-8")
    return copies


def build_quickshell_overlay(target):
    """Copy Quickshell submodules whose qmldir lacks `depends Quickshell`, adding it."""
    installed = QT_QML / "Quickshell"
    for qmldir in installed.rglob("qmldir"):
        module_dir = qmldir.parent
        lines = qmldir.read_text(encoding="utf-8").splitlines()
        if module_dir == installed or "depends Quickshell" in lines:
            continue
        overlay = target / module_dir.relative_to(QT_QML)
        overlay.mkdir(parents=True, exist_ok=True)
        for entry in module_dir.iterdir():
            if entry.is_file() and entry.name != "qmldir":
                (overlay / entry.name).symlink_to(entry)
        # `prefer` redirects to compiled-in resources that tooling cannot read.
        kept = [line for line in lines if not line.startswith("prefer ")]
        (overlay / "qmldir").write_text("\n".join([*kept, "depends Quickshell"]) + "\n", encoding="utf-8")


def run_qmllint(qmllint, files, imports, report):
    command = [qmllint, "--bare", "--json", str(report)]
    for path in [*imports, QT_QML]:
        command += ["-I", str(path)]
    subprocess.run(
        command + [str(path) for path in files],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return json.loads(report.read_text(encoding="utf-8"))["files"]


def main():
    qmllint = find_tool("qmllint")
    findings = []
    with tempfile.TemporaryDirectory(prefix="minishell-lint-") as directory:
        temporary = Path(directory)
        copies = build_module_tree(temporary / "shell")
        build_quickshell_overlay(temporary / "overlay")
        overlay = temporary / "overlay"
        runs = [
            (sorted((temporary / "shell").rglob("*.qml")), [overlay, temporary / "shell"]),
            (sorted((ROOT / "tests").glob("*.qml")), [overlay, ROOT / "tests/imports"]),
        ]
        for index, (files, imports) in enumerate(runs):
            report = temporary / f"report-{index}.json"
            for result in run_qmllint(qmllint, files, imports, report):
                source = Path(copies.get(result["filename"], result["filename"])).resolve()
                for warning in result.get("warnings", []):
                    findings.append((source.relative_to(ROOT), warning))

    for source, warning in sorted(findings, key=lambda item: (str(item[0]), item[1].get("line") or 0)):
        location = f"{source}:{warning.get('line', 0)}:{warning.get('column', 0)}"
        print(f"{location}: {warning['type']}: {warning['message']} [{warning.get('id', 'general')}]")
    if findings:
        print(f"qmllint: {len(findings)} finding(s)")
        return 1
    print("qmllint: no findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
