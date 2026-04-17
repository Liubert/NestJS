# Localization Platform

Self-hosted translation management system. Stores, serves, and quality-checks translations for frontend, mobile, and backend applications. Drop-in replacement for [Locize](https://www.locize.app/) — same JSON format, only the URL changes.

## Architecture

```
┌──────────────────┐    SSE     ┌──────────────────────────────────────────┐
│    Admin UI      │◀───────────│                 API (NestJS :8080)       │
│  (React + Vite)  │───────────▶│                                          │
│     :3010        │   REST     │  ┌─────────────────┐ ┌────────────────┐  │
└──────────────────┘            │  │ Auto-Translate   │ │ Quality Worker │  │
                                │  │ Worker (in-proc) │ │   (in-proc)    │  │
                                │  └────────┬────────┘ └───────┬────────┘  │
                                └───────────┼──────────────────┼───────────┘
                                            │                  │
                                            ▼                  ▼
                                   ┌──────────────────────────────────────┐
                                   │         Google Gemini AI              │
                                   │        (gemini-2.0-flash)             │
                                   │                                       │
                                   │  • bulk translate (all target langs)  │
                                   │  • quality scoring (1–100 per value)  │
                                   │  • source grammar check               │
                                   └──────────────────────────────────────┘

                    ┌────────────────┐
                    │ PostgreSQL 15  │  LISTEN/NOTIFY for SSE event bus
                    │     :5432      │  between workers and Admin UI
                    └────────────────┘

┌──────────────────────────────────────┐
│           MCP Server                 │
│    (localization-mcp-server)         │
│    npm i localization-mcp-server     │
│                                      │
│  Claude ──▶ 21 tools ──▶ API :8080   │
└──────────────────────────────────────┘
```

| Component | Description |
|-----------|-------------|
| **API** | NestJS REST API. Auth, translation CRUD, AI translate, SSE real-time updates, import/export. Swagger at `/api-docs`. |
| **Admin UI** | React + Ant Design SPA. Real-time updates via SSE (no polling). Manage translations, projects, users, AI config. |
| **Auto-Translate Worker** | In-process background worker. Polls for keys marked `pending_auto_translate`, calls Gemini to translate into all target locales. |
| **Quality Worker** | In-process background worker. Scores each translation 1–100 via Gemini (accuracy, fluency, context fit). Also checks source English for grammar quality. |
| **PostgreSQL** | All data + inter-process communication via `LISTEN/NOTIFY` (SSE event bus between workers and Admin UI). |
| **MCP Server** | npm package for Claude. 21 tools for reading/writing translations. Production writes blocked by design. |

## Prerequisites

- Node.js 22+
- Docker & Docker Compose (or local PostgreSQL 15+)
- Google Gemini API key (for AI features)

## Quick Start

```bash
# 1. Clone and configure
git clone https://gitlab.com/lfedyshyn/Locale-Engine.git
cd Locale-Engine
cp .env.example .env
# Edit .env — set JWT_SECRET, DB_PASS, GEMINI_API_KEY

# 2. Build and start everything (DB + API + quality worker)
make init

# 3. Start Admin UI (separate terminal)
cd admin-ui && npm install && npm run dev
# Open http://localhost:3010
```

### Development (Docker)

```bash
make dev            # Start dev stack (hot-reload)
make dev-build      # Rebuild and start (after package.json changes)
make dev-down       # Stop
make dev-logs       # Follow logs
make dev-ps         # Container status
make migrate        # Run DB migrations
make seed           # Seed test data
make reset          # Reset DB and re-seed (destroys data)
```

### Development (no Docker)

```bash
make dev-setup-local   # One-time: install PostgreSQL, deps, run migrations
make dev-local         # Start API + Admin UI
make dev-local-api     # Start API only
```

### Tests

```bash
npm test                                    # All tests
npx jest --testPathPattern="<pattern>"      # Specific test
```

### Lint

```bash
npm run lint          # Backend (auto-fix)
npm run lint:check    # Backend (check only)
cd admin-ui && npm run lint     # Frontend
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PORT` | No | API port (default: 3000, exposed as 8080 via Docker) |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | No | PostgreSQL port (default: 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASS` | Yes | Database password |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |

## MCP Integration (Claude)

The platform ships with an [MCP server](https://www.npmjs.com/package/localization-mcp-server) that lets Claude read and write translations directly.

### Setup

1. **Generate an API token** in Admin UI (API Tokens page)

2. **Add to Claude config** (`~/.claude.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "localization": {
      "command": "npx",
      "args": ["-y", "localization-mcp-server"],
      "env": {
        "BACKEND_URL": "http://localhost:8080",
        "MCP_TOKEN": "lmcp_your_token_here"
      }
    }
  }
}
```

3. **Verify**: ask Claude to list projects — it should return your project list.

### What Claude Can Do

- Browse projects, namespaces, locales, and translations
- Edit translations in sandbox (draft mode)
- Run AI translation and quality checks
- View diffs between sandbox and production
- Validate translations before push
- **Cannot** push to production — requires human approval in Admin UI

### Tips

- Give Claude context about the target project and its domain for better translations
- Frontend and mobile integrations typically succeed on the first attempt
- Backend integrations (error messages, emails) may need more guidance

## API

Full API documentation is available at `/api-docs` (Swagger UI) when the server is running.

### Public Endpoints (Locize-compatible)

```
GET /:projectSlug/:namespace/:locale    — Serve translations JSON
GET /:projectSlug/locales               — List project locales
```

### Protected Endpoints (JWT required)

```
POST   /auth/login                      — Get JWT token
POST   /auth/forgot-password            — Request password reset
POST   /auth/reset-password             — Reset password

GET    /translations/projects           — List projects
POST   /translations/projects           — Create project
GET    /translations/projects/:slug     — Project details
DELETE /translations/projects/:slug     — Delete project

POST   /translations/ai-translate       — AI translation via Gemini
POST   /translations/ai-quality-check   — Quality check
POST   /translations/import             — ZIP import
```

## Deployment

CI/CD pipelines are in `.github/workflows/`:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `pr-checks.yml` | Pull request | Lint, tests, build validation |
| `build-and-stage.yml` | Push to `develop` | Build Docker images → GHCR → deploy to staging |
| `deploy-prod.yml` | Manual | Deploy to production |

## License

Private. Internal use only.
