---
phase: 03-bug-fixes
plan: 02
subsystem: api
tags: [sandbox, translations, nestjs, typeorm, postgresql, context-isolation]

# Dependency graph
requires:
  - phase: 03-bug-fixes
    plan: 01
    provides: stable quality-check state machine used in sandbox flow
provides:
  - "Sandbox context isolation: context/contextNeed/contextReason staged in sandbox_values, not translation_keys"
  - "Migration adding context, context_need, context_reason columns to sandbox_values table"
  - "promote() copies sandbox context to translation_keys atomically"
  - "initSandbox and re-sync INSERTs include context columns from translation_keys"
affects:
  - 03-bug-fixes (remaining plans)
  - any future sandbox or context-related features

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context fields staged per sandbox row (sandbox_values) — promoted atomically to translation_keys on promote()"
    - "listSandboxEntries reads context via COALESCE(sandbox row, translation_key) — sandbox context takes precedence"
    - "batchUpsert and createSandboxEntry create keys without context, write context to sandbox_values afterward"

key-files:
  created:
    - src/database/migrations/17714000000006-sandbox-context-columns.ts
  modified:
    - src/modules/translations/entities/sandbox-value.entity.ts
    - src/modules/translations/sandbox.service.ts

key-decisions:
  - "Context columns added to sandbox_values with nullable defaults — no backfill needed, existing rows show null until edited in sandbox"
  - "listSandboxEntries reads context via COALESCE correlated subquery — reads sandbox context when present, falls back to production key"
  - "createSandboxEntry and batchUpsert create key entity without context — avoids any production leak for new sandbox-only keys"
  - "Pre-existing userId/userRole unused param warnings in markSandboxExpected/unmarkSandboxExpected fixed inline as rule 1"

patterns-established:
  - "Sandbox context pattern: write to sandbox_values rows; copy to translation_keys only at promote time"

requirements-completed:
  - BUG-03

# Metrics
duration: 20min
completed: 2026-04-02
---

# Phase 03 Plan 02: Sandbox Context Isolation Summary

**Sandbox context fields (context, contextNeed, contextReason) now staged per sandbox_values row and promoted atomically to translation_keys — production no longer leaks sandbox edits**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-02T16:55:00Z
- **Completed:** 2026-04-02T17:15:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Migration adds context/context_need/context_reason columns to sandbox_values with nullable defaults (no backfill needed)
- SandboxValueEntity maps the three new columns matching the TranslationKeyEntity pattern
- updateSandboxEntry writes context changes to sandbox_values rows instead of translation_keys directly, eliminating the production leak
- createSandboxEntry and batchUpsert create key entities without context; context is written to sandbox_values rows after upsert
- promote() adds an UPDATE translation_keys step that copies context from sandbox_values atomically after inserting production values
- promoteSelective adds a per-key UPDATE translation_keys step for context + context in re-sync INSERT
- initSandbox and all re-sync INSERTs now include context/context_need/context_reason from translation_keys
- listSandboxEntries reads context via COALESCE(sandbox row, translation_key) so sandbox context is shown immediately

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration and entity — add context columns to sandbox_values** - `cf6e1c4` (feat)
2. **Task 2: Update sandbox.service.ts — init, promote, edit, and create flows** - `6e2b145` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/database/migrations/17714000000006-sandbox-context-columns.ts` - ALTER TABLE sandbox_values ADD COLUMN context, context_need, context_reason
- `src/modules/translations/entities/sandbox-value.entity.ts` - Added context, contextNeed, contextReason @Column declarations
- `src/modules/translations/sandbox.service.ts` - Updated initSandbox, promote, promoteSelective, updateSandboxEntry, createSandboxEntry, batchUpsert, listSandboxEntries, revertSandboxKey

## Decisions Made

- Context columns in sandbox_values use nullable defaults — no backfill is needed; existing sandbox rows show null and will be populated when users next edit context in sandbox mode, or after the next initSandbox/resetSandbox call.
- listSandboxEntries reads context via COALESCE correlated subquery rather than a JOIN, since sandbox_values has one row per locale (not per key), so a subquery with LIMIT 1 is cleaner and avoids duplicates in DISTINCT key queries.
- createSandboxEntry and batchUpsert create key entities without context to prevent any write to translation_keys. Context is then written to sandbox_values rows after the upsert loop completes.
- revertSandboxKey was also updated to seed context from the key entity when re-creating sandbox rows from production values, ensuring consistency after a revert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed listSandboxEntries to read context from sandbox_values**
- **Found during:** Task 2 (sandbox.service.ts changes)
- **Issue:** listSandboxEntries queried `tk.context, tk.context_need, tk.context_reason` directly from translation_keys, so context changes made in sandbox mode would not be visible in the listing until after promotion.
- **Fix:** Changed query to use COALESCE(sandbox_values subquery, translation_keys) so sandbox context is immediately visible.
- **Files modified:** src/modules/translations/sandbox.service.ts
- **Verification:** TypeScript passes, no direct tk.context reads remain for the display path
- **Committed in:** 6e2b145 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed revertSandboxKey to include context when re-creating sandbox rows**
- **Found during:** Task 2 (reviewing revertSandboxKey)
- **Issue:** When reverting a key, sandbox rows were re-created without context from the key entity, so the reverted key would show null context in sandbox view.
- **Fix:** Added context, contextNeed, contextReason from keyEntity to the sandboxRepo.create() call.
- **Files modified:** src/modules/translations/sandbox.service.ts
- **Verification:** TypeScript passes
- **Committed in:** 6e2b145 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed pre-existing unused param lint errors in markSandboxExpected/unmarkSandboxExpected**
- **Found during:** Task 2 (lint pass on sandbox.service.ts)
- **Issue:** userId and userRole params not prefixed with _ in markSandboxExpected and unmarkSandboxExpected, causing lint errors. Pre-existing but in the file being modified.
- **Fix:** Renamed to _userId and _userRole.
- **Files modified:** src/modules/translations/sandbox.service.ts
- **Verification:** npm run lint passes for sandbox.service.ts
- **Committed in:** 6e2b145 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - correctness bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None — TypeScript passed on first attempt. Lint auto-fix resolved the pre-existing prettier indentation error in batchUpsert (the block was removed as part of the context isolation fix).

## User Setup Required

None — migration runs automatically on next `migration:run`.

## Next Phase Readiness

- BUG-03 resolved. Sandbox context isolation is complete.
- Phase 03 is now complete (all 2 plans done).
- Ready for Phase 04 (endpoint audit and dead code cleanup).

---
*Phase: 03-bug-fixes*
*Completed: 2026-04-02*
