---
phase: quick
plan: 260405-nmt
subsystem: translations/ai
tags: [bulk-translate, ai, mcp, gemini]
dependency_graph:
  requires: []
  provides: [bulk-ai-translate-endpoint, bulk-ai-translate-mcp-tool]
  affects: [ai-translate.service, translations.controller, mcp-server/tools/ai]
tech_stack:
  added: []
  patterns: [chunk-processing, graceful-parse-failure, locale-resolution]
key_files:
  created:
    - src/modules/translations/dto/bulk-ai-translate.dto.ts
  modified:
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/translations.controller.ts
    - mcp-server/src/tools/ai.ts
decisions:
  - bulkTranslate uses chunk size 10 as module-level constant BULK_CHUNK_SIZE
  - Parse failures skip chunk keys silently — skippedKeys tracked in usage metadata only, not returned to caller
  - When projectSlug provided without targetLocales, bulk endpoint resolves all non-default project locales automatically
  - MCP tool requires projectSlug (not optional) since locale resolution always needed for MCP context
metrics:
  duration: ~5 minutes
  completed: 2026-04-05
  tasks_completed: 2
  files_changed: 4
---

# Phase quick Plan 260405-nmt: Add Bulk AI Translate MCP Tool and Backend Endpoint Summary

**One-liner:** Bulk AI translation endpoint and MCP tool processing up to 200 keys in chunks of 10 per Gemini call with graceful chunk failure handling.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add BulkAiTranslateDto and bulkTranslate service method | 73739cf | bulk-ai-translate.dto.ts, ai-translate.service.ts |
| 2 | Add bulk translate endpoint and MCP tool | ec6fecc | translations.controller.ts, mcp-server/src/tools/ai.ts |

## What Was Built

### Backend

- **`BulkAiTranslateEntryDto`** — validates individual entry: `key` (MinLength 1), `text` (MinLength 1), optional `context` (MaxLength 1000).
- **`BulkAiTranslateDto`** — wraps entries array (1–200 entries, ValidateNested), optional `projectSlug`, optional `targetLocales`.
- **`AiTranslateService.bulkTranslate()`** — processes entries in chunks of 10, builds a multi-key JSON prompt per chunk, parses response as `Record<string, Record<string, string>>`, skips failing chunks (logs warning, pushes to `skippedKeys`), merges chunk results. Tracks usage with operation `'bulk_translate'` and metadata including `skippedKeys`.
- **`POST /translations/ai-translate/bulk`** — resolves project locales when `projectSlug` given, filters `targetLocales` to project-configured non-default locales, calls `bulkTranslate()`.

### MCP Server

- **`bulk_ai_translate` tool** — fetches project locales, validates `callerLocales` against project, posts to `/translations/ai-translate/bulk`, formats output as JSON keyed by translation key with per-locale values, appends save guidance for `bulk_import`.

## Decisions Made

- **BULK_CHUNK_SIZE = 10** as module-level constant — makes it easy to tune later.
- **Parse failures are silent to caller** — `skippedKeys` tracked in AI usage metadata for observability without breaking the HTTP response.
- **MCP `projectSlug` is required** (not optional) — locale resolution always required for MCP agents, unlike the backend DTO where it's optional.
- **Locale filtering on endpoint** — when `projectSlug` is provided and no `targetLocales`, endpoint auto-resolves to all non-default project locales (agent-friendly default).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/translations/dto/bulk-ai-translate.dto.ts` — exists
- `src/modules/translations/ai-translate.service.ts` — bulkTranslate() method added
- `src/modules/translations/translations.controller.ts` — POST ai-translate/bulk added
- `mcp-server/src/tools/ai.ts` — bulk_ai_translate tool registered
- Commit 73739cf — exists (Task 1)
- Commit ec6fecc — exists (Task 2)
