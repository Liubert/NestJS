---
phase: quick
plan: 260410-fmt
subsystem: ai-translate
tags: [ai, translate, quality, feedback-loop, gemini]
dependency_graph:
  requires: []
  provides: [previousComment-in-bulk-translate]
  affects: [auto-translate-worker, bulk-translate-and-save, prompt-builder]
tech_stack:
  added: []
  patterns: [quality-feedback-loop, per-entry-previousComment]
key_files:
  created: []
  modified:
    - src/modules/translations/ai-prompt-builder.ts
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.controller.ts
decisions:
  - "First non-null quality comment per key used as previousComment — simple heuristic, avoids comment aggregation complexity"
  - "getQualityCommentsForKeys added to SandboxService to avoid injecting repositories into the controller"
  - "previousQualityNote rendered in chunkData JSON object (not as a separate prompt section) — mirrors how context is passed, keeps the per-entry note adjacent to the text Gemini is translating"
metrics:
  duration: 15
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_changed: 5
---

# Phase quick Plan 260410-fmt: Pass previousComment to bulkTranslate Summary

**One-liner:** Previous quality review comments now flow from sandbox_values into every DB-aware bulkTranslate call so Gemini addresses flagged issues when retranslating.

## What Was Built

Closed the translation quality feedback loop by wiring `qualityComment` from `sandbox_values` into all four DB-aware callers of `bulkTranslate` / `translateForLocales`.

### Changes by file

**`ai-prompt-builder.ts`**
- `buildBulkTranslatePrompt` chunk entry type extended with `previousQualityNote?: string | null`
- When truthy, the note is included in the `chunkData` JSON as `"previousQualityNote": "Previous quality feedback: {note} — address this issue in the new translation."`
- Added `CRITICAL — Previous quality feedback` instruction block to the prompt text, placed before `Return ONLY valid JSON`

**`ai-translate.service.ts`**
- `bulkTranslate` entries type extended with `previousComment?: string | null`
- Chunk passed to `buildBulkTranslatePrompt` maps `previousComment` → `previousQualityNote`
- `translateForLocales` accepts new optional `previousComment?: string | null` param and forwards it to `bulkTranslate`

**`auto-translate-worker.service.ts`**
- `translateKey`: `sandboxRepo.find` select extended to include `qualityComment`; first non-null comment collected and passed to `translateForLocales`
- `translateKeysBulk`: `sandboxRepo.find` select extended to include `qualityComment`; `qualityCommentByKey` map built during existing-locale grouping loop; `previousComment` passed per entry when building `entries` for `bulkTranslate`

**`sandbox.service.ts`**
- Added `getQualityCommentsForKeys(projectId, namespaceId, keyNames)` helper method
- Joins `translation_keys` with `sandbox_values` to return `Map<keyName, qualityComment>` for the given key names
- Returns first non-null comment per key

**`translations.controller.ts`** (`bulkTranslateAndSave`)
- Calls `sandboxService.getQualityCommentsForKeys` after resolving project and namespace
- Merges `previousComment` into each entry before passing to `bulkTranslate`

### Stateless endpoints unchanged
`aiTranslate` and `bulkAiTranslate` (no DB context) were intentionally not modified — they have no access to sandbox quality comments and continue working without `previousComment`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

All modified files exist. Both task commits verified:
- `6c7f9bc` feat(quick-260410-fmt): add previousComment to prompt builder and service layer
- `1a75061` feat(quick-260410-fmt): wire previousComment in worker and controller callers
