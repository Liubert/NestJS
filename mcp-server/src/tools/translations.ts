import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api-client.js";
import { errorResult, textResult } from "../utils.js";

interface QualityInfo {
  reviewState: string;
  score: number | null;
  level: string | null;
  comment: string | null;
  checkedAt: string | null;
}

interface TranslationEntry {
  key: string;
  values: Record<string, string>;
  context: string | null;
  contextRequired: boolean | null;
  quality: Record<string, QualityInfo | null>;
  createdAt: string;
}

interface EntriesResponse {
  data: TranslationEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function registerTranslationTools(server: McpServer): void {
  // ─── list_translations ──────────────────────────────────────────────
  server.tool(
    "list_translations",
    [
      "Browse translation entries in a namespace.",
      "Use env='sandbox' (default) to see the working sandbox view, or env='production' to see what is currently live.",
      "Supports pagination, full-text search, and quality/context filtering.",
      "Use missingLocale to find keys missing a value for a specific locale.",
      "Use qualityLevel to filter by worst quality level across locales.",
      "Use contextRequired to find keys that need context for confident evaluation.",
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
          "Use this to find gaps after adding a new locale.",
        ),
      qualityLevel: z
        .enum(["green", "yellow", "red", "unchecked", "needs_context"])
        .optional()
        .describe("Filter by quality level. 'needs_context' returns keys where context is required but missing."),
      sortBy: z.enum(["key", "createdAt", "qualityScore"]).default("key").describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Sort direction"),
    },
    async ({ projectSlug, namespace, env, page, limit, search, searchLocale, missingLocale, qualityLevel, sortBy, sortOrder }) => {
      try {
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        const params: Record<string, unknown> = { page, limit, sortBy, sortOrder };
        if (search) params.search = search;
        if (searchLocale) params.searchLocale = searchLocale;
        if (missingLocale) params.missingLocale = missingLocale;
        if (qualityLevel) params.qualityLevel = qualityLevel;

        const data = await apiGet<EntriesResponse>(basePath, params);

        if (data.data.length === 0) {
          const ctx = missingLocale
            ? `No missing entries for locale "${missingLocale}" in ${projectSlug}/${namespace} [${env}]. All keys have a value for this locale.`
            : `No entries found in ${projectSlug}/${namespace} [${env}]` +
              (search ? ` matching "${search}"` : "") +
              (qualityLevel ? ` with quality level "${qualityLevel}"` : "") +
              `. Total: 0.`;
          return textResult(ctx);
        }

        const rows = data.data.map((entry) => {
          const parts: string[] = [];

          // Context line
          if (entry.context) {
            parts.push(`  [context] ${entry.context}`);
          } else if (entry.contextRequired) {
            parts.push(`  ⚠ Context required but missing`);
          }

          // Values with quality info
          for (const [locale, value] of Object.entries(entry.values)) {
            const q = entry.quality?.[locale];
            let qStr = "";
            if (q?.score != null) {
              qStr = ` (${q.level} ${q.score})`;
              if (q.comment) qStr += ` — ${q.comment}`;
            }
            parts.push(`  [${locale}] ${value || "(empty)"}${qStr}`);
          }

          return `${entry.key}:\n${parts.join("\n")}`;
        });

        const header = missingLocale
          ? `Keys missing "${missingLocale}" in ${projectSlug}/${namespace} [${env}]: showing ${data.data.length} of ${data.meta.total}\n\nUse bulk_set_locale or set_translation to fill these values.`
          : `Entries in ${projectSlug}/${namespace} [${env}] — page ${data.meta.page}, ` +
            `showing ${data.data.length} of ${data.meta.total}` +
            (search ? ` (search: "${search}")` : "") +
            (qualityLevel ? ` (quality: ${qualityLevel})` : "");

        return textResult(`${header}\n\n${rows.join("\n\n")}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── get_translations_needing_attention ──────────────────────────────
  server.tool(
    "get_translations_needing_attention",
    [
      "Get translations that need quality improvement.",
      "Returns all non-green/problematic translations with full context, values, and quality details.",
      "Use this to find translations that need better context, improved translation quality, or both.",
      "The agent can then inspect each item and decide: add/improve context, improve translation, or both.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      limit: z.number().int().min(1).max(100).default(50).describe("Max items to return (default: 50)"),
      qualityLevels: z
        .string()
        .default("yellow,red")
        .describe("Comma-separated quality levels to include (default: 'yellow,red'). Options: green, yellow, red, unchecked, needs_context."),
      includeUnchecked: z
        .boolean()
        .default(false)
        .describe("Also include items not yet quality-checked"),
    },
    async ({ projectSlug, namespace, limit, qualityLevels, includeUnchecked }) => {
      try {
        const params: Record<string, unknown> = {
          limit,
          qualityLevels,
          includeUnchecked: includeUnchecked ? "true" : "false",
        };

        const data = await apiGet<EntriesResponse>(
          `/translations/projects/${projectSlug}/namespaces/${namespace}/attention`,
          params,
        );

        if (data.data.length === 0) {
          return textResult(`No translations needing attention in ${projectSlug}/${namespace}. All items are green or expected.`);
        }

        const rows = data.data.map((entry) => {
          const parts: string[] = [];

          // Context info
          if (entry.context) {
            parts.push(`  [context] ${entry.context}`);
          }
          if (entry.contextRequired && !entry.context) {
            parts.push(`  ⚠ CONTEXT REQUIRED but missing — add context to improve quality scores`);
          } else if (entry.contextRequired === false) {
            parts.push(`  [context not required]`);
          }

          // Values + quality per locale
          for (const [locale, value] of Object.entries(entry.values)) {
            const q = entry.quality?.[locale];
            let line = `  [${locale}] ${value || "(empty)"}`;
            if (q?.score != null) {
              line += ` → ${q.level} (${q.score}/100)`;
              if (q.comment) line += ` — ${q.comment}`;
            } else if (q?.reviewState === 'not_checked') {
              line += ` → not checked yet`;
            }
            parts.push(line);
          }

          return `${entry.key}:\n${parts.join("\n")}`;
        });

        const header = `Translations needing attention in ${projectSlug}/${namespace}: ${data.data.length} of ${data.meta.total} items (levels: ${qualityLevels})`;

        return textResult(`${header}\n\n${rows.join("\n\n")}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
