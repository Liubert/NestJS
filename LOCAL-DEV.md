# Local Development (without Docker)

Run the project locally without Docker to save ~2-2.5 GB RAM.

## Prerequisites

- **Node.js 22+**
- **PostgreSQL 15+** (via Homebrew or other)

## First-time setup

```bash
# 1. Copy env template and fill in your values
cp .env.local.example .env.local

# 2. Run the setup script (installs PostgreSQL, creates DB, npm install, migrations)
./dev-setup.sh
# or
make dev-setup-local
```

The setup script will:
- Install PostgreSQL 15 via Homebrew (if missing)
- Start the PostgreSQL service
- Create the database user and database
- Run `npm install` for backend and admin-ui
- Run database migrations

## Daily development

```bash
# Start API (port 7000) + Admin UI (port 7010)
./dev.sh
# or
make dev-local

# Start API only
./dev.sh --api-only
# or
make dev-local-api

# Skip migrations (faster restart)
./dev.sh --skip-migrate
```

Press **Ctrl+C** to stop all services.

## Access URLs

| Service   | URL                          |
|-----------|------------------------------|
| API       | http://localhost:7000        |
| Swagger   | http://localhost:7000/api-docs |
| Admin UI  | http://localhost:7010        |

## Flags

| Flag              | Description                          |
|-------------------|--------------------------------------|
| `--api-only`      | Start NestJS API only (skip admin-ui)|
| `--skip-migrate`  | Skip database migrations on start    |
| `-h`, `--help`    | Show help                            |

## How it works

- **API**: `npm run start:dev` (NestJS watch mode with auto-reload on file changes)
- **Admin UI**: `npm run dev` (Vite HMR with instant browser refresh)
- **Database**: PostgreSQL via Homebrew (`brew services start postgresql@15`)
- **Environment**: reads `.env.local` first, falls back to `.env`

## Port convention

| Mode   | API  | Admin UI | Notes                   |
|--------|------|----------|-------------------------|
| Docker | 8080 | 3010     | via `docker compose`    |
| Local  | 7000 | 7010     | via `./dev.sh`          |

## Troubleshooting

**Port already in use**
```bash
# Check what's using the port
lsof -iTCP:7000 -sTCP:LISTEN
# If Docker containers are running, stop them first
docker compose down
```

**PostgreSQL not running**
```bash
brew services start postgresql@15
# Verify
pg_isready -h localhost -p 5432
```

**DB_HOST is 'postgres' error**
Your `.env.local` may still have the Docker hostname. Change `DB_HOST=postgres` to `DB_HOST=localhost`.

**Stale node_modules**
If `package-lock.json` changed, re-run `npm install` (both root and `admin-ui/`).

## Docker vs Local

Both approaches coexist. Docker files (compose.yml, Dockerfile) are unchanged and still used for CI/CD and stage deployment. The local setup is an alternative for daily development only.
