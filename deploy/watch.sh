#!/usr/bin/env bash
# Auto-deploy loop, run under pm2 as "autodeploy".
cd "$(dirname "$0")/.."
while true; do bash deploy/deploy.sh || true; sleep 20; done
