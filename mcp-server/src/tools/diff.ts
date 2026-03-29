import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, ApiError } from "../api-client.js";

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

export function registerDiffTools(server: McpServer): void {
  server.tool(
    "get_translation_diff",
    "Get the full diff between sandbox and production for a project. Shows all added, changed, and deleted entries.",
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().optional().describe("Filter diff to a specific namespace (optional)"),
      locale: z.string().optional().describe("Filter diff to a specific locale (optional)"),
      statusFilter: z
        .enum(["added", "changed", "deleted", "all"])
        .default("all")
        .describe("Filter by change type (default: all)"),
    },
    async ({ projectSlug, namespace, locale, statusFilter }) => {
      try {
        const diff = await apiGet<DiffResponse>(
          `/translations/projects/${projectSlug}/sandbox/diff`,
        );

        let entries = diff.entries;
        if (namespace) entries = entries.filter((e) => e.namespace === namespace);
        if (locale) entries = entries.filter((e) => e.locale === locale);
        if (statusFilter !== "all") entries = entries.filter((e) => e.status === statusFilter);

        const summary = `Diff for ${projectSlug}: ${diff.total} total changes — ${diff.added} added, ${diff.changed} changed, ${diff.deleted} deleted`;

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${summary}\n\nNo entries match the current filters.`,
              },
            ],
          };
        }

        const grouped = groupByNamespace(entries);
        const sections = Object.entries(grouped).map(([ns, nsEntries]) => {
          const lines = nsEntries.map((e) => formatDiffEntry(e));
          return `[${ns}]\n${lines.join("\n")}`;
        });

        const filterNote =
          namespace || locale || statusFilter !== "all"
            ? `\nFilters: ${[namespace && `namespace=${namespace}`, locale && `locale=${locale}`, statusFilter !== "all" && `status=${statusFilter}`].filter(Boolean).join(", ")}`
            : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `${summary}${filterNote}\n\n${sections.join("\n\n")}`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "validate_translations",
    "Analyze the sandbox diff for potential issues: empty values, locales missing translations that others have, and keys only partially translated.",
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().optional().describe("Limit validation to a specific namespace (optional)"),
    },
    async ({ projectSlug, namespace }) => {
      try {
        const diff = await apiGet<DiffResponse>(
          `/translations/projects/${projectSlug}/sandbox/diff`,
        );

        let entries = diff.entries;
        if (namespace) entries = entries.filter((e) => e.namespace === namespace);

        // Only check entries that will exist in production after push (not deleted)
        const activeEntries = entries.filter((e) => e.status !== "deleted");

        const issues: string[] = [];

        // 1. Check for empty sandbox values in added/changed entries
        const emptyValues = activeEntries.filter(
          (e) => e.sandboxValue === null || e.sandboxValue.trim() === "",
        );
        if (emptyValues.length > 0) {
          issues.push(
            `Empty translation values (${emptyValues.length} entries):\n` +
              emptyValues
                .slice(0, 10)
                .map((e) => `  • ${e.namespace}/${e.key} [${e.locale}]`)
                .join("\n") +
              (emptyValues.length > 10 ? `\n  ... and ${emptyValues.length - 10} more` : ""),
          );
        }

        // 2. Check for keys that are only partially translated across locales
        const keyLocaleMap = new Map<string, Set<string>>();
        for (const entry of activeEntries) {
          const k = `${entry.namespace}/${entry.key}`;
          if (!keyLocaleMap.has(k)) keyLocaleMap.set(k, new Set());
          keyLocaleMap.get(k)!.add(entry.locale);
        }

        const allLocales = new Set(activeEntries.map((e) => e.locale));
        const partialKeys: string[] = [];

        for (const [key, locales] of keyLocaleMap.entries()) {
          const missing = [...allLocales].filter((l) => !locales.has(l));
          if (missing.length > 0 && missing.length < allLocales.size) {
            partialKeys.push(`  • ${key} — missing locales: ${missing.join(", ")}`);
          }
        }

        if (partialKeys.length > 0) {
          issues.push(
            `Partially translated keys in diff (${partialKeys.length}):\n` +
              partialKeys.slice(0, 10).join("\n") +
              (partialKeys.length > 10 ? `\n  ... and ${partialKeys.length - 10} more` : ""),
          );
        }

        // 3. Check deleted entries — flag keys being deleted for all locales
        const deletedKeys = new Map<string, number>();
        for (const e of entries.filter((e) => e.status === "deleted")) {
          const k = `${e.namespace}/${e.key}`;
          deletedKeys.set(k, (deletedKeys.get(k) ?? 0) + 1);
        }

        if (deletedKeys.size > 0) {
          issues.push(
            `Keys being deleted from production (${deletedKeys.size}):\n` +
              [...deletedKeys.entries()]
                .slice(0, 10)
                .map(([k, count]) => `  • ${k} (${count} locale values)`)
                .join("\n") +
              (deletedKeys.size > 10 ? `\n  ... and ${deletedKeys.size - 10} more` : ""),
          );
        }

        const header = `Validation for ${projectSlug}${namespace ? `/${namespace}` : ""} (${diff.total} pending changes)`;

        if (issues.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${header}\n\nNo issues found. All pending translations look complete.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `${header}\n\nFound ${issues.length} issue(s):\n\n${issues.join("\n\n")}`,
            },
          ],
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
  const statusSymbol = e.status === "added" ? "+" : e.status === "deleted" ? "-" : "~";
  const label = `${statusSymbol} ${e.key} [${e.locale}]`;

  if (e.status === "added") {
    return `  ${label}\n    → "${e.sandboxValue}"`;
  }
  if (e.status === "deleted") {
    return `  ${label}\n    was: "${e.productionValue}"`;
  }
  return `  ${label}\n    before: "${e.productionValue}"\n    after:  "${e.sandboxValue}"`;
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
