# Localization MCP Server — Agent Guide

> This document is written for AI agents. Read it fully before making any changes.
> See also: [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — env rules, URL mapping, deployment behavior
> See also: [AUDIT_REPORT.md](AUDIT_REPORT.md) — known data quality issues in current translation data

---

## 🚫 NEVER DO WITHOUT EXPLICIT USER INSTRUCTION

The following actions are **irreversible or high-impact**. Never call them unless the user has explicitly asked for that specific action in the current message:

| Action | Why it's dangerous |
|---|---|
| `reset_sandbox` | Wipes all pending sandbox changes — irreversible |
| `push_changes_to_production` | Overwrites production data |
| `delete_translation` | Permanently removes a key and all its values |
| `bulk_import` with overwrite | Can silently overwrite existing translations |
| `check_entry_quality` | Writes quality scores to DB — may overwrite manual "expected" overrides |

AI read-like operations (`ai_translate`, `bulk_ai_translate`, `ai_quality_check`) are safe — they generate data but do not mutate anything.

`bulk_translate_and_save` **writes to sandbox** — it is an autonomous save action. Only call it when the user has asked to populate or fill translations.

**Investigating a problem ≠ permission to fix it.** If the user asks "why does X show Y", that is a diagnostic question — answer it, do not take action. Only act when the user says to.

---

## System overview

This MCP server wraps the Localization backend API. It lets agents manage translation keys through a **sandbox/production** workflow. All writes go to sandbox. Production is read-only. Nothing reaches production until a human promotes the sandbox via the Admin UI.

**Capabilities:** project/namespace/locale management, translation CRUD, sandbox/production diff, AI translation (Gemini), AI quality checks (stateless and persistent), key renaming, batch import with context.

**Backend URL (local):** `http://localhost:8080`
**Admin UI (local):** `http://localhost:3010`
**Auth:** `MCP_TOKEN` in `mcp-server/.env` (an `lmcp_` prefixed MCP token)

---

## ⚠️ MANDATORY PRE-FLIGHT — Do This Before Every Write Session

**Do not skip this.** Agents have written on top of pre-existing sandbox changes from other sessions, producing mixed, unreviewed diffs.

Before calling `set_translation`, `bulk_set_locale`, `bulk_import`, or `delete_translation`:

```
get_project_details({ projectSlug: "travis" })
```

This single call returns locale codes (required for every write) **and** full sandbox state including `hasChanges` and snapshot count.

### Decision table

| `get_project_details` sandbox line | What to do |
|------------------------------------|------------|
| `NOT initialized` | Sandbox auto-initializes on project creation. Use `reset_sandbox({ projectSlug, confirmed: true })` to re-sync |
| `initialized — no pending changes` | Safe to write |
| `initialized — HAS PENDING CHANGES` | Call `get_translation_diff` first to understand existing changes. Do not discard without explicit user instruction. |

---

## Integration Assessment — Start Here

Before doing any translation work, assess the current integration state of the local project. This is not a one-time setup — run it dynamically whenever the integration status is unclear.

### How to run an assessment

```
/assess                          — full guided assessment with instructions
assess_integration_state()       — fetch remote state + URL patterns + classification guide
assess_integration_state({ projectSlug: "my-app" })  — include full details for a specific project
```

### ⚠️ BACKEND_URL is the only source of truth for client config

The `Backend URL` returned by `assess_integration_state` is the only correct value for `I18N_BACKEND_URL` (or equivalent) in the local project's `.env` files.

**Never use `http://localhost:8080` unless `assess_integration_state` explicitly returns that URL.** The MCP server is configured with the correct backend URL — always use what it returns, not assumptions.

### The 6 integration states

| State | Description | What to do |
|-------|-------------|------------|
| **S1 — Correctly integrated** | Local config uses our backend URL AND `?env=sandbox` for non-production | Nothing — proceed with translation work |
| **S2 — Outdated integration** | Local config uses our backend URL but **missing** `?env=sandbox` for non-production | Repair: add `?env=sandbox` to non-production env config |
| **S3 — Not integrated, remote project available** | Local app uses different URL/system, but a remote project exists for this token | Connect: update local config to use correct URL patterns |
| **S4 — Not integrated, no remote project** | Local app uses different system, no remote project for this token | Create project, then integrate locally |
| **S5 — Project empty or incomplete** | Local config is correct (or project was just created), but remote project has no namespaces/locales/translations | Bootstrap: create namespace, locale, init sandbox, import content |
| **S6 — No localization at all** | No i18n system found in the local project | Full setup: install library, create config, then S4 path |

### Client URL pattern rule (mandatory)

This is the required pattern for consumer apps that fetch translations from this backend:

| Environment | URL |
|-------------|-----|
| **Production** | `{BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}` |
| **Non-production (dev/staging)** | `{BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}?env=sandbox` |

The `?env=sandbox` flag makes the server return sandbox (working copy) values instead of promoted production values. **Non-production environments MUST use this flag.** Without it, developers test against production data, which is always wrong.

If the local project is missing `?env=sandbox` for non-production environments, classify as **S2 — outdated integration** and repair it.

### What to look for locally

When inspecting the local project:
1. Search for the backend URL (from `assess_integration_state` output) in config/env files
2. Check for `?env=sandbox` in non-production translation fetch URLs
3. Check `.env`, `.env.local`, `.env.development`, `.env.production` for localization URL variables
4. Look for i18n initialization files (i18next, vue-i18n, react-intl, custom fetch)
5. Check for references to Locize or other external localization services (migration scenario)

---

## Environment rules

| Operation | Sandbox | Production |
|-----------|---------|------------|
| Read keys | ✅ | ✅ |
| Create key | ✅ | ❌ not possible |
| Update key | ✅ | ❌ not possible |
| Delete key | ✅ (soft delete) | ❌ not possible |
| Promote changes | ❌ manual only | via Admin UI |

**There is no MCP tool that writes to production.** This is architectural, not a permission check.

---

## Locale codes — critical

Locale codes are **case-sensitive** and must exactly match what `get_project_details` returns. This is the only authoritative source.

**Always call `get_project_details` before any write operation.** The response now includes:
- `code` — the exact string to use in all tool calls
- `isDefault` — which locale is the fallback

Example response for `travis`:
```json
"locales": [
  { "code": "en",    "isDefault": true  },
  { "code": "da-DK", "isDefault": false },
  { "code": "nb-NO", "isDefault": false },
  { "code": "sv",    "isDefault": false },
  { "code": "uk",    "isDefault": false }
]
```

**Do not guess, remap, or normalize locale codes.** If your source data uses different codes (e.g. `no`, `da`), you must resolve the mapping before calling any write tool — using the project metadata as the source of truth, not assumptions.

If a locale code from your source data does not appear in `get_project_details`, that is a blocker: do not proceed until it is resolved (create the locale or correct the source data).

**Known API gap — no alias information:** The API does not expose locale aliases (e.g. that `nb-NO` is also known as `no`). This mapping must come from the source data context or explicit human input — it is not derivable from the API alone. If you encounter this ambiguity, report it as a blocker rather than guessing.

---

## Namespace selection rules

**Default: reuse, do not create.**

Before writing anything, resolve the target namespace from project metadata and request context. Creating a new namespace is a last resort, not a default action.

### Decision order

1. **Explicit namespace in the request** — use it directly, no questions.
2. **Clear namespace from context** — if the request clearly relates to an existing namespace (frontend → `frontend`, mobile → `mobile`, backoffice → `backoffice-translations`), use that namespace.
3. **Project uses one namespace for that area** — if there is only one obvious match, use it without asking.
4. **Multiple namespaces, target is ambiguous** — ask the user which namespace to use. Do not guess.
5. **No matching namespace exists** — ask the user whether to create one or use an existing namespace. Do not create silently.

### Rules

- Always call `get_project_details` first to see the current namespace list.
- Treat the existing namespace structure as intentional. If the project separates frontend, backend, and mobile into different namespaces, reuse that structure.
- Never create a namespace just because the request did not explicitly name one.
- If a request covers work that spans multiple existing namespaces, ask the user how to split it — do not invent a new combined namespace.
- Do not assume that "new feature" → "new namespace". A new feature's keys almost always belong in an existing namespace.

### Example: what to do

```
Request: "Add expense report keys"
Project namespaces: ["backoffice-translations", "mobile"]

→ Context: expense report is a backoffice feature
→ Use: backoffice-translations
→ Do not create: expenses, expense-report, etc.
```

```
Request: "Add push notification copy"
Project namespaces: ["backoffice-translations", "mobile"]

→ Context: push notifications are mobile-specific
→ Use: mobile
→ Do not create: notifications, push, etc.
```

```
Request: "Add shared error messages"
Project namespaces: ["frontend", "backend", "mobile"]

→ Context: ambiguous — could belong to any namespace
→ Action: ask the user which namespace should receive these keys
```

---

## Key naming rules

Keys must match: `/^[a-zA-Z0-9._-]+$/`

Valid: `button.save`, `error-message`, `form_field`, `accessControl`
Invalid: `button/save`, `button save`, `button:save`

---

## Tool reference

### `assess_integration_state`
Fetches remote project state and returns URL patterns + classification guide for integration assessment. **Use this as the first call when running `/assess` or checking integration status.**

**Params:** `projectSlug` (optional) — if provided, also returns full details for that project

```
assess_integration_state()
assess_integration_state({ projectSlug: "travis" })
```

**Returns:** server config (BACKEND_URL, Admin UI URL), client URL patterns (production vs `?env=sandbox`), what to look for in local files, S1–S6 classification rules, remote project list, and optionally full project details.

---

### `create_project`
Creates a new translation project. **Only call after explicit user confirmation.** The slug must be unique.

After creating a project you must also call `create_namespace` and `create_locale` (sandbox auto-initializes on project creation).

**Params:**
- `slug` (required) — lowercase, hyphens allowed, e.g. `my-app`, `travis-v2`
- `name` (optional) — human-readable display name shown in Admin UI

```
create_project({ slug: "my-app", name: "My Application" })
```

**Returns:** project ID, slug, name, and required next steps.

---

### `list_projects`
Lists all accessible projects with sandbox state.

**Returns:** slug, name, sandbox initialized (yes/no), has pending changes (yes/no)

```
list_projects()
```

---

### `get_project_details`
Gets namespaces, locales, and IDs for a project. **Call this first** to get valid locale codes before writing.

**Params:** `projectSlug` (required)

```
get_project_details({ projectSlug: "travis" })
```

**Response example:**
```
Project: travis — "TRAVIS"
Locales (5): en, da-DK (default), nb-NO, sv, uk
Namespaces (2): backoffice-translations, mobile
```

---

### `list_translations`
Reads translation entries from a namespace. **Defaults to sandbox view.**

**Params:**
- `projectSlug` (required)
- `namespace` (required) — e.g. `backoffice-translations`
- `env` — `sandbox` (default) or `production`
- `page`, `limit` (default 1, 50)
- `search` — searches keys and values (min 2 chars)
- `searchLocale` — restricts value search to one locale. **Only works when `search` is also provided.**
- `sortBy` — `key` (default) or `createdAt`
- `sortOrder` — `asc` (default) or `desc`

```
list_translations({ projectSlug: "travis", namespace: "backoffice-translations", env: "sandbox", search: "button" })
```

**Known limitation:** `searchLocale` without `search` has no effect.

---

### `set_translation`
Creates or updates a translation key in sandbox (upsert). Calls PATCH first; falls back to POST if key does not exist.

**Always writes to sandbox. Never touches production.**

**Params:**
- `projectSlug` (required)
- `namespace` (required)
- `key` (required) — must match `/^[a-zA-Z0-9._-]+$/`
- `values` (required) — `{ "en": "Save", "nb-NO": "Lagre" }`

```
set_translation({
  projectSlug: "travis",
  namespace: "backoffice-translations",
  key: "button.save",
  values: { "en": "Save", "nb-NO": "Lagre", "da-DK": "Gem", "sv": "Spara" }
})
```

**Important:** You do not have to provide all locales at once. Omitted locales keep their existing value.

**Warning:** If you pass unknown locale codes, the tool will list them explicitly. Fix them before moving on.

---

### `delete_translation`
Soft-deletes a key in sandbox across all locales. The key remains in production until promote.

**Params:** `projectSlug`, `namespace`, `key`

---

### `create_namespace`
Creates a new namespace in a project. Required before using `set_translation` or `bulk_import` for a new module.

**Params:**
- `projectSlug` (required)
- `namespace` (required) — lowercase alphanumeric with dashes: `expenses`, `mobile-v2`

```
create_namespace({ projectSlug: "travis", namespace: "expenses" })
```

Returns an error if the namespace already exists. Sandbox auto-initializes on project creation — no manual init needed.

---

### `create_locale`
Adds a locale to a project. Must be done before any translations can be written for that locale.

**Params:**
- `projectSlug` (required)
- `code` (required) — **full BCP 47 code**: `nb-NO`, `da-DK`, `sv`, `en`, `uk`. Do NOT use `no`, `da`.
- `isDefault` (optional, default false)

```
create_locale({ projectSlug: "travis", code: "pl", isDefault: false })
```

---

### `export_namespace`
Exports all translation keys for a namespace as a flat JSON map, per locale. Fetches all pages automatically.

Use this to:
- See the full content of a namespace
- Get the data format needed for `bulk_import`
- Compare before/after a migration

**Params:**
- `projectSlug` (required)
- `namespace` (required)
- `env` — `production` (default) or `sandbox`
- `locale` — restrict to one locale; omit for all locales

```
export_namespace({ projectSlug: "travis", namespace: "backoffice-translations", env: "production" })
```

---

### `bulk_import`
Imports multiple translation keys into sandbox at once from a JSON map. Much faster than calling `set_translation` one key at a time.

**Always writes to sandbox. Production is unchanged.**

**Params:**
- `projectSlug` (required)
- `namespace` (required) — must already exist (use `create_namespace` first)
- `translations` (required) — locale → key → value map:
  ```json
  { "en": { "save": "Save", "cancel": "Cancel" }, "nb-NO": { "save": "Lagre", "cancel": "Avbryt" } }
  ```
- `dryRun` (optional, default false) — preview what would be imported without writing

**Strategy:** For each key, tries PATCH first (update existing); falls back to POST if key does not exist (404). This is safe to run multiple times.

**Validation:** Aborts immediately if any locale code is not in the project. Fix the codes and retry.

```
bulk_import({
  projectSlug: "travis",
  namespace: "expenses",
  translations: {
    "en": { "page.title": "Expenses", "button.addExpense": "Add expense" },
    "nb-NO": { "page.title": "Utgifter", "button.addExpense": "Legg til utgift" }
  }
})
```

**Dry run first** for large imports:
```
bulk_import({ ..., dryRun: true })
```

---

### `get_translation_diff`
Shows all differences between sandbox and production: added, changed, deleted entries.

**Params:** `projectSlug`, optional `namespace`, `locale`, `statusFilter` (`added`/`changed`/`deleted`/`all`)

---

### `validate_translations`
Analyzes the sandbox diff for problems: empty values, partially translated keys, keys being fully deleted.

**Params:** `projectSlug`, optional `namespace`

---

### `list_snapshots`
Lists production snapshots available for revert (max 5, created automatically before each promote).

**Params:** `projectSlug`

---

### `preview_push_to_production`
Read-only preview of what would happen if sandbox were promoted to production right now.

**Does not push anything.** Pushing is manual, via Admin UI.

---

### `ai_translate`
Translate English text to project locales using AI (Gemini). Does not persist results — use `bulk_translate_and_save`, `set_translation`, or `bulk_import` to save.

**Params:**
- `projectSlug` (required) — project slug for usage tracking
- `text` (required) — English text to translate
- `context` (optional) — where/how this text is used in the UI (helps for ambiguous strings)
- `targetLocales` (optional) — restrict to specific locale codes; defaults to all non-default project locales

```
ai_translate({ projectSlug: "travis", text: "Save changes", context: "Primary action button on form" })
```

**Returns:** `{ "uk": "Зберегти зміни", "de": "Änderungen speichern", ... }` — feed directly into `ai_quality_check` or `bulk_import`.

---

### `bulk_ai_translate`
Translate multiple English texts to project locales in one call. Processes in batches of 10 per Gemini call. Does not save results.

**Params:**
- `projectSlug` (required)
- `entries` (required) — `[{ key, text, context? }]`, max 200
- `targetLocales` (optional) — restrict to specific locale codes

```
bulk_ai_translate({ projectSlug: "travis", entries: [{ key: "button.save", text: "Save" }, { key: "button.cancel", text: "Cancel" }] })
```

**Returns:** `{ "button.save": { "uk": "Зберегти", ... }, "button.cancel": { "uk": "Скасувати", ... } }`. Save via `bulk_import` with `{ locale: { key: value } }` format.

---

### `bulk_translate_and_save`
Translate N keys, save to sandbox, and run quality check — all in one step. Replaces the 3-step flow: `bulk_ai_translate` → `bulk_import` → `check_entry_quality`.

**Params:**
- `projectSlug` (required)
- `namespace` (required) — target namespace slug
- `entries` (required) — `[{ key, text, context? }]`, max 200
- `targetLocales` (optional) — restrict to specific locale codes
- `skipQuality` (optional, default `false`) — when `true`, skips inline quality check and queues background processing instead

```
bulk_translate_and_save({ projectSlug: "travis", namespace: "common", entries: [{ key: "button.save", text: "Save" }] })
```

**Returns (skipQuality=false):** `{ translations, quality: { key: { locale: { score, level, comment } } }, saved: { created, updated } }`
**Returns (skipQuality=true):** `{ translations, saved: { created, updated }, qualityStatus: "queued" }`

**Agent guidance on quality results:**
- `green` (85+) — no action needed
- `yellow` (60-84) — review optional; consider improving if context is available
- `red` (<60) — must fix: use `set_translation` to correct, then `check_entry_quality` to re-check

---

### `ai_quality_check`
Stateless multi-locale quality check. Accepts source text and a map of locale→translation. Does NOT persist results.

**Params:**
- `projectSlug` (required) — project slug for usage tracking
- `source` (required) — source English text
- `translations` (required) — `{ locale: translation }` map, e.g. `{ "uk": "Зберегти", "de": "Speichern" }`
- `context` (optional) — where/how this text is used in the UI

```
ai_quality_check({ projectSlug: "travis", source: "Save", translations: { "uk": "Зберегти", "de": "Speichern" } })
```

**Returns:** `{ "uk": { score: 95, level: "green", comment: "" }, "de": { score: 72, level: "yellow", comment: "..." } }`. Output of `ai_translate` feeds directly into `translations` param without parsing.

---

### `check_entry_quality`
Run AI quality check on all locales of a specific key and **persist** results to the database. Results appear in Admin UI.

**Params:**
- `projectSlug` (required)
- `namespace` (required)
- `key` (required) — translation key to check

```
check_entry_quality({ projectSlug: "travis", namespace: "backoffice-translations", key: "button.save" })
```

**Returns:** per-locale score, level, comment. Results saved to DB.

---

### `rename_key`
Rename a translation key in the sandbox. Preserves all translation values — only the key name changes.

**Params:**
- `projectSlug` (required)
- `namespace` (required)
- `oldKey` (required) — current key name
- `newKey` (required) — new key name (must match `/^[a-zA-Z0-9._-]+$/`)

```
rename_key({ projectSlug: "travis", namespace: "backoffice-translations", oldKey: "btn.save", newKey: "button.save" })
```

The new key must not already exist. This is a sandbox operation reflected in diffs.

---

### Context field

Translation keys support a `context` field (max 500 chars) describing where/how a key is used. Context directly impacts translation quality scoring and AI evaluation confidence.

#### When to add context

**Always add context for:**
- Ambiguous words with multiple meanings ("Save", "Train", "Set", "Light", "Run")
- Short/generic labels where business intent matters ("Process", "Review", "Apply", "Status")
- Domain-specific terms ("Approve", "Submit", "Escalate", "Assign")
- Labels that could refer to an action, a status, or a concept ("Active", "Complete", "Open")

**Skip context for:**
- Universally obvious terms ("Cancel", "OK", "Delete", "Email", "Password", "Settings")
- Keys where the key name itself provides enough context ("login.email_placeholder")
- Long, self-explanatory sentences

#### Good context examples
- "Save button in expense approval form" — disambiguates "Save"
- "Status label: whether a report has been reviewed by a manager"
- "Navigation tab for the user's pending applications"
- "Column header in invoice list table"

#### Bad context examples
- "A button" — too vague, adds nothing
- "This is the cancel button on the settings page that cancels..." — too verbose
- "Translation key" — restates the obvious

#### Impact on quality scoring

The AI evaluates context need at three levels:
- **required**: key is genuinely ambiguous — quality score capped at 89 without context
- **useful**: context would improve clarity — quality score capped at 94 without context
- **none**: meaning is clear without context — no penalty

When `list_translations` or `get_translations_needing_attention` shows "Context required" or "Context suggested", proactively add context using `set_translation` with the `context` parameter.

Use `qualityLevel: "needs_context"` to find all keys where context is required or useful but missing.
Use `qualityLevel: "context_required"` or `qualityLevel: "context_useful"` to filter separately.

#### Usage examples

**set_translation:**
```
set_translation({
  projectSlug: "travis",
  namespace: "backoffice-translations",
  key: "button.save",
  values: { "en": "Save" },
  context: "Save button in the expense form footer"
})
```

**bulk_import** accepts a `contexts` map:
```
bulk_import({
  projectSlug: "travis",
  namespace: "expenses",
  translations: { "en": { "button.save": "Save" } },
  contexts: { "button.save": "Save button in expense form footer" }
})
```

---

### Server-side `missingLocale` filtering

`list_translations` now passes `missingLocale` as a server-side query parameter instead of fetching all pages and filtering client-side. This is faster and supports proper pagination.

---

## Module migration workflow

Use this when moving a frontend module's local translation files to the server for the first time.

### Step 1 — Create a namespace for the module

```
create_namespace({ projectSlug: "travis", namespace: "expenses" })
```

Use the module name as the namespace slug (lowercase, dashes only).

### Step 2 — Dry-run the import

```
bulk_import({
  projectSlug: "travis",
  namespace: "expenses",
  translations: { "en": { "page.title": "Expenses" }, "nb-NO": { "page.title": "Utgifter" } },
  dryRun: true
})
```

Verify key counts look correct before writing.

### Step 3 — Run the real import

```
bulk_import({ projectSlug: "travis", namespace: "expenses", translations: { ... } })
```

### Step 4 — Verify and review

```
list_translations({ projectSlug: "travis", namespace: "expenses", env: "sandbox" })
get_translation_diff({ projectSlug: "travis", namespace: "expenses" })
validate_translations({ projectSlug: "travis", namespace: "expenses" })
```

Fix any partial translations before handing off to the developer.

### Step 5 — Developer tests against sandbox HTTP endpoint

The developer can test their code against the sandbox without promoting to production:

```
GET http://localhost:8080/translations/travis/expenses/en?env=sandbox
```

This returns sandbox values (production base + sandbox overrides). No caching. Safe for local dev.

### Step 6 — Human promotes via Admin UI

Admin UI → Translations → Sandbox tab → Push to Production.

---

## The real workflow

### Step 1 — Understand the project

```
get_project_details({ projectSlug: "travis" })
```

Note the exact locale codes. You will use them in every `set_translation` call.

### Step 2 — Check sandbox state

`get_project_details` already includes sandbox state — no separate call needed.

- `NOT initialized` → sandbox auto-initializes on project creation; use `reset_sandbox` to re-sync if needed
- `HAS PENDING CHANGES` → call `get_translation_diff` to review existing changes before adding more

### Step 3 — Add or edit keys

```
set_translation({
  projectSlug: "travis",
  namespace: "backoffice-translations",
  key: "feature.newButton",
  values: { "en": "New button", "nb-NO": "Ny knapp", "da-DK": "Ny knap", "sv": "Ny knapp" }
})
```

### Step 4 — Verify in sandbox

```
list_translations({ projectSlug: "travis", namespace: "backoffice-translations", env: "sandbox", search: "feature.new" })
```

The new key should appear with your values.

### Step 5 — Check the diff

```
get_translation_diff({ projectSlug: "travis" })
validate_translations({ projectSlug: "travis" })
```

If `validate_translations` reports issues (empty values, partial translations), fix them before proceeding.

### Step 6 — Preview

```
preview_push_to_production({ projectSlug: "travis" })
```

Review what will change in production.

### Step 7 — Human review and local testing

**Stop here.** The developer must:
1. Pull the latest code (translations are fetched live from the API, no code change needed for new keys)
2. Test the feature locally against `http://localhost:8080/translations/travis/backoffice-translations/en`
3. Review the diff in Admin UI → Translations → Sandbox tab
4. Click "Push to Production" in the Admin UI when satisfied

### Step 8 — After production push

Production endpoint now serves the new key. The sandbox resets automatically to match production (a snapshot is saved for revert).

---

## Deployment behavior

Translation keys are **decoupled from code deployments**. They are fetched at runtime from the API.

| Change type | Deployment needed? |
|-------------|-------------------|
| New translation key | No — takes effect after Admin UI "Push to Production" |
| Updated translation value | No |
| New feature that *uses* a translation key | Yes — code must ship the new key reference |
| New locale for the project | No — agents can add values, push from Admin UI |

**If your code references a key before it exists in production, you will get `undefined` at runtime.** For key-dependent features, add the key to sandbox, push to production, then deploy the code.

---

## Common problems and fixes

### "Key created with empty values"

**Cause:** All locale codes were invalid (e.g., `NO` instead of `nb-NO`).
**Fix:** Call `get_project_details` to see exact locale codes, then retry with correct codes.

### "Key not found after create"

**Cause:** Searching production (`env: "production"`) for a key that exists only in sandbox.
**Fix:** Search with `env: "sandbox"` until the key is promoted.

### "get_translation_diff shows key as deleted with productionValue: null"

**Cause:** You created then deleted a sandbox-only key (it was never in production). This is a diff entry from sandbox to itself.
**Fix:** Ignore it — the key will be cleaned up on promote. Or reset the sandbox if the deletion was unintended.

### "Diff shows changes but I didn't make any"

**Cause:** Another agent or developer has sandbox changes in progress.
**Fix:** Review with `get_translation_diff` and coordinate with the team.

### "searchLocale does not filter results"

**Cause:** `searchLocale` only works when `search` is also provided.
**Fix:** Add `search` param to activate locale filtering.

### "MCP server returns Error 0 or Unauthorized"

**Cause:** `MCP_TOKEN` in `mcp-server/.env` is missing or revoked.
**Fix:** Generate a new token in Admin UI → API Tokens, update `.env`, restart Claude.

---

## Verified working calls (tested 2026-03-28)

| Tool | Status | Notes |
|------|--------|-------|
| `assess_integration_state` | ✅ | Returns URL patterns, classification guide, remote state |
| `create_project` | ✅ | Requires user confirmation first |
| `list_projects` | ✅ | |
| `get_project_details` | ✅ | Returns locale objects `{ code, isDefault }` + full sandbox state |
| `list_translations` (sandbox) | ✅ | Default env |
| `list_translations` (production) | ✅ | Pass `env: "production"` |
| `set_translation` (create) | ✅ | |
| `set_translation` (update) | ✅ | |
| `delete_translation` | ✅ | Soft delete, 204 response |
| `get_translation_diff` | ✅ | |
| `validate_translations` | ✅ | |
| `preview_push_to_production` | ✅ | Read-only |
| `list_snapshots` | ✅ | |
| `reset_sandbox` | ✅ | Requires `confirmed: true` |
| `create_namespace` | ✅ | |
| `create_locale` | ✅ | Must use BCP 47 codes |
| `export_namespace` | ✅ | Auto-paginates |
| `bulk_import` | ✅ | PATCH→POST upsert; locale validation; batch endpoint support; contexts |
| `ai_translate` | ✅ | Stateless — does not persist |
| `bulk_ai_translate` | ✅ | Stateless — does not persist |
| `bulk_translate_and_save` | ✅ | Writes to sandbox + persists quality |
| `ai_quality_check` | ✅ | Stateless multi-locale — does not persist |
| `check_entry_quality` | ✅ | Persists results to DB |
| `rename_key` | ✅ | Sandbox only |

---

## Known gaps and limitations

| Issue | Status |
|-------|--------|
| `searchLocale` without `search` is a no-op | Known limitation — both params required |
| Invalid locale codes previously silently dropped | Fixed: `set_translation` and `bulk_import` now reject unknown codes with a clear error |
| Sandbox-only keys leaked into production endpoint | Fixed: production endpoint requires `translation_values` to exist |
| `uk` locale exists but has 0 translations | Not a bug — no content added yet |
| Sandbox had 19 test-artifact ghost keys | Fixed: sandbox reset 2026-03-28 |
| No `create_namespace` / `bulk_import` tools | Fixed: all 4 project management tools implemented |
| Sandbox data not testable without promoting | Fixed: `?env=sandbox` on public endpoint |
| **API gap: no locale alias information** | **Open** — API returns canonical codes only (e.g. `nb-NO`), no information about aliases (e.g. `no`, `nb`). Agent cannot resolve source-to-server locale mapping without external context. Report as blocker if ambiguous. |
| **API gap: no `isDefault` in locales list** | Fixed 2026-03-28 — locales now return `{ code, isDefault }` |
| MCP has no `bulk_delete` | By design — not implemented |
| Production push via MCP | By design — manual only via Admin UI |
