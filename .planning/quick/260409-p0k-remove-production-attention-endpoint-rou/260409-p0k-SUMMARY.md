---
phase: quick
plan: 260409-p0k
subsystem: translations
tags: [cleanup, dead-code, endpoints]
dependency_graph:
  requires: []
  provides: [cleaner-controller, cleaner-service]
  affects: [translations.controller.ts, translations.service.ts, ENDPOINT-INVENTORY.md]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - src/modules/translations/translations.controller.ts
    - src/modules/translations/translations.service.ts
    - .planning/ENDPOINT-INVENTORY.md
decisions:
  - "Kept sandbox attention endpoint (SandboxController) untouched — it is the correct consumer"
  - "MCP tool get_translations_needing_attention confirmed to already call sandbox path, no change needed"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-09"
  tasks_completed: 2
  files_modified: 3
---

# Quick Task 260409-p0k: Remove Production Attention Endpoint Summary

**One-liner:** Removed incorrect production-table attention endpoint (~153 lines dead code) and updated ENDPOINT-INVENTORY to reflect sandbox as the correct attention consumer.

## What Was Done

### Task 1: Remove production attention endpoint and service method

Deleted the `GET /translations/projects/:slug/namespaces/:ns/attention` route from `TranslationsController` and its backing `getAttentionItems()` method (~153 lines) from `TranslationsService`.

The method was querying `translation_values` (production table) which is incorrect — attention items should come from sandbox where active editing happens. The sandbox endpoint `GET /translations/projects/:slug/sandbox/namespaces/:ns/attention` in `SandboxController` is the correct implementation.

**Commit:** `89488de`

### Task 2: Update ENDPOINT-INVENTORY.md

- Row 27: Changed status from `active` to `removed`, updated consumer description to "None (was incorrectly reading production table)"
- Added row `47a`: New entry for `GET /translations/projects/:slug/sandbox/namespaces/:ns/attention` (SandboxController) with `MCP: get_translations_needing_attention` as consumer, status `active` — this endpoint was missing from the inventory entirely

**Commit:** `7cfccaa`

## Verification

1. `npx tsc --noEmit -p tsconfig.build.json` — Backend compiles with same pre-existing errors (3 in ai-translate.service.ts, unrelated to these changes). No new errors introduced.
2. `grep "getAttentionItems" src/modules/translations/translations.controller.ts translations.service.ts` — Returns nothing (exit code 1 = no matches).
3. MCP tool confirmed: `get_translations_needing_attention` calls `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/attention` — sandbox path, unchanged.
4. `grep "attention" .planning/ENDPOINT-INVENTORY.md` — Row 27 shows `removed`, row 47a shows sandbox endpoint as `active`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/translations/translations.controller.ts` — modified, verified no `getAttentionItems`
- `src/modules/translations/translations.service.ts` — modified, verified no `getAttentionItems`
- `.planning/ENDPOINT-INVENTORY.md` — updated, attention rows correct
- Commits `89488de` and `7cfccaa` exist in git log
