/**
 * Default locale-specific translation guidance for AI.
 * Used to auto-fill guidance when creating a locale without explicit guidance.
 * Content based on CLDR plural rules, Microsoft Style Guides, and Mozilla L10n best practices.
 */
export const LOCALE_GUIDELINES: Record<string, string> = {
  en: [
    '- Use American English spelling by default (e.g. "color", "organize")',
    '- 2 plural forms (singular, plural)',
    '- Use sentence case for UI labels (not Title Case unless brand names)',
    '- Date format: MM/DD/YYYY. Numbers: 1,000.00',
    '- Keep text concise and direct for UI contexts',
  ].join('\n'),

  uk: [
    '- Use formal "ви" (not "ти") for addressing users',
    '- 3 plural forms (one, few, many): 1 елемент, 2 елементи, 5 елементiв',
    '- Avoid anglicisms when Ukrainian equivalents exist (налаштування, not сетинги)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Ukrainian quotation marks: \u00abtext\u00bb',
  ].join('\n'),

  ru: [
    '- Use formal "вы" (not "ты") for addressing users',
    '- 3 plural forms (one, few, many): 1 элемент, 2 элемента, 5 элементов',
    '- Avoid unnecessary anglicisms (настройки, not сеттинги)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Russian quotation marks: \u00abtext\u00bb',
  ].join('\n'),

  de: [
    '- Use formal "Sie" (not "du") unless product specifically targets informal audience',
    '- 2 plural forms (singular, plural)',
    '- Compound nouns are written as one word (Benutzereinstellungen)',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Capitalize all nouns, not just sentence-initial words',
  ].join('\n'),

  fr: [
    '- Use formal "vous" (not "tu") for addressing users',
    '- 2 plural forms (singular, plural). Zero uses singular',
    '- Add non-breaking space before : ; ! ? and inside \u00ab \u00bb',
    '- Date format: DD/MM/YYYY. Numbers: 1 000,00',
    '- Avoid anglicisms: "courriel" not "email", "mot de passe" not "password"',
  ].join('\n'),

  es: [
    '- Use formal "usted" for business UI; informal "tu" only if product is casual',
    '- 2 plural forms (singular, plural)',
    '- Use inverted punctuation for questions/exclamations: \u00bftext? \u00a1text!',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Prefer Latin American neutral Spanish unless targeting Spain specifically',
  ].join('\n'),

  it: [
    '- Use formal "Lei" (capitalized) for addressing users in business context',
    '- 2 plural forms (singular, plural)',
    '- Articles are mandatory before nouns (il progetto, le impostazioni)',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Avoid anglicisms when Italian equivalents exist',
  ].join('\n'),

  pt: [
    '- Use formal "voce" for addressing users (Brazilian Portuguese default)',
    '- 2 plural forms (singular, plural)',
    '- Brazilian Portuguese preferred unless targeting Portugal (pt-PT)',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Avoid false friends with Spanish (pasta = folder, not pasta)',
  ].join('\n'),

  pl: [
    '- Use formal "Pan/Pani" or impersonal forms in UI',
    '- 3 plural forms (one, few, many): 1 element, 2 elementy, 5 element\u00f3w',
    '- Polish has complex declension \u2014 verify noun cases in context',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Avoid anglicisms: "ustawienia" not "setingi"',
  ].join('\n'),

  nl: [
    '- Use informal "je/jij" for modern UI; formal "u" for official/legal',
    '- 2 plural forms (singular, plural)',
    '- Compound words written together (gebruikersinstellingen)',
    '- Date format: DD-MM-YYYY. Numbers: 1.000,00',
    '- Distinguish between Dutch (NL) and Flemish (BE) conventions if needed',
  ].join('\n'),

  fi: [
    '- Use passive or impersonal constructions (no formal/informal "you" distinction)',
    '- 2 plural forms (singular, plural) but partitive case often used with numbers',
    '- Finnish words can be very long due to agglutination \u2014 keep UI strings concise',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- No grammatical gender; no articles',
  ].join('\n'),

  ja: [
    '- Use polite/formal register (\u3067\u3059/\u307e\u3059 form) for UI',
    '- No plural forms \u2014 quantity expressed via counters and context',
    '- CJK script: no spaces between words; use appropriate kanji/hiragana/katakana mix',
    '- Date format: YYYY/MM/DD or YYYY\u5e74MM\u6708DD\u65e5. Numbers: 1,000',
    '- Katakana for foreign loanwords; keep technical terms consistent',
  ].join('\n'),

  ko: [
    '- Use formal polite register (\ud569\ub2c8\ub2e4 form) for business UI',
    '- No plural forms \u2014 context determines quantity',
    '- Hangul script with spaces between words (unlike Japanese/Chinese)',
    '- Date format: YYYY.MM.DD or YYYY\ub144 MM\uc6d4 DD\uc77c. Numbers: 1,000',
    '- Avoid excessive use of Chinese characters (hanja)',
  ].join('\n'),

  zh: [
    '- Use Simplified Chinese characters (zh-CN default)',
    '- No plural forms, no grammatical gender, no articles',
    '- CJK script: no spaces between Chinese characters',
    '- Date format: YYYY\u5e74MM\u6708DD\u65e5. Numbers: 1,000',
    '- Use Chinese punctuation: \u3001 (comma) \u3002 (period) \u201c\u201d (quotes)',
  ].join('\n'),

  ar: [
    '- RTL (right-to-left) script \u2014 verify text direction in UI',
    '- 6 plural forms (zero, one, two, few, many, other)',
    '- Use Modern Standard Arabic (MSA) for broad audience',
    '- Date format: DD/MM/YYYY (Gregorian). Numbers: use Arabic-Indic or Western digits per context',
    '- Avoid colloquial dialect unless targeting specific region',
  ].join('\n'),

  hi: [
    '- Use formal register with honorifics (\u0906\u092a) for addressing users',
    '- 2 plural forms (singular, plural). Postpositions change with gender/number',
    '- Devanagari script \u2014 ensure proper rendering and line breaking',
    '- Date format: DD/MM/YYYY. Numbers: use Devanagari or Western digits consistently',
    '- Avoid excessive use of English words; prefer Hindi equivalents for common terms',
  ].join('\n'),

  tr: [
    '- Use formal "siz" for addressing users (not informal "sen")',
    '- 2 plural forms (singular, plural). Noun after a numeral stays singular',
    '- Agglutinative language \u2014 suffixes change word meaning; verify context',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Dotted \u0130 and dotless I are distinct letters \u2014 handle case conversion carefully',
  ].join('\n'),

  cs: [
    '- Use formal "vy" (or polite "Vy") for addressing users',
    '- 3 plural forms (one, few, other): 1 polo\u017eka, 2 polo\u017eky, 5 polo\u017eek',
    '- Rich declension system \u2014 nouns change form based on grammatical case',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Czech quotation marks: \u201etext\u201c',
  ].join('\n'),

  ro: [
    '- Use formal "dumneavoastr\u0103" for business UI; informal "tu" for casual apps',
    '- 3 plural forms (one, few, other): 1 element, 2 elemente, 20 de elemente',
    '- Definite article is suffixed to the noun (elementul, not el element)',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Use Romanian diacritics: \u0103, \u00e2, \u00ee, \u0219, \u021b (not cedilla variants)',
  ].join('\n'),

  hu: [
    '- Use formal register (\u00d6n) for addressing users in business context',
    '- 2 plural forms (singular, plural). Noun stays singular after a numeral',
    '- Agglutinative language \u2014 suffixes convey case, possession, etc.',
    '- Date format: YYYY.MM.DD. Numbers: 1 000,00',
    '- Word order is flexible but verb-focus (topic-prominent language)',
  ].join('\n'),

  el: [
    '- Use formal "esei\u03c2" for addressing users',
    '- 2 plural forms (singular, plural)',
    '- Greek script \u2014 ensure proper polytonic/monotonic rendering',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Watch for accent placement \u2014 it can change word meaning',
  ].join('\n'),

  he: [
    '- RTL (right-to-left) script \u2014 verify text direction in UI',
    '- 2 plural forms (singular, plural) plus dual for specific nouns',
    '- Grammatical gender affects verbs and adjectives \u2014 use masculine as default for mixed audience',
    '- Date format: DD/MM/YYYY (Gregorian) or Hebrew calendar. Numbers: 1,000.00',
    '- Avoid nikkud (vowel marks) in modern UI text',
  ].join('\n'),

  th: [
    '- Use polite particles \u0e04\u0e23\u0e31\u0e1a/\u0e04\u0e48\u0e30 for formal register',
    '- No plural forms \u2014 quantity expressed via classifiers',
    '- Thai script: no spaces between words (spaces separate sentences/clauses)',
    '- Date format: DD/MM/YYYY (Buddhist Era or Gregorian). Numbers: 1,000.00',
    '- Avoid excessive English transliterations; prefer Thai equivalents',
  ].join('\n'),

  vi: [
    '- Use formal pronouns: "b\u1ea1n" (neutral) or "qu\u00fd kh\u00e1ch" (formal business)',
    '- No plural forms \u2014 classifiers indicate quantity/type',
    '- Vietnamese uses Latin script with extensive diacritics \u2014 never strip diacritics',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Word order: Subject-Verb-Object; adjectives follow nouns',
  ].join('\n'),

  id: [
    '- Use formal "Anda" (capitalized) for addressing users',
    '- No plural forms \u2014 reduplication or context expresses plurality',
    '- Latin script; relatively simple grammar (no gender, no conjugation)',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
    '- Avoid English loanwords when standard Indonesian terms exist',
  ].join('\n'),

  ms: [
    '- Use formal "Anda" for addressing users',
    '- No plural forms \u2014 same as Indonesian (reduplication for emphasis)',
    '- Latin script; similar grammar to Indonesian but vocabulary differs',
    '- Date format: DD/MM/YYYY. Numbers: 1,000.00',
    '- Distinguish from Indonesian: "telefon bimbit" (MY) vs "ponsel" (ID)',
  ].join('\n'),

  bg: [
    '- Use formal "Вие" for addressing users',
    '- 2 plural forms (singular, plural)',
    '- Cyrillic script \u2014 definite article is suffixed (-\u0442\u0430, -\u0442\u043e, -\u0442\u044a\u0442)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Bulgarian quotation marks: \u201etext\u201c',
  ].join('\n'),

  hr: [
    '- Use formal "Vi" for addressing users',
    '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
    '- Latin script with diacritics: \u010d, \u0107, \u0111, \u0161, \u017e',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Distinguish from Serbian (Cyrillic) \u2014 Croatian uses Latin script',
  ].join('\n'),

  sk: [
    '- Use formal "vy" for addressing users',
    '- 3 plural forms (one, few, other): 1 polo\u017eka, 2 polo\u017eky, 5 polo\u017eiek',
    '- Similar to Czech but with distinct vocabulary and grammar rules',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Slovak quotation marks: \u201etext\u201c',
  ].join('\n'),

  sl: [
    '- Use formal "vi" for addressing users',
    '- 4 plural forms (one, two, few, other): includes dual form',
    '- Dual form is grammatically required (2 elementa, not 2 elementi)',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Distinguish from Serbian/Croatian despite similarities',
  ].join('\n'),

  lt: [
    '- Use formal "j\u016bs" for addressing users',
    '- 3 plural forms (one, few, other): 1 elementas, 2 elementai, 10 element\u0173',
    '- Lithuanian has complex declension (7 cases)',
    '- Date format: YYYY-MM-DD. Numbers: 1 000,00',
    '- Avoid direct translations from English \u2014 Lithuanian syntax differs significantly',
  ].join('\n'),

  lv: [
    '- Use formal "J\u016bs" for addressing users',
    '- 2 plural forms (one, other): special handling for zero and numbers ending in 1 (except 11)',
    '- Latvian has 7 grammatical cases like Lithuanian',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Latvian diacritics: \u0101, \u0113, \u012b, \u016b, \u010d, \u0123, \u0137, \u013c, \u0146, \u0161, \u017e',
  ].join('\n'),

  et: [
    '- Use formal "teie" for addressing users; "sina" for informal',
    '- 2 plural forms (singular, plural) but partitive case common with numbers',
    '- Estonian has 14 grammatical cases \u2014 context-sensitive noun forms',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- No grammatical gender; no future tense \u2014 context indicates time',
  ].join('\n'),

  sr: [
    '- Use formal "Vi" for addressing users',
    '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
    '- Can use Cyrillic or Latin script \u2014 Cyrillic is official but Latin widely used online',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
    '- Ekavian pronunciation/spelling preferred for standard Serbian',
  ].join('\n'),

  'nb-NO': [
    '- Bokm\u00e5l (written standard) \u2014 not Nynorsk',
    '- 2 plural forms (singular, plural)',
    '- Use informal "du" (not formal "De") \u2014 Norwegian prefers direct address',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Avoid anglicisms: "innstillinger" not "settings"',
  ].join('\n'),

  nb: [
    '- Bokm\u00e5l (written standard) \u2014 not Nynorsk',
    '- 2 plural forms (singular, plural)',
    '- Use informal "du" (not formal "De") \u2014 Norwegian prefers direct address',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Avoid anglicisms: "innstillinger" not "settings"',
  ].join('\n'),

  sv: [
    '- Use informal "du" (not formal "ni") \u2014 Swedish prefers direct casual address',
    '- 2 plural forms (singular, plural)',
    '- Compound words written together (anv\u00e4ndarinst\u00e4llningar)',
    '- Date format: YYYY-MM-DD. Numbers: 1 000,00',
    '- Avoid anglicisms: "inst\u00e4llningar" not "settings"',
  ].join('\n'),

  da: [
    '- Use informal "du" (not formal "De") \u2014 Danish prefers casual address',
    '- 2 plural forms (singular, plural)',
    '- Common gender (en) and neuter gender (et) affect articles and adjectives',
    '- Date format: DD-MM-YYYY or DD.MM.YYYY. Numbers: 1.000,00',
    '- Avoid anglicisms when Danish equivalents exist (indstillinger, not settings)',
  ].join('\n'),

  'da-DK': [
    '- Use informal "du" (not formal "De") \u2014 Danish prefers casual address',
    '- 2 plural forms (singular, plural)',
    '- Common gender (en) and neuter gender (et) affect articles and adjectives',
    '- Date format: DD-MM-YYYY or DD.MM.YYYY. Numbers: 1.000,00',
    '- Avoid anglicisms when Danish equivalents exist (indstillinger, not settings)',
  ].join('\n'),
};
