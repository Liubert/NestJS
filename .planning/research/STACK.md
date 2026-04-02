# Technology Stack — Stabilization Layer

**Project:** TMS Stabilization (NestJS 11 + React 19 on single VPS)
**Researched:** 2026-04-02
**Scope:** Tools to add for stability — testing, CI/CD safety, migration safety, monitoring.
**Constraint:** No stack changes. Augment what exists, do not replace it.

---

## Existing Stack (DO NOT CHANGE)

The production stack is fixed per project constraints. Documented here for reference:

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend framework | NestJS | 11.0.1 |
| ORM | TypeORM | 0.3.28 |
| Database | PostgreSQL | 15 |
| Message queue | RabbitMQ | 3-management |
| Frontend | React + Ant Design + TanStack Query | 18.3.1 / 5.22.2 / 5.62.7 |
| Runtime | Node.js | 22 |
| Deployment | Docker Compose on single VPS | — |
| CI | GitHub Actions → GHCR → SSH deploy | — |

---

## Stabilization Stack Additions

### 1. Testing

#### Unit / Integration Tests — Stay on Jest, Downgrade to 29

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| jest | 29.7.0 | Test runner | Jest 30 is in the repo but ts-jest 29.4.9 (latest) officially supports only Jest <30. Running Jest 30 with ts-jest prints an explicit warning and has no formal support guarantee. Downgrade eliminates a hidden risk at zero cost. |
| ts-jest | 29.4.9 | TypeScript transformer for Jest | Latest stable; fully supports Jest 29 + TypeScript 5.x. Avoid `@swc/jest` for NestJS unit tests — SWC strips decorator metadata, which breaks TypeORM entities and NestJS DI during unit tests unless configured carefully. |
| @nestjs/testing | 11.1.17 | NestJS test module builder | Required for `Test.createTestingModule()`. Use the version that matches @nestjs/core. |
| supertest | 7.2.2 | HTTP assertion for e2e tests | Standard NestJS e2e tool. Works with Jest 29 without ESM complications. |
| @types/supertest | 7.2.0 | Type definitions | Matches supertest 7.x. |

**Confidence:** HIGH (npm registry versions confirmed, ts-jest/Jest 30 incompatibility confirmed via official ts-jest discussion thread and npm show)

**Do NOT use Vitest** for this project. Vitest has excellent performance but NestJS + TypeORM's heavy decorator/metadata dependency causes integration test breakage unless `unplugin-swc` is carefully configured. The project already has Jest wired in `package.json` — switching would cost more than it saves for a stabilization milestone.

#### Integration / E2e Tests Against Real Database — Testcontainers

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| @testcontainers/postgresql | 11.13.0 | Spin up real Postgres for tests | Eliminates the "tests pass but migrations fail on real DB" class of bugs. Runs actual TypeORM migrations inside an ephemeral container so tests verify the real schema. More reliable than mocking the repository layer. |

**Usage pattern:** Single container per test suite (not per test). Start in `beforeAll`, run `dataSource.runMigrations()`, reset data between tests, stop in `afterAll`. Set jest timeout to 60 000 ms for the suite.

**Confidence:** HIGH (official @testcontainers/postgresql 11.13.0 on npm, multiple 2024-2025 NestJS integration guides confirm the pattern)

**Do NOT use** `@trendyol/jest-testcontainers` — an older third-party wrapper that is less maintained than the official `@testcontainers/*` packages.

---

### 2. Healthchecks — @nestjs/terminus

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| @nestjs/terminus | 11.1.1 | `/health` endpoint | First-party NestJS module. Exposes liveness/readiness checks for PostgreSQL, RabbitMQ, memory heap, disk. Docker Compose `healthcheck:` directive then polls this endpoint so Docker knows when to restart a crashed service. |

**Recommended indicators to wire:**

- `TypeOrmHealthIndicator.pingCheck('database')` — confirms Postgres connection is alive
- `MicroserviceHealthIndicator` or `HttpHealthIndicator` for RabbitMQ — confirms AMQP broker is reachable
- `MemoryHealthIndicator.checkHeap('memory_heap', 300 * 1024 * 1024)` — catches memory leaks before OOM kill
- `DiskHealthIndicator.checkStorage('storage', { thresholdPercent: 0.9, path: '/' })` — early warning on VPS disk fill

**Docker Compose healthcheck block (add to api service):**

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 40s
```

**Confidence:** HIGH (official NestJS docs, npm version 11.1.1 confirmed, existing RabbitMQ ECONNREFUSED issue in project context makes RabbitMQ indicator specifically valuable)

**Known caveat:** RabbitMQ health check in @nestjs/terminus uses `frameMax` in a way incompatible with RabbitMQ 4.1+. If the server ever upgrades to RabbitMQ 4.1+, switch to `HttpHealthIndicator` hitting `http://rabbitmq:15672/api/healthchecks/node` instead. Current project uses RabbitMQ 3-management so this is safe for now.

---

### 3. CI/CD — GitHub Actions Safety Improvements

The project already uses GitHub Actions for build → GHCR push → SSH deploy. The stabilization goal is to make deploys pass on first attempt. Three specific additions address the documented failure modes.

#### 3a. Health Gate After Deploy

After `docker compose up -d`, the SSH step must poll the `/health` endpoint before marking the job green. Without this, the GitHub Actions job succeeds even when the container crashes 10 seconds after startup.

```bash
# In SSH deploy script, after docker compose up -d:
echo "Waiting for health check..."
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Health check passed"
    exit 0
  fi
  echo "Attempt $i: status=$STATUS, waiting 10s..."
  sleep 10
done
echo "Health check failed after 2 minutes"
exit 1
```

**Tool:** `appleboy/ssh-action` v1.0.3 (already in the project) — no new dependency needed.

**Confidence:** MEDIUM (pattern from community guides; exact curl health poll is standard practice)

#### 3b. Image Tag Strategy — Never Deploy `:latest`

The deploy script must pin the image tag to the Git SHA (e.g., `ghcr.io/org/nest_js:sha-abc123`) and write it into the `.env` on the server before `docker compose pull`. This allows rollback by re-running the previous deploy job (it knows the previous SHA tag).

```yaml
# In GitHub Actions workflow:
IMAGE_TAG: ${{ github.sha }}
```

**Confidence:** HIGH (standard Docker deploy pattern, prevents "pulled wrong image" class of failures)

#### 3c. Migration Step Separated from App Startup

Do NOT rely on `migrationsRun: true` in TypeORM config for production. Run migrations as an explicit step in the deploy script before starting the new container. This prevents race conditions when multiple containers start simultaneously and all attempt migrations.

```bash
# In deploy script, before docker compose up:
docker compose run --rm api npm run migration:run
docker compose up -d
```

Set `synchronize: false` and `migrationsRun: false` in the TypeORM production DataSource config.

**Confidence:** HIGH (TypeORM official docs explicitly warn against `synchronize: true` in production; race condition issue documented in typeorm/typeorm GitHub issues)

---

### 4. Database Migration Safety

No new tools required — TypeORM CLI already present. The safety improvements are configuration and process:

| Practice | Current State | Target State |
|----------|--------------|-------------|
| `synchronize` in production | Unknown | `false` (verified in app.config.ts) |
| `migrationsRun` in production | Unknown | `false` (run explicitly in deploy script) |
| Migration transaction scope | Default (all-in-one) | Default is safe; keep it |
| Migration tested in CI | Not present | Add: `migration:run` against Testcontainers DB in CI before deploy |
| Pre-migration backup | Not present | Add: `pg_dump` snapshot step in GitHub Actions before migration runs on stage |

**pg_dump snapshot in CI:**

```bash
# In GitHub Actions, before migration step:
ssh user@server "pg_dump -U $DB_USER -h localhost $DB_NAME > /tmp/pre_deploy_$(date +%Y%m%d_%H%M%S).sql"
```

This gives a restore point without requiring a separate tool.

**Confidence:** HIGH for configuration changes; MEDIUM for pg_dump step (depends on server having pg_dump available — confirm postgres-client installed on VPS)

---

### 5. Monitoring — Uptime Kuma

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| Uptime Kuma | 2.2.1 | Service availability monitoring + alerting | Self-hosted, runs in Docker Compose, zero ongoing cost, supports HTTP/TCP/Docker container monitoring, sends alerts to Telegram/Slack/email. Appropriate scope for a single-VPS internal tool. |

**Add to docker-compose.yml:**

```yaml
uptime-kuma:
  image: louislam/uptime-kuma:2.2.1
  container_name: uptime-kuma
  volumes:
    - uptime-kuma-data:/app/data
  ports:
    - "3001:3001"  # NOTE: port 3001 is reserved by another project — use 3011 instead
  restart: unless-stopped
```

**Monitors to configure inside Uptime Kuma:**

1. HTTP — `http://localhost:3000/health` (API liveness)
2. HTTP — `http://localhost:3010` (Admin UI)
3. TCP — `localhost:5432` (PostgreSQL)
4. TCP — `localhost:5672` (RabbitMQ)

**Do NOT use Prometheus + Grafana** for this project. That stack (Prometheus + node-exporter + cAdvisor + Grafana) adds 4 extra containers with meaningful RAM overhead on a single VPS. Uptime Kuma covers alerting for a low-traffic internal tool at a fraction of the resource cost.

**Confidence:** HIGH (Uptime Kuma is widely adopted for exactly this use case, version 2.2.1 confirmed on npm, Docker Hub image verified)

**Port conflict warning:** Port 3001 is reserved by another project (documented in CLAUDE.md). Uptime Kuma defaults to 3001. Map to `3011:3001` in docker-compose.yml.

---

## Summary: What to Add

| Addition | Library/Tool | Version | Purpose |
|----------|-------------|---------|---------|
| Downgrade Jest | jest | 29.7.0 | ts-jest compatibility |
| Keep ts-jest | ts-jest | 29.4.9 | TypeScript in Jest 29 |
| Integration test DB | @testcontainers/postgresql | 11.13.0 | Real DB in CI tests |
| Healthcheck endpoint | @nestjs/terminus | 11.1.1 | `/health` for Docker + CI gate |
| Service monitoring | Uptime Kuma | 2.2.1 | Alerting on downtime |
| CI health gate | appleboy/ssh-action (existing) | v1.0.3 | Poll `/health` post-deploy |

## What NOT to Add

| Tool | Reason |
|------|--------|
| Vitest | NestJS decorator metadata issues; existing Jest setup is correct choice for this codebase |
| Prometheus + Grafana | Overkill for single-VPS internal tool; 4 extra containers, high RAM, no actionable advantage over Uptime Kuma |
| Jest 30 (current in repo) | ts-jest 29.4.9 (latest stable) does not support Jest 30; no ts-jest v30 released as of 2026-04-02 |
| TypeORM `synchronize: true` | Documented data loss risk; never in production |
| TypeORM `migrationsRun: true` | Race condition risk with multiple container replicas |
| Watchtower (auto-pull) | Removes deploy control; can pull a broken image without a health gate |

---

## Confidence Assessment

| Area | Confidence | Evidence |
|------|------------|---------|
| Jest 29 + ts-jest recommendation | HIGH | npm show confirmed ts-jest latest is 29.4.9 with no Jest 30 support |
| Testcontainers pattern | HIGH | Official @testcontainers/postgresql 11.13.0 on npm, multiple 2024-2025 guides confirm NestJS integration |
| @nestjs/terminus | HIGH | Official NestJS docs, version 11.1.1 on npm, first-party module |
| CI health gate pattern | MEDIUM | Community guides; not from official GitHub Actions docs |
| Uptime Kuma | HIGH | Official project, version 2.2.1 on npm, well-documented Docker Compose setup |
| Migration separation | HIGH | TypeORM official docs + typeorm/typeorm GitHub issues confirm race condition risk |
| pg_dump backup step | MEDIUM | Standard Postgres tooling; depends on VPS having postgres-client installed |

---

## Sources

- ts-jest / Jest 30 compatibility: https://github.com/kulshekhar/ts-jest/discussions/4625
- Jest 30 release notes: https://jestjs.io/blog/2025/06/04/jest-30
- @testcontainers/postgresql NestJS integration: https://www.blockydevs.com/blog/nestjs-integration-testing-with-testcontainers
- NestJS testing docs: https://docs.nestjs.com/fundamentals/testing
- @nestjs/terminus: https://docs.nestjs.com/recipes/terminus
- RabbitMQ healthcheck issue: https://github.com/nestjs/terminus/issues/2672
- TypeORM migrations in production: https://javascript.plainenglish.io/nestjs-typeorm-migrations-in-2025-50214275ec8d
- TypeORM synchronize warning (official): https://typeorm.io/docs/migrations/setup/
- Uptime Kuma Docker: https://uptimekuma.org/install-uptime-kuma-docker/
- appleboy/ssh-action: https://github.com/appleboy/ssh-action
- Zero-downtime Docker Compose VPS deploy: https://dev.to/thayto/zero-downtime-deployment-with-docker-compose-in-an-oci-vps-using-github-actions-1fbd
- TypeORM migration race condition: https://github.com/typeorm/typeorm/issues/3400
