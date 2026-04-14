---
phase: quick
plan: 260405-jop
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-ui/src/pages/api-tokens/ApiTokensPage.tsx
  - mcp-server/README.md
  - mcp-server/src/api-client.ts
  - mcp-server/src/index.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Admin UI token modal shows `claude mcp add -s user` command (not without -s user)"
    - "MCP README warns about per-project registration causing 401 errors"
    - "401 API errors include actionable fix message mentioning per-project config issue"
    - "MCP server logs a clear warning on startup if token validation fails with 401"
  artifacts:
    - path: "admin-ui/src/pages/api-tokens/ApiTokensPage.tsx"
      provides: "Updated claude mcp add command with -s user flag"
      contains: "-s user"
    - path: "mcp-server/README.md"
      provides: "Warning about per-project registration and CLI example with -s user"
      contains: "-s user"
    - path: "mcp-server/src/api-client.ts"
      provides: "Descriptive 401 error message with fix instructions"
      contains: "per-project"
    - path: "mcp-server/src/index.ts"
      provides: "Non-blocking startup token validation"
      contains: "translations/projects"
  key_links:
    - from: "mcp-server/src/index.ts"
      to: "mcp-server/src/api-client.ts"
      via: "apiGet for startup validation"
      pattern: "apiGet.*translations/projects"
---

<objective>
Fix per-project MCP config footgun: add `-s user` flag to all generated commands, warn in docs, improve 401 error messages, and validate token on startup.

Purpose: Users registering the MCP server per-project (without `-s user`) silently override the global config, causing 401 errors in every other project. These four changes make the issue preventable, diagnosable, and self-documenting.

Output: Updated admin UI command, README warning, descriptive 401 errors, startup validation.
</objective>

<execution_context>
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/workflows/execute-plan.md
@/Users/liubomyrfedyshyn/WebstormProjects/nest_js/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-ui/src/pages/api-tokens/ApiTokensPage.tsx
@mcp-server/README.md
@mcp-server/src/api-client.ts
@mcp-server/src/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add -s user flag to admin UI command and README warning</name>
  <files>admin-ui/src/pages/api-tokens/ApiTokensPage.tsx, mcp-server/README.md</files>
  <action>
**ApiTokensPage.tsx** (lines 218 and 232):
Both lines contain the same command string. In both places, change:
  `claude mcp add localization -e MCP_TOKEN=...`
to:
  `claude mcp add -s user localization -e MCP_TOKEN=...`

The `-s user` flag must appear between `add` and `localization` (before the server name). Both the `copyable.text` prop (line 218) and the visible text (line 232) must match.

**mcp-server/README.md** — In the "Claude Code / Cursor integration" section (after the JSON config block ending at line 99, before the `---` on line 101):

1. Add a CLI example with `-s user`:
```
#### CLI registration (recommended)

\`\`\`bash
claude mcp add -s user localization \
  -e MCP_TOKEN=your-token \
  -e BACKEND_URL=http://your-backend:8080 \
  -- npx -y localization-mcp-server
\`\`\`
```

2. Add a warning block immediately after:
```
> **Warning:** Always register globally with `-s user`. Per-project registration (without `-s user`) creates a `.mcp.json` in the current directory that overrides the global config. This causes 401 errors in every other project because they pick up the override without the correct token. If you see unexpected 401s, run:
>
> ```
> claude mcp remove localization && claude mcp add -s user localization -e MCP_TOKEN=<token> -e BACKEND_URL=<url> -- npx -y localization-mcp-server
> ```
```
  </action>
  <verify>
    <automated>grep -n "\-s user" admin-ui/src/pages/api-tokens/ApiTokensPage.tsx | wc -l | xargs test 2 -eq && grep -c "\-s user" mcp-server/README.md | xargs test 2 -le && echo "PASS"</automated>
  </verify>
  <done>Admin UI shows `-s user` in both command instances. README has CLI example and warning block about per-project registration.</done>
</task>

<task type="auto">
  <name>Task 2: Descriptive 401 error in api-client and startup token validation in index.ts</name>
  <files>mcp-server/src/api-client.ts, mcp-server/src/index.ts</files>
  <action>
**mcp-server/src/api-client.ts** — In the `handleError` function (line 34), add a special case for status 401 before the generic ApiError throw. When `status === 401`:

```typescript
if (status === 401) {
  throw new ApiError(
    401,
    "Authentication failed (401). Most likely cause: localization-mcp is registered per-project (.mcp.json), which overrides the global config token.\n" +
    "Fix: claude mcp remove localization && claude mcp add -s user localization -e MCP_TOKEN=<token> -e BACKEND_URL=<url> -- npx -y localization-mcp-server",
    error.response?.data,
  );
}
```

Place this inside the `if (error instanceof AxiosError)` block, after extracting `status`, before the generic `throw new ApiError(status, ...)`.

**mcp-server/src/index.ts** — After `const server = createServer();` (line 36) and before `const transport = ...` (line 37), add a non-blocking startup validation. Import `apiGet` from `./api-client.js` at the top of the file (after the existing imports around line 11-12). The validation must not block server startup — use a fire-and-forget async call:

```typescript
// Non-blocking startup token validation
(async () => {
  try {
    await apiGet("/translations/projects", { limit: 1 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
      process.stderr.write(
        "[localization-mcp] ERROR: Token validation failed (401). The MCP_TOKEN is invalid or expired.\n" +
        "  Most likely cause: localization-mcp is registered per-project (.mcp.json), overriding the global config.\n" +
        "  Fix: claude mcp remove localization && claude mcp add -s user localization -e MCP_TOKEN=<token> -e BACKEND_URL=<url> -- npx -y localization-mcp-server\n",
      );
    } else {
      process.stderr.write(
        "[localization-mcp] WARNING: Startup health check failed. BACKEND_URL may be misconfigured or the server is unreachable.\n" +
        `  Error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
})();
```

The import of `apiGet` should be placed with the other imports. Since index.ts uses top-level await and dynamic imports, add after line 11:
```typescript
import { apiGet } from "./api-client.js";
```

Important: The validation fires and forgets — server startup continues immediately via `server.connect(transport)` regardless of the result.
  </action>
  <verify>
    <automated>cd /Users/liubomyrfedyshyn/WebstormProjects/nest_js/mcp-server && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>401 errors from api-client include per-project config diagnosis. Server startup validates token non-blockingly and logs clear warning on 401 or connection failure.</done>
</task>

</tasks>

<verification>
1. `grep -n "\-s user" admin-ui/src/pages/api-tokens/ApiTokensPage.tsx` shows 2 matches (copyable text + visible text)
2. `grep -n "\-s user" mcp-server/README.md` shows matches in CLI example and warning block
3. `grep -n "per-project" mcp-server/src/api-client.ts` shows descriptive 401 message
4. `grep -n "translations/projects" mcp-server/src/index.ts` shows startup validation call
5. `cd mcp-server && npx tsc --noEmit` passes without errors
</verification>

<success_criteria>
- Admin UI token modal command includes `-s user` flag in both copyable and visible text
- README has CLI example with `-s user` and warning about per-project registration footgun
- 401 API errors include actionable diagnosis mentioning per-project override and fix command
- MCP server validates token on startup and logs clear warning if 401 or unreachable
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/260405-jop-fix-per-project-mcp-config-issue-s-user-/260405-jop-SUMMARY.md`
</output>
