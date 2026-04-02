---
phase: 05-ui-polish
plan: 01
subsystem: ui
tags: [react, typescript, antd, refactoring, components]

# Dependency graph
requires: []
provides:
  - "components/types.ts — 16 shared interfaces for TranslationsPage components"
  - "components/api.ts — 21 API functions extracted from TranslationsPage"
  - "components/QualityBadge.tsx — quality badge with QUALITY_CONFIG, QUALITY_COLOR, AI_LOCALES constants"
  - "components/columns.tsx — buildColumns factory function returning ColumnsType<Entry>"
  - "components/FilterBar.tsx — filter bar component (namespace, search, quality filter, add key)"
  - "components/EntryEditModal.tsx — edit/create modal with AI translate and quality check"
affects: [05-02, 05-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Column factory pattern: buildColumns() returns ColumnsType<Entry> wrapped in useMemo"
    - "Shared types module: all interfaces in components/types.ts, single source of truth"
    - "API module pattern: all API functions exported from components/api.ts"

key-files:
  created:
    - admin-ui/src/pages/translations/components/types.ts
    - admin-ui/src/pages/translations/components/api.ts
    - admin-ui/src/pages/translations/components/QualityBadge.tsx
    - admin-ui/src/pages/translations/components/columns.tsx
    - admin-ui/src/pages/translations/components/FilterBar.tsx
    - admin-ui/src/pages/translations/components/EntryEditModal.tsx
  modified:
    - admin-ui/src/pages/translations/TranslationsPage.tsx

key-decisions:
  - "Shared types placed in components/types.ts — single source of truth; both TranslationsPage and extracted components import from there"
  - "Column factory function buildColumns() wrapped in useMemo in EntriesTable — prevents column array recreation on every render (pitfall from RESEARCH.md)"
  - "KeyDiffRow interface extended with minQualityScore and worstQualityLevel fields — pre-existing usage in SandboxTab needed these fields defined"
  - "FilterBarProps added to types.ts — inline interface in FilterBar.tsx would duplicate declaration; keeping all props interfaces in types.ts is consistent"

patterns-established:
  - "components/ subfolder: all extracted sub-components of TranslationsPage live in admin-ui/src/pages/translations/components/"
  - "buildColumns factory: table column definitions go in columns.tsx as a factory function, not inline component body"

requirements-completed: [UI-02]

# Metrics
duration: 25min
completed: 2026-04-02
---

# Phase 05 Plan 01: Component Extraction Summary

**TranslationsPage.tsx (2609 lines) split into 6 focused components in components/ subfolder — pure structural refactor, zero visual or behavioral changes**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-02T19:12:00Z
- **Completed:** 2026-04-02T19:37:07Z
- **Tasks:** 2
- **Files modified:** 7 (1 modified + 6 created)

## Accomplishments
- Extracted 16 shared interfaces to types.ts and 21 API functions to api.ts
- Extracted QualityBadge component with its QUALITY_CONFIG, QUALITY_COLOR, AI_LOCALES constants
- Extracted table column factory function (buildColumns) to columns.tsx, wrapped in useMemo
- Extracted FilterBar and EntryEditModal (renamed from EditModal) as standalone components
- TranslationsPage rewired to import from components/, reduced from 2609 to 1428 lines
- TypeScript compiles with zero errors; Vite build passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared types and API module** - `cae5232` (feat)
2. **Task 2: Extract QualityBadge, columns, FilterBar, EntryEditModal and rewire TranslationsPage** - `4193712` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `admin-ui/src/pages/translations/components/types.ts` - 16 shared interfaces (Project, Entry, QualityInfo, QualityBadgeProps, EditModalProps, FilterBarProps, EntriesTableProps, etc.)
- `admin-ui/src/pages/translations/components/api.ts` - 21 API functions (fetchEntries, aiTranslate, markExpected, promoteSelective, etc.)
- `admin-ui/src/pages/translations/components/QualityBadge.tsx` - Quality badge component with all 7 review states, exports QUALITY_CONFIG, QUALITY_COLOR, AI_LOCALES
- `admin-ui/src/pages/translations/components/columns.tsx` - buildColumns factory function, full table column structure
- `admin-ui/src/pages/translations/components/FilterBar.tsx` - Filter bar (namespace select, search input, quality filter, add key button)
- `admin-ui/src/pages/translations/components/EntryEditModal.tsx` - Edit/create modal with AI translate and quality check handlers
- `admin-ui/src/pages/translations/TranslationsPage.tsx` - Orchestrator; imports from components/; reduced 1181 lines

## Decisions Made
- Shared types in components/types.ts — single source of truth; avoids type duplication across extracted files
- buildColumns wrapped in useMemo — prevents Ant Design Table re-rendering all rows on every keystroke
- KeyDiffRow extended with minQualityScore/worstQualityLevel — pre-existing SandboxTab code referenced these; added to type definition and populated in buildKeyDiffRows
- FilterBarProps added to types.ts — keeps all component props interfaces in one location

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added minQualityScore/worstQualityLevel to KeyDiffRow and buildKeyDiffRows**
- **Found during:** Task 2 (rewiring TranslationsPage)
- **Issue:** SandboxTab code at lines 1752-1754 and 1918-1929 referenced `record.worstQualityLevel` and `record.minQualityScore` on KeyDiffRow objects, but the interface did not define these fields — would cause TypeScript errors after migration
- **Fix:** Added fields to KeyDiffRow interface in types.ts; added quality aggregation logic in buildKeyDiffRows function
- **Files modified:** admin-ui/src/pages/translations/components/types.ts, admin-ui/src/pages/translations/TranslationsPage.tsx
- **Verification:** TypeScript compiles with zero errors
- **Committed in:** cae5232 (Task 1) + 4193712 (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing type definitions for pre-existing code)
**Impact on plan:** Necessary for TypeScript correctness. No scope creep.

## Issues Encountered
None — extraction proceeded as specified. Vite build produces a pre-existing chunk size warning (bundle is large) but this predates this plan.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All 6 extracted components ready for modification in Plan 02 (visual badge changes) and Plan 03 (filter expansion)
- Plan 02 will modify: QualityBadge.tsx (visual changes to dot+score pattern), columns.tsx (ellipsis on locale values)
- Plan 03 will modify: FilterBar.tsx (expanded filter options), backend DTO (new reviewState filter param)
- No blockers — TypeScript and build pass

## Known Stubs
None — no placeholder data, all wiring is real.

---
*Phase: 05-ui-polish*
*Completed: 2026-04-02*

## Self-Check: PASSED

All 7 files verified on disk. All task commits verified in git log (cae5232, 4193712).
