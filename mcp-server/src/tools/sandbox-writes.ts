import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "../api-client.js";
import { logWrite } from "../logger.js";
import { errorResult, textResult, ToolResult } from "../utils.js";

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
      context: z
        .string()
        .max(500)
        .optional()
        .describe("Short context about where/how this key is used (max 500 chars). Helps translators and AI produce better translations."),
    },
    async ({ projectSlug, namespace, key, values, context }) => {
      // Validate locale codes and check sandbox state in parallel.
      const [{ unknown: unknownLocales }, sandboxWarning] = await Promise.all([
        validateLocales(projectSlug, Object.keys(values)),
        getSandboxWarning(projectSlug),
      ]);

      if (unknownLocales.length > 0) {
        return textResult([
          `Invalid locale codes — call get_project_details to get the exact codes for this project.`,
          ``,
          `Unknown codes: ${unknownLocales.map((l) => `"${l}"`).join(", ")}`,
          ``,
          `Do not guess or remap locale codes. Use only what get_project_details returns.`,
        ].join("\n"));
      }

      const basePath = `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`;

      const withWarning = (result: ToolResult): ToolResult => {
        if (sandboxWarning) {
          result.content[0].text = sandboxWarning + "\n\n" + result.content[0].text;
        }
        return result;
      };

      const patchBody = { values, ...(context !== undefined ? { context } : {}) };
      const postBody = { key, values, ...(context !== undefined ? { context } : {}) };

      try {
        const updated = await apiPatch<EntryRow>(`${basePath}/${encodeURIComponent(key)}`, patchBody);
        logWrite("set_translation", { projectSlug, namespace, key, action: "updated" }, updated);
        return withWarning(successContent("Updated", projectSlug, namespace, key, updated.values));
      } catch (updateError) {
        if (!(updateError instanceof ApiError) || updateError.status !== 404) {
          return errorResult(updateError);
        }

        try {
          const created = await apiPost<EntryRow>(basePath, postBody);
          logWrite("set_translation", { projectSlug, namespace, key, action: "created" }, created);
          return withWarning(successContent("Created", projectSlug, namespace, key, created.values));
        } catch (createError) {
          if (createError instanceof ApiError && createError.status === 409) {
            try {
              const retried = await apiPatch<EntryRow>(`${basePath}/${encodeURIComponent(key)}`, patchBody);
              logWrite("set_translation", { projectSlug, namespace, key, action: "updated" }, retried);
              return withWarning(successContent("Updated", projectSlug, namespace, key, retried.values));
            } catch (retryError) {
              return errorResult(retryError);
            }
          }
          return errorResult(createError);
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
        return textResult([
          `Invalid locale code "${locale}" — call get_project_details to get the exact codes for this project.`,
          `Do not guess or remap locale codes.`,
        ].join("\n"));
      }

      if (dryRun) {
        return textResult([
          `DRY RUN — nothing written`,
          ``,
          `Would write to sandbox: ${projectSlug}/${namespace} [locale: ${locale}]`,
          `  Keys: ${entries.length}`,
          ``,
          entries.slice(0, 10).map((e) => `  ${e.key}: "${e.value}"`).join("\n"),
          entries.length > 10 ? `  ... and ${entries.length - 10} more` : "",
        ].filter(Boolean).join("\n"));
      }

      const basePath = `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries`;

      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      // Try batch endpoint first
      const batchPayload = {
        entries: entries.map(({ key, value }) => ({
          key,
          values: { [locale]: value },
        })),
      };

      let usedBatch = false;
      try {
        const batchResult = await apiPost<{ created: number; updated: number }>(
          `${basePath}/batch`,
          batchPayload,
        );
        created = batchResult.created;
        updated = batchResult.updated;
        usedBatch = true;
      } catch (batchErr) {
        // Fallback to individual requests if batch endpoint not available (404)
        if (!(batchErr instanceof ApiError) || batchErr.status !== 404) {
          // Non-404 error from batch — still try individual fallback
        }
      }

      if (!usedBatch) {
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

      return textResult(text);
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

        return textResult([
          `Deleted sandbox key: ${projectSlug}/${namespace}/${key}`,
          ``,
          `Marked for deletion in sandbox. Removed from production only after promote via Admin UI.`,
          `Use get_translation_diff to review the pending deletion.`,
        ].join("\n"));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── rename_key ──────────────────────────────────────────────────────────────
  server.tool(
    "rename_key",
    [
      "Rename a translation key in a namespace.",
      "Preserves all translation values and sandbox values — only the key name changes.",
      "The new key name must not already exist in the namespace.",
      "This is a sandbox operation — the rename takes effect in sandbox and is reflected in diffs.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      oldKey: z.string().describe("Current key name to rename"),
      newKey: z
        .string()
        .regex(/^[a-zA-Z0-9._-]+$/, "Key must contain only letters, digits, dots, underscores or dashes")
        .describe("New key name"),
    },
    async ({ projectSlug, namespace, oldKey, newKey }) => {
      try {
        await apiPost<void>(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(oldKey)}/rename`,
          { newKey },
        );
        logWrite("rename_key", { projectSlug, namespace, oldKey, newKey }, { renamed: true });
        return textResult(
          `Renamed key: ${oldKey} → ${newKey} in ${projectSlug}/${namespace}\n\n` +
          `All translation values preserved. Use get_translation_diff to review.`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── mark_expected ──────────────────────────────────────────────────────────
  server.tool(
    "mark_expected",
    [
      "Mark a specific locale translation as manually accepted ('expected').",
      "This suppresses quality warnings for this key+locale — useful when the AI quality check flags it",
      "but a human has verified the translation is correct.",
      "Quality checks will skip locales marked as expected.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      key: z.string().describe("Translation key"),
      locale: z.string().describe("Locale code to mark as expected (e.g. 'nb-NO')"),
    },
    async ({ projectSlug, namespace, key, locale }) => {
      try {
        await apiPost<unknown>(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
        );
        logWrite("mark_expected", { projectSlug, namespace, key, locale }, { marked: true });
        return textResult(
          `Marked as expected: ${projectSlug}/${namespace}/${key} [${locale}]\n\n` +
          `Quality warnings for this locale will be suppressed. Use unmark_expected to revert.`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── unmark_expected ────────────────────────────────────────────────────────
  server.tool(
    "unmark_expected",
    [
      "Remove the 'expected' mark from a specific locale translation.",
      "The translation will be subject to quality checks again.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      key: z.string().describe("Translation key"),
      locale: z.string().describe("Locale code to unmark (e.g. 'nb-NO')"),
    },
    async ({ projectSlug, namespace, key, locale }) => {
      try {
        await apiDelete(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
        );
        logWrite("unmark_expected", { projectSlug, namespace, key, locale }, { unmarked: true });
        return textResult(
          `Removed expected mark: ${projectSlug}/${namespace}/${key} [${locale}]\n\n` +
          `This locale will be included in quality checks again.`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // ─── revert_sandbox_entry ───────────────────────────────────────────────────
  server.tool(
    "revert_sandbox_entry",
    [
      "Revert a specific key in sandbox back to its production value.",
      "Useful when you want to undo a sandbox edit for one key without resetting the entire sandbox.",
      "If the key was added in sandbox (not in production), this effectively removes it.",
    ].join(" "),
    {
      projectSlug: z.string().describe("Project slug"),
      namespace: z.string().describe("Namespace slug"),
      key: z.string().describe("Translation key to revert"),
    },
    async ({ projectSlug, namespace, key }) => {
      try {
        await apiPost<void>(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/entries/${encodeURIComponent(key)}/revert`,
        );
        logWrite("revert_sandbox_entry", { projectSlug, namespace, key }, { reverted: true });
        return textResult(
          `Reverted sandbox key: ${projectSlug}/${namespace}/${key}\n\n` +
          `Key restored to its production value. Use get_translation_diff to verify.`,
        );
      } catch (error) {
        return errorResult(error);
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
): ToolResult {
  const valueLines = Object.entries(values)
    .map(([locale, val]) => `  [${locale}] ${val || "(empty)"}`)
    .join("\n");

  return textResult([
    `${action} sandbox key: ${projectSlug}/${namespace}/${key}`,
    ``,
    `Values saved in sandbox:`,
    valueLines || "  (no values set)",
    ``,
    `Production is unchanged. Use preview_push_to_production to review before promoting.`,
  ].join("\n"));
}
