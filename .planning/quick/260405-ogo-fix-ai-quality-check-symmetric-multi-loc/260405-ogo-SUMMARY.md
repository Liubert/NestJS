---
phase: quick
plan: 260405-ogo
subsystem: translations / mcp-server
tags: [ai, quality-check, mcp, bulk, multi-locale]
dependency_graph:
  requires: []
  provides:
    - POST /translations/ai-quality-check/bulk
    - Updated MCP ai_quality_check tool (multi-locale)
  affects:
    - mcp-server/src/tools/ai.ts
    - src/modules/translations/translations.controller.ts
tech_stack:
  added: []
  patterns:
    - Bulk single-item wrapper pattern (items = [{ key: 'input', ... }]) for reusing bulkCheckQuality
key_files:
  created:
    - src/modules/translations/dto/bulk-quality-check-ai.dto.ts
  modified:
    - src/modules/translations/translations.controller.ts
    - mcp-server/src/tools/ai.ts
decisions:
  - Used 'input' as synthetic key for the single-item wrapper so bulkCheckQuality can be reused without a new service method
  - Kept old POST /translations/ai-quality-check endpoint untouched for backward compatibility
metrics:
  duration_minutes: 10
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260405-ogo: Fix AI Quality Check — Symmetric Multi-Locale Support

**One-liner:** Added POST /translations/ai-quality-check/bulk endpoint and updated MCP ai_quality_check tool to accept a locale-keyed translations map, matching ai_translate's multi-locale symmetry.

## What Was Done

The `ai_quality_check` MCP tool previously accepted a single `translation + locale + mode` and required N calls for N locales — asymmetric with `ai_translate` which works on all locales in one call. This task made them symmetric.

### Task 1: Backend bulk endpoint

- Created `BulkQualityCheckAiDto` with `source: string`, `translations: Record<string, string>`, optional `projectSlug`, optional `context` (max 1000 chars).
- Added `POST /translations/ai-quality-check/bulk` to `TranslationsController` with `JwtAuthGuard` and `@ApiBearerAuth()`.
- Endpoint wraps the single input into a one-item array (`[{ key: 'input', source, context, translations }]`) and calls the existing `bulkCheckQuality`, then returns `results['input']` — a `Record<locale, { score, level, comment }>`.
- Locale guidance is resolved from project locales if `projectSlug` is provided, matching the same pattern as `aiTranslate` and `bulkAiTranslate`.

### Task 2: MCP tool update

- Replaced `translation`, `locale`, `mode` parameters with `translations: Record<string, string>`.
- Tool now calls `/translations/ai-quality-check/bulk` with `{ source, translations, projectSlug, context }`.
- Output shows per-locale quality lines: `[uk] 95/100 (green) — Good translation`.
- `logWrite` records `localeCount` instead of individual translation/locale fields.

## Verification

- `npx tsc --noEmit --project tsconfig.build.json` — passed (0 errors in backend)
- `npx tsc --noEmit` in `mcp-server/` — passed (0 errors)
- `npm run lint:check` in root — 0 errors in files changed (pre-existing errors in unrelated files not touched)
- Old `POST /translations/ai-quality-check` endpoint confirmed present at line 188 of controller

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 15bf994 | feat(quick-260405-ogo): add bulk AI quality check endpoint for multiple locales |
| 2 | 3be35bf | feat(quick-260405-ogo): update MCP ai_quality_check to use multi-locale bulk endpoint |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/translations/dto/bulk-quality-check-ai.dto.ts` — FOUND
- `src/modules/translations/translations.controller.ts` — modified, FOUND
- `mcp-server/src/tools/ai.ts` — modified, FOUND
- Commit 15bf994 — FOUND
- Commit 3be35bf — FOUND
