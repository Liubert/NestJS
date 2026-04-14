---
phase: quick-260405-p2j
plan: 01
subsystem: translations
tags: [ai, mcp, translation, sandbox, quality]
key-files:
  created:
    - src/modules/translations/dto/bulk-translate-and-save.dto.ts
  modified:
    - src/modules/translations/translations.controller.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/quality-worker.service.ts
    - src/modules/translations/quality-worker.module.ts
    - src/modules/translations/translations.module.ts
    - mcp-server/src/tools/ai.ts
decisions:
  - "Orchestration lives in the controller, not AiTranslateService, to avoid circular dependencies (AiTranslateService has no access to SandboxService or TranslationsService)"
  - "QualityWorkerService.triggerNow() is synchronous (void), not async, to avoid the require-await lint rule"
  - "QualityWorkerModule exports QualityWorkerService and is imported by TranslationsModule — avoids duplicating providers"
  - "persistQualityResults() added to SandboxService with per-locale DB updates following quality-worker.service.ts pattern"
metrics:
  duration: "15 min"
  completed: "2026-04-05"
  tasks: 2
  files: 7
---

# Phase quick-260405-p2j Plan 01: Bulk Translate and Save Summary

**One-liner:** Single-step endpoint and MCP tool that translates N keys, saves to sandbox, and optionally runs inline quality check — replacing the 3-step bulk_ai_translate -> bulk_import -> check_entry_quality flow.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Backend — DTO, service method, controller endpoint, triggerNow | 37ee869 | dto, controller, sandbox.service, quality-worker.service, quality-worker.module, translations.module |
| 2 | MCP tool — bulk_translate_and_save | cf5669f | mcp-server/src/tools/ai.ts |

## What Was Built

### Backend (Task 1)

**New DTO** `BulkTranslateAndSaveDto`:
- `projectSlug` (required), `namespace` (required)
- `entries: BulkAiTranslateEntryDto[]` (1–200, reuses existing entry DTO)
- `targetLocales?: string[]`, `skipQuality?: boolean`

**`QualityWorkerService.triggerNow()`** — public, synchronous, fires `pollAndProcess()` as fire-and-forget. If a cycle is already running, the call is a no-op.

**`SandboxService.persistQualityResults()`** — accepts projectId, namespace slug, and AI quality results map. Resolves keys and locales, then updates each `sandbox_values` row with score, level, comment, content hash, and `quality_review_state = 'checked'`.

**`POST /translations/ai-translate/bulk-and-save`** — orchestrates:
1. Resolve project + namespace + locale guidance
2. `bulkTranslate()` → per-key translation map
3. `sandboxService.batchUpsert()` → save to sandbox
4. `skipQuality=false`: `bulkCheckQuality()` inline → `persistQualityResults()` → return `{ translations, quality, saved }`
5. `skipQuality=true`: `qualityWorkerService.triggerNow()` fire-and-forget → return `{ translations, saved, qualityStatus: "queued" }`

**Module wiring**: `QualityWorkerModule` now exports `QualityWorkerService` and is imported by `TranslationsModule`.

### MCP Tool (Task 2)

**`bulk_translate_and_save`** tool registered in `mcp-server/src/tools/ai.ts`:
- Schema: `projectSlug`, `namespace`, `entries`, `targetLocales?`, `skipQuality?`
- Calls `POST /translations/ai-translate/bulk-and-save`
- Formats response with per-key per-locale quality results and agent guidance block
- Handles both `skipQuality=false` (inline results) and `skipQuality=true` (queued message)

## Deviations from Plan

None — plan executed exactly as written. The plan's "chosen approach" (orchestration in controller) was followed precisely.

## Known Stubs

None. All data flows are wired end-to-end.

## Self-Check

- [x] `src/modules/translations/dto/bulk-translate-and-save.dto.ts` — created
- [x] `src/modules/translations/translations.controller.ts` — endpoint added
- [x] `src/modules/translations/sandbox.service.ts` — persistQualityResults added
- [x] `src/modules/translations/quality-worker.service.ts` — triggerNow added
- [x] `mcp-server/src/tools/ai.ts` — tool registered
- [x] Commits 37ee869, cf5669f exist
- [x] Backend `npx tsc --noEmit` — clean
- [x] MCP server `npx tsc --noEmit` — clean
- [x] Lint — no new errors in changed files

## Self-Check: PASSED
