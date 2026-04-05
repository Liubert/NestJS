import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { AiTranslateService } from './ai-translate.service.js';
import {
  CONTEXT_REQUIRED_CAP,
  CONTEXT_USEFUL_CAP,
  scoreToLevel,
} from './quality-constants.js';

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 5;
const MAX_KEYS_PER_CYCLE = 50;

@Injectable()
export class QualityWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(QualityWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly aiTranslateService: AiTranslateService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.pollAndProcess();
    }, POLL_INTERVAL_MS);
    this.logger.log('Quality worker polling started (sandbox, every 30s)');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Immediately trigger a quality check cycle, bypassing the 30s interval.
   * If a cycle is already in progress, returns without waiting.
   * Fire-and-forget safe — callers need not await.
   */
  triggerNow(): void {
    void this.pollAndProcess();
  }

  private async pollAndProcess(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // Fix stuck: null/empty values should never be processing or not_checked
      await this.dataSource.query(
        `UPDATE sandbox_values
         SET quality_review_state = 'checked'
         WHERE (value IS NULL OR value = '')
           AND quality_review_state IN ('not_checked', 'processing', 'failed', 'skipped')`,
      );

      const rows = await this.dataSource.query<
        { project_id: string; key_id: string }[]
      >(
        `SELECT DISTINCT sv.project_id, sv.key_id
         FROM sandbox_values sv
         WHERE sv.quality_review_state IN ('not_checked', 'failed', 'skipped')
           AND sv.value IS NOT NULL
           AND sv.is_deleted = false
         LIMIT $1`,
        [MAX_KEYS_PER_CYCLE],
      );

      if (!rows.length) {
        this.logger.debug('No sandbox keys need quality check');
        return;
      }

      this.logger.log(`Found ${rows.length} sandbox keys to check`);

      // Group by project
      const byProject = new Map<string, string[]>();
      for (const row of rows) {
        if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
        byProject.get(row.project_id)!.push(row.key_id);
      }

      let totalProcessed = 0;

      for (const [projectId, projectKeyIds] of byProject) {
        for (let i = 0; i < projectKeyIds.length; i += BATCH_SIZE) {
          const batch = projectKeyIds.slice(i, i + BATCH_SIZE);
          try {
            await this.processBatch(projectId, batch);
            totalProcessed += batch.length;
          } catch (e: unknown) {
            this.logger.error(
              `Batch failed for project ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }

      if (totalProcessed > 0) {
        this.logger.log(
          `Quality check: processed ${totalProcessed} sandbox keys`,
        );
      }
    } catch (e: unknown) {
      this.logger.error(
        `Quality poll error: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processBatch(
    projectId: string,
    keyIds: string[],
  ): Promise<void> {
    if (!keyIds.length) return;

    // Mark as processing in sandbox (only non-null values)
    await this.sandboxRepo
      .createQueryBuilder()
      .update()
      .set({ qualityReviewState: 'processing' })
      .where(
        'project_id = :projectId AND key_id IN (:...keyIds) AND quality_review_state IN (:...states) AND value IS NOT NULL',
        {
          projectId,
          keyIds,
          states: ['not_checked', 'failed', 'skipped'],
        },
      )
      .execute();

    // Load project locales
    const projectLocales = await this.localeRepo.findBy({ projectId });
    if (!projectLocales.length) {
      await this.setStateForKeys(projectId, keyIds, 'failed');
      return;
    }
    const defaultLocale = projectLocales.find((l) => l.isDefault);
    const localeById = new Map(projectLocales.map((l) => [l.id, l]));

    // Build locale guidance map for AI quality checks
    const localeGuidance = projectLocales.reduce<Record<string, string>>(
      (acc, l) => {
        if (l.guidance) acc[l.code] = l.guidance;
        return acc;
      },
      {},
    );
    const guidanceParam = Object.keys(localeGuidance).length
      ? localeGuidance
      : undefined;

    // Load key entities (including context and contextNeed)
    const keys = await this.keyRepo.findBy({ id: In(keyIds) });
    const keyById = new Map(keys.map((k) => [k.id, k]));

    // Load sandbox values
    const values = await this.sandboxRepo
      .createQueryBuilder('sv')
      .where(
        'sv.project_id = :projectId AND sv.key_id IN (:...keyIds) AND sv.is_deleted = false',
        {
          projectId,
          keyIds,
        },
      )
      .select([
        'sv.key_id AS key_id',
        'sv.locale_id AS locale_id',
        'sv.value AS value',
      ])
      .getRawMany<{
        key_id: string;
        locale_id: string;
        value: string | null;
      }>();

    // Group values by key
    const valuesByKey = new Map<string, Map<string, string>>();
    for (const v of values) {
      if (!v.value) continue;
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, new Map());
      valuesByKey.get(v.key_id)!.set(v.locale_id, v.value);
    }

    // Build items for bulk quality check
    const items: Array<{
      key: string;
      source: string | null;
      context: string | null;
      translations: Record<string, string>;
    }> = [];
    const defaultItems: Array<{
      key: string;
      source: string | null;
      context: string | null;
      translations: Record<string, string>;
    }> = [];

    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      const valMap = valuesByKey.get(keyId);
      if (!keyEntity || !valMap) continue;

      const source = defaultLocale
        ? (valMap.get(defaultLocale.id) ?? null)
        : null;
      const context = keyEntity.context;
      const translations: Record<string, string> = {};
      let defaultValue: string | undefined;
      for (const [localeId, value] of valMap.entries()) {
        const locale = localeById.get(localeId);
        if (!locale) continue;
        if (locale.isDefault) {
          defaultValue = value;
        } else {
          translations[locale.code] = value;
        }
      }

      if (Object.keys(translations).length) {
        items.push({ key: keyEntity.key, source, context, translations });
      }
      if (defaultLocale && defaultValue) {
        defaultItems.push({
          key: keyEntity.key,
          source: null,
          context,
          translations: { [defaultLocale.code]: defaultValue },
        });
      }
    }

    if (!items.length && !defaultItems.length) {
      await this.setStateForKeys(projectId, keyIds, 'checked');
      return;
    }

    let results: Record<
      string,
      Record<
        string,
        { score: number; level: 'green' | 'yellow' | 'red'; comment: string }
      >
    >;
    let contextInfo: Record<
      string,
      { need: 'required' | 'useful' | 'none'; reason: string | null }
    >;
    let allSkippedKeys = new Set<string>();

    try {
      const emptyResult = {
        results: {},
        contextInfo: {},
        skippedKeys: [] as string[],
      };
      const [mainResult, defaultResult] = await Promise.all([
        items.length
          ? this.aiTranslateService.bulkCheckQuality(
              items,
              5,
              90_000,
              projectId,
              guidanceParam,
            )
          : Promise.resolve(emptyResult),
        defaultItems.length
          ? this.aiTranslateService.bulkCheckQuality(
              defaultItems,
              5,
              90_000,
              projectId,
            )
          : Promise.resolve(emptyResult),
      ]);
      results = { ...mainResult.results };
      contextInfo = {
        ...mainResult.contextInfo,
        ...defaultResult.contextInfo,
      };
      for (const [key, localeMap] of Object.entries(defaultResult.results)) {
        results[key] = Object.assign({}, results[key] ?? {}, localeMap);
      }
      allSkippedKeys = new Set([
        ...mainResult.skippedKeys,
        ...defaultResult.skippedKeys,
      ]);
    } catch (e: unknown) {
      this.logger.error(
        `Gemini failed for batch: ${e instanceof Error ? e.message : String(e)}`,
      );
      await this.setStateForKeys(projectId, keyIds, 'failed');
      return;
    }

    // Persist contextNeed/contextReason to both sandbox_values and translation_keys
    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      if (!keyEntity) continue;

      const info = contextInfo[keyEntity.key];
      if (info) {
        const needChanged = keyEntity.contextNeed !== info.need;
        const reasonChanged = keyEntity.contextReason !== info.reason;
        if (needChanged || reasonChanged) {
          // Update translation_keys (source of truth for context metadata)
          keyEntity.contextNeed = info.need;
          keyEntity.contextReason = info.reason;
          await this.keyRepo.save(keyEntity);

          // Update sandbox_values for this key
          await this.sandboxRepo
            .createQueryBuilder()
            .update()
            .set({ contextNeed: info.need, contextReason: info.reason })
            .where('project_id = :projectId AND key_id = :keyId', {
              projectId,
              keyId,
            })
            .execute();
        }
      }

      // Apply context penalty when context is missing
      const keyResult = results[keyEntity.key];
      const need = info?.need ?? keyEntity.contextNeed;
      if (need && need !== 'none' && !keyEntity.context && keyResult) {
        const cap =
          need === 'required' ? CONTEXT_REQUIRED_CAP : CONTEXT_USEFUL_CAP;
        const note =
          need === 'required'
            ? 'Context is required but missing — confidence reduced.'
            : 'Context would improve this evaluation — consider adding it.';
        for (const [, r] of Object.entries(keyResult)) {
          if (r.score > cap) {
            r.score = cap;
            r.level = scoreToLevel(cap);
            r.comment = r.comment ? `${r.comment} ${note}` : note;
          }
        }
      }
    }

    // Persist results per key×locale in sandbox
    const now = new Date();
    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      const valMap = valuesByKey.get(keyId);
      const keyResult = keyEntity ? results[keyEntity.key] : undefined;

      // Mark skipped keys (chunk timed out — not evaluated by AI)
      if (keyEntity && allSkippedKeys.has(keyEntity.key)) {
        if (valMap) {
          for (const [localeId] of valMap.entries()) {
            await this.sandboxRepo
              .createQueryBuilder()
              .update()
              .set({
                qualityReviewState: 'skipped',
                qualityScore: 100,
                qualityLevel: null,
                qualityComment:
                  'Quality check skipped — AI timed out on this chunk',
                qualityCheckedAt: now,
              })
              .where(
                'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
                { projectId, keyId, localeId },
              )
              .execute();
          }
        }
        continue;
      }

      if (!keyResult) {
        if (valMap) {
          for (const [localeId] of valMap.entries()) {
            await this.sandboxRepo
              .createQueryBuilder()
              .update()
              .set({ qualityReviewState: 'failed' })
              .where(
                'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
                { projectId, keyId, localeId },
              )
              .execute();
          }
        }
        continue;
      }

      const checkedLocaleIds = new Set<string>();
      for (const [localeCode, r] of Object.entries(keyResult)) {
        const locale = projectLocales.find((l) => l.code === localeCode);
        if (!locale || !valMap) continue;
        checkedLocaleIds.add(locale.id);
        const value = valMap.get(locale.id);
        const hash = value
          ? createHash('sha256').update(value).digest('hex')
          : null;

        await this.sandboxRepo
          .createQueryBuilder()
          .update()
          .set({
            qualityScore: r.score,
            qualityLevel: r.level,
            qualityComment: r.comment,
            qualityCheckedAt: now,
            qualityReviewState: 'checked',
            qualityContentHash: hash,
          })
          .where(
            'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
            { projectId, keyId, localeId: locale.id },
          )
          .execute();
      }

      // Mark any locales missing from results as failed
      if (valMap) {
        for (const [localeId] of valMap.entries()) {
          if (!checkedLocaleIds.has(localeId)) {
            await this.sandboxRepo
              .createQueryBuilder()
              .update()
              .set({ qualityReviewState: 'failed' })
              .where(
                'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
                { projectId, keyId, localeId },
              )
              .execute();
          }
        }
      }
    }
  }

  private async setStateForKeys(
    projectId: string,
    keyIds: string[],
    state: 'checked' | 'failed',
  ): Promise<void> {
    await this.sandboxRepo
      .createQueryBuilder()
      .update()
      .set({ qualityReviewState: state })
      .where('project_id = :projectId AND key_id IN (:...keyIds)', {
        projectId,
        keyIds,
      })
      .execute();
  }
}
