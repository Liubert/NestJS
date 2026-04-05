---
phase: quick
plan: 260405-uvr
subsystem: sandbox, mcp
tags: [sandbox, mcp, quality-check, context, agent-guide]

# Dependency graph
requires: []
provides:
  - "Fixed sandbox context comparison bug in updateSandboxEntry"
  - "Updated MCP AGENT_GUIDE_FALLBACK with 2-step pre-flight"
  - "REST URL section added to AGENT_GUIDE_FALLBACK"
  - "get_project_details REST URL hint in description"
  - "bulk_translate_and_save pre-flight reminder"
  - "MCP package version 1.3.4"
affects: [sandbox, mcp-agent-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sandbox context reads from sandbox_values (not translation_keys) — production and sandbox contexts can diverge"

key-files:
  created: []
  modified:
    - src/modules/translations/sandbox.service.ts
    - mcp-server/src/tools/environment.ts
    - mcp-server/src/tools/ai.ts
    - mcp-server/package.json

key-decisions:
  - "Read sandbox context from sandbox_values.context, not translation_keys.context, before computing contextChanged"
  - "MCP pre-flight is now 2-step: assess_integration_state (once per session) then get_project_details (before each write)"

patterns-established:
  - "Sandbox edits live in sandbox_values rows — always query sandbox_values for current sandbox state, not the production key entity"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-04-05
---

# Quick 260405-uvr: Fix Sandbox Quality Reset Bug and MCP Pre-flight Summary

**Fixed spurious quality resets when sandbox and production contexts differ; updated MCP AGENT_GUIDE_FALLBACK with 2-step assess_integration_state pre-flight and REST URL guidance.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-05T19:15:00Z
- **Completed:** 2026-04-05T19:27:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed `updateSandboxEntry` to read `sandboxCtxRow` from `sandbox_values` before comparing context — prevents spurious quality resets when sandbox context was edited but not yet promoted to production
- Replaced single-step `get_project_details` pre-flight in AGENT_GUIDE_FALLBACK with explicit 2-step flow: `assess_integration_state` first (establishes backend URL and project list), then `get_project_details` before writes
- Added REST URL section to AGENT_GUIDE_FALLBACK clarifying that client apps fetch translations via HTTP GET, not via MCP
- Added REST URL hint to `get_project_details` description and `assess_integration_state` reminder to `bulk_translate_and_save` description
- Bumped MCP package version 1.3.3 → 1.3.4

## Task Commits

1. **Task 1: Fix sandbox context comparison in updateSandboxEntry** - `3ff0efe` (fix)
2. **Task 2: Update MCP tool descriptions and AGENT_GUIDE_FALLBACK** - `decce64` (feat)

## Files Created/Modified
- `src/modules/translations/sandbox.service.ts` - Added sandboxCtxRow lookup before contextChanged computation
- `mcp-server/src/tools/environment.ts` - Updated AGENT_GUIDE_FALLBACK pre-flight section and added REST URL section; added REST URL hint to get_project_details description
- `mcp-server/src/tools/ai.ts` - Added assess_integration_state reminder to bulk_translate_and_save description
- `mcp-server/package.json` - Version bump 1.3.3 → 1.3.4

## Decisions Made
- Read sandbox context from `sandbox_values.context` rather than `keyEntity.context` (production key) — sandbox edits modify `sandbox_values` rows, not `translation_keys`, so the old approach triggered false quality resets whenever production and sandbox contexts differed.
- Kept `delete_translation` description unchanged (no pre-flight note needed — it is already covered by the NEVER DO section in AGENT_GUIDE_FALLBACK).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The root `npx tsc --noEmit` picked up admin-ui TypeScript errors (pre-existing, unrelated). Used `npx tsc --noEmit --project tsconfig.build.json` for backend-only type-check, which passed cleanly.

## Known Stubs

None.

## Next Phase Readiness
- Sandbox quality reset bug is fixed; editing a locale value without changing context no longer triggers a quality reset for all locales.
- MCP agents following the updated AGENT_GUIDE_FALLBACK will now call `assess_integration_state` at session start before proceeding to writes.
- MCP package ready to publish at 1.3.4.

---
*Quick task: 260405-uvr*
*Completed: 2026-04-05*
