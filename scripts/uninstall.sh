#!/usr/bin/env bash
# Stop and remove the systemd --user service, and optionally the installed
# files. Usage: scripts/uninstall.sh [--purge] [--remove-all]
set -euo pipefail

SERVICE_NAME="sop-writer"
PURGE=0
REMOVE_ALL=0

log() { printf '\033[1;34m[uninstall]\033[0m %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE=1; shift ;;
    --remove-all) REMOVE_ALL=1; shift ;;
    -h|--help)
      cat <<EOF
Usage: uninstall.sh [--purge] [--remove-all]
  (no flags)     Stop and remove the systemd service only; source files untouched.
  --purge        Also remove node_modules/ and .next/ build artifacts.
  --remove-all   Also delete the entire project directory (asks for confirmation).
EOF
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v systemctl >/dev/null 2>&1 && systemctl --user list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "$SERVICE_NAME"; then
  log "Stopping and disabling systemd --user service: $SERVICE_NAME"
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/${SERVICE_NAME}.service"
  systemctl --user daemon-reload
else
  log "No systemd service found, nothing to stop."
fi

if [[ "$PURGE" -eq 1 || "$REMOVE_ALL" -eq 1 ]]; then
  log "Removing node_modules and .next build output"
  rm -rf "$REPO_DIR/node_modules" "$REPO_DIR/.next"
fi

if [[ "$REMOVE_ALL" -eq 1 ]]; then
  if [[ -r /dev/tty ]]; then
    read -rp "This permanently deletes $REPO_DIR (including .env.local). Type the full path to confirm: " CONFIRM </dev/tty || true
  else
    CONFIRM=""
  fi
  if [[ "$CONFIRM" == "$REPO_DIR" ]]; then
    rm -rf "$REPO_DIR"
    log "Removed $REPO_DIR"
  else
    log "Confirmation did not match (or no terminal available) — leaving $REPO_DIR in place."
  fi
fi

log "Done."
