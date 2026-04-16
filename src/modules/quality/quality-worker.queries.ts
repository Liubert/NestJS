import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const MAX_KEYS_PER_TICK = 50;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QualityRow {
  project_id: string;
  key_id: string;
  key_name: string;
  locale_id: string;
  locale_code: string;
  is_default: boolean;
  locale_skill: string | null;
  value: string;
  context: string | null;
  quality_review_state: string;
}

export interface CheckedResult {
  keyId: string;
  localeId: string;
  score: number;
  level: string;
  comment: string;
  hash: string;
}

export interface ContextNeedUpdate {
  keyId: string;
  need: string;
  reason: string | null;
}

// ─── Repository ─────────────────────────────────────────────────────────────

@Injectable()
export class QualityWorkerQueries {
  constructor(private readonly ds: DataSource) {}

  /**
   * Fetch all locales for keys that have at least one locale needing review.
   * Returns ALL locales per key so AI can compare source ↔ translations.
   */
  async getRowsNeedingReview(): Promise<QualityRow[]> {
    return this.ds.query<QualityRow[]>(
      `SELECT sv.project_id, sv.key_id, tk.key AS key_name,
              sv.locale_id, tl.code AS locale_code,
              tl.is_default, tl.locale_skill,
              sv.value, sv.context,
              sv.quality_review_state
       FROM sandbox_values sv
       JOIN translation_keys tk ON tk.id = sv.key_id
       JOIN translation_locales tl
         ON tl.id = sv.locale_id AND tl.project_id = sv.project_id
       WHERE sv.is_deleted = false
         AND sv.value IS NOT NULL AND sv.value != ''
         AND sv.key_id IN (
           SELECT DISTINCT key_id FROM sandbox_values
           WHERE quality_review_state IN ('not_checked', 'failed', 'skipped')
             AND value IS NOT NULL AND value != ''
             AND is_deleted = false
           LIMIT $1
         )`,
      [MAX_KEYS_PER_TICK],
    );
  }

  /** Bulk-persist AI quality scores via UNNEST (one query, not N). */
  async saveCheckedScores(
    projectId: string,
    rows: CheckedResult[],
    now: Date,
  ): Promise<void> {
    if (!rows.length) return;
    await this.ds.query(
      `UPDATE sandbox_values sv
       SET quality_review_state = 'checked',
           quality_score = t.score, quality_level = t.level,
           quality_comment = t.comment, quality_content_hash = t.hash,
           quality_checked_at = $1
       FROM (SELECT * FROM UNNEST(
             $2::uuid[], $3::uuid[], $4::int[],
             $5::varchar[], $6::text[], $7::varchar[]
           ) AS t(key_id, locale_id, score, level, comment, hash)) t
       WHERE sv.project_id = $8
         AND sv.key_id = t.key_id AND sv.locale_id = t.locale_id`,
      [
        now,
        rows.map((r) => r.keyId),
        rows.map((r) => r.localeId),
        rows.map((r) => r.score),
        rows.map((r) => r.level),
        rows.map((r) => r.comment),
        rows.map((r) => r.hash),
        projectId,
      ],
    );

    // Notify SSE clients (works cross-process via PostgreSQL LISTEN/NOTIFY)
    await this.ds
      .query(`SELECT pg_notify('sse_events', $1)`, [
        JSON.stringify({ type: 'quality.changed', projectId }),
      ])
      .catch(() => {});
  }

  /** Mark keys where AI timed out — they'll be retried on next tick. */
  async markKeysSkipped(
    projectId: string,
    keyIds: string[],
    now: Date,
  ): Promise<void> {
    if (!keyIds.length) return;
    await this.ds.query(
      `UPDATE sandbox_values
       SET quality_review_state = 'skipped', quality_score = 100,
           quality_level = NULL, quality_comment = 'AI timed out',
           quality_checked_at = $1
       WHERE project_id = $2 AND key_id = ANY($3)
         AND quality_review_state != 'expected'`,
      [now, projectId, keyIds],
    );
  }

  /** Save AI-detected context_need per key (only where not already set). */
  async saveContextNeed(
    projectId: string,
    updates: ContextNeedUpdate[],
  ): Promise<void> {
    if (!updates.length) return;
    await this.ds.query(
      `UPDATE sandbox_values sv
       SET context_need = t.need, context_reason = t.reason
       FROM (SELECT * FROM UNNEST($1::uuid[], $2::varchar[], $3::text[])
             AS t(key_id, need, reason)) t
       WHERE sv.project_id = $4 AND sv.key_id = t.key_id
         AND sv.context_need IS NULL`,
      [
        updates.map((u) => u.keyId),
        updates.map((u) => u.need),
        updates.map((u) => u.reason),
        projectId,
      ],
    );
  }

  /** Set review state for all locales of given keys (e.g. mark as 'failed'). */
  async setKeysState(
    projectId: string,
    keyIds: string[],
    state: string,
  ): Promise<void> {
    if (!keyIds.length) return;
    await this.ds.query(
      `UPDATE sandbox_values SET quality_review_state = $1
       WHERE project_id = $2 AND key_id = ANY($3)
         AND quality_review_state != 'expected'`,
      [state, projectId, keyIds],
    );
  }
}
