import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
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
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
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
    this.logger.log('Quality worker polling started (every 30s)');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollAndProcess(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const rows = await this.dataSource.query<
        { project_id: string; key_id: string }[]
      >(
        `SELECT DISTINCT ns.project_id, tv.key_id
         FROM translation_values tv
         JOIN translation_keys tk ON tk.id = tv.key_id
         JOIN translation_namespaces ns ON ns.id = tk.namespace_id
         WHERE tv.quality_review_state IN ('not_checked', 'failed', 'skipped')
           AND tv.value IS NOT NULL
         LIMIT $1`,
        [MAX_KEYS_PER_CYCLE],
      );

      if (!rows.length) {
        this.logger.debug('No keys need quality check');
        return;
      }

      this.logger.log(`Found ${rows.length} keys to check`);

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
        this.logger.log(`Quality check: processed ${totalProcessed} keys`);
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

    // Mark as processing
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({ qualityReviewState: 'processing' })
      .where(
        'key_id IN (:...keyIds) AND quality_review_state IN (:...states)',
        {
          keyIds,
          states: ['not_checked', 'failed', 'skipped'],
        },
      )
      .execute();

    // Load project locales
    const projectLocales = await this.localeRepo.findBy({ projectId });
    if (!projectLocales.length) {
      await this.setStateForKeys(keyIds, 'failed');
      return;
    }
    const defaultLocale = projectLocales.find((l) => l.isDefault);
    const localeById = new Map(projectLocales.map((l) => [l.id, l]));

    // Load key entities (including context and contextNeed)
    const keys = await this.keyRepo.findBy({ id: In(keyIds) });
    const keyById = new Map(keys.map((k) => [k.id, k]));

    // Load values
    const values = await this.valueRepo
      .createQueryBuilder('tv')
      .where('tv.key_id IN (:...keyIds)', { keyIds })
      .select([
        'tv.key_id AS key_id',
        'tv.locale_id AS locale_id',
        'tv.value AS value',
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
      await this.setStateForKeys(keyIds, 'checked');
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
      await this.setStateForKeys(keyIds, 'failed');
      return;
    }

    // Persist contextNeed/contextReason and apply context penalties
    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      if (!keyEntity) continue;

      const info = contextInfo[keyEntity.key];
      if (info) {
        const needChanged = keyEntity.contextNeed !== info.need;
        const reasonChanged = keyEntity.contextReason !== info.reason;
        if (needChanged || reasonChanged) {
          keyEntity.contextNeed = info.need;
          keyEntity.contextReason = info.reason;
          await this.keyRepo.save(keyEntity);
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

    // Persist results per key×locale
    const now = new Date();
    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      const valMap = valuesByKey.get(keyId);
      const keyResult = keyEntity ? results[keyEntity.key] : undefined;

      // Mark skipped keys (chunk timed out — not evaluated by AI)
      if (keyEntity && allSkippedKeys.has(keyEntity.key)) {
        if (valMap) {
          for (const [localeId] of valMap.entries()) {
            await this.valueRepo.update(
              { keyId, localeId },
              {
                qualityReviewState: 'skipped',
                qualityScore: 100,
                qualityLevel: null,
                qualityComment:
                  'Quality check skipped — AI timed out on this chunk',
                qualityCheckedAt: now,
              },
            );
          }
        }
        continue;
      }

      if (!keyResult) {
        if (valMap) {
          for (const [localeId] of valMap.entries()) {
            await this.valueRepo.update(
              { keyId, localeId },
              { qualityReviewState: 'failed' },
            );
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

        await this.valueRepo.update(
          { keyId, localeId: locale.id },
          {
            qualityScore: r.score,
            qualityLevel: r.level,
            qualityComment: r.comment,
            qualityCheckedAt: now,
            qualityReviewState: 'checked',
            qualityContentHash: hash,
          },
        );
      }

      // Mark any locales missing from results as failed
      if (valMap) {
        for (const [localeId] of valMap.entries()) {
          if (!checkedLocaleIds.has(localeId)) {
            await this.valueRepo.update(
              { keyId, localeId },
              { qualityReviewState: 'failed' },
            );
          }
        }
      }
    }
  }

  private async setStateForKeys(
    keyIds: string[],
    state: 'checked' | 'failed',
  ): Promise<void> {
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({ qualityReviewState: state })
      .where('key_id IN (:...keyIds)', { keyIds })
      .execute();
  }
}
