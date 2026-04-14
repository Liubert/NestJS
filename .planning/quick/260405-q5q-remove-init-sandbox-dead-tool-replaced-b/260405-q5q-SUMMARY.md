---
phase: quick-260405-q5q
plan: 01
subsystem: mcp-server, sandbox
tags: [dead-code-cleanup, mcp-tools, sandbox]
dependency-graph:
  requires: []
  provides: [clean-sandbox-api, clean-mcp-tool-registry]
  affects: [mcp-server, sandbox.controller]
tech-stack:
  added: []
  patterns: [auto-init-on-project-create]
key-files:
  created: []
  modified:
    - src/modules/translations/sandbox.controller.ts
    - mcp-server/src/tools/production.ts
    - mcp-server/src/permissions.ts
    - mcp-server/src/prompts.ts
    - mcp-server/src/tools/environment.ts
    - mcp-server/README.md
    - mcp-server/AGENT_GUIDE.md
    - mcp-server/PROJECT_OVERVIEW.md
    - mcp-server/flows/onboarding-flow.yaml
decisions:
  - init_sandbox removed entirely — auto-init on project creation covers 100% of cases; reset_sandbox covers force-reset
metrics:
  duration: ~7min
  completed: 2026-04-05T16:00:00Z
  tasks: 2
  files: 9
---

# Phase quick-260405-q5q Plan 01: Remove init_sandbox Dead Tool and Endpoint Summary

**One-liner:** Removed dead `init_sandbox` MCP tool and `POST /sandbox/init` endpoint — replaced all guidance with auto-init and `reset_sandbox` references across 9 files.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Remove init_sandbox endpoint and MCP tool registration | 8406018 | sandbox.controller.ts, production.ts, permissions.ts |
| 2 | Update all MCP docs and prompts to remove init_sandbox references | 20f4e6a | prompts.ts, environment.ts, README.md, AGENT_GUIDE.md, PROJECT_OVERVIEW.md, onboarding-flow.yaml |

## What Was Done

**Task 1 — Code removal:**
- Deleted `InitSandboxDto` class and `@Post('init')` endpoint from `sandbox.controller.ts`
- Removed unused `IsBoolean` and `IsOptional` class-validator imports
- Deleted the `server.tool('init_sandbox', ...)` block from `mcp-server/src/tools/production.ts` (logWrite import kept — still used by reset_sandbox)
- Removed `init_sandbox` entry from `TOOL_REGISTRY` in `mcp-server/src/permissions.ts`

**Task 2 — Documentation cleanup:**
- All 9 occurrences of `init_sandbox` guidance replaced with auto-init note or `reset_sandbox` reference
- README.md tool count updated from 39 to 38
- Module migration workflow renumbered (Step 3, 4, 5, 6 → Step 2, 3, 4, 5 after removing init step)
- `AGENT_GUIDE.md` `### init_sandbox` tool reference section deleted
- `mcp-server/dist/` rebuilt to clear stale compiled references

## Verification

```
grep -r "init_sandbox" src/ mcp-server/ --include="*.ts" --include="*.md" --include="*.yaml"
→ PASS: zero references
```

```
cd mcp-server && npx tsc --noEmit
→ PASS: no errors
```

## Deviations from Plan

None — plan executed exactly as written. The `dist/` directory had a stale `permissions.d.ts` containing `init_sandbox` — rebuilt via `npm run build` in mcp-server to clear it. This is a build artifact (in .gitignore), not a source file.

## Known Stubs

None.

## Self-Check: PASSED

- `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/src/modules/translations/sandbox.controller.ts` — exists, contains `reset(` (verified)
- `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server/src/tools/production.ts` — exists, contains `reset_sandbox` (verified)
- `/Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server/src/permissions.ts` — exists, no `init_sandbox` (verified)
- Commits 8406018 and 20f4e6a verified in git log
