// ─── Quality check modes ─────────────────────────────────────────────────────

export const QUALITY_MODE_TRANSLATION = 'translation_quality' as const;
export const QUALITY_MODE_LANGUAGE = 'language_quality' as const;
export const QUALITY_MODES = [
  QUALITY_MODE_TRANSLATION,
  QUALITY_MODE_LANGUAGE,
] as const;
export type QualityMode = (typeof QUALITY_MODES)[number];

// ─── Quality review states ───────────────────────────────────────────────────

export const REVIEW_STATES = [
  'not_checked',
  'processing',
  'checked',
  'expected',
  'failed',
  'skipped',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

// ─── Quality levels ──────────────────────────────────────────────────────────

export const QUALITY_LEVELS = ['green', 'yellow', 'red', 'expected'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
