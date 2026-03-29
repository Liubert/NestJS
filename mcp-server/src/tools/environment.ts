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

        const projectsData = await apiGet<{ data: ProjectListItem[]; meta: { total: number } }>(
          "/translations/projects",
          { page: 1, limit: 100 },
        );

        const sandboxStatuses = await Promise.all(
          projectsData.data.map((p) =>
            apiGet<SandboxStatus>(`/translations/projects/${p.slug}/sandbox/status`).catch(() => null),
          ),
        );

        let projectDetails: ProjectDetails | null = null;
        let projectDetailsError: string | null = null;
        if (projectSlug) {
          try {
            projectDetails = await apiGet<ProjectDetails>(`/translations/projects/${projectSlug}`);
          } catch (err) {
            projectDetailsError = err instanceof ApiError ? `${err.status}: ${err.message}` : String(err);
          }
        }

        const total = projectsData.meta.total;

        const projectRows = projectsData.data.map((p, i) => {
          const sandbox = sandboxStatuses[i];
          const sandboxState = sandbox
            ? sandbox.initialized
              ? sandbox.hasChanges
                ? "initialized, HAS PENDING CHANGES"
                : "initialized, no changes"
              : "not initialized"
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
          `### Client Integration URL Patterns`,
          ``,
          `This is how a consumer application should fetch translations from this backend:`,
          ``,
          `**Production environment** (use the base URL, no extra params):`,
          `  ${backendUrl}/translations/{projectSlug}/{namespace}/{locale}`,
          `  Example: ${backendUrl}/translations/my-app/common/en-US`,
          ``,
          `**Non-production environments** (MUST append ?env=sandbox):`,
          `  ${backendUrl}/translations/{projectSlug}/{namespace}/{locale}?env=sandbox`,
          `  Example: ${backendUrl}/translations/my-app/common/en-US?env=sandbox`,
          ``,
          `The ?env=sandbox flag tells the server to return sandbox (working copy) values instead of`,
          `promoted production values. This is mandatory for development and staging environments.`,
          ``,
          `### What to look for in the local project`,
          ``,
          `When inspecting local project files, search for:`,
          `1. Any URL matching: ${backendUrl} or the hostname part`,
          `2. Presence of ?env=sandbox in localization fetch URLs for non-production configs`,
          `3. i18n library initialization files (i18next.ts, i18n.ts, vue-i18n setup, etc.)`,
          `4. Environment-specific config files (.env, .env.local, .env.development, .env.production)`,
          `5. Translation fetch/load configuration (backend plugin config, loadPath, etc.)`,
          `6. Any references to the Locize service (they might be migrating from it)`,
          ``,
          `### Integration State Classification`,
          ``,
          `Use the following rules to classify the local project:`,
          ``,
          `S1 — CORRECTLY INTEGRATED:`,
          `  Local config references ${backendUrl} AND non-production env uses ?env=sandbox`,
          ``,
          `S2 — OUTDATED INTEGRATION (needs repair):`,
          `  Local config references ${backendUrl} BUT non-production does NOT use ?env=sandbox`,
          `  (This means sandbox/production separation is missing — a required pattern)`,
          ``,
          `S3 — NOT INTEGRATED, remote project available:`,
          `  Local config does NOT reference ${backendUrl} (uses Locize, i18next-http, or other)`,
          `  AND one or more remote projects exist for this token`,
          ``,
          `S4 — NOT INTEGRATED, no remote project:`,
          `  Local config does NOT reference ${backendUrl}`,
          `  AND no remote projects exist for this token`,
          ``,
          `S5 — INTEGRATED/CONNECTED, but project is empty or incomplete:`,
          `  Local config references ${backendUrl} OR user has selected a project`,
          `  AND the remote project has 0 namespaces OR 0 locales OR no translations yet`,
          ``,
          `S6 — NO LOCALIZATION SYSTEM FOUND:`,
          `  No i18n setup detected in the local project at all`,
          ``,
          `### Remote Projects (${total} found)`,
          ...projectRows,
        ];

        if (projectSlug) {
          lines.push(``);
          lines.push(`### Project Details: ${projectSlug}`);
          if (projectDetailsError) {
            lines.push(`Error fetching details: ${projectDetailsError}`);
          } else if (projectDetails) {
            const localeCount = projectDetails.locales.length;
            const localeCodes = projectDetails.locales.map((l) => l.code).join(", ");
            const namespaceCount = projectDetails.namespaces.length;
            const namespaceList = namespaceCount > 0 ? projectDetails.namespaces.join(", ") : "none yet";
            const isEmpty = namespaceCount === 0 || localeCount === 0;

            const sandboxEntry = sandboxStatuses[projectsData.data.findIndex((p) => p.slug === projectSlug)];
            const detailSandboxState = sandboxEntry
              ? sandboxEntry.initialized
                ? sandboxEntry.hasChanges
                  ? "initialized, HAS PENDING CHANGES"
                  : "initialized, no changes"
                : "not initialized"
              : "not initialized";

            lines.push(`Locales (${localeCount}): ${localeCount > 0 ? localeCodes : "none yet"}`);
            lines.push(`Namespaces (${namespaceCount}): ${namespaceList}`);
            lines.push(`Sandbox: ${detailSandboxState}`);
            lines.push(`Is empty: ${isEmpty}`);
            lines.push(`Admin UI link: ${adminUiUrl} (go to Projects → ${projectSlug})`);
          }
        }

        lines.push(``);
        lines.push(`### Next step`);
        lines.push(`Call /assess prompt or tell me what you found in the local project files.`);
        lines.push(`I will help classify the integration state and guide you to the correct next action.`);

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
