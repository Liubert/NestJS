---
phase: quick
plan: 260409-r9s
subsystem: sandbox/translations-ui
tags: [sandbox, reset, per-key, auto-translate, frontend]
requires: []
provides: [DELETE /translations/projects/:slug/namespaces/:ns/entries/:key/locales/:locale/sandbox-value]
affects: [TranslationsPage, columns.tsx, SandboxService, AutoTranslateWorkerService]
tech-stack:
  added: []
  patterns: [fire-and-forget worker trigger, useMutation with DELETE, Popconfirm inline cell button]
key-files:
  created: []
  modified:
    - src/modules/translations/auto-translate-worker.service.ts
    - src/modules/translations/sandbox.service.ts
    - src/modules/translations/translations.controller.ts
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/TranslationsPage.tsx
decisions:
  - "triggerForKey uses translateSingleKey private method following same pattern as translateNamespace — fire-and-forget, logs error, not a checkpoint"
  - "deleteKeySandboxValue allows only owner or admin — consistent with deleteNamespace/deleteLocale access pattern"
  - "Reset button shows only when isSandbox && locale !== defaultLocale && val — no button for empty cells (nothing to reset)"
  - "Button is 18x18 text/danger type with ReloadOutlined, placed after text in Space — subtle but discoverable"
metrics:
  duration: ~5 min
  completed: "2026-04-09"
  tasks: 2
  files: 5
---

# Phase quick Plan 260409-r9s: Add Reset Per-Key-Locale Button to Sandbox Summary

**One-liner:** Per-cell sandbox reset via DELETE endpoint + fire-and-forget re-translation trigger for individual key+locale pairs.

## What Was Built

Added surgical reset capability at the key×locale level in sandbox mode:

1. **Backend** — `triggerForKey` method in `AutoTranslateWorkerService` fetches the default-locale source text for a single key and calls the existing `translateKey` logic (fire-and-forget). `deleteKeySandboxValue` in `SandboxService` validates access, guards against resetting the default locale, deletes the sandbox row, updates `sandboxHasChanges`, and fires `triggerForKey`. New `DELETE` endpoint wired to the service.

2. **Frontend** — `columns.tsx` gains `onResetKeyLocale?: (key, locale) => void` as the last `buildColumns` parameter. Each non-default locale cell conditionally renders a small `ReloadOutlined` danger button with `Popconfirm` when `isSandbox && value exists`. `TranslationsPage.tsx` adds `resetKeyLocaleMutation` (DELETE + message + invalidate) and passes it through to `buildColumns`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Backend: triggerForKey + deleteKeySandboxValue + controller endpoint | b7a0199 | auto-translate-worker.service.ts, sandbox.service.ts, translations.controller.ts |
| 2 | Frontend: reset button in locale cells + mutation | ddc828d | columns.tsx, TranslationsPage.tsx |

## Decisions Made

- `triggerForKey` / `translateSingleKey` follows the exact same pattern as `triggerForNamespace` / `translateNamespace` — no new patterns introduced.
- The DELETE SQL `RETURNING id` returns `[rows]` (not `[rows, count]`) — destructuring with `const [deletedRows]` is correct (consistent with existing single-result patterns).
- Reset button hidden when cell value is empty — no point resetting a null/absent translation.
- Access check: owner or admin only — matches `deleteNamespace` and `deleteLocale` guards.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- b7a0199 exists: `git log --oneline | grep b7a0199` — confirmed
- ddc828d exists: `git log --oneline | grep ddc828d` — confirmed
- `triggerForKey` in auto-translate-worker.service.ts — confirmed
- `deleteKeySandboxValue` in sandbox.service.ts — confirmed
- `sandbox-value` in translations.controller.ts — confirmed
- `onResetKeyLocale` in columns.tsx — confirmed
- `resetKeyLocaleMutation` in TranslationsPage.tsx — confirmed
