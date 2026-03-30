import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "../api-client.js";
import { logWrite } from "../logger.js";

interface EntryRow {
  key: string;
  createdAt: string;
  values: Record<string, string>;
}

interface ProjectDetails {
  locales: { code: string; isDefault: boolean }[];
  namespaces: string[];
}

interface SandboxStatus {
  initialized: boolean;
  hasChanges: boolean;
  snapshotCount: number;
}

/**
 * Returns a warning string if the sandbox has pre-existing pending changes,
 * or if it is not initialized. Returns null on clean state or fetch failure.
 *
 * Non-blocking: caller should prepend the warning to output but never abort the write.
 */
async function getSandboxWarning(projectSlug: string): Promise<string | null> {
  try {
    const status = await apiGet<SandboxStatus>(
      `/translations/projects/${projectSlug}/sandbox/status`,
    );
    if (!status.initialized) {
      return [
        `⚠️  Sandbox is not initialized for "${projectSlug}".`,
        `   Call init_sandbox({ projectSlug: "${projectSlug}" }) before writing.`,
      ].join("\n");
    }
    if (status.hasChanges) {
      const snapshots = status.snapshotCount;
      return [
        `⚠️  Sandbox already has pending changes (${snapshots} snapshot${snapshots !== 1 ? "s" : ""} available).`,
        `   Review with get_translation_diff before adding more, or call init_sandbox with force: true to discard existing changes.`,
      ].join("\n");
    }
    return null;
  } catch {
    return null; // Never block writes because of a status check failure
  }
}

/**
 * Validates that all requested locale codes exist in the project.
 * Returns valid and unknown sets so callers can surface errors to the agent.
 *
 * Does NOT remap or normalise codes — unknown codes are rejected, not guessed.
 */
async function validateLocales(
  projectSlug: string,
  requestedLocales: string[],
): Promise<{ valid: string[]; unknown: string[] }> {
  try {
    const project = await apiGet<ProjectDetails>(`/translations/projects/${projectSlug}`);
    const projectLocales = new Set(project.locales.map((l) => l.code));
    const valid = requestedLocales.filter((l) => projectLocales.has(l));
    const unknown = requestedLocales.filter((l) => !projectLocales.has(l));
    return { valid, unknown };
  } catch {
    // If we can't fetch the project, proceed — the backend will reject invalid codes.
    return { valid: requestedLocales, unknown: [] };
  }
}

export function registerSandboxWriteTools(server: McpServer): void {
  // ─── set_translation ────────────────────────────────────────────────────────
  server.tool(
    "set_translation",
    [
      "Create or update a translation key in the sandbox (upsert).",
      "PARTIAL LOCALE UPDATE: Pass only the locale(s) you want to update — other locales are untouched.",
      "Example: values={ 'nb-NO': 'Lagre' } updates only Norwegian, leaving en/sv/da-DK unchanged.",
      "This is the correct flow for adding a single locale to an existing key.",
      "Locale codes must exactly match the project's locale codes — call get_project_details first.",
      "Invalid codes are rejected, not auto-corrected. Always writes to sandbox only.",
      "For updating many keys at once, use bulk_set_locale (single locale) or bulk_import (multiple locales).",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug (e.g. 'backoffice-translations')"),
      key: z
        .string()
        .regex(/^[a-zA-Z0-9._-]+$/, "Key must contain only letters, digits, dots, underscores or dashes")
        .describe("Translation key name (e.g. 'button.save', 'errors.notFound')"),
      values: z
        .record(z.string(), z.string())
        .describe(
          "Locale-to-value map. Pass only the locales you want to set — other locales are preserved. " +
          "Locale codes must match the project exactly (e.g. { \"nb-NO\": \"Lagre\" } or { \"nb-NO\": \"Lagre\", \"en\": \"Save\" }).",
        ),
    },
    async ({ projectSlug, namespace, key, values }) => {
      // Validate locale codes and check sandbox state in parallel.
      const [{ unknown: unknownLocales }, sandboxWarning] = await Promise.all([
        validateLocales(projectSlug, Object.keys(values)),
        getSandboxWarning(projectSlug),
      ]);

      if (unknownLocales.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `❌ Invalid locale codes — call get_project_details to get the exact codes for this project.`,
                ``,
                `Unknown codes: ${unknownLocales.map((l) => `"${l}"`).join(", ")}`,
                ``,
                `Do not guess or remap locale codes. Use only what get_project_details returns.`,
              ].join("\n"),
            },
          ],
        };
      }

      const basePath = `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`;

      const withWarning = (result: { content: { type: "text"; text: string }[] }) => {
        if (sandboxWarning) {
          result.content[0].text = sandboxWarning + "\n\n" + result.content[0].text;
        }
        return result;
      };

      try {
        const updated = await apiPatch<EntryRow>(`${basePath}/${encodeURIComponent(key)}`, { values });
        logWrite("set_translation", { projectSlug, namespace, key, action: "updated" }, updated);
        return withWarning(successContent("Updated", projectSlug, namespace, key, updated.values));
      } catch (updateError) {
        if (!(updateError instanceof ApiError) || updateError.status !== 404) {
          return errorContent(updateError);
        }

        try {
          const created = await apiPost<EntryRow>(basePath, { key, values });
          logWrite("set_translation", { projectSlug, namespace, key, action: "created" }, created);
          return withWarning(successContent("Created", projectSlug, namespace, key, created.values));
        } catch (createError) {
          if (createError instanceof ApiError && createError.status === 409) {
            try {
              const retried = await apiPatch<EntryRow>(`${basePath}/${encodeURIComponent(key)}`, { values });
              logWrite("set_translation", { projectSlug, namespace, key, action: "updated" }, retried);
              return withWarning(successContent("Updated", projectSlug, namespace, key, retried.values));
            } catch (retryError) {
              return errorContent(retryError);
            }
          }
          return errorContent(createError);
        }
      }
    },
  );

  // ─── bulk_set_locale ────────────────────────────────────────────────────────
  server.tool(
    "bulk_set_locale",
    [
      "Bulk upsert multiple keys for a SINGLE locale in the sandbox.",
      "Designed for the new-locale fill workflow: after adding a locale, use this to fill many keys at once.",
      "Only the specified locale is written — all other locales on each key remain untouched.",
      "Use list_translations with missingLocale to get the list of keys to fill.",
      "For multi-locale bulk import use bulk_import instead.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug — must already exist"),
      locale: z
        .string()
        .describe("The single locale to write values for (e.g. 'nb-NO'). Must match the project's locale codes exactly."),
      entries: z
        .array(
          z.object({
            key: z
              .string()
              .regex(/^[a-zA-Z0-9._-]+$/, "Key must contain only letters, digits, dots, underscores or dashes"),
            value: z.string(),
          }),
        )
        .min(1)
        .describe("Array of { key, value } pairs to upsert for the given locale."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, preview what would be written without actually writing"),
    },
    async ({ projectSlug, namespace, locale, entries, dryRun }) => {
      // Validate locale code and check sandbox state in parallel.
      const [{ unknown: unknownLocales }, sandboxWarning] = await Promise.all([
        validateLocales(projectSlug, [locale]),
        dryRun ? Promise.resolve(null) : getSandboxWarning(projectSlug),
      ]);
      if (unknownLocales.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `❌ Invalid locale code "${locale}" — call get_project_details to get the exact codes for this project.`,
                `Do not guess or remap locale codes.`,
              ].join("\n"),
            },
          ],
        };
      }

      if (dryRun) {
        return {
          content: [
            {
              type: "text" as const,
              text: [
                `DRY RUN — nothing written`,
                ``,
                `Would write to sandbox: ${projectSlug}/${namespace} [locale: ${locale}]`,
                `  Keys: ${entries.length}`,
                ``,
                entries.slice(0, 10).map((e) => `  ${e.key}: "${e.value}"`).join("\n"),
                entries.length > 10 ? `  ... and ${entries.length - 10} more` : "",
              ].filter(Boolean).join("\n"),
            },
          ],
        };
      }

      const basePath = `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`;

      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const { key, value } of entries) {
        try {
          try {
            await apiPatch<unknown>(`${basePath}/${encodeURIComponent(key)}`, { values: { [locale]: value } });
            updated++;
          } catch (patchErr) {
            if (patchErr instanceof ApiError && patchErr.status === 404) {
              await apiPost<unknown>(basePath, { key, values: { [locale]: value } });
              created++;
            } else {
              throw patchErr;
            }
          }
        } catch (err) {
          failed++;
          errors.push(`  ${key}: ${err instanceof ApiError ? `${err.status} ${err.message}` : String(err)}`);
          if (failed > 5) {
            errors.push(`  ... stopping early after ${failed} errors`);
            break;
          }
        }
      }

      logWrite("bulk_set_locale", { projectSlug, namespace, locale, keyCount: entries.length }, { created, updated, failed });

      const lines = [
        `Bulk set locale "${locale}" in sandbox: ${projectSlug}/${namespace}`,
        `  Created: ${created}`,
        `  Updated: ${updated}`,
        `  Failed:  ${failed}`,
      ];

      if (errors.length > 0) {
        lines.push(``, `Errors:`, ...errors);
      }

      lines.push(
        ``,
        `Use validate_translations or get_translation_diff to review pending changes.`,
        `Use list_translations with missingLocale="${locale}" to check remaining gaps.`,
      );

      const text = sandboxWarning
        ? sandboxWarning + "\n\n" + lines.join("\n")
        : lines.join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  // ─── delete_translation ─────────────────────────────────────────────────────
  server.tool(
    "delete_translation",
    "Delete a translation key from the sandbox (soft delete). The key remains in production until you promote the sandbox.",
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      key: z.string().describe("Translation key to delete"),
    },
    async ({ projectSlug, namespace, key }) => {
      try {
        await apiDelete(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(key)}`,
        );

        logWrite("delete_translation", { projectSlug, namespace, key }, { deleted: true });

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Deleted sandbox key: ${projectSlug}/${namespace}/${key}`,
                ``,
                `Marked for deletion in sandbox. Removed from production only after promote via Admin UI.`,
                `Use get_translation_diff to review the pending deletion.`,
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}

function successContent(
  action: "Created" | "Updated",
  projectSlug: string,
  namespace: string,
  key: string,
  values: Record<string, string>,
): { content: { type: "text"; text: string }[] } {
  const valueLines = Object.entries(values)
    .map(([locale, val]) => `  [${locale}] ${val || "(empty)"}`)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text: [
          `${action} sandbox key: ${projectSlug}/${namespace}/${key}`,
          ``,
          `Values saved in sandbox:`,
          valueLines || "  (no values set)",
          ``,
          `Production is unchanged. Use preview_push_to_production to review before promoting.`,
        ].join("\n"),
      },
    ],
  };
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
