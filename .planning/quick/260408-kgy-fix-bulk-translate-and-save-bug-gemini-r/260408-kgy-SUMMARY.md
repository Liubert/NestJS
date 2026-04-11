---
phase: quick
plan: 260408-kgy
subsystem: translations/ai
tags: [bug-fix, ai-translate, prompt-builder, tdd]
dependency_graph:
  requires: []
  provides: [object-keyed bulk translate prompt]
  affects: [ai-translate.service.ts, buildBulkTranslatePrompt]
tech_stack:
  added: []
  patterns: [object-keyed Record<string, ...> over array for Gemini compatibility]
key_files:
  created: []
  modified:
    - src/modules/translations/ai-prompt-builder.ts
    - src/modules/translations/ai-prompt-builder.spec.ts
decisions:
  - "Object-keyed chunkData over array: Gemini mirrors input structure. Array input with dot-notation keys produced numeric response keys {\"0\":{...}} instead of {\"nav.home\":{...}}. Switching to Record<string,{}> keyed by e.key fixes the parse mismatch at zero cost."
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-08T11:51:37Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase quick Plan 260408-kgy: Fix bulk_translate_and_save bug — Gemini returns numeric indices

**One-liner:** Fixed `buildBulkTranslatePrompt` to send entries as a JSON object keyed by translation key name instead of an array, so Gemini mirrors back dot-notation keys (e.g. `"nav.home"`) rather than numeric indices (`"0"`, `"1"`).

## What Was Built

The bulk translate prompt builder was sending entries as a JSON array:
```json
[{"key": "nav.home", "text": "Home", ...}, {"key": "btn.save", ...}]
```

Gemini sees dot-notation keys inside an array and returns:
```json
{"0": {...}, "1": {...}}
```

The parser in `ai-translate.service.ts` uses `Object.entries(parsed)` and looks up each key by name (e.g. `translations["nav.home"]`). With numeric keys, all entries are filtered out, producing `saved: {created: 0, updated: 0}`.

**Fix:** Replace `chunk.map()` array with a `Record<string, {...}>` object keyed by `e.key`. The `key` field is removed from each value object (it is now the object key itself).

New prompt entries JSON format:
```json
{"nav.home": {"text": "Home", "targetLanguages": "Norwegian (nb)"}, "btn.save": {...}}
```

Gemini mirrors the object keys back correctly, so the parser receives `"nav.home"` and `"btn.save"` and the save succeeds.

## Tasks

| # | Name | Commit | Result |
|---|------|--------|--------|
| 1 | Add regression tests for dot-notation key format (RED) | e1c5076 | 4 new tests fail as expected |
| 2 | Fix buildBulkTranslatePrompt to use object-keyed format (GREEN) | 5dad3ed | All 14 tests pass |

## Test Results

- 14 / 14 tests pass in `ai-prompt-builder.spec.ts`
- 4 new regression tests added covering:
  1. Entries serialize as JSON object (not array)
  2. Dot-notation keys preserved verbatim as JSON keys
  3. Each value has `text` and `targetLanguages` fields
  4. `context` field omitted when entry has no context

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/translations/ai-prompt-builder.ts` — modified, contains `chunkData[e.key]`
- `src/modules/translations/ai-prompt-builder.spec.ts` — modified, contains `"nav.home"` regression tests
- Commit `e1c5076` — exists (test RED phase)
- Commit `5dad3ed` — exists (fix GREEN phase)
- All 14 tests pass
