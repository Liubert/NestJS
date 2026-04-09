---
phase: quick
plan: 260409-suq
type: execute
wave: 1
depends_on: []
files_modified:
  - mcp-server/src/tools/environment.ts
  - mcp-server/src/tools/ai.ts
autonomous: true
requirements: [MCP-BUG-FIX]

must_haves:
  truths:
    - "get_project_details displays namespace slugs as readable strings, not [object Object]"
    - "assess_integration_state displays namespace slugs as readable strings, not [object Object]"
    - "ai_translate displays per-locale translations correctly, not [object Object]"
    - "list_namespaces tool returns namespace slugs and avgScore for a given project"
  artifacts:
    - path: "mcp-server/src/tools/environment.ts"
      provides: "Fixed ProjectDetails type, fixed namespace formatting, new list_namespaces tool"
    - path: "mcp-server/src/tools/ai.ts"
      provides: "Fixed ai_translate response type and rendering"
  key_links:
    - from: "mcp-server/src/tools/environment.ts"
      to: "GET /translations/projects/:slug"
      via: "apiGet"
      pattern: "namespaces\\.map.*slug"
    - from: "mcp-server/src/tools/ai.ts"
      to: "POST /translations/ai-translate"
      via: "apiPost"
      pattern: "result\\.translations"
---

<objective>
Fix three [object Object] bugs in MCP response formatters and add a list_namespaces tool.

Purpose: MCP tools are showing `[object Object]` to AI agents instead of readable text because backend response shapes changed (namespaces became objects, ai-translate wraps translations in an envelope). This makes three core tools unusable in production.
Output: Corrected response formatters in environment.ts and ai.ts, plus new list_namespaces tool.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@mcp-server/src/tools/environment.ts
@mcp-server/src/tools/ai.ts

<interfaces>
From mcp-server/src/tools/environment.ts:
```typescript
interface ProjectDetails {
  id: string;
  slug: string;
  name: string | null;
  ownerId: string;
  locales: LocaleInfo[];
  namespaces: string[];  // BUG: backend now returns { slug: string; avgScore: number | null }[]
}
```

From mcp-server/src/tools/ai.ts (line 65):
```typescript
const result = await apiPost<Record<string, string>>(  // BUG: backend returns { translations, contextNeed, contextReason }
  '/translations/ai-translate', {...}
);
```

From mcp-server/src/api-client.ts:
```typescript
export function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T>;
export function apiPost<T>(path: string, body?: Record<string, unknown>): Promise<T>;
```

From mcp-server/src/utils.ts:
```typescript
export function textResult(text: string): { content: { type: 'text'; text: string }[] };
export function errorResult(error: unknown): { content: { type: 'text'; text: string }[]; isError: true };
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix [object Object] bugs in environment.ts and ai.ts</name>
  <files>mcp-server/src/tools/environment.ts, mcp-server/src/tools/ai.ts</files>
  <action>
**environment.ts — Fix ProjectDetails type and two formatters:**

1. Change `ProjectDetails.namespaces` type from `string[]` to `{ slug: string; avgScore: number | null }[]`

2. In `get_project_details` handler (~line 105-107), replace:
   ```
   namespaces.join(', ')
   ```
   with:
   ```
   namespaces.map((n) => n.slug).join(', ')
   ```

3. In `assess_integration_state` handler (~line 210), replace:
   ```
   projectDetails.namespaces.join(', ')
   ```
   with:
   ```
   projectDetails.namespaces.map((n) => n.slug).join(', ')
   ```

**ai.ts — Fix ai_translate response type and rendering:**

1. Change the apiPost type parameter on ~line 65 from:
   ```
   apiPost<Record<string, string>>
   ```
   to:
   ```
   apiPost<{ translations: Record<string, string>; contextNeed: string; contextReason: string | null }>
   ```

2. Change `Object.entries(result).map(...)` on ~line 80 to:
   ```
   Object.entries(result.translations).map(...)
   ```

3. Optionally surface `result.contextNeed` if it is not 'none' — add after translations block:
   ```typescript
   if (result.contextNeed && result.contextNeed !== 'none') {
     lines.push(`Context need: ${result.contextNeed}${result.contextReason ? ` — ${result.contextReason}` : ''}`);
   }
   ```
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit -p mcp-server/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - ProjectDetails.namespaces typed as object array, not string array
    - get_project_details formats namespace slugs as readable strings
    - assess_integration_state formats namespace slugs as readable strings
    - ai_translate uses result.translations for iteration, not the raw envelope
    - TypeScript compiles with no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add list_namespaces MCP tool</name>
  <files>mcp-server/src/tools/environment.ts</files>
  <action>
Add a new `list_namespaces` tool in `registerEnvironmentTools()`, after the `get_project_details` tool registration (after ~line 117, before `assess_integration_state`).

The tool should:
- Name: `list_namespaces`
- Description: "List all namespaces in a project with their average quality scores. Use this to quickly see available namespaces and their quality health."
- Parameters: `{ projectSlug: z.string().describe("Project slug") }`
- Implementation:
  1. Call `apiGet<ProjectDetails>(\`/translations/projects/${projectSlug}\`)`
  2. Extract `namespaces` from the response (type is already `{ slug: string; avgScore: number | null }[]` from Task 1)
  3. Format output:
     - Header: `Namespaces in project "${projectSlug}" (N found):`
     - Each namespace: `  - {slug}` with ` — avg quality: {avgScore}/100` if avgScore is not null, or ` — no quality data` if null
     - If no namespaces: `No namespaces found in project "${projectSlug}".`
  4. Return via `textResult()`
  5. Wrap in try/catch with `errorResult(error)`

Follow the exact same pattern as `get_project_details` for error handling and apiGet usage.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js && npx tsc --noEmit -p mcp-server/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - list_namespaces tool registered in MCP server
    - Returns namespace slugs and avgScore for a given project
    - Handles empty namespace list gracefully
    - TypeScript compiles with no errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p mcp-server/tsconfig.json` passes with no errors
2. `npm run lint:js` passes for modified files
3. Grep confirms no remaining `.join(', ')` calls on the namespaces array (should all be `.map((n) => n.slug).join(', ')`)
4. Grep confirms `result.translations` is used in ai_translate, not bare `result`
</verification>

<success_criteria>
- All three [object Object] bugs are fixed: get_project_details, assess_integration_state, ai_translate
- list_namespaces tool is registered and returns namespace slugs + avgScore
- MCP server TypeScript compiles cleanly
- Lint passes
</success_criteria>

<output>
After completion, create `.planning/quick/260409-suq-fix-3-mcp-bugs-from-production-feedback-/260409-suq-SUMMARY.md`
</output>
