import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api-client.js";
import { errorResult, textResult } from "../utils.js";

interface TranslationEntry {
  key: string;
  values: Record<string, string>;
  createdAt: string;
}

interface EntriesResponse {
  data: TranslationEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function registerTranslationTools(server: McpServer): void {
  server.tool(
    "list_translations",
    [
      "Browse translation entries in a namespace.",
      "Use env='sandbox' (default) to see the working sandbox view, or env='production' to see what is currently live.",
      "Supports pagination and full-text search.",
      "Use missingLocale to find all keys that do not have a value for a specific locale — essential for the new-locale fill workflow.",
      "Example: missingLocale='nb-NO' returns only keys where Norwegian is empty or absent.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug (e.g. 'common', 'backoffice')"),
      env: z
        .enum(["sandbox", "production"])
        .default("sandbox")
        .describe("Which environment to read from. Default: sandbox (the editable working copy)."),
      page: z.number().int().min(1).default(1).describe("Page number (default: 1)"),
      limit: z.number().int().min(1).max(100).default(50).describe("Items per page (default: 50, max: 100)"),
      search: z.string().optional().describe("Search string (min 2 chars) — searches keys and values"),
      searchLocale: z.string().optional().describe("Restrict value search to a specific locale (e.g. 'en')"),
      missingLocale: z
        .string()
        .optional()
        .describe(
          "Return only entries where this locale has no value or an empty value. " +
          "Use this to find gaps after adding a new locale. Locale code must match the project exactly.",
        ),
      sortBy: z.enum(["key", "createdAt"]).default("key").describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Sort direction"),
    },
    async ({ projectSlug, namespace, env, page, limit, search, searchLocale, missingLocale, sortBy, sortOrder }) => {
      try {
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        const params: Record<string, unknown> = { page, limit, sortBy, sortOrder };
        if (search) params.search = search;
        if (searchLocale) params.searchLocale = searchLocale;
        if (missingLocale) params.missingLocale = missingLocale;

        const data = await apiGet<EntriesResponse>(basePath, params);

        if (data.data.length === 0) {
          const context = missingLocale
            ? `No missing entries for locale "${missingLocale}" in ${projectSlug}/${namespace} [${env}]. All keys have a value for this locale.`
            : `No entries found in ${projectSlug}/${namespace} [${env}]` +
              (search ? ` matching "${search}"` : "") +
              `. Total: 0.`;
          return textResult(context);
        }

        const rows = data.data.map((entry) => {
          const valuesStr = Object.entries(entry.values)
            .map(([locale, value]) => `  [${locale}] ${value || "(empty)"}`)
            .join("\n");
          return `${entry.key}:\n${valuesStr}`;
        });

        const header = missingLocale
          ? `Keys missing "${missingLocale}" in ${projectSlug}/${namespace} [${env}]: showing ${data.data.length} of ${data.meta.total}\n\nUse bulk_set_locale or set_translation to fill these values.`
          : `Entries in ${projectSlug}/${namespace} [${env}] — page ${data.meta.page}, ` +
            `showing ${data.data.length} of ${data.meta.total}${search ? ` (search: "${search}")` : ""}`;

        return textResult(`${header}\n\n${rows.join("\n\n")}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
