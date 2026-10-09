#!/usr/bin/env bash
#
# ServerUI one-line installer (self-hosted web UI via Docker Compose).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Real-Yash/serverui/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Real-Yash/serverui/main/install.sh | bash -s -- --version v0.2.0 --dir ~/.serverui
#
# (https://install.serverui.dev will serve this same file once DNS is live.)
#
# What it does:
#   1. Checks for curl, git, docker (Compose v2) and a running Docker daemon.
#   2. Clones (or updates) the ServerUI repo at the requested tag/branch.
#   3. Creates .env from .env.example, generating SERVERUI_CREDENTIAL_ENCRYPTION_KEY
#      and a random POSTGRES_PASSWORD when still set to the example default.
#   4. Runs `docker compose up -d --build` and polls /healthz until ready.
#
set -euo pipefail

REPO_URL="${SERVERUI_REPO_URL:-https://github.com/rakhechashubham/serverui.git}"
# NOTE: the default above is the upstream repo (stable tags for end users).
# This script itself is currently fetched from a fork's raw URL until it is
# merged upstream — override with SERVERUI_REPO_URL to install from a fork.
VERSION="${SERVERUI_VERSION:-main}"
INSTALL_DIR="${SERVERUI_DIR:-$HOME/serverui}"
WEB_PORT="${WEB_PORT:-3000}"
HTTP_PORT="${HTTP_PORT:-8080}"
ASSUME_YES=false
DO_UNINSTALL=false

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ ! -t 1 ]; then
  GREEN=''; YELLOW=''; RED=''; NC=''
fi

log_info()  { printf "%b\n" "${GREEN}[serverui]${NC} $*"; }
log_warn()  { printf "%b\n" "${YELLOW}[serverui] WARNING:${NC} $*"; }
log_error() { printf "%b\n" "${RED}[serverui] ERROR:${NC} $*" >&2; }

usage() {
  cat <<EOF
ServerUI installer (Docker Compose self-host)

Usage: install.sh [options]

Options:
  -h, --help            Show this help and exit
  -v, --version <ref>   Git tag/branch to install (default: main).
                        Example: v0.2.0. Also via SERVERUI_VERSION.
  -d, --dir <path>      Install directory (default: \$HOME/serverui).
                        Also via SERVERUI_DIR.
      --web-port <port> Host port for the web UI (default: 3000, via WEB_PORT)
      --api-port <port> Host port for the Go API (default: 8080, via HTTP_PORT)
  -y, --yes             Skip the confirmation prompt for non-empty dirs
      --uninstall       Stop the stack (docker compose down) and exit

Examples:
  curl -fsSL https://raw.githubusercontent.com/Real-Yash/serverui/main/install.sh | bash
  curl -fsSL .../install.sh | bash -s -- --version v0.2.0 --dir ~/.serverui
  ./install.sh --web-port 3100 --api-port 8180

Requirements: bash, curl, git, Docker 28.x + Compose v2, Docker daemon running.
OS: Linux and macOS fully supported; Windows via WSL2 or Git Bash + Docker Desktop.
After install: Web http://localhost:<web-port>  API http://localhost:<api-port>/healthz
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--version)
      [ -n "${2:-}" ] || { log_error "--version needs a value (e.g. v0.2.0)"; exit 1; }
      VERSION="$2"; shift 2 ;;
    -d|--dir)
      [ -n "${2:-}" ] || { log_error "--dir needs a value"; exit 1; }
      INSTALL_DIR="$2"; shift 2 ;;
    --web-port)
      [ -n "${2:-}" ] || { log_error "--web-port needs a value"; exit 1; }
      WEB_PORT="$2"; shift 2 ;;
    --api-port)
      [ -n "${2:-}" ] || { log_error "--api-port needs a value"; exit 1; }
      HTTP_PORT="$2"; shift 2 ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    --uninstall) DO_UNINSTALL=true; shift ;;
    --) shift; break ;;
    *) log_error "Unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

# Expand a leading ~ in --dir.
case "$INSTALL_DIR" in
  "~"/*) INSTALL_DIR="$HOME/${INSTALL_DIR#"~/"}" ;;
  "~")   INSTALL_DIR="$HOME" ;;
esac

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log_error "Required command '$1' not found. Please install it and re-run."
    exit 1
  }
}

gen_hex32() {
  # 32 random bytes as 64 hex chars (AES-256-GCM key).
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
    echo
  fi
}

gen_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '/+=\n'
  else
    head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-24
    echo
  fi
}

set_env_key() {
  # set_env_key FILE KEY VALUE — replace KEY=... line or append it.
  local file="$1" key="$2" value="$3"
  if grep -Eq "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

port_in_use() {
  # Pure-bash TCP probe: no ss/lsof needed (works on Linux, macOS, Git Bash).
  local port="$1"
  (echo > "/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

case "${OSTYPE:-}" in
  msys*|cygwin*|win32*)
    log_warn "Windows detected: run this from Git Bash or WSL2 with Docker Desktop running."
    log_warn "Native PowerShell/cmd is not supported (a future install.ps1 may cover it)."
    ;;
esac

require_cmd curl
require_cmd git
require_cmd docker

if ! docker info >/dev/null 2>&1; then
  log_error "Docker is installed but the daemon is not running."
  log_error "Start Docker Desktop (or dockerd), then re-run."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  log_error "Docker Compose v2 is required ('docker compose version' failed)."
  log_error "Upgrade to Docker 28.x / Compose v2, then re-run."
  exit 1
fi

if port_in_use "$WEB_PORT"; then
  log_warn "Port $WEB_PORT looks occupied. The web UI may fail to start — use --web-port to pick another."
fi
if port_in_use "$HTTP_PORT"; then
  log_warn "Port $HTTP_PORT looks occupied. The API may fail to start — use --api-port to pick another."
fi

log_info "ServerUI install: version=${VERSION} dir=${INSTALL_DIR} web=:${WEB_PORT} api=:${HTTP_PORT}"

if [ "$DO_UNINSTALL" = true ]; then
  if [ -d "$INSTALL_DIR/deploy/docker" ]; then
    ( cd "$INSTALL_DIR" && docker compose -f deploy/docker/docker-compose.yml --env-file .env down ) || \
    ( cd "$INSTALL_DIR" && docker compose -f deploy/docker/docker-compose.yml down )
    log_info "Stack stopped. Data volume 'serverui-postgres-data' was kept."
    log_info "Full wipe (destroys DB): docker volume rm serverui-postgres-data"
  else
    log_error "Nothing to uninstall: $INSTALL_DIR/deploy/docker not found."
    exit 1
  fi
  exit 0
fi

# --- Fetch the repo (clone or update) ---
if [ -d "$INSTALL_DIR/.git" ]; then
  log_info "Existing checkout found, updating to ${VERSION}..."
  git -C "$INSTALL_DIR" fetch --tags origin
  git -C "$INSTALL_DIR" checkout "$VERSION"
  git -C "$INSTALL_DIR" pull --ff-only origin "$VERSION" || true
elif [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
  if [ "$ASSUME_YES" = false ] && [ -t 0 ]; then
    printf "Directory %s exists and is not empty. Clone into it anyway? [y/N] " "$INSTALL_DIR"
    read -r answer
    case "$answer" in
      [yY]|[yY][eE][sS]) ;;
      *) log_error "Aborted."; exit 1 ;;
    esac
  fi
  log_info "Cloning ServerUI (${VERSION}) into existing dir..."
  git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$INSTALL_DIR.tmp.$$"
  cp -a "$INSTALL_DIR.tmp.$$"/. "$INSTALL_DIR"/
  rm -rf "$INSTALL_DIR.tmp.$$"
else
  log_info "Cloning ServerUI (${VERSION})..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- .env setup ---
if [ ! -f .env ]; then
  cp .env.example .env
  log_info "Created .env from .env.example"
fi

if grep -Eq '^SERVERUI_CREDENTIAL_ENCRYPTION_KEY=[[:space:]]*$' .env; then
  key="$(gen_hex32)"
  set_env_key .env SERVERUI_CREDENTIAL_ENCRYPTION_KEY "$key"
  log_info "Generated SERVERUI_CREDENTIAL_ENCRYPTION_KEY in .env"
fi

if grep -Eq '^POSTGRES_PASSWORD=example_password$' .env; then
  pw="$(gen_password)"
  set_env_key .env POSTGRES_PASSWORD "$pw"
  log_info "Generated a random POSTGRES_PASSWORD in .env (was example default)"
fi

set_env_key .env WEB_PORT "$WEB_PORT"
set_env_key .env HTTP_PORT "$HTTP_PORT"

# --- Start the stack ---
log_info "Building and starting services (first run takes a few minutes)..."
docker compose -f deploy/docker/docker-compose.yml --env-file .env up -d --build --remove-orphans

# --- Wait for health ---
log_info "Waiting for the API at http://localhost:${HTTP_PORT}/healthz ..."
ready=""
for ((i = 0; i < 60; i++)); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/healthz" >/dev/null 2>&1; then
    ready="yes"
    break
  fi
  sleep 2
done

if [ -z "$ready" ]; then
  log_error "API did not become healthy in ~120s. Recent logs:"
  docker compose -f deploy/docker/docker-compose.yml --env-file .env logs --tail=100 || true
  exit 1
fi

web_ready=""
for ((i = 0; i < 15; i++)); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null 2>&1; then
    web_ready="yes"
    break
  fi
  sleep 2
done

if [ -n "$web_ready" ]; then
  log_info "Web UI is responding too."
else
  log_warn "API is up but the web UI on :${WEB_PORT} is not responding yet — give it a minute, then check 'docker compose logs web'."
fi

cat <<EOF

${GREEN}ServerUI is running.${NC}

  Web:    http://localhost:${WEB_PORT}
  API:    http://localhost:${HTTP_PORT}/healthz

  Install dir: ${INSTALL_DIR}  (version: ${VERSION})
  Update:      curl -fsSL https://raw.githubusercontent.com/Real-Yash/serverui/main/install.sh | bash -s -- --dir ${INSTALL_DIR}
  Logs:        docker compose -f deploy/docker/docker-compose.yml --env-file .env logs --tail=100
  Stop:        docker compose -f deploy/docker/docker-compose.yml --env-file .env down

Add a server in the UI (name, host, SSH port, username, password or private key).
EOF
