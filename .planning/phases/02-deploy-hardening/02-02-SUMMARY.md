---
phase: 02-deploy-hardening
plan: 02
subsystem: infra
tags: [github-actions, ci, healthcheck, docker-compose, deploy, admin-ui]

# Dependency graph
requires:
  - phase: 02-deploy-hardening
    plan: 01
    provides: "GET /health endpoint using @nestjs/terminus returning 200 when DB+RabbitMQ up, 503 when any dependency down"
provides:
  - "CI post-deploy verification checks both API /health (200, 3 min timeout) and admin-ui (HTTP 200)"
  - "dump_diagnostics() function covering all 4 services (api, admin-ui, postgres, rabbitmq) plus docker compose ps"
  - "CI exits 1 on any health check failure; exits 0 only when both API and admin-ui pass"
affects: [02-deploy-hardening, ci, github-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dump_diagnostics() shell function reused by both failure paths — DRY diagnostic output pattern"
    - "API_HEALTHY flag variable pattern for loop-exit-without-exit-code in bash CI scripts"

key-files:
  created: []
  modified:
    - .github/workflows/build-and-stage.yml

key-decisions:
  - "Default STAGE_ADMIN_UI_URL to http://localhost:3010 inline — matches VPS .env ADMIN_UI_PORT=3010 per CLAUDE.md"
  - "dump_diagnostics() shared by both failure paths — single function covers docker compose ps + 4-service log tails"

patterns-established:
  - "CI deploy: [N/5] step numbering with separate API health + admin-ui check steps"

requirements-completed: [DEPLOY-03]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 2 Plan 2: CI Post-Deploy Verification Hardening Summary

**CI deploy now verifies API /health (3 min timeout, 36 retries) and admin-ui HTTP 200, dumping all-service logs and docker compose ps on any failure before exiting 1**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-02T16:02:01Z
- **Completed:** 2026-04-02T16:04:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `dump_diagnostics()` shell function covering docker compose ps + last 30 lines of api, admin-ui, postgres, and rabbitmq logs
- Renamed [4/4] to [4/5]: API health check now tracks success via `API_HEALTHY` flag and calls `dump_diagnostics` on timeout failure
- Added [5/5]: admin-ui check at `STAGE_ADMIN_UI_URL` (defaults to `http://localhost:3010`), calls `dump_diagnostics` and exits 1 on non-200

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend CI post-deploy verification with admin-ui check and full diagnostics** - `24e4122` (feat)

## Files Created/Modified
- `.github/workflows/build-and-stage.yml` - Added STAGE_ADMIN_UI_URL env+envs injection, dump_diagnostics() function, [4/5] API health with flag, [5/5] admin-ui check

## Decisions Made
- Default `STAGE_ADMIN_UI_URL` to `http://localhost:3010` inline in the script — matches project convention in CLAUDE.md (`ADMIN_UI_PORT=3010` on VPS). The GitHub Actions secret is optional for explicitness but not required.
- `dump_diagnostics()` reused by both failure paths rather than inlining — keeps the script DRY and ensures both API and admin-ui failures produce identical diagnostic output.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

The `STAGE_ADMIN_UI_URL` GitHub Actions secret can optionally be set to `http://localhost:3010` in the repository's stage environment. If not set, the script defaults to `http://localhost:3010` which matches the VPS `.env` `ADMIN_UI_PORT=3010` configuration. The secret is optional.

## Next Phase Readiness
- Phase 2 deploy-hardening is now complete (both plans executed)
- CI deploy fails fast with full diagnostic output on any service unhealthy state
- Both API health (DB + RabbitMQ connectivity via terminus) and admin-ui availability are verified on every deploy

## Self-Check: PASSED

- File found: `.github/workflows/build-and-stage.yml`
- File found: `.planning/phases/02-deploy-hardening/02-02-SUMMARY.md`
- Commit found: `24e4122`

---
*Phase: 02-deploy-hardening*
*Completed: 2026-04-02*
