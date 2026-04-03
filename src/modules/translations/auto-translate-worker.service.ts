import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectEntity } from './entities/project.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { AiTranslateService } from './ai-translate.service.js';

/** Map of locale code → human-readable language name for Gemini prompts */
const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  nb: 'Norwegian Bokmål',
  'nb-NO': 'Norwegian Bokmål',
  sv: 'Swedish',
  da: 'Danish',
  'da-DK': 'Danish',
  fi: 'Finnish',
  is: 'Icelandic',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  el: 'Greek',
  tr: 'Turkish',
  uk: 'Ukrainian',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  ro: 'Romanian',
  hu: 'Hungarian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sl: 'Slovenian',
  sr: 'Serbian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
};

const POLL_INTERVAL_MS = 10_000;
const MAX_KEYS_PER_CYCLE = 20;

interface MissingRow {
  project_id: string;
  key_id: string;
  key_name: string;
  source_text: string;
  default_locale_id: string;
}

@Injectable()
export class AutoTranslateWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AutoTranslateWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly aiTranslateService: AiTranslateService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.pollAndProcess();
    }, POLL_INTERVAL_MS);
    this.logger.log('Auto-translate worker polling started (every 10s)');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollAndProcess(): Promise<void> {
    try {
      // Find keys where the default locale has a sandbox value
      // but at least one non-default locale is missing a sandbox value entirely
      const rows = await this.dataSource.query<MissingRow[]>(
        `SELECT DISTINCT ON (tk.id)
           ns.project_id,
           tk.id AS key_id,
           tk.key AS key_name,
           COALESCE(sv_def.value, tv_def.value) AS source_text,
           dl.id AS default_locale_id
         FROM translation_projects p
         JOIN translation_namespaces ns ON ns.project_id = p.id
         JOIN translation_keys tk ON tk.namespace_id = ns.id
         JOIN translation_locales dl ON dl.project_id = p.id AND dl.is_default = true
         -- source: prefer sandbox value, fall back to production
         LEFT JOIN sandbox_values sv_def
           ON sv_def.key_id = tk.id
           AND sv_def.locale_id = dl.id
           AND sv_def.project_id = p.id
           AND sv_def.is_deleted = false
         LEFT JOIN translation_values tv_def
           ON tv_def.key_id = tk.id AND tv_def.locale_id = dl.id
         -- find at least one missing target locale
         JOIN translation_locales tl
           ON tl.project_id = p.id AND tl.is_default = false
         LEFT JOIN sandbox_values sv_tgt
           ON sv_tgt.key_id = tk.id
           AND sv_tgt.locale_id = tl.id
           AND sv_tgt.project_id = p.id
         WHERE p.sandbox_initialized_at IS NOT NULL
           AND p.auto_translate_enabled = true
           AND COALESCE(sv_def.value, tv_def.value) IS NOT NULL
           AND sv_tgt.id IS NULL
         LIMIT $1`,
        [MAX_KEYS_PER_CYCLE],
      );

      if (!rows.length) {
        this.logger.debug('No keys need auto-translation');
        return;
      }

      // Group by project
      const byProject = new Map<
        string,
        { keyId: string; keyName: string; sourceText: string }[]
      >();
      for (const row of rows) {
        if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
        byProject.get(row.project_id)!.push({
          keyId: row.key_id,
          keyName: row.key_name,
          sourceText: row.source_text,
        });
      }

      let totalTranslated = 0;

      for (const [projectId, keys] of byProject) {
        const locales = await this.localeRepo.findBy({ projectId });
        const nonDefaultLocales = locales.filter((l) => !l.isDefault);
        if (!nonDefaultLocales.length) continue;

        for (const { keyId, keyName, sourceText } of keys) {
          try {
            await this.translateKey(
              projectId,
              keyId,
              keyName,
              sourceText,
              nonDefaultLocales,
            );
            totalTranslated++;
          } catch (e: unknown) {
            this.logger.warn(
              `Failed to auto-translate key "${keyName}": ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }

      if (totalTranslated > 0) {
        this.logger.log(`Auto-translated ${totalTranslated} keys`);
      }
    } catch (e: unknown) {
      this.logger.error(
        `Auto-translate poll error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async translateKey(
    projectId: string,
    keyId: string,
    keyName: string,
    sourceText: string,
    nonDefaultLocales: LocaleEntity[],
  ): Promise<void> {
    // Check which locales are actually missing sandbox values for this key
    const existingSandbox = await this.sandboxRepo.find({
      where: { projectId, keyId },
      select: ['localeId'],
    });
    const existingLocaleIds = new Set(existingSandbox.map((s) => s.localeId));
    const missingLocales = nonDefaultLocales.filter(
      (l) => !existingLocaleIds.has(l.id),
    );

    if (!missingLocales.length) return;

    // Build target locales map for Gemini
    const targetLocales: Record<string, string> = {};
    for (const locale of missingLocales) {
      targetLocales[locale.code] = LOCALE_NAMES[locale.code] ?? locale.code;
    }

    this.logger.debug(
      `Translating key "${keyName}" to ${Object.keys(targetLocales).join(', ')}`,
    );

    const translations = await this.aiTranslateService.translateForLocales(
      sourceText,
      targetLocales,
      projectId,
    );

    // Write results to sandbox_values
    const values: Partial<SandboxValueEntity>[] = [];
    for (const locale of missingLocales) {
      const translated = translations[locale.code];
      if (!translated) continue;
      values.push({
        projectId,
        keyId,
        localeId: locale.id,
        value: translated,
        isDeleted: false,
      });
    }

    if (values.length) {
      await this.dataSource.query(
        `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
         SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamptz[])
         ON CONFLICT (project_id, key_id, locale_id) DO NOTHING`,
        [
          values.map((v) => v.projectId),
          values.map((v) => v.keyId),
          values.map((v) => v.localeId),
          values.map((v) => v.value),
          values.map(() => false),
          values.map(() => new Date()),
        ],
      );

      // Mark project as having sandbox changes
      await this.projectRepo.update(projectId, { sandboxHasChanges: true });
    }
  }
}
