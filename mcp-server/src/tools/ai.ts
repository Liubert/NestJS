import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiGet, apiPost } from '../api-client.js';
import { logWrite } from '../logger.js';
import { errorResult, textResult } from '../utils.js';

export function registerAiTools(server: McpServer): void {
  // ─── ai_translate ──────────────────────────────────────────────────
  server.tool(
    'ai_translate',
    [
      'Translate English text to all project locales using AI (Gemini).',
      'Returns translations for each configured locale.',
      'Usage is tracked per project. Requires a project slug for accounting.',
      'Use this to quickly generate translations for new keys.',
      'Optionally accepts context (where the text appears in UI) to improve translation quality for short or ambiguous strings.',
      'Optionally accepts targetLocales array to restrict translation to specific locales instead of all project locales.',
    ].join(' '),
    {
      projectSlug: z.string().describe('Project slug for usage tracking'),
      text: z.string().min(1).describe('English text to translate'),
      context: z
        .string()
        .max(1000)
        .optional()
        .describe(
          'Context about where/how this key is used (max 1000 chars). ' +
            'Helps AI translate ambiguous strings accurately. ' +
            'Describe: screen, UI element type, meaning in this place.',
        ),
      targetLocales: z
        .array(z.string())
        .optional()
        .describe(
          'Optional list of locale codes to translate into (e.g. ["uk", "nb-NO"]). ' +
            'When omitted, translates to all non-default project locales. ' +
            'Use this for efficiency when filling only specific locales.',
        ),
    },
    async ({ projectSlug, text, context, targetLocales: callerLocales }) => {
      try {
        // Fetch project locales to translate only into project's configured locales
        const project = await apiGet<{
          locales: { code: string; isDefault: boolean }[];
        }>(`/translations/projects/${projectSlug}`);
        const allProjectLocales = project.locales
          .filter((l) => !l.isDefault)
          .map((l) => l.code);

        let targetLocales: string[];
        let ignoredLocales: string[] = [];

        if (callerLocales && callerLocales.length > 0) {
          const projectLocaleSet = new Set(allProjectLocales);
          targetLocales = callerLocales.filter((code) =>
            projectLocaleSet.has(code),
          );
          ignoredLocales = callerLocales.filter(
            (code) => !projectLocaleSet.has(code),
          );
        } else {
          targetLocales = allProjectLocales;
        }

        const result = await apiPost<Record<string, string>>(
          '/translations/ai-translate',
          {
            text,
            projectSlug,
            targetLocales,
            ...(context ? { context } : {}),
          },
        );
        logWrite('ai_translate', { projectSlug, text }, result);

        const lines = [
          `AI Translation (project: ${projectSlug}):`,
          `Source (en): ${text}`,
          ``,
          ...Object.entries(result).map(
            ([locale, translation]) => `  [${locale}] ${translation}`,
          ),
          ``,
        ];
        if (ignoredLocales.length > 0) {
          lines.push(
            `Note: ignored unknown locales: ${ignoredLocales.join(', ')}`,
          );
        }
        lines.push(
          `To save: use bulk_import for all locales at once ({ "locale": { "key": "value" } } format), or bulk_set_locale for a single locale only.`,
        );
        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── bulk_ai_translate ────────────────────────────────────────────
  server.tool(
    'bulk_ai_translate',
    [
      'Translate multiple English texts to all project locales in one call using AI (Gemini).',
      'Processes in batches of 10 keys per AI call. Max 200 entries.',
      'Use for bulk new-namespace translation or filling a new locale.',
      'Replaces N separate ai_translate calls with one bulk operation.',
    ].join(' '),
    {
      projectSlug: z
        .string()
        .describe(
          'Project slug (required for locale resolution and usage tracking)',
        ),
      entries: z
        .array(
          z.object({
            key: z.string().describe('Translation key'),
            text: z.string().min(1).describe('English source text'),
            context: z
              .string()
              .max(1000)
              .optional()
              .describe('Context for this key'),
          }),
        )
        .min(1)
        .max(200)
        .describe('Array of entries to translate'),
      targetLocales: z
        .array(z.string())
        .optional()
        .describe(
          'Optional list of locale codes. When omitted, translates to all non-default project locales.',
        ),
    },
    async ({ projectSlug, entries, targetLocales: callerLocales }) => {
      try {
        // Fetch project locales to resolve and validate caller-provided locales
        const project = await apiGet<{
          locales: { code: string; isDefault: boolean }[];
        }>(`/translations/projects/${projectSlug}`);
        const allProjectLocales = project.locales
          .filter((l) => !l.isDefault)
          .map((l) => l.code);

        let targetLocales: string[];
        let ignoredLocales: string[] = [];

        if (callerLocales && callerLocales.length > 0) {
          const projectLocaleSet = new Set(allProjectLocales);
          targetLocales = callerLocales.filter((code) =>
            projectLocaleSet.has(code),
          );
          ignoredLocales = callerLocales.filter(
            (code) => !projectLocaleSet.has(code),
          );
        } else {
          targetLocales = allProjectLocales;
        }

        const result = await apiPost<Record<string, Record<string, string>>>(
          '/translations/ai-translate/bulk',
          {
            entries,
            projectSlug,
            targetLocales,
          },
        );
        logWrite(
          'bulk_ai_translate',
          { projectSlug, entryCount: entries.length },
          result,
        );

        const translatedCount = Object.keys(result).length;
        const lines = [
          `Translated ${translatedCount} keys to [${targetLocales.join(', ')}]:`,
          ``,
          JSON.stringify(result, null, 2),
          ``,
        ];
        if (ignoredLocales.length > 0) {
          lines.push(
            `Note: ignored unknown locales: ${ignoredLocales.join(', ')}`,
          );
        }
        lines.push(
          `Use bulk_import to save — pass as data parameter: { "locale": { "key": "value" } }`,
        );
        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── bulk_translate_and_save ──────────────────────────────────────
  server.tool(
    'bulk_translate_and_save',
    [
      'Translate, save to sandbox, and quality-check in one step.',
      'Replaces the 3-step flow: bulk_ai_translate -> bulk_import -> check_entry_quality.',
      'Saves translations directly to sandbox (not production).',
      'With skipQuality=false (default): returns per-key per-locale quality scores inline.',
      'With skipQuality=true: saves translations, queues quality check, returns immediately.',
      'Max 200 entries per call.',
    ].join(' '),
    {
      projectSlug: z.string().describe('Project slug'),
      namespace: z.string().describe('Namespace slug'),
      entries: z
        .array(
          z.object({
            key: z.string().describe('Translation key'),
            text: z.string().min(1).describe('English source text'),
            context: z
              .string()
              .max(1000)
              .optional()
              .describe('Context for this key'),
          }),
        )
        .min(1)
        .max(200)
        .describe('Array of entries to translate and save (1–200)'),
      targetLocales: z
        .array(z.string())
        .optional()
        .describe(
          'Optional list of locale codes. When omitted, translates to all non-default project locales.',
        ),
      skipQuality: z
        .boolean()
        .optional()
        .describe(
          'Skip sync quality check; results queued for background worker (default: false)',
        ),
    },
    async ({ projectSlug, namespace, entries, targetLocales, skipQuality }) => {
      try {
        const result = await apiPost<
          | {
              translations: Record<string, Record<string, string>>;
              quality: Record<
                string,
                Record<string, { score: number; level: string; comment: string }>
              >;
              saved: { created: number; updated: number };
            }
          | {
              translations: Record<string, Record<string, string>>;
              saved: { created: number; updated: number };
              qualityStatus: 'queued';
            }
        >('/translations/ai-translate/bulk-and-save', {
          projectSlug,
          namespace,
          entries,
          targetLocales,
          skipQuality,
        });
        logWrite(
          'bulk_translate_and_save',
          { projectSlug, namespace, entryCount: entries.length },
          result,
        );

        const translatedCount = Object.keys(result.translations).length;
        const lines = [
          `Translated and saved ${translatedCount} keys to sandbox (${namespace}) in project ${projectSlug}`,
          `Saved: ${result.saved.created} created, ${result.saved.updated} updated`,
        ];

        if ('quality' in result && result.quality) {
          lines.push('');
          lines.push('Quality results:');
          for (const [key, localeMap] of Object.entries(result.quality)) {
            lines.push(`  ${key}:`);
            for (const [locale, r] of Object.entries(localeMap)) {
              lines.push(
                `    [${locale}] ${r.score}/100 (${r.level})${r.comment ? ` -- ${r.comment}` : ''}`,
              );
            }
          }
          lines.push('');
          lines.push('Agent guidance:');
          lines.push('  - green (85+): No action needed');
          lines.push(
            '  - yellow (60-84): Review optional — consider improving if context available',
          );
          lines.push(
            '  - red (<60): Must fix — use set_translation to correct, then check_entry_quality to re-check',
          );
        } else if ('qualityStatus' in result && result.qualityStatus === 'queued') {
          lines.push('');
          lines.push(
            'Quality check: queued (background worker will process within ~30s)',
          );
          lines.push(
            'Use check_entry_quality per key to see results after processing.',
          );
        }

        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── ai_quality_check ─────────────────────────────────────────────
  server.tool(
    'ai_quality_check',
    [
      'Check translation quality for multiple locales at once using AI.',
      'Accepts source English text and a locale-to-translation map.',
      'Returns per-locale quality score (1-100), level (green/yellow/red), and comment.',
      'Does NOT persist results — use check_entry_quality to persist.',
      'Usage is tracked per project.',
    ].join(' '),
    {
      projectSlug: z.string().describe('Project slug for usage tracking'),
      source: z.string().min(1).describe('Source English text'),
      translations: z
        .record(z.string(), z.string())
        .describe(
          'Locale to translation map, e.g. { "uk": "Зберегти", "de": "Speichern" }',
        ),
      context: z
        .string()
        .max(1000)
        .optional()
        .describe(
          'Context about where/how this key is used (max 1000 chars). ' +
            'Helps AI evaluate accuracy — especially for short/ambiguous strings. ' +
            'Describe: screen, UI element type, meaning in this place.',
        ),
    },
    async ({ projectSlug, source, translations, context }) => {
      try {
        const result = await apiPost<
          Record<string, { score: number; level: string; comment: string }>
        >('/translations/ai-quality-check/bulk', {
          source,
          translations,
          projectSlug,
          ...(context ? { context } : {}),
        });
        logWrite(
          'ai_quality_check',
          { projectSlug, source, localeCount: Object.keys(translations).length },
          result,
        );

        const lines = [
          `Quality check results:`,
          `Source: "${source}"`,
          ``,
          ...Object.entries(result).map(([locale, r]) =>
            `  [${locale}] ${r.score}/100 (${r.level})${r.comment ? ` — ${r.comment}` : ''}`,
          ),
        ];
        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── check_entry_quality ──────────────────────────────────────────
  server.tool(
    'check_entry_quality',
    [
      'Run AI quality check on all locales of a specific translation key in SANDBOX and PERSIST the results to sandbox.',
      'Results are saved to sandbox (score, level, comment) and visible in Admin UI.',
      'Uses the default locale sandbox value as source text for comparison.',
      "Skips locales marked as 'expected' (manually accepted).",
      'Production is never read or written by this tool.',
    ].join(' '),
    {
      projectSlug: z.string().describe('Project slug'),
      namespace: z.string().describe('Namespace slug'),
      key: z.string().describe('Translation key to check'),
    },
    async ({ projectSlug, namespace, key }) => {
      try {
        const result = await apiPost<
          Record<string, { score: number; level: string; comment: string }>
        >(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(key)}/check-quality`,
        );
        logWrite(
          'check_entry_quality',
          { projectSlug, namespace, key },
          result,
        );

        const lines = [
          `Quality check: ${projectSlug}/${namespace}/${key}`,
          ``,
          ...Object.entries(result).map(([locale, r]) =>
            r
              ? `  [${locale}] ${r.score}/100 (${r.level}) — ${r.comment}`
              : `  [${locale}] skipped (no translation)`,
          ),
          ``,
          `Results saved to database. Visible in Admin UI.`,
        ];
        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
