#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

for required_file in manifest.json styles.css package.json package-lock.json src/main.ts; do
  if [[ ! -f "$required_file" ]]; then
    echo "Error: required file '$required_file' is missing." >&2
    exit 1
  fi
done

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not available in PATH." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not installed or not available in PATH." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh is not installed or not available in PATH." >&2
  exit 1
fi

is_valid_version() {
  local value="${1:-}"
  [[ -n "$value" && "$value" != "null" && "$value" != "undefined" ]]
}

read_version_with_sed() {
  sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' manifest.json | head -n1
}

read_version_with_jq() {
  command -v jq >/dev/null 2>&1 || return 1
  jq -r '.version // empty' manifest.json
}

read_version_with_python() {
  command -v python3 >/dev/null 2>&1 || return 1
  python3 -c 'import json; import sys; print(json.load(open("manifest.json", encoding="utf-8")).get("version", ""))'
}

read_version_with_node() {
  command -v node >/dev/null 2>&1 || return 1
  node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version"
}

resolve_manifest_version() {
  local version=""
  local resolver=""

  # Prefer the simplest or most common tools first. Node is only the last fallback.
  for resolver in \
    read_version_with_jq \
    read_version_with_python \
    read_version_with_sed \
    read_version_with_node; do
    version="$("$resolver" 2>/dev/null || true)"
    if is_valid_version "$version"; then
      printf '%s\n' "$version"
      return 0
    fi
  done

  return 1
}

version="$(resolve_manifest_version)" || {
  echo "Error: could not read a valid version from manifest.json with sed, jq, python3, or node." >&2
  exit 1
}

npm ci
npm run lint
npm run build

for release_file in manifest.json main.js styles.css; do
  if [[ ! -f "$release_file" ]]; then
    echo "Error: release file '$release_file' was not generated." >&2
    exit 1
  fi
done

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

cat >&2 <<'EOF'
Warning: this local release helper cannot create GitHub artifact attestations.
For Obsidian community submission, prefer pushing the matching tag and letting
.github/workflows/release.yml build, attest, and publish the release assets.
EOF

gh release create "$version" \
  manifest.json \
  main.js \
  styles.css \
  --verify-tag \
  --generate-notes \
  --title "$version"
