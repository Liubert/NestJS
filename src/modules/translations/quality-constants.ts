/** System-owned scoring thresholds. NOT editable via config or prompts. */
export const GREEN_MIN_SCORE = 90;
export const YELLOW_MIN_SCORE = 80;

/** Score cap when contextNeed='required' but context is missing */
export const CONTEXT_REQUIRED_CAP = GREEN_MIN_SCORE - 1; // 89

/** Score cap when contextNeed='useful' but context is missing (soft — still green) */
export const CONTEXT_USEFUL_CAP = 94;

export type ContextNeed = 'required' | 'useful' | 'none';

export type QualityLevel = 'green' | 'yellow' | 'red' | 'expected';

export function scoreToLevel(score: number): 'green' | 'yellow' | 'red' {
  if (score >= GREEN_MIN_SCORE) return 'green';
  if (score >= YELLOW_MIN_SCORE) return 'yellow';
  return 'red';
}
