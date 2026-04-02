export interface SupportedLanguage {
  code: string;
  name: string;
  flag: string;
  aliases: string[];
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', flag: '🇬🇧', aliases: ['en-US', 'en-GB'] },
  { code: 'uk', name: 'Ukraine', flag: '🇺🇦', aliases: ['ua'] },
  {
    code: 'de',
    name: 'Germany',
    flag: '🇩🇪',
    aliases: ['de-DE', 'de-AT', 'de-CH'],
  },
  {
    code: 'fr',
    name: 'France',
    flag: '🇫🇷',
    aliases: ['fr-FR', 'fr-BE', 'fr-CH'],
  },
  { code: 'es', name: 'Spain', flag: '🇪🇸', aliases: ['es-ES'] },
  { code: 'it', name: 'Italy', flag: '🇮🇹', aliases: ['it-IT'] },
  { code: 'pt', name: 'Portugal', flag: '🇵🇹', aliases: ['pt-PT', 'pt-BR'] },
  { code: 'nl', name: 'Netherlands', flag: '🇳🇱', aliases: ['nl-NL', 'nl-BE'] },
  { code: 'pl', name: 'Poland', flag: '🇵🇱', aliases: ['pl-PL'] },
  { code: 'cs', name: 'Czechia', flag: '🇨🇿', aliases: ['cs-CZ'] },
  { code: 'sk', name: 'Slovakia', flag: '🇸🇰', aliases: ['sk-SK'] },
  { code: 'hu', name: 'Hungary', flag: '🇭🇺', aliases: ['hu-HU'] },
  { code: 'ro', name: 'Romania', flag: '🇷🇴', aliases: ['ro-RO'] },
  { code: 'bg', name: 'Bulgaria', flag: '🇧🇬', aliases: ['bg-BG'] },
  { code: 'hr', name: 'Croatia', flag: '🇭🇷', aliases: ['hr-HR'] },
  { code: 'sl', name: 'Slovenia', flag: '🇸🇮', aliases: ['sl-SI'] },
  { code: 'nb-NO', name: 'Norway', flag: '🇳🇴', aliases: ['no', 'nb', 'nn-NO'] },
  { code: 'sv', name: 'Sweden', flag: '🇸🇪', aliases: ['sv-SE'] },
  { code: 'da', name: 'Denmark', flag: '🇩🇰', aliases: ['da-DK'] },
  { code: 'fi', name: 'Finland', flag: '🇫🇮', aliases: ['fi-FI'] },
  { code: 'el', name: 'Greece', flag: '🇬🇷', aliases: ['el-GR'] },
  { code: 'tr', name: 'Turkey', flag: '🇹🇷', aliases: ['tr-TR'] },
  { code: 'ru', name: 'Russia', flag: '🇷🇺', aliases: ['ru-RU'] },
  { code: 'lt', name: 'Lithuania', flag: '🇱🇹', aliases: ['lt-LT'] },
  { code: 'lv', name: 'Latvia', flag: '🇱🇻', aliases: ['lv-LV'] },
  { code: 'et', name: 'Estonia', flag: '🇪🇪', aliases: ['et-EE'] },
];

export const LANGUAGE_BY_CODE: Record<string, SupportedLanguage> =
  Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.code, l]));

export const getFlagForCode = (code: string): string =>
  LANGUAGE_BY_CODE[code]?.flag ?? '';
