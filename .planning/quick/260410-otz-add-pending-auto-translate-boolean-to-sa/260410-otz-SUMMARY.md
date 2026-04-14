---
phase: quick
plan: 260410-otz
subsystem: translations/sandbox/auto-translate-worker/admin-ui
tags: [pending-flag, auto-translate, spinner, db-flag, migration]
dependency_graph:
  requires: []
  provides: [pending_auto_translate on sandbox_values, DB-backed spinner state]
  affects: [auto-translate-worker, sandbox-service, translations-service, admin-ui translations page]
tech_stack:
  added: []
  patterns: [DB-backed pending state replaces guessed client-side spinner state]
key_files:
  created:
    - src/database/migrations/17763000000001-add-pending-auto-translate.ts
  modified:
    - src/modules/translations/entities/sandbox-value.entity.ts
    - src/modules/translations/entities/locale.entity.ts
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.service.ts
    - src/modules/translations/auto-translate-worker.service.spec.ts
    - admin-ui/src/pages/translations/components/types.ts
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
decisions:
  - processInitTranslateLocales removed; replaced by pending_auto_translate=true on sandbox_value rows + pollAndProcess picking them up
  - pollAndProcess query extended with OR clause for pending rows to bypass auto_translate_enabled check for explicitly-requested translations
  - setPendingFlags helper inserts placeholder rows before translate using INSERT ON CONFLICT DO UPDATE
  - createLocale inserts pending placeholders via raw SQL after locale save (no circular dependency into worker)
metrics:
  duration: ~30min
  completed: 2026-04-10
  tasks: 3
  files: 9
---

# Phase quick Plan 260410-otz: Add pending_auto_translate boolean to sandbox_values Summary

DB-backed `pending_auto_translate` column on sandbox_values replaces client-side guessed spinner logic; `locale.initTranslate` column removed and its behavior re-routed through the pending flag.

## What Was Built

**Problem:** The frontend spinner showed on ALL cells with `null` value and a default locale value present — showing false positives for genuinely empty translations. The `retranslatingCells` `Set<string>` was set on re-translate but never cleared, causing stuck spinners.

**Solution:** Added a `pending_auto_translate boolean NOT NULL DEFAULT false` column to `sandbox_values`. The worker sets it `true` before translating and clears it in the UPSERT on success, or via a cleanup UPDATE on error. The frontend reads `record.pendingAutoTranslate[locale]` from the API response rather than guessing.

## Task Breakdown

### Task 1: Migration + entity + backend

**Commit:** `75326a3`

- **Migration** `17763000000001-add-pending-auto-translate.ts`: `ALTER TABLE sandbox_values ADD COLUMN pending_auto_translate boolean NOT NULL DEFAULT false` + `ALTER TABLE translation_locales DROP COLUMN IF EXISTS init_translate`
- **SandboxValueEntity**: added `@Column pendingAutoTranslate: boolean`
- **LocaleEntity**: removed `initTranslate` column
- **createLocale**: removed `initTranslate` from `localeRepo.create()`; when `initTranslate=true` and locale is non-default, runs raw INSERT to create placeholder sandbox_values with `pending_auto_translate=true` for all keys that have a default-locale sandbox value
- **AutoTranslateWorkerService**:
  - Removed `processInitTranslateLocales()` entirely
  - New `setPendingFlags()` private helper: batch INSERT ON CONFLICT DO UPDATE sets `pending_auto_translate=true` before translating
  - `pollAndProcess` query extended: `AND (p.auto_translate_enabled = true AND sv_tgt.id IS NULL) OR (sv_tgt.pending_auto_translate = true AND (sv_tgt.value IS NULL OR sv_tgt.value = ''))` so pending rows are processed regardless of `auto_translate_enabled`
  - `translateKey` and `translateKeysBulk` UPSERT: added `pending_auto_translate = false` to ON CONFLICT DO UPDATE SET
  - `translateKey` and `translateKeysBulk`: "missing locales" filter now also includes locales where `pendingAutoTranslate=true` even if a row exists
  - Error handling in `translateNamespace` and `translateSingleKey`: clear `pending_auto_translate=false` on caught exceptions so spinners don't get stuck
- **SandboxService**:
  - `SandboxEntryRow` interface: added `pendingAutoTranslate: Record<string, boolean>`
  - `listSandboxEntries` values query: added `COALESCE(sv.pending_auto_translate, false)` to SELECT; build `pendingByKey` map; include in response
  - `getSandboxAttentionItems`: same changes
  - `createSandboxEntry` and `updateSandboxEntry`: return `pendingAutoTranslate: {}` in newly created entries

### Task 2: Frontend

**Commit:** `efec9e8`

- **Entry type**: added `pendingAutoTranslate?: Record<string, boolean>`
- **buildColumns**: removed `retranslatingCells` and `autoTranslateEnabled` parameters; `isPending` now reads `record.pendingAutoTranslate?.[locale] === true` from DB flag instead of guessing from null value
- **TranslationsPage**: removed `retranslatingCells` useState; removed `setRetranslatingCells` call from `resetKeyLocaleMutation.onSuccess`; removed both args from `buildColumns` call and `useMemo` deps array

### Task 3: Spec + lint

**Commit:** `43014e2`

- `pollAndProcess` 429 test: removed first `findBy` mock that was for `processInitTranslateLocales` (method no longer exists — `localeRepo.findBy` is only called once now for per-project locale fetch)
- `translateKey` context test: added trailing `undefined` arg for `previousComment` to match updated call signature (6-arg now)
- All 10 tests pass

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written. The plan's "FINAL DEFINITIVE APPROACH" was implemented exactly.

### Minor clarification

The `setPendingFlags` method uses INSERT ON CONFLICT DO UPDATE rather than a separate UNNEST subquery — it inserts `value=null` placeholders and sets `pending_auto_translate=true` on existing rows too, so the flag is always set even if a row already exists.

## Known Stubs

None.

## Verification Results

- `npx tsc --noEmit -p tsconfig.build.json`: PASS
- `cd admin-ui && npx tsc --noEmit`: PASS
- `npm test -- --testPathPattern=auto-translate-worker --no-coverage`: 10/10 PASS
- Backend lint: no errors in changed files
- Admin-ui lint: no errors in changed files (node_modules missing in worktree; verified via main project eslint)

## Self-Check: PASSED
