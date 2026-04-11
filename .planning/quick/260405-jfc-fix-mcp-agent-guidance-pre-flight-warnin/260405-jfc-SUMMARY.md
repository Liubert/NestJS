---
phase: quick
plan: 260405-jfc
subsystem: mcp-server
tags: [mcp, agent-guidance, i18n, descriptions]
dependency_graph:
  requires: []
  provides: [pre-flight guidance in write tools, MCP boundary guidance in assess_integration_state]
  affects: [mcp-server/src/tools/sandbox-writes.ts, mcp-server/src/tools/project-management.ts, mcp-server/src/tools/environment.ts]
tech_stack:
  added: []
  patterns: [description-string-guidance]
key_files:
  modified:
    - mcp-server/src/tools/sandbox-writes.ts
    - mcp-server/src/tools/project-management.ts
    - mcp-server/src/tools/environment.ts
decisions:
  - Pre-flight note added as first element of description array for all four write tools
  - MCP boundary and i18n guidance added to assess_integration_state before the feedback suggestion line
metrics:
  duration: 5m
  completed: 2026-04-05
---

# Quick Task 260405-jfc: Fix MCP Agent Guidance Pre-flight Warning

**One-liner:** Prepend assess_integration_state reminder to four write-tool descriptions and add MCP/REST boundary + i18next recommendation to assess_integration_state output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Prepend pre-flight note to write-tool descriptions | b7a6838 | sandbox-writes.ts, project-management.ts |
| 2 | Add MCP boundary and i18n guidance to assess_integration_state | 5dffe71 | environment.ts |

## What Was Done

### Task 1
Added the following sentence as the first element of the description array for four write tools:

> "Before writing to a project for the first time in a session, call assess_integration_state to understand client URL patterns and integration state."

Tools updated:
- `set_translation` (sandbox-writes.ts)
- `bulk_set_locale` (sandbox-writes.ts)
- `create_namespace` (project-management.ts)
- `bulk_import` (project-management.ts)

### Task 2
Added two new sections to the `assess_integration_state` handler's output, inserted before the final feedback suggestion line:

- **"Important: MCP is for AI agents only"** — clarifies that client apps must not use MCP at runtime; they fetch via standard i18n library using the client URL pattern.
- **"Client-side integration"** — recommends i18next + react-i18next + i18next-http-backend for React apps when no i18n library is detected, with instruction to use the t() hook rather than a custom fetch.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` in mcp-server: passed with no errors
- `grep -c "assess_integration_state" sandbox-writes.ts project-management.ts`: 2 each (one per write tool)
- `grep -c "MCP is for AI agents only|Client-side integration|i18next" environment.ts`: 4 matches

## Self-Check: PASSED

Files exist:
- mcp-server/src/tools/sandbox-writes.ts - modified
- mcp-server/src/tools/project-management.ts - modified
- mcp-server/src/tools/environment.ts - modified

Commits exist:
- b7a6838 - feat(260405-jfc): add pre-flight note to write-tool descriptions
- 5dffe71 - feat(260405-jfc): add MCP boundary and i18n guidance to assess_integration_state
