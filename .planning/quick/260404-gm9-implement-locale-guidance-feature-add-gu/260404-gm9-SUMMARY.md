---
phase: quick
plan: 260404-gm9
subsystem: translations
tags: [locale-guidance, ai-prompts, admin-ui, mcp]
dependency_graph:
  requires: []
  provides: [locale-guidance-field, ai-prompt-guidance-injection]
  affects: [translations-service, ai-translate-service, auto-translate-worker, quality-worker, admin-ui-settings, mcp-tools]
tech_stack:
  added: []
  patterns: [locale-guidance-auto-fill, ai-prompt-enrichment]
key_files:
  created:
    - src/database/migrations/17751000000001-locale-guidance.ts
    - src/modules/translations/locale-guidelines.ts
    - admin-ui/src/constants/locale-guidelines.ts
  modified:
    - src/modules/translations/entities/locale.entity.ts
    - src/modules/translations/dto/create-locale.dto.ts
    - src/modules/translations/dto/update-locale.dto.ts
    - src/modules/translations/translations.service.ts
    - src/modules/translations/translations.controller.ts
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/quality-worker.service.ts
    - admin-ui/src/pages/projects/ProjectSettingsPage.tsx
    - mcp-server/src/tools/project-management.ts
decisions:
  - LOCALE_GUIDELINES covers 37 locales with 5 bullet points each covering formality, plural forms, script specifics, date/number formats, common pitfalls
  - Auto-fill guidance from LOCALE_GUIDELINES on locale creation when user does not provide explicit guidance
  - Guidance injected as appendix to AI prompts rather than modifying prompt templates
  - Quality worker passes guidance to bulkCheckQuality for quality-aware checks
metrics:
  duration_minutes: 15
  completed: "2026-04-04T09:19:00Z"
---

# Quick Task 260404-gm9: Implement Locale Guidance Feature Summary

Per-locale AI translation guidance field with 37 built-in defaults, injected into all AI prompts (translate, quality check, auto-translate), surfaced in Admin UI and MCP tools.

## What Was Done

### Task 1: DB migration + Entity + DTOs + Service + Controller
- Created migration adding nullable `guidance` text column to `translation_locales`
- Added `guidance: string | null` to LocaleEntity
- Added optional `guidance` field (MaxLength 3000) to CreateLocaleDto and UpdateLocaleDto
- Updated `createLocale()` and `updateLocale()` service methods to accept and persist guidance
- Updated controller to pass guidance from DTO to service
- Updated `LocaleInfo` interface and `getProjectDetails()` to include guidance in API responses

### Task 2: Locale guidelines constant + AI prompt integration
- Created `LOCALE_GUIDELINES` constant covering 37 locales with research-quality guidance (formality, plural forms, script specifics, date/number formats, common pitfalls)
- `createLocale()` auto-fills guidance from `LOCALE_GUIDELINES` when user doesn't provide one
- Added `localeGuidance` parameter to `translate()`, `translateForLocales()`, `bulkCheckQuality()`, `checkQuality()` in AiTranslateService
- Each method appends a "Language-specific guidance" section to the AI prompt when guidance is available
- Updated controller AI endpoints to fetch locale guidance from DB and pass to AI service
- Added `getProjectLocales()` helper to TranslationsService
- Updated auto-translate worker to build guidance map from locale entities and pass to `translateForLocales()`
- Updated quality worker to build guidance map and pass to `bulkCheckQuality()`

### Task 3: Admin UI guidance in locale modals
- Created frontend `LOCALE_GUIDELINES` constant (mirror of backend)
- Add Locale modal pre-fills guidance textarea when a language is selected from dropdown
- Edit Locale modal loads and displays saved guidance value
- Both mutations send guidance to API
- Locale tags show info icon (with tooltip) when guidance is configured

### Task 4: MCP tools
- Added optional `guidance` parameter (max 3000 chars) to `create_locale` MCP tool schema
- Passes guidance in POST body to API
- Success message indicates guidance status (custom vs auto-filled from defaults)
- Tool description mentions guidance feature

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d8981aa | DB migration, entity, DTOs, service, controller for guidance field |
| 2 | 56177b5 | LOCALE_GUIDELINES constant + AI prompt injection |
| 3 | 790ea46 | Admin UI locale modals with guidance pre-fill |
| 4 | 56ede08 | MCP create_locale guidance param |
| fix | 332e523 | Prettier formatting fix |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Quality worker locale guidance passthrough**
- **Found during:** Task 2
- **Issue:** Plan only mentioned auto-translate worker, but quality-worker.service.ts also calls bulkCheckQuality without locale guidance
- **Fix:** Added locale guidance map construction and passthrough in quality worker
- **Files modified:** src/modules/translations/quality-worker.service.ts

**2. [Rule 2 - Missing functionality] ProjectDetails API response missing guidance**
- **Found during:** Task 1
- **Issue:** Plan did not mention updating getProjectDetails() to include guidance in API response, but Admin UI needs it
- **Fix:** Added guidance to LocaleInfo interface and getProjectDetails locale mapping
- **Files modified:** src/modules/translations/translations.service.ts

## Known Stubs

None - all data sources are wired end-to-end.

## Verification Results

- Backend TypeScript: compiles cleanly (tsconfig.build.json)
- Admin UI TypeScript: compiles cleanly
- MCP TypeScript: compiles cleanly
- ESLint/Prettier: passes after formatting fix
- Migration file: correct ALTER TABLE ADD/DROP COLUMN statements
- LOCALE_GUIDELINES: 37 entries confirmed

## Self-Check: PASSED

All 13 files verified present. All 5 commits verified in git log.
