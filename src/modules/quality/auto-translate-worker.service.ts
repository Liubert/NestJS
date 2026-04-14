import {
  HttpException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import { getLocaleName } from '../translations/locale-registry.js';

const POLL_INTERVAL_MS = 10_000;
const MAX_KEYS_PER_CYCLE = 20;

interface MissingRow {
  project_id: string;
  key_id: string;
  key_name: string;
  source_text: string;
  default_locale_id: string;
  key_context: string | null;
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

  /**
   * Immediately translate all keys in the given namespace that are missing
   * non-default-locale sandbox values — bypassing the auto_translate_enabled flag.
   * Intended for use after a namespace reset. Fire-and-forget safe.
   */
  triggerForNamespace(projectId: string, namespaceId: string): void {
    void this.translateNamespace(projectId, namespaceId);
  }

  /**
   * Immediately re-translate a single key in a namespace across all non-default locales.
   * Uses the same sandbox-source-text query as triggerForNamespace but filtered to one key.
   * Intended for use after a single key+locale sandbox value is deleted. Fire-and-forget safe.
   */
  triggerForKey(projectId: string, namespaceId: string, keyId: string): void {
    void this.translateSingleKey(projectId, namespaceId, keyId);
  }

  private async translateNamespace(
    projectId: string,
    namespaceId: string,
  ): Promise<void> {
    try {
      const locales = await this.localeRepo.findBy({ projectId });
      const defaultLocale = locales.find((l) => l.isDefault);
      const nonDefaultLocales = locales.filter((l) => !l.isDefault);
      if (!defaultLocale || !nonDefaultLocales.length) return;

      const rows = await this.dataSource.query<
        {
          key_id: string;
          key_name: string;
          source_text: string;
          key_context: string | null;
        }[]
      >(
        `SELECT tk.id AS key_id,
                tk.key AS key_name,
                (SELECT sv_ctx.context FROM sandbox_values sv_ctx
                 WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $2
                   AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1
                ) AS key_context,
                sv_def.value AS source_text
         FROM translation_keys tk
         JOIN sandbox_values sv_def
           ON sv_def.key_id = tk.id
           AND sv_def.locale_id = $1
           AND sv_def.project_id = $2
           AND sv_def.is_deleted = false
         WHERE tk.namespace_id = $3
           AND sv_def.value IS NOT NULL
         LIMIT $4`,
        [defaultLocale.id, projectId, namespaceId, MAX_KEYS_PER_CYCLE],
      );

      if (!rows.length) {
        this.logger.debug(
          `triggerForNamespace: no translatable keys in namespace ${namespaceId}`,
        );
        return;
      }

      const keys = rows.map((row) => ({
        keyId: row.key_id,
        keyName: row.key_name,
        sourceText: row.source_text,
        context: row.key_context,
      }));

      // Mark pending before translating so the frontend can show spinners immediately
      await this.setPendingFlags(projectId, keys, nonDefaultLocales);

      try {
        await this.translateKeysBulk(projectId, keys, nonDefaultLocales);
        this.logger.log(
          `triggerForNamespace: translated ${keys.length} keys in namespace ${namespaceId}`,
        );
      } catch (e: unknown) {
        // Clear pending flags so spinners don't get stuck
        const keyIds = keys.map((k) => k.keyId);
        await this.dataSource
          .query(
            `UPDATE sandbox_values SET pending_auto_translate = false
             WHERE project_id = $1 AND key_id = ANY($2) AND pending_auto_translate = true`,
            [projectId, keyIds],
          )
          .catch(() => {});
        this.logger.warn(
          `triggerForNamespace batch failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(
        `triggerForNamespace error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async translateSingleKey(
    projectId: string,
    namespaceId: string,
    keyId: string,
  ): Promise<void> {
    try {
      const locales = await this.localeRepo.findBy({ projectId });
      const defaultLocale = locales.find((l) => l.isDefault);
      const nonDefaultLocales = locales.filter((l) => !l.isDefault);
      this.logger.log(
        `triggerForKey: start key=${keyId} ns=${namespaceId} defaultLocale=${defaultLocale?.code ?? 'none'} nonDefault=${nonDefaultLocales.map((l) => l.code).join(',')}`,
      );
      if (!defaultLocale || !nonDefaultLocales.length) return;

      // Use the same sandbox-source-text query as translateNamespace but filtered to one key.
      // This ensures consistency with replace-per-locale: source text comes from the sandbox
      // default locale value (not production fallback), matching the authoritative sandbox state.
      const rows = await this.dataSource.query<
        {
          key_id: string;
          key_name: string;
          source_text: string;
          key_context: string | null;
        }[]
      >(
        `SELECT tk.id AS key_id,
                tk.key AS key_name,
                (SELECT sv_ctx.context FROM sandbox_values sv_ctx
                 WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $2
                   AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1
                ) AS key_context,
                sv_def.value AS source_text
         FROM translation_keys tk
         JOIN sandbox_values sv_def
           ON sv_def.key_id = tk.id
           AND sv_def.locale_id = $1
           AND sv_def.project_id = $2
           AND sv_def.is_deleted = false
         WHERE tk.namespace_id = $3
           AND tk.id = $4
           AND sv_def.value IS NOT NULL
         LIMIT 1`,
        [defaultLocale.id, projectId, namespaceId, keyId],
      );

      if (!rows.length) {
        this.logger.warn(
          `triggerForKey: no source text found for key ${keyId} in namespace ${namespaceId} (defaultLocaleId=${defaultLocale.id})`,
        );
        return;
      }

      const row = rows[0];

      // Mark pending before translating so the frontend can show spinners immediately
      await this.setPendingFlags(
        projectId,
        [
          {
            keyId: row.key_id,
            keyName: row.key_name,
            sourceText: row.source_text,
            context: row.key_context,
          },
        ],
        nonDefaultLocales,
      );

      try {
        await this.translateKey(
          projectId,
          row.key_id,
          row.key_name,
          row.source_text,
          nonDefaultLocales,
          row.key_context,
        );
        this.logger.log(`triggerForKey: translated key "${row.key_name}"`);
      } catch (e: unknown) {
        // Clear pending flags so spinners don't get stuck
        await this.dataSource
          .query(
            `UPDATE sandbox_values SET pending_auto_translate = false
             WHERE project_id = $1 AND key_id = $2 AND pending_auto_translate = true`,
            [projectId, row.key_id],
          )
          .catch(() => {});
        throw e;
      }
    } catch (e: unknown) {
      this.logger.error(
        `triggerForKey error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Sets pending_auto_translate=true for all key+locale combos that will be translated.
   * Uses INSERT ON CONFLICT DO UPDATE so existing rows get the flag set too.
   */
  private async setPendingFlags(
    projectId: string,
    keys: Array<{
      keyId: string;
      keyName: string;
      sourceText: string;
      context: string | null;
    }>,
    locales: LocaleEntity[],
  ): Promise<void> {
    if (!keys.length || !locales.length) return;
    const projectIds: string[] = [];
    const keyIds: string[] = [];
    const localeIds: string[] = [];
    for (const k of keys) {
      for (const l of locales) {
        projectIds.push(projectId);
        keyIds.push(k.keyId);
        localeIds.push(l.id);
      }
    }
    await this.dataSource
      .query(
        `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, pending_auto_translate, is_deleted, updated_at)
         SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::boolean[], $7::timestamptz[])
         ON CONFLICT (project_id, key_id, locale_id)
           DO UPDATE SET pending_auto_translate = true, updated_at = EXCLUDED.updated_at
           WHERE sandbox_values.value IS NULL OR sandbox_values.value = ''`,
        [
          projectIds,
          keyIds,
          localeIds,
          projectIds.map(() => null),
          projectIds.map(() => true),
          projectIds.map(() => false),
          projectIds.map(() => new Date()),
        ],
      )
      .catch(() => {}); // best-effort; don't block translation on flag failure
  }

  private async pollAndProcess(): Promise<void> {
    try {
      // Find keys where the default locale has a sandbox value and either:
      //   (a) auto_translate_enabled=true and a non-default locale has no value (missing row, NULL, or empty), OR
      //   (b) pending_auto_translate=true — translate regardless of existing value or autoTranslate setting
      const rows = await this.dataSource.query<MissingRow[]>(
        `SELECT DISTINCT ON (tk.id)
           ns.project_id,
           tk.id AS key_id,
           tk.key AS key_name,
           (SELECT sv_ctx.context FROM sandbox_values sv_ctx
            WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = p.id
              AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1
           ) AS key_context,
           sv_def.value AS source_text,
           dl.id AS default_locale_id
         FROM translation_projects p
         JOIN translation_namespaces ns ON ns.project_id = p.id
         JOIN translation_keys tk ON tk.namespace_id = ns.id
         JOIN translation_locales dl ON dl.project_id = p.id AND dl.is_default = true
         JOIN sandbox_values sv_def
           ON sv_def.key_id = tk.id
           AND sv_def.locale_id = dl.id
           AND sv_def.project_id = p.id
           AND sv_def.is_deleted = false
         JOIN translation_locales tl
           ON tl.project_id = p.id AND tl.is_default = false
         LEFT JOIN sandbox_values sv_tgt
           ON sv_tgt.key_id = tk.id
           AND sv_tgt.locale_id = tl.id
           AND sv_tgt.project_id = p.id
           AND sv_tgt.is_deleted = false
         WHERE sv_def.value IS NOT NULL
           AND (
             (p.auto_translate_enabled = true AND (sv_tgt.id IS NULL OR sv_tgt.value IS NULL OR sv_tgt.value = ''))
             OR sv_tgt.pending_auto_translate = true
           )
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
        {
          keyId: string;
          keyName: string;
          sourceText: string;
          context: string | null;
        }[]
      >();
      for (const row of rows) {
        if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
        byProject.get(row.project_id)!.push({
          keyId: row.key_id,
          keyName: row.key_name,
          sourceText: row.source_text,
          context: row.key_context,
        });
      }

      let totalTranslated = 0;

      for (const [projectId, keys] of byProject) {
        const locales = await this.localeRepo.findBy({ projectId });
        const nonDefaultLocales = locales.filter((l) => !l.isDefault);
        if (!nonDefaultLocales.length) continue;

        try {
          await this.translateKeysBulk(projectId, keys, nonDefaultLocales);
          totalTranslated += keys.length;
        } catch (e: unknown) {
          // Clear pending flags so spinners don't get stuck
          const failedKeyIds = keys.map((k) => k.keyId);
          await this.dataSource
            .query(
              `UPDATE sandbox_values SET pending_auto_translate = false
               WHERE project_id = $1 AND key_id = ANY($2) AND pending_auto_translate = true`,
              [projectId, failedKeyIds],
            )
            .catch(() => {});
          if (e instanceof HttpException && e.getStatus() === 429) {
            this.logger.warn(
              `Daily token limit reached for project ${projectId}, skipping remaining keys`,
            );
          } else {
            this.logger.warn(
              `Failed to auto-translate batch for project ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
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
    context?: string | null,
  ): Promise<void> {
    // Check which locales are actually missing sandbox values for this key
    // Also load qualityComment and pendingAutoTranslate to pass as previousComment to Gemini
    const existingSandbox = await this.sandboxRepo.find({
      where: { projectId, keyId, isDeleted: false },
      select: ['localeId', 'value', 'qualityComment', 'pendingAutoTranslate'],
    });
    const existingByLocale = new Map(
      existingSandbox.map((s) => [s.localeId, s]),
    );
    const pendingLocaleIds = new Set(
      existingSandbox
        .filter((s) => s.pendingAutoTranslate)
        .map((s) => s.localeId),
    );

    // Collect non-null quality comments across all locales for this key
    const qualityComments = existingSandbox
      .map((s) => s.qualityComment)
      .filter((c): c is string => !!c);
    const previousComment = qualityComments.length
      ? qualityComments[0]
      : undefined;
    // A locale needs translation if: it has no row, OR value is null/empty, OR pending_auto_translate=true
    const missingLocales = nonDefaultLocales.filter((l) => {
      const existing = existingByLocale.get(l.id);
      if (!existing) return true; // no row
      if (pendingLocaleIds.has(l.id)) return true; // explicitly requested
      if (!existing.value) return true; // value is null or empty
      return false;
    });

    if (!missingLocales.length) {
      this.logger.debug(
        `translateKey: all locales present for key ${keyId}, skipping`,
      );
      return;
    }

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

    const { translations, contextNeed, contextReason } =
      await this.aiTranslateService.translateForLocales(
        sourceText,
        targetLocales,
        projectId,
        Object.keys(localeGuidance).length ? localeGuidance : undefined,
        context,
        previousComment,
      );

    // Write results to sandbox_values
    const values: Partial<SandboxValueEntity>[] = [];
    for (const locale of missingLocales) {
      // Gemini may normalise e.g. "nb-NO" → "nb"; fall back to primary subtag
      const translated =
        translations[locale.code] ?? translations[locale.code.split('-')[0]];
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
        `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at, pending_auto_translate, quality_review_state)
         SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamptz[], $7::boolean[], $8::varchar[])
         ON CONFLICT (project_id, key_id, locale_id)
           DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at, pending_auto_translate = false, quality_review_state = 'not_checked'`,
        [
          values.map((v) => v.projectId),
          values.map((v) => v.keyId),
          values.map((v) => v.localeId),
          values.map((v) => v.value),
          values.map(() => false),
          values.map(() => new Date()),
          values.map(() => false),
          values.map(() => 'not_checked'),
        ],
      );

      // Mark project as having sandbox changes
      await this.projectRepo.update(projectId, { sandboxHasChanges: true });
    }

    // Clear pending flags for ALL requested locales (handles partial Gemini responses)
    await this.dataSource
      .query(
        `UPDATE sandbox_values SET pending_auto_translate = false
         WHERE project_id = $1 AND key_id = $2 AND pending_auto_translate = true`,
        [projectId, keyId],
      )
      .catch(() => {});

    // Persist contextNeed from translate so quality worker does not overwrite it
    if (values.length) {
      if (contextNeed) {
        await this.dataSource.query(
          `UPDATE sandbox_values
           SET context_need = $1, context_reason = $2
           WHERE project_id = $3 AND key_id = $4`,
          [contextNeed, contextReason, projectId, keyId],
        );
      }
    }
  }

  /**
   * Translate a batch of keys in a single bulkTranslate call instead of N per-key calls.
   * Handles batch sandbox lookup to skip locales already present, builds a single UPSERT,
   * and persists contextNeed per key.
   */
  private async translateKeysBulk(
    projectId: string,
    keys: Array<{
      keyId: string;
      keyName: string;
      sourceText: string;
      context: string | null;
    }>,
    nonDefaultLocales: LocaleEntity[],
  ): Promise<void> {
    // Batch lookup existing sandbox values for all keys at once
    // Also load qualityComment and pendingAutoTranslate to pass as previousComment per key
    const allKeyIds = keys.map((k) => k.keyId);
    const existingSandbox = await this.sandboxRepo.find({
      where: { projectId, keyId: In(allKeyIds), isDeleted: false },
      select: [
        'keyId',
        'localeId',
        'value',
        'qualityComment',
        'pendingAutoTranslate',
      ],
    });

    // Group by keyId+localeId for fast lookup
    // pendingByKeyLocale tracks key+locale combos that need (re-)translation even if row exists
    const existingByKeyLocale = new Map<string, (typeof existingSandbox)[0]>();
    const qualityCommentByKey = new Map<string, string>();
    const pendingByKeyLocale = new Set<string>();
    for (const sv of existingSandbox) {
      existingByKeyLocale.set(`${sv.keyId}::${sv.localeId}`, sv);
      if (sv.qualityComment && !qualityCommentByKey.has(sv.keyId)) {
        qualityCommentByKey.set(sv.keyId, sv.qualityComment);
      }
      if (sv.pendingAutoTranslate) {
        pendingByKeyLocale.add(`${sv.keyId}::${sv.localeId}`);
      }
    }

    // Build entries array for bulkTranslate, filtering out keys where all locales already exist
    // A locale "needs translation" if: it has no row, OR value is null/empty, OR pending_auto_translate=true
    const entries: Array<{
      key: string;
      text: string;
      context?: string;
      targetLocales: string[];
      previousComment?: string;
    }> = [];
    const keyIdByName = new Map<string, string>(); // key name -> keyId for result mapping

    for (const k of keys) {
      const missingLocales = nonDefaultLocales.filter((l) => {
        const key = `${k.keyId}::${l.id}`;
        const existing = existingByKeyLocale.get(key);
        if (!existing) return true; // no row
        if (pendingByKeyLocale.has(key)) return true; // explicitly requested
        if (!existing.value) return true; // value is null or empty
        return false;
      });
      if (!missingLocales.length) continue;
      const previousComment = qualityCommentByKey.get(k.keyId);
      entries.push({
        key: k.keyName,
        text: k.sourceText,
        context: k.context ?? undefined,
        targetLocales: missingLocales.map((l) => l.code),
        ...(previousComment ? { previousComment } : {}),
      });
      keyIdByName.set(k.keyName, k.keyId);
    }

    if (!entries.length) return;

    // Build locale guidance from all nonDefaultLocales (shared across batch)
    const localeGuidance = nonDefaultLocales.reduce<Record<string, string>>(
      (acc, l) => {
        if (l.localeSkill) acc[l.code] = l.localeSkill;
        return acc;
      },
      {},
    );

    // Single bulkTranslate call for the whole batch
    const { results, contextInfo } =
      await this.aiTranslateService.bulkTranslate(
        entries,
        projectId,
        Object.keys(localeGuidance).length ? localeGuidance : undefined,
      );

    // Build UPSERT values from results, mapping key names back to keyIds
    const values: Partial<SandboxValueEntity>[] = [];
    for (const entry of entries) {
      const keyId = keyIdByName.get(entry.key)!;
      const keyResults = results[entry.key];
      if (!keyResults) continue;
      const missingLocales = nonDefaultLocales.filter((l) =>
        entry.targetLocales.includes(l.code),
      );
      for (const locale of missingLocales) {
        // Gemini may normalise e.g. "nb-NO" → "nb"; fall back to primary subtag
        const translated =
          keyResults[locale.code] ?? keyResults[locale.code.split('-')[0]];
        if (!translated) continue;
        values.push({
          projectId,
          keyId,
          localeId: locale.id,
          value: translated,
          isDeleted: false,
        });
      }
    }

    if (values.length) {
      await this.dataSource.query(
        `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at, pending_auto_translate, quality_review_state)
         SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::boolean[], $6::timestamptz[], $7::boolean[], $8::varchar[])
         ON CONFLICT (project_id, key_id, locale_id)
           DO UPDATE SET value = EXCLUDED.value, is_deleted = false, updated_at = EXCLUDED.updated_at, pending_auto_translate = false, quality_review_state = 'not_checked'`,
        [
          values.map((v) => v.projectId),
          values.map((v) => v.keyId),
          values.map((v) => v.localeId),
          values.map((v) => v.value),
          values.map(() => false),
          values.map(() => new Date()),
          values.map(() => false),
          values.map(() => 'not_checked'),
        ],
      );
      await this.projectRepo.update(projectId, { sandboxHasChanges: true });
    }

    // Clear pending flags for ALL requested keys (handles partial Gemini responses
    // where some locales were omitted — avoids infinite spinners)
    await this.dataSource
      .query(
        `UPDATE sandbox_values SET pending_auto_translate = false
         WHERE project_id = $1 AND key_id = ANY($2) AND pending_auto_translate = true`,
        [projectId, allKeyIds],
      )
      .catch(() => {});

    // Persist contextNeed per key (batch UPDATE for all keys that have contextInfo)
    for (const entry of entries) {
      const ctx = contextInfo[entry.key];
      if (ctx?.need) {
        const keyId = keyIdByName.get(entry.key)!;
        await this.dataSource.query(
          `UPDATE sandbox_values SET context_need = $1, context_reason = $2 WHERE project_id = $3 AND key_id = $4`,
          [ctx.need, ctx.reason, projectId, keyId],
        );
      }
    }
  }
}
