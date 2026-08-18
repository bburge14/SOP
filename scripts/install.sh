#!/usr/bin/env bash
# Install SOP Writer: clone (if needed), install deps, build, and optionally
# register a systemd --user service so it starts on login/boot and can be
# restarted by the in-app "Update Now" button.
#
# Usage:
#   bash <(curl -fsSL https://raw.githubusercontent.com/bburge14/SOP/main/scripts/install.sh)
#   # or, from an existing checkout:
#   bash scripts/install.sh [--dir DIR] [--port PORT] [--no-service]
set -euo pipefail

REPO_URL="https://github.com/bburge14/SOP.git"
DEFAULT_DIR="$HOME/sop-writer"
INSTALL_DIR="$DEFAULT_DIR"
PORT="3000"
INSTALL_SERVICE=1
SERVICE_NAME="sop-writer"

log()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[install]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[install]\033[0m %s\n' "$*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-service) INSTALL_SERVICE=0; shift ;;
    -h|--help)
      cat <<EOF
Usage: install.sh [--dir DIR] [--port PORT] [--no-service]
  --dir DIR       Install location (default: $DEFAULT_DIR)
  --port PORT     Port the app listens on (default: 3000)
  --no-service    Skip creating a systemd --user service
EOF
      exit 0 ;;
    *) err "Unknown argument: $1"; exit 1 ;;
  esac
done

command -v node >/dev/null 2>&1 || { err "Node.js 18+ is required: https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "npm is required (bundled with Node.js)."; exit 1; }
command -v git  >/dev/null 2>&1 || { err "git is required."; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js 18+ required, found $(node -v)."
  exit 1
fi

# Already inside a checkout of this repo? Install in place rather than
# cloning into $INSTALL_DIR — and say so if --dir was also passed, since
# it's silently ignored in this branch.
if [[ -f package.json ]] && grep -q '"name": "sop-writer"' package.json 2>/dev/null && [[ -d .git ]]; then
  if [[ "$INSTALL_DIR" != "$DEFAULT_DIR" && "$INSTALL_DIR" != "$(pwd)" ]]; then
    warn "Running from an existing checkout — ignoring --dir $INSTALL_DIR and installing in place instead."
  fi
  INSTALL_DIR="$(pwd)"
  log "Running from an existing checkout at $INSTALL_DIR"
elif [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Found an existing checkout at $INSTALL_DIR, pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
else
  log "Cloning $REPO_URL to $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "Installing dependencies"
npm install --include=dev

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  # `[[ -r /dev/tty ]]` can be a false positive in a non-interactive/
  # sandboxed shell (the device node exists but opening it fails with
  # ENXIO) — actually try to open it instead of just checking permissions.
  # Done in a subshell so `2>/dev/null` reliably catches the failure
  # message (redirections apply left-to-right, so an unwrapped `exec
  # 3<>/dev/tty 2>/dev/null` fails before its own 2>/dev/null takes
  # effect) and so the fd change doesn't leak into this shell either way.
  HAVE_TTY=0
  if ( exec 3<>/dev/tty ) 2>/dev/null; then
    HAVE_TTY=1
  fi

  if [[ "$HAVE_TTY" -eq 1 ]]; then
    log "Configuring an LLM provider (edit .env.local later to change this)."
    read -rp "Provider [anthropic/openai/gemini/ollama] (default anthropic): " PROVIDER </dev/tty || true
    PROVIDER="${PROVIDER:-anthropic}"
    sed -i "s|^LLM_PROVIDER=.*|LLM_PROVIDER=${PROVIDER}|" .env.local

    VAR=""
    case "$PROVIDER" in
      anthropic) VAR=ANTHROPIC_API_KEY ;;
      openai) VAR=OPENAI_API_KEY ;;
      gemini) VAR=GEMINI_API_KEY ;;
      ollama) VAR="" ;;
      *) warn "Unrecognized provider \"$PROVIDER\", leaving LLM_PROVIDER as anthropic in .env.local." ;;
    esac
    if [[ -n "$VAR" ]]; then
      read -rsp "$VAR (input hidden): " KEY </dev/tty || true
      echo
      if [[ -n "${KEY:-}" ]]; then
        sed -i "s|^${VAR}=.*|${VAR}=${KEY}|" .env.local
      else
        warn "No key entered — set $VAR in .env.local before starting."
      fi
    fi
  else
    warn "No terminal detected — copied .env.example to .env.local. Edit it to set LLM_PROVIDER and an API key before starting."
  fi
else
  log ".env.local already exists, leaving it untouched"
fi

log "Building production bundle"
npm run build

if [[ "$INSTALL_SERVICE" -eq 1 ]] && command -v systemctl >/dev/null 2>&1; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SERVICE_DIR"
  NPM_BIN="$(command -v npm)"
  cat > "$SERVICE_DIR/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=SOP Writer
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$NPM_BIN run serve
Restart=on-failure
RestartSec=3
Environment=PORT=$PORT
EnvironmentFile=-$INSTALL_DIR/.env.local

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME"
  log "Installed and started as a systemd --user service: $SERVICE_NAME"
  log "Keep it running after logout/reboot with: loginctl enable-linger $USER"
  log "Logs: journalctl --user -u $SERVICE_NAME -f"
else
  [[ "$INSTALL_SERVICE" -eq 0 ]] && log "Skipping systemd service setup (--no-service)." || warn "systemctl not found — skipping service setup."
  log "Start it manually with: (cd \"$INSTALL_DIR\" && npm run serve)"
fi

log "Done. SOP Writer should be reachable at http://localhost:$PORT"
