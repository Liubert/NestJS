import type { QualityInfo, RawQualityRow } from '../types/entry.types.js';

// ─── Quality mapping ─────────────────────────────────────────────────────────

/**
 * Groups raw quality rows (from translation_values) into a per-key map.
 * Locale is resolved via `locale` field (already a code string).
 */
export function groupQualityByKey(
  rows: RawQualityRow[],
): Map<string, Record<string, QualityInfo | null>> {
  const map = new Map<string, Record<string, QualityInfo | null>>();
  for (const q of rows) {
    if (!map.has(q.key_id)) map.set(q.key_id, {});
    map.get(q.key_id)![q.locale] = mapRawToQualityInfo(q);
  }
  return map;
}

/**
 * Same as groupQualityByKey but resolves locale from an id→code map.
 * Used by translations.service (TypeORM QB returns locale_id, not code).
 */
export function groupQualityByKeyWithLocaleMap(
  rows: {
    key_id: string;
    locale_id: string;
    value: string | null;
    quality_score: number | null;
    quality_level: string | null;
    quality_comment: string | null;
    quality_checked_at: string | null;
    quality_review_state: string | null;
  }[],
  localeMap: Map<string, string>,
): {
  valuesByKey: Map<string, Record<string, string>>;
  qualityByKey: Map<string, Record<string, QualityInfo | null>>;
} {
  const valuesByKey = new Map<string, Record<string, string>>();
  const qualityByKey = new Map<string, Record<string, QualityInfo | null>>();

  for (const v of rows) {
    const locale = localeMap.get(v.locale_id);
    if (!locale) continue;

    if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
    if (!qualityByKey.has(v.key_id)) qualityByKey.set(v.key_id, {});

    valuesByKey.get(v.key_id)![locale] = v.value ?? '';
    qualityByKey.get(v.key_id)![locale] = mapRawToQualityInfo(v);
  }

  return { valuesByKey, qualityByKey };
}

function mapRawToQualityInfo(row: {
  quality_score: number | null;
  quality_level: string | null;
  quality_comment: string | null;
  quality_checked_at: string | null;
  quality_review_state: string | null;
}): QualityInfo {
  return {
    reviewState: (row.quality_review_state ??
      'not_checked') as QualityInfo['reviewState'],
    score: row.quality_score,
    level: row.quality_level as QualityInfo['level'],
    comment: row.quality_comment,
    checkedAt: row.quality_checked_at,
  };
}

// ─── Values grouping ─────────────────────────────────────────────────────────

/**
 * Groups raw value rows (key_id, locale, value) into a per-key values map.
 * Used by sandbox.service (raw SQL returns locale code directly).
 */
export function groupValuesByKey(
  rows: { key_id: string; locale: string; value: string | null }[],
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const v of rows) {
    if (!map.has(v.key_id)) map.set(v.key_id, {});
    if (v.value != null) map.get(v.key_id)![v.locale] = v.value;
  }
  return map;
}
