---
type: quick
tasks: 3
estimated_context: 30%
files_modified:
  - src/modules/translations/translations.controller.ts
  - src/modules/translations/translations.service.ts
  - src/modules/translations/sandbox.controller.ts
  - src/modules/translations/sandbox.service.ts
  - src/modules/translations/dto/bulk-mark-expected.dto.ts
  - mcp-server/src/tools/ai.ts
  - admin-ui/src/pages/translations/components/api.ts
  - admin-ui/src/pages/translations/components/QualityBadge.tsx
  - admin-ui/src/pages/translations/components/EntryEditModal.tsx
---

<objective>
Remove dead production quality endpoints (mark-expected, bulk-mark-expected), migrate misrouted bulk-quality-check to sandbox controller, and clean up all associated dead code in service/controller/UI/MCP layers.

Purpose: Production is read-only except via sandbox promotion. These endpoints bypass that flow or are completely unused. Cleaning them reduces attack surface and confusion.
</objective>

<context>
@src/modules/translations/translations.controller.ts (lines 700-807: mark-expected, bulk-mark-expected, bulk-quality-check endpoints)
@src/modules/translations/translations.service.ts (lines 1331-1780: runQualityCheck, markAsExpected, unmarkExpected, bulkQualityCheck, bulkMarkExpected)
@src/modules/translations/sandbox.controller.ts (check-quality per-key endpoint at line 205, mark-expected at lines 370-410)
@src/modules/translations/sandbox.service.ts (runSandboxQualityCheck at line 1568)
@mcp-server/src/tools/ai.ts (bulk_check_quality tool at line 418)
@admin-ui/src/pages/translations/components/api.ts (markExpected/unmarkExpected at lines 218-239)
@admin-ui/src/pages/translations/components/QualityBadge.tsx (isSandbox branch for mark/unmark)
@admin-ui/src/pages/translations/components/EntryEditModal.tsx (isSandbox branch for mark/unmark)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bulkQualityCheck to sandbox service + controller, update MCP tool</name>
  <files>
    src/modules/translations/sandbox.service.ts
    src/modules/translations/sandbox.controller.ts
    mcp-server/src/tools/ai.ts
  </files>
  <action>
1. **sandbox.service.ts** -- Add `async bulkSandboxQualityCheck(projectSlug, nsSlug, keys: string[] | undefined, userId, userRole)` method. Pattern:
   - Call `requireProject(projectSlug)`, check `sandboxInitializedAt` (throw BadRequestException if not)
   - Find namespace via `namespaceRepo.findOne({ where: { projectId, slug: nsSlug } })`
   - If `keys` is empty/undefined, load all keys from `keyRepo.find({ where: { namespaceId: ns.id }, select: ['key'] })`
   - Loop over targetKeys, call `this.runSandboxQualityCheck(projectSlug, nsSlug, key, userId, userRole)` for each (existing per-key sandbox method)
   - Catch per-key errors, collect results as `Array<{ key, status: 'ok', results } | { key, status: 'error', error }>`
   - Return `{ results }`
   - Return type matches production `bulkQualityCheck` for MCP compatibility

2. **sandbox.controller.ts** -- Add endpoint:
   ```
   @Post('namespaces/:ns/entries/bulk-quality-check')
   @ApiOperation({ summary: 'Run AI quality check on multiple keys in sandbox' })
   ```
   - Import `BulkQualityCheckDto` from `./dto/bulk-quality-check.dto.js`
   - Accept `@Param('slug') slug, @Param('ns') ns, @Body() dto: BulkQualityCheckDto, @CurrentUser() user`
   - Call `this.sandboxService.bulkSandboxQualityCheck(slug, ns, dto.keys, user.userId, user.role)`
   - Place it near the existing per-key `check-quality` endpoint (after line ~223)

3. **mcp-server/src/tools/ai.ts** -- Update `bulk_check_quality` tool URL from:
   `/translations/projects/${projectSlug}/namespaces/${namespace}/entries/bulk-quality-check`
   to:
   `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/bulk-quality-check`
  </action>
  <verify>
    npm run lint:js (backend) passes with no errors in modified files.
    grep for the old production URL in mcp-server confirms zero matches.
  </verify>
  <done>
    Sandbox controller has bulk-quality-check endpoint, sandbox service has bulkSandboxQualityCheck method, MCP tool calls sandbox path.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove dead production endpoints and service methods</name>
  <files>
    src/modules/translations/translations.controller.ts
    src/modules/translations/translations.service.ts
    src/modules/translations/dto/bulk-mark-expected.dto.ts
  </files>
  <action>
1. **translations.controller.ts** -- Remove these endpoints entirely (not comment-out, delete):
   - `POST projects/:slug/namespaces/:ns/entries/bulk-quality-check` (lines ~702-719) -- now on sandbox controller
   - `POST projects/:slug/namespaces/:ns/entries/bulk-mark-expected` (lines ~721-739) -- completely dead
   - `POST projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` (lines ~753-776) -- production write, should go through sandbox
   - `DELETE projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` (lines ~778-802) -- same

2. **Remove now-unused imports** from translations.controller.ts:
   - `BulkQualityCheckDto` (only used by removed bulk-quality-check endpoint)
   - `BulkMarkExpectedDto` (only used by removed bulk-mark-expected endpoint)

3. **translations.service.ts** -- Remove these methods entirely:
   - `runQualityCheck` (~lines 1331-1465) -- only called by bulkQualityCheck being removed
   - `markAsExpected` (~lines 1468-1524) -- only called by controller and bulkMarkExpected being removed
   - `unmarkExpected` (~lines 1526-1577) -- only called by controller being removed
   - `bulkQualityCheck` (~lines 1661-1722) -- endpoint moved to sandbox
   - `bulkMarkExpected` (~lines 1724-1780) -- endpoint being removed
   
   Leave a comment block where the mark-expected/bulk-quality-check were:
   ```
   // Production mark-expected and bulk-quality-check removed — use sandbox endpoints
   ```

4. **Delete file** `src/modules/translations/dto/bulk-mark-expected.dto.ts` -- no remaining consumers.

5. **Keep** `src/modules/translations/dto/bulk-quality-check.dto.ts` -- now imported by sandbox.controller.ts (from Task 1).
  </action>
  <verify>
    npm run lint:js passes. `grep -rn 'markAsExpected\|unmarkExpected\|bulkMarkExpected\|runQualityCheck' src/modules/translations/translations.service.ts` returns zero matches. `ls src/modules/translations/dto/bulk-mark-expected.dto.ts` returns "No such file".
  </verify>
  <done>
    Production controller has no mark-expected or bulk-quality-check endpoints. translations.service.ts has no dead quality/expected methods. BulkMarkExpectedDto deleted.
  </done>
</task>

<task type="auto">
  <name>Task 3: Clean up UI -- remove dead production quality functions, disable mark-expected in production tab</name>
  <files>
    admin-ui/src/pages/translations/components/api.ts
    admin-ui/src/pages/translations/components/QualityBadge.tsx
    admin-ui/src/pages/translations/components/EntryEditModal.tsx
  </files>
  <action>
1. **api.ts** -- Delete the `markExpected` function (lines 218-228) and `unmarkExpected` function (lines 230-239). These called the production mark-expected endpoints that no longer exist.

2. **QualityBadge.tsx** -- Remove imports of `markExpected` and `unmarkExpected` from api.ts.
   - In the `expected` reviewState Popconfirm (unmark action, ~line 84-89): remove the `else await unmarkExpected(...)` branch. Only call `unmarkSandboxExpected` when `isSandbox` is true. When NOT in sandbox, do not show the Popconfirm at all -- just render the badge without click interaction.
   - In the default Popconfirm (mark action, ~line 153-157): remove the `else await markExpected(...)` branch. Only call `markSandboxExpected` when `isSandbox` is true. When NOT in sandbox, return the badge without the Popconfirm wrapper.
   - Pattern: `if (!isSandbox) return badge;` before each Popconfirm for mark/unmark expected actions. This makes production view read-only for quality status, consistent with the sandbox-first architecture.

3. **EntryEditModal.tsx** -- Remove imports of `markExpected` and `unmarkExpected` from api.ts.
   - In the `handleToggleExpected` handler (~lines 345-383): remove the `else` branches that call production `unmarkExpected`/`markExpected`. Only allow toggling when `isSandbox` is true.
   - When `!isSandbox`, either skip the toggle entirely (set `canToggleExpected = false` when `!isSandbox`) or guard the handler with `if (!isSandbox) return;` at the top.
   - Ensure the toggle button/icon is visually disabled or hidden when not in sandbox mode.
  </action>
  <verify>
    `cd admin-ui && npx tsc --noEmit` passes with no errors. `grep -rn 'markExpected\|unmarkExpected' admin-ui/src/pages/translations/components/api.ts` returns zero matches. `grep -rn "from.*api.*markExpected\|from.*api.*unmarkExpected" admin-ui/src/pages/translations/components/` returns zero matches (only sandbox versions remain).
  </verify>
  <done>
    Production quality functions removed from UI api layer. QualityBadge and EntryEditModal only allow mark-expected via sandbox endpoints. Production tab shows quality badges as read-only.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks:
1. `npm run lint:js` passes in backend root
2. `cd admin-ui && npx tsc --noEmit` passes
3. `grep -rn 'mark-expected' src/modules/translations/translations.controller.ts` returns zero matches
4. `grep -rn 'bulk-mark-expected' src/modules/translations/translations.controller.ts` returns zero matches
5. `grep -rn 'bulk-quality-check' src/modules/translations/translations.controller.ts` returns zero matches
6. `grep -rn '/namespaces/.*/entries/bulk-quality-check' mcp-server/src/tools/ai.ts` shows sandbox path only
7. No import of `markExpected` or `unmarkExpected` (non-sandbox versions) in any admin-ui component
</verification>

<success_criteria>
- All 5 production endpoints removed from translations.controller.ts (POST/DELETE mark-expected, bulk-mark-expected, bulk-quality-check)
- 5 dead service methods removed from translations.service.ts (runQualityCheck, markAsExpected, unmarkExpected, bulkQualityCheck, bulkMarkExpected)
- BulkMarkExpectedDto file deleted
- Sandbox controller has new bulk-quality-check endpoint
- Sandbox service has bulkSandboxQualityCheck method
- MCP bulk_check_quality tool calls sandbox path
- UI production tab shows quality badges as read-only (no mark/unmark expected actions)
- Both backend and frontend compile without errors
</success_criteria>
