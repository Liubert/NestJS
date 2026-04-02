/** System-owned scoring thresholds. NOT editable via config or prompts. */
export const GREEN_MIN_SCORE = 90;
export const YELLOW_MIN_SCORE = 80;

/** Score cap when contextRequired=true but context is missing */
export const CONTEXT_MISSING_CAP = GREEN_MIN_SCORE - 1; // 89

export type QualityLevel = 'green' | 'yellow' | 'red' | 'expected';

export function scoreToLevel(score: number): 'green' | 'yellow' | 'red' {
  if (score >= GREEN_MIN_SCORE) return 'green';
  if (score >= YELLOW_MIN_SCORE) return 'yellow';
  return 'red';
}
