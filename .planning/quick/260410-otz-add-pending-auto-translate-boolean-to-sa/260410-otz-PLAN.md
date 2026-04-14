---
phase: quick
plan: 260410-otz
type: execute
wave: 1
depends_on: []
files_modified:
  - src/database/migrations/17763000000001-add-pending-auto-translate.ts
  - src/modules/translations/entities/sandbox-value.entity.ts
  - src/modules/translations/entities/locale.entity.ts
  - src/modules/translations/auto-translate-worker.service.ts
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/translations.service.ts
  - src/modules/translations/translations.controller.ts
  - src/modules/translations/dto/create-locale.dto.ts
  - admin-ui/src/pages/translations/components/types.ts
  - admin-ui/src/pages/translations/components/columns.tsx
  - admin-ui/src/pages/translations/TranslationsPage.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Spinner shows on cells where auto-translate is actually in progress (DB flag = true), not guessed from null value"
    - "Spinner disappears after translation completes (DB flag cleared)"
    - "Spinner disappears on translation error (DB flag cleared, no infinite spinner)"
    - "locale.initTranslate column is removed; createLocale with initTranslate=true now creates pending sandbox_values instead"
  artifacts:
    - path: "src/database/migrations/17763000000001-add-pending-auto-translate.ts"
      provides: "pending_auto_translate column on sandbox_values, drops init_translate from translation_locales"
    - path: "src/modules/translations/auto-translate-worker.service.ts"
      provides: "Sets pending flag before translate, clears after translate/error"
    - path: "src/modules/translations/sandbox.service.ts"
      provides: "listSandboxEntries returns pendingAutoTranslate per key-locale"
  key_links:
    - from: "auto-translate-worker.service.ts"
      to: "sandbox_values.pending_auto_translate"
      via: "INSERT ON CONFLICT sets flag before translate, clears in UPSERT after"
      pattern: "pending_auto_translate"
    - from: "sandbox.service.ts listSandboxEntries"
      to: "frontend Entry.pendingAutoTranslate"
      via: "SQL query returns pending_auto_translate, mapped to response"
      pattern: "pending_auto_translate"
    - from: "columns.tsx isPending"
      to: "Entry.pendingAutoTranslate"
      via: "record.pendingAutoTranslate?.[locale] === true"
      pattern: "pendingAutoTranslate"
---

<objective>
Replace the guessed "translating..." spinner logic with a DB-backed `pending_auto_translate` boolean on sandbox_values. Remove `locale.initTranslate` column and route its behavior through the same pending flag.

Purpose: The current frontend guesses pending state from `!val && isSandbox && hasDefaultValue`, which shows spinners on cells that are simply empty. The `retranslatingCells` client-side Set is never cleared and leaks. Moving to a DB flag makes the spinner accurate and eliminates stale state.

Output: Migration, updated entity/worker/sandbox-service/controller, cleaned-up frontend.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/entities/sandbox-value.entity.ts
@src/modules/translations/entities/locale.entity.ts
@src/modules/translations/auto-translate-worker.service.ts
@src/modules/translations/sandbox.service.ts
@src/modules/translations/translations.service.ts
@src/modules/translations/translations.controller.ts
@src/modules/translations/dto/create-locale.dto.ts
@admin-ui/src/pages/translations/components/types.ts
@admin-ui/src/pages/translations/components/columns.tsx
@admin-ui/src/pages/translations/TranslationsPage.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + entity + backend: add pending_auto_translate, drop init_translate, wire worker and sandbox response</name>
  <files>
    src/database/migrations/17763000000001-add-pending-auto-translate.ts
    src/modules/translations/entities/sandbox-value.entity.ts
    src/modules/translations/entities/locale.entity.ts
    src/modules/translations/auto-translate-worker.service.ts
    src/modules/translations/sandbox.service.ts
    src/modules/translations/translations.service.ts
    src/modules/translations/translations.controller.ts
    src/modules/translations/dto/create-locale.dto.ts
  </files>
  <action>
**1. Migration** `src/database/migrations/17763000000001-add-pending-auto-translate.ts`:
- UP: `ALTER TABLE sandbox_values ADD COLUMN pending_auto_translate boolean NOT NULL DEFAULT false`
- UP: `ALTER TABLE translation_locales DROP COLUMN init_translate`
- DOWN: reverse both

**2. SandboxValueEntity** (`sandbox-value.entity.ts`):
- Add column after `qualityContentHash`:
  ```
  @Column({ name: 'pending_auto_translate', type: 'boolean', default: false })
  pendingAutoTranslate!: boolean;
  ```

**3. LocaleEntity** (`locale.entity.ts`):
- Remove the `initTranslate` column + its `@Column` decorator (lines 34-35)

**4. CreateLocaleDto** (`create-locale.dto.ts`):
- Keep `initTranslate?: boolean` property and decorators as-is (it's still the API flag; behavior changes in service)

**5. TranslationsService.createLocale** (`translations.service.ts` line 489):
- Remove `initTranslate` parameter from method signature
- Remove `initTranslate` from the `localeRepo.create()` call
- After `localeRepo.save()`, if `dto.initTranslate` was true (passed from controller): instead of setting locale flag, call a new helper that creates pending sandbox_value placeholders. **However**, since the locale was just created, there are no sandbox_values for it yet, which is the normal state. The auto-translate worker's `pollAndProcess()` already detects keys with missing sandbox_values for non-default locales and translates them. So we just need the worker to create placeholders with `pending_auto_translate = true` before translating.
- **Simplest approach**: Remove `initTranslate` from `localeRepo.create()`. In the controller, after `createLocale()`, if `dto.initTranslate` is true, call `autoTranslateWorkerService.triggerForNamespace()` for each namespace in the project. The worker will handle creating placeholders. This means we need to expose a method or just rely on `pollAndProcess` to pick it up on the next 10s cycle. Since `pollAndProcess` already handles missing sandbox values, we can just let it work naturally -- no code needed beyond removing the locale flag.
- **Final approach**: Remove `initTranslate` from `localeRepo.create()` call. The controller still passes the param but the service ignores it. The worker's `pollAndProcess()` runs every 10s and will pick up missing values naturally. No explicit trigger needed.

**Actually, re-reading the architecture more carefully**: The `initTranslate` flag on the locale was used because `pollAndProcess` only runs when `auto_translate_enabled = true` on the project. The `processInitTranslateLocales()` method runs unconditionally (not checking auto_translate_enabled). We need to preserve this "translate regardless of auto_translate_enabled" behavior.

**Revised approach for initTranslate removal**:
- In `translations.service.ts createLocale()`: Remove `initTranslate` from the `localeRepo.create()` object (the column no longer exists).
- In `translations.controller.ts createLocale()`: After calling `this.translationsService.createLocale()`, if `dto.initTranslate` is true and the saved locale is not default, create placeholder sandbox_values with `pending_auto_translate = true` for all keys across all namespaces in the project, then call `triggerForNamespace()` for each namespace. **But** the controller doesn't have direct access to `autoTranslateWorkerService`. 
- **Better**: In `translations.service.ts createLocale()`, keep `initTranslate` as a boolean param, but instead of saving it on the locale entity, when true: (a) inject `DataSource`, (b) run a raw INSERT to create sandbox_value placeholders with `pending_auto_translate = true` for all keys in all namespaces of this project for the new locale, (c) inject and call `autoTranslateWorkerService.triggerForNamespace()` for each namespace. Actually the service doesn't have the worker injected.
- **Simplest correct approach**: Move the "init translate" trigger into `AutoTranslateWorkerService`. Add a method `triggerInitTranslateForLocale(projectId, localeId)` that: (a) finds all namespaces for the project, (b) for each namespace, creates placeholder sandbox_values with `value = null, pending_auto_translate = true` for all keys missing sandbox_values for this locale, (c) calls the existing translation logic. The service already has all the repos. Then from `translations.service.ts`, call `this.autoTranslateWorkerService.triggerInitTranslateForLocale()`. **But** `TranslationsService` doesn't inject `AutoTranslateWorkerService`. There may be circular dependency issues.
- **Final simplest approach**: Keep `processInitTranslateLocales()` working for one more cycle but adapt it:
  - Instead of querying `localeRepo.findBy({ initTranslate: true })`, query sandbox_values for rows where `pending_auto_translate = true` grouped by locale.
  - In `translations.service.ts createLocale()`: When `initTranslate` is true and locale is non-default, use raw SQL to INSERT placeholder sandbox_values with `value = null, pending_auto_translate = true` for all keys across all namespaces that have a default-locale sandbox value. The worker's `processInitTranslateLocales()` is refactored to pick these up.
  
**FINAL DEFINITIVE APPROACH (implementing this)**:

A) **`translations.service.ts createLocale()`**: Keep `initTranslate` param. Remove it from `localeRepo.create()`. After saving the locale, if `initTranslate === true` and the locale is not default, run raw SQL:
```sql
INSERT INTO sandbox_values (project_id, key_id, locale_id, value, pending_auto_translate, is_deleted, updated_at)
SELECT $1, tk.id, $2, NULL, true, false, NOW()
FROM translation_namespaces ns
JOIN translation_keys tk ON tk.namespace_id = ns.id
JOIN sandbox_values sv_def ON sv_def.key_id = tk.id
  AND sv_def.locale_id = $3
  AND sv_def.project_id = $1
  AND sv_def.is_deleted = false
  AND sv_def.value IS NOT NULL
WHERE ns.project_id = $1
ON CONFLICT (project_id, key_id, locale_id) DO NOTHING
```
where $1=projectId, $2=newLocale.id, $3=defaultLocale.id. This creates placeholders with `pending_auto_translate = true`.

B) **`auto-translate-worker.service.ts`**:

B1) **Remove `processInitTranslateLocales()`** entirely. Remove the call to it from `pollAndProcess()`.

B2) **Refactor `pollAndProcess()`**: The existing query finds keys with missing sandbox_values (sv_tgt.id IS NULL). Extend it to ALSO find keys where sandbox_values exist but `pending_auto_translate = true`. Change the WHERE condition:
```sql
AND (sv_tgt.id IS NULL OR sv_tgt.pending_auto_translate = true)
```
But wait -- the current query uses `DISTINCT ON (tk.id)` and groups by project. The pending_auto_translate flag means "this specific key+locale pair needs translation". The poll query looks for missing entries globally. The current architecture handles this differently: it finds keys with ANY missing locale, then `translateKeysBulk` figures out which locales are missing per key.

Actually the simplest change: the poll query already finds keys where ANY non-default locale is missing a sandbox_value. When `createLocale` with `initTranslate` inserts placeholders with `value = null, pending_auto_translate = true`, these rows DO exist (sv_tgt.id IS NOT NULL), so the poll query would NOT pick them up. We need to also match `sv_tgt.value IS NULL AND sv_tgt.pending_auto_translate = true`.

Change the `pollAndProcess` query WHERE condition from:
```sql
AND sv_tgt.id IS NULL
```
to:
```sql
AND (sv_tgt.id IS NULL OR (sv_tgt.value IS NULL AND sv_tgt.pending_auto_translate = true))
```

Also: in `translateKeysBulk`, the existing sandbox lookup (`sandboxRepo.find`) checks `isDeleted: false` and gets `localeId`. The "missing locales" filter is `nonDefaultLocales.filter(l => !existingLocaleIds.has(l.id))`. But placeholders DO have a sandbox_value row, so they won't be "missing". We need to change the "missing" logic to include locales where the sandbox_value has `pending_auto_translate = true` or `value IS NULL`.

**Change in `translateKeysBulk`**: After building `existingByKey`, also track which (keyId, localeId) combos have `pending_auto_translate = true` or `value IS NULL`. Add `value` and `pendingAutoTranslate` to the sandboxRepo.find select. Then the missing locales filter becomes:
```ts
const missingLocales = nonDefaultLocales.filter(l => {
  const existing = existingByKey.get(k.keyId);
  if (!existing?.has(l.id)) return true; // no row at all
  return pendingByKeyLocale.has(`${k.keyId}::${l.id}`); // has row but pending
});
```

Similarly in `translateKey`: check if a locale has `pending_auto_translate = true` even if it has a row.

B3) **Set pending flag BEFORE translating** in `translateNamespace()` and `translateSingleKey()`:
After fetching the `rows` (source texts) and before calling `translateKeysBulk`/`translateKey`, insert placeholder sandbox_values with `pending_auto_translate = true, value = null` for all key+locale combos that will be translated:
```sql
INSERT INTO sandbox_values (project_id, key_id, locale_id, value, pending_auto_translate, is_deleted, updated_at)
SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::boolean[], $7::timestamptz[])
ON CONFLICT (project_id, key_id, locale_id) DO UPDATE SET pending_auto_translate = true, updated_at = EXCLUDED.updated_at
```
This way the frontend sees `pending_auto_translate = true` immediately (on next poll).

B4) **Clear pending flag in UPSERT** (both `translateKey` line 474 and `translateKeysBulk` line 609):
Add `pending_auto_translate = false` to the ON CONFLICT DO UPDATE SET clause:
```sql
ON CONFLICT (project_id, key_id, locale_id)
  DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at, pending_auto_translate = false
```

B5) **Clear pending flag on error** in `translateNamespace()` and `translateSingleKey()`:
In the catch blocks (translateNamespace line 131, translateSingleKey line 207), add:
```sql
UPDATE sandbox_values SET pending_auto_translate = false WHERE project_id = $1 AND pending_auto_translate = true AND key_id IN (...)
```
For translateNamespace: clear for all keys that were being translated. Simplest: clear all pending for the project+namespace.
For translateSingleKey: clear for the specific keyId.

For `translateNamespace` error at line 131 (the inner try/catch around translateKeysBulk):
```ts
// Clear pending flags for keys that failed
const failedKeyIds = keys.map(k => k.keyId);
await this.dataSource.query(
  `UPDATE sandbox_values SET pending_auto_translate = false WHERE project_id = $1 AND key_id = ANY($2) AND pending_auto_translate = true`,
  [projectId, failedKeyIds],
);
```

For `translateSingleKey` error at line 207 (outer catch):
```ts
await this.dataSource.query(
  `UPDATE sandbox_values SET pending_auto_translate = false WHERE project_id = $1 AND key_id = $2 AND pending_auto_translate = true`,
  [projectId, keyId],
).catch(() => {}); // best-effort cleanup
```

B6) **processInitTranslateLocales removal**: In `pollAndProcess()` (line 296), remove the call `await this.processInitTranslateLocales()`. Delete the `processInitTranslateLocales()` method entirely. The init-translate behavior is now handled by: (1) createLocale inserting placeholders with pending_auto_translate=true, (2) pollAndProcess picking up pending rows, (3) translateKeysBulk translating them and clearing the flag.

Also update the `pollAndProcess` query to pick up `pending_auto_translate = true` rows in addition to missing rows: change the LEFT JOIN + WHERE condition from `sv_tgt.id IS NULL` to `(sv_tgt.id IS NULL OR (sv_tgt.pending_auto_translate = true AND sv_tgt.value IS NULL))`.

B7) In the `pollAndProcess` query, also remove the `auto_translate_enabled` check for pending rows. Currently: `WHERE p.auto_translate_enabled = true`. Pending rows should be translated regardless (they were explicitly requested). Change to:
```sql
WHERE p.sandbox_initialized_at IS NOT NULL
  AND sv_def.value IS NOT NULL
  AND (
    (p.auto_translate_enabled = true AND sv_tgt.id IS NULL)
    OR (sv_tgt.pending_auto_translate = true AND (sv_tgt.value IS NULL OR sv_tgt.value = ''))
  )
```

**6. Sandbox service -- listSandboxEntries response** (`sandbox.service.ts`):

In the values query (line 1495-1508), add `sv.pending_auto_translate` to SELECT:
```sql
SELECT tk.id AS key_id, l.code AS locale, sv.value, COALESCE(sv.pending_auto_translate, false) AS pending_auto_translate
```

Update the query result type to include `pending_auto_translate: boolean`.

Build a `pendingByKey` map alongside `valuesByKey`:
```ts
const pendingByKey = new Map<string, Record<string, boolean>>();
for (const v of values) {
  if (!pendingByKey.has(v.key_id)) pendingByKey.set(v.key_id, {});
  pendingByKey.get(v.key_id)![v.locale] = v.pending_auto_translate;
}
```

Add `pendingAutoTranslate: Record<string, boolean>` to `SandboxEntryRow` interface.

In the data mapping (line 1555-1567), add:
```ts
pendingAutoTranslate: pendingByKey.get(k.id) ?? {},
```

**7. Update auto-translate-worker.service.spec.ts** if it references `initTranslate` -- update or remove the relevant test. Check the mock expectations.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit 2>&1 | head -40</automated>
  </verify>
  <done>
    - Migration adds `pending_auto_translate` to sandbox_values, drops `init_translate` from translation_locales
    - Worker sets pending=true before translate, clears after translate and on error
    - processInitTranslateLocales removed; pollAndProcess handles pending rows
    - listSandboxEntries returns pendingAutoTranslate per key-locale
    - createLocale with initTranslate=true creates pending placeholders instead of locale flag
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend -- use DB-backed pending flag, remove guessing logic and retranslatingCells</name>
  <files>
    admin-ui/src/pages/translations/components/types.ts
    admin-ui/src/pages/translations/components/columns.tsx
    admin-ui/src/pages/translations/TranslationsPage.tsx
  </files>
  <action>
**1. types.ts** -- Add `pendingAutoTranslate` to `Entry` interface:
```ts
export interface Entry {
  key: string;
  createdAt: string;
  context: string | null;
  contextNeed: 'required' | 'useful' | 'none' | null;
  contextReason: string | null;
  values: Record<string, string | null>;
  quality: Record<string, QualityInfo | null>;
  pendingAutoTranslate?: Record<string, boolean>;
}
```

**2. columns.tsx** -- Remove guessing logic, use DB flag:
- Remove `retranslatingCells` param (line 82) from `buildColumns` signature
- Remove `autoTranslateEnabled` param (line 83) from `buildColumns` signature
- Remove `const isRetranslating = retranslatingCells?.has(...)` (line 148) -- it's already unused
- Change `isPending` (line 149-150) from:
  ```ts
  const isPending = !val && !!(isSandbox && record.values[defaultLocale!]);
  ```
  to:
  ```ts
  const isPending = record.pendingAutoTranslate?.[locale] === true;
  ```
  This shows the spinner ONLY when the DB says auto-translate is in progress. It also works when val is already set (the flag is cleared after translate so this won't happen in practice).

**3. TranslationsPage.tsx** -- Remove client-side retranslating state:
- Remove `const [retranslatingCells, setRetranslatingCells] = useState<Set<string>>(new Set());` (line 189)
- In `resetKeyLocaleMutation.onSuccess` (line 329-332): Remove `setRetranslatingCells((prev) => new Set(prev).add(...))`. Keep `message.success` and `invalidate()`.
- In `buildColumns` call (line 402-433):
  - Remove `retranslatingCells` arg (was passed after `onResetKeyLocale` callback)
  - Remove `projectDetails?.autoTranslateEnabled` arg
  - Remove `retranslatingCells` and `projectDetails?.autoTranslateEnabled` from the useMemo deps array (line 432)
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - Frontend spinner driven by `record.pendingAutoTranslate[locale]` from DB, not guessed from null value
    - retranslatingCells state fully removed from TranslationsPage
    - autoTranslateEnabled and retranslatingCells params removed from buildColumns
    - No TypeScript errors in admin-ui
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix auto-translate-worker.service.spec.ts and run lint</name>
  <files>
    src/modules/translations/auto-translate-worker.service.spec.ts
  </files>
  <action>
Read `src/modules/translations/auto-translate-worker.service.spec.ts`. Update any references to:
- `initTranslate` on locale entities (remove or update mock data)
- `processInitTranslateLocales` (remove related test cases since the method no longer exists)
- Any mock expectations about the old polling behavior

Ensure mock data for `SandboxValueEntity` includes `pendingAutoTranslate: false` where needed.

Run `npm run lint:fix` in both root and admin-ui, then `npm run lint:js` to verify clean.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npm test -- --testPathPattern=auto-translate-worker --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>
    - auto-translate-worker spec passes with updated mocks
    - No references to initTranslate on locale entities in test file
    - Lint passes for both backend and admin-ui
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in root (backend)
2. `cd admin-ui && npx tsc --noEmit` passes (frontend)
3. `npm test -- --testPathPattern=auto-translate-worker --no-coverage` passes
4. `npm run lint:js` passes in root
5. `cd admin-ui && npm run lint` passes
</verification>

<success_criteria>
- pending_auto_translate column exists on sandbox_values
- init_translate column removed from translation_locales
- Worker sets pending=true before translate, clears after (both success and error)
- listSandboxEntries returns pendingAutoTranslate map
- Frontend shows spinner only when DB flag is true
- retranslatingCells state fully removed
- All tests pass, no lint errors
</success_criteria>

<output>
After completion, create `.planning/quick/260410-otz-add-pending-auto-translate-boolean-to-sa/260410-otz-SUMMARY.md`
</output>
