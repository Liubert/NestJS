import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api-client.js";
import { ApiError } from "../api-client.js";

interface ProjectListItem {
  id: string;
  slug: string;
  name: string | null;
  ownerId: string;
  sandboxInitializedAt: string | null;
  sandboxHasChanges: boolean;
}

interface LocaleInfo {
  code: string;
  isDefault: boolean;
}

interface ProjectDetails {
  id: string;
  slug: string;
  name: string | null;
  ownerId: string;
  locales: LocaleInfo[];
  namespaces: string[];
}

interface SandboxStatus {
  initialized: boolean;
  initializedAt: string | null;
  hasChanges: boolean;
  snapshotCount: number;
}

export function registerEnvironmentTools(server: McpServer): void {
  server.tool(
    "list_projects",
    "List all translation projects accessible to the service account. Returns slugs, names, and sandbox state.",
    {},
    async () => {
      try {
        const data = await apiGet<{ data: ProjectListItem[]; meta: { total: number } }>(
          "/translations/projects",
          { page: 1, limit: 100 },
        );

        const rows = data.data.map((p) => {
          const sandboxState = p.sandboxInitializedAt
            ? p.sandboxHasChanges
              ? "initialized, HAS PENDING CHANGES"
              : "initialized, no changes"
            : "not initialized";
          return `• ${p.slug}${p.name ? ` (${p.name})` : ""} — sandbox: ${sandboxState}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${data.meta.total} project(s):\n\n${rows.join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "get_project_details",
    [
      "Get full details of a translation project: namespaces, locales, and sandbox state.",
      "ALWAYS call this before writing to a project — you need the exact locale codes and namespace list.",
      "Locale codes returned here are the only valid codes for set_translation, bulk_import, bulk_set_locale, and create_locale.",
      "Use the namespace list to decide whether to reuse an existing namespace or justify creating a new one.",
    ].join(" "),
    { projectSlug: z.string().describe("Project slug (e.g. 'my-app')") },
    async ({ projectSlug }) => {
      try {
        // Fetch project details and sandbox status in parallel.
        const [project, sandboxStatus] = await Promise.all([
          apiGet<ProjectDetails>(`/translations/projects/${projectSlug}`),
          apiGet<SandboxStatus>(`/translations/projects/${projectSlug}/sandbox/status`).catch(() => null),
        ]);

        const locales = project.locales;
        const namespaces = project.namespaces;

        const localeLines = locales.map((l) =>
          l.isDefault ? `${l.code} (default)` : l.code,
        );

        const sandboxLine = sandboxStatus
          ? sandboxStatus.initialized
            ? sandboxStatus.hasChanges
              ? `initialized — HAS PENDING CHANGES (${sandboxStatus.snapshotCount} snapshot(s) available)`
              : `initialized — no pending changes`
            : `NOT initialized — call init_sandbox before writing`
          : `(sandbox status unavailable)`;

        const lines = [
          `Project: ${project.slug}${project.name ? ` — "${project.name}"` : ""}`,
          ``,
          `Locales (${locales.length}): ${localeLines.join(", ")}`,
          ``,
          namespaces.length === 0
            ? `Namespaces: none — project has no namespaces yet`
            : `Namespaces (${namespaces.length}): ${namespaces.join(", ")}`,
          ``,
          `Sandbox: ${sandboxLine}`,
        ];

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        return errorContent(error);
      }
    },
  );

  server.tool(
    "get_environment_status",
    "Get the current sandbox/production status for a project: whether the sandbox is initialized, has pending changes, and how many snapshots are available.",
    { projectSlug: z.string().describe("Project slug") },
    async ({ projectSlug }) => {
      try {
        const status = await apiGet<SandboxStatus>(
          `/translations/projects/${projectSlug}/sandbox/status`,
        );

        const lines = [
          `Project: ${projectSlug}`,
          `Sandbox initialized: ${status.initialized ? `yes (since ${status.initializedAt})` : "NO"}`,
          `Has pending changes: ${status.hasChanges ? "YES — changes are waiting to be pushed to production" : "no"}`,
          `Available snapshots for revert: ${status.snapshotCount}`,
        ];

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
      content: [
        {
          type: "text" as const,
          text: `Error ${error.status}: ${error.message}`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `Unexpected error: ${String(error)}`,
      },
    ],
  };
}
