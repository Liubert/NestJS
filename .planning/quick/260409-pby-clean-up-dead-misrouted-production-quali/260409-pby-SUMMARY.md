---
type: quick
id: 260409-pby
completed: "2026-04-09"
duration_minutes: 15
tasks_completed: 3
tasks_total: 3
commits:
  - 8ef3403
  - 7879f5d
  - 7879da5
files_modified:
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/sandbox.controller.ts
  - mcp-server/src/tools/ai.ts
  - src/modules/translations/translations.controller.ts
  - src/modules/translations/translations.service.ts
  - src/modules/translations/dto/bulk-mark-expected.dto.ts (deleted)
  - admin-ui/src/pages/translations/components/api.ts
  - admin-ui/src/pages/translations/components/QualityBadge.tsx
  - admin-ui/src/pages/translations/components/EntryEditModal.tsx
---

# Quick Task 260409-pby Summary

**One-liner:** Migrated bulk-quality-check from production to sandbox controller, removed 5 dead production quality/expected methods, cleaned up UI and MCP to match sandbox-first architecture.

## What Was Done

### Task 1: Add bulkSandboxQualityCheck to sandbox service + controller, update MCP tool (8ef3403)

- Added `bulkSandboxQualityCheck` method to `SandboxService` — iterates target keys calling `runSandboxQualityCheck` per key, collects results in `{ results: Array<{key, status, results} | {key, status, error}> }` shape
- Added `POST /translations/projects/:slug/sandbox/namespaces/:ns/entries/bulk-quality-check` endpoint to `SandboxController` with `BulkQualityCheckDto`
- Updated MCP `bulk_check_quality` tool URL from production path to sandbox path
- Updated MCP response parsing to match the new `{ results }` shape (was incorrectly expecting `{ checked, skipped }`)

### Task 2: Remove dead production endpoints and service methods (7879f5d)

Removed from `translations.controller.ts`:
- `POST projects/:slug/namespaces/:ns/entries/bulk-quality-check` — now on sandbox
- `POST projects/:slug/namespaces/:ns/entries/bulk-mark-expected` — completely dead
- `POST projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` — bypassed sandbox
- `DELETE projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` — bypassed sandbox

Removed imports: `BulkQualityCheckDto`, `BulkMarkExpectedDto`, `BlockMcpGuard` (no longer used in active code).

Removed from `translations.service.ts`:
- `runQualityCheck` — only called by removed bulkQualityCheck
- `markAsExpected` — only called by removed controller endpoints
- `unmarkExpected` — only called by removed controller endpoints
- `bulkQualityCheck` — moved to sandbox
- `bulkMarkExpected` — no callers remain
- `persistQualityResult` (private) — never called after removal of runQualityCheck
- `contextNeedPriority` function + `CONTEXT_NEED_PRIORITY` constant — only used in removed runQualityCheck

Deleted `src/modules/translations/dto/bulk-mark-expected.dto.ts` — no remaining consumers.

### Task 3: Clean up UI (7879da5)

- Removed `markExpected` and `unmarkExpected` from `api.ts` (called removed production endpoints)
- `QualityBadge.tsx`: both Popconfirm wrappers for mark/unmark expected now guarded by `!isSandbox` — production tab shows quality badges as read-only
- `EntryEditModal.tsx`: `handleToggleExpected` returns early if `!isSandbox`; the toggle button is hidden entirely in production via `isSandbox &&` render condition

## Deviations from Plan

None — plan executed exactly as written.

One observation: the production `bulkQualityCheck` endpoint was already broken for the MCP tool (the MCP expected `{ checked, skipped }` but the endpoint returned `{ results: Array<...> }`). The sandbox version now returns the correct `{ results }` shape and the MCP response parsing was updated accordingly.

## Known Stubs

None.

## Self-Check

- [x] `8ef3403` commit exists
- [x] `7879f5d` commit exists
- [x] `7879da5` commit exists
- [x] `bulk-mark-expected.dto.ts` deleted
- [x] No active `mark-expected` or `bulk-quality-check` endpoints in `translations.controller.ts`
- [x] No `markAsExpected`, `unmarkExpected`, `bulkQualityCheck`, `bulkMarkExpected`, `runQualityCheck` in `translations.service.ts`
- [x] MCP `bulk_check_quality` calls sandbox path
- [x] `markExpected`/`unmarkExpected` removed from `admin-ui/src/pages/translations/components/api.ts`
- [x] TypeScript check passes on admin-ui (`npx tsc --noEmit`)
- [x] Backend lint clean on all modified files
