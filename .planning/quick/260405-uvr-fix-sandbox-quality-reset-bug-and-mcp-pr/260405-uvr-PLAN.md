---
phase: quick
plan: 260405-uvr
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/translations/sandbox.service.ts
  - mcp-server/src/tools/environment.ts
  - mcp-server/src/tools/sandbox-writes.ts
  - mcp-server/src/tools/ai.ts
  - mcp-server/src/tools/project-management.ts
  - mcp-server/package.json
autonomous: true
requirements: []
must_haves:
  truths:
    - "Editing a sandbox locale value without changing context does NOT trigger quality reset for all locales"
    - "MCP AGENT_GUIDE_FALLBACK documents assess_integration_state as mandatory Step 1 before writes"
    - "MCP AGENT_GUIDE_FALLBACK includes REST URL section for client apps"
    - "All write-tool descriptions remind agents to call assess_integration_state first"
    - "get_project_details description includes REST URL hint"
  artifacts:
    - path: "src/modules/translations/sandbox.service.ts"
      provides: "Fixed context comparison using sandbox context instead of production"
      contains: "sandboxCtxRow"
    - path: "mcp-server/src/tools/environment.ts"
      provides: "Updated AGENT_GUIDE_FALLBACK with 2-step pre-flight and REST URL section"
      contains: "assess_integration_state"
    - path: "mcp-server/package.json"
      provides: "Patch version bump"
  key_links:
    - from: "sandbox.service.ts updateSandboxEntry"
      to: "sandboxRepo.findOne for context"
      via: "reads sandbox context before comparing"
      pattern: "sandboxRepo\\.findOne.*keyId.*select.*context"
---

<objective>
Fix two bugs: (1) sandbox quality reset incorrectly triggers when editing locale values because it compares against production context instead of sandbox context, and (2) update MCP tool descriptions to enforce assess_integration_state pre-flight and add REST URL guidance for client apps.

Purpose: Bug 1 causes spurious quality resets on every sandbox edit when production and sandbox contexts differ. Bug 2 ensures AI agents follow the correct pre-flight flow and know the REST URL pattern.
Output: Patched sandbox.service.ts, updated MCP tool descriptions, bumped MCP package version.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/modules/translations/sandbox.service.ts (lines 1308-1372 — updateSandboxEntry method)
@mcp-server/src/tools/environment.ts (lines 248-331 — AGENT_GUIDE_FALLBACK + get_project_details + assess_integration_state)
@mcp-server/src/tools/sandbox-writes.ts (tool descriptions for set_translation, bulk_set_locale, delete_translation)
@mcp-server/src/tools/ai.ts (tool descriptions for bulk_translate_and_save)
@mcp-server/src/tools/project-management.ts (bulk_import tool description)
@mcp-server/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix sandbox context comparison in updateSandboxEntry</name>
  <files>src/modules/translations/sandbox.service.ts</files>
  <action>
In `updateSandboxEntry` method (~line 1330), after `keyEntity` is loaded and before the `contextChanged` computation (line 1332-1337):

1. Add a query to read the actual sandbox context:
```typescript
const sandboxCtxRow = await this.sandboxRepo.findOne({
  where: { keyId: keyEntity.id, projectId: project.id, isDeleted: false },
  select: ['context'],
});
const oldContext = sandboxCtxRow?.context ?? keyEntity.context;
```

2. Remove the existing line `const oldContext = keyEntity.context;` (line 1333).

3. The `newContext` and `contextChanged` lines remain unchanged — they already reference `oldContext`.

This ensures `contextChanged` compares the incoming dto.context against the sandbox context (where edits actually live), not the production context from `translation_keys`.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>updateSandboxEntry reads sandbox context via sandboxRepo.findOne before computing contextChanged. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update MCP tool descriptions and AGENT_GUIDE_FALLBACK</name>
  <files>mcp-server/src/tools/environment.ts, mcp-server/src/tools/sandbox-writes.ts, mcp-server/src/tools/ai.ts, mcp-server/src/tools/project-management.ts, mcp-server/package.json</files>
  <action>
**2a. environment.ts — AGENT_GUIDE_FALLBACK pre-flight section (~line 265-277):**

Replace the current "MANDATORY PRE-FLIGHT" section:
```
## ⚠️ MANDATORY PRE-FLIGHT — Do This Before Every Write Session
Before calling `set_translation`, `bulk_set_locale`, `bulk_import`, or `delete_translation`:
```
get_project_details({ projectSlug: "travis" })
```
```

With:
```
## ⚠️ MANDATORY PRE-FLIGHT — Do This Before Every Write Session

**Step 1 (new session or unknown project):** Call `assess_integration_state` first.
This establishes the correct backend URL, client REST URL patterns, and project list in one call.

**Step 2 (before any write):** Call `get_project_details({ projectSlug: "..." })` to confirm locale codes and sandbox state.

Skip Step 1 only if `assess_integration_state` was already called earlier in this same session.
```

Keep the existing sandbox-state table (lines 273-277) that shows NOT initialized / no pending changes / HAS PENDING CHANGES — it stays after the new pre-flight text.

**2b. environment.ts — Add REST URL section after the "Client URL pattern" table (~after line 297):**

Insert after "Non-production environments MUST use `?env=sandbox`..." and before "## BACKEND_URL is the only source of truth":
```
## REST URL for client apps (READ-ONLY, not MCP)

The client app fetches translations at runtime via HTTP GET — never via MCP:
  GET {BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}          ← production
  GET {BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}?env=sandbox  ← non-production

MCP tools are for AI agents only. Client apps (React/Vue/Flutter/etc.) use the REST URL above with their i18n library.
```

**2c. environment.ts — get_project_details description (~line 70-74):**

Append to the description array (before `.join(' ')`):
`'Client apps fetch translations via REST GET /translations/{slug}/{namespace}/{locale} — MCP is for AI agents only.'`

**2d. sandbox-writes.ts — set_translation and bulk_set_locale already have the assess_integration_state note.** Verify `delete_translation` (line 420) does NOT have it. If missing, it does not need it (delete is destructive, covered by the NEVER DO section). No changes needed here.

**2e. ai.ts — bulk_translate_and_save description (~line 199-208):**

Add as the first element of the description array:
`'ALWAYS call assess_integration_state at the start of a new session before writing.'`

**2f. project-management.ts — bulk_import already has the pre-flight note (line 370).** No change needed.

**2g. mcp-server/package.json — bump version from 1.3.3 to 1.3.4.**
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>AGENT_GUIDE_FALLBACK has 2-step pre-flight with assess_integration_state as Step 1. REST URL section exists. get_project_details includes REST URL hint. bulk_translate_and_save has pre-flight note. MCP package version is 1.3.4. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
1. Backend TypeScript compiles: `cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit`
2. MCP TypeScript compiles: `cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server && npx tsc --noEmit`
3. Grep confirms sandbox fix: `grep -n 'sandboxCtxRow' src/modules/translations/sandbox.service.ts`
4. Grep confirms pre-flight update: `grep -n 'assess_integration_state' mcp-server/src/tools/environment.ts | wc -l` (should be more than before)
5. Grep confirms REST URL section: `grep -n 'REST URL for client apps' mcp-server/src/tools/environment.ts`
6. Version check: `grep '"version"' mcp-server/package.json` shows 1.3.4
</verification>

<success_criteria>
- sandbox.service.ts reads sandbox context (not production) before computing contextChanged
- AGENT_GUIDE_FALLBACK documents 2-step pre-flight with assess_integration_state as Step 1
- REST URL section added to AGENT_GUIDE_FALLBACK
- get_project_details description includes REST URL hint
- bulk_translate_and_save description includes pre-flight note
- MCP package version bumped to 1.3.4
- Both backend and MCP compile cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260405-uvr-fix-sandbox-quality-reset-bug-and-mcp-pr/260405-uvr-SUMMARY.md`
</output>
