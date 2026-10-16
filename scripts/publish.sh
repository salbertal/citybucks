#!/bin/bash
# Publishes game/ to GitHub Pages (branch gh-pages) of the "origin" remote.
# Requires: committed working tree, `gh` logged in. Site: https://<user>.github.io/<repo>/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain -- game)" ]; then
    echo "game/ tiene cambios sin commitear. Commiteá primero." >&2
    exit 1
fi

git push origin main
# gh-pages = contents of game/ at the repo root
SPLIT=$(git subtree split --prefix game main)
git push --force origin "$SPLIT:refs/heads/gh-pages"

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# Enable Pages on first run (ignore "already exists")
gh api -X POST "repos/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true

URL=$(gh api "repos/$REPO/pages" -q .html_url)
echo "Publicado: $URL  (puede tardar 1-2 minutos en actualizarse)"
