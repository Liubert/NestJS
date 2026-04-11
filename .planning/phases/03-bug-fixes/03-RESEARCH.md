# Phase 3: Bug Fixes - Research

**Researched:** 2026-04-02
**Domain:** NestJS quality check state machine, sandbox promotion logic, Admin UI quality indicators
**Confidence:** HIGH — all findings come from direct source code inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Quality Check "skipped" is a distinct state — score=100, blue indicator, "skipped" status in UI | `qualityReviewState` enum does not include `'skipped'`; AI service uses `continue` on timeout, leaving values in `'processing'` state; UI has no `'skipped'` branch |
| BUG-02 | Quality Check "failed" state persisted in DB — enables retry workflows and DLQ visibility | DB entity has `'failed'` in the enum and the worker already sets it on batch-level Gemini error; the gap is chunk-level timeout silently skips keys rather than marking them `'failed'` |
| BUG-03 | Sandbox promote migrates key-level fields (contextNeed, contextReason, context) alongside translation values | `context`, `contextNeed`, `contextReason` live on `translation_keys` (shared); `promote()` INSERT copies only `value`; `updateSandboxEntry()` writes context directly to shared key record (immediate production side-effect); confirmed in CONCERNS.md line 184 |
</phase_requirements>

---

## Summary

Phase 3 fixes three bugs that share a root cause: features were added incrementally after the baseline schema was written, and the code that processes those features was never updated to handle edge cases. All three bugs are confined to two backend files (`ai-translate.service.ts`, `sandbox.service.ts`) and one frontend file (`TranslationsPage.tsx`), plus one new migration.

**BUG-01 + BUG-02 share a code path.** In `ai-translate.service.ts`, a per-chunk timeout (`chunk_timeout`) is caught and silently `continue`-d, leaving the affected keys in their pre-batch state. After the batch finishes the worker does not look back at un-resolved keys. The fix is to: (1) add `'skipped'` to the `qualityReviewState` enum and DB schema, (2) mark timed-out chunk keys as `'skipped'` immediately in `bulkCheckQuality`, and (3) add the `'skipped'` branch in the Admin UI quality indicator component.

**BUG-03** is an architectural gap: `context`, `contextNeed`, `contextReason` live on the shared `translation_keys` table. When `updateSandboxEntry()` changes context it writes to the shared row, immediately visible in production — there is no staging for context. The `promote()` SQL only copies `value` from `sandbox_values` to `translation_values` and never touches `translation_keys`. The fix is narrower than a full data-model change: add context columns to `sandbox_values`, write sandbox-context changes there instead of directly to `translation_keys`, and copy them to `translation_keys` during promote.

**Primary recommendation:** Fix BUG-01 and BUG-02 together in one plan (they share the timeout code path and the same enum migration). Fix BUG-03 in a separate plan (schema migration + two-table write pattern + promote SQL change).

---

## Standard Stack

No new libraries needed. All fixes use existing project stack.

| Layer | File | Change |
|-------|------|--------|
| DB schema | new migration | Add `quality_review_state` value `'skipped'` to `translation_values`; add `context`, `context_need`, `context_reason` columns to `sandbox_values` |
| Backend entity | `translation-value.entity.ts` | Add `'skipped'` to `qualityReviewState` union type |
| Backend entity | `sandbox-value.entity.ts` | Add `context`, `contextNeed`, `contextReason` columns |
| Backend service | `ai-translate.service.ts` | Mark timed-out chunk keys as `'skipped'` instead of `continue` |
| Backend service | `quality-worker.service.ts` | Apply `'skipped'` state for keys whose chunk timed out |
| Backend service | `sandbox.service.ts` | Write context to `sandbox_values` columns; copy them in promote SQL |
| Frontend | `TranslationsPage.tsx` | Add `'skipped'` branch in `QualityIndicator` component |

---

## Architecture Patterns

### Pattern 1: Quality Review State Machine

The existing state machine in `TranslationValueEntity.qualityReviewState`:

```
not_checked → queued → processing → checked
                                  → failed   (Gemini error, or locale missing from result)
                                  → expected (manual override)
```

After BUG-01/02 fix the machine becomes:

```
not_checked → queued → processing → checked
                                  → failed   (batch-level Gemini error, or locale missing)
                                  → skipped  (chunk-level timeout)
                                  → expected (manual override)
```

**Key invariant:** `'skipped'` means "AI timed out on this chunk; the value was not evaluated; score = 100 is assigned as a neutral placeholder." BUG-01 specifies score=100 and blue indicator for skipped.

**Note:** `SandboxValueEntity.qualityReviewState` uses a slightly different union (no `'queued'`). The sandbox entity must also be extended with `'skipped'`.

### Pattern 2: Where qualityReviewState is Set

| Location | Sets State To | Trigger |
|----------|--------------|---------|
| `translations.service.ts` (upsert value) | `'not_checked'` | Value changed |
| `quality-backfill.service.ts` | `'queued'` | Background sweep |
| `quality-worker.service.ts` handleBatch | `'processing'` | Batch dequeued |
| `quality-worker.service.ts` handleBatch | `'checked'` | Locale successfully reviewed |
| `quality-worker.service.ts` handleBatch | `'failed'` | Locale missing from result, or Gemini error |
| `quality-worker.service.ts` setStateForKeys | `'checked'\|'failed'` | Batch-level fallback |
| `sandbox.service.ts` markSandboxExpected | `'expected'` | Manual override |
| NEW — `ai-translate.service.ts` bulkCheckQuality | `'skipped'` | Chunk timeout |

### Pattern 3: Chunk Timeout Flow (Current — Broken)

In `ai-translate.service.ts` lines 218-229:

```typescript
try {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('chunk_timeout')), chunkTimeoutMs),
  );
  raw = await Promise.race([geminiCall, timeout]);
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'chunk_timeout') continue; // ← BUG: keys are never resolved
  throw new BadGatewayException(`Gemini API error: ${msg}`);
}
```

When `chunk_timeout` fires, the chunk's keys are still in `'processing'` state. The `handleBatch` in `quality-worker.service.ts` finishes normally and never revisits them.

### Pattern 4: Chunk Timeout Flow (Fixed)

The `bulkCheckQuality` method must return which keys were skipped so the caller can mark them. Two implementation options:

**Option A — Return skipped key names from bulkCheckQuality:**
```typescript
// Return type extended:
{ results: {...}; contextInfo: {...}; skippedKeys: string[] }
// On timeout: push chunk item keys to skippedKeys instead of continue
```

**Option B — Collect skipped key IDs in quality-worker.service.ts by comparing results:**
After `bulkCheckQuality` returns, any `keyId` in `keyIds` that has no entry in `results[keyEntity.key]` AND had no Gemini error → mark as `'skipped'`.

Option A is cleaner and more explicit. The existing return type change is confined to the two callers (worker + the ad-hoc quality check endpoint).

### Pattern 5: Sandbox Context Fields — Current (Broken)

`sandbox_values` has NO context columns. `SandboxValueEntity`:
- `value`, `is_deleted`, `qualityScore`, `qualityLevel`, `qualityComment`, `qualityCheckedAt`, `qualityReviewState`

When `updateSandboxEntry` changes context it calls `this.keyRepo.save(keyEntity)` — this writes to `translation_keys` immediately, bypassing sandbox isolation.

The `promote()` step 3 INSERT:
```sql
INSERT INTO translation_values (id, key_id, locale_id, value, updated_at)
SELECT gen_random_uuid(), sv.key_id, sv.locale_id, sv.value, now()
FROM sandbox_values sv
WHERE sv.project_id = $1 AND sv.is_deleted = false
```

No `UPDATE translation_keys SET context = ...` anywhere in the promote flow.

### Pattern 6: Sandbox Context Fields — Fixed

Add columns to `sandbox_values`:
```sql
ALTER TABLE sandbox_values
  ADD COLUMN context VARCHAR(500) DEFAULT NULL,
  ADD COLUMN context_need VARCHAR(10) DEFAULT NULL,
  ADD COLUMN context_reason VARCHAR(300) DEFAULT NULL;
```

Promote step 3 must also update `translation_keys` context when a key is being promoted and the sandbox has a different context value. The safest approach is a second SQL statement in the same transaction:

```sql
UPDATE translation_keys tk
SET
  context       = sv_ctx.context,
  context_need  = sv_ctx.context_need,
  context_reason = sv_ctx.context_reason
FROM (
  SELECT DISTINCT ON (sv.key_id)
    sv.key_id,
    sv.context,
    sv.context_need,
    sv.context_reason
  FROM sandbox_values sv
  WHERE sv.project_id = $1 AND sv.is_deleted = false
    AND sv.context IS NOT NULL
) sv_ctx
WHERE tk.id = sv_ctx.key_id;
```

The init-sandbox step must also copy context from `translation_keys` into `sandbox_values`:
```sql
INSERT INTO sandbox_values (..., context, context_need, context_reason)
SELECT ..., tk.context, tk.context_need, tk.context_reason
FROM translation_values tv
JOIN translation_keys tk ON tk.id = tv.key_id
...
```

The `updateSandboxEntry` context update must be redirected: instead of saving to `keyRepo`, save to `sandboxRepo` on the matching `sandbox_values` rows.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB column addition | manual ALTER TABLE in service | TypeORM migration file | Keeps migration history; `migration:run` in CI |
| Enum value tracking | in-code constants only | DB VARCHAR column (already pattern used) | Consistent with existing `quality_review_state VARCHAR(20)` |
| Context staging | new "sandbox keys" table | columns on existing `sandbox_values` | Minimal schema change; promotion is already per `sandbox_values` row |

---

## Common Pitfalls

### Pitfall 1: SandboxValueEntity Missing 'skipped' State

**What goes wrong:** `SandboxValueEntity.qualityReviewState` union does not include `'queued'` or `'skipped'` currently. If you add `'skipped'` only to `TranslationValueEntity`, sandbox quality indicators will silently fall through to `null` rendering in the UI.

**How to avoid:** Extend both entity unions. They are separate types — check both files.

### Pitfall 2: promote() Uses Raw SQL — TypeORM Entity Changes Don't Auto-Apply

**What goes wrong:** Adding columns to `SandboxValueEntity` and `TranslationValueEntity` via `@Column` only affects ORM queries. The `promote()` and `initSandbox()` methods use raw `manager.query()` SQL strings that must be manually updated.

**How to avoid:** After adding columns, grep for every raw SQL string that SELECTs from `sandbox_values` or INSERTs into `translation_values`/`sandbox_values` and add the new columns explicitly.

**Files to check:**
- `sandbox.service.ts` lines 115-133 (init INSERT), 406-415 (promote INSERT), 442-452 (promote re-sync INSERT), 551-556 (promoteSelective re-sync INSERT)

### Pitfall 3: initSandbox ON CONFLICT DO NOTHING Silently Skips Context Copy

**What goes wrong:** The sandbox init uses `ON CONFLICT (project_id, key_id, locale_id) DO NOTHING`. If sandbox was already initialized, re-init with `force=false` skips rows — context columns in existing sandbox rows are never updated.

**How to avoid:** The `force=true` path deletes and re-copies, so it's safe. The normal path skips existing rows intentionally — document that context on existing rows is not refreshed unless sandbox is force-reset.

### Pitfall 4: bulkCheckQuality Called from Two Places

**What goes wrong:** `bulkCheckQuality` is called from `quality-worker.service.ts` (batch processing) AND from `translations.service.ts` (ad-hoc per-item check). If the return type is extended with `skippedKeys`, both callers must be updated.

**How to verify:** `grep -rn "bulkCheckQuality"` — there are exactly two call sites.

### Pitfall 5: 'skipped' Indicator in UI Needs Both reviewState and score

**What goes wrong:** The UI `QualityIndicator` component uses `info.reviewState` for branching, but the "skipped" badge tooltip also needs to show score. BUG-01 specifies score=100 for skipped. If the backend sets `qualityScore = null` for skipped (different from score=100), the tooltip will show `null/100`.

**How to avoid:** Set `qualityScore = 100`, `qualityLevel = null`, `qualityReviewState = 'skipped'` when marking a key as skipped. This is consistent with "skipped" meaning "not evaluated, treated as passing."

### Pitfall 6: Promote Re-Sync Does Not Preserve Sandbox Context

**What goes wrong:** After promote, step 5 re-creates sandbox rows from new production values. The re-sync INSERT selects from `translation_values` and `translation_keys`. If the migration added context columns to `sandbox_values`, the re-sync INSERT must explicitly SELECT `tk.context`, `tk.context_need`, `tk.context_reason`.

**How to avoid:** Update ALL three re-sync INSERT statements in `sandbox.service.ts` (lines 442-452, 550-556, and the `initSandbox` INSERT at 115-133) to include context columns.

---

## Code Examples

### Example 1: Current Timeout Handler (ai-translate.service.ts line 226-229)

```typescript
// Source: src/modules/translations/ai-translate.service.ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'chunk_timeout') continue;  // ← silently drops chunk
  throw new BadGatewayException(`Gemini API error: ${msg}`);
}
```

### Example 2: Fixed Timeout Handler (with skipped tracking)

```typescript
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'chunk_timeout') {
    chunk.forEach(item => skippedKeys.push(item.key));
    continue;
  }
  throw new BadGatewayException(`Gemini API error: ${msg}`);
}
```

### Example 3: Current TranslationValueEntity qualityReviewState (translation-value.entity.ts)

```typescript
// Source: src/modules/translations/entities/translation-value.entity.ts
qualityReviewState!:
  | 'not_checked'
  | 'queued'
  | 'processing'
  | 'checked'
  | 'expected'
  | 'failed';
```

After fix:
```typescript
qualityReviewState!:
  | 'not_checked'
  | 'queued'
  | 'processing'
  | 'checked'
  | 'expected'
  | 'failed'
  | 'skipped';
```

### Example 4: Current SandboxValueEntity qualityReviewState (sandbox-value.entity.ts)

```typescript
// Source: src/modules/translations/entities/sandbox-value.entity.ts
qualityReviewState!:
  | 'not_checked'
  | 'processing'
  | 'checked'
  | 'failed'
  | 'expected';
```

After fix:
```typescript
qualityReviewState!:
  | 'not_checked'
  | 'processing'
  | 'checked'
  | 'failed'
  | 'expected'
  | 'skipped';
```

### Example 5: Current QualityInfo interface in Admin UI (TranslationsPage.tsx line 65-77)

```typescript
// Source: admin-ui/src/pages/translations/TranslationsPage.tsx
interface QualityInfo {
  reviewState:
    | 'not_checked'
    | 'queued'
    | 'processing'
    | 'checked'
    | 'expected'
    | 'failed';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | 'expected' | null;
  comment: string | null;
  checkedAt: string | null;
}
```

After fix: add `| 'skipped'` to the `reviewState` union.

### Example 6: QualityIndicator missing 'skipped' branch (TranslationsPage.tsx)

The component handles `queued`, `processing`, `failed`, `not_checked`, `expected`, and then falls through to the checked/score rendering. There is NO `'skipped'` branch. A translation with `reviewState='skipped'` would fall through to the checked rendering and attempt to show `null` score — rendering incorrectly.

Fix: add before the `'checked'` rendering:

```tsx
if (info.reviewState === 'skipped') {
  return (
    <Tooltip title="Quality check skipped — scored 100 by default">
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: '#1677ff',
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}
```

### Example 7: Promote INSERT — current (sandbox.service.ts line 406-415)

```typescript
// Source: src/modules/translations/sandbox.service.ts
const insertResult = await manager.query<{ id: string }[]>(
  `
  INSERT INTO translation_values (id, key_id, locale_id, value, updated_at)
  SELECT gen_random_uuid(), sv.key_id, sv.locale_id, sv.value, now()
  FROM sandbox_values sv
  WHERE sv.project_id = $1 AND sv.is_deleted = false
  RETURNING id
`,
  [project.id],
);
```

After BUG-03 fix: add a second query in the same transaction to UPDATE `translation_keys` context from the sandbox context columns.

### Example 8: sandbox.service.ts — raw SQL locations to update for context columns

| Method | Line (approx) | What to update |
|--------|--------------|----------------|
| `initSandbox` | 115–133 | Add `tk.context, tk.context_need, tk.context_reason` to SELECT and INSERT column list |
| `promote` step 3 | 406–415 | INSERT stays the same (copies value); ADD a separate UPDATE for translation_keys context |
| `promote` step 5 | 442–452 | Add context columns to re-sync INSERT |
| `promoteSelective` re-sync | 550–556 | Add context columns to per-key re-sync INSERT |
| `updateSandboxEntry` | 1122–1129 | Write context to `sandbox_values` rows instead of `keyRepo.save()` |
| `createSandboxEntry` | 1065–1071 | Set context on `sandbox_values` rows when creating key |
| `batchUpsert` | 1303–1325 | Write context to `sandbox_values` rows instead of `keyRepo.save()` |

---

## State of the Art

| Old Approach | Current Approach | Status | Impact |
|--------------|-----------------|--------|--------|
| `continue` on chunk timeout | (same) | Bug — to be fixed | Keys silently unchecked |
| No `'skipped'` state | (same) | Missing — to be added | UI shows incorrect state |
| Context on shared `translation_keys` | (same) | Bug — to be scoped to sandbox | Context changes bypass sandbox isolation |

---

## Open Questions

1. **Should 'skipped' be retryable?**
   - What we know: BUG-02 says "failed" enables retry. BUG-01 says "skipped" is a blue indicator. They are different states.
   - What's unclear: Should `quality-backfill.service.ts` retry `'skipped'` keys? Current backfill only retries `'not_checked'` and `'failed'`.
   - Recommendation: Yes — add `'skipped'` to backfill retry states alongside `'failed'`. If the user re-runs quality check, skipped keys should re-enter the queue.

2. **Context BUG-03: scope of sandbox isolation fix**
   - What we know: Sandbox context changes currently bypass isolation (write to shared `translation_keys`). The minimum fix is to stop this leakage.
   - What's unclear: Do we need full sandbox-scoped context (columns on `sandbox_values`) or just prevent leakage until promote?
   - Recommendation: Add context columns to `sandbox_values`. This is the smallest change that prevents leakage AND enables proper promote behavior.

3. **Does promoteSelective need the same context fix?**
   - What we know: `promoteSelective` has its own re-sync INSERT at lines 550-556. It does not have a corresponding `UPDATE translation_keys` for context.
   - Recommendation: Yes — `promoteSelective` must also apply context from sandbox to `translation_keys` for each promoted key.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all fixes are code and migration changes within existing stack)

---

## Project Constraints (from CLAUDE.md)

- TypeScript strict — all new union type values must be added to entity types and DTO types
- No path aliases — imports use relative paths with `.js` extensions
- Migration files required for all DB schema changes — do NOT use `synchronize: true` in production
- NestJS exceptions from services: use `BadRequestException`, `NotFoundException`, etc. — not generic `Error`
- Naming: entity file suffix `.entity.ts`, migration file: timestamp prefix
- camelCase properties in TypeScript; snake_case in DB columns
- `npm run lint:fix` + `npm run lint:js` must pass before commit
- Admin UI port 3010 — do not use 3001
- Pre-commit: review staged files, lint:fix, verify, then commit
- No package upgrades unless required by the fix

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `src/modules/translations/entities/translation-value.entity.ts` — entity state machine
- Direct inspection: `src/modules/translations/entities/sandbox-value.entity.ts` — sandbox entity, confirmed no context columns
- Direct inspection: `src/modules/translations/entities/translation-key.entity.ts` — confirmed context/contextNeed/contextReason on key
- Direct inspection: `src/modules/translations/ai-translate.service.ts` lines 218-229 — chunk timeout `continue` bug
- Direct inspection: `src/modules/translations/quality-worker.service.ts` — full batch handling logic
- Direct inspection: `src/modules/translations/sandbox.service.ts` lines 331-459 — promote method raw SQL
- Direct inspection: `admin-ui/src/pages/translations/TranslationsPage.tsx` lines 65-77, 391-495 — QualityIndicator component, confirmed no `'skipped'` branch
- Direct inspection: `.planning/codebase/CONCERNS.md` lines 65-74, 184-193 — confirms both bugs with file/line references
- Direct inspection: `.planning/ROADMAP.md` — success criteria per requirement

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — requirement descriptions and acceptance criteria
- `.planning/codebase/CONCERNS.md` — architectural concern analysis

---

## Metadata

**Confidence breakdown:**
- BUG-01 fix (skipped state): HIGH — exact file, line, and code path identified
- BUG-02 fix (failed on timeout): HIGH — same code path as BUG-01; worker already handles `'failed'`
- BUG-03 fix (context in promote): HIGH — exact SQL locations identified; CONCERNS.md confirms
- Admin UI changes: HIGH — component code directly inspected

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable internal codebase)
