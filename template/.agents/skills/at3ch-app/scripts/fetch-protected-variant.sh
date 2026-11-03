#!/usr/bin/env bash
# Downloads the protected variant of create-at3ch-app (variant.json, files/,
# append/) into a folder, to copy from, and prints the folder.
#
#   fetch-protected-variant.sh [dest]   # dest defaults to a new temp folder
#
# AT3CH_VERSION picks the release (default latest). AT3CH_TARBALL reads a
# local package .tgz instead of npm.
set -euo pipefail

dest="${1:-$(mktemp -d)}"
mkdir -p "$dest"

missing() {
  echo "No protected variant in that release of create-at3ch-app (0.3.0 or later has one)." >&2
  exit 1
}

if [ -n "${AT3CH_TARBALL:-}" ]; then
  tar -xzf "$AT3CH_TARBALL" -C "$dest" --strip-components=3 \
    package/variants/protected 2>/dev/null || missing
else
  version="${AT3CH_VERSION:-latest}"
  url=$(curl -fsSL "https://registry.npmjs.org/create-at3ch-app/$version" |
    bun -e 'console.log((await Bun.stdin.json()).dist.tarball)')
  curl -fsSL "$url" | tar -xz -C "$dest" --strip-components=3 \
    package/variants/protected 2>/dev/null || missing
fi

[ -f "$dest/variant.json" ] || missing
echo "$dest"
