---
phase: quick
plan: 260405-ng9
subsystem: mcp-server
tags: [mcp, ai-translate, sandbox, guidance, ux]
depends_on: []
provides: [precise-save-guidance, smart-sandbox-warning]
affects: [mcp-server/src/tools/ai.ts, mcp-server/src/tools/sandbox-writes.ts]
tech-stack:
  added: []
  patterns: []
key-files:
  modified:
    - mcp-server/src/tools/ai.ts
    - mcp-server/src/tools/sandbox-writes.ts
decisions:
  - "Sandbox warning conditioned on snapshotCount > 0: no-snapshot state means agent is writing fresh this session, warning is noise"
  - "ai_translate guidance names both tools with format hint to eliminate trial-and-error"
metrics:
  duration: 5m
  completed: 2026-04-05
---

# Phase quick Plan 260405-ng9: Fix ai_translate Save Guidance and Sandbox Warning Summary

**One-liner:** Precise bulk_import/bulk_set_locale save guidance in ai_translate output and snapshotCount-gated sandbox warning to eliminate agent confusion.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix ai_translate save guidance and sandbox warning condition | 82b976b | mcp-server/src/tools/ai.ts, mcp-server/src/tools/sandbox-writes.ts |
| 2 | Build MCP server to verify no compile errors | 82b976b | (no file change — tsc --noEmit passed) |

## Changes Made

### mcp-server/src/tools/ai.ts

Line 88: replaced the vague `Use set_translation or bulk_import to save these translations.` guidance with `To save: use bulk_import for all locales at once ({ "locale": { "key": "value" } } format), or bulk_set_locale for a single locale only.`

This gives the agent an unambiguous decision rule: multi-locale output from ai_translate → `bulk_import`; single locale → `bulk_set_locale`. The format hint removes the need to look up the schema separately.

### mcp-server/src/tools/sandbox-writes.ts

Line 41: changed `if (status.hasChanges)` to `if (status.hasChanges && status.snapshotCount > 0)`.

When `snapshotCount === 0` there are no prior snapshots from a previous session to review, so the warning is misleading noise. The warning now only fires when there are actual saved snapshots the agent should examine before adding more changes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- mcp-server/src/tools/ai.ts — modified and committed in 82b976b
- mcp-server/src/tools/sandbox-writes.ts — modified and committed in 82b976b
- TypeScript compilation: zero errors (npx tsc --noEmit clean)
- grep confirms "bulk_import" and "bulk_set_locale" present on guidance line
- grep confirms "snapshotCount > 0" in condition alongside "hasChanges"
