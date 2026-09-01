#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

if ! command -v forge >/dev/null 2>&1; then
  echo "forge is required to build launch artifacts" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to generate launch genesis" >&2
  exit 1
fi

forge build --force

node scripts/generate-launch-genesis.js \
  --profile testnet \
  --output genesis-roughnet.json \
  --report launch-report-roughnet.md

echo "Generated genesis-roughnet.json (chainId 714 via launch-config/testnet.json)"
