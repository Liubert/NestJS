---
phase: quick
plan: 260406-ihm
subsystem: ai-translate
tags: [prompt-preview, ai-settings, refactor]
dependency_graph:
  requires: []
  provides: [prompt-preview-endpoint, prompt-preview-ui]
  affects: [ai-translate.service, translations.controller, admin-ui/ai-settings]
tech_stack:
  added: []
  patterns: [prompt-builder-extraction, preview-without-side-effects]
key_files:
  created:
    - src/modules/translations/dto/preview-prompt.dto.ts
    - admin-ui/src/pages/ai-settings/PromptPreview.tsx
  modified:
    - src/modules/translations/ai-translate.service.ts
    - src/modules/translations/translations.controller.ts
    - admin-ui/src/pages/ai-settings/AiSettingsPage.tsx
decisions:
  - buildTranslatePrompt and buildQualityPrompt extracted as public methods — callers (translate, translateForLocales, checkQuality) now delegate prompt construction to these builders
  - translate() converts localeEntries array to typed Record<string, string> with explicit cast to avoid eslint no-unsafe-assignment
  - Preview endpoint defaults targetLocales to {uk: Ukrainian} when empty/absent — provides a useful default for quick tests
metrics:
  duration_minutes: 20
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_changed: 5
---

# Phase quick Plan 260406-ihm: Add Prompt Preview Endpoint and UI Summary

**One-liner:** Prompt preview feature — buildTranslatePrompt/buildQualityPrompt extractors on AiTranslateService, POST /translations/ai-preview-prompt endpoint, and Prompt Preview tab in AI Settings page.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract prompt builders and add preview endpoint | 83c32d5 | ai-translate.service.ts, translations.controller.ts, dto/preview-prompt.dto.ts |
| 2 | Add Prompt Preview tab in AI Settings page | 42c8134 | admin-ui/src/pages/ai-settings/PromptPreview.tsx, AiSettingsPage.tsx |

## What Was Built

### Backend (Task 1)

**New DTO** `src/modules/translations/dto/preview-prompt.dto.ts`:
- `type`: required, 'translate' | 'quality'
- `text`: required, source text
- `targetLocales`: optional, locale code → name map (translate type)
- `localeSkill`: optional, locale code → guidance string map
- `context`: optional string
- `locale`: optional, required for quality type
- `translation`: optional, required for quality type
- `mode`: optional, 'translation_quality' | 'language_quality'

**New public methods on AiTranslateService**:
- `buildTranslatePrompt(text, targetLocales, localeGuidance?, context?): Promise<string>` — loads aiConfig, builds languages string, interpolates translatePrompt template, appends locale guidance
- `buildQualityPrompt(source, translation, locale, mode, context?, localeGuidance?): Promise<string>` — loads aiConfig, selects quality template by mode, builds meaning_rule, adds identicalHint and guidanceHint

**Refactored methods** (no behavior change, logic extracted):
- `translate()` now calls `buildTranslatePrompt` instead of inline prompt construction
- `translateForLocales()` now calls `buildTranslatePrompt`
- `checkQuality()` now calls `buildQualityPrompt`

**New endpoint** `POST /translations/ai-preview-prompt`:
- JWT-protected
- Calls `buildTranslatePrompt` or `buildQualityPrompt` based on `dto.type`
- Returns `{ prompt: string }` — no Gemini call made

### Frontend (Task 2)

**New component** `admin-ui/src/pages/ai-settings/PromptPreview.tsx`:
- Form with type selector (translate/quality)
- Conditional fields: quality shows translation/locale/mode; translate shows targetLocales JSON textarea
- Shared fields: localeSkillStr (JSON), context
- JSON parsing with error messages on malformed input
- Preview button calls POST /translations/ai-preview-prompt
- Result displayed in read-only monospace textarea (20 rows)

**Updated** `AiSettingsPage.tsx`:
- Added third tab "Prompt Preview" with EyeOutlined icon
- Imports PromptPreview component

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/modules/translations/dto/preview-prompt.dto.ts
- FOUND: admin-ui/src/pages/ai-settings/PromptPreview.tsx
- FOUND: commit 83c32d5 (Task 1)
- FOUND: commit 42c8134 (Task 2)
