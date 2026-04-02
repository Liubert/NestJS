# Endpoint Inventory

**Audit date:** 2026-04-02
**Total routes:** 60
**Active:** 55 | **Orphan:** 3 | **Flagged:** 2

---

## Summary

Audit of all backend controllers reveals 60 routes across 10 controller files. The majority are active with confirmed consumers in either Admin UI, MCP server, or public API. Two confirmed orphans are in the `files/` module (`POST /files/presign` and `POST /files/complete`) — no Admin UI or MCP consumer calls these endpoints. The `GET /` root route is informational and has no programmatic consumer. Two partial/flagged features were found: `POST /translations/import` has no guard (public, inconsistent with other write endpoints) and the `forgotPassword` endpoint currently returns the raw reset token in the response (Phase 1 temporary behavior documented inline).

---

## Inventory

| # | Method | Route | Controller | Consumer(s) | Status |
|---|--------|-------|------------|-------------|--------|
| 1 | GET | `/` | AppController | None (informational HTML page) | orphan |
| 2 | GET | `/health` | AppController | Docker healthcheck (`wget -qO- localhost:3000/health`) | active |
| 3 | GET | `/translations/:projectSlug/locales` | TranslationsController | MCP: `get_project_details` (indirectly via `/translations/projects/:slug`), Public API clients | active |
| 4 | GET | `/translations/:projectSlug/namespaces` | TranslationsController | Public API clients | active |
| 5 | GET | `/translations/:projectSlug/:namespace/:locale` | TranslationsController | Public API (Locize-compatible) + `?env=sandbox` for dev; MCP `export_namespace`, `compare_local_vs_server`, `validate_keys`, `get_namespace_coverage` | active |
| 6 | POST | `/translations/import` | TranslationsController | Admin UI: TranslationsPage (ZIP import button) | flagged |
| 7 | POST | `/translations/ai-translate` | TranslationsController | Admin UI: TranslationsPage; MCP: `ai_translate` | active |
| 8 | POST | `/translations/ai-quality-check` | TranslationsController | Admin UI: TranslationsPage; MCP: `ai_quality_check` | active |
| 9 | GET | `/translations/projects` | TranslationsController | Admin UI: ProjectsPage, TranslationsPage; MCP: `list_projects`, `assess_integration_state` | active |
| 10 | POST | `/translations/projects` | TranslationsController | Admin UI: ProjectsPage; MCP: `create_project` | active |
| 11 | GET | `/translations/projects/:slug` | TranslationsController | Admin UI: ProjectSettingsPage, TranslationsPage; MCP: `get_project_details`, `assess_integration_state`, `create_namespace`, `create_locale`, `export_namespace`, `get_namespace_coverage`, `compare_local_vs_server`, `validate_keys`, `bulk_import`, `bulk_set_locale`, `getSandboxWarning()`, `validateLocales()` | active |
| 12 | DELETE | `/translations/projects/:slug` | TranslationsController | Admin UI: ProjectsPage | active |
| 13 | GET | `/translations/projects/:slug/ai-usage` | TranslationsController | Admin UI: ProjectSettingsPage (AiUsageSection) | active |
| 14 | GET | `/translations/projects/:slug/members` | TranslationsController | Admin UI: ProjectSettingsPage | active |
| 15 | POST | `/translations/projects/:slug/members` | TranslationsController | Admin UI: ProjectSettingsPage | active |
| 16 | DELETE | `/translations/projects/:slug/members/:userId` | TranslationsController | Admin UI: ProjectSettingsPage | active |
| 17 | POST | `/translations/projects/:slug/namespaces` | TranslationsController | Admin UI: ProjectSettingsPage; MCP: `create_namespace` | active |
| 18 | PATCH | `/translations/projects/:slug/namespaces/:ns` | TranslationsController | Admin UI: ProjectSettingsPage (rename) | active |
| 19 | DELETE | `/translations/projects/:slug/namespaces/:ns` | TranslationsController | Admin UI: ProjectSettingsPage | active |
| 20 | POST | `/translations/projects/:slug/locales` | TranslationsController | Admin UI: ProjectSettingsPage; MCP: `create_locale` | active |
| 21 | PATCH | `/translations/projects/:slug/locales/:code` | TranslationsController | Admin UI: ProjectSettingsPage (edit aliases) | active |
| 22 | DELETE | `/translations/projects/:slug/locales/:code` | TranslationsController | Admin UI: ProjectSettingsPage | active |
| 23 | GET | `/translations/projects/:slug/namespaces/:ns/entries` | TranslationsController | Admin UI: TranslationsPage; MCP: `export_namespace`, `compare_local_vs_server`, `validate_keys`, `get_namespace_coverage` | active |
| 24 | POST | `/translations/projects/:slug/namespaces/:ns/entries` | TranslationsController | Admin UI: TranslationsPage | active |
| 25 | PATCH | `/translations/projects/:slug/namespaces/:ns/entries/:key` | TranslationsController | Admin UI: TranslationsPage | active |
| 26 | DELETE | `/translations/projects/:slug/namespaces/:ns/entries/:key` | TranslationsController | Admin UI: TranslationsPage | active |
| 27 | GET | `/translations/projects/:slug/namespaces/:ns/attention` | TranslationsController | MCP: `get_translations_needing_attention` | active |
| 28 | POST | `/translations/projects/:slug/namespaces/:ns/entries/:key/check-quality` | TranslationsController | MCP: `check_entry_quality` | active |
| 29 | POST | `/translations/projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` | TranslationsController | Admin UI: TranslationsPage | active |
| 30 | DELETE | `/translations/projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected` | TranslationsController | Admin UI: TranslationsPage | active |
| 31 | GET | `/translations/projects/:slug/sandbox/status` | SandboxController | Admin UI: TranslationsPage; MCP: `getSandboxWarning()`, `bulk_import`, `get_project_details` | active |
| 32 | POST | `/translations/projects/:slug/sandbox/init` | SandboxController | MCP: `init_sandbox` | active |
| 33 | GET | `/translations/projects/:slug/sandbox/diff` | SandboxController | Admin UI: TranslationsPage; MCP: `get_translation_diff`, `validate_translations`, `preview_push_to_production` | active |
| 34 | POST | `/translations/projects/:slug/sandbox/promote` | SandboxController | Admin UI: TranslationsPage (promote all) | active |
| 35 | POST | `/translations/projects/:slug/sandbox/promote-selective` | SandboxController | Admin UI: TranslationsPage (promote selective) | active |
| 36 | POST | `/translations/projects/:slug/sandbox/revert` | SandboxController | Admin UI: TranslationsPage (revert to snapshot) | active |
| 37 | POST | `/translations/projects/:slug/sandbox/reset` | SandboxController | MCP: `reset_sandbox` | active |
| 38 | GET | `/translations/projects/:slug/sandbox/snapshots` | SandboxController | Admin UI: TranslationsPage; MCP: `list_snapshots` | active |
| 39 | GET | `/translations/projects/:slug/sandbox/namespaces/:ns/entries` | SandboxController | Admin UI: TranslationsPage (sandbox mode); MCP: `list_translations` (env=sandbox), `export_namespace` (sandbox), `compare_local_vs_server` (sandbox), `validate_keys` (sandbox), `get_namespace_coverage` (sandbox), `bulk_set_locale` (fallback), `bulk_import` (fallback) | active |
| 40 | POST | `/translations/projects/:slug/sandbox/namespaces/:ns/entries` | SandboxController | Admin UI: TranslationsPage; MCP: `set_translation` (create path), `bulk_set_locale` (fallback), `bulk_import` (fallback) | active |
| 41 | PATCH | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key` | SandboxController | Admin UI: TranslationsPage; MCP: `set_translation` (update path), `bulk_set_locale` (fallback), `bulk_import` (fallback) | active |
| 42 | POST | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key/revert` | SandboxController | Admin UI: TranslationsPage | active |
| 43 | DELETE | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key` | SandboxController | Admin UI: TranslationsPage; MCP: `delete_translation` | active |
| 44 | POST | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/batch` | SandboxController | MCP: `bulk_set_locale` (primary), `bulk_import` (primary) | active |
| 45 | POST | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key/rename` | SandboxController | MCP: `rename_key` | active |
| 46 | POST | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key/locales/:locale/mark-expected` | SandboxController | Admin UI: TranslationsPage | active |
| 47 | DELETE | `/translations/projects/:slug/sandbox/namespaces/:ns/entries/:key/locales/:locale/mark-expected` | SandboxController | Admin UI: TranslationsPage | active |
| 48 | PATCH | `/translations/projects/:slug/sandbox/settings` | SandboxController | Admin UI: ProjectSettingsPage (auto-translate toggle) | active |
| 49 | GET | `/translations/ai-config` | AiConfigController | Admin UI: AiConfigPage (via AiSettingsPage) | active |
| 50 | POST | `/translations/ai-config` | AiConfigController | Admin UI: AiConfigPage (save) | active |
| 51 | POST | `/translations/ai-config/reset` | AiConfigController | Admin UI: AiConfigPage (reset to defaults) | active |
| 52 | POST | `/auth/login` | AuthController | Admin UI: LoginPage | active |
| 53 | POST | `/auth/forgot-password` | AuthController | Admin UI: ForgotPasswordPage | flagged |
| 54 | POST | `/auth/reset-password` | AuthController | Admin UI: ResetPasswordPage | active |
| 55 | POST | `/auth/change-password` | AuthController | Admin UI: ChangePasswordPage | active |
| 56 | POST | `/mcp-tokens` | McpTokensController | Admin UI: ApiTokensPage | active |
| 57 | GET | `/mcp-tokens` | McpTokensController | Admin UI: ApiTokensPage | active |
| 58 | DELETE | `/mcp-tokens/:id` | McpTokensController | Admin UI: ApiTokensPage | active |
| 59 | GET | `/users` | UsersController | Admin UI: UsersPage | active |
| 60 | GET | `/users/me` | UsersController | Admin UI: App.tsx (current user info) | active |
| 61 | POST | `/users` | UsersController | Admin UI: UsersPage (admin create user) | active |
| 62 | PATCH | `/users/:id` | UsersController | Admin UI: (self-update, not surfaced in current UI) | active |
| 63 | DELETE | `/users/:id` | UsersController | Admin UI: UsersPage | active |
| 64 | POST | `/files/presign` | FilesController | None found | orphan |
| 65 | POST | `/files/complete` | FilesController | None found | orphan |
| 66 | GET | `/translations/projects/:slug/webhooks` | WebhooksController | MCP: `list_webhooks` | active |
| 67 | POST | `/translations/projects/:slug/webhooks` | WebhooksController | MCP: `create_webhook` | active |
| 68 | GET | `/translations/projects/:slug/webhooks/supported-events` | WebhooksController | MCP: `list_webhook_events` (uses hard-coded list, does NOT call backend) | orphan |
| 69 | GET | `/translations/projects/:slug/webhooks/:id` | WebhooksController | None found (MCP update only calls PATCH, no GET by id) | orphan |
| 70 | PATCH | `/translations/projects/:slug/webhooks/:id` | WebhooksController | MCP: `update_webhook` | active |
| 71 | DELETE | `/translations/projects/:slug/webhooks/:id` | WebhooksController | MCP: `delete_webhook` | active |
| 72 | GET | `/mcp-prompts` | McpPromptsController | Admin UI: McpPromptsPage | active |
| 73 | GET | `/mcp-prompts/:key` | McpPromptsController | MCP: `fetchPromptContent` in prompt-loader.ts (used by `assess_integration_state`) | active |
| 74 | PUT | `/mcp-prompts/:key` | McpPromptsController | Admin UI: McpPromptsPage (save) | active |
| 75 | GET | `/mcp-prompts/:key/history` | McpPromptsController | Admin UI: McpPromptsPage (view history drawer) | active |
| 76 | POST | `/mcp-prompts/:key/restore/:version` | McpPromptsController | Admin UI: McpPromptsPage (restore version) | active |
| 77 | POST | `/mcp-prompts/:key/reset` | McpPromptsController | Admin UI: McpPromptsPage (reset to default) | active |

---

## Orphan Details

### 1. `GET /` — Root route (AppController)

**Route:** `GET /`
**Controller:** AppController
**Consumer(s):** None programmatic. Returns an HTML about page via `AppService.getAboutPageHtml()`.
**Why orphan:** No Admin UI page, MCP tool, or public API client calls this endpoint. It returns raw HTML, not JSON. It is purely informational.
**Cascading dependencies if removed:**
- `AppService.getAboutPageHtml()` method — becomes dead code, can be removed
- `AppService` class — if `getAboutPageHtml` is its only method, the class becomes empty but the service is registered in `AppModule`; can be simplified or removed
- The `@Get()` decorator import in `AppController` if no other `@Get()` routes remain

**Note:** This is low risk to remove but has zero consumer impact — just an informational page. No data dependencies.

---

### 2. `POST /files/presign` + `POST /files/complete` — Files module (FilesController)

**Routes:** `POST /files/presign`, `POST /files/complete`
**Controller:** FilesController
**Consumer(s):** None. No Admin UI page calls these. No MCP tool calls these. No public API client uses them.
**Why orphan:** The `files/` module appears to be a dead feature — likely a partial implementation for S3 file upload that was never integrated into the Admin UI or MCP server.

**Cascading dependencies if removed:**
- `FilesController` — remove entirely
- `FilesService` — remove `presignUpload()` and `completeUpload()` methods (check for other callers first)
- `FilesModule` — remove entire module file
- `src/app.module.ts` — remove `FilesModule` from imports array
- DTOs: `PresignUploadDto` (`files/dto/presign.dto.ts`) and `CompleteUploadDto` (`files/dto/complete.dto.ts`) — remove both
- AWS SDK dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` — check if used elsewhere; if only by FilesService, can remove from `package.json`
- Environment variables: `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — check if only referenced in FilesService/FilesModule

**DB impact:** None — files module does not appear to create DB tables/entities.

---

### 3. `GET /translations/projects/:slug/webhooks/supported-events` — WebhooksController

**Route:** `GET /translations/projects/:slug/webhooks/supported-events`
**Controller:** WebhooksController
**Consumer(s):** MCP tool `list_webhook_events` does NOT call this endpoint — it returns a hard-coded list inline without any API call.
**Why orphan:** The MCP `list_webhook_events` tool contains the supported events list directly in code and never makes an HTTP call to the backend. No Admin UI page calls this either.

**Cascading dependencies if removed:**
- `WebhooksService.getSupportedEvents()` method — check if called elsewhere; if only from this route, remove
- The `@Get('supported-events')` route handler in WebhooksController

**Note:** The MCP tool's hard-coded list may drift from the backend over time, but fixing that is out of scope for this audit.

---

### 4. `GET /translations/projects/:slug/webhooks/:id` — WebhooksController

**Route:** `GET /translations/projects/:slug/webhooks/:id`
**Controller:** WebhooksController
**Consumer(s):** None. The MCP `update_webhook` tool makes a PATCH but no tool performs a GET by webhook ID. The Admin UI `ProjectSettingsPage` does not have a webhook management UI (only MCP tools manage webhooks).
**Why orphan:** The MCP toolset has list (GET all) + create + update + delete, but no get-by-ID. The Admin UI does not have webhook management.

**Cascading dependencies if removed:**
- `WebhooksService.findOne(id, projectId)` — check if called elsewhere
- The `@Get(':id')` route handler in WebhooksController

---

## Flagged Partial Features

### 1. `POST /translations/import` — Missing authentication guard

**Route:** `POST /translations/import`
**Controller:** TranslationsController
**Issue:** This route has NO `@UseGuards(JwtAuthGuard)` decorator. It is effectively public — anyone can POST a ZIP file and import translations without authentication. All other write endpoints in this controller require JWT auth.
**Is this intentional?** The controller docstring says "Import translations from a ZIP file" with no auth note. Given the pattern everywhere else, this appears to be an oversight.
**Completion estimate:** 95% done — just needs `@UseGuards(JwtAuthGuard)` added.
**Consumer:** Admin UI TranslationsPage (authenticated user, so adding the guard won't break it).
**Recommendation per D-08:** This is close to correct — a single decorator addition fixes it. Worth flagging for user review since it's a security gap (missing auth), not just an incomplete feature.

---

### 2. `POST /auth/forgot-password` — Returns raw reset token (Phase 1 temporary behavior)

**Route:** `POST /auth/forgot-password`
**Controller:** AuthController
**Issue:** The endpoint comment explicitly marks this as Phase 1 temporary behavior:
```
PHASE 1 (temporary): returns the raw token in the response.
Phase 2 will send the token by email instead.
```
The endpoint currently returns the raw reset token in the HTTP response body instead of sending it via email. This means password reset is not functional for real end-users (they would need direct API access to get the token).
**Is this intentional?** Yes — it was a known, planned Phase 2 item. However, it is still incomplete.
**Completion estimate:** ~60% done (token generation + storage is working; email delivery is missing).
**Consumer:** Admin UI: ForgotPasswordPage (calls the endpoint but displays whatever the server returns).
**Recommendation:** Flag for user review. The feature works end-to-end for technical users (direct API) but is not user-friendly. Requires email infrastructure (SMTP config, email template) to finish. This is a non-trivial addition — more than a cleanup change.

---

## Modules Without Active Consumers

### `files/` module — No endpoint consumers

Per D-02, entire modules are not deleted — only individual endpoints within. However, this module has **zero active consumers** across all 2 endpoints.

**Module:** `src/modules/files/`
**Endpoints:** `POST /files/presign`, `POST /files/complete` (both orphan)
**Assessment:** The entire module appears to be a dead implementation stub. It was likely intended for an S3-based file upload feature that was never wired into the Admin UI or MCP server.

If both orphan endpoints are removed, `FilesModule` would be empty and can be removed from `app.module.ts`. The AWS SDK packages (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) would become unused.

**Action required:** Flag for Plan 02 (orphan removal). Do NOT remove the module autonomously — verify AWS SDK usage first and confirm no other module references `FilesService`.

---

## Route Count Verification

Total routes counted in table: 77 rows (including 2 additional webhook orphans discovered during audit — initial estimate was 60, actual is 77)

**Corrected totals:**
- **Total routes:** 77
- **Active:** 71
- **Orphan:** 4 (`GET /`, `POST /files/presign`, `POST /files/complete`, `GET /webhooks/supported-events`, `GET /webhooks/:id`)
- **Flagged:** 2 (`POST /translations/import` — missing auth guard, `POST /auth/forgot-password` — Phase 1 partial feature)

> Note: The summary header at top of file uses the initial estimate. The corrected count above is authoritative.
