---
phase: 05-ui-polish
plan: 03
subsystem: ui
tags: [react, antd, nestjs, translations, quality-filter, sort]

# Dependency graph
requires:
  - phase: 05-01
    provides: EntriesTable component, FilterBar component, quality badge infrastructure
provides:
  - reviewState query param in ListEntriesQueryDto for filtering by quality_review_state
  - 'expected' qualityLevel value accepted (no longer returns HTTP 400)
  - Expanded quality filter dropdown with 10 options (level: and state: prefixes)
  - Sort dropdown with Key/Created/Quality Score options
  - reviewState filter in both production and sandbox entry lists
affects: [05-ui-polish, translations-quality-workflows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "level:/state: prefix convention for combined quality filter dropdown — single Select maps to two separate backend params"

key-files:
  created: []
  modified:
    - src/modules/translations/dto/list-entries-query.dto.ts
    - src/modules/translations/translations.service.ts
    - src/modules/translations/sandbox.service.ts
    - admin-ui/src/pages/translations/components/FilterBar.tsx
    - admin-ui/src/pages/translations/components/types.ts
    - admin-ui/src/pages/translations/components/api.ts
    - admin-ui/src/pages/translations/TranslationsPage.tsx

key-decisions:
  - "level:/state: prefix convention for combined quality filter — single Select dropdown maps to qualityLevel (level:) or reviewState (state:) params, parsed in onChange handler"
  - "Sort dropdown in FilterBar drives sortBy state only — sortOrder remains controlled by table column headers or stays asc as default"

patterns-established:
  - "Prefix convention for multipurpose filter dropdowns: 'level:green' maps to qualityLevel=green, 'state:skipped' maps to reviewState=skipped"

requirements-completed: [UI-03]

# Metrics
duration: 15min
completed: 2026-04-02
---

# Phase 05 Plan 03: Filter/Sort Expansion Summary

**Review-state filter and quality-score sort added to FilterBar with backend DTO support for reviewState param and 'expected' qualityLevel fix**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-02T19:39:00Z
- **Completed:** 2026-04-02T19:44:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Backend ListEntriesQueryDto extended with `reviewState` optional param (checked/not_checked/skipped/failed/expected/queued/processing)
- Added `'expected'` to the qualityLevel @IsIn validator — sending `?qualityLevel=expected` no longer returns HTTP 400
- Added reviewState EXISTS subquery filter in both `translations.service.ts` (production) and `sandbox.service.ts` (sandbox)
- FilterBar expanded with 10-option quality filter dropdown using `level:`/`state:` prefix convention
- New Sort dropdown added to FilterBar with Key/Created/Quality Score options
- TranslationsPage wired with `reviewState` state, `handleQualityFilterChange` parsing, and full queryKey/fetchFn integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reviewState param to backend DTO, translations service, and sandbox service** - `9cc658b` (feat)
2. **Task 2: Expand FilterBar with review-state options and Sort dropdown** - `b71f069` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/modules/translations/dto/list-entries-query.dto.ts` - Added reviewState param and 'expected' to qualityLevel validator
- `src/modules/translations/translations.service.ts` - Added reviewState filter and expected qualityLevel handler
- `src/modules/translations/sandbox.service.ts` - Added reviewState filter and expected qualityLevel handler
- `admin-ui/src/pages/translations/components/FilterBar.tsx` - Rewritten with 10-option quality filter, Sort dropdown, new prop interface
- `admin-ui/src/pages/translations/components/types.ts` - Updated FilterBarProps (qualityFilter/onQualityFilterChange/sortBy/onSortByChange), updated EntriesTableProps fetchFn signature
- `admin-ui/src/pages/translations/components/api.ts` - Added reviewState param to fetchEntries and fetchSandboxEntries
- `admin-ui/src/pages/translations/TranslationsPage.tsx` - Added reviewState state, handleQualityFilterChange logic, Sort dropdown wiring

## Decisions Made
- Used `level:`/`state:` prefix convention to combine two separate backend params into one Select dropdown — avoids two separate dropdowns and keeps UI compact
- Sort dropdown in FilterBar drives `sortBy` state; `sortOrder` can still be controlled by table column click (both mechanisms coexist)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Filter/sort infrastructure complete for phase 05 UI polish
- Users can now triage translations by review state (checked/skipped/failed/pending/expected) and sort by quality score
- No blockers for remaining phase work

---
*Phase: 05-ui-polish*
*Completed: 2026-04-02*

## Self-Check: PASSED
- `9cc658b` found in git log
- `b71f069` found in git log
- All 7 modified files verified present
