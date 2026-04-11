---
phase: quick
plan: 260407-iem
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-ui/src/pages/translations/TranslationsPage.tsx
autonomous: true
requirements: [background-polling]
must_haves:
  truths:
    - "Translations entries auto-refresh in background every 30 seconds without user action"
    - "No loading spinners appear during background refetches — only initial load shows spinner"
    - "When a background refetch fails (network error, 5xx), a visible warning Alert appears above the table"
    - "Warning Alert auto-clears when next refetch succeeds"
  artifacts:
    - path: "admin-ui/src/pages/translations/TranslationsPage.tsx"
      provides: "Background polling with silent refetch and error surfacing"
  key_links:
    - from: "EntriesTable useQuery"
      to: "refetchInterval option"
      via: "TanStack React Query refetchInterval"
    - from: "useQuery error/isError state"
      to: "Alert component"
      via: "Conditional render above Table"
---

<objective>
Add background polling to the TranslationsPage so translations auto-refresh silently (no spinners), while surfacing API errors/warnings visibly to the user when they occur.

Purpose: Users working on translations see updates from other collaborators or MCP agents without manual refresh. Errors from failed background fetches are not silently swallowed.
Output: Updated TranslationsPage.tsx with polling and error surfacing.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-ui/src/pages/translations/TranslationsPage.tsx
@admin-ui/src/api/client.ts
@admin-ui/src/App.tsx (QueryClient defaults — refetchOnWindowFocus: false, retry: 1)

<interfaces>
From TranslationsPage.tsx:
- `EntriesTable` component (line ~144): shared table for both Production and Sandbox tabs
  - Has `useQuery<PaginatedEntries>` at line ~218 with `queryKey: [queryKeyPrefix, projectSlug, namespace, ...]`
  - `isLoading: entriesLoading` destructured — used for Table `loading` prop
- `SandboxTab` component (line ~495):
  - `useQuery<SandboxStatus>` at line ~516: `queryKey: ['sandbox-status', projectSlug]`
  - `useQuery<DiffResult>` at line ~522: `queryKey: ['sandbox-diff', projectSlug]`
- `ProductionTab` component (line ~1230):
  - `useQuery<Snapshot[]>` at line ~1240: `queryKey: ['sandbox-snapshots', projectSlug]`

Key: React Query distinguishes `isLoading` (no cached data, first fetch) from `isFetching` (any fetch including background). The Table `loading` prop currently uses `isLoading` which is correct — background refetches won't trigger spinners.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add background polling with refetchInterval and error surfacing</name>
  <files>admin-ui/src/pages/translations/TranslationsPage.tsx</files>
  <action>
Add a polling interval constant at the top of the file (near ROW_BG):

```typescript
const POLL_INTERVAL_MS = 30_000; // 30s background refresh
```

**EntriesTable component (~line 218):** Add `refetchInterval` and capture error state from the entries useQuery:

```typescript
const { data: entriesData, isLoading: entriesLoading, error: entriesError, isError: entriesIsError } =
  useQuery<PaginatedEntries>({
    queryKey: [...],
    queryFn: ...,
    enabled: ...,
    refetchInterval: POLL_INTERVAL_MS,
  });
```

Add an Alert banner ABOVE the Table component (inside EntriesTable's return JSX) that shows when `entriesIsError` is true:

```tsx
{entriesIsError && (
  <Alert
    type="warning"
    showIcon
    closable
    message="Background refresh failed"
    description={
      (entriesError as any)?.response?.data?.message
      || (entriesError as Error)?.message
      || 'Could not refresh translations. Will retry automatically.'
    }
    style={{ marginBottom: 12 }}
  />
)}
```

Important: Do NOT change the Table `loading` prop — it already uses `entriesLoading` (which is `isLoading`, not `isFetching`), so background refetches won't show spinners. This is correct behavior.

**SandboxTab component (~line 516-525):** Add `refetchInterval` to both sandbox queries:

```typescript
const { data: status, isLoading: statusLoading, isError: statusIsError, error: statusError } = useQuery<SandboxStatus>({
  ...existing...,
  refetchInterval: POLL_INTERVAL_MS,
});

const { data: diff, isError: diffIsError, error: diffError } = useQuery<DiffResult>({
  ...existing...,
  refetchInterval: POLL_INTERVAL_MS,
});
```

Add a combined error Alert in SandboxTab's JSX (above the sandbox diff summary / entries table area):

```tsx
{(statusIsError || diffIsError) && (
  <Alert
    type="warning"
    showIcon
    closable
    message="Background refresh failed"
    description="Could not refresh sandbox data. Will retry automatically."
    style={{ marginBottom: 12 }}
  />
)}
```

**ProductionTab component (~line 1240):** Add `refetchInterval` to the snapshots query:

```typescript
const { data: snapshots = [] } = useQuery<Snapshot[]>({
  ...existing...,
  refetchInterval: POLL_INTERVAL_MS,
});
```

No error alert needed for snapshots — it is secondary data.

**Do NOT:**
- Add refetchInterval to the `projectDetails` query (project structure rarely changes)
- Add refetchInterval to the `projects` list query (top-level, rarely changes)
- Change any `isLoading` usage to `isFetching` — the current behavior of only showing spinners on initial load is exactly what we want
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/admin-ui && npx tsc --noEmit 2>&1 | tail -20</automated>
  </verify>
  <done>
    - EntriesTable entries query polls every 30s via refetchInterval
    - SandboxTab status and diff queries poll every 30s
    - ProductionTab snapshots query polls every 30s
    - Warning Alert appears above table when background refetch fails
    - Alert auto-clears when next successful refetch completes (React Query clears isError on success)
    - No spinners during background refetches — only initial load shows loading state
    - TypeScript compiles without errors
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Background polling on translations page with silent refetch and visible error surfacing</what-built>
  <how-to-verify>
    1. Start admin UI: `cd admin-ui && npm run dev`
    2. Navigate to Translations page, select a project and namespace
    3. Observe: table loads normally with spinner on first load
    4. Wait 30+ seconds — table should silently refresh (no spinner, data updates if changed on backend)
    5. To test error surfacing: temporarily stop the API server, wait for next poll cycle (~30s)
    6. Verify: a yellow warning Alert appears above the table saying "Background refresh failed"
    7. Restart the API server, wait for next poll — Alert should disappear after successful refetch
    8. Switch to Sandbox tab — same behavior should apply
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in admin-ui
- `npm run lint:js` passes in admin-ui (if configured)
- Manual verification of polling behavior and error Alert
</verification>

<success_criteria>
- Translations page auto-refreshes data every 30 seconds without user interaction
- No loading spinners during background refetches
- Warning Alert visible when background fetch fails, auto-clears on success
- No regressions in existing table behavior (sorting, filtering, pagination)
</success_criteria>

<output>
After completion, create `.planning/quick/260407-iem-background-polling-on-translations-page-/260407-iem-SUMMARY.md`
</output>
