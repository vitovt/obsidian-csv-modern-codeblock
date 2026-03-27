#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

for required_file in manifest.json main.js styles.css; do
  if [[ ! -f "$required_file" ]]; then
    echo "Error: required file '$required_file' is missing." >&2
    exit 1
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh is not installed or not available in PATH." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed or not available in PATH." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")"

if [[ -z "$version" || "$version" == "undefined" || "$version" == "null" ]]; then
  echo "Error: could not read a valid version from manifest.json." >&2
  exit 1
fi

head_tags="$(git tag --points-at HEAD || true)"

if ! printf '%s\n' "$head_tags" | grep -Fx "$version" >/dev/null 2>&1; then
  echo "Error: HEAD must be tagged exactly '$version' before creating a release." >&2
  if [[ -n "$head_tags" ]]; then
    echo "Tags on HEAD:" >&2
    printf '  %s\n' "$head_tags" >&2
  else
    echo "No tags are present on HEAD." >&2
  fi
  exit 1
fi

gh release create "$version" \
  manifest.json \
  main.js \
  styles.css \
  --verify-tag \
  --generate-notes \
  --title "$version"
