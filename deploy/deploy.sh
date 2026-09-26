#!/usr/bin/env bash
# Pull latest main, rebuild, restart. Safe to run every 20s: no-op when nothing changed.
# A failed build leaves the old site running.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ] && [ -d dist ] && [ "${1:-}" != "--force" ]; then exit 0; fi
git reset -q --hard origin/main
if [ ! -d node_modules ] || ! git diff --quiet "$LOCAL" "$REMOTE" -- package-lock.json; then npm ci --no-audit --no-fund; fi
npx vite build --outDir ../dist-new --emptyOutDir >/tmp/assemble-build.log 2>&1 || { echo "BUILD FAILED, old site still up"; tail -20 /tmp/assemble-build.log; exit 1; }
rm -rf dist-old; [ -d dist ] && mv dist dist-old; mv dist-new dist; rm -rf dist-old
# reseed only when seed/VERSION changes (wipes live data!)
if [ ! -f data/assemble.db ] || [ "$(cat seed/VERSION 2>/dev/null)" != "$(cat data/.seed-version 2>/dev/null)" ]; then
  npx tsx seed/seed.ts && cp seed/VERSION data/.seed-version 2>/dev/null || true
fi
pm2 restart assemble --update-env >/dev/null 2>&1 || pm2 start ecosystem.config.cjs
pm2 save >/dev/null 2>&1 || true
echo "deployed $(git rev-parse --short HEAD) at $(date +%T)"
