import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpPromptEntity } from './entities/mcp-prompt.entity.js';

// known prompts — sync with mcp-server/src/prompts.ts
const KNOWN_PROMPTS: Record<
  string,
  { description: string; defaultContent: string }
> = {
  setup: {
    description:
      'Quick-start guide: how to explore projects, work with sandbox, and push translations.',
    defaultContent: [
      '## Localization MCP — Quick Start',
      '',
      '### 1. Discover',
      '- `list_projects` — see all projects and sandbox state',
      '- `get_project_details <slug>` — get exact locale codes and namespaces (**always call this before writing**)',
      '',
      '### 2. Read translations',
      '- `list_translations <slug> <namespace>` — browse keys; filter with `missingLocale`, `search`',
      '- `get_translation_diff <slug>` — see what changed in sandbox vs production',
      '',
      '### 3. Write to sandbox',
      '- `set_translation` — upsert one key (pass only the locales you want to update)',
      '- `bulk_set_locale` — fill many keys for a single locale at once',
      '- `bulk_import` — import multiple locales from a JSON map',
      '- `delete_translation` — soft-delete a key in sandbox',
      '',
      '### 4. Review & push',
      '- `validate_translations <slug>` — check for missing translations before pushing',
      '- `get_translation_diff <slug>` — final review of pending changes',
      '- Promote via the Admin UI — MCP has no push tool by design (human approval required)',
      '',
      '### Rules',
      '- All writes go to **sandbox only** — production is never touched directly',
      '- Locale codes must match exactly what `get_project_details` returns — never guess',
      '- Prefer existing namespaces — only create a new one with a clear justification',
    ].join('\n'),
  },
  assess: {
    description:
      'Assess the current localization integration state of the local project and get guided next steps.',
    defaultContent: [
      '## Localization Integration Assessment',
      '',
      'You are now running a localization integration assessment. Follow these steps in order.',
      '',
      '---',
      '',
      '### Step 1: Get remote state',
      '',
      'Call `assess_integration_state`{{#projectSlug}} with projectSlug: "{{projectSlug}}"{{/projectSlug}}.',
      'This gives you the remote project list, URL patterns, and classification guide.',
      '',
      '---',
      '',
      '### Step 2: Inspect the local project',
      '',
      'After reading the remote state, inspect the local codebase for localization setup:',
      '',
      '1. Search for i18n configuration files: look for files named i18n.ts, i18next.ts, i18n.js,',
      '   i18next.config.ts, or similar. Also check for vue-i18n, react-intl, lingui, or i18next',
      '   initialization in app entry points.',
      '',
      '2. Check environment files: read .env, .env.local, .env.development, .env.production,',
      '   .env.staging, and any other .env.* files. Look for any variable containing a URL',
      '   that relates to translations or localization.',
      '',
      '3. Search for the backend URL: look for the backend URL returned by assess_integration_state',
      '   in any config or env file.',
      '',
      '4. Check for ?env=sandbox: search for this exact string in the project. Its presence in',
      '   non-production configs is the key indicator of up-to-date integration.',
      '',
      '5. Look for Locize references: search for "locize.com" or "localazy" or similar third-party',
      '   localization service URLs — this indicates a migration scenario.',
      '',
      '---',
      '',
      '### Step 3: Classify the integration state',
      '',
      'Using what you found locally and the classification guide from assess_integration_state,',
      'determine which state applies:',
      '',
      '**S1 — Correctly integrated:**',
      '→ Confirm to the user, no action needed. Proceed with normal translation work.',
      '',
      '**S2 — Outdated integration (missing ?env=sandbox):**',
      '→ Tell the user: "Your project uses our localization server, but non-production environments',
      'are not using sandbox mode. This means dev/staging changes go directly to production data."',
      '→ Show which files need updating',
      '→ Ask: "Should I update these files for you, or would you prefer to do it manually?"',
      '→ If user approves: propose specific file edits, apply with approval per file',
      '→ If user prefers manual: show exactly what to change and where',
      '→ After fixing: call init_sandbox if sandbox is not initialized',
      '',
      '**S3 — Not integrated, remote project available:**',
      '→ Tell the user which remote projects exist',
      '→ Ask: "Which project should this local project connect to?" (show list)',
      '→ After selection: help update local config to use the correct URL patterns',
      '→ Then assess if the selected project needs bootstrap (S5 check)',
      '',
      '**S4 — Not integrated, no remote project:**',
      '→ Tell the user no remote project exists yet',
      '→ Ask: "Would you like to create a new localization project?"',
      '→ Suggest a project name based on: package.json name field, git remote URL, or directory name',
      "→ Present options: create now / I'll create manually in Admin UI",
      '→ If create now: ask for slug confirmation, then call create_project, create_namespace, create_locale, init_sandbox',
      '→ Then help configure local integration',
      '',
      '**S5 — Project exists but empty/incomplete:**',
      '→ Tell the user the project exists but has not been bootstrapped',
      '→ Offer to:',
      '  a) Create missing namespaces (ask for name, default: "common")',
      '  b) Create missing locales (ask for primary locale BCP 47 code)',
      '  c) Initialize sandbox',
      '  d) Scan and import local translation files if they exist',
      '→ Do these in order, with user confirmation for each group',
      '',
      '**S6 — No localization system found:**',
      '→ Tell the user no i18n setup was found',
      '→ Ask: "Would you like me to set up localization from scratch?"',
      '→ If yes:',
      '  a) Ask what i18n library they want to use (suggest i18next as default for React/Node,',
      '     vue-i18n for Vue, or a custom fetch approach)',
      '  b) Propose the integration: install library, create config, configure to fetch from our backend',
      '  c) Show what the config should look like with the correct URLs from assess_integration_state',
      '  d) Apply with user approval',
      '  e) Then continue with project creation if needed (S4 path)',
      '',
      '---',
      '',
      '### Rules for all paths',
      '',
      '- All writes go to sandbox only — never to production',
      '- init_sandbox must be called before any sandbox writes',
      '- Never create a project, namespace, or locale without user confirmation',
      "- Always show what you're about to do before doing it",
      '- If uncertain about the local project structure, ask rather than assume',
      '- Namespace mapping: if the local project has its own namespace structure (multiple translation files',
      "  per area/feature), preserve that structure — create matching namespaces, don't flatten into one",
      '- After any setup action: summarize what was done and what the user should do next',
      '',
      '---',
      '',
      '### Final step',
      '',
      'After completing setup (any state), summarize:',
      '1. What integration state was detected',
      '2. What was changed (if anything)',
      '3. What the user needs to do manually (if anything)',
      '4. Current sandbox state',
      '5. Next recommended action',
    ].join('\n'),
  },
  diagnostic: {
    description:
      'Run a live health check: verify API connectivity, token validity, and list project states.',
    defaultContent: 'Run diagnostic on the localization MCP server.',
  },
};

export interface PromptEntry {
  key: string;
  description: string;
  defaultContent: string;
  content: string | null;
  version: number | null;
  hasOverride: boolean;
  updatedBy: string | null;
  createdAt: Date | null;
}

@Injectable()
export class McpPromptsService {
  constructor(
    @InjectRepository(McpPromptEntity)
    private readonly repo: Repository<McpPromptEntity>,
  ) {}

  async getAll(): Promise<PromptEntry[]> {
    const results: PromptEntry[] = [];

    for (const [key, meta] of Object.entries(KNOWN_PROMPTS)) {
      const latest = await this.repo.findOne({
        where: { promptKey: key },
        order: { version: 'DESC' },
      });

      results.push({
        key,
        description: meta.description,
        defaultContent: meta.defaultContent,
        content: latest?.content ?? null,
        version: latest?.version ?? null,
        hasOverride: !!latest,
        updatedBy: latest?.updatedBy ?? null,
        createdAt: latest?.createdAt ?? null,
      });
    }

    return results;
  }

  async getLatest(key: string): Promise<McpPromptEntity | null> {
    return this.repo.findOne({
      where: { promptKey: key },
      order: { version: 'DESC' },
    });
  }

  async createVersion(
    key: string,
    content: string,
    updatedBy: string,
  ): Promise<McpPromptEntity> {
    const latest = await this.repo.findOne({
      where: { promptKey: key },
      order: { version: 'DESC' },
    });

    const nextVersion = latest ? latest.version + 1 : 1;

    const entity = this.repo.create({
      promptKey: key,
      content,
      version: nextVersion,
      updatedBy,
    });

    return this.repo.save(entity);
  }

  async getHistory(key: string): Promise<McpPromptEntity[]> {
    return this.repo.find({
      where: { promptKey: key },
      order: { version: 'DESC' },
    });
  }

  async restoreVersion(
    key: string,
    targetVersion: number,
    updatedBy: string,
  ): Promise<McpPromptEntity> {
    const target = await this.repo.findOne({
      where: { promptKey: key, version: targetVersion },
    });

    if (!target) {
      throw new NotFoundException(
        `Version ${targetVersion} not found for prompt "${key}"`,
      );
    }

    return this.createVersion(key, target.content, updatedBy);
  }

  async resetOverrides(key: string): Promise<void> {
    await this.repo.delete({ promptKey: key });
  }

  isKnownKey(key: string): boolean {
    return key in KNOWN_PROMPTS;
  }
}
