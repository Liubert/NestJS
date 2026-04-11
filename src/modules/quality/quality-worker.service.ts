import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { hashSha256 } from '../../common/utils/hash.util.js';
import { checkedQualityFields } from '../translations/helpers/quality-state.helper.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import {
  CONTEXT_REQUIRED_FACTOR,
  CONTEXT_USEFUL_FACTOR,
  scoreToLevel,
} from './quality-constants.js';

const POLL_INTERVAL_MS = Number(process.env.QUALITY_POLL_INTERVAL_MS ?? 10_000);
const BATCH_SIZE = 5;
const MAX_KEYS_PER_CYCLE = 50;

/**
 * Runs as a standalone process (quality-worker.main.ts) OR inside the API.
 * When QUALITY_WORKER_STANDALONE=true (set by the standalone entry point),
 * the in-API polling is disabled — the standalone process handles it.
 */
const IS_STANDALONE = process.env.QUALITY_WORKER_STANDALONE === 'true';

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
    if (IS_STANDALONE) {
      // Standalone process — always poll
      this.startPolling();
    } else if (!process.env.QUALITY_WORKER_DISABLED) {
      // API process — poll only if standalone worker is not deployed separately
      this.startPolling();
    } else {
      this.logger.log(
        'Quality worker polling disabled (handled by standalone process)',
      );
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private startPolling(): void {
    this.timer = setInterval(() => {
      void this.pollAndProcess();
    }, POLL_INTERVAL_MS);
    const mode = IS_STANDALONE ? 'standalone' : 'in-process';
    this.logger.log(
      `Quality worker polling started (${mode}, every ${POLL_INTERVAL_MS / 1000}s)`,
    );
  }

  /**
   * Immediately trigger a quality check cycle, bypassing the poll interval.
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

      // Atomically claim keys by setting state to 'processing' and returning them.
      // This prevents race conditions when multiple worker processes run concurrently.
      const rows = await this.dataSource.query<
        { project_id: string; key_id: string }[]
      >(
        `UPDATE sandbox_values
         SET quality_review_state = 'processing'
         WHERE id IN (
           SELECT DISTINCT ON (project_id, key_id) id
           FROM sandbox_values
           WHERE quality_review_state IN ('not_checked', 'failed', 'skipped')
             AND value IS NOT NULL
             AND is_deleted = false
           LIMIT $1
         )
         RETURNING DISTINCT project_id, key_id`,
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

    // Keys already claimed as 'processing' by pollAndProcess() atomic UPDATE RETURNING.
    // Mark remaining locales of the same keys as processing too.
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
        if (l.localeSkill) acc[l.code] = l.localeSkill;
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
        'sv.quality_comment AS quality_comment',
        'sv.context AS context',
      ])
      .getRawMany<{
        key_id: string;
        locale_id: string;
        value: string | null;
        quality_comment: string | null;
        context: string | null;
      }>();

    // Group values by key; also collect previous quality comments and sandbox context per key
    const valuesByKey = new Map<string, Map<string, string>>();
    const commentsByKey = new Map<string, string[]>();
    const sandboxContextByKey = new Map<string, string>();
    for (const v of values) {
      if (!v.value) continue;
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, new Map());
      valuesByKey.get(v.key_id)!.set(v.locale_id, v.value);
      if (v.quality_comment) {
        if (!commentsByKey.has(v.key_id)) commentsByKey.set(v.key_id, []);
        commentsByKey.get(v.key_id)!.push(v.quality_comment);
      }
      // Collect sandbox context — prefer first non-null value found
      if (v.context && !sandboxContextByKey.has(v.key_id)) {
        sandboxContextByKey.set(v.key_id, v.context);
      }
    }

    // Build items for bulk quality check (non-default locales only)
    const items: Array<{
      key: string;
      source: string | null;
      context: string | null;
      translations: Record<string, string>;
      previousComment?: string | null;
    }> = [];

    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      const valMap = valuesByKey.get(keyId);
      if (!keyEntity || !valMap) continue;

      const source = defaultLocale
        ? (valMap.get(defaultLocale.id) ?? null)
        : null;
      const context = sandboxContextByKey.get(keyId) ?? null;
      const translations: Record<string, string> = {};
      for (const [localeId, value] of valMap.entries()) {
        const locale = localeById.get(localeId);
        if (!locale || locale.isDefault) continue;
        translations[locale.code] = value;
      }

      const comments = commentsByKey.get(keyId) ?? [];
      const previousComment = comments.length ? comments.join('; ') : null;

      if (Object.keys(translations).length) {
        items.push({
          key: keyEntity.key,
          source,
          context,
          translations,
          previousComment,
        });
      }
    }

    if (!items.length) {
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
      // Standalone worker: no timeout (separate process, can wait as long as needed)
      // In-process: 90s per chunk to avoid blocking the API event loop
      const chunkTimeout = IS_STANDALONE ? 0 : 90_000;
      const mainResult = await this.aiTranslateService.bulkCheckQuality(
        items,
        5,
        chunkTimeout,
        projectId,
        guidanceParam,
      );
      results = { ...mainResult.results };
      contextInfo = { ...mainResult.contextInfo };
      allSkippedKeys = new Set(mainResult.skippedKeys);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      this.logger.error(
        `Gemini failed for batch [keys: ${keyIds.join(', ')}]: ${msg}`,
        stack,
      );
      await this.setStateForKeys(projectId, keyIds, 'failed');
      return;
    }

    // Persist contextNeed/contextReason to sandbox_values only
    for (const keyId of keyIds) {
      const keyEntity = keyById.get(keyId);
      if (!keyEntity) continue;

      const info = contextInfo[keyEntity.key];
      if (info) {
        // Only fill contextNeed when translate worker has not already set it —
        // translate-time signal is more reliable (no existing translations to bias Gemini)
        await this.dataSource.query(
          `UPDATE sandbox_values
           SET context_need = $1, context_reason = $2
           WHERE project_id = $3 AND key_id = $4 AND context_need IS NULL`,
          [info.need, info.reason, projectId, keyId],
        );
      }

      // Apply context penalty when context is missing — proportional reduction, min 1
      const keyResult = results[keyEntity.key];
      const need = info?.need ?? null;
      const effectiveContext = sandboxContextByKey.get(keyId) ?? null;
      if (need && need !== 'none' && !effectiveContext && keyResult) {
        const factor =
          need === 'required' ? CONTEXT_REQUIRED_FACTOR : CONTEXT_USEFUL_FACTOR;
        const note =
          need === 'required'
            ? 'Context is required but missing — confidence reduced.'
            : 'Context would improve this evaluation — consider adding it.';
        for (const [, r] of Object.entries(keyResult)) {
          r.score = Math.max(1, Math.round(r.score * factor));
          r.level = scoreToLevel(r.score);
          r.comment = r.comment ? `${r.comment} ${note}` : note;
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
        const hash = value ? hashSha256(value) : null;

        await this.sandboxRepo
          .createQueryBuilder()
          .update()
          .set({
            ...checkedQualityFields(r),
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
      .where(
        'project_id = :projectId AND key_id IN (:...keyIds) AND quality_review_state != :protected',
        {
          projectId,
          keyIds,
          protected: 'expected',
        },
      )
      .execute();
  }
}
