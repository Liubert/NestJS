/** System-owned scoring thresholds. NOT editable via config or prompts. */
export const GREEN_MIN_SCORE = 90;
export const YELLOW_MIN_SCORE = 80;

/** Score multiplier when contextNeed='required' but context is missing */
export const CONTEXT_REQUIRED_FACTOR = 0.5;

/** Score multiplier when contextNeed='useful' but context is missing */
export const CONTEXT_USEFUL_FACTOR = 0.75;

export type ContextNeed = 'required' | 'useful' | 'none';

export type QualityLevel = 'green' | 'yellow' | 'red' | 'expected';

export function scoreToLevel(score: number): 'green' | 'yellow' | 'red' {
  if (score >= GREEN_MIN_SCORE) return 'green';
  if (score >= YELLOW_MIN_SCORE) return 'yellow';
  return 'red';
}
