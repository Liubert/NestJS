---
phase: quick
plan: 260405-jop
subsystem: mcp-server, admin-ui
tags: [mcp, auth, dx, error-handling]
key-files:
  modified:
    - admin-ui/src/pages/api-tokens/ApiTokensPage.tsx
    - mcp-server/README.md
    - mcp-server/src/api-client.ts
    - mcp-server/src/index.ts
decisions:
  - "Non-blocking startup validation uses fire-and-forget IIFE — server continues connecting regardless of token check result"
  - "401 special case placed before generic message extraction — ensures the per-project diagnosis always surfaces on auth failure"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260405-jop: Fix Per-Project MCP Config Footgun Summary

**One-liner:** Added `-s user` flag to all CLI commands, per-project registration warning to README, descriptive 401 errors with fix instructions, and non-blocking startup token validation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add -s user flag to admin UI command and README warning | d45c98c | ApiTokensPage.tsx, README.md |
| 2 | Descriptive 401 errors and non-blocking startup token validation | 7f7ce56 | api-client.ts, index.ts |

## What Changed

### Task 1: Admin UI + README
- `ApiTokensPage.tsx` lines 218 and 232: Both the copyable text and visible command text now include `-s user` between `add` and `localization`
- `mcp-server/README.md`: Added "CLI registration (recommended)" section with `-s user` example and a warning block explaining the per-project override footgun and recovery command

### Task 2: MCP Server error handling + startup validation
- `mcp-server/src/api-client.ts`: Added `status === 401` branch in `handleError` before the generic message extraction — throws `ApiError` with actionable per-project diagnosis and exact fix command
- `mcp-server/src/index.ts`: Imported `apiGet`, added fire-and-forget IIFE after `createServer()` that hits `/translations/projects?limit=1`; logs specific 401 error (per-project config) vs generic warning (backend unreachable) to stderr

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `grep -n "\-s user" admin-ui/src/pages/api-tokens/ApiTokensPage.tsx` — 2 matches (lines 218, 232)
2. `grep -n "\-s user" mcp-server/README.md` — 3 matches (CLI example + warning block + recovery command)
3. `grep -n "per-project" mcp-server/src/api-client.ts` — 1 match in 401 error message
4. `grep -n "translations/projects" mcp-server/src/index.ts` — 1 match in startup validation
5. `cd mcp-server && npx tsc --noEmit` — PASS, no errors

## Known Stubs

None.

## Self-Check: PASSED

- `d45c98c` exists in git log
- `7f7ce56` exists in git log
- All 4 modified files contain the expected strings per plan must_haves
