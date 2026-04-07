---
phase: quick
plan: 260407-ils
subsystem: ai-config
tags: [migration, bugfix, locale-codes, ai-translate]
dependency_graph:
  requires: []
  provides: [ai_config-locale-code-fix]
  affects: [ai-translate, ai-quality-check]
tech_stack:
  added: []
  patterns: [typeorm-migration, sql-replace]
key_files:
  created:
    - src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts
  modified: []
decisions:
  - "down() is a no-op — nb-NO and da-DK were wrong codes; restoring them would reintroduce the silent failure bug"
metrics:
  duration: "5 minutes"
  completed: "2026-04-07"
  tasks: 1
  files: 1
---

# Phase quick Plan 260407-ils: Fix AI Config Locale Codes Summary

**One-liner:** TypeORM migration replacing stale nb-NO/da-DK locale codes with canonical nb/da across all four ai_config prompt columns to unblock Norwegian and Danish AI translations.

## What Was Done

Commit `582e055` updated the `DEFAULT_TRANSLATE_PROMPT` constant in code but left the existing DB row unchanged. Since `getConfig()` always returns the DB row, Gemini was receiving `nb-NO`/`da-DK` as locale examples, returning those keys in the response, and the locale filter was silently dropping them because the project only has canonical `nb`/`da` codes.

Created a single TypeORM migration (`17760000000001-fix-ai-config-locale-codes.ts`) that runs four UPDATE statements — one per text column — using nested `REPLACE()` calls to substitute both stale codes:

- `translate_prompt`
- `quality_translate_prompt`
- `quality_language_prompt`
- `context_detection_prompt`

Each statement is guarded by a `WHERE ... LIKE '%nb-NO%' OR ... LIKE '%da-DK%'` clause so rows without stale codes are untouched. The `down()` method is an intentional no-op.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration to fix locale codes in ai_config prompts | 1190c23 | src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Post-Deploy Step

After deploying, run the migration on stage/prod:

```bash
docker exec nest_js_api_1 npm run migration:run
```

Then verify:

```sql
SELECT translate_prompt FROM ai_config;
```

Should contain `"nb"` not `"nb-NO"` and `"da"` not `"da-DK"`.
