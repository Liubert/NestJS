import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, ApiError } from "../api-client.js";
import { logWrite } from "../logger.js";

type DiffStatus = "added" | "changed" | "deleted";

interface DiffEntry {
  namespace: string;
  key: string;
  locale: string;
  status: DiffStatus;
  productionValue: string | null;
  sandboxValue: string | null;
}

interface DiffResponse {
  total: number;
  added: number;
  changed: number;
  deleted: number;
  entries: DiffEntry[];
}

export function registerProductionTools(server: McpServer): void {
  server.tool(
    "init_sandbox",
    "Initialize the sandbox for a project by copying the current production state into it. Safe to call if already initialized (will return early unless force=true).",
    {
      projectSlug: z.string().describe("Project slug"),
      force: z
        .boolean()
        .default(false)
        .describe("If true, wipe existing sandbox and re-copy from production (owner/admin only)"),
    },
    async ({ projectSlug, force }) => {
      try {
        const result = await apiPost<{ initialized: boolean; copiedRows: number }>(
          `/translations/projects/${projectSlug}/sandbox/init`,
          { force },
        );

        if (!result.initialized) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Sandbox for "${projectSlug}" is already initialized. Use force: true to re-initialize.`,
              },
            ],
          };
        }

        logWrite("init_sandbox", { projectSlug, force }, result);

        return {
          content: [
            {
              type: "text" as const,
              text: `Sandbox initialized for "${projectSlug}". Copied ${result.copiedRows} translation values from production.`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "reset_sandbox",
    "Discard all sandbox changes and re-copy from current production state. This destroys all pending sandbox edits. Requires confirmed: true.",
    {
      projectSlug: z.string().describe("Project slug"),
      confirmed: z
        .boolean()
        .default(false)
        .describe("Must be true to execute. Without confirmation, returns a warning instead."),
    },
    async ({ projectSlug, confirmed }) => {
      if (!confirmed) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `This will DISCARD all sandbox changes for "${projectSlug}" and re-copy from production.`,
                `All pending edits in sandbox will be lost permanently.`,
                ``,
                `To execute, call this tool again with confirmed: true.`,
              ].join("\n"),
            },
          ],
        };
      }

      try {
        const result = await apiPost<{ copiedRows: number }>(
          `/translations/projects/${projectSlug}/sandbox/reset`,
        );

        logWrite("reset_sandbox", { projectSlug }, result);

        return {
          content: [
            {
              type: "text" as const,
              text: `Sandbox reset for "${projectSlug}". Re-copied ${result.copiedRows} values from current production.`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "preview_push_to_production",
    "Show a full diff of what sandbox changes would replace production if promoted. Read-only — does NOT push anything. Pushing to production must be done manually via the Admin UI.",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      try {
        const diff = await apiGet<DiffResponse>(
          `/translations/projects/${projectSlug}/sandbox/diff`,
        );

        if (diff.total === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No pending changes in sandbox for "${projectSlug}". Nothing to push to production.`,
              },
            ],
          };
        }

        const grouped = groupByNamespace(diff.entries);
        const sections = Object.entries(grouped).map(([ns, entries]) => {
          const lines = entries.slice(0, 20).map(formatDiffEntry);
          const truncated = entries.length > 20 ? `\n  ... and ${entries.length - 20} more` : "";
          return `[${ns}]\n${lines.join("\n")}${truncated}`;
        });

        const summary = [
          `=== PUSH PREVIEW for "${projectSlug}" ===`,
          `Total changes: ${diff.total}`,
          `  + Added:   ${diff.added}`,
          `  ~ Changed: ${diff.changed}`,
          `  - Deleted: ${diff.deleted}`,
          "",
          "NOTE: Pushing to production must be done manually via the Admin UI.",
          "",
          ...sections,
        ];

        return {
          content: [{ type: "text" as const, text: summary.join("\n") }],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}

function groupByNamespace(entries: DiffEntry[]): Record<string, DiffEntry[]> {
  const result: Record<string, DiffEntry[]> = {};
  for (const entry of entries) {
    if (!result[entry.namespace]) result[entry.namespace] = [];
    result[entry.namespace].push(entry);
  }
  return result;
}

function formatDiffEntry(e: DiffEntry): string {
  const symbol = e.status === "added" ? "+" : e.status === "deleted" ? "-" : "~";
  const label = `  ${symbol} ${e.key} [${e.locale}]`;
  if (e.status === "added") return `${label}\n    → "${e.sandboxValue}"`;
  if (e.status === "deleted") return `${label}\n    was: "${e.productionValue}"`;
  return `${label}\n    before: "${e.productionValue}"\n    after:  "${e.sandboxValue}"`;
}

function errorContent(error: unknown): { content: { type: "text"; text: string }[] } {
  if (error instanceof ApiError) {
    return {
      content: [{ type: "text" as const, text: `Error ${error.status}: ${error.message}` }],
    };
  }
  return {
    content: [{ type: "text" as const, text: `Unexpected error: ${String(error)}` }],
  };
}
