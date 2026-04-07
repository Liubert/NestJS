---
phase: quick-260407-hur
plan: 01
subsystem: ui+api
tags: [lint, commit, translations, quality, ui]
key-files:
  created:
    - admin-ui/src/pages/translations/components/AddLocaleModal.tsx
  modified:
    - admin-ui/package.json
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
    - admin-ui/src/pages/translations/components/FilterBar.tsx
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/components/types.ts
    - admin-ui/vite.config.ts
    - src/modules/translations/ai-config.service.ts
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/quality-worker.service.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.service.ts
decisions:
  - "Lint errors in test/translations.e2e-spec.ts and QualityBadge.tsx are pre-existing baseline — not regressions from these changes"
metrics:
  duration: "< 5 min"
  completed: "2026-04-07"
  tasks: 2
  files: 13
---

# Quick Task 260407-hur: Deploy Uncommitted Changes to Stage

**One-liner:** Linted and committed 13 UI+backend files: quality column-header filters, FilterBar settings gear, extracted AddLocaleModal, contextNeed priority merge, and vite preview config.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Lint auto-fix — backend and admin-ui | (no file changes after auto-fix) | Backend: 5 files clean; admin-ui: warnings only, no new errors |
| 2 | Stage and commit all 13 files | 7511168 | 13 files (12 modified + 1 new) |

## Commit

**Hash:** `7511168`
**Message:** `feat(ui+api): quality filters in column header, settings gear, AddLocaleModal, context detection improvements`

**Files in commit (13):**
- `admin-ui/package.json` — fixed duplicate 'preview' script key
- `admin-ui/src/pages/projects/ProjectSettingsPage.tsx` — replaced inline locale form with AddLocaleModal
- `admin-ui/src/pages/translations/TranslationsPage.tsx` — sandbox diff per-namespace, settings dropdown
- `admin-ui/src/pages/translations/components/AddLocaleModal.tsx` — new reusable locale modal (extracted)
- `admin-ui/src/pages/translations/components/FilterBar.tsx` — settings gear replacing dropdowns
- `admin-ui/src/pages/translations/components/columns.tsx` — quality filter in column header
- `admin-ui/src/pages/translations/components/types.ts` — updated FilterBarProps/EntriesTableProps
- `admin-ui/vite.config.ts` — preview config + sourcemap
- `src/modules/translations/ai-config.service.ts` — shortened context detection prompt
- `src/modules/translations/ai-translate.service.ts` — pass contextDetectionPrompt to bulk quality
- `src/modules/translations/quality-worker.service.ts` — poll 30s→10s, TS types, contextInfo priority merge
- `src/modules/translations/sandbox.service.ts` — reset quality after reset-translations; contextNeed priority
- `src/modules/translations/translations.service.ts` — contextNeed priority logic

## Lint Result

- **Backend files in scope:** 0 errors, 0 warnings (clean)
- **Backend overall:** 21 errors, 12 warnings all in `test/translations.e2e-spec.ts` (pre-existing baseline, not in scope)
- **Admin-ui:** 2 errors in `QualityBadge.tsx` + 38 warnings — identical to baseline (confirmed via `git stash` comparison)
- **Verdict:** No regressions introduced

## Debug Artifact

`.planning/debug/reset-translations-not-working.md` remains untracked and was NOT committed — confirmed via `git show --stat HEAD`.

## Deviations from Plan

None. Plan executed exactly as written.

- Backend uses `npm run lint` (lint with `--fix` built-in) not `npm run lint:fix` — plan mentioned `lint:fix` which does not exist; used correct script automatically.

## Self-Check

- Commit `7511168` exists: FOUND
- All 13 files in `git show --stat HEAD`: FOUND
- Debug artifact NOT in commit: CONFIRMED
- No new lint errors: CONFIRMED
