---
phase: quick
plan: 260407-ils
type: execute
wave: 1
depends_on: []
files_modified:
  - src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts
autonomous: true
requirements: [bugfix-ai-config-locale-codes]
must_haves:
  truths:
    - "AI translate prompt in DB uses canonical 'nb' instead of 'nb-NO'"
    - "AI translate prompt in DB uses canonical 'da' instead of 'da-DK'"
    - "All four text prompt columns are cleaned of stale locale codes"
  artifacts:
    - path: "src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts"
      provides: "TypeORM migration replacing nb-NO/da-DK with nb/da in ai_config prompts"
  key_links:
    - from: "ai_config.translate_prompt DB value"
      to: "ai-translate.service.ts locale filter"
      via: "Gemini returns keys matching prompt example; filter matches requestedCodes"
      pattern: "nb-NO|da-DK"
---

<objective>
Fix stale locale codes in the `ai_config` database table that cause Norwegian and Danish AI translations to silently fail.

Purpose: Commit `582e055` updated the DEFAULT_TRANSLATE_PROMPT constant in code but forgot a migration to fix the existing DB row. Since `getConfig()` always returns the DB row, Gemini sees `nb-NO`/`da-DK` examples, returns those keys, and the locale filter drops them because only canonical `nb`/`da` exist.

Output: A single TypeORM migration that replaces `nb-NO` with `nb` and `da-DK` with `da` across all four text prompt columns in `ai_config`.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/entities/ai-config.entity.ts
@src/database/migrations/17759000000001-backfill-ai-token-daily-limit.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration to fix locale codes in ai_config prompts</name>
  <files>src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts</files>
  <action>
Create a new TypeORM migration file `17760000000001-fix-ai-config-locale-codes.ts`.

Class name: `FixAiConfigLocaleCodes17760000000001`

The `up` method must run four UPDATE statements on the `ai_config` table, one per text column:
- `translate_prompt`
- `quality_translate_prompt`
- `quality_language_prompt`
- `context_detection_prompt`

Each UPDATE uses `REPLACE()` nested twice to substitute both stale codes:
```sql
UPDATE ai_config
SET translate_prompt = REPLACE(REPLACE(translate_prompt, 'nb-NO', 'nb'), 'da-DK', 'da')
WHERE translate_prompt LIKE '%nb-NO%' OR translate_prompt LIKE '%da-DK%';
```

Repeat for the other three columns. The WHERE clause ensures rows without stale codes are untouched.

The `down` method should be a no-op with a comment explaining the old codes were incorrect and should not be restored.

Follow the exact pattern from `17759000000001-backfill-ai-token-daily-limit.ts` for imports, class structure, and style.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts 2>&1 | head -20</automated>
  </verify>
  <done>Migration file compiles without errors. Contains UPDATE statements for all four prompt columns replacing nb-NO->nb and da-DK->da.</done>
</task>

</tasks>

<verification>
- Migration file exists at `src/database/migrations/17760000000001-fix-ai-config-locale-codes.ts`
- File compiles with `npx tsc --noEmit`
- SQL covers all four text columns: translate_prompt, quality_translate_prompt, quality_language_prompt, context_detection_prompt
- Down migration is a safe no-op
</verification>

<success_criteria>
- Migration file created and compiles cleanly
- After running on stage/prod, `SELECT translate_prompt FROM ai_config` contains `"nb"` not `"nb-NO"` and `"da"` not `"da-DK"`
- Norwegian and Danish AI translations no longer silently dropped by the locale filter
</success_criteria>

<output>
After completion, create `.planning/quick/260407-ils-fix-ai-config-translate-prompt-nb-no-to-/260407-ils-SUMMARY.md`
</output>
