import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { hashSha256 } from '../../common/utils/hash.util.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import {
  CONTEXT_REQUIRED_FACTOR,
  CONTEXT_USEFUL_FACTOR,
  scoreToLevel,
} from './quality-constants.js';
import {
  CheckedResult,
  ContextNeedUpdate,
  QualityRow,
  QualityWorkerQueries,
} from './quality-worker.queries.js';

// Worker polls DB every 15s, sends unchecked translations to Gemini,
// and persists quality scores back to sandbox_values.
const POLL_MS = 15_000;
const AI_CHUNK_SIZE = 5; // items per single Gemini request

@Injectable()
export class QualityWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(QualityWorkerService.name);
  private stopped = false;

  constructor(
    private readonly ai: AiTranslateService,
    private readonly queries: QualityWorkerQueries,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  onApplicationBootstrap(): void {
    void this.run();
    this.logger.log('Quality worker started');
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  // ─── Main loop ──────────────────────────────────────────────────────────────
  // Simple while-loop: process one batch → sleep → repeat.
  // Single-instance worker, no concurrency guard needed.

  private async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.tick();
      } catch (e) {
        this.logger.error(
          `Poll error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      await sleep(POLL_MS);
    }
  }

  // ─── Single iteration ──────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    const rows = await this.queries.getRowsNeedingReview();
    if (!rows.length) return;

    // Group by project — AI usage accounting is per-project
    const byProject = groupBy(rows, (r) => r.project_id);

    for (const [projectId, projectRows] of byProject) {
      try {
        await this.checkProject(projectId, projectRows);
      } catch (e) {
        this.logger.error(
          `Project ${projectId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        const keyIds = uniqueIds(projectRows, (r) => r.key_id);
        await this.queries.setKeysState(projectId, keyIds, 'failed');
      }
    }
  }

  // ─── Process one project ───────────────────────────────────────────────────
  private async checkProject(
    projectId: string,
    rows: QualityRow[],
  ): Promise<void> {
    // Group by key — AI expects: source + all target locales per key
    const byKey = groupBy(rows, (r) => r.key_id);

    // Build AI payload
    const { items, localeGuidance } = buildAiPayload(byKey);
    if (!items.length) return;

    // Call Gemini
    const { results, contextInfo, skippedKeys } =
      await this.ai.bulkCheckQuality(
        items,
        AI_CHUNK_SIZE,
        0,
        projectId,
        Object.keys(localeGuidance).length ? localeGuidance : undefined,
      );

    // Reduce scores where context is needed but missing
    applyContextPenalty(byKey, results, contextInfo);

    // Persist everything back to DB
    const now = new Date();
    const { checked, skippedIds } = collectResults(
      byKey,
      results,
      new Set(skippedKeys),
    );

    await this.queries.saveCheckedScores(projectId, checked, now);
    await this.queries.markKeysSkipped(projectId, skippedIds, now);
    await this.queries.saveContextNeed(
      projectId,
      collectContextNeedUpdates(byKey, contextInfo),
    );
  }
}

// ─── Pure helpers (no DB, no side effects) ──────────────────────────────────

function buildAiPayload(byKey: Map<string, QualityRow[]>): {
  items: Array<{
    key: string;
    source: string | null;
    context: string | null;
    translations: Record<string, string>;
  }>;
  localeGuidance: Record<string, string>;
} {
  const items: Array<{
    key: string;
    source: string | null;
    context: string | null;
    translations: Record<string, string>;
  }> = [];
  const localeGuidance: Record<string, string> = {};

  for (const [, keyRows] of byKey) {
    const source = keyRows.find((r) => r.is_default)?.value ?? null;
    const toCheck = keyRows.filter(
      (r) => !r.is_default && needsReview(r.quality_review_state),
    );
    if (!toCheck.length) continue;

    const translations: Record<string, string> = {};
    for (const r of toCheck) {
      translations[r.locale_code] = r.value;
      if (r.locale_skill) localeGuidance[r.locale_code] = r.locale_skill;
    }

    items.push({
      key: keyRows[0].key_name,
      source,
      context: keyRows.find((r) => r.context)?.context ?? null,
      translations,
    });
  }

  return { items, localeGuidance };
}

/** Reduce scores when AI says context is needed but key has none. */
function applyContextPenalty(
  byKey: Map<string, QualityRow[]>,
  results: Record<
    string,
    Record<string, { score: number; level: string; comment: string }>
  >,
  contextInfo: Record<string, { need: string; reason: string | null }>,
): void {
  for (const [, keyRows] of byKey) {
    const name = keyRows[0].key_name;
    const info = contextInfo[name];
    const keyResult = results[name];
    if (!info || !keyResult || info.need === 'none') continue;
    if (keyRows.some((r) => r.context)) continue;

    const factor =
      info.need === 'required'
        ? CONTEXT_REQUIRED_FACTOR
        : CONTEXT_USEFUL_FACTOR;
    const note = info.reason
      ? `Context ${info.need}: ${info.reason}`
      : info.need === 'required'
        ? 'Context is required but missing — confidence reduced.'
        : 'Context would improve this evaluation — consider adding it.';

    for (const r of Object.values(keyResult)) {
      r.score = Math.max(1, Math.round(r.score * factor));
      r.level = scoreToLevel(r.score);
      r.comment = r.comment ? `${r.comment} ${note}` : note;
    }
  }
}

/** Map AI results → flat arrays ready for DB persist. */
function collectResults(
  byKey: Map<string, QualityRow[]>,
  results: Record<
    string,
    Record<string, { score: number; level: string; comment: string }>
  >,
  skippedKeys: Set<string>,
): { checked: CheckedResult[]; skippedIds: string[] } {
  const checked: CheckedResult[] = [];
  const skippedIds: string[] = [];

  for (const [keyId, keyRows] of byKey) {
    const name = keyRows[0].key_name;

    if (skippedKeys.has(name)) {
      skippedIds.push(keyId);
      continue;
    }

    const keyResult = results[name];
    if (!keyResult) continue;

    for (const [code, r] of Object.entries(keyResult)) {
      const match = keyRows.find((kr) => kr.locale_code === code);
      if (!match) continue;
      checked.push({
        keyId,
        localeId: match.locale_id,
        score: r.score,
        level: r.level,
        comment: r.comment,
        hash: hashSha256(match.value),
      });
    }
  }

  return { checked, skippedIds };
}

/** Collect keys that need context_need metadata saved. */
function collectContextNeedUpdates(
  byKey: Map<string, QualityRow[]>,
  contextInfo: Record<string, { need: string; reason: string | null }>,
): ContextNeedUpdate[] {
  const updates: ContextNeedUpdate[] = [];
  for (const [keyId, keyRows] of byKey) {
    const info = contextInfo[keyRows[0].key_name];
    if (!info?.need || info.need === 'none') continue;
    updates.push({ keyId, need: info.need, reason: info.reason });
  }
  return updates;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function needsReview(state: string): boolean {
  return state === 'not_checked' || state === 'failed' || state === 'skipped';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push(item);
  }
  return map;
}

function uniqueIds<T>(items: T[], key: (item: T) => string): string[] {
  return [...new Set(items.map(key))];
}
