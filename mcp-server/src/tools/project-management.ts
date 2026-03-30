import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { apiGet, apiPost, ApiError } from "../api-client.js";
import { logWrite } from "../logger.js";

interface NamespaceCreated {
  id: string;
  slug: string;
}

interface LocaleCreated {
  id: string;
  code: string;
  isDefault: boolean;
}

interface TranslationEntry {
  key: string;
  values: Record<string, string>;
  createdAt: string;
}

interface EntriesPage {
  data: TranslationEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function registerProjectManagementTools(server: McpServer): void {
  // ─── create_project ────────────────────────────────────────────────────────
  server.tool(
    "create_project",
    [
      "Create a new translation project on the localization backend.",
      "Only call this after the user has explicitly confirmed they want to create a project.",
      "The slug must be unique — if a project with this slug already exists, the call will fail.",
      "After creating a project, you must also: create at least one namespace (create_namespace),",
      "create at least one locale (create_locale), and initialize the sandbox (init_sandbox)",
      "before the project can be used for translation work.",
    ].join(" "),
    {
      slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*$/, "Slug must start with a letter or digit and contain only lowercase letters, digits, and hyphens")
        .describe("Project slug — short, lowercase, hyphen-separated identifier (e.g. 'my-app', 'travis-v2'). Must be unique."),
      name: z
        .string()
        .optional()
        .describe("Optional human-readable project name (e.g. 'My Application'). Shown in Admin UI."),
    },
    async ({ slug, name }) => {
      try {
        interface ProjectCreated {
          id: string;
          slug: string;
          name: string | null;
          ownerId: string;
          createdAt: string;
        }

        const project = await apiPost<ProjectCreated>("/translations/projects", {
          slug,
          ...(name ? { name } : {}),
        });

        logWrite("create_project", { slug, name }, project);

        const lines = [
          `✅ Project created successfully.`,
          ``,
          `Slug: ${project.slug}`,
          ...(project.name ? [`Name: ${project.name}`] : []),
          `ID: ${project.id}`,
          ``,
          `Next steps (required before using this project):`,
          `1. create_namespace — add at least one namespace (e.g. "common")`,
          `2. create_locale — add at least one locale (e.g. "en-US")`,
          `3. init_sandbox — initialize the sandbox before any writes`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 409) {
            return {
              content: [{ type: "text" as const, text: `Error: A project with slug "${slug}" already exists. Use a different slug or call list_projects to see existing projects.` }],
            };
          }
          return {
            content: [{ type: "text" as const, text: `Error ${error.status}: ${error.message}` }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `Unexpected error: ${String(error)}` }],
        };
      }
    },
  );

  // ─── create_namespace ──────────────────────────────────────────────────────
  server.tool(
    "create_namespace",
    [
      "Create a new namespace in a project.",
      "IMPORTANT: Call get_project_details first and check existing namespaces before using this tool.",
      "Reuse an existing namespace whenever context makes the target clear.",
      "Do NOT create a new namespace just because the request did not name one explicitly.",
      "Creating a namespace is an architectural decision — it must be justified.",
      "You MUST provide a non-empty reason explaining why no existing namespace fits.",
      "If you cannot state a clear reason, do not create — ask the user instead.",
      "Namespace slugs must be lowercase alphanumeric with dashes.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z
        .string()
        .regex(/^[a-z0-9-]+$/, "Namespace slug must be lowercase alphanumeric with dashes")
        .describe("Namespace slug (e.g. 'expenses', 'mobile-v2')"),
      reason: z
        .string()
        .min(10, "Reason must be at least 10 characters — explain why no existing namespace fits")
        .describe(
          "Why a new namespace is needed. Mention which existing namespaces you checked and why they do not fit. " +
          "Example: 'Project has no namespaces yet' or 'Existing: common, backoffice. This feature (payments) is a separate domain with its own release cadence.'",
        ),
    },
    async ({ projectSlug, namespace, reason }) => {
      // Soft guard: fetch existing namespaces and warn if any exist without a strong reason.
      let existingNamespaces: string[] = [];
      try {
        const project = await apiGet<{ namespaces: string[] }>(`/translations/projects/${projectSlug}`);
        existingNamespaces = project.namespaces;
      } catch {
        // If we can't fetch, proceed — backend will enforce access control.
      }

      try {
        const created = await apiPost<NamespaceCreated>(
          `/translations/projects/${projectSlug}/namespaces`,
          { slug: namespace },
        );
        logWrite("create_namespace", { projectSlug, namespace, reason, existingNamespaces }, created);
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Created namespace: ${projectSlug}/${namespace}`,
                existingNamespaces.length > 0
                  ? `Existing namespaces at time of creation: ${existingNamespaces.join(", ")}`
                  : `This is the first namespace in the project.`,
                `Reason provided: ${reason}`,
                ``,
                `The namespace is empty. Use set_translation to add keys, or bulk_import to load from a JSON map.`,
                `Remember to init_sandbox after creating the namespace if you plan to use sandbox workflow.`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── create_locale ─────────────────────────────────────────────────────────
  server.tool(
    "create_locale",
    [
      "Add a locale to a project.",
      "Use full BCP 47 codes: 'nb-NO', 'da-DK', 'sv', 'en', 'uk'.",
      "Do NOT use short codes like 'no' or 'da' — they are not stored on the server.",
      "After adding a locale, use get_namespace_coverage to see fill gaps, then bulk_set_locale to fill them.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      code: z
        .string()
        .describe("BCP 47 locale code (e.g. 'nb-NO', 'da-DK', 'sv', 'uk')"),
      isDefault: z
        .boolean()
        .default(false)
        .describe("Whether this is the default locale for the project"),
    },
    async ({ projectSlug, code, isDefault }) => {
      try {
        // Fetch existing namespaces to guide the next step.
        let namespaces: string[] = [];
        try {
          const project = await apiGet<{ namespaces: string[] }>(`/translations/projects/${projectSlug}`);
          namespaces = project.namespaces;
        } catch {
          // Non-fatal — just skip the hint.
        }

        const created = await apiPost<LocaleCreated>(
          `/translations/projects/${projectSlug}/locales`,
          { code, isDefault },
        );
        logWrite("create_locale", { projectSlug, code, isDefault }, created);

        const nextSteps =
          namespaces.length > 0
            ? [
                ``,
                `Next steps to fill translations for "${code}":`,
                `1. get_namespace_coverage for each namespace to see fill gaps`,
                `   Namespaces: ${namespaces.join(", ")}`,
                `2. list_translations with missingLocale="${code}" to find keys needing translation`,
                `3. bulk_set_locale to fill many keys at once for "${code}"`,
                `   Or: set_translation for individual keys`,
              ]
            : [``, `No namespaces exist yet — create a namespace first, then add translations.`];

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Added locale: ${code}${isDefault ? " (default)" : ""} to project ${projectSlug}`,
                ...nextSteps,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── export_namespace ──────────────────────────────────────────────────────
  server.tool(
    "export_namespace",
    "Export all translation keys for a namespace as a flat JSON map, per locale. Use this to see the full content of a namespace, compare before/after migration, or get the data needed for bulk_import.",
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      env: z
        .enum(["sandbox", "production"])
        .default("production")
        .describe("Which environment to export from (default: production)"),
      locale: z
        .string()
        .optional()
        .describe("Export only this locale. If omitted, exports all locales."),
    },
    async ({ projectSlug, namespace, env, locale }) => {
      try {
        // Fetch project locales
        const project = await apiGet<{ locales: { code: string; isDefault: boolean }[]; namespaces: string[] }>(
          `/translations/projects/${projectSlug}`,
        );

        const targetLocales = locale ? [locale] : project.locales.map((l) => l.code);
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        // Fetch all pages
        const allEntries: TranslationEntry[] = [];
        let page = 1;
        while (true) {
          const data = await apiGet<EntriesPage>(basePath, { page, limit: 100 });
          allEntries.push(...data.data);
          if (page >= data.meta.totalPages) break;
          page++;
        }

        if (allEntries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Namespace ${projectSlug}/${namespace} [${env}] is empty.`,
              },
            ],
          };
        }

        // Build per-locale maps
        const result: Record<string, Record<string, string>> = {};
        for (const loc of targetLocales) {
          result[loc] = {};
          for (const entry of allEntries) {
            if (entry.values[loc] !== undefined) {
              result[loc][entry.key] = entry.values[loc];
            }
          }
        }

        const lines = [
          `Export: ${projectSlug}/${namespace} [${env}]`,
          `Keys: ${allEntries.length}`,
          `Locales: ${targetLocales.join(", ")}`,
          ``,
        ];

        for (const [loc, map] of Object.entries(result)) {
          const count = Object.keys(map).length;
          const missing = allEntries.length - count;
          lines.push(`[${loc}]: ${count} keys${missing > 0 ? ` (${missing} missing)` : ""}`);
        }

        lines.push(``, `JSON export:`);
        lines.push(JSON.stringify(result, null, 2));

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── bulk_import ───────────────────────────────────────────────────────────
  server.tool(
    "bulk_import",
    [
      "Import multiple translation keys into the sandbox at once.",
      "Accepts either inline JSON (translations parameter) or a path to a JSON file on disk (filePath parameter).",
      "File format: { \"locale\": { \"key\": \"value\" } } — same as inline translations.",
      "Use filePath when the payload is large (>100 keys) to avoid inline JSON size limits.",
      "All writes go to sandbox — production is unchanged until you promote.",
      "Run compare_local_vs_server first to avoid re-importing keys that already exist.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug — must already exist (use create_namespace first)"),
      translations: z
        .record(z.string(), z.record(z.string(), z.string()))
        .optional()
        .describe('Inline locale → key → value map. Use this for small payloads. Example: { "en": { "save": "Save" }, "nb-NO": { "save": "Lagre" } }'),
      filePath: z
        .string()
        .optional()
        .describe('Absolute path to a JSON file on disk. Format: { "locale": { "key": "value" } }. Use this for large translation files instead of inline JSON.'),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, validate and preview what would be imported without writing anything"),
    },
    async ({ projectSlug, namespace, translations, filePath, dryRun }) => {
      try {
        // Resolve translations — from inline or file
        let resolvedTranslations: Record<string, Record<string, string>>;

        if (filePath) {
          try {
            const raw = readFileSync(filePath, "utf-8");
            resolvedTranslations = JSON.parse(raw);
          } catch (e) {
            return {
              content: [{
                type: "text" as const,
                text: `❌ Could not read file: ${filePath}\n${String(e)}`,
              }],
            };
          }
        } else if (translations) {
          resolvedTranslations = translations;
        } else {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Provide either "translations" (inline JSON) or "filePath" (path to JSON file).`,
            }],
          };
        }

        // Validate locale codes and check sandbox state in parallel.
        const [project, sandboxStatus] = await Promise.all([
          apiGet<{ locales: { code: string; isDefault: boolean }[] }>(
            `/translations/projects/${projectSlug}`,
          ),
          dryRun
            ? Promise.resolve(null)
            : apiGet<{ initialized: boolean; hasChanges: boolean; snapshotCount: number }>(
                `/translations/projects/${projectSlug}/sandbox/status`,
              ).catch(() => null),
        ]);

        const sandboxWarning: string | null = (() => {
          if (!sandboxStatus) return null;
          if (!sandboxStatus.initialized) {
            return [
              `⚠️  Sandbox is not initialized for "${projectSlug}".`,
              `   Call init_sandbox({ projectSlug: "${projectSlug}" }) before writing.`,
            ].join("\n");
          }
          if (sandboxStatus.hasChanges) {
            const n = sandboxStatus.snapshotCount;
            return [
              `⚠️  Sandbox already has pending changes (${n} snapshot${n !== 1 ? "s" : ""} available).`,
              `   Review with get_translation_diff before importing more, or call init_sandbox with force: true to discard existing changes.`,
            ].join("\n");
          }
          return null;
        })();

        const validLocales = new Set(project.locales.map((l) => l.code));
        const requestedLocales = Object.keys(resolvedTranslations);
        const unknownLocales = requestedLocales.filter((l) => !validLocales.has(l));

        if (unknownLocales.length > 0) {
          return {
            content: [{
              type: "text" as const,
              text: [
                `❌ Import aborted — locale codes do not match the project.`,
                ``,
                `Unknown codes: ${unknownLocales.map((l) => `"${l}"`).join(", ")}`,
                `Valid locales for "${projectSlug}": ${[...validLocales].join(", ")}`,
                ``,
                `Call get_project_details to get the exact locale codes. Do not guess or remap them.`,
                `If the locale does not exist in the project yet, call create_locale first.`,
              ].join("\n"),
            }],
          };
        }

        // Collect all unique keys
        const allKeys = new Set<string>();
        for (const localeMap of Object.values(resolvedTranslations)) {
          for (const key of Object.keys(localeMap)) {
            allKeys.add(key);
          }
        }

        if (dryRun) {
          const perLocale = requestedLocales.map(
            (l) => `  ${l}: ${Object.keys(resolvedTranslations[l]).length} values`,
          );
          return {
            content: [{
              type: "text" as const,
              text: [
                `DRY RUN — nothing written`,
                ``,
                `Would import to sandbox: ${projectSlug}/${namespace}`,
                `  Source: ${filePath ?? "inline"}`,
                `  Unique keys: ${allKeys.size}`,
                `  Locales:`,
                ...perLocale,
              ].join("\n"),
            }],
          };
        }

        const basePath = `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`;

        // Group values per key across all locales, then upsert each key once
        const keyMap = new Map<string, Record<string, string>>();
        for (const [locale, localeMap] of Object.entries(resolvedTranslations)) {
          for (const [key, value] of Object.entries(localeMap)) {
            if (!keyMap.has(key)) keyMap.set(key, {});
            keyMap.get(key)![locale] = value;
          }
        }

        let upserted = 0;
        let failed = 0;
        const errors: string[] = [];

        const { apiPatch } = await import("../api-client.js");

        for (const [key, values] of keyMap.entries()) {
          try {
            await apiPatch<unknown>(`${basePath}/${encodeURIComponent(key)}`, { values });
            upserted++;
          } catch (err) {
            // PATCH acts as upsert — if it fails, try POST (key may not exist on older API versions)
            if (err instanceof ApiError && err.status === 404) {
              try {
                await apiPost<unknown>(basePath, { key, values });
                upserted++;
              } catch (postErr) {
                failed++;
                errors.push(`  ${key}: ${postErr instanceof ApiError ? `${postErr.status} ${postErr.message}` : String(postErr)}`);
              }
            } else {
              failed++;
              errors.push(`  ${key}: ${err instanceof ApiError ? `${err.status} ${err.message}` : String(err)}`);
            }
            if (failed > 5) {
              errors.push(`  ... and more errors (stopping early)`);
              break;
            }
          }
        }

        logWrite("bulk_import", { projectSlug, namespace, keyCount: keyMap.size, source: filePath ?? "inline" }, { upserted, failed });

        const lines = [
          `Bulk import to sandbox: ${projectSlug}/${namespace}`,
          `  Source:   ${filePath ?? "inline"}`,
          `  Upserted: ${upserted}`,
          `  Failed:   ${failed}`,
        ];

        if (errors.length > 0) {
          lines.push(``, `Errors:`, ...errors);
        }

        lines.push(``, `Use get_translation_diff to review all pending changes before promoting.`);

        const text = sandboxWarning
          ? sandboxWarning + "\n\n" + lines.join("\n")
          : lines.join("\n");

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── compare_local_vs_server ───────────────────────────────────────────────
  server.tool(
    "compare_local_vs_server",
    [
      "Compare a local translation map against a namespace on the server.",
      "Returns: keys only in local (need importing), keys only on server (not in local), keys with different values (conflicts), and a count of matching keys.",
      "Run this BEFORE bulk_import to avoid re-importing keys that already exist with the same values.",
      "Accepts either an inline translations map or a filePath to a JSON file on disk.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      translations: z
        .record(z.string(), z.record(z.string(), z.string()))
        .optional()
        .describe('Inline locale → key → value map to compare against server'),
      filePath: z
        .string()
        .optional()
        .describe('Absolute path to a JSON file on disk. Format: { "locale": { "key": "value" } }'),
      env: z
        .enum(["sandbox", "production"])
        .default("sandbox")
        .describe("Which environment to compare against (default: sandbox)"),
    },
    async ({ projectSlug, namespace, translations, filePath, env }) => {
      try {
        // Resolve local translations
        let local: Record<string, Record<string, string>>;

        if (filePath) {
          try {
            local = JSON.parse(readFileSync(filePath, "utf-8"));
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `❌ Could not read file: ${filePath}\n${String(e)}` }],
            };
          }
        } else if (translations) {
          local = translations;
        } else {
          return {
            content: [{ type: "text" as const, text: `❌ Provide either "translations" (inline) or "filePath".` }],
          };
        }

        // Fetch all server entries
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        const allEntries: TranslationEntry[] = [];
        let page = 1;
        while (true) {
          const data = await apiGet<EntriesPage>(basePath, { page, limit: 100 });
          allEntries.push(...data.data);
          if (page >= data.meta.totalPages) break;
          page++;
        }

        const serverKeys = new Map<string, Record<string, string>>();
        for (const entry of allEntries) {
          serverKeys.set(entry.key, entry.values);
        }

        // Collect all local keys across all locales
        const localKeys = new Map<string, Record<string, string>>();
        for (const [locale, map] of Object.entries(local)) {
          for (const [key, value] of Object.entries(map)) {
            if (!localKeys.has(key)) localKeys.set(key, {});
            localKeys.get(key)![locale] = value;
          }
        }

        const onlyLocal: string[] = [];
        const onlyServer: string[] = [];
        const conflicts: { key: string; locale: string; local: string; server: string }[] = [];
        let matching = 0;

        for (const [key, localValues] of localKeys.entries()) {
          if (!serverKeys.has(key)) {
            onlyLocal.push(key);
          } else {
            const serverValues = serverKeys.get(key)!;
            let hasConflict = false;
            for (const [locale, localVal] of Object.entries(localValues)) {
              const serverVal = serverValues[locale];
              if (serverVal !== undefined && serverVal !== localVal) {
                conflicts.push({ key, locale, local: localVal, server: serverVal });
                hasConflict = true;
              }
            }
            if (!hasConflict) matching++;
          }
        }

        for (const key of serverKeys.keys()) {
          if (!localKeys.has(key)) {
            onlyServer.push(key);
          }
        }

        const lines = [
          `Compare: local${filePath ? ` (${filePath})` : ""} vs ${projectSlug}/${namespace} [${env}]`,
          ``,
          `  ✅ Matching (same values):    ${matching}`,
          `  ➕ Only in local (need import): ${onlyLocal.length}`,
          `  📦 Only on server (not local): ${onlyServer.length}`,
          `  ⚠️  Conflicts (different values): ${conflicts.length}`,
        ];

        if (onlyLocal.length > 0) {
          lines.push(``, `Keys only in local (first 20):`);
          onlyLocal.slice(0, 20).forEach((k) => lines.push(`  • ${k}`));
          if (onlyLocal.length > 20) lines.push(`  ... and ${onlyLocal.length - 20} more`);
          lines.push(``, `→ Run bulk_import to add these to the server.`);
        }

        if (conflicts.length > 0) {
          lines.push(``, `Conflicts (first 10):`);
          conflicts.slice(0, 10).forEach((c) =>
            lines.push(`  • ${c.key} [${c.locale}]\n    local:  "${c.local}"\n    server: "${c.server}"`),
          );
          if (conflicts.length > 10) lines.push(`  ... and ${conflicts.length - 10} more`);

          const conflictKeys = [...new Set(conflicts.map((c) => c.key))];
          lines.push(
            ``,
            `Resolve conflicts — choose one action per conflicting key:`,
            ``,
            `  ⚠️  OVERWRITE (dangerous) — replaces server values with local ones:`,
            `      Use bulk_import with only the conflicting keys.`,
            `      Only do this if local values are correct and server is outdated.`,
            `      Conflicting keys: ${conflictKeys.join(", ")}`,
            ``,
            `  ➕ ADD AS NEW KEYS — keep server values, store local values under a new key name:`,
            `      Rename conflicting keys (e.g. "mileage" → "mileage_expense") and use bulk_import.`,
            `      Use this when both values are valid but serve different contexts.`,
            ``,
            `  ✅ KEEP EXISTING — skip conflicting keys entirely, use server values as-is:`,
            `      Exclude conflicting keys from bulk_import. No action needed for them.`,
          );
        }

        if (onlyLocal.length === 0 && conflicts.length === 0) {
          lines.push(``, `✅ Local and server are in sync — no import needed.`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── validate_keys ─────────────────────────────────────────────────────────
  server.tool(
    "validate_keys",
    [
      "Check whether a list of translation keys exist in a namespace.",
      "Returns: found keys, missing keys.",
      "Use this to verify that all t() calls in a component are backed by server entries.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      keys: z.array(z.string()).min(1).describe("List of translation keys to check"),
      env: z
        .enum(["sandbox", "production"])
        .default("sandbox")
        .describe("Which environment to check against (default: sandbox)"),
    },
    async ({ projectSlug, namespace, keys, env }) => {
      try {
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        // Fetch all entries to build a key set
        const allEntries: TranslationEntry[] = [];
        let page = 1;
        while (true) {
          const data = await apiGet<EntriesPage>(basePath, { page, limit: 100 });
          allEntries.push(...data.data);
          if (page >= data.meta.totalPages) break;
          page++;
        }

        const serverKeySet = new Set(allEntries.map((e) => e.key));
        const found = keys.filter((k) => serverKeySet.has(k));
        const missing = keys.filter((k) => !serverKeySet.has(k));

        const lines = [
          `Validate keys in ${projectSlug}/${namespace} [${env}]`,
          ``,
          `  Checked: ${keys.length}`,
          `  Found:   ${found.length}`,
          `  Missing: ${missing.length}`,
        ];

        if (missing.length > 0) {
          lines.push(``, `Missing keys:`);
          missing.forEach((k) => lines.push(`  ✗ ${k}`));
          lines.push(``, `→ Use set_translation or bulk_import to add missing keys.`);
        } else {
          lines.push(``, `✅ All keys exist on the server.`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  // ─── get_namespace_coverage ────────────────────────────────────────────────
  server.tool(
    "get_namespace_coverage",
    [
      "Show per-locale fill statistics for a namespace.",
      "Returns: total keys, how many have a non-empty value for each locale, and coverage percentage.",
      "Also lists the first 10 keys missing each locale.",
      "Use this after adding a new locale to understand the fill gap before starting bulk_set_locale.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      env: z
        .enum(["sandbox", "production"])
        .default("sandbox")
        .describe("Which environment to analyze (default: sandbox)"),
    },
    async ({ projectSlug, namespace, env }) => {
      try {
        // Fetch project locales
        const project = await apiGet<{ locales: { code: string; isDefault: boolean }[] }>(
          `/translations/projects/${projectSlug}`,
        );
        const localeCodes = project.locales.map((l) => l.code);

        if (localeCodes.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Project "${projectSlug}" has no locales configured.` }],
          };
        }

        // Fetch all entries
        const basePath =
          env === "sandbox"
            ? `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`
            : `/translations/projects/${projectSlug}/namespaces/${namespace}/entries`;

        const allEntries: TranslationEntry[] = [];
        let page = 1;
        while (true) {
          const data = await apiGet<EntriesPage>(basePath, { page, limit: 100 });
          allEntries.push(...data.data);
          if (page >= data.meta.totalPages) break;
          page++;
        }

        if (allEntries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Namespace ${projectSlug}/${namespace} [${env}] is empty. No keys to analyze.`,
              },
            ],
          };
        }

        const totalKeys = allEntries.length;

        // Build per-locale stats
        const localeStats = localeCodes.map((code) => {
          const filled = allEntries.filter(
            (e) => e.values[code] !== undefined && e.values[code].trim() !== "",
          );
          const missingKeys = allEntries
            .filter((e) => !e.values[code] || e.values[code].trim() === "")
            .map((e) => e.key);
          const pct = Math.round((filled.length / totalKeys) * 100);
          return { code, filled: filled.length, missing: missingKeys.length, pct, missingKeys };
        });

        const lines = [
          `Namespace coverage: ${projectSlug}/${namespace} [${env}]`,
          `Total keys: ${totalKeys}`,
          ``,
          `Locale coverage:`,
          ...localeStats.map((s) => {
            const bar = "█".repeat(Math.round(s.pct / 5)) + "░".repeat(20 - Math.round(s.pct / 5));
            return `  ${s.code.padEnd(10)} ${bar} ${s.pct}% (${s.filled}/${totalKeys})${s.missing > 0 ? ` — ${s.missing} missing` : ""}`;
          }),
        ];

        const incomplete = localeStats.filter((s) => s.missing > 0);
        if (incomplete.length > 0) {
          lines.push(``, `Sample missing keys (up to 10 per locale):`);
          for (const s of incomplete) {
            if (s.missingKeys.length > 0) {
              lines.push(`  [${s.code}]:`);
              s.missingKeys.slice(0, 10).forEach((k) => lines.push(`    • ${k}`));
              if (s.missingKeys.length > 10) lines.push(`    ... and ${s.missingKeys.length - 10} more`);
            }
          }
          lines.push(
            ``,
            `To fill gaps: use list_translations with missingLocale="<code>" then bulk_set_locale.`,
          );
        } else {
          lines.push(``, `All locales are fully covered.`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );
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
