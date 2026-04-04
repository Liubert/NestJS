# localization-mcp-server

MCP server for the localization backend. Provides controlled AI access to translations: reading, editing, quality checks, sandbox workflow, project management, webhooks, and more.

## Installation

```bash
npm install -g localization-mcp-server
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_TOKEN` | **Yes** | API token for backend authentication |
| `BACKEND_URL` | **Yes** | Base URL of the localization backend (e.g. `http://localhost:8080`) |
| `ADMIN_UI_URL` | No | Admin UI URL for links in tool responses |
| `NODE_ENV` | No | In non-production mode, loads `.env` from the package directory |
| `AUDIT_LOG_PATH` | No | Path for write-operation audit log (default: `./mcp-audit.log`) |

Copy `.env.example` as a starting point.

### Environment safety (mandatory)

**Dynamic environment resolution is a core requirement**, not optional.

The developer configuring this MCP server is responsible for wiring `BACKEND_URL` to the correct environment. The server does **not** auto-detect which environment it should target.

**Rules:**

1. **`BACKEND_URL` must always be set explicitly.** If missing, the server logs a loud warning and falls back to `http://localhost:8080`. This fallback exists only to avoid a hard crash — it is not a safe default for your setup.

2. **Never hardcode production URLs** in MCP config that is also used during development. Use environment-specific `.env` files or inject `BACKEND_URL` from your CI/runtime config.

3. **Development agents should work with sandbox.** All MCP write tools target sandbox only — production is read-only. But `BACKEND_URL` still determines *which server's* sandbox you hit.

4. **If environment is unknown, fail safely.** Do not silently guess production. The server will show `(NOT SET)` in diagnostic output if `BACKEND_URL` is missing, making misconfiguration visible.

5. **Each environment needs its own `MCP_TOKEN`.** Tokens are server-specific — a dev token won't work on production and vice versa.

**Correct setup per environment:**

```
# Development (local)
BACKEND_URL=http://localhost:8080

# Staging
BACKEND_URL=http://your-stage-server:8080

# Production (if you have a read-only use case)
BACKEND_URL=https://your-prod-server
```

## Usage

Start the MCP server over stdio:

```bash
localization-mcp-server
```

Run the interactive setup helper:

```bash
localization-mcp-server setup
```

### Claude Code / Cursor integration

Add to your MCP config (`.mcp.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "localization": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "localization-mcp-server"],
      "env": {
        "MCP_TOKEN": "<your-token>",
        "BACKEND_URL": "http://your-backend:8080"
      }
    }
  }
}
```

---

## Available Tools (39 total)

### Environment & Discovery

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_projects` | List all projects with sandbox state | — |
| `get_project_details` | Namespaces, locales, sandbox status for a project | `projectSlug` |
| `assess_integration_state` | Full integration assessment with agent guide, URL patterns, and project details | `projectSlug?` |

### Reading Translations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_translations` | Browse entries with search, pagination, quality/locale filters | `projectSlug`, `namespace`, `env`, `search?`, `missingLocale?`, `qualityLevel?` |
| `get_translations_needing_attention` | Get non-green translations that need quality improvement | `projectSlug`, `namespace`, `qualityLevels?`, `includeUnchecked?` |
| `export_namespace` | Full JSON export per locale | `projectSlug`, `namespace`, `env?`, `locale?` |
| `get_namespace_coverage` | Per-locale fill percentage with missing key samples | `projectSlug`, `namespace`, `env?` |
| `compare_local_vs_server` | Diff local JSON against server entries | `projectSlug`, `namespace`, `translations?`, `filePath?`, `env?` |
| `validate_keys` | Check if a list of keys exist | `projectSlug`, `namespace`, `keys`, `env?` |

### Writing Translations (sandbox only)

All writes go to the sandbox. Production is read-only from MCP.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `set_translation` | Create or update one key (upsert). Partial locale update — only passed locales are changed. | `projectSlug`, `namespace`, `key`, `values`, `context?` |
| `bulk_set_locale` | Bulk upsert many keys for a single locale | `projectSlug`, `namespace`, `locale`, `entries`, `dryRun?` |
| `bulk_import` | Multi-locale bulk upsert from inline JSON or file path | `projectSlug`, `namespace`, `translations?`, `filePath?`, `contexts?`, `dryRun?` |
| `delete_translation` | Soft delete a key in sandbox | `projectSlug`, `namespace`, `key` |
| `rename_key` | Rename a key preserving all values | `projectSlug`, `namespace`, `oldKey`, `newKey` |
| `mark_expected` | Mark a locale translation as manually accepted (suppresses quality warnings) | `projectSlug`, `namespace`, `key`, `locale` |
| `unmark_expected` | Remove manual acceptance from a locale translation | `projectSlug`, `namespace`, `key`, `locale` |
| `revert_sandbox_entry` | Revert a single key to its production value | `projectSlug`, `namespace`, `key` |

### Sandbox & Production Workflow

| Tool | Description | Parameters |
|------|-------------|------------|
| `init_sandbox` | Initialize sandbox by copying production state | `projectSlug`, `force?` |
| `reset_sandbox` | Discard all sandbox changes (requires `confirmed: true`) | `projectSlug`, `confirmed` |
| `get_translation_diff` | Full diff between sandbox and production | `projectSlug`, `namespace?`, `locale?`, `statusFilter?` |
| `validate_translations` | Analyze diff for empty values, partial translations, deletions | `projectSlug`, `namespace?` |
| `preview_push_to_production` | Read-only preview of what would change on promote | `projectSlug` |
| `list_snapshots` | List available production snapshots | `projectSlug` |

> **Note:** Promoting sandbox to production is intentionally not available via MCP. Use the Admin UI.

### Project Management

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_project` | Create a new project | `slug`, `name?` |
| `create_namespace` | Create a namespace (requires `reason` justification) | `projectSlug`, `namespace`, `reason` |
| `rename_namespace` | Rename an existing namespace | `projectSlug`, `currentSlug`, `newSlug` |
| `delete_namespace` | Delete namespace with all keys (requires `confirmed: true`) | `projectSlug`, `namespace`, `confirmed` |
| `create_locale` | Add a locale to a project | `projectSlug`, `code`, `isDefault?` |
| `update_locale` | Update locale aliases | `projectSlug`, `code`, `aliases` |
| `delete_locale` | Remove locale and all its values (requires `confirmed: true`) | `projectSlug`, `code`, `confirmed` |

### AI Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `ai_translate` | Translate text to all project locales via Gemini | `projectSlug`, `text` |
| `ai_quality_check` | Stateless quality check — score, level, comment (not persisted) | `projectSlug`, `source`, `translation`, `locale`, `mode?`, `context?` |
| `check_entry_quality` | Quality check all locales of a key and persist results to DB | `projectSlug`, `namespace`, `key` |
| `get_ai_usage` | AI token usage statistics for a project | `projectSlug` |

### Webhooks

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_webhooks` | List webhook configs for a project | `projectSlug` |
| `create_webhook` | Register outgoing webhook | `projectSlug`, `url`, `events`, `description?`, `secret?` |
| `update_webhook` | Update webhook config | `projectSlug`, `webhookId`, `url?`, `events?`, `enabled?` |
| `delete_webhook` | Delete a webhook | `projectSlug`, `webhookId` |
| `list_webhook_events` | List supported event types | — |

---

## Workflows

### Starting a session

Before writing to any project:

```
1. list_projects                          → confirm project exists
2. get_project_details(projectSlug)       → get namespaces, locales, sandbox state
3. init_sandbox(projectSlug)              → if sandbox not initialized
4. [start writing]
```

### Adding translations for a new locale

```
1. get_project_details("my-app")          → confirm locale doesn't exist
2. create_locale("my-app", "nb-NO")       → add the locale
3. get_namespace_coverage("my-app", "common") → see fill gaps
4. list_translations("my-app", "common", { missingLocale: "nb-NO" })
5. bulk_set_locale("my-app", "common", "nb-NO", entries)
6. validate_translations("my-app")        → check for issues
7. preview_push_to_production("my-app")   → review before promoting
```

### Importing translations from a local file

```
1. compare_local_vs_server("my-app", "common", { filePath: "/path/to/en.json" })
   → see what's new, matching, or conflicting
2. bulk_import("my-app", "common", { filePath: "/path/to/translations.json", dryRun: true })
   → preview what would be imported
3. bulk_import("my-app", "common", { filePath: "/path/to/translations.json" })
   → actually import
4. get_translation_diff("my-app")         → verify changes
```

### Quality improvement workflow

```
1. get_translations_needing_attention("my-app", "common")
   → find yellow/red translations
2. For each problematic key:
   - Review context and values
   - set_translation to fix the value, OR
   - mark_expected if the translation is actually correct
3. check_entry_quality("my-app", "common", "button.save")
   → re-check and persist updated quality scores
```

### Integrating a new project (from a consumer app)

```
1. assess_integration_state("my-app")     → get full diagnosis
   → returns: URL patterns, classification guide, project state
2. Follow the guide for your integration state (S1-S6)
3. Update local app config to point to the backend
```

---

## Safety Rules

### Destructive operations (require explicit user instruction)

| Tool | Risk |
|------|------|
| `reset_sandbox` | Wipes all pending sandbox changes |
| `delete_translation` | Removes a key and all its values |
| `delete_locale` | Removes a locale across ALL namespaces |
| `delete_namespace` | Removes a namespace and ALL its keys |
| `bulk_import` with overwrite | Can silently overwrite existing translations |

### Locale code rules

- Always use exact BCP 47 codes from `get_project_details`
- Never guess or remap: `nb-NO` is not `no`, `da-DK` is not `da`
- Invalid codes are rejected with a clear error

### Namespace policy

- Always check existing namespaces before creating a new one
- `create_namespace` requires a `reason` explaining why no existing namespace fits
- If the target namespace is ambiguous, ask the user — don't guess

### Key naming

Keys must match: `/^[a-zA-Z0-9._-]+$/`

Valid: `button.save`, `error-message`, `form_field`
Invalid: `button/save`, `button save`, `button:save`

---

## Production Model

- All MCP writes go to **sandbox** only
- Production is **read-only** from MCP
- Promoting to production is a manual step via Admin UI
- `preview_push_to_production` shows what would change but does NOT push

## Published Files

The package publishes `dist/`, `flows/`, `.env.example`, and this README.
