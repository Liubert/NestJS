---
phase: quick
plan: 260406-gca
subsystem: translations/quality
tags: [ai, quality-check, gemini, previousComment]
dependency_graph:
  requires: []
  provides: [previousComment in quality check prompt]
  affects: [quality-worker.service.ts, ai-translate.service.ts]
tech_stack:
  added: []
  patterns: [pass prior feedback as context to Gemini bulk quality check]
key_files:
  created: []
  modified:
    - src/modules/translations/quality-worker.service.ts
    - src/modules/translations/ai-translate.service.ts
decisions:
  - Collect all non-null quality_comment values per key across locales and join with '; ' for the previousComment field — simple and deterministic
  - previousReviewerNote field only emitted in JSON payload when previousComment is truthy — no empty string pollution
metrics:
  duration: 10 min
  completed: 2026-04-06
---

# Phase quick Plan 260406-gca: Add previousComment to quality check pass Summary

Pass previous quality reviewer comment to Gemini when re-checking sandbox entries so the AI has continuity about prior feedback and does not re-flag resolved issues.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add previousComment to quality check data flow | af4b6fc | quality-worker.service.ts, ai-translate.service.ts |

## What Changed

**quality-worker.service.ts:**
- Added `sv.quality_comment AS quality_comment` to the sandbox values select query
- Extended `getRawMany` type to include `quality_comment: string | null`
- Added `commentsByKey: Map<string, string[]>` populated while building `valuesByKey`
- Added `previousComment?: string | null` field to the local item type for both `items` and `defaultItems` arrays
- Computed `previousComment` per key by joining all non-null comments with `'; '`
- Passes `previousComment` when pushing to both `items` and `defaultItems`

**ai-translate.service.ts:**
- Added `previousComment?: string | null` to item type in `bulkCheckQuality` method signature
- Added `previousComment?: string | null` to item type in `buildBulkQualityPrompt` method signature
- Added system prompt instruction: "If `previousReviewerNote` is present, treat it as prior feedback on an earlier version. Do not penalize for issues already resolved."
- The `JSON.stringify(items)` payload now maps each item to include `previousReviewerNote: \`Previous reviewer note: ${item.previousComment}\`` when `previousComment` is truthy — omitted entirely when null/undefined

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- Files modified: both present and committed at af4b6fc
- TypeScript (`tsconfig.build.json`): no errors
- Lint on modified files: no errors
