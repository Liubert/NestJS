---
phase: quick
plan: 260406-he7
subsystem: translations
tags: [locale, auto-translate, init-translate, worker, migration, frontend]
dependency_graph:
  requires: []
  provides: [initTranslate-flag-on-locale, init-translate-worker-loop]
  affects: [auto-translate-worker, locale-entity, create-locale-flow, admin-ui-add-locale-modal]
tech_stack:
  added: []
  patterns: [batch-polling-worker, flag-reset-after-completion]
key_files:
  created:
    - src/database/migrations/17757000000001-add-init-translate.ts
  modified:
    - src/modules/translations/entities/locale.entity.ts
    - src/modules/translations/dto/create-locale.dto.ts
    - src/modules/translations/translations.service.ts
    - src/modules/translations/translations.controller.ts
    - src/modules/translations/auto-translate-worker.service.ts
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
decisions:
  - "Reuse existing translateKey() in worker for init-translate — avoids duplicating AI call logic"
  - "Flag resets to false only when all keys are done (no missing rows found), so multi-cycle translation works automatically"
  - "Process max 20 keys per locale per poll cycle — same limit as existing auto-translate to avoid overloading Gemini"
  - "init-translate loop runs before normal auto-translate in pollAndProcess — ensures new locales get priority"
metrics:
  duration: ~12 minutes
  completed_date: "2026-04-06"
  tasks_completed: 3
  files_changed: 7
---

# Quick Task 260406-he7: Add initTranslate Flag to Locale for One-time Bulk Translation

**One-liner:** initTranslate boolean on translation_locales triggers a one-time batch AI translation of all existing keys for the new locale, processed by the auto-translate worker in cycles of 20 until complete.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration + Entity + DTO + Service + Controller | 810c8a6 | 5 files |
| 2 | Worker init-translate processing loop | ec9bf25 | 1 file |
| 3 | Frontend checkbox in Add Locale modal | 1e79982 | 1 file |

## What Was Built

### Migration
`17757000000001-add-init-translate.ts` adds `init_translate boolean NOT NULL DEFAULT false` to `translation_locales`.

### Entity + DTO
`LocaleEntity` gets `initTranslate` column. `CreateLocaleDto` accepts optional `initTranslate?: boolean` with Swagger docs.

### Service + Controller
`TranslationsService.createLocale()` gains an `initTranslate = false` parameter that persists to DB. Controller passes `dto.initTranslate ?? false` through.

### Worker
New `processInitTranslateLocales()` method in `AutoTranslateWorkerService`:
- Called at the start of each `pollAndProcess()` cycle, before normal auto-translate
- Finds all locales where `init_translate = true`
- For each: queries keys missing sandbox values for that locale (scoped to that locale, not limited to `auto_translate_enabled`)
- If no missing keys: sets `init_translate = false` (done)
- If missing keys: translates up to 20 per cycle using existing `translateKey()`, logs progress
- Runs across multiple poll cycles until all keys are done

### Frontend
`ProjectSettingsPage.tsx` Add Locale modal:
- `Checkbox` imported from antd
- `addLocaleMutation` type extended with `initTranslate?: boolean`
- New `Form.Item` with checkbox "Auto-translate all existing keys for this locale"
- Helper text: "Translates using AI regardless of project auto-translate setting. Runs in background."
- `onOk` handler passes `initTranslate: !!v.initTranslate`

## Deviations from Plan

None — plan executed exactly as written.

The migration was named `17757000000001-add-init-translate.ts` (incrementing from last existing migration `17756000000001`) rather than the plan's example name `17715000000001-add-init-translate.ts` — the plan's example timestamp was illustrative, not prescriptive.

## Verification

- Backend TypeScript (`tsc -p tsconfig.build.json --noEmit`): clean
- Frontend TypeScript (`cd admin-ui && npx tsc --noEmit`): clean
- ESLint on all changed backend files: clean (pre-existing lint errors in unrelated test files excluded per scope boundary rule)

## Self-Check: PASSED

Files created:
- [x] `src/database/migrations/17757000000001-add-init-translate.ts` — exists
- [x] `src/modules/translations/entities/locale.entity.ts` — modified
- [x] `src/modules/translations/dto/create-locale.dto.ts` — modified
- [x] `src/modules/translations/translations.service.ts` — modified
- [x] `src/modules/translations/translations.controller.ts` — modified
- [x] `src/modules/translations/auto-translate-worker.service.ts` — modified
- [x] `admin-ui/src/pages/projects/ProjectSettingsPage.tsx` — modified

Commits: 810c8a6, ec9bf25, 1e79982 — all verified in git log.
