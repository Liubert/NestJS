#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# dev.sh — local development launcher (no Docker)
#
# Starts NestJS API (port 3000) and optionally Admin UI (port 3010).
# Reads environment from .env.local first, falling back to .env.
#
# Usage:
#   ./dev.sh                 # Start API + Admin UI
#   ./dev.sh --api-only      # Start API only
#   ./dev.sh --skip-migrate  # Skip running migrations
#   ./dev.sh --api-only --skip-migrate
#
# Press Ctrl+C to stop all services gracefully.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[dev]${NC} $*"; }
success() { echo -e "${GREEN}[dev]${NC} $*"; }
warn()    { echo -e "${YELLOW}[dev]${NC} $*"; }
error()   { echo -e "${RED}[dev]${NC} $*"; }

# ─── Parse flags ──────────────────────────────────────────────────
API_ONLY=false
SKIP_MIGRATE=false

for arg in "$@"; do
  case "$arg" in
    --api-only)      API_ONLY=true ;;
    --skip-migrate)  SKIP_MIGRATE=true ;;
    --help|-h)
      echo "Usage: ./dev.sh [--api-only] [--skip-migrate]"
      echo ""
      echo "  --api-only       Start NestJS API only (skip admin-ui)"
      echo "  --skip-migrate   Skip database migrations"
      echo "  -h, --help       Show this help"
      exit 0
      ;;
    *)
      error "Unknown flag: $arg"
      echo "Usage: ./dev.sh [--api-only] [--skip-migrate]"
      exit 1
      ;;
  esac
done

# ─── Resolve project root (directory containing this script) ─────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Load environment ────────────────────────────────────────────
load_env() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -a
    while IFS='=' read -r key value; do
      [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
      key="$(echo "$key" | xargs)"
      # Strip surrounding quotes from value (handles "val" and 'val')
      value="${value#\"}" ; value="${value%\"}"
      value="${value#\'}" ; value="${value%\'}"
      if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        export "$key"="$value"
      fi
    done < "$env_file"
    set +a
    return 0
  fi
  return 1
}

if load_env ".env.local"; then
  info "Loaded environment from .env.local"
elif load_env ".env"; then
  info "Loaded environment from .env"
  warn "Using .env — consider creating .env.local with localhost defaults:"
  warn "  cp .env.local.example .env.local"
else
  error "No .env.local or .env found."
  error "Copy the example and fill in your values:"
  error "  cp .env.local.example .env.local"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ecom}"
APP_PORT="${APP_PORT:-3000}"
ADMIN_UI_PORT=3010

# ─── Warn if DB_HOST looks like Docker service name ──────────────
if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]]; then
  warn "DB_HOST is '${DB_HOST}' — this looks like a Docker service name."
  warn "For local dev, set DB_HOST=localhost in .env.local"
  warn "Continuing anyway (will likely fail to connect)..."
fi

# ─── Prerequisite checks ─────────────────────────────────────────
info "Running prerequisite checks..."

# Node.js version
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Run ./dev-setup.sh first."
  exit 1
fi
NODE_MAJOR=$(node -v | grep -oE '^v([0-9]+)' | tr -d 'v')
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js ${NODE_MAJOR} detected — version 22+ is required."
  exit 1
fi

# PostgreSQL running
if command -v pg_isready &>/dev/null; then
  if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" &>/dev/null; then
    error "PostgreSQL is not running on ${DB_HOST}:${DB_PORT}."
    if [[ "$(uname)" == "Darwin" ]]; then
      error "Start it with:  brew services start postgresql@15"
    else
      error "Start your PostgreSQL service and try again."
    fi
    exit 1
  fi
  success "PostgreSQL is running on ${DB_HOST}:${DB_PORT}."
else
  warn "pg_isready not found — skipping PostgreSQL health check."
  warn "Make sure PostgreSQL is running on ${DB_HOST}:${DB_PORT}."
fi

# Database exists
if command -v psql &>/dev/null; then
  DB_USER="${DB_USER:-postgres}"
  if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
    warn "Database '${DB_NAME}' does not exist."
    read -rp "$(echo -e "${YELLOW}[dev]${NC} Create it now? [Y/n] ")" CREATE_DB
    CREATE_DB="${CREATE_DB:-Y}"
    if [[ "$CREATE_DB" =~ ^[Yy]$ ]]; then
      createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" 2>/dev/null || {
        # Fallback: try without specifying user
        createdb -h "${DB_HOST}" -p "${DB_PORT}" "${DB_NAME}" 2>/dev/null || {
          error "Failed to create database '${DB_NAME}'."
          error "Create it manually:  createdb -U ${DB_USER} ${DB_NAME}"
          exit 1
        }
      }
      success "Database '${DB_NAME}' created."
    else
      error "Database '${DB_NAME}' is required. Exiting."
      exit 1
    fi
  else
    success "Database '${DB_NAME}' exists."
  fi
fi

# ─── Check for stale node_modules ────────────────────────────────
check_node_modules() {
  local dir="$1"
  local label="$2"
  if [[ ! -d "${dir}/node_modules" ]]; then
    error "${label}: node_modules not found. Run: npm install"
    if [[ "$dir" != "." ]]; then
      error "  (cd ${dir} && npm install)"
    fi
    exit 1
  fi
  # Check if package-lock.json is newer than node_modules
  if [[ -f "${dir}/package-lock.json" && "${dir}/package-lock.json" -nt "${dir}/node_modules" ]]; then
    warn "${label}: package-lock.json is newer than node_modules."
    warn "Consider running: ${dir:+cd ${dir} && }npm install"
  fi
}

check_node_modules "." "Backend"
if [[ "$API_ONLY" == "false" ]]; then
  check_node_modules "admin-ui" "Admin UI"
fi

# ─── Check for port conflicts ────────────────────────────────────
check_port() {
  local port="$1"
  local label="$2"
  if lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null; then
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | tr '\n' ' ')
    local cmd
    cmd=$(lsof -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $1}')
    error "Port ${port} (${label}) is already in use by: ${cmd} (PID: ${pids})"

    # Extra hint if it looks like Docker
    if echo "$cmd" | grep -qi "docker\|com.docker"; then
      warn "This looks like a Docker container. Stop it first:"
      warn "  docker compose down  # or stop the specific container"
    fi
    return 1
  fi
  return 0
}

PORT_CONFLICT=false

if ! check_port "${APP_PORT}" "API"; then
  PORT_CONFLICT=true
fi

if [[ "$API_ONLY" == "false" ]]; then
  if ! check_port "${ADMIN_UI_PORT}" "Admin UI"; then
    PORT_CONFLICT=true
  fi
fi

if [[ "$PORT_CONFLICT" == "true" ]]; then
  error "Resolve port conflicts before starting."
  exit 1
fi

success "All prerequisite checks passed."

# ─── Run migrations ──────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == "false" ]]; then
  info "Running database migrations..."
  if npm run migration:run; then
    success "Migrations completed."
  else
    error "Migration failed. Fix the issue or use --skip-migrate to bypass."
    exit 1
  fi
else
  info "Skipping migrations (--skip-migrate)."
fi

# ─── Process management ──────────────────────────────────────────
# Disable errexit for the process management section — background
# processes and signal handling need to tolerate non-zero exits.
set +e

API_PID=""
UI_PID=""
SHUTTING_DOWN=false

cleanup() {
  # Prevent re-entrant cleanup
  if [[ "$SHUTTING_DOWN" == "true" ]]; then
    return
  fi
  SHUTTING_DOWN=true

  echo ""
  info "Shutting down..."

  if [[ -n "$UI_PID" ]] && kill -0 "$UI_PID" 2>/dev/null; then
    info "Stopping Admin UI (PID ${UI_PID})..."
    kill "$UI_PID" 2>/dev/null || true
    wait "$UI_PID" 2>/dev/null || true
  fi

  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    info "Stopping API (PID ${API_PID})..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi

  success "All services stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ─── Start API ────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Starting local development servers${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""

info "Starting NestJS API on port ${APP_PORT}..."
# Use sed for log prefixing. When we kill sed, npm receives SIGPIPE and
# exits cleanly — no orphan processes (unlike while-read pipe approach).
API_PREFIX="$(printf "${BLUE}[api]${NC} ")"
npm run start:dev 2>&1 | sed -u "s|^|${API_PREFIX}|" &
API_PID=$!

# ─── Start Admin UI (unless --api-only) ──────────────────────────
if [[ "$API_ONLY" == "false" ]]; then
  info "Starting Admin UI on port ${ADMIN_UI_PORT}..."
  UI_PREFIX="$(printf "${MAGENTA}[ui]${NC}  ")"
  (cd admin-ui && npm run dev -- --port "${ADMIN_UI_PORT}") 2>&1 | sed -u "s|^|${UI_PREFIX}|" &
  UI_PID=$!
fi

# ─── Print access info ───────────────────────────────────────────
# Small delay so the startup output from API/UI prints first
sleep 1

echo ""
echo -e "  ${BLUE}API:${NC}       http://localhost:${APP_PORT}"
echo -e "  ${BLUE}Swagger:${NC}   http://localhost:${APP_PORT}/api-docs"
if [[ "$API_ONLY" == "false" ]]; then
  echo -e "  ${MAGENTA}Admin UI:${NC}  http://localhost:${ADMIN_UI_PORT}"
fi
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services."
echo ""

# ─── Wait for background processes ───────────────────────────────
# wait without -n for broader bash compatibility (bash <4.3 lacks wait -n)
if [[ -n "$UI_PID" ]]; then
  wait "$API_PID" "$UI_PID" 2>/dev/null || true
else
  wait "$API_PID" 2>/dev/null || true
fi

# If we reach here, a process exited — cleanup via EXIT trap
