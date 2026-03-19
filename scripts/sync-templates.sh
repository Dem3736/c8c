#!/bin/bash
set -euo pipefail

SRC="../c8c-ai/public/hub"
DST="src/main/lib/templates"

if [ ! -d "$SRC" ]; then
  echo "Error: Source directory $SRC not found"
  echo "Make sure c8c-ai repo is checked out alongside chain-runner"
  exit 1
fi

cp "$SRC"/*.yaml "$DST"/
echo "Synced $(ls "$DST"/*.yaml | wc -l | tr -d ' ') templates from $SRC → $DST"
