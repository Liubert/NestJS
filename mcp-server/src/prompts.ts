import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, ApiError } from "./api-client.js";
import { fetchPromptContent } from "./prompt-loader.js";

interface ProjectListItem {
  id: string;
  slug: string;
  name: string | null;
  sandboxInitializedAt: string | null;
  sandboxHasChanges: boolean;
}

const DEFAULT_SETUP_CONTENT = [
  "## Localization MCP — Quick Start",
  "",
  "### ⚠️ Pre-flight (mandatory before any write)",
  "`get_project_details <slug>` — returns locale codes + sandbox state in one call",
  "- `NOT initialized` → sandbox auto-initializes on project creation; use `reset_sandbox` if re-sync needed",
  "- `HAS PENDING CHANGES` → call `get_translation_diff` to review before adding more",
  "",
  "### 1. Discover",
  "- `list_projects` — see all projects and sandbox state",
  "- `get_project_details <slug>` — get exact locale codes and namespaces",
  "",
  "### 2. Read translations",
  "- `list_translations <slug> <namespace>` — browse keys; filter with `missingLocale`, `search`",
  "- `get_translation_diff <slug>` — see what changed in sandbox vs production",
  "- `check_keys_exist` — verify that a list of t() keys exist on the server (found vs missing)",
  "",
  "### 3. Write to sandbox",
  "- `analyze_entries` — **preflight before bulk create**: read-only analysis of planned keys — checks for batch duplicates, conflicts with existing keys, and source-text overlap (signals reuse opportunity, not a hard rule). Call before bulk_translate_and_save or set_translation when adding many new keys.",
  "- `set_translation` — upsert one key (source/default locale value MUST always be included in values)",
  "- `bulk_set_locale` — fill many keys for a single locale at once (for existing keys)",
  "- `bulk_import` — import multiple locales from a JSON map",
  "- `bulk_check_quality` — run AI quality check on many keys at once (persisted)",
  "- `reset_namespace_translations` — clear non-default translations to trigger re-translate",
  "- `reset_namespace_quality` — clear quality scores to trigger re-evaluation",
  "- `delete_translation` — soft-delete a key in sandbox",
  "",
  "### 4. Review & push",
  "- `validate_translations <slug>` — check for missing translations before pushing",
  "- `get_translation_diff <slug>` — final review of pending changes",
  "- Promote via the Admin UI — MCP has no push tool by design (human approval required)",
  "",
  "### Rules",
  "- All writes go to **sandbox only** — production is never touched directly",
  "- Locale codes must match exactly what `get_project_details` returns — never guess",
  "- Source locale value is required on every set_translation call (create or update) — always include the default locale",
  "- Prefer existing namespaces — only create a new one with a clear justification",
  "",
  "### Key naming",
  "- **Match existing style** — look at keys already in the namespace (camelCase vs snake_case) and stay consistent",
  "- **Keep names short** — describe the meaning, not the location; avoid filler words",
  "- **Reuse before creating** — run `analyze_entries` preflight: checks key conflicts AND source text overlap across the namespace in one call",
  "- **No location suffixes** — `submit_button` not `page_header_submit_button`; location-encoded names block reuse",
  "- **Source text overlap is a signal, not a rule** — if the same English text exists under another key, consider reusing it, but identical words can differ by context (e.g. \"Close\" on a dialog vs a date range)",
].join("\n");

const DEFAULT_ASSESS_CONTENT = [
  "## Localization Integration Assessment",
  "",
  "You are now running a localization integration assessment. Follow these steps in order.",
  "",
  "---",
  "",
  "### Step 1: Get remote state",
  "",
  "Call `assess_integration_state`{{#projectSlug}} with projectSlug: \"{{projectSlug}}\"{{/projectSlug}}.",
  "This gives you the remote project list, URL patterns, and classification guide.",
  "",
  "---",
  "",
  "### Step 2: Inspect the local project",
  "",
  "After reading the remote state, inspect the local codebase for localization setup:",
  "",
  "1. Search for i18n configuration files: look for files named i18n.ts, i18next.ts, i18n.js,",
  "   i18next.config.ts, or similar. Also check for vue-i18n, react-intl, lingui, or i18next",
  "   initialization in app entry points.",
  "",
  "2. Check environment files: read .env, .env.local, .env.development, .env.production,",
  "   .env.staging, and any other .env.* files. Look for any variable containing a URL",
  "   that relates to translations or localization.",
  "",
  "3. Search for the backend URL: look for the backend URL returned by assess_integration_state",
  "   in any config or env file.",
  "",
  "4. Check for ?env=sandbox: search for this exact string in the project. Its presence in",
  "   non-production configs is the key indicator of up-to-date integration.",
  "",
  "5. Look for Locize references: search for \"locize.com\" or \"localazy\" or similar third-party",
  "   localization service URLs — this indicates a migration scenario.",
  "",
  "---",
  "",
  "### Step 3: Classify the integration state",
  "",
  "Using what you found locally and the classification guide from assess_integration_state,",
  "determine which state applies:",
  "",
  "**S1 — Correctly integrated:**",
  "→ Confirm to the user, no action needed. Proceed with normal translation work.",
  "",
  "**S2 — Outdated integration (missing ?env=sandbox):**",
  "→ Tell the user: \"Your project uses our localization server, but non-production environments",
  "are not using sandbox mode. This means dev/staging changes go directly to production data.\"",
  "→ Show which files need updating",
  "→ Ask: \"Should I update these files for you, or would you prefer to do it manually?\"",
  "→ If user approves: propose specific file edits, apply with approval per file",
  "→ If user prefers manual: show exactly what to change and where",
  "→ After fixing: sandbox auto-initializes; use `reset_sandbox` to re-sync if needed",
  "",
  "**S3 — Not integrated, remote project available:**",
  "→ Tell the user which remote projects exist",
  "→ Ask: \"Which project should this local project connect to?\" (show list)",
  "→ After selection: help update local config to use the correct URL patterns",
  "→ Then assess if the selected project needs bootstrap (S5 check)",
  "",
  "**S4 — Not integrated, no remote project:**",
  "→ Tell the user no remote project exists yet",
  "→ Ask: \"Would you like to create a new localization project?\"",
  "→ Suggest a project name based on: package.json name field, git remote URL, or directory name",
  "→ Present options: create now / I'll create manually in Admin UI",
  "→ If create now: ask for slug confirmation, then call create_project, create_namespace, create_locale",
  "→ Then help configure local integration",
  "",
  "**S5 — Project exists but empty/incomplete:**",
  "→ Tell the user the project exists but has not been bootstrapped",
  "→ Offer to:",
  "  a) Create missing namespaces (ask for name, default: \"common\")",
  "  b) Create missing locales (ask for primary locale BCP 47 code)",
  "  c) Initialize sandbox",
  "  d) Scan and import local translation files if they exist",
  "→ Do these in order, with user confirmation for each group",
  "",
  "**S6 — No localization system found:**",
  "→ Tell the user no i18n setup was found",
  "→ Ask: \"Would you like me to set up localization from scratch?\"",
  "→ If yes:",
  "  a) Ask what i18n library they want to use (suggest i18next as default for React/Node,",
  "     vue-i18n for Vue, or a custom fetch approach)",
  "  b) Propose the integration: install library, create config, configure to fetch from our backend",
  "  c) Show what the config should look like with the correct URLs from assess_integration_state",
  "  d) Apply with user approval",
  "  e) Then continue with project creation if needed (S4 path)",
  "",
  "---",
  "",
  "### Rules for all paths",
  "",
  "- All writes go to sandbox only — never to production",
  "- Sandbox is auto-initialized on project creation; no manual init needed",
  "- Never create a project, namespace, or locale without user confirmation",
  "- Always show what you're about to do before doing it",
  "- If uncertain about the local project structure, ask rather than assume",
  "- Namespace mapping: if the local project has its own namespace structure (multiple translation files",
  "  per area/feature), preserve that structure — create matching namespaces, don't flatten into one",
  "- After any setup action: summarize what was done and what the user should do next",
  "",
  "---",
  "",
  "### Final step",
  "",
  "After completing setup (any state), summarize:",
  "1. What integration state was detected",
  "2. What was changed (if anything)",
  "3. What the user needs to do manually (if anything)",
  "4. Current sandbox state",
  "5. Next recommended action",
].join("\n");

export function registerPrompts(server: McpServer): void {
  // ─── /setup ─────────────────────────────────────────────────────────────────
  server.prompt(
    "setup",
    "Quick-start guide: how to explore projects, work with sandbox, and push translations.",
    {},
    async () => {
      const assistantText = await fetchPromptContent("setup", DEFAULT_SETUP_CONTENT);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Give me a quick-start guide for working with the localization MCP server.",
                "Include: how to discover projects, namespaces, and locales; how to read and write translations in sandbox;",
                "how to review and push changes to production. Keep it concise and practical.",
              ].join(" "),
            },
          },
          {
            role: "assistant",
            content: { type: "text", text: assistantText },
          },
        ],
      };
    },
  );

  // ─── /diagnostic ────────────────────────────────────────────────────────────
  server.prompt(
    "diagnostic",
    "Run a live health check: verify API connectivity, token validity, and list project states.",
    { projectSlug: z.string().optional().describe("Optional: also check sandbox status for this project") },
    async ({ projectSlug }) => {
      const diagnosticUserText = await fetchPromptContent(
        "diagnostic",
        "Run diagnostic on the localization MCP server.",
      );
      const lines: string[] = ["## Localization MCP — Diagnostic", ""];

      // 1. Config
      const backendUrl = process.env.BACKEND_URL ?? "(NOT SET — configure BACKEND_URL)";
      const tokenSet = !!process.env.MCP_TOKEN;
      lines.push("### Config");
      lines.push(`- BACKEND_URL: \`${backendUrl}\``);
      lines.push(`- MCP_TOKEN: ${tokenSet ? "set ✅" : "NOT SET ❌ — all API calls will fail with 401"}`);
      lines.push("");

      // 2. API connectivity + project list
      lines.push("### API");
      try {
        const data = await apiGet<{ data: ProjectListItem[]; meta: { total: number } }>(
          "/translations/projects",
          { page: 1, limit: 100 },
        );
        lines.push(`- Connection: ✅ OK`);
        lines.push(`- Token: ✅ valid`);
        lines.push(`- Projects accessible: ${data.meta.total}`);
        lines.push("");

        if (data.data.length > 0) {
          lines.push("### Projects");
          for (const p of data.data) {
            const sandboxState = p.sandboxInitializedAt
              ? p.sandboxHasChanges
                ? "sandbox: ⚠️  HAS PENDING CHANGES"
                : "sandbox: ✅ no changes"
              : "sandbox: not initialized";
            lines.push(`- \`${p.slug}\`${p.name ? ` (${p.name})` : ""} — ${sandboxState}`);
          }
          lines.push("");
        }

        // 3. Optional per-project sandbox check
        if (projectSlug) {
          lines.push(`### Sandbox: ${projectSlug}`);
          try {
            const status = await apiGet<{
              initialized: boolean;
              initializedAt: string | null;
              hasChanges: boolean;
              snapshotCount: number;
            }>(`/translations/projects/${projectSlug}/sandbox/status`);

            lines.push(`- Initialized: ${status.initialized ? `✅ yes (since ${status.initializedAt})` : "❌ NO — use reset_sandbox to re-sync from production"}`);
            lines.push(`- Has pending changes: ${status.hasChanges ? "⚠️  YES" : "✅ no"}`);
            lines.push(`- Snapshots available: ${status.snapshotCount}`);
          } catch (err) {
            lines.push(`- ❌ Could not fetch sandbox status: ${err instanceof ApiError ? `${err.status} ${err.message}` : String(err)}`);
          }
          lines.push("");
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            lines.push(`- Connection: ✅ reached backend`);
            lines.push(`- Token: ❌ INVALID or missing (401 Unauthorized)`);
            lines.push(`  → Regenerate token in Admin UI → API Tokens`);
          } else {
            lines.push(`- ❌ API error ${err.status}: ${err.message}`);
          }
        } else {
          lines.push(`- ❌ Cannot reach backend at \`${backendUrl}\``);
          lines.push(`  → Is the backend running? Check BACKEND_URL env var.`);
        }
        lines.push("");
      }

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: diagnosticUserText },
          },
          {
            role: "assistant",
            content: { type: "text", text: lines.join("\n") },
          },
        ],
      };
    },
  );

  // ─── /assess ────────────────────────────────────────────────────────────────
  server.prompt(
    "assess",
    "Assess the current localization integration state of the local project and get guided next steps. Run this before starting any localization work.",
    { projectSlug: z.string().optional().describe("Optional: the project slug if you already know which project this local project should use") },
    async ({ projectSlug }) => {
      const template = await fetchPromptContent("assess", DEFAULT_ASSESS_CONTENT);
      const placeholder = "{{#projectSlug}} with projectSlug: \"{{projectSlug}}\"{{/projectSlug}}";
      const assistantText = projectSlug
        ? template.replace(placeholder, ` with projectSlug: "${projectSlug}"`)
        : template.replace(placeholder, "");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Assess the localization integration state of my local project and guide me to the correct next step.",
            },
          },
          {
            role: "assistant",
            content: { type: "text", text: assistantText },
          },
        ],
      };
    },
  );
}
