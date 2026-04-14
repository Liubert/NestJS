---
phase: quick
plan: 260408-kgy
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/ai-prompt-builder.ts
  - src/modules/translations/ai-prompt-builder.spec.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "buildBulkTranslatePrompt sends entries as a JSON object keyed by translation key, not as a JSON array"
    - "Dot-notation keys like 'nav.home' appear verbatim as JSON object keys in the prompt payload"
    - "Regression test confirms object-keyed format and rejects array format for dot-notation keys"
  artifacts:
    - path: "src/modules/translations/ai-prompt-builder.ts"
      provides: "Fixed buildBulkTranslatePrompt with object-keyed chunkData"
      contains: "chunkData[e.key]"
    - path: "src/modules/translations/ai-prompt-builder.spec.ts"
      provides: "Regression tests for dot-notation key format"
      contains: "nav.home"
  key_links:
    - from: "src/modules/translations/ai-prompt-builder.ts"
      to: "src/modules/translations/ai-translate.service.ts"
      via: "buildBulkTranslatePrompt return value parsed as Record<string, unknown>"
      pattern: "Object\\.entries\\(parsed\\)"
---

<objective>
Fix the bulk_translate_and_save bug where Gemini returns numeric indices instead of key names when dot-notation keys (e.g. `nav.home`, `btn.save`) are sent as a JSON array.

Purpose: The parser in ai-translate.service.ts looks up translations by key name (e.g. `translations["nav.home"]`), but Gemini responds with `{"0": {...}, "1": {...}}` when the input is an array. This causes all entries to be filtered out, resulting in `saved: {created: 0, updated: 0}`.

Output: Fixed `buildBulkTranslatePrompt` that sends entries as an object keyed by translation key, plus regression tests.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/ai-prompt-builder.ts
@src/modules/translations/ai-prompt-builder.spec.ts
@src/modules/translations/ai-translate.service.ts

<interfaces>
<!-- From ai-prompt-builder.ts (lines 258-301) — the function to fix -->
export function buildBulkTranslatePrompt(
  chunk: Array<{
    key: string;
    text: string;
    context?: string;
    targetLocales?: string[];
  }>,
  translateRules: string,
  contextDetectionPrompt: string | null | undefined,
  localeGuidanceSection: string,
): string;

<!-- From ai-translate.service.ts (lines 169-176) — how the response is consumed -->
// Parser iterates Object.entries(parsed) expecting keys to be translation key names:
for (const [key, value] of Object.entries(parsed)) {
  const entry = value as {
    contextNeed?: string;
    contextReason?: string;
    translations?: Record<string, string>;
  };
  // ...
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add regression test for dot-notation keys in buildBulkTranslatePrompt</name>
  <files>src/modules/translations/ai-prompt-builder.spec.ts</files>
  <behavior>
    - Test: entries with dot-notation keys (e.g. "nav.home", "btn.save") produce an object-keyed JSON payload, NOT an array
    - Test: the JSON payload contains the exact key names as object keys (e.g. `"nav.home": {`)
    - Test: the JSON payload does NOT start with `[` (array format)
    - Test: each entry in the object has `text`, `targetLanguages` fields, and optionally `context`
    - Test: entries without context omit the `context` field from the object value
  </behavior>
  <action>
Add a new describe block `buildBulkTranslatePrompt -- dot-notation key format (regression)` to the existing spec file, AFTER the existing context-handling describe block. Write these tests:

1. `serializes entries as a JSON object keyed by translation key, not an array` -- build prompt with entries having dot-notation keys (`nav.home`, `btn.save`, `errors.required`), parse the "Entries to translate:" section, confirm it parses as an object with those exact keys (not numeric indices).

2. `preserves dot-notation keys verbatim in the JSON payload` -- confirm the raw prompt string contains `"nav.home":` and `"btn.save":` as JSON object keys.

3. `includes text and targetLanguages in each entry value` -- parse the JSON payload and verify each value has `text` and `targetLanguages` string fields.

4. `omits context field when entry has no context` -- one entry with context, one without; verify only the one with context has the `context` field in its value object.

All tests call `buildBulkTranslatePrompt(...)` with `baseRules`, `null` contextDetectionPrompt, and empty localeGuidanceSection (same pattern as existing tests). Run tests -- they MUST FAIL (RED phase) because the current implementation still produces an array.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx jest src/modules/translations/ai-prompt-builder.spec.ts --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>New regression tests exist and fail because buildBulkTranslatePrompt still outputs an array format</done>
</task>

<task type="auto">
  <name>Task 2: Fix buildBulkTranslatePrompt to use object-keyed format</name>
  <files>src/modules/translations/ai-prompt-builder.ts</files>
  <action>
In `buildBulkTranslatePrompt` (lines 269-279), replace the array-producing `chunk.map(...)` with an object-keyed structure:

**Before (array):**
```typescript
const chunkData = chunk.map((e) => {
  const codes = e.targetLocales ?? [];
  return {
    key: e.key,
    text: e.text,
    targetLanguages: codes.map((code) => `${getLocaleName(code)} (${code})`).join(', '),
    ...(e.context ? { context: e.context } : {}),
  };
});
```

**After (object keyed by translation key):**
```typescript
const chunkData: Record<string, { text: string; targetLanguages: string; context?: string }> = {};
for (const e of chunk) {
  const codes = e.targetLocales ?? [];
  chunkData[e.key] = {
    text: e.text,
    targetLanguages: codes.map((code) => `${getLocaleName(code)} (${code})`).join(', '),
    ...(e.context ? { context: e.context } : {}),
  };
}
```

This produces JSON like `{"nav.home": {"text": "Home", "targetLanguages": "Norwegian (nb)"}}` instead of `[{"key": "nav.home", ...}]`. Gemini will mirror the same key names back since they are now object keys, not array elements.

The prompt template string already instructs Gemini to return `{ "<key>": { ... } }` format (line 292), so no prompt text changes needed. The `JSON.stringify(chunkData)` at line 299 will now serialize the object format automatically.

Do NOT change the function signature, the prompt text, or any other part of the file.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx jest src/modules/translations/ai-prompt-builder.spec.ts --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>All tests pass (GREEN phase): both new regression tests and all existing context-handling tests pass. The entries JSON in the prompt is now an object keyed by translation key name.</done>
</task>

</tasks>

<verification>
1. All 9+ tests in `ai-prompt-builder.spec.ts` pass (existing context tests + new regression tests)
2. The prompt output for dot-notation keys contains `"nav.home":` as an object key, NOT `[{"key":"nav.home",...}]`
3. No changes to `ai-translate.service.ts` -- the parser already uses `Object.entries(parsed)` which works with both formats, but now Gemini will return the correct key names
4. `npm run lint:js` passes with no new errors
</verification>

<success_criteria>
- `buildBulkTranslatePrompt` produces object-keyed JSON: `{"nav.home": {"text": "Home", "targetLanguages": "..."}, "btn.save": {...}}`
- All existing tests continue to pass (no regressions)
- New tests specifically verify dot-notation keys are preserved as object keys
- Lint passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260408-kgy-fix-bulk-translate-and-save-bug-gemini-r/260408-kgy-SUMMARY.md`
</output>
