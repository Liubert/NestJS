# Localization System — Project Overview for Agents

> Read this before starting any work. This is the authoritative reference for how this system works, what environments exist, and how to use them correctly.

---

## What this system is

This is a **localization management backend** that replaces Locize. It stores, serves, and manages translation keys for consumer applications (currently: the TRAVIS app). It is not a translation tool for its own UI — the admin-ui is in English only and has no i18n layer.

The system has two roles:
1. **API server** — serves translation JSON to consumer apps at runtime
2. **Management backend** — agents and humans create/edit/review translation keys

---

## Project → Namespace → Locale hierarchy

```
project (e.g. "travis")
  └─ namespace (e.g. "backoffice-translations", "mobile")
       └─ key (e.g. "button.save")
            └─ locale values (en, da-DK, nb-NO, sv, uk)
```

Consumers fetch translations by **project + namespace + locale**:
```
GET /translations/{projectSlug}/{namespace}/{locale}
→ { "button.save": "Save", "button.cancel": "Cancel", ... }
```

This is a **public unauthenticated endpoint**. It serves production data only.

---

## Environments: Sandbox vs Production

### Production
- What consumers fetch at runtime
- Served at: `GET /translations/{slug}/{namespace}/{locale}` (no auth)
- Read-only for agents — no MCP tool writes to it
- Changed only by: Admin UI → "Push to Production" button

### Sandbox
- The working copy — all agent writes go here
- Served at: `GET /translations/projects/{slug}/sandbox/namespaces/{ns}/entries` (auth required)
- Invisible to consumers until promoted
- Full CRUD access for agents

### Rule: agents always work in sandbox

```
Dev work  → Sandbox   ✅
Production reads → OK ✅  (for review/comparison)
Production writes → IMPOSSIBLE via MCP (by design)
```

---

## Environment → URL mapping

| Context | URL pattern | Auth | Consumer-visible? |
|---------|-------------|------|-------------------|
| Production read (consumer) | `/translations/{slug}/{ns}/{locale}` | None | ✅ Yes |
| Production read (MCP) | `/translations/projects/{slug}/namespaces/{ns}/entries` | MCP token | Read only |
| Sandbox read/write (MCP) | `/translations/projects/{slug}/sandbox/namespaces/{ns}/entries` | MCP token | ❌ No |
| Sandbox management | `/translations/projects/{slug}/sandbox/{init,reset,diff,status}` | MCP token | ❌ No |

**This is deterministic.** There is no implicit environment detection. The sandbox and production endpoints are different paths. An agent cannot accidentally write to production because no production-write endpoints exist in the MCP server.

### Verifying which environment you're targeting

```
# Check sandbox state
get_environment_status({ projectSlug: "travis" })

# Read from sandbox (default)
list_translations({ projectSlug: "travis", namespace: "mobile", env: "sandbox" })

# Read from production (for comparison only)
list_translations({ projectSlug: "travis", namespace: "mobile", env: "production" })
```

---

## Required client integration pattern

Consumer applications that fetch translations from this backend must use environment-specific URLs:

| App environment | URL to use | Why |
|-----------------|------------|-----|
| **Production** | `{BACKEND_URL}/translations/{slug}/{namespace}/{locale}` | Serves promoted production data |
| **Non-production** (dev, staging, test) | `{BACKEND_URL}/translations/{slug}/{namespace}/{locale}?env=sandbox` | Serves sandbox (working copy) data |

The `?env=sandbox` flag is **mandatory** for all non-production environments. Without it, developers test against production data — which means they never see unpromoted changes and risk polluting the production baseline.

### Example (i18next with HTTP backend)

```js
// i18n config
backend: {
  loadPath: process.env.NODE_ENV === 'production'
    ? `${process.env.NEXT_PUBLIC_I18N_URL}/translations/my-app/{{ns}}/{{lng}}`
    : `${process.env.NEXT_PUBLIC_I18N_URL}/translations/my-app/{{ns}}/{{lng}}?env=sandbox`
}
```

If the local project is missing this separation, it is classified as **S2 — outdated integration** and must be repaired before normal translation work begins.

---

## ⚠️ If you detect production is being used for dev work

**Production should never be the target for development changes.** If you observe that:
- Keys are being created directly in production (bypassing sandbox)
- The consumer app is pointed to this system's production API in a dev environment
- Someone is using `POST/PATCH/DELETE` on `/translations/projects/*/namespaces/*/entries` (non-sandbox paths) for development

**You must:**
1. Stop and warn: "This is targeting production directly. Production data will be visible to all users immediately."
2. Suggest the correct flow: "Use the sandbox workflow — call `init_sandbox`, make changes there, review with `get_translation_diff`, and promote via Admin UI."
3. Do not proceed with production writes.

---

## Auth setup

Every agent needs a personal MCP token. Tokens are `lmcp_` prefixed, stored as SHA256 hashes in the DB.

**For a new developer:**
1. Log in to Admin UI → API Tokens
2. Click "Generate token" → enter a name (e.g. `dev-laptop`)
3. Copy the token — **shown only once**
4. Add to `mcp-server/.env`:
   ```
   BACKEND_URL=http://localhost:8080
   MCP_TOKEN=lmcp_your_token_here
   ```
5. Restart Claude / reload MCP server

**Token lost or revoked?** Generate a new one via Admin UI. Old one cannot be recovered.

---

## Deployment behavior

Translation keys and code deployments are **decoupled**:

| Change | What to do |
|--------|-----------|
| New/updated translation values only | Sandbox → Admin UI "Push to Production" — no code deploy needed |
| New key referenced in code | Add key to sandbox → push to production → deploy code (order matters!) |
| New locale added to project | Add via Admin UI → fill translations via MCP → push to production |

**Critical ordering rule:** If code references a key before it exists in production, runtime will return `undefined`. Always push the key to production before deploying code that uses it.

---

## Known issues and limitations

| Issue | Status |
|-------|--------|
| `searchLocale` without `search` param is a no-op | Known limitation — documented |
| `uk` locale registered but has 0 translations | Data gap — needs content |
| da-DK and nb-NO in `mobile` have 42–44 keys not in `en` | Legacy content — investigate |
| Sandbox diff shows ghost "deleted" entries with `productionValue: null` | Cosmetic — cleanup on next promote |
