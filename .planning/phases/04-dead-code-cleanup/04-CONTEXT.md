# Phase 4: Dead Code Cleanup - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit every API endpoint and map it to a known consumer (Admin UI, MCP server, or public API). Remove confirmed orphaned endpoints with cascading cleanup of their service methods, DTOs, and entities. Identify and resolve partially-reverted features — each must be either fully implemented or fully removed.

</domain>

<decisions>
## Implementation Decisions

### Cleanup scope
- **D-01:** Endpoints + cascading dependencies — when an orphaned route is removed, also remove service methods, DTOs, and entities that become unreferenced. Not just routes.
- **D-02:** Whole modules (files/, webhooks/, mcp-prompts/) — audit for consumers but do NOT delete entire modules. Flag as orphan in inventory if no consumers found. Only remove individual endpoints within modules.

### MCP cross-reference
- **D-03:** MCP server source is `mcp-server/src/` in this repo (package: `localization-mcp-server`). Claude reads all `mcp-server/src/tools/*.ts` files and extracts API paths to auto-match against backend routes.
- **D-04:** MCP server uses `mcp-server/src/api-client.ts` (axios, baseURL `http://localhost:8080`) with Bearer token auth. All API calls go through `apiGet`, `apiPost`, `apiPatch`, `apiDelete` helpers.

### Inventory format
- **D-05:** Written inventory as `.planning/ENDPOINT-INVENTORY.md` — Markdown table: Method | Route | Consumer(s) | Status (active/orphan/flagged).
- **D-06:** Inventory is a snapshot artifact of this audit, not a living document. May go stale and that's OK.

### Partial features
- **D-07:** Default policy for partial features: remove code. This is a stabilization milestone — unfinished work is unpredictable.
- **D-08:** Exception: if a partial feature is close to complete (90%+), flag it for user review before removing. User decides finish vs remove per case.
- **D-09:** DB columns/tables from removed features: keep in database. Remove only code (entity, service, controller). No DROP COLUMN migrations — columns stay nullable.

### Claude's Discretion
- Order of audit (which controllers to scan first)
- How to verify Admin UI consumption (grep `admin-ui/src/` for API paths)
- Commit granularity (one commit per removed endpoint or grouped by module)
- How to present flagged partial features for review

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend controllers (audit targets)
- `src/app.controller.ts` — Health/ready endpoints
- `src/modules/translations/controllers/translations.controller.ts` — Core translation routes (largest)
- `src/modules/translations/controllers/sandbox.controller.ts` — Sandbox routes
- `src/modules/translations/controllers/ai-config.controller.ts` — AI config routes
- `src/modules/auth/auth.controller.ts` — Auth routes
- `src/modules/auth/mcp-tokens.controller.ts` — MCP token management routes
- `src/modules/users/users.controller.ts` — User management routes
- `src/modules/files/files.controller.ts` — File storage routes
- `src/modules/webhooks/webhooks.controller.ts` — Webhook management routes
- `src/modules/mcp-prompts/mcp-prompts.controller.ts` — MCP prompt customization routes

### MCP server (consumer — cross-reference source)
- `mcp-server/src/api-client.ts` — API client, base URL, auth method
- `mcp-server/src/tools/translations.ts` — Translation tool API calls
- `mcp-server/src/tools/production.ts` — Production read API calls
- `mcp-server/src/tools/sandbox-writes.ts` — Sandbox write API calls
- `mcp-server/src/tools/diff.ts` — Diff API calls
- `mcp-server/src/tools/snapshots.ts` — Snapshot API calls
- `mcp-server/src/tools/webhooks.ts` — Webhook API calls
- `mcp-server/src/tools/environment.ts` — Environment API calls
- `mcp-server/src/tools/project-management.ts` — Project management API calls
- `mcp-server/src/tools/ai.ts` — AI translation/quality API calls

### Admin UI (consumer — cross-reference source)
- `admin-ui/src/api/client.ts` — Axios client with interceptors
- `admin-ui/src/pages/` — All page components that make API calls

### Codebase analysis
- `.planning/codebase/STRUCTURE.md` — Full directory layout and file purposes
- `.planning/codebase/CONCERNS.md` — Known tech debt, partial features, fragile areas

### Requirements
- `.planning/REQUIREMENTS.md` CLEAN-01, CLEAN-02 — Endpoint mapping and orphan removal requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-server/src/api-client.ts`: All MCP API calls use `apiGet`/`apiPost`/`apiPatch`/`apiDelete` — grep these for complete API path inventory
- `admin-ui/src/api/client.ts`: All Admin UI API calls go through this axios client — grep for `.get(`, `.post(`, `.patch(`, `.delete(` patterns
- `.planning/codebase/CONCERNS.md`: Already identifies some partial features and tech debt

### Established Patterns
- Controllers follow NestJS decorator pattern: `@Get()`, `@Post()`, `@Patch()`, `@Delete()` with path parameters
- Swagger decorators on all endpoints: `@ApiOperation`, `@ApiResponse` — can be used to auto-extract route inventory
- Guards pattern: `@UseGuards(JwtAuthGuard)` for protected routes, no guard for public routes

### Integration Points
- 3 consumer categories to cross-reference: Admin UI pages, MCP server tools, public API (Locize-compatible `GET /translations/:projectSlug/:namespace/:locale`)
- `app.module.ts` imports all feature modules — removing a module requires updating this file
- Entity removal may require checking TypeORM relations (cascade, eager loading)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-dead-code-cleanup*
*Context gathered: 2026-04-02*
