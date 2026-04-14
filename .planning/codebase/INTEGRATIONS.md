# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Google Generative AI (Gemini):**
- Service: Google Generative AI API (Gemini 2.0 Flash)
- What it's used for: Translation generation, quality scoring, and context detection
- SDK/Client: `@google/generative-ai` (v0.24.1)
- Auth: Environment variable `GEMINI_API_KEY`
- Implementation: `src/modules/translations/ai-translate.service.ts`, `src/modules/translations/ai-config.service.ts`
- Prompt templating: Configurable via database (see `ai-config.entity`)
- Target locales: Ukrainian, Norwegian Bokmål, Swedish, Danish (hardcoded in `TARGET_LOCALES` map)
- Usage tracking: Logged to `ai_usage_logs` table via `src/modules/translations/ai-usage.service.ts`

## Data Storage

**PostgreSQL Database:**
- Provider: PostgreSQL 15 (via Docker container `postgres` service)
- Connection config: `src/config/app.config.ts`
- Connection variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
- ORM/Client: TypeORM 0.3.28
- Data Source: `src/database/data-source/data-source.ts` (configured for both dev and prod)
- Naming strategy: Snake_case (via `typeorm-naming-strategies`)
- Migrations: Located in `src/database/migrations/`
- Entities: Located in `src/modules/**/*.entity.ts`
- Synchronize: Disabled (false) - migrations required for schema changes
- Key tables:
  - `users` - User accounts with password hashes and roles
  - `translation_projects` - Project containers
  - `translation_namespaces` - Namespace groupings per project
  - `translation_keys` - Translation keys per namespace
  - `translation_values` - Actual translations (key × locale pairs)
  - `translation_locales` - Locales enabled per project
  - `project_members` - Project access control
  - `password_reset_tokens` - One-time password reset links
  - `ai_usage_logs` - Track API usage for billing
  - `quality_review_states` - Translation quality review metadata

**File Storage:**
- Provider: AWS S3 (optional, configurable)
- Configuration: `src/config/app.config.ts` (S3Config type)
- Environment variables:
  - `AWS_REGION` - AWS region code
  - `AWS_S3_BUCKET` - S3 bucket name
  - `AWS_ACCESS_KEY_ID` - IAM access key
  - `AWS_SECRET_ACCESS_KEY` - IAM secret key
- Client: `@aws-sdk/client-s3` (v3.990.0)
- Service: `src/modules/files/storage/s3-storage.service.ts`
- Operations: Presigned URL generation for upload/download (expiry: 60s for put, 300s for get)
- Fallback: If AWS credentials not provided, S3 client created without credentials (allows anon access if bucket public)

**Caching:**
- Current: None - database queries are direct via TypeORM
- Potential: Redis not currently integrated but RabbitMQ available

## Authentication & Identity

**Auth Provider:**
- Type: Custom JWT-based
- Implementation: `src/modules/auth/`
- Strategy: Passport.js with JWT strategy + custom MCP token strategy
- Token storage: In-memory (frontend localStorage)
- Token validation: `src/modules/auth/jwt-strategy.ts` (extracts from Authorization header)

**Password Management:**
- Hashing algorithm: bcryptjs (NaCl, 10 rounds)
- Password field: `users.password_hash` (marked `select: false` to prevent accidental exposure)
- Login flow: `src/modules/auth/auth.service.ts` - email + password → bcrypt compare → JWT issued
- Password reset: Email-based (temporary phase - returns raw token in response)
  - Token storage: SHA256 hash in `password_reset_tokens` table
  - TTL: 1 hour (configurable `RESET_TOKEN_TTL_HOURS`)
  - One-time use: Invalidated after use with `usedAt` timestamp
  - On forgot-password: Unused tokens invalidated via `resetTokenRepo.delete({ userId, usedAt: IsNull() })`

**JWT Configuration:**
- Secret: `JWT_SECRET` environment variable
- Service: `@nestjs/jwt` (v11.0.2)
- Payload: `{ sub: userId, role: userRole, email: email, scopes: [] }`
- Roles: ADMIN (super-admin), USER (regular user), GUEST
- Guard: `JwtAuthGuard` in `src/modules/auth/jwt-auth.guard.ts`

**MCP Tokens (API Tokens):**
- Purpose: Machine-to-machine authentication (e.g., integration with MCP servers)
- Storage: `mcp_tokens` table
- Strategy: Custom Passport strategy in `src/modules/auth/mcp-token.strategy.ts`
- Service: `src/modules/auth/mcp-tokens.service.ts`
- Token format: Bearer token extracted from Authorization header
- Validation: Direct database lookup (tokens are opaque, compared directly)

**Role-Based Access Control:**
- Guards: `JwtAuthGuard`, `RolesGuard`
- Decorator: `@Roles('ADMIN', 'USER')` applied to endpoints
- Logic: Admins bypass project access checks; non-admins see only projects they're members of
- Member roles: 'owner' or 'member' (per project access control)

## Monitoring & Observability

**Error Tracking:**
- Current: None
- Approach: NestJS global exception filter and controller-level error handling
- Logger: NestJS built-in Logger service (logs to stdout)

**Logs:**
- Format: Stdout via `console.log()` and NestJS Logger
- Levels: Info, warning, error, debug
- Bootstrap logs: Environment and API URL logged at startup (`src/main.ts`)
- Response time tracking: `src/common/interceptors/response-time.interceptor.ts` (adds X-Response-Time header)
- TypeORM logging: Enabled in dev (configured in `src/config/app.config.ts`)
- Integration: Docker captures stdout/stderr for `docker compose logs`

**Health Checks:**
- Endpoint: `GET /health` (implicit NestJS default)
- Docker Compose: Used for service dependency checks (see `healthcheck` blocks in `compose.yml`)
- PostgreSQL healthcheck: `pg_isready` command
- RabbitMQ healthcheck: `rabbitmq-diagnostics ping` and `check_port_connectivity`

## CI/CD & Deployment

**Hosting:**
- Stage: Ubuntu VPS at `79.76.35.167`
- Deployment path: `~/nest_js/` on server
- Docker setup: Docker Compose orchestration
- Process manager: None (relies on Docker restart: unless-stopped)

**CI Pipeline:**
- Platform: GitHub Actions
- Main workflow: `.github/workflows/build-and-stage.yml`
  - Trigger: Push to `develop` branch
  - Steps: Build Docker images → Push to GitHub Container Registry (GHCR) → Deploy via SSH
- PR workflow: `.github/workflows/pr-checks.yml` (lint, test)
- Production workflow: `.github/workflows/deploy-prod.yml` (manual or scheduled)

**Image Registry:**
- Platform: GitHub Container Registry (GHCR)
- Image names: `ghcr.io/[org]/nest-js-app`, `ghcr.io/[org]/nest-js-admin-ui`
- Tags: `latest`, `develop`, commit SHA
- Build targets:
  - `prod` - Multi-stage optimized runtime (Alpine, npm prune, non-root user)
  - `prod-distroless` - Ultra-minimal distroless image (no shell, no package manager)
  - `admin-ui` - nginx-based React SPA server

**Deployment Method:**
- SSH-based deployment via GitHub Actions
- SSH key: `test/ssh-key-2026-03-23.key`
- Remote commands: `docker compose pull && docker compose up -d`
- Migration/seed: Run on-demand via `docker compose run --rm migrate` / `docker compose run --rm seed`

## Environment Configuration

**Required Environment Variables:**
- `APP_PORT` - Server port (default 3000)
- `APP_NAME` - App identifier
- `NODE_ENV` - Environment (local, dev, staging, prod)
- `JWT_SECRET` - JWT signing secret (min ~32 chars)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` - PostgreSQL
- `RABBITMQ_URL` - RabbitMQ AMQP URL
- `GEMINI_API_KEY` - Google Generative AI API key (required for AI features)
- `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - S3 (optional)

**Secrets Location:**
- Local dev: `.env` file (not committed, see `.env.example`)
- Docker: Injected via `env_file: .env` in compose files
- Stage/Prod: Environment variables set at deployment time (via GitHub Secrets or VPS env)
- SSH keys: `test/ssh-key-2026-03-23.key` (in repo, used by Actions)

**Configuration Loading:**
- Entry point: `src/config/app.config.ts` - exports `loadBaseConfig()` and `appConfig` register function
- Validation: TypeScript types (AppConfig, BaseAppConfig)
- Usage: Injected via `@nestjs/config` ConfigService

## Webhooks & Callbacks

**Incoming:**
- None currently implemented

**Outgoing:**
- Quality check async processing: Uses RabbitMQ publish/subscribe (not HTTP webhooks)
  - Exchange: `translations.quality`
  - Queues: `translations.quality.process`, `translations.quality.retry`, `translations.quality.dlq`
  - Service: `src/modules/translations/quality-queue.service.ts`
  - Pattern: Publisher sends batch message → Consumer processes asynchronously
  - Retry logic: Up to 3 attempts, 60s delay between retries, dead-letter queue on final failure

**Import/Export:**
- ZIP import: `src/modules/translations/import.service.ts` - extracts and processes multi-locale translations
- Quality checks on import: Batched per namespace/locale, published to RabbitMQ for async processing

## Message Queue (RabbitMQ)

**Broker:**
- Container: `rabbitmq:3-management` service
- Connection: AMQP protocol on port 5672
- Admin UI: Management plugin on port 15672
- Auth: Default guest/guest (configurable via `RABBITMQ_USER`, `RABBITMQ_PASS`)

**Queue Topology:**
- Exchange: `translations.quality` (direct exchange)
- Routing keys:
  - `process` → `translations.quality.process` queue (main work queue)
  - `retry` → `translations.quality.retry` queue (DLX dead-letter, auto-retry after 60s)
  - `dlq` → `translations.quality.dlq` queue (final failed messages)
- Message format: JSON with `{ messageId, projectId, keyIds, attempt, createdAt }`
- Persistence: Messages marked as durable (deliveryMode: 2)

**Quality Check Workflow:**
1. Endpoint receives translation batch → publishes to `translations.quality.process` queue
2. Background worker consumes from queue (prefetch: 2)
3. Worker calls Gemini API to score translations
4. On success: `ch.ack()` → message deleted
5. On failure: Republish to retry queue with incremented attempt counter
6. After 3 failed attempts: Publish to dead-letter queue (DLQ) for manual review
7. Retry queue has auto-expiry mapping to delay re-delivery by 60 seconds

---

*Integration audit: 2026-04-02*
