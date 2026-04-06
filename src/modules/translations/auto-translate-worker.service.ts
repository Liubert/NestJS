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
import { getLocaleName } from './locale-registry.js';

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

  private async processInitTranslateLocales(): Promise<void> {
    const initLocales = await this.localeRepo.findBy({ initTranslate: true });
    if (!initLocales.length) return;

    for (const locale of initLocales) {
      const project = await this.projectRepo.findOneBy({
        id: locale.projectId,
      });
      if (!project?.sandboxInitializedAt) continue;

      const defaultLocale = await this.localeRepo.findOneBy({
        projectId: locale.projectId,
        isDefault: true,
      });
      if (!defaultLocale) continue;

      // Find all keys missing sandbox values for this locale
      const missingRows = await this.dataSource.query<
        { key_id: string; key_name: string; source_text: string }[]
      >(
        `SELECT tk.id AS key_id,
                tk.key AS key_name,
                COALESCE(sv_def.value, tv_def.value) AS source_text
         FROM translation_namespaces ns
         JOIN translation_keys tk ON tk.namespace_id = ns.id
         LEFT JOIN sandbox_values sv_def
           ON sv_def.key_id = tk.id
           AND sv_def.locale_id = $1
           AND sv_def.project_id = $2
           AND sv_def.is_deleted = false
         LEFT JOIN translation_values tv_def
           ON tv_def.key_id = tk.id AND tv_def.locale_id = $1
         LEFT JOIN sandbox_values sv_tgt
           ON sv_tgt.key_id = tk.id
           AND sv_tgt.locale_id = $3
           AND sv_tgt.project_id = $2
           AND sv_tgt.is_deleted = false
         WHERE ns.project_id = $2
           AND COALESCE(sv_def.value, tv_def.value) IS NOT NULL
           AND sv_tgt.id IS NULL
         LIMIT $4`,
        [defaultLocale.id, locale.projectId, locale.id, MAX_KEYS_PER_CYCLE],
      );

      if (!missingRows.length) {
        // All keys translated — reset the flag
        await this.localeRepo.update(locale.id, { initTranslate: false });
        this.logger.log(
          `Init-translate complete for locale "${locale.code}" in project ${locale.projectId}`,
        );
        continue;
      }

      // Translate missing keys using the existing translateKey method
      for (const row of missingRows) {
        try {
          await this.translateKey(
            locale.projectId,
            row.key_id,
            row.key_name,
            row.source_text,
            [locale],
          );
        } catch (e: unknown) {
          this.logger.warn(
            `Init-translate failed for key "${row.key_name}" locale "${locale.code}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      this.logger.log(
        `Init-translate: translated ${missingRows.length} keys for locale "${locale.code}"`,
      );
    }
  }

  private async pollAndProcess(): Promise<void> {
    try {
      await this.processInitTranslateLocales();

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
           AND sv_tgt.is_deleted = false
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
      where: { projectId, keyId, isDeleted: false },
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
      targetLocales[locale.code] = getLocaleName(locale.code);
    }

    // Build locale guidance from locale entities
    const localeGuidance = missingLocales.reduce<Record<string, string>>(
      (acc, l) => {
        if (l.localeSkill) acc[l.code] = l.localeSkill;
        return acc;
      },
      {},
    );

    this.logger.debug(
      `Translating key "${keyName}" to ${Object.keys(targetLocales).join(', ')}`,
    );

    const translations = await this.aiTranslateService.translateForLocales(
      sourceText,
      targetLocales,
      projectId,
      Object.keys(localeGuidance).length ? localeGuidance : undefined,
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
         ON CONFLICT (project_id, key_id, locale_id)
           DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at`,
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
