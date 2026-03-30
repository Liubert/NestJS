import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, ApiError } from "../api-client.js";

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
    "assess_integration_state",
    [
      "Starting point for localization integration assessment.",
      "Fetches the remote project list with sandbox state, returns the correct client URL patterns for both production and non-production environments,",
      "and provides a full classification guide so the agent can determine whether the local project is correctly integrated.",
      "Use this as the first tool call when running /assess or whenever you need to evaluate how (or whether) a consumer app is connected to this localization backend.",
      "If projectSlug is provided, also fetches full project details (locales, namespaces, sandbox state) for that specific project.",
    ].join(" "),
    { projectSlug: z.string().optional().describe("Optional: the project slug to fetch full details for") },
    async ({ projectSlug }) => {
      try {
        const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";
        const adminUiUrl = process.env.ADMIN_UI_URL ?? "http://localhost:3010";

        // Fetch projects and optional project details in parallel.
        // The project list already includes sandboxHasChanges + sandboxInitializedAt — no extra status calls needed.
        const [projectsData, projectDetails] = await Promise.all([
          apiGet<{ data: ProjectListItem[]; meta: { total: number } }>(
            "/translations/projects",
            { page: 1, limit: 100 },
          ),
          projectSlug
            ? apiGet<ProjectDetails>(`/translations/projects/${projectSlug}`).catch(() => null)
            : Promise.resolve(null),
        ]);

        const projectRows = projectsData.data.map((p) => {
          const sandboxState = p.sandboxInitializedAt
            ? p.sandboxHasChanges
              ? "initialized, HAS PENDING CHANGES"
              : "initialized, no changes"
            : "not initialized";
          return `• ${p.slug}${p.name ? ` (${p.name})` : ""} — sandbox: ${sandboxState}`;
        });

        const lines: string[] = [
          `## Integration Assessment — Remote State`,
          ``,
          `### Server Configuration`,
          `Backend URL: ${backendUrl}`,
          `Admin UI URL: ${adminUiUrl}`,
          ``,
          `### Client URL Patterns`,
          `Production:     ${backendUrl}/translations/{slug}/{namespace}/{locale}`,
          `Non-production: ${backendUrl}/translations/{slug}/{namespace}/{locale}?env=sandbox`,
          ``,
          `Non-production environments MUST use ?env=sandbox — without it, dev/staging tests run against live production data.`,
          ``,
          `### What to look for in the local project`,
          `1. URL matching: ${backendUrl}`,
          `2. ?env=sandbox in non-production localization fetch URLs`,
          `3. i18n init files (i18next.ts, i18n.ts, vue-i18n, react-intl, etc.)`,
          `4. .env, .env.local, .env.development, .env.production`,
          `5. References to Locize or other external i18n services (migration scenario)`,
          ``,
          `Use the S1–S6 classification guide in AGENT_GUIDE.md to determine integration state.`,
          ``,
          `### Remote Projects (${projectsData.meta.total} found)`,
          ...projectRows,
        ];

        if (projectSlug) {
          lines.push(``, `### Project Details: ${projectSlug}`);
          if (!projectDetails) {
            lines.push(`Error: project "${projectSlug}" not found or not accessible.`);
          } else {
            const localeCount = projectDetails.locales.length;
            const nsCount = projectDetails.namespaces.length;
            const isEmpty = nsCount === 0 || localeCount === 0;
            const projectInList = projectsData.data.find((p) => p.slug === projectSlug);
            const sandboxState = projectInList
              ? projectInList.sandboxInitializedAt
                ? projectInList.sandboxHasChanges
                  ? "initialized, HAS PENDING CHANGES"
                  : "initialized, no changes"
                : "not initialized"
              : "unknown";

            lines.push(`Locales (${localeCount}): ${localeCount > 0 ? projectDetails.locales.map((l) => l.code).join(", ") : "none yet"}`);
            lines.push(`Namespaces (${nsCount}): ${nsCount > 0 ? projectDetails.namespaces.join(", ") : "none yet"}`);
            lines.push(`Sandbox: ${sandboxState}`);
            lines.push(`Is empty: ${isEmpty}`);
            lines.push(`Admin UI: ${adminUiUrl} (Projects → ${projectSlug})`);
          }
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
