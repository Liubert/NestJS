import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost } from "../api-client.js";
import { logWrite } from "../logger.js";
import { errorResult, textResult } from "../utils.js";

export function registerAiTools(server: McpServer): void {
  // ─── ai_translate ──────────────────────────────────────────────────
  server.tool(
    "ai_translate",
    [
      "Translate English text to all project locales using AI (Gemini).",
      "Returns translations for each configured locale.",
      "Usage is tracked per project. Requires a project slug for accounting.",
      "Use this to quickly generate translations for new keys.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug for usage tracking"),
      text: z.string().min(1).describe("English text to translate"),
    },
    async ({ projectSlug, text }) => {
      try {
        const result = await apiPost<Record<string, string>>("/translations/ai-translate", {
          text,
          projectSlug,
        });
        logWrite("ai_translate", { projectSlug, text }, result);

        const lines = [
          `AI Translation (project: ${projectSlug}):`,
          `Source (en): ${text}`,
          ``,
          ...Object.entries(result).map(([locale, translation]) =>
            `  [${locale}] ${translation}`,
          ),
          ``,
          `Use set_translation or bulk_import to save these translations.`,
        ];
        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── ai_quality_check ─────────────────────────────────────────────
  server.tool(
    "ai_quality_check",
    [
      "Check translation quality using AI.",
      "Compares source English text against a translation for a specific locale.",
      "Returns a quality score (1-100), level (green/yellow/red), and a comment.",
      "Does NOT persist results — use check_entry_quality to persist.",
      "Usage is tracked per project.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug for usage tracking"),
      source: z.string().min(1).describe("Source English text"),
      translation: z.string().min(1).describe("Translation to evaluate"),
      locale: z.string().describe("Target locale code (e.g. 'nb-NO', 'uk')"),
      mode: z
        .enum(["translation_quality", "language_quality"])
        .default("translation_quality")
        .describe("Check mode: translation_quality compares to source, language_quality evaluates standalone"),
      context: z
        .string()
        .max(500)
        .optional()
        .describe("Optional context about where/how this key is used. Helps AI evaluate accuracy for ambiguous terms."),
    },
    async ({ projectSlug, source, translation, locale, mode, context }) => {
      try {
        const result = await apiPost<{
          score: number;
          level: string;
          comment: string;
          contextNeed?: string;
          contextReason?: string | null;
        }>(
          "/translations/ai-quality-check",
          { source, translation, locale, mode, projectSlug, ...(context ? { context } : {}) },
        );
        logWrite("ai_quality_check", { projectSlug, source, translation, locale, mode, context }, result);

        const lines = [
          `Quality Check (${locale}):`,
          `  Source: "${source}"`,
          `  Translation: "${translation}"`,
          `  Score: ${result.score}/100 (${result.level})`,
          `  Comment: ${result.comment}`,
        ];
        if (result.contextNeed && result.contextNeed !== 'none') {
          lines.push(`  Context: ${result.contextNeed}${result.contextReason ? ` — ${result.contextReason}` : ''}`);
        }
        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── check_entry_quality ──────────────────────────────────────────
  server.tool(
    "check_entry_quality",
    [
      "Run AI quality check on all locales of a specific translation key and PERSIST the results.",
      "Results are saved to the database (score, level, comment) and visible in Admin UI.",
      "Uses the default locale as source text for comparison.",
      "Skips locales marked as 'expected' (manually accepted).",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      key: z.string().describe("Translation key to check"),
    },
    async ({ projectSlug, namespace, key }) => {
      try {
        const result = await apiPost<Record<string, { score: number; level: string; comment: string }>>(
          `/translations/projects/${projectSlug}/namespaces/${namespace}/entries/${encodeURIComponent(key)}/check-quality`,
        );
        logWrite("check_entry_quality", { projectSlug, namespace, key }, result);

        const lines = [
          `Quality check: ${projectSlug}/${namespace}/${key}`,
          ``,
          ...Object.entries(result).map(([locale, r]) =>
            `  [${locale}] ${r.score}/100 (${r.level}) — ${r.comment}`,
          ),
          ``,
          `Results saved to database. Visible in Admin UI.`,
        ];
        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
