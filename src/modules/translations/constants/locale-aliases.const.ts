/**
 * Locale resolution helpers.
 *
 * After the locale-registry-consolidation migration, locale codes in the DB
 * are short ISO 639-1 (e.g. "nb", "da") while the `aliases` column holds
 * legacy BCP 47 forms (e.g. "nb-NO", "da-DK").
 *
 * `resolveLocaleCandidates` returns all code variants that could match a
 * locale in the DB — the original input, its lowercase form, and any
 * known aliases in both directions.
 */
const LOCALE_ALIASES: Record<string, string[]> = {
  no: ['nb-NO', 'nb'],
  nb: ['nb-NO'],
  'nb-no': ['nb'],
  da: ['da-DK'],
  'da-dk': ['da'],
  nn: ['nb-NO', 'nb'],
};

/**
 * Returns an array of locale code candidates to try when querying the DB.
 * Always includes the original input. Used by public translation endpoints
 * to match either `l.code` or `l.aliases`.
 */
export function resolveLocaleCandidates(locale: string): string[] {
  const lower = locale.toLowerCase();
  const candidates = new Set<string>([locale, lower]);
  const aliases = LOCALE_ALIASES[lower];
  if (aliases) {
    for (const a of aliases) candidates.add(a);
  }
  return [...candidates];
}
