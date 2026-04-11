---
phase: quick
plan: 260405-ms8
subsystem: mcp-server
tags: [mcp, ai-translate, context, translation-quality]
dependency_graph:
  requires: []
  provides: [ai_translate context parameter wired to backend]
  affects: [mcp-server/src/tools/ai.ts]
tech_stack:
  added: []
  patterns: [conditional spread for optional params, matching ai_quality_check pattern]
key_files:
  created: []
  modified:
    - mcp-server/src/tools/ai.ts
decisions:
  - Match ai_quality_check's conditional spread pattern for context forwarding
metrics:
  duration: 5 minutes
  completed_date: "2026-04-05"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260405-ms8: Add context parameter to ai_translate MCP tool Summary

**One-liner:** Wired optional `context` parameter to `ai_translate` MCP tool, forwarding it to the backend `/translations/ai-translate` endpoint to improve AI translation quality for ambiguous strings.

## What Was Done

Added an optional `context` parameter to the `ai_translate` MCP tool in `mcp-server/src/tools/ai.ts`. The backend `AiTranslateDto` already accepted `context` and passed it to Gemini, but the MCP tool did not expose it. This is a pure wiring fix with no backend changes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add context parameter to ai_translate MCP tool | 3184a2a | mcp-server/src/tools/ai.ts |

## Changes Made

**mcp-server/src/tools/ai.ts**

1. Updated `ai_translate` tool description to mention context support for ambiguous strings.
2. Added `context: z.string().max(1000).optional()` to the tool schema with descriptive hint.
3. Updated handler to destructure `context` and forward it conditionally via `...(context ? { context } : {})` in the `apiPost` body.

The pattern exactly mirrors the existing `ai_quality_check` tool which already used context successfully.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep -n 'context' mcp-server/src/tools/ai.ts` confirms context in: description (line 16), schema (line 21), handler destructuring (line 31), apiPost body (line 47).
- `npx tsc --noEmit --project mcp-server/tsconfig.json` passes with no errors.

## Known Stubs

None.

## Self-Check: PASSED

- File exists: `mcp-server/src/tools/ai.ts` — FOUND
- Commit exists: `3184a2a` — FOUND
