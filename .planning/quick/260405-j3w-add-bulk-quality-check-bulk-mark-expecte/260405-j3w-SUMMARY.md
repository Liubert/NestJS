---
phase: quick
plan: 260405-j3w
subsystem: translations
tags: [bulk-operations, quality-check, translations, dto, service, controller]
dependency_graph:
  requires: []
  provides: [bulk-quality-check-endpoint, bulk-mark-expected-endpoint, bulk-context-endpoint]
  affects: [translations.controller.ts, translations.service.ts]
tech_stack:
  added: []
  patterns: [sequential-bulk-iteration, per-key-try-catch-accumulation, access-control-once-then-delegate]
key_files:
  created:
    - src/modules/translations/dto/bulk-quality-check.dto.ts
    - src/modules/translations/dto/bulk-mark-expected.dto.ts
    - src/modules/translations/dto/bulk-context.dto.ts
  modified:
    - src/modules/translations/translations.service.ts
    - src/modules/translations/translations.controller.ts
decisions:
  - "bulkQualityCheck iterates keys sequentially (not parallel) — AI calls are rate-limited"
  - "bulkMarkExpected skips per-key failures silently and returns success count — partial success is valid"
  - "Bulk routes placed before /:key parameterized routes to avoid NestJS treating 'bulk-*' as key params"
  - "bulk-quality-check uses JwtAuthGuard only (no BlockMcpGuard) — MCP agents may legitimately use it"
metrics:
  duration: ~8 minutes
  completed: 2026-04-05T10:51:01Z
  tasks_completed: 3
  files_changed: 5
---

# Quick Task 260405-j3w: Add Bulk Quality Check, Bulk Mark-Expected, and Bulk Context Endpoints

**One-liner:** 3 new bulk endpoints (POST bulk-quality-check, POST bulk-mark-expected, PATCH bulk-context) with DTOs and service methods delegating to existing per-key operations.

## What Was Built

Three bulk operation endpoints added to `TranslationsController` under `projects/:slug/namespaces/:ns/entries/`:

| Endpoint | Method | Guard | Returns |
|----------|--------|-------|---------|
| `bulk-quality-check` | POST | JwtAuthGuard | `{ results: [{key, status, results|error}] }` |
| `bulk-mark-expected` | POST | JwtAuthGuard + BlockMcpGuard | `{ marked: N }` |
| `bulk-context` | PATCH | JwtAuthGuard + BlockMcpGuard | `{ updated: N }` |

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create 3 bulk DTOs | 0b45430 | bulk-quality-check.dto.ts, bulk-mark-expected.dto.ts, bulk-context.dto.ts |
| 2 | Add 3 bulk service methods | b1c50d2 | translations.service.ts |
| 3 | Add 3 bulk endpoints to controller | b3cd917 | translations.controller.ts |

## Implementation Details

**DTOs:**
- `BulkQualityCheckDto` — optional `keys?: string[]` (max 500); omitting means "all keys"
- `BulkMarkExpectedDto` — required `keys: string[]` (1–500) + optional `locale?: string`
- `BulkContextUpdateDto` — `updates: BulkContextItemDto[]` with nested `ValidateNested` (key + context max 1000 chars)

**Service methods:**
- `bulkQualityCheck`: access-check once, resolve key list (or fetch all if omitted), iterate sequentially with per-key try/catch
- `bulkMarkExpected`: access-check once, iterate keys × locales (cross-product when no locale given), count successes
- `bulkUpdateContext`: access-check once, `keyRepo.update` per item, sum `affected` rows

**Controller placement:** All 3 bulk routes are registered BEFORE the parameterized `/:key` routes to prevent route collision.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `src/modules/translations/dto/bulk-quality-check.dto.ts` — exists
- [x] `src/modules/translations/dto/bulk-mark-expected.dto.ts` — exists
- [x] `src/modules/translations/dto/bulk-context.dto.ts` — exists
- [x] `translations.service.ts` contains `bulkQualityCheck`, `bulkMarkExpected`, `bulkUpdateContext`
- [x] `translations.controller.ts` contains 3 new bulk route handlers
- [x] Commits: 0b45430, b1c50d2, b3cd917
- [x] `npx tsc --noEmit --project tsconfig.build.json` passes with 0 errors
- [x] `npx eslint` on all modified files passes with 0 errors
