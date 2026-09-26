#!/usr/bin/env bash
cd "$(dirname "$0")/.."
pm2 delete autodeploy >/dev/null 2>&1 || true
pm2 start deploy/watch.sh --name autodeploy --interpreter bash
pm2 save
pm2 startup 2>/dev/null | tail -1
echo "autodeploy running: pushes to main go live within ~40s"
