/**
 * BCP 47 locale aliases — maps short ISO 639-1 codes (used by legacy apps) to
 * the full BCP 47 codes stored on the server. Tried as fallback when the exact
 * locale code is not found.
 *
 * To add a new alias: append an entry here. No other changes needed.
 */
export const LOCALE_ALIASES: Record<string, string> = {
  no: 'nb-NO',
  nb: 'nb-NO',
  da: 'da-DK',
  nn: 'nb-NO',
};

export function resolveLocaleAlias(locale: string): string {
  return LOCALE_ALIASES[locale.toLowerCase()] ?? locale;
}
