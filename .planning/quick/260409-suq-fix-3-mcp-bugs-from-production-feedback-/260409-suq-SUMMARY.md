---
phase: quick
plan: 260409-suq
subsystem: mcp-server
tags: [bugfix, mcp, translations, namespaces, ai-translate]
dependency_graph:
  requires: []
  provides: [list_namespaces tool, fixed namespace formatters, fixed ai_translate formatter]
  affects: [mcp-server/src/tools/environment.ts, mcp-server/src/tools/ai.ts]
tech_stack:
  added: []
  patterns: [MCP tool registration pattern, apiGet/apiPost typed envelopes]
key_files:
  modified:
    - mcp-server/src/tools/environment.ts
    - mcp-server/src/tools/ai.ts
decisions:
  - "Surfaced contextNeed/contextReason in ai_translate output when contextNeed != 'none' (per plan optional item)"
  - "list_namespaces shows 'no quality data' when avgScore is null rather than omitting the field"
metrics:
  duration: ~5min
  completed: 2026-04-09T17:55:50Z
  tasks_completed: 2
  files_modified: 2
---

# Phase quick Plan 260409-suq: Fix 3 MCP Bugs from Production Feedback — Summary

**One-liner:** Fixed `[object Object]` in namespace and ai_translate MCP output by correcting interface types and response envelope access; added `list_namespaces` tool with avgScore display.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix [object Object] bugs in environment.ts and ai.ts | 2acff93 | mcp-server/src/tools/environment.ts, mcp-server/src/tools/ai.ts |
| 2 | Add list_namespaces MCP tool | 5ca469f | mcp-server/src/tools/environment.ts |

## What Changed

### environment.ts

- `ProjectDetails.namespaces` type corrected from `string[]` to `{ slug: string; avgScore: number | null }[]` — matches actual backend response shape
- `get_project_details`: namespace list now rendered via `.map((n) => n.slug).join(', ')` instead of bare `.join(', ')` on objects
- `assess_integration_state`: same fix applied to the project details inline section
- New `list_namespaces` tool added between `get_project_details` and `assess_integration_state`; returns bulleted list of slugs with avgScore or "no quality data"

### ai.ts

- `ai_translate`: `apiPost` generic changed from `Record<string, string>` to `{ translations: Record<string, string>; contextNeed: string; contextReason: string | null }` to match backend envelope
- Translations rendered from `result.translations` instead of bare `result`
- `contextNeed`/`contextReason` surfaced in output when `contextNeed !== 'none'`

## Deviations from Plan

None — plan executed exactly as written. Optional contextNeed surfacing from the plan was implemented.

## Verification

- `npx tsc --noEmit -p mcp-server/tsconfig.json` — PASS (no type errors)
- `npx eslint mcp-server/src/tools/environment.ts mcp-server/src/tools/ai.ts` — PASS
- `npm run build` in mcp-server/ — PASS
- No remaining bare `namespaces.join()` calls — confirmed
- `result.translations` is used in ai_translate — confirmed

## Self-Check: PASSED

- environment.ts: FOUND
- ai.ts: FOUND
- Commit 2acff93: FOUND
- Commit 5ca469f: FOUND
