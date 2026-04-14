---
phase: quick
plan: 260410-fmt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/ai-prompt-builder.ts
  - src/modules/translations/ai-translate.service.ts
  - src/modules/translations/auto-translate-worker.service.ts
  - src/modules/translations/translations.controller.ts
autonomous: true
requirements: [PREV-COMMENT-TRANSLATE]
must_haves:
  truths:
    - "When Gemini retranslates a key, the prompt includes previous quality feedback so Gemini can address the issues"
    - "Auto-translate worker (both translateKey and translateKeysBulk) loads qualityComment from sandbox_values and passes it to bulkTranslate"
    - "bulkTranslateAndSave controller endpoint loads qualityComment from sandbox_values for keys being retranslated"
    - "Stateless endpoints (ai-translate, ai-translate/bulk) continue to work without previousComment"
  artifacts:
    - path: "src/modules/translations/ai-prompt-builder.ts"
      provides: "buildBulkTranslatePrompt accepts and renders previousQualityNote per entry"
      contains: "previousQualityNote"
    - path: "src/modules/translations/ai-translate.service.ts"
      provides: "bulkTranslate entries type includes optional previousComment field"
      contains: "previousComment"
    - path: "src/modules/translations/auto-translate-worker.service.ts"
      provides: "translateKey and translateKeysBulk load qualityComment from sandbox"
      contains: "qualityComment"
  key_links:
    - from: "src/modules/translations/auto-translate-worker.service.ts"
      to: "src/modules/translations/ai-translate.service.ts"
      via: "previousComment field in bulkTranslate entries"
      pattern: "previousComment"
    - from: "src/modules/translations/ai-translate.service.ts"
      to: "src/modules/translations/ai-prompt-builder.ts"
      via: "previousComment passed through to buildBulkTranslatePrompt chunk entries"
      pattern: "previousComment.*previousQualityNote"
---

<objective>
Pass previousComment (quality feedback from prior review) to bulkTranslate in all DB-aware translation scenarios so Gemini can address previously identified quality issues when retranslating.

Purpose: Currently quality comments are only fed back during quality re-checks (bulkCheckQuality). When retranslation happens (auto-translate worker, bulk-translate-and-save), Gemini has no awareness of prior quality feedback, so it may reproduce the same issues. This change closes the feedback loop.

Output: Updated prompt builder, service, worker, and controller — previous quality comments flow through to the translate prompt.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/ai-prompt-builder.ts
@src/modules/translations/ai-translate.service.ts
@src/modules/translations/auto-translate-worker.service.ts
@src/modules/translations/translations.controller.ts
@src/modules/translations/entities/sandbox-value.entity.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add previousComment to prompt builder and service layer</name>
  <files>src/modules/translations/ai-prompt-builder.ts, src/modules/translations/ai-translate.service.ts</files>
  <action>
1. **ai-prompt-builder.ts — `buildBulkTranslatePrompt`:**
   - Extend the chunk entry type to include `previousQualityNote?: string | null`.
   - In the `chunkData` construction loop, if `e.previousQualityNote` is truthy, add it to the entry object: `previousQualityNote: "Previous quality feedback: {note} — address this issue in the new translation."`.
   - This mirrors the pattern used in `buildBulkQualityPrompt` (line 158-160) where `previousReviewerNote` is conditionally included.

2. **ai-prompt-builder.ts — prompt text:**
   - Add a convergence/feedback instruction block to the bulk translate prompt, BEFORE the "Return ONLY valid JSON" line. Something like:
     ```
     CRITICAL — Previous quality feedback:
     - If an entry has a "previousQualityNote" field, a previous quality review found issues with the translation.
     - You MUST address the specific concern raised. Do NOT reproduce the same translation that was flagged.
     - If the concern was about grammar, fix the grammar. If about meaning, fix the meaning. Etc.
     ```

3. **ai-translate.service.ts — `bulkTranslate`:**
   - Extend the `entries` parameter type to include `previousComment?: string | null`.
   - When building the chunk for `buildBulkTranslatePrompt`, pass `previousQualityNote: e.previousComment` in the chunk entry (only if truthy, to keep prompt clean).

4. **ai-translate.service.ts — `translateForLocales`:**
   - Add optional `previousComment?: string | null` parameter (after `context`).
   - Pass it through to `bulkTranslate` in the single-entry array as `previousComment`.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - `buildBulkTranslatePrompt` accepts and renders `previousQualityNote` per entry in prompt JSON and instruction text
    - `bulkTranslate` entries type includes `previousComment?: string | null`
    - `translateForLocales` accepts and forwards `previousComment`
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire previousComment in worker and controller callers</name>
  <files>src/modules/translations/auto-translate-worker.service.ts, src/modules/translations/translations.controller.ts</files>
  <action>
1. **auto-translate-worker.service.ts — `translateKeysBulk`:**
   - The existing `sandboxRepo.find()` on line 511 already queries by `projectId, keyId: In(allKeyIds), isDeleted: false` with `select: ['keyId', 'localeId']`.
   - Extend the `select` to also include `'qualityComment'`.
   - Build a map of keyId -> aggregated quality comments. For each key, collect all non-null `qualityComment` values from its sandbox rows, join with "; " (semicolon-space), or take just the first one. Simple approach: `Map<string, string>` where value is the first non-null comment found for that key.
   - When building the `entries` array (line 524-545), look up the comment map and pass `previousComment` to each entry if a comment exists.

2. **auto-translate-worker.service.ts — `translateKey`:**
   - The existing `sandboxRepo.find()` on line 403 queries by `projectId, keyId, isDeleted: false` with `select: ['localeId']`.
   - Extend the `select` to also include `'qualityComment'`.
   - Collect non-null `qualityComment` values from `existingSandbox`, join with "; " or take first.
   - Pass as `previousComment` to `translateForLocales` (the new param added in Task 1).

3. **translations.controller.ts — `bulkTranslateAndSave` (line 198):**
   - After resolving `project` and `namespace` but before calling `bulkTranslate`, load existing sandbox quality comments for the keys being translated.
   - Query: use sandboxService or direct repo access. Since the controller already has `sandboxService`, add a lightweight helper or use inline query.
   - Actually, the simplest approach: after getting the project and namespace, query sandbox_values for matching keys to get their qualityComment. The entries have `key` (key name), so:
     a. Resolve key entities from the namespace by key names: query `translation_keys` where `namespace_id = ns.id AND key IN (keyNames)`.
     b. For found keys, query `sandbox_values` where `project_id AND key_id IN (foundKeyIds) AND quality_comment IS NOT NULL`.
     c. Build a map: keyName -> aggregated qualityComment.
     d. Pass `previousComment` per entry when building `entriesWithLocales`.
   - IMPORTANT: This is the controller method, not a service. To avoid adding repository injection to the controller, delegate to sandboxService. Add a small method `getQualityCommentsForKeys(projectId: string, namespaceId: string, keyNames: string[]): Promise<Map<string, string>>` to `sandbox.service.ts` that does the lookup and returns keyName -> comment map.

4. **sandbox.service.ts — add helper `getQualityCommentsForKeys`:**
   - Accept projectId, namespaceId, keyNames (string[]).
   - Query: JOIN sandbox_values with translation_keys where ns.id = namespaceId, key IN keyNames, quality_comment IS NOT NULL.
   - Group by key name, pick first non-null comment per key (or join with "; ").
   - Return `Map<string, string>`.

5. In the controller `bulkTranslateAndSave`, call this helper and merge comments into entries:
   ```typescript
   const commentMap = await this.sandboxService.getQualityCommentsForKeys(
     project.id, namespace.id, dto.entries.map(e => e.key),
   );
   const entriesWithLocales = dto.entries.map((e) => ({
     ...e,
     targetLocales,
     previousComment: commentMap.get(e.key) ?? undefined,
   }));
   ```
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30 && npm run lint:js 2>&1 | tail -5</automated>
  </verify>
  <done>
    - `translateKeysBulk` loads qualityComment from sandbox and passes per-entry previousComment to bulkTranslate
    - `translateKey` loads qualityComment from sandbox and passes to translateForLocales
    - `bulkTranslateAndSave` controller loads quality comments via sandboxService helper and passes per-entry previousComment to bulkTranslate
    - New `getQualityCommentsForKeys` helper exists on SandboxService
    - TypeScript compiles, lint passes
    - Stateless endpoints (ai-translate, ai-translate/bulk) unchanged — no previousComment, no DB lookup
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — no type errors
2. `npm run lint:js` passes — no lint violations
3. Manual review: `buildBulkTranslatePrompt` output includes previousQualityNote instruction block and per-entry note when present
4. Manual review: stateless endpoints (aiTranslate, bulkAiTranslate) are not modified and continue working without previousComment
</verification>

<success_criteria>
- All 4 callers of bulkTranslate/translateForLocales that have DB context now pass previousComment when quality feedback exists
- The Gemini translate prompt includes an instruction block explaining how to use previous quality feedback
- Per-entry previousQualityNote appears in the prompt JSON only when a comment exists (no noise for clean keys)
- Stateless endpoints are untouched
- TypeScript compiles, lint passes
</success_criteria>

<output>
After completion, create `.planning/quick/260410-fmt-pass-previouscomment-to-bulktranslate-in/260410-fmt-SUMMARY.md`
</output>
