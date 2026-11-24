# Tracked files deleted in the working tree are skipped.
PYTHON_FILES := $(wildcard $(shell git ls-files -co --exclude-standard -- '*.py'))
SHELL_FILES  := $(wildcard $(shell git ls-files -co --exclude-standard -- '*.sh'))

.PHONY: check fmt fmt-check lint test

check: fmt-check lint test

fmt:
	tools/format.sh
	ruff format $(PYTHON_FILES)

fmt-check:
	tools/format.sh --check
	ruff format --check $(PYTHON_FILES)

lint:
	python3 tools/lint.py
	shellcheck $(SHELL_FILES)
	ruff check $(PYTHON_FILES)

test:
	tests/run.sh
