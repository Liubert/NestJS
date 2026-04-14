---
phase: quick
plan: 260406-gca
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/quality-worker.service.ts
  - src/modules/translations/ai-translate.service.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Re-checked sandbox entries pass their previous qualityComment to Gemini as context"
    - "Gemini prompt includes previousReviewerNote when prior feedback exists"
    - "Gemini is instructed not to penalize issues already resolved"
  artifacts:
    - path: "src/modules/translations/quality-worker.service.ts"
      provides: "Selects qualityComment from sandbox_values and passes as previousComment"
    - path: "src/modules/translations/ai-translate.service.ts"
      provides: "Accepts previousComment in item type and includes in prompt"
  key_links:
    - from: "src/modules/translations/quality-worker.service.ts"
      to: "src/modules/translations/ai-translate.service.ts"
      via: "previousComment field in items array passed to bulkCheckQuality"
      pattern: "previousComment"
---

<objective>
Pass previous quality reviewer comment to Gemini when re-checking sandbox entries, so the AI has context about prior feedback.

Purpose: When a translation is edited after a quality check, the re-check should know what issues were flagged before, avoiding re-flagging resolved issues and providing continuity.
Output: Updated quality-worker.service.ts and ai-translate.service.ts with previousComment flow.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/quality-worker.service.ts
@src/modules/translations/ai-translate.service.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add previousComment to quality check data flow</name>
  <files>src/modules/translations/quality-worker.service.ts, src/modules/translations/ai-translate.service.ts</files>
  <action>
**In quality-worker.service.ts — `processBatch` method:**

1. In the sandbox values query (line ~188), add `sv.quality_comment AS quality_comment` to the select list.

2. Update the `getRawMany` type to include `quality_comment: string | null`.

3. When building the `valuesByKey` map (line ~200), also track quality comments. Change the inner map value from `string` (just the value) to store both value and comment. Use a separate map or extend the existing structure. Simplest approach: create a parallel `commentsByKeyLocale` map: `Map<string, Map<string, string | null>>` keyed by key_id then locale_id.

4. When building `items` and `defaultItems` arrays (line ~208 area), add `previousComment?: string | null` to the item type. For each locale entry in the translations map, collect any non-null quality comments. If ANY locale for this key has a previous comment, concatenate them into a single previousComment string. Keep it simple: `const comments = [...collected].filter(Boolean); const previousComment = comments.length ? comments.join('; ') : null;`. Include `previousComment` in the item pushed to `items` / `defaultItems`.

**In ai-translate.service.ts:**

1. In `bulkCheckQuality` method (line ~355), add `previousComment?: string | null` to the items array type parameter.

2. In `buildBulkQualityPrompt` method (line ~522), add `previousComment?: string | null` to the items type parameter.

3. In `buildBulkQualityPrompt`, in the JSON payload built for Gemini (the `JSON.stringify(items, null, 2)` at line ~581): before stringifying, map items to include `previousReviewerNote` when `previousComment` is non-null. Use inline mapping:
   ```
   const payload = items.map(item => ({
     key: item.key,
     source: item.source,
     context: item.context,
     translations: item.translations,
     ...(item.previousComment && { previousReviewerNote: item.previousComment }),
   }));
   ```
   Then `JSON.stringify(payload, null, 2)`.

4. In the system prompt text within `buildBulkQualityPrompt` (the template string starting at line ~551), add after the comment scoring rule (line ~565, after "Comment: empty string if >= 95..."):
   `If "previousReviewerNote" is present, treat it as prior feedback on an earlier version. Do not penalize for issues already resolved.`
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - quality-worker.service.ts selects qualityComment from sandbox_values and passes non-null comments as previousComment in items
    - ai-translate.service.ts accepts previousComment in item type, includes as previousReviewerNote in Gemini JSON payload when non-null
    - System prompt instructs Gemini to treat previousReviewerNote as prior feedback and not penalize resolved issues
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- `npm run lint:js` passes
- Review the built prompt manually: previousReviewerNote appears only when previousComment is non-null
</verification>

<success_criteria>
- Re-checked sandbox entries with existing qualityComment pass that comment to Gemini
- New entries (qualityComment is null) do not include previousReviewerNote in the prompt
- No type errors, lint passes
</success_criteria>

<output>
After completion, create `.planning/quick/260406-gca-add-previouscomment-to-quality-check-pas/260406-gca-SUMMARY.md`
</output>
