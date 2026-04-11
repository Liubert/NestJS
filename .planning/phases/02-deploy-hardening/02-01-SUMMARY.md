---
phase: 02-deploy-hardening
plan: 01
subsystem: infra
tags: [nestjs, terminus, healthcheck, rabbitmq, docker-compose, amqplib]

# Dependency graph
requires: []
provides:
  - "GET /health endpoint using @nestjs/terminus returning per-dependency JSON status"
  - "RabbitMQHealthIndicator custom HealthIndicator probing via amqplib connect"
  - "Docker Compose api service healthcheck using wget against /health"
affects: [02-deploy-hardening, ci, docker-compose]

# Tech tracking
tech-stack:
  added: ["@nestjs/terminus ^11.1.1"]
  patterns:
    - "Custom HealthIndicator extends HealthIndicator base class, uses ConfigService to get RabbitMQ URL"
    - "amqplib throwaway connection probe: connect → close → null pattern with finally safety"

key-files:
  created:
    - src/common/health/rabbitmq.health.ts
  modified:
    - src/app.controller.ts
    - src/app.module.ts
    - compose.yml
    - package.json
    - package-lock.json

key-decisions:
  - "Use wget (not curl) in Docker healthcheck — node:22-alpine includes wget but not curl"
  - "Merge static /health and DB-only /ready into single terminus /health endpoint per D-04"
  - "amqplib.ChannelModel used as connection type (return type of amqplib.connect)"

patterns-established:
  - "HealthIndicator pattern: extends HealthIndicator, getOrThrow<AppConfig>('app'), finally for safe close"

requirements-completed: [DEPLOY-01, DEPLOY-02]

# Metrics
duration: 12min
completed: 2026-04-02
---

# Phase 2 Plan 1: Health Endpoint and Docker Healthcheck Summary

**Terminus-based /health endpoint checking PostgreSQL and RabbitMQ with Docker Compose api service healthcheck using wget**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-02T16:00:00Z
- **Completed:** 2026-04-02T16:12:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Installed @nestjs/terminus and created RabbitMQHealthIndicator with amqplib probe using config-based URL
- Replaced static /health and DB-only /ready with unified terminus /health endpoint (returns 200 when healthy, 503 when any dependency down)
- Added Docker Compose healthcheck to api service using wget probing /health with 30s start_period

## Task Commits

Each task was committed atomically:

1. **Task 1: Install terminus, create RabbitMQ indicator, unified /health endpoint** - `cdb649d` (feat)
2. **Task 2: Add Docker Compose API healthcheck** - `33b9d87` (chore)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `src/common/health/rabbitmq.health.ts` - Custom HealthIndicator probing RabbitMQ via amqplib.connect()
- `src/app.controller.ts` - Replaced static /health and /ready with terminus @HealthCheck() endpoint
- `src/app.module.ts` - Added TerminusModule to imports, RabbitMQHealthIndicator to providers
- `compose.yml` - Added healthcheck block to api service (wget, interval 15s, retries 5, start_period 30s)
- `package.json` / `package-lock.json` - Added @nestjs/terminus ^11.1.1 dependency

## Decisions Made
- Used `wget` not `curl` in Docker healthcheck — node:22-alpine has wget but not curl
- Used `amqp.ChannelModel` as connection type (actual return type of `amqplib.connect()`)
- connection is set to null after successful close to prevent double-close in finally block

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- /health endpoint ready for CI smoke test in Plan 02-02
- All three Docker Compose services (postgres, rabbitmq, api) have healthchecks — Docker orchestration can now detect unhealthy state
- Old /ready endpoint removed; any tooling depending on it should switch to /health

---
*Phase: 02-deploy-hardening*
*Completed: 2026-04-02*
