import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill existing locales with enriched translation guidance.
 * Only updates locales whose current guidance is shorter than the new one
 * (i.e. still has the old short version). Locales with custom user-written
 * guidance that is already longer are left untouched.
 *
 * NOTE: locale-guidelines.ts was deleted in the locale-registry-consolidation
 * migration. Guidance data is now inlined here to keep the migration self-contained.
 */

// Inline snapshot of LOCALE_GUIDELINES at the time this migration was created.
// Do NOT import from the live codebase — migrations must be stable.
const LOCALE_GUIDELINES_SNAPSHOT: Record<string, string> = {
  en: [
    'STYLE & TONE',
    '- Use American English spelling by default (e.g. "color", "organize", "center")',
    '- Tone: clear, direct, professional but friendly. Avoid overly formal or corporate language',
    '- Use sentence case for UI labels (not Title Case unless brand names)',
    '- For buttons and actions use imperative: "Save", "Delete", "Go back"',
    '',
    'GRAMMAR & PLURAL FORMS',
    '- 2 plural forms (singular, plural): 1 item, 2 items',
    '- Use Oxford comma in lists: "projects, namespaces, and locales"',
    '',
    'ANTI-PATTERNS & COMMON MISTAKES',
    '- Avoid passive voice in UI: "File was saved" → "File saved" or "Saved successfully"',
    '- Avoid jargon: "utilize" → "use", "commence" → "start", "terminate" → "end"',
    '- Don\'t use "please" in error messages or required actions — be direct',
    '- Avoid gendered language: "they" as singular is acceptable',
    '',
    'UI WORDING RULES',
    '- Error messages: state what happened, then what user can do. "Connection lost. Check your network and try again."',
    '- Confirmations: state consequence. "Delete this project? This cannot be undone."',
    '- Empty states: be helpful, suggest next action. "No translations yet. Import a file or add keys manually."',
    '',
    'FORMATTING',
    '- Date format: MM/DD/YYYY. Numbers: 1,000.00',
    '- Keep text concise for UI — every word should earn its place',
  ].join('\n'),

  uk: [
    'СТИЛЬ І ТОН',
    '- Звертайтесь до користувача на «ви» (не «ти»), навіть у неформальному контексті',
    '- Тон: професійний, чіткий, дружелюбний. Не сухий канцелярит, але й не розмовний сленг',
    '- Для кнопок і дій використовуйте інфінітив: «Зберегти», «Видалити», «Повернутися»',
    '- Уникайте імперативу від другої особи: «Збережіть» → «Зберегти»',
    '',
    'ГРАМАТИКА І МНОЖИНА',
    '- 3 форми множини (one, few, many): 1 елемент, 2 елементи, 5 елементів',
    '- Рід: узгоджуйте дієслова і прикметники з родом іменника (проєкт створений / задача створена)',
    '- Кличний відмінок у звертаннях: «Користувачу», «Адміністраторе»',
    '',
    'АНТИПАТЕРНИ І ПОШИРЕНІ ПОМИЛКИ',
    '- Англіцизми: «налаштування» (не «сетинги»), «завантажити» (не «загрузити»), «теренкод» → «код»',
    '- «приймати участь» → «брати участь»',
    '- «вірний» (вірний друг) → «правильний» (правильна відповідь)',
    '- «на Україні» → «в Україні»',
    '- «міроприємство» → «захід»',
    '- Не калькуйте англійські конструкції: "Are you sure?" ≠ "Ви впевнені?" — краще: "Видалити проєкт? Цю дію не можна скасувати."',
    '',
    'ПРАВИЛА UI-ТЕКСТУ',
    "- Помилки: що сталось + що робити. «З'єднання втрачено. Перевірте мережу і спробуйте знову.»",
    '- Підтвердження: вказуйте наслідки. «Видалити проєкт? Усі переклади буде втрачено.»',
    '- Порожні стани: підкажіть наступний крок. «Перекладів ще немає. Імпортуйте файл або додайте ключі вручну.»',
    '',
    'ФОРМАТУВАННЯ',
    '- Дата: ДД.ММ.РРРР. Числа: 1 000,00 (пробіл — роздільник тисяч, кома — десяткова)',
    '- Лапки: «текст» (французькі), а не "текст"',
    "- Апостроф: ʼ (U+02BC), не ' — «зв'язок» → «зв\u02BCязок»",
  ].join('\n'),

  ru: [
    '- Use formal "вы" (not "ты") for addressing users',
    '- 3 plural forms (one, few, many): 1 элемент, 2 элемента, 5 элементов',
    '- Avoid unnecessary anglicisms (настройки, not сеттинги)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Russian quotation marks: «text»',
  ].join('\n'),

  de: 'STIL & TON\n- Siezen: Verwenden Sie "Sie"\n- Buttons und Aktionen: Infinitiv verwenden\n- Alle Substantive großschreiben',
  fr: 'STYLE & TON\n- Vouvoiement : utilisez "vous"\n- Boutons et actions : infinitif',
  es: '- Usar "usted" en UI profesional\n- Botones y acciones: infinitivo',
  it: '- Usare "Lei" per rivolgersi agli utenti\n- Pulsanti e azioni: infinito',
  pt: '- Usar "você" para se dirigir aos usuários\n- Botões e ações: infinitivo',
  nl: '- Use informal "je/jij" for modern UI\n- Compound words written together',
  pl: '- Formy grzecznościowe: "Pan/Pani"\n- 3 formy liczby mnogiej (one, few, many)',
  cs: '- Use formal "vy" for addressing users\n- 3 plural forms (one, few, other)',
  sk: '- Use formal "vy" for addressing users\n- 3 plural forms (one, few, other)',
  hu: '- Use formal register (Ön)\n- 2 plural forms\n- Date format: YYYY.MM.DD',
  ro: '- Use formal "dumneavoastră"\n- 3 plural forms (one, few, other)',
  bg: '- Use formal "Вие"\n- Cyrillic script — definite article is suffixed',
  hr: '- Use formal "Vi"\n- 3 plural forms (one, few, other)',
  sl: '- Use formal "vi"\n- 4 plural forms including dual form',
  nb: 'STIL OG TONE\n- Bruk uformelt "du"\n- Bokmål (skriftstandard)\n- "Fil" er hankjønn (en fil)',
  sv: 'STIL OCH TON\n- Använd informellt "du"\n- Sammansatta ord: skriv ihop',
  da: 'STIL OG TONE\n- Brug uformelt "du"\n- 2 flertalsformer (ental, flertal)',
  fi: '- Use passive or impersonal constructions\n- Finnish words can be very long due to agglutination',
  ja: '- Use polite/formal register (です/ます form)\n- CJK script: no spaces between words',
  ko: '- Use formal polite register (합니다 form)\n- Hangul script with spaces between words',
  zh: '- Use Simplified Chinese characters (zh-CN default)\n- CJK script: no spaces between Chinese characters',
  ar: '- RTL (right-to-left) script — verify text direction in UI\n- 6 plural forms',
  hi: '- Use formal register with honorifics (आप)\n- Devanagari script',
  tr: '- Use formal "siz" for addressing users\n- Dotted İ and dotless I are distinct letters',
  cs_extra:
    '- Rich declension system — nouns change form based on grammatical case',
  lt: '- Use formal "jūs"\n- 3 plural forms\n- Date format: YYYY-MM-DD',
  lv: '- Use formal "Jūs"\n- 2 plural forms (one, other)',
  et: '- Use formal "teie"\n- 2 plural forms\n- Estonian has 14 grammatical cases',
  sr: '- Use formal "Vi"\n- 3 plural forms (one, few, other)',
  el: '- Use formal "εσείς"\n- 2 plural forms',
  th: '- Use polite particles ครับ/ค่ะ\n- No plural forms',
  vi: '- Use formal pronouns: "bạn"\n- Vietnamese uses Latin script with extensive diacritics — never strip diacritics',
  id: '- Use formal "Anda"\n- No plural forms — reduplication or context expresses plurality',
  ms: '- Use formal "Anda"\n- No plural forms',
};

export class BackfillEnrichedGuidance17753000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, guidance] of Object.entries(LOCALE_GUIDELINES_SNAPSHOT)) {
      await queryRunner.query(
        `UPDATE translation_locales
         SET guidance = $1
         WHERE code = $2
           AND (guidance IS NULL OR LENGTH(guidance) < LENGTH($1))`,
        [guidance, code],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No rollback — old short guidance is not preserved
  }
}
