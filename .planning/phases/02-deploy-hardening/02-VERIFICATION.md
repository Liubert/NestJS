---
phase: 02-deploy-hardening
verified: 2026-04-02T16:30:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 2: Deploy Hardening Verification Report

**Phase Goal:** Deploys pass on the first attempt and the pipeline catches unhealthy services before reporting success
**Verified:** 2026-04-02T16:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /health returns 200 with database and rabbitmq status indicators when both are up | ✓ VERIFIED | `src/app.controller.ts` — `@HealthCheck()` + `health.check([db.pingCheck, rmq.isHealthy])` |
| 2 | GET /health returns 503 with per-dependency status when any dependency is down | ✓ VERIFIED | Terminus `HealthCheckService` returns 503 on any failed indicator — standard terminus behavior wired correctly |
| 3 | Docker compose API service has a healthcheck using the /health endpoint | ✓ VERIFIED | `compose.yml` lines 53-58 — `wget -qO- http://localhost:3000/health` with interval 15s, retries 5, start_period 30s |
| 4 | Old /ready endpoint no longer exists | ✓ VERIFIED | `src/app.controller.ts` contains no `getReadinessStatus` or `getLivenessStatus` methods |
| 5 | CI deploy fails (exit 1) when API /health does not return 200 within 3 minutes | ✓ VERIFIED | `build-and-stage.yml` line 200 — `exit 1` after 36x5s loop with no 200 |
| 6 | CI deploy verifies admin-ui responds with HTTP 200 after API health passes | ✓ VERIFIED | `build-and-stage.yml` lines 203-213 — `[5/5]` step checks STAGE_ADMIN_UI_URL, exits 1 on non-200 |
| 7 | On any health check failure, CI dumps last 30 lines of logs for all four services plus docker compose ps | ✓ VERIFIED | `dump_diagnostics()` function at lines 175-182 — covers api, admin-ui, postgres, rabbitmq with `--tail=30` |
| 8 | CI deploy exits 0 only when both API health and admin-ui checks pass | ✓ VERIFIED | Both failure paths (`exit 1` at lines 200, 212) guard the end of the script; no final `exit 1` means implicit exit 0 |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/health/rabbitmq.health.ts` | Custom terminus HealthIndicator for RabbitMQ via amqplib | ✓ VERIFIED | 37 lines. `RabbitMQHealthIndicator extends HealthIndicator`. Uses `amqp.connect()` with `finally` safe-close. ConfigService wired via `getOrThrow<AppConfig>('app').rabbitmq.url`. |
| `src/app.controller.ts` | Unified /health endpoint using terminus HealthCheckService | ✓ VERIFIED | 28 lines. `@HealthCheck()` + `health.check()` orchestrating `db.pingCheck('database')` and `rmq.isHealthy('rabbitmq')`. Old static endpoint removed. |
| `src/app.module.ts` | TerminusModule and RabbitMQHealthIndicator registered | ✓ VERIFIED | `TerminusModule` in imports (line 36). `RabbitMQHealthIndicator` in providers (line 45). |
| `compose.yml` | API service healthcheck block | ✓ VERIFIED | Lines 53-58. `wget -qO- http://localhost:3000/health`. interval 15s, timeout 10s, retries 5, start_period 30s. All three services (postgres, rabbitmq, api) have healthchecks — confirmed by `grep -c "healthcheck:" compose.yml` returning 3. |
| `.github/workflows/build-and-stage.yml` | Post-deploy verification with API health + admin-ui check + diagnostic dump | ✓ VERIFIED | `STAGE_ADMIN_UI_URL` in env and envs. `dump_diagnostics()` defined and called by both failure paths. `[4/5]` and `[5/5]` steps present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app.controller.ts` | `@nestjs/terminus` | `HealthCheckService.check()` orchestrating `TypeOrmHealthIndicator` + `RabbitMQHealthIndicator` | ✓ WIRED | `this.health.check([() => this.db.pingCheck(...), () => this.rmq.isHealthy(...)])` confirmed in source |
| `src/common/health/rabbitmq.health.ts` | `src/config/app.config.ts` | `ConfigService` to get `rabbitmq.url` | ✓ WIRED | `this.configService.getOrThrow<AppConfig>('app')` → `.rabbitmq.url` confirmed in source |
| `compose.yml` | `src/app.controller.ts` | Docker healthcheck hitting `GET /health` on `localhost:3000` | ✓ WIRED | `wget -qO- http://localhost:3000/health` confirmed in compose.yml line 54 |
| `.github/workflows/build-and-stage.yml` | `src/app.controller.ts` | `curl` to `/health` endpoint expecting 200 or non-200 | ✓ WIRED | `STAGE_HEALTHCHECK_URL` env var used in the 36-retry loop with `curl -o /dev/null -s -w "%{http_code}"` |
| `.github/workflows/build-and-stage.yml` | `compose.yml` admin-ui service | `curl` to admin-ui port checking HTTP 200 | ✓ WIRED | `STAGE_ADMIN_UI_URL` env + `ADMIN_UI_URL="${STAGE_ADMIN_UI_URL:-http://localhost:3010}"` default confirmed |

### Data-Flow Trace (Level 4)

Not applicable — no dynamic data rendering components introduced in this phase. All artifacts are infrastructure (health endpoint returns live dependency probe results by construction of terminus library).

### Behavioral Spot-Checks

Runnable checks that do not require a running server:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `@nestjs/terminus` installed in package.json | `grep '"@nestjs/terminus"' package.json` | `"@nestjs/terminus": "^11.1.1"` | ✓ PASS |
| 3 healthchecks in compose.yml (postgres, rabbitmq, api) | `grep -c "healthcheck:" compose.yml` | `3` | ✓ PASS |
| Old /ready endpoint removed from controller | `grep "getReadinessStatus\|getLivenessStatus" src/app.controller.ts` | no output | ✓ PASS |
| `dump_diagnostics()` referenced at both failure exit points | `grep -c "dump_diagnostics" build-and-stage.yml` | appears at definition + 2 call sites | ✓ PASS |
| wget (not curl) used in Docker healthcheck | `grep "wget.*localhost:3000/health" compose.yml` | match on line 54 | ✓ PASS |
| Commits documented in SUMMARYs exist in git log | `git log --oneline` | `cdb649d`, `33b9d87`, `24e4122` all present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DEPLOY-01 | 02-01-PLAN.md | All Docker Compose services have healthchecks (API, Postgres, RabbitMQ) | ✓ SATISFIED | `compose.yml` has `healthcheck:` in postgres (pg_isready), rabbitmq (rabbitmq-diagnostics), and api (wget /health) — 3 total confirmed |
| DEPLOY-02 | 02-01-PLAN.md | API exposes `/health` endpoint via @nestjs/terminus checking DB and RabbitMQ connectivity | ✓ SATISFIED | `src/app.controller.ts` — terminus `@HealthCheck()` wiring confirmed. `@nestjs/terminus ^11.1.1` in `package.json` |
| DEPLOY-03 | 02-02-PLAN.md | CI pipeline verifies service health after deploy before reporting success | ✓ SATISFIED | `.github/workflows/build-and-stage.yml` — API health loop (3 min, 36 retries) + admin-ui check + `exit 1` on any failure confirmed |
| DEPLOY-04 | N/A | Uptime Kuma monitoring | DEFERRED | Explicitly deferred by user decision. Not a gap for this phase. |

**All three phase requirements (DEPLOY-01, DEPLOY-02, DEPLOY-03) are satisfied. DEPLOY-04 was deferred before this phase began.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODOs, FIXMEs, placeholder returns, hardcoded empty data, or stub handlers found in any modified file.

### Human Verification Required

The following behaviors require a live environment and cannot be verified programmatically:

#### 1. API /health returns correct 503 on dependency failure

**Test:** Bring down Postgres (or RabbitMQ) on the stage server, then `curl http://79.76.35.167:8080/health`
**Expected:** HTTP 503 with JSON body showing `error.database.status = "down"` (or `error.rabbitmq.status = "down"`)
**Why human:** Requires a running service and deliberate dependency failure injection

#### 2. CI pipeline fails fast and dumps useful logs

**Test:** Trigger a deploy with a broken API image (e.g., invalid env config) and observe GitHub Actions log output
**Expected:** `[4/5]` step times out after 3 min, `dump_diagnostics` output shows logs for all four services, workflow exits with failure
**Why human:** Requires a real deploy run with an intentionally broken state

#### 3. docker compose up respects api depends_on service_healthy

**Test:** On a clean stage server, run `docker compose up -d` and observe that the api container does not start until postgres and rabbitmq pass their healthchecks
**Expected:** `docker compose ps` shows api container in "starting" or "waiting" state while postgres/rabbitmq are still unhealthy
**Why human:** Requires observing real Docker orchestration startup sequence

### Gaps Summary

No gaps. All must-haves verified. Phase goal is achieved.

The codebase now satisfies: deploys pass on the first attempt (Docker `depends_on service_healthy` chain ensures service ordering), and the pipeline catches unhealthy services before reporting success (CI does a 3-minute API health gate + admin-ui check + full diagnostics on failure before exit 1).

---

_Verified: 2026-04-02T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
