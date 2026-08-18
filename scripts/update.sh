#!/usr/bin/env bash
# CLI equivalent of the in-app "Update Now" button (lib/update/runner.ts),
# for headless use or before the service is even running.
# Usage: scripts/update.sh   (run from inside the installed checkout)
set -euo pipefail

SERVICE_NAME="sop-writer"

log() { printf '\033[1;34m[update]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[update]\033[0m %s\n' "$*" >&2; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  err "Working tree has local changes. Commit, stash, or discard them before updating."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Fetching origin/$BRANCH"
git fetch --quiet origin

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)"

if [[ -z "$REMOTE" ]]; then
  err "No upstream origin/$BRANCH found."
  exit 1
fi

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "Already up to date ($LOCAL)."
  exit 0
fi

log "Updating ${LOCAL:0:7} -> ${REMOTE:0:7}"
git pull --ff-only

log "Installing dependencies"
npm install

log "Building"
npm run build

if command -v systemctl >/dev/null 2>&1 && systemctl --user list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "$SERVICE_NAME"; then
  log "Restarting systemd --user service: $SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
  log "Done. Check status: systemctl --user status $SERVICE_NAME"
else
  log "Done. No systemd service found — restart the app process manually (e.g. re-run 'npm run serve')."
fi
