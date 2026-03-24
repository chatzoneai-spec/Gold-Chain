#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

run_generate() {
  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    "$ROOT_DIR/.venv/bin/python" -m scripts.generate "$@"
  elif command -v poetry >/dev/null 2>&1; then
    poetry run python -m scripts.generate "$@"
  else
    python3 -m scripts.generate "$@"
  fi
}

cleanup() {
  run_generate recover >/dev/null 2>&1 || true
}

trap cleanup EXIT

run_generate dev
cp genesis-dev.json genesis-roughnet.json
