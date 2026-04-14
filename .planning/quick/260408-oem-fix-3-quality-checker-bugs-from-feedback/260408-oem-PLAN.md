---
phase: quick
plan: 260408-oem
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/sandbox.service.spec.ts
autonomous: true
requirements: [d0dfd6c6, 8730ac53, 4fbdfeb7]
must_haves:
  truths:
    - "Re-checking an unchanged translation returns the cached score without calling Gemini"
    - "Default locale is never sent to Gemini for quality check in runSandboxQualityCheck"
    - "persistQualityResults does not overwrite entries with qualityReviewState='expected'"
  artifacts:
    - path: "src/modules/translations/sandbox.service.ts"
      provides: "All three bug fixes in sandbox quality methods"
    - path: "src/modules/translations/sandbox.service.spec.ts"
      provides: "Unit tests for the three fixes"
  key_links:
    - from: "runSandboxQualityCheck"
      to: "qualityContentHash column"
      via: "SHA256 hash comparison before Gemini call"
      pattern: "createHash.*sha256.*qualityContentHash"
    - from: "runSandboxQualityCheck"
      to: "locale.isDefault check"
      via: "early return for default locale"
      pattern: "locale\\.isDefault.*continue|return"
    - from: "persistQualityResults"
      to: "qualityReviewState check"
      via: "skip expected entries"
      pattern: "qualityReviewState.*expected.*continue"
---

<objective>
Fix three quality checker bugs reported in feedback-reproduction-260408.md:

1. **Cache quality score per value hash** (d0dfd6c6) -- In `runSandboxQualityCheck`, if a sandbox value's `qualityReviewState` is `'checked'` AND the SHA256 of the current `value` matches `qualityContentHash`, return the cached result without calling Gemini. Also save `qualityContentHash` when persisting new results. This prevents non-deterministic Gemini scores (variance up to 25 points) from causing agents to loop indefinitely.

2. **Skip default locale** (8730ac53) -- In `runSandboxQualityCheck`, skip the default locale entirely (return `null`), matching the pattern already used by the background quality worker at quality-worker.service.ts:242. Scoring EN against EN is meaningless and produces noise.

3. **Guard persistQualityResults against overwriting expected** (4fbdfeb7) -- In `persistQualityResults`, skip sandbox values where `qualityReviewState === 'expected'`, preventing the sync quality check path from overwriting manually accepted translations.

Purpose: Eliminate quality checker noise, prevent agent loops, and preserve user-accepted quality states.
Output: Patched sandbox.service.ts with tests.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/sandbox.service.ts
@.planning/debug/feedback-reproduction-260408.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/modules/translations/sandbox.service.ts (runSandboxQualityCheck, lines 1554-1696):
```typescript
async runSandboxQualityCheck(
  projectSlug: string,
  nsSlug: string,
  key: string,
  _userId: string,
  _role: UserRole,
): Promise<Record<string, QualityInfo | null>>
```

The method iterates `locales` with `Promise.allSettled`. For each locale:
1. Lines 1616-1625: Already checks `qualityReviewState === 'expected'` and returns cached result
2. Lines 1627-1631: Returns null if no translation value
3. Lines 1634-1638: Determines mode (language_quality vs translation_quality)
4. Lines 1640-1647: Calls `this.aiTranslateService.checkQuality(...)` -- THIS IS THE GEMINI CALL
5. Lines 1660-1680: Persists results to sandbox via createQueryBuilder().update()

From src/modules/translations/sandbox.service.ts (persistQualityResults, lines 2300-2358):
```typescript
async persistQualityResults(
  projectId: string,
  namespaceSlug: string,
  results: Record<string, Record<string, { score: number; level: string; comment: string }>>,
): Promise<void>
```

At line 2328-2331: Finds sandbox value, then unconditionally updates at line 2340-2355.
At line 2333-2335: Already computes hash: `createHash('sha256').update(sandboxValue.value).digest('hex')`.

From SandboxValueEntity fields:
```typescript
qualityScore: number | null;
qualityLevel: 'green' | 'yellow' | 'red' | 'expected' | null;
qualityComment: string | null;
qualityCheckedAt: Date | null;
qualityReviewState: 'not_checked' | 'processing' | 'checked' | 'failed' | 'expected' | 'skipped';
qualityContentHash: string | null;
```

Hash pattern from quality-worker.service.ts:
```typescript
import { createHash } from 'crypto';
const hash = createHash('sha256').update(value).digest('hex');
```

Quality worker skips default locale at line 242:
```typescript
if (!locale || locale.isDefault) continue;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write failing tests for all three quality checker bugs</name>
  <files>src/modules/translations/sandbox.service.spec.ts</files>
  <behavior>
    - Test 1 (Bug 1 cache): When `runSandboxQualityCheck` is called and a sandbox value has `qualityReviewState='checked'` AND `qualityContentHash` matches SHA256 of current `value`, `aiTranslateService.checkQuality` must NOT be called; the cached score/level/comment from the sandbox row must be returned directly.
    - Test 2 (Bug 1 cache miss): When the value has changed (hash mismatch), `aiTranslateService.checkQuality` MUST be called and new results persisted with the updated hash.
    - Test 3 (Bug 2 skip default): When `runSandboxQualityCheck` iterates locales, the default locale (`isDefault=true`) must return `null` and `aiTranslateService.checkQuality` must NOT be called for it.
    - Test 4 (Bug 3 expected guard): When `persistQualityResults` encounters a sandbox value with `qualityReviewState='expected'`, it must NOT update that row (the `createQueryBuilder().update()` must not be called for that entry).
  </behavior>
  <action>
Create `src/modules/translations/sandbox.service.spec.ts` with unit tests for the three bugs. Use Jest mocking:
- Mock `sandboxRepo` (findOne, findBy, createQueryBuilder), `localeRepo`, `namespaceRepo`, `keyRepo`, `aiTranslateService.checkQuality`
- Use `jest.fn()` for repository methods
- For the createQueryBuilder chain, mock: `.update().set().where().execute()`
- The test module does NOT need the full NestJS testing setup -- just instantiate SandboxService with mocked dependencies (or use `Test.createTestingModule` with custom providers)

Since SandboxService has many injected dependencies, the simplest approach is to create focused test doubles:
- `describe('runSandboxQualityCheck')` for bugs 1 and 2
- `describe('persistQualityResults')` for bug 3

For Bug 1 cache test: Set up sandboxValue with `qualityReviewState: 'checked'`, `qualityContentHash: SHA256('test value')`, `value: 'test value'`, `qualityScore: 85`, `qualityLevel: 'green'`, `qualityComment: 'Good translation'`, `qualityCheckedAt: new Date()`. Assert `checkQuality` was NOT called and returned result has score 85.

For Bug 1 cache miss: Same setup but `qualityContentHash: 'stale-hash'`. Assert `checkQuality` WAS called.

For Bug 2 default locale: Set up locales array where one has `isDefault: true`. Assert `checkQuality` was NOT called for that locale AND result for that locale code is `null`.

For Bug 3 expected guard: Set up sandboxValue with `qualityReviewState: 'expected'`. Assert the update query builder was NOT called for that entry.

Run tests -- they must all FAIL (RED phase) since fixes are not yet applied.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx jest src/modules/translations/sandbox.service.spec.ts --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>All 4 tests exist and FAIL, confirming the bugs are testable before applying fixes.</done>
</task>

<task type="auto">
  <name>Task 2: Apply all three fixes to sandbox.service.ts and make tests pass</name>
  <files>src/modules/translations/sandbox.service.ts</files>
  <action>
Apply three targeted edits to `src/modules/translations/sandbox.service.ts`:

**Fix 1 -- Cache quality score per value hash (d0dfd6c6):**
In `runSandboxQualityCheck`, after the existing `expected` state check (line 1625) and the null translation check (line 1631), BEFORE the try block (line 1633), add a hash-based cache check:

```typescript
// Cache hit: same value already checked — return cached result without calling Gemini
const currentHash = createHash('sha256').update(translation).digest('hex');
if (
  sandboxValue.qualityReviewState === 'checked' &&
  sandboxValue.qualityContentHash === currentHash
) {
  results[locale.code] = {
    reviewState: 'checked',
    score: sandboxValue.qualityScore ?? 0,
    level: sandboxValue.qualityLevel ?? 'green',
    comment: sandboxValue.qualityComment ?? null,
    checkedAt: sandboxValue.qualityCheckedAt?.toISOString() ?? null,
  };
  return;
}
```

Also, in the persist block (lines 1660-1680), add `qualityContentHash: currentHash` to the `.set({...})` call. This ensures the hash is saved when new quality results are persisted, enabling cache hits on subsequent calls.

**Fix 2 -- Skip default locale (8730ac53):**
In `runSandboxQualityCheck`, inside the `locales.map(async (locale) => {` callback, add an early check BEFORE the sandboxRepo.findOne call (before line 1606):

```typescript
// Skip default locale — scoring source against itself is meaningless
// (matches quality-worker.service.ts:242 pattern)
if (locale.isDefault) {
  results[locale.code] = null;
  return;
}
```

**Fix 3 -- Guard persistQualityResults (4fbdfeb7):**
In `persistQualityResults`, after line 2331 (`if (!sandboxValue || !sandboxValue.value) continue;`), add:

```typescript
// Preserve expected state — do not overwrite manually accepted translations
if (sandboxValue.qualityReviewState === 'expected') continue;
```

No other files need changes. The `createHash` import already exists at line 13.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx jest src/modules/translations/sandbox.service.spec.ts --no-coverage 2>&1 | tail -20</automated>
  </verify>
  <done>All 4 tests pass (GREEN). Three bugs fixed: (1) cached quality results prevent redundant Gemini calls and non-deterministic score variance, (2) default locale skipped in quality checks, (3) expected state preserved by persistQualityResults.</done>
</task>

</tasks>

<verification>
1. `npx jest src/modules/translations/sandbox.service.spec.ts --no-coverage` -- all tests pass
2. `npm run lint:js` -- no lint errors in modified files
3. `npx tsc --noEmit` -- TypeScript compilation succeeds
</verification>

<success_criteria>
- runSandboxQualityCheck returns cached results when qualityContentHash matches (no Gemini call)
- runSandboxQualityCheck returns null for default locale without calling Gemini
- persistQualityResults skips entries with qualityReviewState='expected'
- All new tests pass, lint clean, TypeScript compiles
</success_criteria>

<output>
After completion, create `.planning/quick/260408-oem-fix-3-quality-checker-bugs-from-feedback/260408-oem-SUMMARY.md`
</output>
