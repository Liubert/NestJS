/**
 * Single source of truth for all supported locale definitions.
 *
 * Each entry contains:
 * - code: primary 2-3 char ISO 639-1 code ('nb', 'da', 'uk')
 * - name: human-readable name for Gemini prompts
 * - aliases: BCP 47 regional variants that map to this code
 * - localeSkill: AI translation guide (style, grammar, anti-patterns, UI wording)
 * - flag: emoji flag for frontend display
 *
 * Sources merged:
 *   backend/ai-translate.service.ts LOCALE_NAMES
 *   backend/auto-translate-worker.service.ts LOCALE_NAMES
 *   admin-ui/src/constants/supported-languages.ts SUPPORTED_LANGUAGES
 *   src/modules/translations/locale-guidelines.ts LOCALE_GUIDELINES
 */

export interface LocaleDefinition {
  code: string;
  name: string;
  aliases: string[];
  localeSkill: string;
  flag: string;
}

export const LOCALE_REGISTRY: LocaleDefinition[] = [
  {
    code: 'en',
    name: 'English',
    aliases: ['en-US', 'en-GB'],
    flag: '🇬🇧',
    localeSkill: [
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
  },

  {
    code: 'uk',
    name: 'Ukrainian',
    aliases: ['ua'],
    flag: '🇺🇦',
    localeSkill: [
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
  },

  {
    code: 'de',
    name: 'German',
    aliases: ['de-DE', 'de-AT', 'de-CH'],
    flag: '🇩🇪',
    localeSkill: [
      'STIL & TON',
      '- Siezen: Verwenden Sie "Sie" (nicht "du"), es sei denn, das Produkt richtet sich gezielt an ein informelles Publikum',
      '- Ton: klar, professionell, sachlich. Nicht zu locker, nicht zu bürokratisch',
      '- Buttons und Aktionen: Infinitiv verwenden: "Speichern", "Löschen", "Zurückkehren"',
      '',
      'GRAMMATIK & PLURALFORMEN',
      '- 2 Pluralformen (Singular, Plural): 1 Element, 2 Elemente',
      '- Alle Substantive großschreiben — nicht nur am Satzanfang',
      '- Zusammengesetzte Substantive: als ein Wort schreiben (Benutzereinstellungen, Projektverwaltung)',
      '',
      'ANTI-PATTERNS & HÄUFIGE FEHLER',
      '- Anglizismen vermeiden: "Einstellungen" statt "Settings", "Hochladen" statt "Upload"',
      '- Falsche Freunde beachten: "aktuell" ≠ "actually", "bekommen" ≠ "become"',
      '- Keine direkte Übersetzung von "Click here" → besser: kontextbezogene Handlungsanweisung',
      '- Gendern: geschlechtsneutrale Formulierungen bevorzugen, wenn möglich',
      '',
      'UI-TEXT-REGELN',
      '- Fehlermeldungen: Was ist passiert + Was kann der Benutzer tun',
      '- Bestätigungen: Konsequenzen benennen. "Projekt löschen? Alle Übersetzungen gehen verloren."',
      '',
      'FORMATIERUNG',
      '- Datum: TT.MM.JJJJ. Zahlen: 1.000,00 (Punkt = Tausender, Komma = Dezimal)',
      '- Anführungszeichen: „Text" (deutsche Anführungszeichen)',
    ].join('\n'),
  },

  {
    code: 'fr',
    name: 'French',
    aliases: ['fr-FR', 'fr-BE', 'fr-CH'],
    flag: '🇫🇷',
    localeSkill: [
      'STYLE & TON',
      '- Vouvoiement : utilisez "vous" (pas "tu") pour s\'adresser aux utilisateurs',
      '- Ton : professionnel, clair, convivial sans être familier',
      '- Boutons et actions : infinitif. "Enregistrer", "Supprimer", "Retourner"',
      '',
      'GRAMMAIRE & PLURIEL',
      '- 2 formes de pluriel (singulier, pluriel). Zéro utilise le singulier',
      '- Accords : respectez le genre et le nombre (le projet est créé / la tâche est créée)',
      '',
      'ANTI-PATTERNS & ERREURS COURANTES',
      '- Anglicismes : "courriel" pas "email", "mot de passe" pas "password", "paramètres" pas "settings"',
      "- Espaces insécables : avant : ; ! ? et à l'intérieur de « »",
      '- Ne pas calquer les tournures anglaises : "Are you sure?" → "Supprimer le projet ? Cette action est irréversible."',
      '',
      'RÈGLES TEXTE UI',
      '- Erreurs : décrire le problème + proposer une action',
      '- Confirmations : indiquer les conséquences',
      '',
      'FORMATAGE',
      '- Date : JJ/MM/AAAA. Nombres : 1 000,00',
      '- Guillemets français : « texte » (avec espaces insécables)',
    ].join('\n'),
  },

  {
    code: 'es',
    name: 'Spanish',
    aliases: ['es-ES'],
    flag: '🇪🇸',
    localeSkill: [
      'ESTILO Y TONO',
      '- Usar "usted" en UI profesional; "tú" solo si el producto es casual',
      '- Tono: profesional, claro, amigable. Evitar lenguaje corporativo excesivo',
      '- Botones y acciones: infinitivo. "Guardar", "Eliminar", "Volver"',
      '',
      'GRAMÁTICA Y PLURALES',
      '- 2 formas de plural (singular, plural): 1 elemento, 2 elementos',
      '- Puntuación invertida obligatoria: ¿pregunta? ¡exclamación!',
      '',
      'ANTIPATRONES Y ERRORES COMUNES',
      '- Preferir español latinoamericano neutro salvo que se dirija específicamente a España',
      '- Anglicismos: "configuración" no "settings", "descargar" no "downloadear"',
      '- Falsos amigos: "actualmente" ≠ "actually", "soportar" ≠ "support"',
      '',
      'REGLAS DE TEXTO UI',
      '- Errores: describir qué pasó + qué puede hacer el usuario',
      '- Confirmaciones: indicar consecuencias. "¿Eliminar el proyecto? Se perderán todas las traducciones."',
      '',
      'FORMATO',
      '- Fecha: DD/MM/AAAA. Números: 1.000,00',
      '- Comillas: «texto» o "texto"',
    ].join('\n'),
  },

  {
    code: 'it',
    name: 'Italian',
    aliases: ['it-IT'],
    flag: '🇮🇹',
    localeSkill: [
      'STILE E TONO',
      '- Usare "Lei" (maiuscolo) per rivolgersi agli utenti in contesto professionale',
      '- Tono: professionale, chiaro, cordiale',
      '- Pulsanti e azioni: infinito. "Salvare", "Eliminare", "Tornare"',
      '',
      'GRAMMATICA E PLURALI',
      '- 2 forme di plurale (singolare, plurale): 1 elemento, 2 elementi',
      '- Articoli obbligatori prima dei sostantivi (il progetto, le impostazioni)',
      '',
      'ANTIPATTERN ED ERRORI COMUNI',
      '- Anglicismi: "impostazioni" non "settings", "scaricare" non "downloadare"',
      '- Articoli: non ometterli come in inglese',
      '',
      'FORMATTAZIONE',
      '- Data: GG/MM/AAAA. Numeri: 1.000,00',
      '- Virgolette: «testo» o "testo"',
    ].join('\n'),
  },

  {
    code: 'pt',
    name: 'Portuguese',
    aliases: ['pt-PT', 'pt-BR'],
    flag: '🇵🇹',
    localeSkill: [
      'ESTILO E TOM',
      '- Usar "você" para se dirigir aos usuários (português brasileiro padrão)',
      '- Tom: profissional, claro, amigável',
      '- Botões e ações: infinitivo. "Salvar", "Excluir", "Voltar"',
      '',
      'GRAMÁTICA E PLURAIS',
      '- 2 formas de plural (singular, plural): 1 elemento, 2 elementos',
      '- Português brasileiro preferido, salvo se direcionado a Portugal (pt-PT)',
      '',
      'ANTIPADRÕES E ERROS COMUNS',
      '- Falsos amigos com espanhol: "pasta" = folder (não massa alimentícia)',
      '- Anglicismos: "configurações" não "settings"',
      '',
      'FORMATAÇÃO',
      '- Data: DD/MM/AAAA. Números: 1.000,00',
    ].join('\n'),
  },

  {
    code: 'nl',
    name: 'Dutch',
    aliases: ['nl-NL', 'nl-BE'],
    flag: '🇳🇱',
    localeSkill: [
      '- Use informal "je/jij" for modern UI; formal "u" for official/legal',
      '- 2 plural forms (singular, plural)',
      '- Compound words written together (gebruikersinstellingen)',
      '- Date format: DD-MM-YYYY. Numbers: 1.000,00',
      '- Distinguish between Dutch (NL) and Flemish (BE) conventions if needed',
    ].join('\n'),
  },

  {
    code: 'pl',
    name: 'Polish',
    aliases: ['pl-PL'],
    flag: '🇵🇱',
    localeSkill: [
      'STYL I TON',
      '- Formy grzecznościowe: "Pan/Pani" lub formy bezosobowe w UI',
      '- Ton: profesjonalny, rzeczowy, przyjazny',
      '- Przyciski i akcje: bezokolicznik. "Zapisać", "Usunąć", "Powrócić"',
      '',
      'GRAMATYKA I LICZBA MNOGA',
      '- 3 formy liczby mnogiej (one, few, many): 1 element, 2 elementy, 5 elementów',
      '- Deklinacja: weryfikuj przypadki rzeczowników w kontekście',
      '',
      'ANTYWZORCE I CZĘSTE BŁĘDY',
      '- Anglicyzmy: "ustawienia" nie "setingi", "pobierz" nie "downloaduj"',
      '- Polszczyzna ma bogatą deklinację — nie upraszczaj form',
      '',
      'FORMATOWANIE',
      '- Data: DD.MM.RRRR. Liczby: 1 000,00',
      '- Cudzysłowy: „tekst" (polskie cudzysłowy)',
    ].join('\n'),
  },

  {
    code: 'cs',
    name: 'Czech',
    aliases: ['cs-CZ'],
    flag: '🇨🇿',
    localeSkill: [
      '- Use formal "vy" (or polite "Vy") for addressing users',
      '- 3 plural forms (one, few, other): 1 položka, 2 položky, 5 položek',
      '- Rich declension system — nouns change form based on grammatical case',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- Use Czech quotation marks: „text"',
    ].join('\n'),
  },

  {
    code: 'sk',
    name: 'Slovak',
    aliases: ['sk-SK'],
    flag: '🇸🇰',
    localeSkill: [
      '- Use formal "vy" for addressing users',
      '- 3 plural forms (one, few, other): 1 položka, 2 položky, 5 položiek',
      '- Similar to Czech but with distinct vocabulary and grammar rules',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- Use Slovak quotation marks: „text"',
    ].join('\n'),
  },

  {
    code: 'hu',
    name: 'Hungarian',
    aliases: ['hu-HU'],
    flag: '🇭🇺',
    localeSkill: [
      '- Use formal register (Ön) for addressing users in business context',
      '- 2 plural forms (singular, plural). Noun stays singular after a numeral',
      '- Agglutinative language — suffixes convey case, possession, etc.',
      '- Date format: YYYY.MM.DD. Numbers: 1 000,00',
      '- Word order is flexible but verb-focus (topic-prominent language)',
    ].join('\n'),
  },

  {
    code: 'ro',
    name: 'Romanian',
    aliases: ['ro-RO'],
    flag: '🇷🇴',
    localeSkill: [
      '- Use formal "dumneavoastră" for business UI; informal "tu" for casual apps',
      '- 3 plural forms (one, few, other): 1 element, 2 elemente, 20 de elemente',
      '- Definite article is suffixed to the noun (elementul, not el element)',
      '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
      '- Use Romanian diacritics: ă, â, î, ș, ț (not cedilla variants)',
    ].join('\n'),
  },

  {
    code: 'bg',
    name: 'Bulgarian',
    aliases: ['bg-BG'],
    flag: '🇧🇬',
    localeSkill: [
      '- Use formal "Вие" for addressing users',
      '- 2 plural forms (singular, plural)',
      '- Cyrillic script — definite article is suffixed (-та, -то, -тът)',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- Use Bulgarian quotation marks: „text"',
    ].join('\n'),
  },

  {
    code: 'hr',
    name: 'Croatian',
    aliases: ['hr-HR'],
    flag: '🇭🇷',
    localeSkill: [
      '- Use formal "Vi" for addressing users',
      '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
      '- Latin script with diacritics: č, ć, đ, š, ž',
      '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
      '- Distinguish from Serbian (Cyrillic) — Croatian uses Latin script',
    ].join('\n'),
  },

  {
    code: 'sl',
    name: 'Slovenian',
    aliases: ['sl-SI'],
    flag: '🇸🇮',
    localeSkill: [
      '- Use formal "vi" for addressing users',
      '- 4 plural forms (one, two, few, other): includes dual form',
      '- Dual form is grammatically required (2 elementa, not 2 elementi)',
      '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
      '- Distinguish from Serbian/Croatian despite similarities',
    ].join('\n'),
  },

  {
    code: 'nb',
    name: 'Norwegian Bokmål',
    aliases: ['nb-NO', 'no', 'nn-NO'],
    flag: '🇳🇴',
    localeSkill: [
      'STIL OG TONE',
      '- Bruk uformelt "du" (ikke "De") — norsk foretrekker direkte tiltale',
      '- Bokmål (skriftstandard) — ikke nynorsk, med mindre prosjektet krever det',
      '- Tone: klar, direkte, vennlig. Ikke byråkratisk, ikke for uformell',
      '- Knapper og handlinger: imperativ. "Lagre", "Slette", "Gå tilbake"',
      '',
      'GRAMMATIKK OG FLERTALL',
      '- 2 flertallsformer (entall, flertall): 1 element, 2 elementer',
      '- Norsk har to grammatiske kjønn i praksis (felleskjønn og intetkjønn): en fil, et prosjekt',
      '- Bestemt form: filen, prosjektet — bruk bestemt form når man refererer til noe kjent',
      '',
      'ANTIMØNSTRE OG VANLIGE FEIL',
      '- Unngå anglisismer: "innstillinger" ikke "settings", "laste ned" ikke "downloade"',
      '- "logge inn" ikke "logge in" — norsk bruker "inn", ikke engelsk "in"',
      '- Ikke oversett ordrett fra engelsk: "Are you sure?" → "Slette prosjektet? Alle oversettelser går tapt."',
      '- Unngå sammenblandinger med svensk/dansk — kontroller falske venner',
      '- "Fil" er hankjønn (en fil), "mappe" er hunkjønn (ei/en mappe)',
      '',
      'UI-TEKSTREGLER',
      '- Feilmeldinger: hva skjedde + hva brukeren kan gjøre. "Tilkoblingen ble brutt. Sjekk nettverket og prøv igjen."',
      '- Bekreftelser: angi konsekvenser tydelig',
      '- Tomme tilstander: foreslå neste steg. "Ingen oversettelser ennå. Importer en fil eller legg til nøkler manuelt."',
      '',
      'FORMATERING',
      '- Dato: DD.MM.ÅÅÅÅ. Tall: 1 000,00 (mellomrom = tusenskilletegn, komma = desimal)',
      '- Anførselstegn: «tekst» (guillemets)',
      '- Sammensatte ord: skriv som ett ord (brukerinnstillinger, prosjektoversikt)',
    ].join('\n'),
  },

  {
    code: 'sv',
    name: 'Swedish',
    aliases: ['sv-SE'],
    flag: '🇸🇪',
    localeSkill: [
      'STIL OCH TON',
      '- Använd informellt "du" (inte formellt "ni") — svenska föredrar direkt tilltal (du-reformen)',
      '- Ton: tydlig, direkt, vänlig. Inte byråkratisk, inte för informell',
      '- Knappar och åtgärder: imperativ. "Spara", "Ta bort", "Gå tillbaka"',
      '',
      'GRAMMATIK OCH PLURAL',
      '- 2 pluralformer (singular, plural): 1 element, 2 element',
      '- Svenska har två grammatiska genus: en-ord (utrum) och ett-ord (neutrum): en fil, ett projekt',
      '- Bestämd form: filen, projektet — använd bestämd form vid referens till känt objekt',
      '',
      'ANTIMÖNSTER OCH VANLIGA FEL',
      '- Undvik anglicismer: "inställningar" inte "settings", "ladda ner" inte "downloada"',
      '- "Logga in" inte "logga in sig" — reflexivform är fel här',
      '- Översätt inte ordagrant från engelska: "Are you sure?" → "Ta bort projektet? Alla översättningar försvinner."',
      '- Falska vänner med norska/danska: "rolig" (sv) = funny, "rolig" (no/da) = calm',
      '- "Semester" (sv) = vacation, inte "semester" som i engelska',
      '- Sammansatta ord: aldrig med mellanslag. "Användarinställningar" (inte "användare inställningar")',
      '',
      'UI-TEXTREGLER',
      '- Felmeddelanden: vad hände + vad användaren kan göra. "Anslutningen bröts. Kontrollera nätverket och försök igen."',
      '- Bekräftelser: ange konsekvenser tydligt',
      '- Tomma tillstånd: föreslå nästa steg. "Inga översättningar ännu. Importera en fil eller lägg till nycklar manuellt."',
      '',
      'FORMATERING',
      '- Datum: ÅÅÅÅ-MM-DD (ISO-standard, svenskt standardformat). Tal: 1 000,00',
      '- Citattecken: "text" (raka citattecken) eller \u201dtext\u201d',
      '- Sammansatta ord: skriv ihop (användarinställningar, projektöversikt)',
    ].join('\n'),
  },

  {
    code: 'da',
    name: 'Danish',
    aliases: ['da-DK'],
    flag: '🇩🇰',
    localeSkill: [
      'STIL OG TONE',
      '- Brug uformelt "du" (ikke formelt "De") — dansk foretrækker uformel tiltale',
      '- Tone: klar, direkte, venlig. Ikke bureaukratisk, ikke for uformel',
      '- Knapper og handlinger: imperativ. "Gem", "Slet", "Gå tilbage"',
      '',
      'GRAMMATIK OG FLERTAL',
      '- 2 flertalsformer (ental, flertal): 1 element, 2 elementer',
      '- Dansk har to grammatiske køn: fælleskøn (en) og intetkøn (et): en fil, et projekt',
      '- Bestemt form: filen, projektet — brug bestemt form ved reference til kendt objekt',
      '',
      'ANTIMØNSTRE OG ALMINDELIGE FEJL',
      '- Undgå anglicismer: "indstillinger" ikke "settings", "hente" ikke "downloade"',
      '- Blødt d (ð-lyd): korrekt udtale påvirker ikke stavning, men vær opmærksom på homofoner',
      '- Oversæt ikke direkte fra engelsk: "Are you sure?" → "Slet projektet? Alle oversættelser vil gå tabt."',
      '- Falske venner med svensk/norsk: "grine" (da) = cry, "grina" (sv) = grin',
      '- "Rar" (da) = nice/sweet, ikke "rare" som i engelsk',
      '',
      'UI-TEKSTREGLER',
      '- Fejlmeddelelser: hvad skete + hvad brugeren kan gøre. "Forbindelsen blev afbrudt. Tjek netværket og prøv igen."',
      '- Bekræftelser: angiv konsekvenser tydeligt',
      '- Tomme tilstande: foreslå næste skridt. "Ingen oversættelser endnu. Importér en fil eller tilføj nøgler manuelt."',
      '',
      'FORMATERING',
      '- Dato: DD-MM-ÅÅÅÅ eller DD.MM.ÅÅÅÅ. Tal: 1.000,00 (punktum = tusindtalsseparator)',
      '- Anførselstegn: »tekst« eller "tekst" (omvendte guillemets er dansk standard)',
      '- Sammensatte ord: skriv som ét ord (brugerindstillinger, projektoversigt)',
    ].join('\n'),
  },

  {
    code: 'fi',
    name: 'Finnish',
    aliases: ['fi-FI'],
    flag: '🇫🇮',
    localeSkill: [
      '- Use passive or impersonal constructions (no formal/informal "you" distinction)',
      '- 2 plural forms (singular, plural) but partitive case often used with numbers',
      '- Finnish words can be very long due to agglutination — keep UI strings concise',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- No grammatical gender; no articles',
    ].join('\n'),
  },

  {
    code: 'el',
    name: 'Greek',
    aliases: ['el-GR'],
    flag: '🇬🇷',
    localeSkill: [
      '- Use formal "εσείς" for addressing users',
      '- 2 plural forms (singular, plural)',
      '- Greek script — ensure proper polytonic/monotonic rendering',
      '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
      '- Watch for accent placement — it can change word meaning',
    ].join('\n'),
  },

  {
    code: 'tr',
    name: 'Turkish',
    aliases: ['tr-TR'],
    flag: '🇹🇷',
    localeSkill: [
      '- Use formal "siz" for addressing users (not informal "sen")',
      '- 2 plural forms (singular, plural). Noun after a numeral stays singular',
      '- Agglutinative language — suffixes change word meaning; verify context',
      '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
      '- Dotted İ and dotless I are distinct letters — handle case conversion carefully',
    ].join('\n'),
  },

  {
    code: 'ru',
    name: 'Russian',
    aliases: ['ru-RU'],
    flag: '🇷🇺',
    localeSkill: [
      '- Use formal "вы" (not "ты") for addressing users',
      '- 3 plural forms (one, few, many): 1 элемент, 2 элемента, 5 элементов',
      '- Avoid unnecessary anglicisms (настройки, not сеттинги)',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- Use Russian quotation marks: «text»',
    ].join('\n'),
  },

  {
    code: 'lt',
    name: 'Lithuanian',
    aliases: ['lt-LT'],
    flag: '🇱🇹',
    localeSkill: [
      '- Use formal "jūs" for addressing users',
      '- 3 plural forms (one, few, other): 1 elementas, 2 elementai, 10 elementų',
      '- Lithuanian has complex declension (7 cases)',
      '- Date format: YYYY-MM-DD. Numbers: 1 000,00',
      '- Avoid direct translations from English — Lithuanian syntax differs significantly',
    ].join('\n'),
  },

  {
    code: 'lv',
    name: 'Latvian',
    aliases: ['lv-LV'],
    flag: '🇱🇻',
    localeSkill: [
      '- Use formal "Jūs" for addressing users',
      '- 2 plural forms (one, other): special handling for zero and numbers ending in 1 (except 11)',
      '- Latvian has 7 grammatical cases like Lithuanian',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- Use Latvian diacritics: ā, ē, ī, ū, č, ģ, ķ, ļ, ņ, š, ž',
    ].join('\n'),
  },

  {
    code: 'et',
    name: 'Estonian',
    aliases: ['et-EE'],
    flag: '🇪🇪',
    localeSkill: [
      '- Use formal "teie" for addressing users; "sina" for informal',
      '- 2 plural forms (singular, plural) but partitive case common with numbers',
      '- Estonian has 14 grammatical cases — context-sensitive noun forms',
      '- Date format: DD.MM.YYYY. Numbers: 1 000,00',
      '- No grammatical gender; no future tense — context indicates time',
    ].join('\n'),
  },

  {
    code: 'sr',
    name: 'Serbian',
    aliases: [],
    flag: '🇷🇸',
    localeSkill: [
      '- Use formal "Vi" for addressing users',
      '- 3 plural forms (one, few, other): 1 stavka, 2 stavke, 5 stavki',
      '- Can use Cyrillic or Latin script — Cyrillic is official but Latin widely used online',
      '- Date format: DD.MM.YYYY. Numbers: 1.000,00',
      '- Ekavian pronunciation/spelling preferred for standard Serbian',
    ].join('\n'),
  },

  {
    code: 'ja',
    name: 'Japanese',
    aliases: [],
    flag: '🇯🇵',
    localeSkill: [
      '- Use polite/formal register (です/ます form) for UI',
      '- No plural forms — quantity expressed via counters and context',
      '- CJK script: no spaces between words; use appropriate kanji/hiragana/katakana mix',
      '- Date format: YYYY/MM/DD or YYYY年MM月DD日. Numbers: 1,000',
      '- Katakana for foreign loanwords; keep technical terms consistent',
    ].join('\n'),
  },

  {
    code: 'ko',
    name: 'Korean',
    aliases: [],
    flag: '🇰🇷',
    localeSkill: [
      '- Use formal polite register (합니다 form) for business UI',
      '- No plural forms — context determines quantity',
      '- Hangul script with spaces between words (unlike Japanese/Chinese)',
      '- Date format: YYYY.MM.DD or YYYY년 MM월 DD일. Numbers: 1,000',
      '- Avoid excessive use of Chinese characters (hanja)',
    ].join('\n'),
  },

  {
    code: 'zh',
    name: 'Chinese',
    aliases: [],
    flag: '🇨🇳',
    localeSkill: [
      '- Use Simplified Chinese characters (zh-CN default)',
      '- No plural forms, no grammatical gender, no articles',
      '- CJK script: no spaces between Chinese characters',
      '- Date format: YYYY年MM月DD日. Numbers: 1,000',
      '- Use Chinese punctuation: 、 (comma) 。 (period) "" (quotes)',
    ].join('\n'),
  },

  {
    code: 'ar',
    name: 'Arabic',
    aliases: [],
    flag: '🇸🇦',
    localeSkill: [
      '- RTL (right-to-left) script — verify text direction in UI',
      '- 6 plural forms (zero, one, two, few, many, other)',
      '- Use Modern Standard Arabic (MSA) for broad audience',
      '- Date format: DD/MM/YYYY (Gregorian). Numbers: use Arabic-Indic or Western digits per context',
      '- Avoid colloquial dialect unless targeting specific region',
    ].join('\n'),
  },

  {
    code: 'hi',
    name: 'Hindi',
    aliases: [],
    flag: '🇮🇳',
    localeSkill: [
      '- Use formal register with honorifics (आप) for addressing users',
      '- 2 plural forms (singular, plural). Postpositions change with gender/number',
      '- Devanagari script — ensure proper rendering and line breaking',
      '- Date format: DD/MM/YYYY. Numbers: use Devanagari or Western digits consistently',
      '- Avoid excessive use of English words; prefer Hindi equivalents for common terms',
    ].join('\n'),
  },

  {
    code: 'th',
    name: 'Thai',
    aliases: [],
    flag: '🇹🇭',
    localeSkill: [
      '- Use polite particles ครับ/ค่ะ for formal register',
      '- No plural forms — quantity expressed via classifiers',
      '- Thai script: no spaces between words (spaces separate sentences/clauses)',
      '- Date format: DD/MM/YYYY (Buddhist Era or Gregorian). Numbers: 1,000.00',
      '- Avoid excessive English transliterations; prefer Thai equivalents',
    ].join('\n'),
  },

  {
    code: 'vi',
    name: 'Vietnamese',
    aliases: [],
    flag: '🇻🇳',
    localeSkill: [
      '- Use formal pronouns: "bạn" (neutral) or "quý khách" (formal business)',
      '- No plural forms — classifiers indicate quantity/type',
      '- Vietnamese uses Latin script with extensive diacritics — never strip diacritics',
      '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
      '- Word order: Subject-Verb-Object; adjectives follow nouns',
    ].join('\n'),
  },

  {
    code: 'id',
    name: 'Indonesian',
    aliases: [],
    flag: '🇮🇩',
    localeSkill: [
      '- Use formal "Anda" (capitalized) for addressing users',
      '- No plural forms — reduplication or context expresses plurality',
      '- Latin script; relatively simple grammar (no gender, no conjugation)',
      '- Date format: DD/MM/YYYY. Numbers: 1.000,00',
      '- Avoid English loanwords when standard Indonesian terms exist',
    ].join('\n'),
  },

  {
    code: 'ms',
    name: 'Malay',
    aliases: [],
    flag: '🇲🇾',
    localeSkill: [
      '- Use formal "Anda" for addressing users',
      '- No plural forms — same as Indonesian (reduplication for emphasis)',
      '- Latin script; similar grammar to Indonesian but vocabulary differs',
      '- Date format: DD/MM/YYYY. Numbers: 1,000.00',
      '- Distinguish from Indonesian: "telefon bimbit" (MY) vs "ponsel" (ID)',
    ].join('\n'),
  },

  {
    code: 'is',
    name: 'Icelandic',
    aliases: [],
    flag: '🇮🇸',
    localeSkill: '',
  },
];

// ─── Lookup Maps ──────────────────────────────────────────────────────────────

/** O(1) lookup by primary code */
export const LOCALE_REGISTRY_MAP: Map<string, LocaleDefinition> = new Map(
  LOCALE_REGISTRY.map((l) => [l.code, l]),
);

/** O(1) lookup by alias → resolves to the primary locale entry */
export const LOCALE_ALIAS_MAP: Map<string, LocaleDefinition> = new Map(
  LOCALE_REGISTRY.flatMap((l) => l.aliases.map((alias) => [alias, l])),
);

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Look up a locale by its primary code OR by alias.
 * Returns undefined if not found.
 */
export function getLocaleDefinition(
  code: string,
): LocaleDefinition | undefined {
  return LOCALE_REGISTRY_MAP.get(code) ?? LOCALE_ALIAS_MAP.get(code);
}

/**
 * Get the human-readable name for a locale code (for Gemini prompts).
 * Falls back to the code itself if not found.
 */
export function getLocaleName(code: string): string {
  return getLocaleDefinition(code)?.name ?? code;
}

/**
 * Get the localeSkill (AI translation guide) for a locale code or alias.
 * Returns undefined if not found or if the skill is empty.
 */
export function getLocaleSkill(code: string): string | undefined {
  const skill = getLocaleDefinition(code)?.localeSkill;
  return skill || undefined;
}

/**
 * Get the emoji flag for a locale code or alias.
 * Returns empty string if not found.
 */
export function getLocaleFlag(code: string): string {
  return getLocaleDefinition(code)?.flag ?? '';
}
