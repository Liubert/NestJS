---
phase: quick
plan: 260409-qyy
subsystem: translations / sandbox / admin-ui
tags: [sandbox, reset, locale, auto-translate, frontend, backend]
dependency_graph:
  requires: []
  provides: [per-locale-sandbox-reset]
  affects: [sandbox.service.ts, translations.controller.ts, columns.tsx, TranslationsPage.tsx]
tech_stack:
  added: []
  patterns: [POST endpoint for locale-scoped delete, optional buildColumns params for sandbox actions]
key_files:
  created: []
  modified:
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.controller.ts
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
decisions:
  - Default locale protection enforced at backend (BadRequestException) and frontend (button hidden) — defense in depth
  - Quality reset UPDATE after DELETE is a no-op safety net (rows already deleted); intentional by design
  - resetLocaleTranslationsMutation excluded from useMemo deps — same stable-ref pattern as deleteMutation
metrics:
  duration: ~10 min
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260409-qyy: Add Per-Locale Sandbox Reset Summary

**One-liner:** Per-locale sandbox reset via new DELETE endpoint + danger sync button in locale column headers, triggering auto-translate re-translation for the cleared locale.

## What Was Built

Added the ability for project owners and admins to reset sandbox translations for a single non-default locale within a namespace. Previously only full-namespace reset was available; this allows targeted reset when AI translations for one locale are unsatisfactory.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend — service method + controller endpoint | 79b8632 | sandbox.service.ts, translations.controller.ts |
| 2 | Frontend — per-locale reset button + mutation | 060abcf | columns.tsx, TranslationsPage.tsx |

## Implementation Details

### Backend (Task 1)

**New service method** `deleteLocaleSandboxTranslations` in `sandbox.service.ts`:
- Access check: owner or admin only (ForbiddenException)
- Rejects default locale with BadRequestException — source locale is the reference, must not be reset
- SQL DELETE targeting `locale_id = $2` (vs. namespace reset which excludes default)
- Sets `sandboxHasChanges: true` if rows were deleted
- Always triggers `autoTranslateWorkerService.triggerForNamespace` to re-translate
- Quality state reset UPDATE runs after DELETE (no-op if all rows were deleted — safety net)

**New endpoint** `POST /translations/projects/:slug/namespaces/:ns/locales/:locale/reset-translations`:
- Guarded by JwtAuthGuard + @ApiBearerAuth
- Delegates to `sandboxService.deleteLocaleSandboxTranslations`

### Frontend (Task 2)

**columns.tsx changes:**
- Added `SyncOutlined` to icon imports
- Extended `buildColumns` with two optional params: `onResetLocale?: (locale: string) => void` and `defaultLocale?: string`
- Locale column title now wraps in `<Space>` and conditionally renders a Popconfirm + danger Button when `isSandbox && onResetLocale && locale !== defaultLocale`

**TranslationsPage.tsx changes:**
- Added `resetLocaleTranslationsMutation` (same pattern as existing namespace-level mutations)
- Passes `isSandbox ? (locale) => resetLocaleTranslationsMutation.mutate(locale) : undefined` and `defaultLocale` to `buildColumns`
- `defaultLocale` added to useMemo deps array
- `resetLocaleTranslationsMutation` excluded from deps (stable ref, same pattern as `deleteMutation`)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/translations/sandbox.service.ts` — method `deleteLocaleSandboxTranslations` added after line 904
- `src/modules/translations/translations.controller.ts` — endpoint `POST .../locales/:locale/reset-translations` added after `resetNamespaceTranslations`
- `admin-ui/src/pages/translations/components/columns.tsx` — `SyncOutlined` imported, `onResetLocale`/`defaultLocale` params added, locale title renders Popconfirm button
- `admin-ui/src/pages/translations/TranslationsPage.tsx` — `resetLocaleTranslationsMutation` defined, passed to `buildColumns`
- Commit 79b8632: backend changes
- Commit 060abcf: frontend changes
- Backend TypeScript: no errors
- Frontend TypeScript: no errors
- Lint: no new errors introduced
