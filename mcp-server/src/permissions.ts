/**
 * MCP Server — Environment Access Policy
 *
 * Policy:
 *   sandbox    → full read + write (all tools available)
 *   production → read-only (no production-write tools exist by design)
 *
 * This file is the single source of truth for which tools write where.
 * All write tools are hardcoded to sandbox API endpoints.
 * There are no production-write endpoints in this MCP server — intentionally.
 *
 * ── Where this logic lives ───────────────────────────────────────────────────
 *   mcp-server/src/permissions.ts       ← this file (policy + registry + guard)
 *   mcp-server/src/tools/sandbox-writes.ts  ← write tools (always sandbox)
 *   mcp-server/src/tools/translations.ts    ← list_translations (env param)
 *
 * ── How to verify ────────────────────────────────────────────────────────────
 *   Sandbox write:
 *     set_translation({ projectSlug, namespace, key, values: { en: "Hello" } })
 *     → should succeed and appear in get_translation_diff
 *
 *   Production read-only:
 *     list_translations({ ..., env: "production" }) → OK (read allowed)
 *     set_translation does not accept an env param → always sandbox
 *
 *   Guard:
 *     assertSandboxWrite("production") → throws Error
 *     assertSandboxWrite("sandbox")    → no-op
 */

export type Environment = "sandbox" | "production";
export type Access = "read" | "write";
export type ToolEnv = "sandbox" | "production" | "both";

export interface ToolMeta {
  env: ToolEnv;
  access: Access;
}

/**
 * Registry of all MCP tools with their environment scope and access level.
 * Add every new tool here.
 */
export const TOOL_REGISTRY = {
  // ── Read — environment / project discovery ───────────────────────────
  list_projects: { env: "both", access: "read" },
  get_project_details: { env: "both", access: "read" },
  assess_integration_state: { env: "both", access: "read" },
  list_translations: { env: "both", access: "read" },
  get_translation_diff: { env: "both", access: "read" },
  validate_translations: { env: "both", access: "read" },
  list_snapshots: { env: "both", access: "read" },
  preview_push_to_production: { env: "both", access: "read" },
  // ── Write — sandbox only; no production-write tools exist ───────────
  reset_sandbox: { env: "sandbox", access: "write" },
  set_translation: { env: "sandbox", access: "write" },
  delete_translation: { env: "sandbox", access: "write" },
  bulk_import: { env: "sandbox", access: "write" },
  bulk_set_locale: { env: "sandbox", access: "write" },
  // ── Project structure management ──────────────────────────────────────────
  create_project: { env: "both", access: "write" },
  create_namespace: { env: "both", access: "write" },
  create_locale: { env: "both", access: "write" },
  // ── Read-only export / analysis ───────────────────────────────────────────
  export_namespace: { env: "both", access: "read" },
  get_namespace_coverage: { env: "both", access: "read" },
  compare_local_vs_server: { env: "both", access: "read" },
  analyze_entries: { env: "both", access: "read" },
  check_keys_exist: { env: "both", access: "read" },
  // ── AI tools ────────────────────────────────────────────────────────────────
  ai_translate: { env: "both", access: "read" },
  ai_quality_check: { env: "both", access: "read" },
  check_entry_quality: { env: "both", access: "write" },
  // ── Sandbox key management ──────────────────────────────────────────────────
  rename_key: { env: "sandbox", access: "write" },
} as const satisfies Record<string, ToolMeta>;

export type ToolName = keyof typeof TOOL_REGISTRY;

/**
 * Guard for write operations. Call at the start of every write tool handler.
 * Throws a descriptive error if env is 'production', enforcing read-only production.
 *
 * @throws Error if env === 'production'
 *
 * @example
 *   assertSandboxWrite("sandbox");    // no-op
 *   assertSandboxWrite("production"); // throws
 */
export function assertSandboxWrite(env: Environment): void {
  if (env === "production") {
    throw new Error(
      "Production is read-only. " +
        "All writes must target the sandbox environment. " +
        "Make changes in sandbox, then promote to production via the Admin UI.",
    );
  }
}
