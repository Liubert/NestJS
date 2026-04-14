#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# dev-setup.sh — one-time local development setup (macOS / Homebrew)
#
# What it does:
#   1. Checks / installs Homebrew
#   2. Checks / installs PostgreSQL 15 via Homebrew
#   3. Starts PostgreSQL service
#   4. Creates DB user and database (reads from .env.local or .env)
#   5. Runs npm install for backend and admin-ui
#   6. Runs database migrations
#   7. Prints summary
#
# Usage:
#   chmod +x dev-setup.sh
#   ./dev-setup.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
error()   { echo -e "${RED}[setup]${NC} $*"; }

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
  warn "Consider copying .env.local.example to .env.local with localhost defaults"
else
  error "No .env.local or .env found."
  error "Copy .env.local.example to .env.local and fill in your values:"
  error "  cp .env.local.example .env.local"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ecom}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"

# ─── Sanity: warn if DB_HOST is not localhost ─────────────────────
if [[ "$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1" ]]; then
  warn "DB_HOST is set to '${DB_HOST}' (expected 'localhost' for local dev)."
  warn "If you copied from Docker .env, update DB_HOST=localhost in .env.local"
fi

# ─── Step 1: Homebrew ────────────────────────────────────────────
info "Checking Homebrew..."
if command -v brew &>/dev/null; then
  success "Homebrew is installed."
else
  warn "Homebrew not found. Installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  success "Homebrew installed."
fi

# ─── Step 2: PostgreSQL ──────────────────────────────────────────
info "Checking PostgreSQL..."
if command -v psql &>/dev/null; then
  PG_VERSION=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
  success "PostgreSQL is installed (version ${PG_VERSION})."
else
  info "Installing PostgreSQL 15 via Homebrew..."
  brew install postgresql@15
  # Add to PATH if not already there
  PG_BIN="$(brew --prefix postgresql@15)/bin"
  if ! echo "$PATH" | grep -q "$PG_BIN"; then
    warn "Adding PostgreSQL to PATH for this session."
    export PATH="$PG_BIN:$PATH"
    warn "To make this permanent, add to your shell profile:"
    warn "  export PATH=\"$PG_BIN:\$PATH\""
  fi
  success "PostgreSQL 15 installed."
fi

# ─── Step 3: Start PostgreSQL ────────────────────────────────────
info "Ensuring PostgreSQL service is running..."
if brew services list 2>/dev/null | grep -q "postgresql.*started"; then
  success "PostgreSQL service is already running."
else
  # Try both versioned and unversioned service names
  if brew services list 2>/dev/null | grep -q "postgresql@15"; then
    brew services start postgresql@15 2>/dev/null || true
  elif brew services list 2>/dev/null | grep -q "postgresql@16"; then
    brew services start postgresql@16 2>/dev/null || true
  else
    brew services start postgresql 2>/dev/null || true
  fi
  sleep 2
  # Verify it's running
  if pg_isready -h localhost -p "${DB_PORT}" &>/dev/null; then
    success "PostgreSQL service started."
  else
    warn "PostgreSQL may not have started correctly. Check: brew services list"
  fi
fi

# ─── Step 4: Create DB user and database ─────────────────────────
info "Setting up database user and database..."

# Check if we can connect as the DB_USER
if psql -h localhost -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "SELECT 1;" &>/dev/null; then
  success "Database user '${DB_USER}' exists and is accessible."
else
  # Try creating the user via the default superuser (usually the macOS username)
  info "Creating database user '${DB_USER}'..."
  if createuser -h localhost -p "${DB_PORT}" -s "${DB_USER}" 2>/dev/null; then
    success "Created superuser '${DB_USER}'."
  else
    warn "Could not create user '${DB_USER}' automatically."
    warn "You may need to create it manually:"
    warn "  createuser -s ${DB_USER}"
  fi

  # Set password if DB_PASS is provided and not empty.
  # Escape single quotes in password to prevent SQL injection.
  if [[ -n "${DB_PASS}" ]]; then
    ESCAPED_PASS="${DB_PASS//\'/\'\'}"
    psql -h localhost -p "${DB_PORT}" -d postgres -c \
      "ALTER USER ${DB_USER} WITH PASSWORD '${ESCAPED_PASS}';" 2>/dev/null || \
      psql -h localhost -p "${DB_PORT}" -U "$(whoami)" -d postgres -c \
        "ALTER USER ${DB_USER} WITH PASSWORD '${ESCAPED_PASS}';" 2>/dev/null || \
      warn "Could not set password for '${DB_USER}'. Set it manually if needed."
  fi
fi

# Create database if it doesn't exist
if psql -h localhost -p "${DB_PORT}" -U "${DB_USER}" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
  success "Database '${DB_NAME}' already exists."
else
  info "Creating database '${DB_NAME}'..."
  if createdb -h localhost -p "${DB_PORT}" -U "${DB_USER}" -O "${DB_USER}" "${DB_NAME}" 2>/dev/null; then
    success "Database '${DB_NAME}' created."
  else
    # Fallback: try with macOS username
    createdb -h localhost -p "${DB_PORT}" -O "${DB_USER}" "${DB_NAME}" 2>/dev/null || {
      error "Failed to create database '${DB_NAME}'."
      error "Create it manually:"
      error "  createdb -U ${DB_USER} ${DB_NAME}"
      exit 1
    }
    success "Database '${DB_NAME}' created."
  fi
fi

# ─── Step 5: Node.js version check ──────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install Node.js 22+ first."
  error "  brew install node@22"
  exit 1
fi

NODE_MAJOR=$(node -v | grep -oE '^v([0-9]+)' | tr -d 'v')
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js ${NODE_MAJOR} detected — version 22+ is required."
  error "  brew install node@22"
  exit 1
fi
success "Node.js $(node -v) is installed."

# ─── Step 6: npm install ─────────────────────────────────────────
info "Installing backend dependencies..."
npm install
success "Backend dependencies installed."

if [[ -d "admin-ui" ]]; then
  info "Installing admin-ui dependencies..."
  (cd admin-ui && npm install)
  success "Admin UI dependencies installed."
fi

# ─── Step 7: Run migrations ──────────────────────────────────────
info "Running database migrations..."
if npm run migration:run; then
  success "Migrations completed."
else
  error "Migration failed. Check your database connection settings."
  error "DB_HOST=${DB_HOST} DB_PORT=${DB_PORT} DB_NAME=${DB_NAME} DB_USER=${DB_USER}"
  exit 1
fi

# ─── Summary ─────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Local development setup complete!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}PostgreSQL:${NC}  localhost:${DB_PORT} / ${DB_NAME}"
echo -e "  ${BLUE}DB User:${NC}     ${DB_USER}"
echo -e "  ${BLUE}Node.js:${NC}     $(node -v)"
echo -e "  ${BLUE}npm:${NC}         $(npm -v)"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "    1. Copy env file if you haven't:"
echo -e "       ${CYAN}cp .env.local.example .env.local${NC}"
echo -e "    2. Start the dev servers:"
echo -e "       ${CYAN}./dev.sh${NC}           # API + Admin UI"
echo -e "       ${CYAN}./dev.sh --api-only${NC} # API only"
echo -e "       ${CYAN}make dev-local${NC}      # same as ./dev.sh"
echo ""
echo -e "  ${YELLOW}RabbitMQ (optional):${NC}"
echo -e "    If you need message queue features locally:"
echo -e "       ${CYAN}brew install rabbitmq && brew services start rabbitmq${NC}"
echo -e "    The API starts fine without it — connection errors are non-fatal."
echo ""
