---
phase: 04-dead-code-cleanup
plan: 01
subsystem: api
tags: [endpoint-audit, inventory, dead-code, files-module, webhooks, auth]

# Dependency graph
requires: []
provides:
  - ".planning/ENDPOINT-INVENTORY.md — complete route-to-consumer map for all 77 backend routes"
  - "4 confirmed orphan routes identified with cascading dependency analysis"
  - "2 flagged partial features identified for user review"
  - "files/ module confirmed as having zero active consumers"
affects:
  - "04-02 — Plan 02 (orphan removal) depends entirely on this inventory"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Audit-then-remove pattern: document first, act second"

key-files:
  created:
    - ".planning/ENDPOINT-INVENTORY.md — 77-route audit with consumer mapping, orphan analysis, and flagged partial features"
  modified: []

key-decisions:
  - "Webhook GET /webhooks/:id classified as orphan — MCP tools do not call it (only PATCH/DELETE/list by ID)"
  - "GET /translations/projects/:slug/webhooks/supported-events classified as orphan — MCP list_webhook_events returns hardcoded list, no API call"
  - "POST /translations/import flagged (not orphan) — has Admin UI consumer but missing @UseGuards(JwtAuthGuard), security gap"
  - "POST /auth/forgot-password flagged (not orphan) — Phase 1 temporary token-in-response behavior is known incomplete feature"
  - "GET / root route classified as orphan — no programmatic consumer, returns HTML about page only"

patterns-established:
  - "Consumer verification: grep Admin UI (admin-ui/src/) and MCP tools (mcp-server/src/tools/) for API path strings before classifying a route"

requirements-completed:
  - CLEAN-01

# Metrics
duration: 35min
completed: 2026-04-02
---

# Phase 4 Plan 1: Endpoint Inventory Summary

**Complete audit of 77 backend routes across 10 controllers mapped to Admin UI, MCP, and public API consumers — 4 orphans and 2 flagged partial features identified**

## Performance

- **Duration:** 35 min
- **Started:** 2026-04-02T17:30:00Z
- **Completed:** 2026-04-02T18:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Audited all 10 backend controllers and mapped 77 routes to known consumers
- Identified 4 confirmed orphans: `GET /`, `POST /files/presign`, `POST /files/complete`, `GET /webhooks/supported-events`, `GET /webhooks/:id`
- Identified 2 flagged partial features: missing auth guard on `POST /translations/import`, Phase 1 token-in-response on `POST /auth/forgot-password`
- Documented cascading cleanup dependencies for each orphan (DTOs, service methods, modules, AWS SDK packages)
- Confirmed `files/` module has zero active consumers — ready for removal in Plan 02

## Task Commits

1. **Task 1: Extract all backend routes and cross-reference with consumers** - `7c3aef1` (docs)

## Files Created/Modified

- `.planning/ENDPOINT-INVENTORY.md` — Complete 77-route inventory with consumer mapping, orphan details, flagged feature analysis, and cascading dependency documentation

## Decisions Made

- `GET /webhooks/:id` classified as orphan: MCP `update_webhook` tool calls PATCH directly (passes webhookId inline) without first fetching the webhook; Admin UI has no webhook management UI.
- `GET /webhooks/supported-events` classified as orphan: MCP `list_webhook_events` tool returns a hard-coded events list without making any HTTP call.
- `POST /translations/import` flagged (not orphan): The Admin UI TranslationsPage does call this endpoint, but the missing `@UseGuards(JwtAuthGuard)` is a security gap worth flagging for user review.
- Initial count estimate in frontmatter was 60; actual audit found 77 routes. The Summary file header has a corrected note.

## Deviations from Plan

None — plan executed exactly as written. The audit discovered more routes than the initial estimate (77 vs ~60), which is expected given the thorough per-controller review.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- ENDPOINT-INVENTORY.md is ready as the evidence base for Plan 02 (orphan removal)
- Plan 02 should prioritize the `files/` module removal first (cleanest orphan — no consumers, self-contained module)
- The `POST /translations/import` missing auth guard should be presented to the user for decision: add guard (recommended) or document as intentionally public
- `POST /auth/forgot-password` Phase 1 behavior is a known incomplete feature — requires email infrastructure to complete; out of scope for this cleanup phase unless user decides to finish it

---
*Phase: 04-dead-code-cleanup*
*Completed: 2026-04-02*
