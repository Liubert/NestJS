---
phase: quick
plan: 260409-rsv
subsystem: admin-ui
tags: [translations, sandbox, ux, modal, locale-reset]
dependency_graph:
  requires: [260409-qyy]
  provides: [multi-locale-reset-modal]
  affects: [admin-ui/src/pages/translations/TranslationsPage.tsx]
tech_stack:
  added: []
  patterns: [Promise.all for parallel API calls, controlled Checkbox.Group for multi-select]
key_files:
  created: []
  modified:
    - admin-ui/src/pages/translations/TranslationsPage.tsx
decisions:
  - "Used inline apiClient.post calls in modal onOk instead of resetLocaleTranslationsMutation to avoid N individual success toasts and N invalidate calls — single consolidated message and one invalidate after all resets complete"
  - "Pre-select all non-default locales when modal opens — user can deselect unwanted ones rather than manually selecting from empty state"
metrics:
  duration: 8m
  completed: 2026-04-09
---

# Phase quick Plan 260409-rsv: Replace Reset Namespace Translations With Multi-Locale Modal Summary

**One-liner:** Multi-locale select modal replacing namespace-wide reset confirm dialog, using Checkbox.Group with Select-all toggle and per-locale POST calls via Promise.all.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Replace reset-translations confirm with multi-locale select modal | 448f5b4 | admin-ui/src/pages/translations/TranslationsPage.tsx |

## What Was Built

The "Reset translations" settings action in the sandbox view previously showed a simple `Modal.confirm` that triggered a single namespace-level reset endpoint. This has been replaced with a controlled modal containing:

- A "Select all" checkbox with indeterminate state support
- A `Checkbox.Group` listing all non-default locales
- All non-default locales pre-selected when modal opens
- OK button disabled when no locales are selected
- On confirmation: `Promise.all` fires per-locale `POST /namespaces/:ns/locales/:locale/reset-translations` calls in parallel, shows a single consolidated success message, then calls `invalidate()` once

The `resetNsTranslationsMutation` (which called the now-unused namespace-level reset endpoint) was fully removed. The per-locale column header reset (`resetLocaleTranslationsMutation`) and per-cell reset (`resetKeyLocaleMutation`) are untouched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File exists: `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui/src/pages/translations/TranslationsPage.tsx` — FOUND
- Commit 448f5b4 — FOUND
- TypeScript: `npx tsc --noEmit` exit 0 — PASSED
- Vite build: `npm run build` exit 0 — PASSED
- Lint: pre-existing 2 errors in QualityBadge.tsx, no new errors introduced — PASSED
