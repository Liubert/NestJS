---
phase: quick
plan: 260406-g0q
subsystem: translations
tags: [locale, registry, migration, consolidation, refactor]
dependency_graph:
  requires: []
  provides:
    - locale-registry.ts single source of truth for all locale definitions
    - DB migration renames guidance->locale_skill, normalizes nb-NO/da-DK, backfills
    - GET /translations/supported-locales public API endpoint
    - useSupportedLocales React Query hook
  affects:
    - ai-translate.service.ts
    - auto-translate-worker.service.ts
    - quality-worker.service.ts
    - translations.service.ts
    - translations.controller.ts
    - public-translations.controller.ts
    - locale.entity.ts
    - create-locale.dto.ts
    - update-locale.dto.ts
    - mcp-server/src/tools/project-management.ts
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
    - admin-ui/src/pages/translations/components/EntryEditModal.tsx
    - admin-ui/src/pages/translations/components/columns.tsx
tech_stack:
  added: []
  patterns:
    - Single source of truth locale registry pattern
    - React Query hook for semi-static API data (24h staleTime)
    - Idempotent DB migration with column rename and data normalization
key_files:
  created:
    - src/modules/translations/locale-registry.ts
    - src/database/migrations/17756000000001-locale-registry-consolidation.ts
    - admin-ui/src/hooks/useSupportedLocales.ts
  modified:
    - src/modules/translations/entities/locale.entity.ts
    - src/modules/translations/dto/create-locale.dto.ts
    - src/modules/translations/dto/update-locale.dto.ts
    - src/modules/translations/translations.service.ts
    - src/modules/translations/translations.controller.ts
    - src/modules/translations/public-translations.controller.ts
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/quality-worker.service.ts
    - src/database/migrations/17753000000001-backfill-enriched-guidance.ts
    - mcp-server/src/tools/project-management.ts
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
    - admin-ui/src/pages/translations/components/EntryEditModal.tsx
    - admin-ui/src/pages/translations/components/columns.tsx
  deleted:
    - src/modules/translations/locale-guidelines.ts
    - admin-ui/src/constants/supported-languages.ts
    - admin-ui/src/constants/locale-guidelines.ts
decisions:
  - "Used nb-NO block from locale-guidelines.ts for nb entry (more detailed, includes 'Fil er hankjønn' note)"
  - "Migration inlines locale skill map as self-contained snapshot — avoids import from live code"
  - "BackfillEnrichedGuidance migration (17753000000001) updated to inline locale data after locale-guidelines.ts was deleted"
  - "useSupportedLocales uses 24h staleTime — locale list is semi-static, no need to fetch on every render"
  - "getFlagForCode in columns.tsx changed to a parameter — enables hook-derived data to flow from component to builder"
metrics:
  duration: "~30 minutes"
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_changed: 18
---

# Phase quick Plan 260406-g0q: Locale Registry Consolidation Summary

**One-liner:** Unified all scattered locale metadata (3 backend constants + 2 frontend files) into single `locale-registry.ts` with 37 locales, renamed `guidance` to `localeSkill` through the full stack, and eliminated hardcoded frontend language arrays via a public API endpoint + React Query hook.

## What Was Done

### Task 1: Backend — locale-registry.ts, migration, rename guidance->localeSkill, public endpoint

**locale-registry.ts** created as single source of truth containing:
- `LocaleDefinition` interface: `{ code, name, aliases, localeSkill, flag }`
- 37 locale entries (union of all previous sources)
- `LOCALE_REGISTRY_MAP` (indexed by code) and `LOCALE_ALIAS_MAP` (indexed by alias) for O(1) lookups
- Helper functions: `getLocaleDefinition`, `getLocaleName`, `getLocaleSkill`, `getLocaleFlag`

**Renamed guidance -> localeSkill throughout backend:**
- `locale.entity.ts`: property `guidance` → `localeSkill`, DB column `guidance` → `locale_skill` (via `@Column({ name: 'locale_skill' })`)
- `create-locale.dto.ts`: field renamed, code regex tightened from BCP 47 to 2-3 char ISO 639
- `update-locale.dto.ts`: field renamed
- `translations.service.ts`: `LocaleInfo.guidance` → `localeSkill`, `createLocale`/`updateLocale` signatures updated, LOCALE_GUIDELINES import replaced with `getLocaleSkill()`
- `translations.controller.ts`: all 4 guidance map builds updated (`l.localeSkill`)
- `auto-translate-worker.service.ts`: removed local LOCALE_NAMES, uses `getLocaleName()`
- `ai-translate.service.ts`: removed LOCALE_NAMES and DEFAULT_TARGET_LOCALES, uses `DEFAULT_TARGET_LOCALE_CODES` + `getLocaleName()`
- `quality-worker.service.ts`: `l.guidance` → `l.localeSkill`

**Public endpoint** added: `GET /translations/supported-locales` returns `LOCALE_REGISTRY` array (no auth required).

**Migration 17756000000001** (idempotent):
1. Rename column `guidance` → `locale_skill` (skips if already renamed)
2. Normalize `nb-NO` → `nb` per project (merge or rename, preserving aliases)
3. Normalize `da-DK` → `da` per project (same logic)
4. Backfill `locale_skill` for NULL rows using inline locale map

**Existing migration 17753000000001** updated to inline locale guidelines content (removes import dependency on deleted `locale-guidelines.ts`).

**MCP create_locale tool** updated:
- Description now says "Use 2-char ISO 639-1 codes" (not BCP 47)
- Zod schema enforces `/^[a-z]{2,3}$/`
- Parameter renamed `guidance` → `localeSkill`

**Deleted:** `src/modules/translations/locale-guidelines.ts`

### Task 2: Frontend — fetch supported locales from API, remove hardcoded data

**`admin-ui/src/hooks/useSupportedLocales.ts`** created:
- `useSupportedLocales()`: React Query hook, `GET /translations/supported-locales`, 24h staleTime
- `useLocaleMap()`: derived hook returning `Map<string, LocaleDefinition>`
- `useFlagForCode()`: derived hook returning `(code: string) => string`

**`ProjectSettingsPage.tsx`** updated:
- Imports replaced: `SUPPORTED_LANGUAGES`, `LANGUAGE_BY_CODE`, `getFlagForCode`, `LOCALE_GUIDELINES` removed
- Uses `useSupportedLocales()` + derived `localeMap`
- Locale dropdown options derived from API data
- `guidance` form field renamed to `localeSkill`; auto-fill on locale select uses `localeMap.get(code)?.localeSkill`
- API mutation payloads use `localeSkill` field

**`columns.tsx`** updated:
- Removed `getFlagForCode` import
- `buildColumns()` now accepts `getFlagForCode: (code: string) => string` as parameter

**`TranslationsPage.tsx`** updated:
- Removed `getFlagForCode` import
- Added `useSupportedLocales()` hook, derives `getFlagForCode` via `useCallback`
- Passes `getFlagForCode` to `buildColumns()` call

**`EntryEditModal.tsx`** updated:
- Removed `getFlagForCode` import
- Added `useSupportedLocales()` hook, derives `getFlagForCode` locally

**Deleted:**
- `admin-ui/src/constants/supported-languages.ts`
- `admin-ui/src/constants/locale-guidelines.ts`

## Verification

- Backend TypeScript: `npx tsc --project tsconfig.build.json --noEmit` — no errors
- Frontend TypeScript: `cd admin-ui && npx tsc --noEmit` — no errors
- Backend lint: `npm run lint:check` — no errors in modified files (pre-existing issues in test files unrelated)
- Frontend lint: `npm run lint` — no errors in modified files (2 pre-existing errors in QualityBadge.tsx unrelated)
- No `.guidance` references in translations module
- No `LOCALE_NAMES` constants remaining
- No `SUPPORTED_LANGUAGES` or `LOCALE_GUIDELINES` in frontend pages

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 70f36a9 | Backend: locale-registry.ts, migration, rename guidance->localeSkill, public endpoint |
| Task 2 | c966903 | Frontend: useSupportedLocales hook, remove hardcoded data |

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing migration 17753000000001-backfill-enriched-guidance.ts imported locale-guidelines.ts**
- **Found during:** Task 1 (after deleting locale-guidelines.ts)
- **Issue:** Existing migration had `import { LOCALE_GUIDELINES } from '../../modules/translations/locale-guidelines'` — TypeScript compilation failed after deletion
- **Fix:** Inlined the locale guidelines content directly in the migration file as a self-contained snapshot with `LOCALE_GUIDELINES_SNAPSHOT` constant
- **Files modified:** `src/database/migrations/17753000000001-backfill-enriched-guidance.ts`
- **Commit:** 70f36a9

## Known Stubs

None. All locale data is wired from the live registry/API.

## Self-Check: PASSED

- locale-registry.ts: EXISTS `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/src/modules/translations/locale-registry.ts`
- Migration: EXISTS `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/src/database/migrations/17756000000001-locale-registry-consolidation.ts`
- useSupportedLocales.ts: EXISTS `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui/src/hooks/useSupportedLocales.ts`
- Task 1 commit 70f36a9: EXISTS
- Task 2 commit c966903: EXISTS
