---
phase: 04-dead-code-cleanup
plan: 02
subsystem: api
tags: [cleanup, dead-code, endpoints, security, auth, webhooks, files]

# Dependency graph
requires:
  - phase: 04-01
    provides: ENDPOINT-INVENTORY.md with 4 confirmed orphans and 2 flagged features
provides:
  - 4 orphan endpoints removed (GET /, POST /files/presign, POST /files/complete, GET /webhooks/supported-events, GET /webhooks/:id)
  - FilesModule fully removed from codebase and app.module.ts
  - AppController GET / removed; AppService cleaned up
  - Missing JwtAuthGuard added to POST /translations/import (security fix)
  - ENDPOINT-INVENTORY.md updated: import endpoint marked active, flagged count reduced to 1
affects:
  - future phases consuming translation endpoints
  - any dev who relies on AppController or FilesModule

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orphan removal: remove route handler → cascade service methods → cascade DTOs → cascade module if empty"
    - "Security: write endpoints must have @UseGuards(JwtAuthGuard) + @ApiBearerAuth()"

key-files:
  created: []
  modified:
    - src/modules/translations/translations.controller.ts
    - src/app.controller.ts
    - src/app.module.ts
    - .planning/ENDPOINT-INVENTORY.md

key-decisions:
  - "Add JwtAuthGuard to POST /translations/import — security gap, not an intentional design choice (Rule 2 deviation + user-requested)"
  - "FilesModule removed entirely: all 2 endpoints were orphans, module had no other exports or consumers"
  - "AppService kept but GetAboutPageHtml removed; AppController now only has GET /health"

patterns-established:
  - "Orphan cascade: route → service method (if no other callers) → DTOs (if no other imports) → module (if empty)"

requirements-completed:
  - CLEAN-02

# Metrics
duration: 15min
completed: 2026-04-02
---

# Phase 04 Plan 02: Orphan Endpoint Removal Summary

**4 confirmed orphan endpoints deleted and security gap fixed: POST /translations/import now requires JWT auth**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-02T17:30:00Z
- **Completed:** 2026-04-02T17:45:00Z
- **Tasks:** 2 (Task 1 completed in prior agent run; Task 2 + guard fix in this run)
- **Files modified:** 4

## Accomplishments

- Removed all 4 orphan endpoints confirmed in Plan 01's inventory: `GET /`, `POST /files/presign`, `POST /files/complete`, `GET /webhooks/supported-events`, `GET /webhooks/:id`
- Cascaded removals: FilesModule fully deleted (controller, service, module file, DTOs), AppController stripped to health-only, AppService `getAboutPageHtml()` removed
- Fixed security gap: `POST /translations/import` was publicly accessible without authentication — `@UseGuards(JwtAuthGuard)` added
- ENDPOINT-INVENTORY.md updated to reflect active status of import endpoint; flagged count reduced from 2 to 1

## Task Commits

1. **Task 1: Remove orphaned endpoints with cascading cleanup** - `42cd1ca` (remove)
2. **Task 2 / Guard fix: Add JwtAuthGuard to POST /translations/import** - `c8bbca0` (fix)

## Files Created/Modified

- `src/modules/translations/translations.controller.ts` - Added `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()` to `POST /translations/import`
- `src/app.controller.ts` - Removed `GET /` route and `getAboutPage()` handler; retained `GET /health`
- `src/app.module.ts` - Removed `FilesModule` from imports array
- `.planning/ENDPOINT-INVENTORY.md` - Updated import endpoint status from flagged to active; corrected summary counts

## Decisions Made

- Added `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth()` to `POST /translations/import` per user request — this was the flagged security gap, a single-decorator fix closing an unguarded write endpoint
- `forgotPassword` remains flagged (Phase 1 temporary behavior) — requires email infrastructure; no action in this plan

## Deviations from Plan

### User-Requested Addition

**1. [Rule 2 - Missing Critical] Added JwtAuthGuard to POST /translations/import**
- **Found during:** Continuation prompt (Task 2 approval)
- **Issue:** Endpoint had no authentication guard — any unauthenticated caller could import a ZIP and overwrite translations
- **Fix:** Added `@UseGuards(JwtAuthGuard)` and `@ApiBearerAuth()` to the route handler
- **Files modified:** `src/modules/translations/translations.controller.ts`
- **Verification:** `npm run build` exits 0; lint passes on modified file
- **Committed in:** `c8bbca0`

---

**Total deviations:** 1 user-requested security fix  
**Impact on plan:** Directly addresses the flagged item from ENDPOINT-INVENTORY.md; no scope creep.

## Issues Encountered

None — build and lint passed cleanly after each change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Codebase is now free of the 4 confirmed orphan endpoints and the `POST /translations/import` security gap
- Remaining flagged item: `POST /auth/forgot-password` returns raw token (Phase 1 behavior) — requires email infrastructure to resolve; tracked as known stub
- Ready for Phase 04-03 (next dead-code-cleanup plan)

## Known Stubs

- `POST /auth/forgot-password` — Returns raw reset token in response body instead of sending via email. Phase 1 intentional stub. Requires SMTP/email infrastructure to resolve. Tracked in ENDPOINT-INVENTORY.md as flagged.

---
*Phase: 04-dead-code-cleanup*
*Completed: 2026-04-02*
