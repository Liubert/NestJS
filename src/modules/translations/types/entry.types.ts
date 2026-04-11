// ─── Shared types for entry listing (production & sandbox) ───────────────────

export interface QualityInfo {
  reviewState:
    | 'not_checked'
    | 'queued'
    | 'processing'
    | 'checked'
    | 'expected'
    | 'failed';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | 'expected' | null;
  comment: string | null;
  checkedAt: string | null;
}

export interface EntryRow {
  key: string;
  createdAt: Date;
  context: string | null;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
}

/** Raw quality columns as returned by SELECT on translation_values */
export interface RawQualityRow {
  key_id: string;
  locale: string;
  quality_score: number | null;
  quality_level: string | null;
  quality_comment: string | null;
  quality_checked_at: string | null;
  quality_review_state: string | null;
}
