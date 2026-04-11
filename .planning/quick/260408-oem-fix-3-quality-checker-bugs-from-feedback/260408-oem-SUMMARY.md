---
phase: quick
plan: 260408-oem
subsystem: sandbox-quality
tags: [bug-fix, quality-checker, caching, tdd]
dependency_graph:
  requires: []
  provides: [quality-cache-hit, default-locale-skip, expected-guard]
  affects: [sandbox.service.ts, sandbox.service.spec.ts]
tech_stack:
  added: []
  patterns: [sha256-content-hash-caching, early-return-guard]
key_files:
  created:
    - src/modules/translations/sandbox.service.spec.ts
  modified:
    - src/modules/translations/sandbox.service.ts
decisions:
  - "Cache quality score by SHA256(value) hash in qualityContentHash column to prevent redundant Gemini calls and non-deterministic score loops"
  - "Skip default locale in runSandboxQualityCheck to match quality-worker pattern (line 242)"
  - "Guard persistQualityResults with qualityReviewState=expected check before update"
metrics:
  duration: "6 minutes"
  completed: "2026-04-08T14:44:16Z"
  tasks: 2
  files: 2
---

# Phase quick Plan 260408-oem: Fix 3 Quality Checker Bugs from Feedback Summary

**One-liner:** SHA256 content-hash cache prevents redundant Gemini calls, default locale skipped, expected state preserved from bulk quality persist.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests for all three quality checker bugs (RED) | 14d2180 | src/modules/translations/sandbox.service.spec.ts (created) |
| 2 | Apply all three fixes to sandbox.service.ts and make tests pass (GREEN) | 0a42c27 | src/modules/translations/sandbox.service.ts |

## What Was Built

Three targeted bug fixes in `SandboxService` backed by 4 unit tests:

**Bug 1 — d0dfd6c6: Cache quality score per value hash**

In `runSandboxQualityCheck`, after the `expected` state early-return and null translation check, a SHA256 hash of the current value is computed. If `qualityReviewState === 'checked'` AND `qualityContentHash` matches that hash, the cached score/level/comment is returned immediately without calling Gemini. When a new quality check is persisted (cache miss path), `qualityContentHash` is also saved so future calls can hit the cache.

This eliminates the agent loop problem: same translation re-checked 3 times in a row now returns the same cached result instead of Gemini variance up to 25 points with contradictory direction.

**Bug 2 — 8730ac53: Skip default locale in runSandboxQualityCheck**

An early return (`results[locale.code] = null; return;`) is added for locales where `isDefault === true` at the very start of the `locales.map` callback, before any repo reads or Gemini calls. This matches the pattern already used by the background quality worker at `quality-worker.service.ts:242`.

Scoring EN→EN is meaningless for translation quality and produced noise (e.g., "Save" scored 70/100 when compared against itself).

**Bug 3 — 4fbdfeb7: Guard persistQualityResults against overwriting expected**

After the existing `!sandboxValue || !sandboxValue.value` null check, a guard `if (sandboxValue.qualityReviewState === 'expected') continue;` prevents the bulk quality persist path from overwriting manually accepted translations. Previously, calling `bulk_translate_and_save` with `skipQuality: false` on a key that was marked expected would silently reset it to a numeric score.

## Test Results

```
PASS src/modules/translations/sandbox.service.spec.ts
  runSandboxQualityCheck
    Bug 1 — cache hit: same value already checked
      ✓ does NOT call checkQuality when hash matches and state is checked
    Bug 1 — cache miss: changed value should trigger re-check
      ✓ calls checkQuality when qualityContentHash does not match current value hash
    Bug 2 — default locale: must be skipped entirely
      ✓ returns null for default locale and does NOT call checkQuality
  persistQualityResults
    Bug 3 — expected guard: must not overwrite entries with reviewState=expected
      ✓ skips update for sandbox values with qualityReviewState=expected

Tests: 4 passed, 4 total
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/modules/translations/sandbox.service.spec.ts` exists
- [x] `src/modules/translations/sandbox.service.ts` modified
- [x] Commit `14d2180` exists (TDD RED)
- [x] Commit `0a42c27` exists (TDD GREEN / fixes)
- [x] All 4 tests pass
- [x] No lint errors in modified files
- [x] Backend TypeScript compilation clean (tsconfig.build.json)
