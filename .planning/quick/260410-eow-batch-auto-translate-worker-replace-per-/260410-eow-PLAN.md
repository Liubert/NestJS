---
phase: quick
plan: 260410-eow
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/auto-translate-worker.service.ts
  - src/modules/translations/auto-translate-worker.service.spec.ts
autonomous: true
requirements: [PERF-01]

must_haves:
  truths:
    - "pollAndProcess batches up to 20 keys into a single bulkTranslate call per project (ceil(20/10) = 2 Gemini calls max instead of 20)"
    - "translateNamespace batches all queried keys into a single bulkTranslate call (ceil(N/10) Gemini calls instead of N)"
    - "processInitTranslateLocales batches all missing keys per locale into a single bulkTranslate call"
    - "translateSingleKey still works for single-key retranslation (unchanged path via translateKey)"
    - "contextNeed and contextReason are still persisted per-key after bulk translation"
    - "429 rate-limit errors in pollAndProcess still skip remaining keys for that project"
  artifacts:
    - path: "src/modules/translations/auto-translate-worker.service.ts"
      provides: "translateKeysBulk private method, refactored callers"
      contains: "translateKeysBulk"
    - path: "src/modules/translations/auto-translate-worker.service.spec.ts"
      provides: "Unit tests for bulk translation path"
      contains: "translateKeysBulk"
  key_links:
    - from: "auto-translate-worker.service.ts"
      to: "ai-translate.service.ts"
      via: "this.aiTranslateService.bulkTranslate(entries, projectId, localeGuidance)"
      pattern: "bulkTranslate"
---

<objective>
Replace per-key Gemini calls in auto-translate worker with batched bulkTranslate() calls.

Purpose: Currently each key triggers a separate Gemini API call (via translateForLocales -> bulkTranslate([single])). With 20 keys per poll cycle, that is 20 API calls. By passing all keys to bulkTranslate() at once, the internal BULK_CHUNK_SIZE=10 chunking means 20 keys = 2 Gemini calls instead of 20. Same optimization applies to translateNamespace() and processInitTranslateLocales().

Output: Refactored auto-translate-worker.service.ts with new translateKeysBulk() method, updated callers, and updated unit tests.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/auto-translate-worker.service.ts
@src/modules/translations/ai-translate.service.ts
@src/modules/translations/auto-translate-worker.service.spec.ts

<interfaces>
<!-- Key API from ai-translate.service.ts that translateKeysBulk will call directly -->

From src/modules/translations/ai-translate.service.ts:
```typescript
async bulkTranslate(
  entries: Array<{
    key: string;      // key name used as result identifier
    text: string;     // source text
    context?: string; // optional context
    targetLocales?: string[]; // per-entry target locale codes
  }>,
  projectId?: string,
  localeGuidance?: Record<string, string>,
): Promise<{
  results: Record<string, Record<string, string>>; // key -> locale -> translated text
  contextInfo: Record<string, { need: 'required' | 'useful' | 'none'; reason: string | null }>;
}>
```

From src/modules/translations/locale-registry.ts:
```typescript
export function getLocaleName(code: string): string;
```

From typeorm (needs import):
```typescript
import { In } from 'typeorm'; // for batch sandbox value lookup
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add translateKeysBulk method and refactor all 3 callers</name>
  <files>src/modules/translations/auto-translate-worker.service.ts, src/modules/translations/auto-translate-worker.service.spec.ts</files>
  <behavior>
    - Test: translateKeysBulk calls bulkTranslate once with all keys (not translateForLocales N times)
    - Test: translateKeysBulk filters out locales that already have sandbox values per key (batch DB lookup)
    - Test: translateKeysBulk persists all results in a single UPSERT and persists contextNeed per key
    - Test: translateKeysBulk handles Gemini locale code normalisation (nb-NO -> nb fallback) same as translateKey
    - Test: pollAndProcess still handles 429 rate-limit by skipping remaining keys for that project
    - Test: keys where all locales already have sandbox values are excluded from the bulkTranslate entries
  </behavior>
  <action>
**Step 1: Add `In` import from typeorm** (line 9, add to existing import):
Change `import { DataSource, Repository } from 'typeorm'` to `import { DataSource, In, Repository } from 'typeorm'`.

**Step 2: Create `translateKeysBulk` private method** after `translateKey` (after line 514):

```typescript
private async translateKeysBulk(
  projectId: string,
  keys: Array<{
    keyId: string;
    keyName: string;
    sourceText: string;
    context: string | null;
  }>,
  nonDefaultLocales: LocaleEntity[],
): Promise<void> {
```

Inside translateKeysBulk:
1. **Batch lookup existing sandbox values** for all keys at once:
   ```typescript
   const allKeyIds = keys.map(k => k.keyId);
   const existingSandbox = await this.sandboxRepo.find({
     where: { projectId, keyId: In(allKeyIds), isDeleted: false },
     select: ['keyId', 'localeId'],
   });
   // Group by keyId for fast lookup
   const existingByKey = new Map<string, Set<string>>();
   for (const sv of existingSandbox) {
     if (!existingByKey.has(sv.keyId)) existingByKey.set(sv.keyId, new Set());
     existingByKey.get(sv.keyId)!.add(sv.localeId);
   }
   ```

2. **Build entries array** for bulkTranslate, filtering out keys where all locales already exist:
   ```typescript
   const entries: Array<{ key: string; text: string; context?: string; targetLocales: string[] }> = [];
   const keyIdByName = new Map<string, string>(); // key name -> keyId for result mapping
   for (const k of keys) {
     const existingLocaleIds = existingByKey.get(k.keyId) ?? new Set();
     const missingLocales = nonDefaultLocales.filter(l => !existingLocaleIds.has(l.id));
     if (!missingLocales.length) continue;
     entries.push({
       key: k.keyName,
       text: k.sourceText,
       context: k.context ?? undefined,
       targetLocales: missingLocales.map(l => l.code),
     });
     keyIdByName.set(k.keyName, k.keyId);
   }
   if (!entries.length) return;
   ```

3. **Build locale guidance** from all nonDefaultLocales (not per-key, shared across batch):
   ```typescript
   const localeGuidance = nonDefaultLocales.reduce<Record<string, string>>((acc, l) => {
     if (l.localeSkill) acc[l.code] = l.localeSkill;
     return acc;
   }, {});
   ```

4. **Call bulkTranslate once** for the whole batch:
   ```typescript
   const { results, contextInfo } = await this.aiTranslateService.bulkTranslate(
     entries,
     projectId,
     Object.keys(localeGuidance).length ? localeGuidance : undefined,
   );
   ```

5. **Build UPSERT values** from results, mapping key names back to keyIds and handling locale code normalisation:
   ```typescript
   const values: Partial<SandboxValueEntity>[] = [];
   for (const entry of entries) {
     const keyId = keyIdByName.get(entry.key)!;
     const keyResults = results[entry.key];
     if (!keyResults) continue;
     const missingLocales = nonDefaultLocales.filter(l => entry.targetLocales.includes(l.code));
     for (const locale of missingLocales) {
       const translated = keyResults[locale.code] ?? keyResults[locale.code.split('-')[0]];
       if (!translated) continue;
       values.push({ projectId, keyId, localeId: locale.id, value: translated, isDeleted: false });
     }
   }
   ```

6. **Single UPSERT** for all values (reuse existing UNNEST pattern from translateKey):
   ```typescript
   if (values.length) {
     await this.dataSource.query(
       `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
        SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamptz[])
        ON CONFLICT (project_id, key_id, locale_id)
          DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at`,
       [
         values.map(v => v.projectId),
         values.map(v => v.keyId),
         values.map(v => v.localeId),
         values.map(v => v.value),
         values.map(() => false),
         values.map(() => new Date()),
       ],
     );
     await this.projectRepo.update(projectId, { sandboxHasChanges: true });
   }
   ```

7. **Persist contextNeed per key** (batch UPDATE for all keys that have contextInfo):
   ```typescript
   for (const entry of entries) {
     const ctx = contextInfo[entry.key];
     if (ctx?.need) {
       const keyId = keyIdByName.get(entry.key)!;
       await this.dataSource.query(
         `UPDATE sandbox_values SET context_need = $1, context_reason = $2 WHERE project_id = $3 AND key_id = $4`,
         [ctx.need, ctx.reason, projectId, keyId],
       );
     }
   }
   ```

**Step 3: Refactor `pollAndProcess`** (lines 373-403):
Replace the per-key loop with a single `translateKeysBulk` call per project. Wrap in try/catch — if the error is 429, log and continue to next project; otherwise log warning per the existing pattern.

Replace lines 378-403:
```typescript
for (const [projectId, keys] of byProject) {
  const locales = await this.localeRepo.findBy({ projectId });
  const nonDefaultLocales = locales.filter((l) => !l.isDefault);
  if (!nonDefaultLocales.length) continue;

  try {
    await this.translateKeysBulk(projectId, keys, nonDefaultLocales);
    totalTranslated += keys.length;
  } catch (e: unknown) {
    if (e instanceof HttpException && e.getStatus() === 429) {
      this.logger.warn(
        `Daily token limit reached for project ${projectId}, skipping remaining keys`,
      );
    } else {
      this.logger.warn(
        `Failed to auto-translate batch for project ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
```

**Step 4: Refactor `translateNamespace`** (lines 119-136):
Replace the per-key loop with a single `translateKeysBulk` call. Map `rows` to the keys format.

Replace lines 119-136:
```typescript
const keys = rows.map(row => ({
  keyId: row.key_id,
  keyName: row.key_name,
  sourceText: row.source_text,
  context: row.key_context,
}));

try {
  await this.translateKeysBulk(projectId, keys, nonDefaultLocales);
  this.logger.log(
    `triggerForNamespace: translated ${keys.length} keys in namespace ${namespaceId}`,
  );
} catch (e: unknown) {
  this.logger.warn(
    `triggerForNamespace batch failed: ${e instanceof Error ? e.message : String(e)}`,
  );
}
```

**Step 5: Refactor `processInitTranslateLocales`** (lines 280-296):
Replace the per-key loop with a single `translateKeysBulk` call. Note: here `nonDefaultLocales` is `[locale]` (the single init-translate locale).

Replace lines 280-296:
```typescript
const keys = missingRows.map(row => ({
  keyId: row.key_id,
  keyName: row.key_name,
  sourceText: row.source_text,
  context: row.key_context,
}));

try {
  await this.translateKeysBulk(locale.projectId, keys, [locale]);
} catch (e: unknown) {
  this.logger.warn(
    `Init-translate batch failed for locale "${locale.code}": ${e instanceof Error ? e.message : String(e)}`,
  );
}

this.logger.log(
  `Init-translate: translated ${missingRows.length} keys for locale "${locale.code}"`,
);
```

**Step 6: Keep `translateKey` as-is** for `translateSingleKey` usage (single key retranslation path). No changes needed.

**Step 7: Update unit tests** in `auto-translate-worker.service.spec.ts`:
- Keep existing `translateKey` tests (they still apply for the single-key path via `translateSingleKey`).
- Add a new describe block `AutoTranslateWorkerService -- translateKeysBulk`:
  - Test: calls `bulkTranslate` (not `translateForLocales`) with all keys as entries
  - Test: filters out keys where all locales have existing sandbox values
  - Test: handles locale code normalisation (nb-NO -> nb fallback in results)
  - Test: single UPSERT call for all translations
  - Test: persists contextNeed per key
  - Mock setup: `aiTranslateService` needs `bulkTranslate` mock (add alongside existing `translateForLocales` mock). `sandboxRepo.find` returns batch results with keyId+localeId for filtering.

Note: The existing tests mock `translateForLocales` on `AiTranslateService`. The new bulk path calls `bulkTranslate` directly, so add a `bulkTranslate` mock. The `translateForLocales` mock is still needed for `translateKey` (used by `translateSingleKey`).
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx jest --testPathPattern=auto-translate-worker --no-coverage 2>&1 | tail -30</automated>
  </verify>
  <done>
    - translateKeysBulk method exists and is called by pollAndProcess, translateNamespace, and processInitTranslateLocales
    - translateKey is still used by translateSingleKey (unchanged single-key path)
    - All unit tests pass including new tests for the bulk path
    - N keys per cycle = ceil(N/10) Gemini calls instead of N
  </done>
</task>

</tasks>

<verification>
- `npx jest --testPathPattern=auto-translate-worker --no-coverage` passes all tests
- `npx tsc --noEmit` compiles without errors
- `npm run lint:js` passes
</verification>

<success_criteria>
- pollAndProcess, translateNamespace, and processInitTranslateLocales use translateKeysBulk instead of per-key translateKey loops
- translateSingleKey still uses translateKey for single-key retranslation
- 20 keys/cycle = 2 Gemini calls (ceil(20/10)) instead of 20
- All existing and new unit tests pass
- contextNeed/contextReason still persisted per key
- 429 rate-limit handling preserved in pollAndProcess
</success_criteria>

<output>
After completion, create `.planning/quick/260410-eow-batch-auto-translate-worker-replace-per-/260410-eow-SUMMARY.md`
</output>
