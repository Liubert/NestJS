---
phase: quick
plan: 260405-jfc
type: execute
wave: 1
depends_on: []
files_modified:
  - mcp-server/src/tools/sandbox-writes.ts
  - mcp-server/src/tools/project-management.ts
  - mcp-server/src/tools/environment.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Write-tool descriptions include pre-flight reminder to call assess_integration_state"
    - "assess_integration_state output includes MCP vs REST boundary guidance"
    - "assess_integration_state output includes client-side i18n library recommendation"
  artifacts:
    - path: "mcp-server/src/tools/sandbox-writes.ts"
      provides: "Updated set_translation and bulk_set_locale descriptions with pre-flight note"
    - path: "mcp-server/src/tools/project-management.ts"
      provides: "Updated bulk_import and create_namespace descriptions with pre-flight note"
    - path: "mcp-server/src/tools/environment.ts"
      provides: "MCP boundary section and i18n library recommendation in assess_integration_state"
  key_links: []
---

<objective>
Add pre-flight guidance to MCP write-tool descriptions and expand assess_integration_state output with MCP/REST boundary and i18n library recommendations.

Purpose: Agents calling write tools should be reminded to call assess_integration_state first; agents assessing integration should understand that MCP is server-side only and get i18n library guidance.
Output: Updated description strings in three tool files.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@mcp-server/src/tools/sandbox-writes.ts
@mcp-server/src/tools/project-management.ts
@mcp-server/src/tools/environment.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prepend pre-flight note to write-tool descriptions</name>
  <files>mcp-server/src/tools/sandbox-writes.ts, mcp-server/src/tools/project-management.ts</files>
  <action>
Prepend the following sentence to the BEGINNING of the description array for each of these four tools:

'Before writing to a project for the first time in a session, call assess_integration_state to understand client URL patterns and integration state.'

Specific locations:

1. **set_translation** (sandbox-writes.ts, ~line 82): The description is a `.join(' ')` array starting with 'Create or update a translation key in the sandbox (upsert).'. Prepend the pre-flight sentence as the first element of the array.

2. **bulk_set_locale** (sandbox-writes.ts, ~line 236): The description array starts with 'Bulk upsert multiple keys for a SINGLE locale in the sandbox.'. Prepend the pre-flight sentence as the first element.

3. **bulk_import** (project-management.ts, ~line 367): The description array starts with 'Import multiple translation keys into the sandbox at once.'. Prepend the pre-flight sentence as the first element.

4. **create_namespace** (project-management.ts, ~line 127): The description array starts with 'Create a new namespace in a project.'. Prepend the pre-flight sentence as the first element.

Do NOT change any other part of the descriptions. Only prepend.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && grep -c "assess_integration_state" mcp-server/src/tools/sandbox-writes.ts mcp-server/src/tools/project-management.ts | grep -E ":[2-9]|:[1-9][0-9]"</automated>
  </verify>
  <done>All four write tools (set_translation, bulk_set_locale, bulk_import, create_namespace) have the pre-flight note as the first sentence of their description.</done>
</task>

<task type="auto">
  <name>Task 2: Add MCP boundary and i18n guidance to assess_integration_state</name>
  <files>mcp-server/src/tools/environment.ts</files>
  <action>
In the assess_integration_state handler (environment.ts), find the `lines` array. Currently the last items pushed are the project rows (line ~183: `...projectRows`), followed by optional project details, and then the feedback line (line ~218-220).

Insert the following lines BEFORE the final feedback line push (before line 217 `lines.push('', 'If you encounter issues...')`):

```typescript
        lines.push(
          ``,
          `### Important: MCP is for AI agents only`,
          `MCP tools manage translations on the server. The client app (React/Vue/etc.) must NOT use MCP at runtime — it fetches translations via the client URL pattern above using a standard i18n library.`,
          `Before writing any client code, ask the user which i18n library they want to use, or confirm they are OK with a minimal implementation.`,
          ``,
          `### Client-side integration`,
          `If no i18n library is detected in the local project: for React apps, install i18next + react-i18next + i18next-http-backend, configure the backend URL to the client URL pattern above, and use the t() hook. Do NOT write a custom fetch — use the standard library instead.`,
        );
```

This must appear after the project details block (the `if (projectSlug)` block ending around line 215) but before the feedback suggestion line.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && grep -c "MCP is for AI agents only\|Client-side integration\|i18next" mcp-server/src/tools/environment.ts</automated>
  </verify>
  <done>assess_integration_state output includes "MCP is for AI agents only" section and "Client-side integration" section with i18next recommendation.</done>
</task>

</tasks>

<verification>
All changes are description/text-only. Verify with:
- `cd mcp-server && npx tsc --noEmit` compiles without errors
- grep confirms new strings present in all three files
</verification>

<success_criteria>
- Four write tools have pre-flight note in their descriptions
- assess_integration_state includes MCP boundary guidance and i18n library recommendation
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260405-jfc-fix-mcp-agent-guidance-pre-flight-warnin/260405-jfc-SUMMARY.md`
</output>
