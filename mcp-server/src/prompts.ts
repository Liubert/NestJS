import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, ApiError } from "./api-client.js";

interface ProjectListItem {
  id: string;
  slug: string;
  name: string | null;
  sandboxInitializedAt: string | null;
  sandboxHasChanges: boolean;
}

export function registerPrompts(server: McpServer): void {
  // ─── /setup ─────────────────────────────────────────────────────────────────
  server.prompt(
    "setup",
    "Quick-start guide: how to explore projects, work with sandbox, and push translations.",
    {},
    () => ({
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
          content: {
            type: "text",
            text: [
              "## Localization MCP — Quick Start",
              "",
              "### 1. Discover",
              "- `list_projects` — see all projects and sandbox state",
              "- `get_project_details <slug>` — get exact locale codes and namespaces (**always call this before writing**)",
              "",
              "### 2. Read translations",
              "- `list_translations <slug> <namespace>` — browse keys; filter with `missingLocale`, `search`",
              "- `get_translation_diff <slug>` — see what changed in sandbox vs production",
              "",
              "### 3. Write to sandbox",
              "- `set_translation` — upsert one key (pass only the locales you want to update)",
              "- `bulk_set_locale` — fill many keys for a single locale at once",
              "- `bulk_import` — import multiple locales from a JSON map",
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
              "- Prefer existing namespaces — only create a new one with a clear justification",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  // ─── /diagnostic ────────────────────────────────────────────────────────────
  server.prompt(
    "diagnostic",
    "Run a live health check: verify API connectivity, token validity, and list project states.",
    { projectSlug: z.string().optional().describe("Optional: also check sandbox status for this project") },
    async ({ projectSlug }) => {
      const lines: string[] = ["## Localization MCP — Diagnostic", ""];

      // 1. Config
      const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080 (default)";
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

            lines.push(`- Initialized: ${status.initialized ? `✅ yes (since ${status.initializedAt})` : "❌ NO — call init_sandbox before writing"}`);
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
            content: { type: "text", text: "Run diagnostic on the localization MCP server." },
          },
          {
            role: "assistant",
            content: { type: "text", text: lines.join("\n") },
          },
        ],
      };
    },
  );
}
