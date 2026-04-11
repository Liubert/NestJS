---
phase: quick
plan: 260407-iem
subsystem: admin-ui
tags: [polling, react-query, ux, translations-page]
dependency_graph:
  requires: []
  provides: [background-polling]
  affects: [TranslationsPage]
tech_stack:
  added: []
  patterns: [TanStack React Query refetchInterval, conditional Alert on isError]
key_files:
  created: []
  modified:
    - admin-ui/src/pages/translations/TranslationsPage.tsx
decisions:
  - refetchInterval=30s applied only to data queries (entries, sandbox-status, sandbox-diff, snapshots) — not to projectDetails or projects list which rarely change
  - snapshots query only enabled when revertModalOpen=true, so polling is effectively gated — no unnecessary background calls when modal is closed
  - entriesError cast to any for response.data.message access — intentional, matches existing codebase pattern
metrics:
  duration_minutes: 10
  completed_date: "2026-04-07T10:19:42Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick Plan 260407-iem: Background Polling on Translations Page Summary

**One-liner:** 30-second background polling via TanStack Query refetchInterval on entries/sandbox/snapshots queries, with visible warning Alert on refetch failure that auto-clears on success.

## What Was Built

Added silent background polling to `TranslationsPage.tsx` so translation data auto-refreshes every 30 seconds without user intervention. When a background refetch fails (network error, 5xx), a dismissible warning Alert appears above the affected table. The Alert auto-clears when the next refetch succeeds (React Query clears `isError` on success).

### Changes

**`admin-ui/src/pages/translations/TranslationsPage.tsx`**

- Added `POLL_INTERVAL_MS = 30_000` constant near `ROW_BG`
- `EntriesTable`: Added `refetchInterval: POLL_INTERVAL_MS`, `error: entriesError`, `isError: entriesIsError` to the entries `useQuery`. Added warning `Alert` above `Table` that renders when `entriesIsError` is true
- `SandboxTab`: Added `refetchInterval: POLL_INTERVAL_MS` and `isError` capture to both `sandbox-status` and `sandbox-diff` queries. Added combined warning `Alert` above the status panel
- `ProductionTab`: Added `refetchInterval: POLL_INTERVAL_MS` to the `sandbox-snapshots` query (no Alert needed — secondary data)

### Key Behavior

- Table `loading` prop still uses `isLoading` (not `isFetching`) — background refetches never show spinners
- Alert only renders when there is an active error; once the next poll succeeds React Query clears `isError`, removing the Alert automatically
- Snapshots polling is gated by `enabled: !!projectSlug && revertModalOpen` — no polling when the revert modal is closed

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add background polling with refetchInterval and error surfacing | 42f369d | admin-ui/src/pages/translations/TranslationsPage.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File exists: admin-ui/src/pages/translations/TranslationsPage.tsx ✓
- Commit 42f369d exists ✓
- TypeScript compile: 0 errors ✓
