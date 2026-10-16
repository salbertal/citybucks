#!/bin/bash
# Serves the game on http://localhost:8770 (Web Audio needs http; file:// also works).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8770}"
echo "City Bucks en http://localhost:$PORT  (Ctrl+C para cortar)"
exec python3 -m http.server "$PORT" --directory "$ROOT/game"
