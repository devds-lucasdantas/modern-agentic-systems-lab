#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF_DIR="$ROOT_DIR/.reference/interrupt26-deepagents"
PIN="3d3287cf1e51250934c11aff182d90ccfaf0e66d"
URL="https://github.com/langchain-samples/interrupt26-deepagents.git"

mkdir -p "$ROOT_DIR/.reference"

if [[ -d "$REF_DIR/.git" ]]; then
  git -C "$REF_DIR" fetch --all --tags --prune
else
  git clone "$URL" "$REF_DIR"
fi

git -C "$REF_DIR" checkout --detach "$PIN"

echo
echo "Reference restored:"
git -C "$REF_DIR" --no-pager log -1 --oneline --decorate
echo
echo "Next:"
echo "  cd $REF_DIR"
echo "  uv sync --locked"
