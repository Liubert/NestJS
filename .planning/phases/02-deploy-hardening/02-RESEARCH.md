# Phase 2: Deploy Hardening - Research

**Researched:** 2026-04-02
**Domain:** Docker Compose healthchecks, NestJS health endpoints, GitHub Actions CI verification
**Confidence:** HIGH

## Summary

This phase hardens the deploy pipeline across three layers: Docker Compose service health signaling (DEPLOY-01), a unified NestJS `/health` endpoint that validates real dependencies (DEPLOY-02), and CI post-deploy verification that fails fast with diagnostic output when services are unhealthy (DEPLOY-03).

The project already has healthchecks on postgres and rabbitmq services in compose.yml. The API service has no healthcheck. The current `/health` endpoint is static (always returns 200), and `/ready` only checks DB. The CI smoke check already polls `/health` 36 times over 3 minutes but exits 0 on first 200 — it does not check admin-ui, and it does not dump diagnostic output on failure.

All three requirements are straightforward incremental improvements to existing working infrastructure. No new infrastructure is needed. The main decision is whether to use `@nestjs/terminus` or continue the manual pattern — terminus is not installed, would add structure and standard response format, and this is the right time to introduce it given DEPLOY-02 requires a proper multi-dependency health check.

**Primary recommendation:** Install `@nestjs/terminus`, replace `AppController` health/ready methods with a terminus-backed `/health` endpoint checking TypeORM + custom amqplib RabbitMQ indicator. Update compose.yml API healthcheck to use `wget` (curl is NOT available in `node:22-alpine`). Extend CI script to check admin-ui HTTP 200 and dump full diagnostics on failure.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Switch CI smoke check from static `/health` to a readiness endpoint that checks DB + RabbitMQ connectivity. Deploy fails if any dependency is down.
- **D-02:** Also verify admin-ui responds with HTTP 200 on its port during post-deploy check.
- **D-03:** On deploy failure (health check doesn't pass in 3 min): fail workflow, dump last 30 lines of each service log + `docker compose ps` to show which services are unhealthy. No auto-rollback, no external alerts.
- **D-04:** Merge current `/health` (static OK) and `/ready` (DB only) into a single `/health` endpoint that checks both DB and RabbitMQ connectivity and returns status indicators per dependency.
- **D-05:** Add healthcheck to the API service in compose.yml using the new `/health` endpoint. API should not be considered healthy until DB and RabbitMQ are confirmed up.

### Claude's Discretion
- Whether to use `@nestjs/terminus` or keep the manual health check approach (current `/ready` pattern works, terminus adds structured health indicators)
- Exact health response JSON structure (fields, status codes for degraded vs down)
- RabbitMQ health check method (AMQP ping, management API, or connection state)
- Docker healthcheck interval/timeout/retries tuning for API service
- CI script exact curl/retry logic adjustments

### Deferred Ideas (OUT OF SCOPE)
- **DEPLOY-04: Uptime Kuma monitoring** — Removed from Phase 2 scope by user decision.
- Auto-rollback on deploy failure
- Slack/Telegram alerts on deploy failure
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | All Docker Compose services have healthchecks (API, Postgres, RabbitMQ) | Postgres + RabbitMQ already have healthchecks. API needs `healthcheck:` block using `wget` (curl absent from alpine). Timing parameters researched below. |
| DEPLOY-02 | API exposes `/health` endpoint via @nestjs/terminus checking DB and RabbitMQ connectivity | `@nestjs/terminus` 11.1.1 available. `TypeOrmHealthIndicator` covers DB. Custom `HealthIndicator` covers amqplib RabbitMQ. Terminus not yet installed. |
| DEPLOY-03 | CI pipeline verifies service health after deploy before reporting success | Current script already polls 36×5s=3min. Needs: (1) admin-ui HTTP check, (2) diagnostic dump on failure including all service logs + `docker compose ps`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/terminus | 11.1.1 | Structured health indicators with standard response format | Official NestJS recipe, integrates with TypeORM out of the box, standard JSON response schema |
| amqplib | 0.10.9 (already installed) | RabbitMQ connection probe for custom health indicator | Already used in project for RabbitMQ; open/close connection test is the reliable probe method |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeOrmHealthIndicator | (bundled in terminus) | DB connectivity check via `SELECT 1` | Always — replaces manual `dataSource.query('SELECT 1')` in `/ready` |
| HealthCheckService | (bundled in terminus) | Orchestrates all indicators, aggregates status | Always — drives the `/health` controller method |

**Installation:**
```bash
npm install --save @nestjs/terminus
```

**Version verification (confirmed 2026-04-02):**
```
@nestjs/terminus: 11.1.1 (published recently, NestJS 11 compatible)
```

## Architecture Patterns

### Recommended Project Structure

The health check lives in `AppController` / `AppModule` — this is already established in the project. With terminus, the pattern shifts slightly:

```
src/
├── app.controller.ts        # GET /health — terminus HealthCheck decorated method
├── app.module.ts            # TerminusModule + RabbitMQHealthIndicator imported here
└── common/health/
    └── rabbitmq.health.ts   # Custom HealthIndicator for amqplib connection probe
```

Alternatively, the custom indicator can live directly in `app.controller.ts` or as a provider in `AppModule` — no dedicated folder required given its simplicity.

### Pattern 1: Terminus Module Setup

**What:** Import `TerminusModule` in `AppModule`, inject `HealthCheckService` and health indicators into `AppController`.
**When to use:** Standard NestJS terminus integration.

```typescript
// app.module.ts — add TerminusModule to imports
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [
    // ... existing imports
    TerminusModule,
  ],
  controllers: [AppController],
  providers: [AppService, RabbitMQHealthIndicator],
})
export class AppModule implements NestModule { ... }
```

### Pattern 2: Unified /health Endpoint (replaces /health + /ready)

**What:** Single GET /health endpoint using terminus @HealthCheck decorator. Checks TypeORM (DB) and a custom RabbitMQ indicator. Old `/ready` endpoint is removed.
**When to use:** This is the target state per D-04.

```typescript
// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RabbitMQHealthIndicator } from './common/health/rabbitmq.health.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly rmq: RabbitMQHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.rmq.isHealthy('rabbitmq'),
    ]);
  }
}
```

**HTTP response on success (200):**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "up" }
  }
}
```

**HTTP response on failure (503):**
```json
{
  "status": "error",
  "info": { "database": { "status": "up" } },
  "error": { "rabbitmq": { "status": "down", "message": "connect ECONNREFUSED" } },
  "details": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "down", "message": "connect ECONNREFUSED" }
  }
}
```

### Pattern 3: Custom RabbitMQ Health Indicator

**What:** Inject amqplib and open a short-lived connection to the RabbitMQ URL to verify connectivity. Close it immediately. On failure, throw `HealthCheckError`.
**When to use:** No built-in terminus indicator for amqplib direct connections. This is the correct approach.

```typescript
// src/common/health/rabbitmq.health.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import * as amqp from 'amqplib';
import { AppConfig } from '../../config/app.config.js';

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    let connection: amqp.Connection | null = null;
    try {
      const { rabbitmqUrl } = this.configService.getOrThrow<AppConfig>('app');
      connection = await amqp.connect(rabbitmqUrl);
      await connection.close();
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        'RabbitMQ health check failed',
        this.getStatus(key, false, { message }),
      );
    } finally {
      if (connection) {
        try { await connection.close(); } catch { /* ignore */ }
      }
    }
  }
}
```

**IMPORTANT:** The `finally` block double-closes defensively. The `close()` in `try` handles the happy path; the `finally` handles the case where an error occurs after connection is established but before close.

### Pattern 4: Docker Compose API Healthcheck

**What:** Add `healthcheck:` to the `api` service in `compose.yml`. Uses `wget` not `curl` — `curl` is NOT available in `node:22-alpine`.
**When to use:** Required for D-05 and DEPLOY-01.

```yaml
# compose.yml — api service healthcheck block
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 30s
```

**Tuning rationale:**
- `interval: 15s` — frequent enough to detect failures quickly without hammering the endpoint
- `timeout: 10s` — allows for DB/RabbitMQ probe latency
- `retries: 5` — 5 failures × 15s = 75s before marking unhealthy
- `start_period: 30s` — grace period while NestJS bootstraps and TypeORM initializes; failures during this window do not count toward retries

The `api` service already has `depends_on: postgres: condition: service_healthy` and `rabbitmq: condition: service_healthy`, so the API container won't start until Postgres and RabbitMQ pass their own healthchecks. The API healthcheck validates that the app itself is ready on top of that.

### Pattern 5: CI Post-Deploy Verification

**What:** Extend the existing 36-attempt curl loop in `.github/workflows/build-and-stage.yml` to also check admin-ui, and output full diagnostics (all service logs + `docker compose ps`) on failure.
**When to use:** D-01, D-02, D-03 compliance.

The current script already polls API `/health` for 3 minutes. Changes needed:
1. After API health passes, add a separate check for admin-ui HTTP 200
2. On failure: dump last 30 lines of EACH service (not just `api`), plus `docker compose ps`

```bash
# [4/4] Wait for API health
for i in $(seq 1 36); do
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" "${STAGE_HEALTHCHECK_URL}" 2>/dev/null || echo "000")
  echo "  attempt ${i}/36 — HTTP ${STATUS}"
  if [ "${STATUS}" = "200" ]; then
    echo "[4/4] API health passed"
    break
  fi
  if [ "${i}" -eq 36 ]; then
    echo "[4/4] API health check failed after 3 min"
    echo "--- docker compose ps ---"
    docker compose -f "${COMPOSE_FILE}" --env-file .env --env-file .env.cicd ps
    for svc in api admin-ui postgres rabbitmq; do
      echo "--- ${svc} logs (last 30 lines) ---"
      docker compose -f "${COMPOSE_FILE}" --env-file .env --env-file .env.cicd logs --tail=30 "${svc}" || true
    done
    exit 1
  fi
  sleep 5
done

# [5/5] Verify admin-ui responds
ADMIN_UI_URL="${STAGE_ADMIN_UI_URL:-http://localhost:3010}"
echo "[5/5] Checking admin-ui at ${ADMIN_UI_URL}..."
ADMIN_STATUS=$(curl -o /dev/null -s -w "%{http_code}" "${ADMIN_UI_URL}" 2>/dev/null || echo "000")
if [ "${ADMIN_STATUS}" = "200" ]; then
  echo "[5/5] Admin-UI check passed"
else
  echo "[5/5] Admin-UI check failed — HTTP ${ADMIN_STATUS}"
  docker compose -f "${COMPOSE_FILE}" --env-file .env --env-file .env.cicd logs --tail=30 admin-ui || true
  exit 1
fi
```

**Note:** `STAGE_ADMIN_UI_URL` needs to be added as a GitHub Actions secret pointing to `http://79.76.35.167:3010`.

### Anti-Patterns to Avoid

- **Using `curl` in Docker healthcheck for node:22-alpine:** `curl` is absent from the image. Always use `wget -qO- URL || exit 1`.
- **Removing `/ready` without redirecting dependents:** Check if anything (monitoring, other services) calls `/ready` before deleting it. Based on code review, nothing external calls `/ready` in this project.
- **Blocking `amqplib.connect()` without timeout:** amqplib `connect()` can hang if RabbitMQ is unreachable. Terminus wraps the call with its own timeout (passed to `health.check()`), but setting a small timeout on the amqplib connection options is also prudent.
- **Circular dependency injecting ConnectionManager:** This project uses amqplib directly (not @nestjs/microservices RMQ transport), so there is no NestJS RMQ module to inject. Use `ConfigService` to get the URL and create a throwaway connection.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aggregating multiple health indicators | Custom Promise.all wrapper | `HealthCheckService.check()` from terminus | Handles Promise.allSettled, status aggregation, error formatting, HTTP 200/503 response codes |
| DB connectivity probe | Custom `dataSource.query('SELECT 1')` try/catch | `TypeOrmHealthIndicator.pingCheck()` | Handles timeouts, formats HealthIndicatorResult correctly |
| Health response JSON | Custom `{ status, checks: {} }` shape | Terminus standard shape (`status`, `info`, `error`, `details`) | Consistent with ecosystem tooling; CI/monitoring tools expect this format |

**Key insight:** The existing `/ready` endpoint's manual `dataSource.query('SELECT 1')` pattern is the exact thing TypeOrmHealthIndicator replaces with better timeout handling and standard response format.

## Common Pitfalls

### Pitfall 1: curl vs wget in Alpine healthcheck
**What goes wrong:** `healthcheck: test: ["CMD", "curl", "-f", "..."]` always exits non-zero because curl is not installed in `node:22-alpine`.
**Why it happens:** Alpine is minimal; curl is not included by default. wget is.
**How to avoid:** Use `wget -qO- http://localhost:3000/health || exit 1` or install curl in Dockerfile (`RUN apk add --no-cache curl`) — but installing curl only for healthcheck adds unnecessary image size. Prefer wget.
**Warning signs:** Container stays in `starting` state forever; `docker inspect <container> --format='{{.State.Health}}'` shows exit code 126 (command not found).

### Pitfall 2: start_period missing from API healthcheck
**What goes wrong:** API container marked `unhealthy` before NestJS finishes bootstrapping (TypeORM connects, migrations run via separate container but app startup takes ~5-10s).
**Why it happens:** Without `start_period`, Docker starts counting retries immediately at container start.
**How to avoid:** Set `start_period: 30s` to give the app grace period to boot.
**Warning signs:** `docker compose ps` shows `(health: starting)` immediately flipping to `unhealthy` even when the app is fine.

### Pitfall 3: amqplib connection left open in health indicator
**What goes wrong:** Memory/connection leak under high health check frequency or failure scenarios. RabbitMQ shows growing open connections.
**Why it happens:** Health indicator opens a connection but error path doesn't close it.
**How to avoid:** Always close connection in `finally` block. Store reference before the try block.
**Warning signs:** RabbitMQ management UI shows connection count growing monotonically.

### Pitfall 4: @HealthCheck decorator conflict with existing guards
**What goes wrong:** `@HealthCheck()` decorator from terminus conflicts with `JwtAuthGuard` or other guards applied globally.
**Why it happens:** Health endpoints must be public (no auth). Terminus `@HealthCheck()` doesn't bypass guards.
**How to avoid:** The current project's `/health` and `/ready` endpoints have no `@UseGuards()` and are in `AppController` with no class-level guards. This will continue to work correctly. Do not add `JwtAuthGuard` to the health endpoint.
**Warning signs:** CI returns HTTP 401 instead of 200/503.

### Pitfall 5: CI admin-ui check missing STAGE_ADMIN_UI_URL secret
**What goes wrong:** Admin-UI check defaults to `localhost:3001` (old default in compose.yml) instead of `localhost:3010`.
**Why it happens:** `ADMIN_UI_PORT` in `.env` on VPS maps to 3010, but the CI script hardcodes a default.
**How to avoid:** Add `STAGE_ADMIN_UI_URL` GitHub Actions secret with value `http://localhost:3010`. The CI script should reference this secret via env injection.
**Warning signs:** Admin-UI check returns 000 (connection refused) even though the service is running.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Terminus Module Registration
```typescript
// Source: https://docs.nestjs.com/recipes/terminus
// app.module.ts
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [
    // ... existing
    TerminusModule,
  ],
  providers: [AppService, RabbitMQHealthIndicator],
  controllers: [AppController],
})
export class AppModule implements NestModule { ... }
```

### TypeOrmHealthIndicator pingCheck
```typescript
// Source: https://docs.nestjs.com/recipes/terminus — TypeORM indicator
// Executes SELECT 1; throws HealthCheckError with 503 response on failure
() => this.db.pingCheck('database', { timeout: 3000 })
```

### Custom HealthIndicator base class
```typescript
// Source: https://jakekwak.gitbook.io/nestjs/recipes/untitled-6
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

@Injectable()
export class MyIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isHealthy = /* probe */;
    const result = this.getStatus(key, isHealthy, { /* extra fields */ });
    if (isHealthy) return result;
    throw new HealthCheckError('check failed', result);
  }
}
```

### wget-based Docker healthcheck (Alpine-safe)
```yaml
# Source: Docker docs + confirmed node:22-alpine has wget but not curl
healthcheck:
  test: ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 30s
```

### CI diagnostic dump on failure
```bash
# Dump diagnostics before exit 1
echo "--- docker compose ps ---"
docker compose -f "${COMPOSE_FILE}" --env-file .env --env-file .env.cicd ps
for svc in api admin-ui postgres rabbitmq; do
  echo "--- ${svc} logs (last 30 lines) ---"
  docker compose -f "${COMPOSE_FILE}" --env-file .env --env-file .env.cicd logs --tail=30 "${svc}" || true
done
exit 1
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| @nestjs/terminus | DEPLOY-02 | Not installed | — | Manual indicator pattern (more code, same outcome) |
| wget in node:22-alpine | DEPLOY-01 (Docker healthcheck) | Confirmed present | (alpine default) | — |
| curl in CI runner (ubuntu-latest) | DEPLOY-03 (CI health polling) | Confirmed (ubuntu-latest has curl) | — | — |
| RabbitMQ 3-management (on VPS) | DEPLOY-02 RMQ health probe | Assumed running per compose.yml | 3.x | — |

**Missing dependencies with no fallback:**
- `@nestjs/terminus` — must be installed (`npm install --save @nestjs/terminus`). No blocking issue; it's an npm package.

**Missing dependencies with fallback:**
- None — all required tools are available or installable.

**Critical finding — curl absent from prod image:** The Docker healthcheck must use `wget`, not `curl`. `node:22-alpine` has `wget` but NOT `curl`. Verified by running the image.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `/health` returns 200 always | `/health` checks DB + RabbitMQ, returns 503 if any dependency is down | This phase | CI actually validates real dependency connectivity |
| `/ready` checks DB only | Removed; merged into `/health` | This phase | Single endpoint for both orchestrator and CI |
| API service has no Docker healthcheck | API service marked healthy only after `/health` returns 200 | This phase | `depends_on: api: condition: service_healthy` usable by dependent services |
| CI dumps only `api` logs on failure | CI dumps all service logs + `docker compose ps` | This phase | Faster diagnosis of deploy failures |

## Open Questions

1. **AppConfig structure — is `rabbitmqUrl` exposed via ConfigService?**
   - What we know: `compose.yml` injects `RABBITMQ_URL` env var into the API container; `amqplib` uses it at startup
   - What's unclear: Whether `AppConfig` type in `src/config/app.config.ts` exposes `rabbitmqUrl` as a typed property
   - Recommendation: Planner/executor reads `src/config/app.config.ts` and uses the existing config access pattern for the RabbitMQ URL; fallback is `process.env.RABBITMQ_URL`

2. **STAGE_ADMIN_UI_URL GitHub Actions secret — does it exist?**
   - What we know: CI uses `STAGE_HEALTHCHECK_URL` for the API check; compose.yml maps admin-ui to `ADMIN_UI_PORT:-3001` but project convention is port 3010
   - What's unclear: Whether `STAGE_ADMIN_UI_URL` or similar secret already exists
   - Recommendation: Executor should check GitHub Actions secrets and add `STAGE_ADMIN_UI_URL=http://localhost:3010` if missing; alternatively hardcode `http://localhost:3010` directly in the CI script since the port is documented in CLAUDE.md

3. **Does anything call `/ready` externally?**
   - What we know: No external consumers visible in codebase; endpoint exists only in `AppController`
   - What's unclear: Whether any monitoring tools, reverse proxies, or load balancers probe `/ready`
   - Recommendation: Safe to remove; the unified `/health` endpoint covers the same ground. Note the change in git commit message.

## Sources

### Primary (HIGH confidence)
- `src/app.controller.ts` — Existing health endpoint code, DataSource injection pattern
- `compose.yml` — Existing healthcheck definitions for postgres and rabbitmq, API service structure
- `.github/workflows/build-and-stage.yml` lines 152-188 — Current CI smoke check logic
- `Dockerfile` prod stage — Confirms `node:22-alpine` base image
- Docker image probe (`node:22-alpine`) — Confirmed `wget` present, `curl` absent
- `npm view @nestjs/terminus` — Confirmed version 11.1.1

### Secondary (MEDIUM confidence)
- [NestJS Terminus README on GitHub](https://github.com/nestjs/terminus/blob/master/README.md) — Module setup, TypeOrmHealthIndicator usage, response format
- [Terminus GitBook docs](https://jakekwak.gitbook.io/nestjs/recipes/untitled-6) — Custom HealthIndicator pattern, HTTP 503 on failure
- [RabbitMQ frame_max issue #2672](https://github.com/nestjs/terminus/issues/2672) — frame_max incompatibility only affects RabbitMQ 4.1+; project uses RabbitMQ 3-management, not affected
- [Docker Alpine healthcheck guide](https://blog.sixeyed.com/docker-healthchecks-why-not-to-use-curl-or-iwr/) — wget vs curl in minimal images

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — terminus version confirmed via npm registry; amqplib already in project
- Architecture: HIGH — existing code structure read directly; terminus patterns verified against official docs
- Pitfalls: HIGH — curl/wget finding confirmed by running actual Docker image; other pitfalls from direct code analysis
- CI patterns: HIGH — actual workflow file read; patterns are standard bash

**Research date:** 2026-04-02
**Valid until:** 2026-07-02 (terminus API is stable; Docker healthcheck semantics don't change)
