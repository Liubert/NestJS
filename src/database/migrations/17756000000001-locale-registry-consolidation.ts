import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Locale registry consolidation migration:
 * 1. Rename column guidance -> locale_skill (idempotent)
 * 2. Normalize nb-NO -> nb (merge or rename rows per project)
 * 3. Normalize da-DK -> da (merge or rename rows per project)
 * 4. Backfill locale_skill for rows where it is NULL
 */

/**
 * Inline locale skill map — self-contained so migration remains stable
 * even if locale-registry.ts changes in the future.
 */
const LOCALE_SKILL_MAP: Record<string, string> = {
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
  ].join('\n'),

  uk: [
    'СТИЛЬ І ТОН',
    '- Звертайтесь до користувача на «ви» (не «ти»), навіть у неформальному контексті',
    '- Тон: професійний, чіткий, дружелюбний. Не сухий канцелярит, але й не розмовний сленг',
    '- Для кнопок і дій використовуйте інфінітив: «Зберегти», «Видалити», «Повернутися»',
    '',
    'ГРАМАТИКА І МНОЖИНА',
    '- 3 форми множини (one, few, many): 1 елемент, 2 елементи, 5 елементів',
    '- Рід: узгоджуйте дієслова і прикметники з родом іменника',
    '',
    'ФОРМАТУВАННЯ',
    '- Дата: ДД.ММ.РРРР. Числа: 1 000,00',
    '- Лапки: «текст» (французькі), а не "текст"',
  ].join('\n'),

  ru: [
    '- Use formal "вы" (not "ты") for addressing users',
    '- 3 plural forms (one, few, many): 1 элемент, 2 элемента, 5 элементов',
    '- Avoid unnecessary anglicisms (настройки, not сеттинги)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
    '- Use Russian quotation marks: «text»',
  ].join('\n'),

  de: [
    'STIL & TON',
    '- Siezen: Verwenden Sie "Sie" (nicht "du"), es sei denn, das Produkt richtet sich gezielt an ein informelles Publikum',
    '- Buttons und Aktionen: Infinitiv verwenden: "Speichern", "Löschen", "Zurückkehren"',
    '',
    'GRAMMATIK & PLURALFORMEN',
    '- 2 Pluralformen (Singular, Plural): 1 Element, 2 Elemente',
    '- Alle Substantive großschreiben — nicht nur am Satzanfang',
  ].join('\n'),

  fr: [
    'STYLE & TON',
    '- Vouvoiement : utilisez "vous" (pas "tu") pour s\'adresser aux utilisateurs',
    '- Boutons et actions : infinitif. "Enregistrer", "Supprimer", "Retourner"',
    '',
    'GRAMMAIRE & PLURIEL',
    '- 2 formes de pluriel (singulier, pluriel). Zéro utilise le singulier',
  ].join('\n'),

  es: [
    '- Usar "usted" en UI profesional; "tú" solo si el producto es casual',
    '- Botones y acciones: infinitivo. "Guardar", "Eliminar", "Volver"',
    '- 2 formas de plural (singular, plural): 1 elemento, 2 elementos',
    '- Puntuación invertida obligatoria: ¿pregunta? ¡exclamación!',
  ].join('\n'),

  it: [
    '- Usare "Lei" (maiuscolo) per rivolgersi agli utenti in contesto professionale',
    '- Pulsanti e azioni: infinito. "Salvare", "Eliminare", "Tornare"',
    '- 2 forme di plurale (singolare, plurale): 1 elemento, 2 elementi',
  ].join('\n'),

  pt: [
    '- Usar "você" para se dirigir aos usuários (português brasileiro padrão)',
    '- Botões e ações: infinitivo. "Salvar", "Excluir", "Voltar"',
    '- 2 formas de plural (singular, plural): 1 elemento, 2 elementos',
  ].join('\n'),

  nl: [
    '- Use informal "je/jij" for modern UI; formal "u" for official/legal',
    '- 2 plural forms (singular, plural)',
    '- Compound words written together (gebruikersinstellingen)',
    '- Date format: DD-MM-YYYY. Numbers: 1.000,00',
  ].join('\n'),

  pl: [
    '- Formy grzecznościowe: "Pan/Pani" lub formy bezosobowe w UI',
    '- Przyciski i akcje: bezokolicznik. "Zapisać", "Usunąć", "Powrócić"',
    '- 3 formy liczby mnogiej (one, few, many): 1 element, 2 elementy, 5 elementów',
  ].join('\n'),

  cs: [
    '- Use formal "vy" (or polite "Vy") for addressing users',
    '- 3 plural forms (one, few, other): 1 položka, 2 položky, 5 položek',
    '- Rich declension system — nouns change form based on grammatical case',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  sk: [
    '- Use formal "vy" for addressing users',
    '- 3 plural forms (one, few, other): 1 položka, 2 položky, 5 položiek',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  hu: [
    '- Use formal register (Ön) for addressing users in business context',
    '- 2 plural forms (singular, plural). Noun stays singular after a numeral',
    '- Date format: YYYY.MM.DD. Numbers: 1 000,00',
  ].join('\n'),

  ro: [
    '- Use formal "dumneavoastră" for business UI; informal "tu" for casual apps',
    '- 3 plural forms (one, few, other): 1 element, 2 elemente, 20 de elemente',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
  ].join('\n'),

  bg: [
    '- Use formal "Вие" for addressing users',
    '- 2 plural forms (singular, plural)',
    '- Cyrillic script — definite article is suffixed (-та, -то, -тът)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  hr: [
    '- Use formal "Vi" for addressing users',
    '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
    '- Latin script with diacritics: č, ć, đ, š, ž',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
  ].join('\n'),

  sl: [
    '- Use formal "vi" for addressing users',
    '- 4 plural forms (one, two, few, other): includes dual form',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
  ].join('\n'),

  nb: [
    'STIL OG TONE',
    '- Bruk uformelt "du" (ikke "De") — norsk foretrekker direkte tiltale',
    '- Bokmål (skriftstandard) — ikke nynorsk, med mindre prosjektet krever det',
    '- Knapper og handlinger: imperativ. "Lagre", "Slette", "Gå tilbake"',
    '',
    'GRAMMATIKK OG FLERTALL',
    '- 2 flertallsformer (entall, flertall): 1 element, 2 elementer',
    '- "Fil" er hankjønn (en fil), "mappe" er hunkjønn (ei/en mappe)',
    '',
    'ANTIMØNSTRE OG VANLIGE FEIL',
    '- Unngå anglisismer: "innstillinger" ikke "settings", "laste ned" ikke "downloade"',
    '- "logge inn" ikke "logge in" — norsk bruker "inn", ikke engelsk "in"',
    '',
    'FORMATERING',
    '- Dato: DD.MM.ÅÅÅÅ. Tall: 1 000,00',
    '- Anførselstegn: «tekst» (guillemets)',
    '- Sammensatte ord: skriv som ett ord (brukerinnstillinger, prosjektoversikt)',
  ].join('\n'),

  sv: [
    'STIL OCH TON',
    '- Använd informellt "du" (inte formellt "ni") — svenska föredrar direkt tilltal (du-reformen)',
    '- Knappar och åtgärder: imperativ. "Spara", "Ta bort", "Gå tillbaka"',
    '',
    'GRAMMATIK OCH PLURAL',
    '- 2 pluralformer (singular, plural): 1 element, 2 element',
    '- Svenska har två grammatiska genus: en-ord (utrum) och ett-ord (neutrum)',
    '',
    'FORMATERING',
    '- Datum: ÅÅÅÅ-MM-DD (ISO-standard, svenskt standardformat). Tal: 1 000,00',
    '- Sammansatta ord: skriv ihop (användarinställningar, projektöversikt)',
  ].join('\n'),

  da: [
    'STIL OG TONE',
    '- Brug uformelt "du" (ikke formelt "De") — dansk foretrækker uformel tiltale',
    '- Knapper og handlinger: imperativ. "Gem", "Slet", "Gå tilbage"',
    '',
    'GRAMMATIK OG FLERTAL',
    '- 2 flertalsformer (ental, flertal): 1 element, 2 elementer',
    '- Dansk har to grammatiske køn: fælleskøn (en) og intetkøn (et)',
    '',
    'FORMATERING',
    '- Dato: DD-MM-ÅÅÅÅ eller DD.MM.ÅÅÅÅ. Tal: 1.000,00',
    '- Anførselstegn: »tekst« eller "tekst"',
    '- Sammensatte ord: skriv som ét ord (brugerindstillinger, projektoversigt)',
  ].join('\n'),

  fi: [
    '- Use passive or impersonal constructions (no formal/informal "you" distinction)',
    '- 2 plural forms (singular, plural) but partitive case often used with numbers',
    '- Finnish words can be very long due to agglutination — keep UI strings concise',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  el: [
    '- Use formal "εσείς" for addressing users',
    '- 2 plural forms (singular, plural)',
    '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
  ].join('\n'),

  tr: [
    '- Use formal "siz" for addressing users (not informal "sen")',
    '- 2 plural forms (singular, plural). Noun after a numeral stays singular',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
  ].join('\n'),

  lt: [
    '- Use formal "jūs" for addressing users',
    '- 3 plural forms (one, few, other): 1 elementas, 2 elementai, 10 elementų',
    '- Date format: YYYY-MM-DD. Numbers: 1 000,00',
  ].join('\n'),

  lv: [
    '- Use formal "Jūs" for addressing users',
    '- 2 plural forms (one, other)',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  et: [
    '- Use formal "teie" for addressing users; "sina" for informal',
    '- 2 plural forms (singular, plural) but partitive case common with numbers',
    '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
  ].join('\n'),

  sr: [
    '- Use formal "Vi" for addressing users',
    '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
    '- Can use Cyrillic or Latin script — Cyrillic is official but Latin widely used online',
    '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
  ].join('\n'),

  ja: [
    '- Use polite/formal register (です/ます form) for UI',
    '- No plural forms — quantity expressed via counters and context',
    '- CJK script: no spaces between words',
    '- Date format: YYYY/MM/DD or YYYY年MM月DD日. Numbers: 1,000',
  ].join('\n'),

  ko: [
    '- Use formal polite register (합니다 form) for business UI',
    '- No plural forms — context determines quantity',
    '- Date format: YYYY.MM.DD or YYYY년 MM월 DD일. Numbers: 1,000',
  ].join('\n'),

  zh: [
    '- Use Simplified Chinese characters (zh-CN default)',
    '- No plural forms, no grammatical gender, no articles',
    '- CJK script: no spaces between Chinese characters',
    '- Date format: YYYY年MM月DD日. Numbers: 1,000',
  ].join('\n'),

  ar: [
    '- RTL (right-to-left) script — verify text direction in UI',
    '- 6 plural forms (zero, one, two, few, many, other)',
    '- Use Modern Standard Arabic (MSA) for broad audience',
  ].join('\n'),

  hi: [
    '- Use formal register with honorifics (आप) for addressing users',
    '- 2 plural forms (singular, plural). Postpositions change with gender/number',
    '- Devanagari script — ensure proper rendering and line breaking',
  ].join('\n'),

  th: [
    '- Use polite particles ครับ/ค่ะ for formal register',
    '- No plural forms — quantity expressed via classifiers',
    '- Thai script: no spaces between words',
  ].join('\n'),

  vi: [
    '- Use formal pronouns: "bạn" (neutral) or "quý khách" (formal business)',
    '- No plural forms — classifiers indicate quantity/type',
    '- Vietnamese uses Latin script with extensive diacritics — never strip diacritics',
  ].join('\n'),

  id: [
    '- Use formal "Anda" (capitalized) for addressing users',
    '- No plural forms — reduplication or context expresses plurality',
    '- Latin script; relatively simple grammar (no gender, no conjugation)',
  ].join('\n'),

  ms: [
    '- Use formal "Anda" for addressing users',
    '- No plural forms — same as Indonesian (reduplication for emphasis)',
    '- Latin script; similar grammar to Indonesian but vocabulary differs',
  ].join('\n'),
};

export class LocaleRegistryConsolidation17756000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Rename column guidance -> locale_skill (idempotent)
    const columns = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'translation_locales' AND column_name = 'guidance'`,
    )) as { column_name: string }[];

    if (columns.length > 0) {
      await queryRunner.query(
        `ALTER TABLE translation_locales RENAME COLUMN guidance TO locale_skill`,
      );
    }

    // Step 2 & 3: Normalize nb-NO -> nb, da-DK -> da
    await this.normalizeLocaleCode(queryRunner, 'nb-NO', 'nb');
    await this.normalizeLocaleCode(queryRunner, 'da-DK', 'da');

    // Step 4: Backfill locale_skill for rows where it is NULL
    for (const [code, skill] of Object.entries(LOCALE_SKILL_MAP)) {
      await queryRunner.query(
        `UPDATE translation_locales SET locale_skill = $1
         WHERE code = $2 AND (locale_skill IS NULL OR locale_skill = '')`,
        [skill, code],
      );
    }
  }

  private async normalizeLocaleCode(
    queryRunner: QueryRunner,
    oldCode: string,
    newCode: string,
  ): Promise<void> {
    const projects = (await queryRunner.query(
      `SELECT DISTINCT project_id FROM translation_locales WHERE code IN ($1, $2)`,
      [oldCode, newCode],
    )) as { project_id: string }[];

    for (const { project_id } of projects) {
      const rows = (await queryRunner.query(
        `SELECT id, code, aliases, locale_skill FROM translation_locales
         WHERE project_id = $1 AND code IN ($2, $3)`,
        [project_id, oldCode, newCode],
      )) as {
        id: string;
        code: string;
        aliases: string[];
        locale_skill: string | null;
      }[];

      const oldRow = rows.find((r) => r.code === oldCode);
      const newRow = rows.find((r) => r.code === newCode);

      if (oldRow && newRow) {
        // Both exist: merge aliases, reassign values, delete old row
        const mergedAliases: string[] = Array.from(
          new Set([
            ...(newRow.aliases ?? []),
            ...(oldRow.aliases ?? []),
            oldCode,
          ]),
        );

        // Merge locale_skill: keep new row's skill if set, otherwise use old row's
        const mergedSkill = newRow.locale_skill || oldRow.locale_skill || null;

        await queryRunner.query(
          `UPDATE translation_locales SET aliases = $1, locale_skill = $2
           WHERE id = $3`,
          [mergedAliases, mergedSkill, newRow.id],
        );

        // Reassign translation_values
        await queryRunner.query(
          `UPDATE translation_values SET locale_id = $1 WHERE locale_id = $2`,
          [newRow.id, oldRow.id],
        );

        // Reassign sandbox_values
        await queryRunner.query(
          `UPDATE sandbox_values SET locale_id = $1 WHERE locale_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM sandbox_values sv2
             WHERE sv2.locale_id = $1 AND sv2.key_id = sandbox_values.key_id
               AND sv2.project_id = sandbox_values.project_id
           )`,
          [newRow.id, oldRow.id],
        );

        // Delete any remaining duplicate sandbox_values from old locale
        await queryRunner.query(
          `DELETE FROM sandbox_values WHERE locale_id = $1`,
          [oldRow.id],
        );

        // Reassign production_snapshots if the table exists
        const snapshotTable = (await queryRunner.query(
          `SELECT to_regclass('production_snapshots') AS exists`,
        )) as { exists: string | null }[];
        if (snapshotTable[0]?.exists) {
          await queryRunner.query(
            `UPDATE production_snapshots SET locale_id = $1 WHERE locale_id = $2`,
            [newRow.id, oldRow.id],
          );
        }

        await queryRunner.query(
          `DELETE FROM translation_locales WHERE id = $1`,
          [oldRow.id],
        );
      } else if (oldRow && !newRow) {
        // Only old code exists: rename it, add old code to aliases
        const mergedAliases: string[] = Array.from(
          new Set([...(oldRow.aliases ?? []), oldCode]),
        );

        await queryRunner.query(
          `UPDATE translation_locales SET code = $1, aliases = $2 WHERE id = $3`,
          [newCode, mergedAliases, oldRow.id],
        );
      }
      // If only newRow exists: already normalized, nothing to do
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename locale_skill back to guidance
    const columns = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'translation_locales' AND column_name = 'locale_skill'`,
    )) as { column_name: string }[];

    if (columns.length > 0) {
      await queryRunner.query(
        `ALTER TABLE translation_locales RENAME COLUMN locale_skill TO guidance`,
      );
    }
  }
}
