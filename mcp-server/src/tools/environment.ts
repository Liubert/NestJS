import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { apiGet } from '../api-client.js';
import { fetchPromptContent } from '../prompt-loader.js';
import { errorResult, textResult } from '../utils.js';

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
    'list_projects',
    'List all translation projects accessible to the service account. Returns slugs, names, and sandbox state.',
    {},
    async () => {
      try {
        const data = await apiGet<{
          data: ProjectListItem[];
          meta: { total: number };
        }>('/translations/projects', { page: 1, limit: 100 });

        const rows = data.data.map((p) => {
          const sandboxState = p.sandboxInitializedAt
            ? p.sandboxHasChanges
              ? 'initialized, HAS PENDING CHANGES'
              : 'initialized, no changes'
            : 'not initialized';
          return `• ${p.slug}${p.name ? ` (${p.name})` : ''} — sandbox: ${sandboxState}`;
        });

        return textResult(
          `Found ${data.meta.total} project(s):\n\n${rows.join('\n')}`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'get_project_details',
    [
      'Get full details of a translation project: namespaces, locales, and sandbox state.',
      'ALWAYS call this before writing to a project — you need the exact locale codes and namespace list.',
      'Locale codes returned here are the only valid codes for set_translation, bulk_import, bulk_set_locale, and create_locale.',
      'Use the namespace list to decide whether to reuse an existing namespace or justify creating a new one.',
    ].join(' '),
    { projectSlug: z.string().describe("Project slug (e.g. 'my-app')") },
    async ({ projectSlug }) => {
      try {
        // Fetch project details and sandbox status in parallel.
        const [project, sandboxStatus] = await Promise.all([
          apiGet<ProjectDetails>(`/translations/projects/${projectSlug}`),
          apiGet<SandboxStatus>(
            `/translations/projects/${projectSlug}/sandbox/status`,
          ).catch(() => null),
        ]);

        const locales = project.locales;
        const namespaces = project.namespaces;

        const localeLines = locales.map((l) =>
          l.isDefault ? `${l.code} (default)` : l.code,
        );

        const sandboxLine = sandboxStatus
          ? sandboxStatus.hasChanges
            ? `HAS PENDING CHANGES (${sandboxStatus.snapshotCount} snapshot(s) available)`
            : `no pending changes`
          : `(sandbox status unavailable)`;

        const lines = [
          `Project: ${project.slug}${project.name ? ` — "${project.name}"` : ''}`,
          ``,
          `Locales (${locales.length}): ${localeLines.join(', ')}`,
          ``,
          namespaces.length === 0
            ? `Namespaces: none — project has no namespaces yet`
            : `Namespaces (${namespaces.length}): ${namespaces.join(', ')}`,
          ``,
          `Sandbox: ${sandboxLine}`,
        ];

        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'assess_integration_state',
    [
      'Starting point for localization integration assessment.',
      'Fetches the remote project list with sandbox state, returns the correct client URL patterns for both production and non-production environments,',
      'and provides a full classification guide so the agent can determine whether the local project is correctly integrated.',
      'Use this as the first tool call when running /assess or whenever you need to evaluate how (or whether) a consumer app is connected to this localization backend.',
      'If projectSlug is provided, also fetches full project details (locales, namespaces, sandbox state) for that specific project.',
    ].join(' '),
    {
      projectSlug: z
        .string()
        .optional()
        .describe('Optional: the project slug to fetch full details for'),
    },
    async ({ projectSlug }) => {
      try {
        const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8080';
        const adminUiUrl = process.env.ADMIN_UI_URL ?? 'http://localhost:3010';

        // Fetch projects, optional project details, and agent guide in parallel.
        // The project list already includes sandboxHasChanges + sandboxInitializedAt — no extra status calls needed.
        const [projectsData, projectDetails, agentGuide] = await Promise.all([
          apiGet<{ data: ProjectListItem[]; meta: { total: number } }>(
            '/translations/projects',
            { page: 1, limit: 100 },
          ),
          projectSlug
            ? apiGet<ProjectDetails>(
                `/translations/projects/${projectSlug}`,
              ).catch(() => null)
            : Promise.resolve(null),
          fetchPromptContent('agent-guide', AGENT_GUIDE_FALLBACK),
        ]);

        const projectRows = projectsData.data.map((p) => {
          const sandboxState = p.sandboxHasChanges
            ? 'HAS PENDING CHANGES'
            : 'no changes';
          return `• ${p.slug}${p.name ? ` (${p.name})` : ''} — sandbox: ${sandboxState}`;
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
          agentGuide,
          ``,
          `### Remote Projects (${projectsData.meta.total} found)`,
          ...projectRows,
        ];

        if (projectSlug) {
          lines.push(``, `### Project Details: ${projectSlug}`);
          if (!projectDetails) {
            lines.push(
              `Error: project "${projectSlug}" not found or not accessible.`,
            );
          } else {
            const localeCount = projectDetails.locales.length;
            const nsCount = projectDetails.namespaces.length;
            const isEmpty = nsCount === 0 || localeCount === 0;
            const projectInList = projectsData.data.find(
              (p) => p.slug === projectSlug,
            );
            const sandboxState = projectInList
              ? projectInList.sandboxHasChanges
                ? 'HAS PENDING CHANGES'
                : 'no changes'
              : 'unknown';

            lines.push(
              `Locales (${localeCount}): ${localeCount > 0 ? projectDetails.locales.map((l) => l.code).join(', ') : 'none yet'}`,
            );
            lines.push(
              `Namespaces (${nsCount}): ${nsCount > 0 ? projectDetails.namespaces.join(', ') : 'none yet'}`,
            );
            lines.push(`Sandbox: ${sandboxState}`);
            lines.push(`Is empty: ${isEmpty}`);
            lines.push(`Admin UI: ${adminUiUrl} (Projects → ${projectSlug})`);
          }
        }

        return textResult(lines.join('\n'));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

const AGENT_GUIDE_FALLBACK = `# Localization MCP Server — Agent Guide

## 🚫 NEVER DO WITHOUT EXPLICIT USER INSTRUCTION

The following actions are **irreversible or high-impact**. Never call them unless the user has explicitly asked for that specific action in the current message:

| Action | Why it's dangerous |
|---|---|
| \`reset_sandbox\` | Wipes all pending sandbox changes — irreversible |
| \`push_changes_to_production\` | Overwrites production data |
| \`delete_translation\` | Permanently removes a key and all its values |
| \`delete_locale\` | Removes a locale and ALL its values across namespaces |
| \`delete_namespace\` | Removes a namespace and ALL its keys and values |
| \`bulk_import\` with overwrite | Can silently overwrite existing translations |

**Investigating a problem ≠ permission to fix it.** If the user asks "why does X show Y", that is a diagnostic question — answer it, do not take action. Only act when the user says to.

## ⚠️ MANDATORY PRE-FLIGHT — Do This Before Every Write Session

Before calling \`set_translation\`, \`bulk_set_locale\`, \`bulk_import\`, or \`delete_translation\`:

\`\`\`
get_project_details({ projectSlug: "travis" })
\`\`\`

| \`get_project_details\` sandbox line | What to do |
|------------------------------------|------------|
| \`NOT initialized\` | Call \`init_sandbox({ projectSlug })\` before any write |
| \`initialized — no pending changes\` | Safe to write |
| \`initialized — HAS PENDING CHANGES\` | Call \`get_translation_diff\` first. Do not discard without explicit user instruction. |

## The 6 integration states

| State | Description | What to do |
|-------|-------------|------------|
| **S1 — Correctly integrated** | Local config uses our backend URL AND \`?env=sandbox\` for non-production | Nothing — proceed with translation work |
| **S2 — Outdated integration** | Uses our backend URL but missing \`?env=sandbox\` for non-production | Repair: add \`?env=sandbox\` to non-production env config |
| **S3 — Not integrated, remote project available** | Local app uses different URL/system, but a remote project exists | Connect: update local config to use correct URL patterns |
| **S4 — Not integrated, no remote project** | Local app uses different system, no remote project | Create project, then integrate locally |
| **S5 — Project empty or incomplete** | Local config correct but remote project has no namespaces/locales/translations | Bootstrap: create namespace, locale, init sandbox, import content |
| **S6 — No localization at all** | No i18n system found in the local project | Full setup: install library, create config, then S4 path |

## Client URL pattern (mandatory)

| Environment | URL |
|-------------|-----|
| **Production** | \`{BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}\` |
| **Non-production (dev/staging)** | \`{BACKEND_URL}/translations/{projectSlug}/{namespace}/{locale}?env=sandbox\` |

Non-production environments MUST use \`?env=sandbox\`. Without it, dev/staging tests run against live production data.

## BACKEND_URL is the only source of truth for client config

The \`Backend URL\` returned by \`assess_integration_state\` is the only correct value for \`I18N_BACKEND_URL\` (or equivalent) in the local project's \`.env\` files.

**Never use \`http://localhost:8080\` unless \`assess_integration_state\` explicitly returns that URL.** The MCP server is configured with the correct backend URL — always use what it returns, not assumptions.

## Namespace selection rules

**Default: reuse, do not create.**

1. Explicit namespace in the request → use it directly
2. Clear namespace from context → use the obvious match
3. Multiple namespaces, target is ambiguous → ask the user
4. No matching namespace exists → ask the user, do not create silently

## Key naming rules

Keys must match: \`/^[a-zA-Z0-9._-]+$/\`

Valid: \`button.save\`, \`error-message\`, \`form_field\`
Invalid: \`button/save\`, \`button save\`, \`button:save\`

## Environment rules

| Operation | Sandbox | Production |
|-----------|---------|------------|
| Read keys | ✅ | ✅ |
| Create key | ✅ | ❌ not possible |
| Update key | ✅ | ❌ not possible |
| Delete key | ✅ (soft delete) | ❌ not possible |
| Promote changes | ❌ manual only | via Admin UI |

**There is no MCP tool that writes to production.** Production push is manual via Admin UI only.`;
