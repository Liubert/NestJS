---
phase: quick
plan: 260410-eow
subsystem: translations/auto-translate
tags: [performance, batch, ai-translate, worker]
dependency_graph:
  requires: [ai-translate.service.bulkTranslate]
  provides: [translateKeysBulk]
  affects: [pollAndProcess, translateNamespace, processInitTranslateLocales]
tech_stack:
  added: []
  patterns: [batch-upsert, In-operator-batch-lookup]
key_files:
  created: []
  modified:
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/auto-translate-worker.service.spec.ts
decisions:
  - "translateKeysBulk uses a single sandboxRepo.find(In([allKeyIds])) to batch-filter existing values instead of N individual queries"
  - "translateKey preserved unchanged for translateSingleKey single-key retranslation path"
  - "localeGuidance passed as undefined when no skills are configured (empty object check)"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-10"
  tasks_completed: 1
  files_modified: 2
---

# Phase quick Plan 260410-eow: Batch Auto-Translate Worker Summary

**One-liner:** Replace N per-key Gemini calls in auto-translate worker with single `translateKeysBulk()` batch call, reducing 20 keys from 20 API calls to ceil(20/10)=2 calls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add translateKeysBulk method and refactor all 3 callers | 011d343 | auto-translate-worker.service.ts, auto-translate-worker.service.spec.ts |

## What Was Built

Added a new `translateKeysBulk` private method to `AutoTranslateWorkerService` and refactored all three batch callers to use it:

**`translateKeysBulk(projectId, keys[], nonDefaultLocales[])`:**
1. Batch DB lookup — single `sandboxRepo.find({ keyId: In(allKeyIds) })` instead of N individual lookups
2. Filters entries: keys with all locales already present are excluded from `bulkTranslate`
3. Single `aiTranslateService.bulkTranslate(entries, projectId, guidance)` call for the whole batch
4. Single UPSERT for all translated values (reuses existing UNNEST pattern)
5. Per-key `contextNeed`/`contextReason` persistence via UPDATE after UPSERT

**Refactored callers:**
- `pollAndProcess`: was a `for` loop calling `translateKey` per key → now single `translateKeysBulk` call per project
- `translateNamespace`: was a `for` loop → now single `translateKeysBulk` call
- `processInitTranslateLocales`: was a `for` loop → now single `translateKeysBulk([locale])` call

**Preserved unchanged:**
- `translateKey` and `translateSingleKey` — single-key retranslation path (used by `triggerForKey`)

## Decisions Made

- **Batch sandbox lookup with `In` operator:** Single DB query replaces N individual `sandboxRepo.find` calls inside the old loop. Requires `In` import from typeorm.
- **`translateKey` preserved for `translateSingleKey`:** Single-key path doesn't benefit from batching and has a different query (namespace-filtered, keyId-filtered).
- **localeGuidance passed only if non-empty:** `Object.keys(localeGuidance).length ? localeGuidance : undefined` — consistent with existing `translateKey` pattern.

## Unit Tests

New `describe('AutoTranslateWorkerService — translateKeysBulk')` block with 6 tests:
- Calls `bulkTranslate` once with all keys (not `translateForLocales` N times)
- Filters keys where all locales have existing sandbox values
- Handles locale code normalisation (nb-NO → nb fallback in results)
- Issues a single UPSERT for all translations (not N separate inserts)
- Persists `contextNeed` per key after bulk translation
- `pollAndProcess` handles 429 rate-limit by skipping remaining keys

All 10 tests pass (4 existing + 6 new).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx jest --testPathPattern=auto-translate-worker --no-coverage` — 10/10 PASS
- `npx tsc -p tsconfig.build.json --noEmit` — 0 errors
- `npx eslint src/modules/translations/auto-translate-worker.service.ts src/modules/translations/auto-translate-worker.service.spec.ts` — 0 errors

## Self-Check: PASSED

- [x] `src/modules/translations/auto-translate-worker.service.ts` — modified and committed
- [x] `src/modules/translations/auto-translate-worker.service.spec.ts` — modified and committed
- [x] Commit 011d343 exists
- [x] All tests pass
