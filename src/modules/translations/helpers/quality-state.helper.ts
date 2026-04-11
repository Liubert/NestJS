/**
 * Quality state presets — centralized field values for quality state transitions.
 * Used by translations.service, sandbox.service, and quality-worker.service.
 */

import type { ReviewState, QualityLevel } from '../constants/quality.const.js';

export interface QualityFields {
  qualityReviewState: ReviewState;
  qualityScore: number | null;
  qualityLevel: QualityLevel | null;
  qualityComment: string | null;
  qualityCheckedAt: Date | null;
}

/** Fields for marking a translation as "expected" (manually accepted). */
export function expectedQualityFields(): QualityFields {
  return {
    qualityReviewState: 'expected',
    qualityScore: 100,
    qualityLevel: 'expected',
    qualityComment: null,
    qualityCheckedAt: new Date(),
  };
}

/** Fields for resetting quality to unchecked state. */
export function resetQualityFields(): QualityFields {
  return {
    qualityReviewState: 'not_checked',
    qualityScore: null,
    qualityLevel: null,
    qualityComment: null,
    qualityCheckedAt: null,
  };
}

/** Fields for persisting an AI quality check result. */
export function checkedQualityFields(result: {
  score: number;
  level: 'green' | 'yellow' | 'red';
  comment: string;
}): QualityFields {
  return {
    qualityReviewState: 'checked',
    qualityScore: result.score,
    qualityLevel: result.level,
    qualityComment: result.comment,
    qualityCheckedAt: new Date(),
  };
}
