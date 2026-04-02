import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { AiTranslateService } from './ai-translate.service.js';
import {
  QualityQueueService,
  QualityBatchMessage,
} from './quality-queue.service.js';
import {
  CONTEXT_REQUIRED_CAP,
  CONTEXT_USEFUL_CAP,
  scoreToLevel,
} from './quality-constants.js';

@Injectable()
export class QualityWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QualityWorkerService.name);

  constructor(
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly aiTranslateService: AiTranslateService,
    private readonly qualityQueue: QualityQueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.qualityQueue.consumeBatches((msg) => this.handleBatch(msg));
    this.logger.log('Quality worker consuming batches');
  }

  private async handleBatch(msg: QualityBatchMessage): Promise<void> {
    const { keyIds, projectId } = msg;
    if (!keyIds.length) return;

    // Mark as processing (only rows currently queued)
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({ qualityReviewState: 'processing' })
      .where('key_id IN (:...keyIds) AND quality_review_state = :state', {
        keyIds,
        state: 'queued',
      })
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

    // Build items for bulk quality check — now includes context
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
      throw e;
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
