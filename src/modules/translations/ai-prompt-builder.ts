import { interpolate } from './ai-config.service.js';
import type { AiConfigEntity } from './entities/ai-config.entity.js';
import { getLocaleName } from './locale-registry.js';

/**
 * Strips per-item template variables and the output-format block from translatePrompt,
 * leaving only the reusable rules section for use in bulk prompts.
 */
export function extractTranslateRules(translatePrompt: string): string {
  const perItemPatterns = [
    /^Target languages:/,
    /^English text:/,
    /^Context \(if provided\):/,
    /^- If context is (present|empty|not provided)/,
    /\{\{(languages|text|context)\}\}/,
  ];
  const beforeFormat = translatePrompt.split(/\nRequired output format:/)[0];
  const filtered = beforeFormat
    .split('\n')
    .filter((line) => !perItemPatterns.some((p) => p.test(line.trim())));
  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts the reusable evaluation criteria (Checks, Scoring, context-need rules) from
 * the per-item qualityTranslatePrompt template, stripping the per-item I/O header
 * (Source/Translation/Mode/context declaration lines) and the trailing return format.
 * Works regardless of the exact template structure stored in ai_config.
 */
export function extractQualityCriteria(qualityTranslatePrompt: string): string {
  // Drop everything from "Return ONLY valid JSON" onward
  const beforeReturn = qualityTranslatePrompt.split(
    /\nReturn ONLY valid JSON/,
  )[0];

  // Lines that are part of the per-item I/O wrapper — not reusable as criteria
  const perItemLinePatterns = [
    /\{\{source\}\}/,
    /\{\{translation\}\}/,
    /\{\{meaning_rule\}\}/,
    /\{\{context\}\}/,
    /^Mode:/,
    /^You are evaluating/,
    /^Source \(English\):/,
    /^Translation \(/,
    /^Context \(if provided\):/,
    /^- If context is (present|empty|not provided)/,
  ];

  const filtered = beforeReturn
    .split('\n')
    .filter((line) => !perItemLinePatterns.some((p) => p.test(line.trim())));

  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse excessive blank lines
    .trim()
    .replace(/\{\{locale\}\}/g, 'the target locale'); // {{locale}} in Checks line
}

/**
 * Builds the bulk quality check prompt for a chunk of items.
 */
export function buildBulkQualityPrompt(
  items: Array<{
    key: string;
    source: string | null;
    context: string | null;
    translations: Record<string, string>;
    previousComment?: string | null;
  }>,
  localeGuidance?: Record<string, string>,
  qualityTranslatePrompt?: string,
  contextDetectionPrompt?: string,
): string {
  // Collect all locale codes from items and build guidance section
  let guidanceSection = '';
  if (localeGuidance) {
    const allLocales = new Set<string>();
    for (const item of items) {
      for (const code of Object.keys(item.translations)) {
        allLocales.add(code);
      }
    }
    const guidanceLines = [...allLocales]
      .filter((code) => localeGuidance[code])
      .map(
        (code) => `- ${getLocaleName(code)} (${code}): ${localeGuidance[code]}`,
      );
    if (guidanceLines.length) {
      guidanceSection = `\nLanguage-specific guidance:\n${guidanceLines.join('\n')}\n`;
    }
  }

  const sharedCriteria = qualityTranslatePrompt
    ? extractQualityCriteria(qualityTranslatePrompt)
    : `Checks:
- Grammar, spelling, punctuation (target locale conventions)
- Natural, idiomatic phrasing for software/product UI
- Nuance and meaning preserved
- Placeholders ({{name}}, %s, {count}, {0}) preserved exactly

Scoring (1–100):
- 95–100: excellent, production-ready
- 80–94: strong, minor improvements only
- 60–79: understandable but imperfect
- below 60: significant errors

Comment: empty string if ≥95; otherwise explain the main issue (max 60 words).`;

  return `You are a strict software localization and language quality reviewer. Evaluate each translation below.

Context rule:
- If a key has a "context" field: it is DEFINITIVE — evaluate against that meaning ONLY.
- If a key has no "context" field: accept any translation that fits standard software UI usage.
${guidanceSection}
Identical source/translation rule: if a translation value is IDENTICAL to the source text, treat it as potentially untranslated. Words that are legitimately the same across languages (e.g. "taxi", "hotel", "internet", abbreviations) should be scored normally. Otherwise score very low (1–5) and note it appears untranslated.

If "previousReviewerNote" is present, treat it as prior feedback on an earlier version. Do not penalize for issues already resolved.

${sharedCriteria}, в
${contextDetectionPrompt ?? 'For each key set "contextNeed": "required" if text is genuinely ambiguous, "useful" if context would improve confidence, "none" if meaning is clear. Add "contextReason" (1 sentence, max 30 words) if required or useful.'}

Return ONLY valid JSON:
{
  "<key>": {
    "contextNeed": "<required|useful|none>",
    "contextReason": "<string or null>",
    "locales": {
      "<locale>": { "score": <number 1-100>, "comment": "<string>" }
    }
  }
}

Translations to review:
${JSON.stringify(
  items.map((item) => ({
    key: item.key,
    source: item.source,
    context: item.context,
    translations: item.translations,
    ...(item.previousComment && {
      previousReviewerNote: `Previous reviewer note: ${item.previousComment}`,
    }),
  })),
  null,
  2,
)}`;
}

/**
 * Builds the translate prompt for a single entry (pure, not async).
 * Pass aiCfg obtained from AiConfigService.getConfig().
 */
export function buildTranslatePrompt(
  text: string,
  targetLocales: Record<string, string>,
  localeGuidance: Record<string, string> | undefined,
  context: string | undefined,
  includeContextDetection: boolean | undefined,
  aiCfg: AiConfigEntity,
): string {
  const languages = Object.entries(targetLocales)
    .map(([code, name]) => `${name} (${code})`)
    .join(', ');

  const vars: Record<string, string> = { text, languages };
  if (context) vars.context = context;
  let prompt = interpolate(aiCfg.translatePrompt, vars);

  if (localeGuidance) {
    const guidanceLines = Object.entries(targetLocales)
      .filter(([code]) => localeGuidance[code])
      .map(([code, name]) => `- ${name} (${code}): ${localeGuidance[code]}`);
    if (guidanceLines.length) {
      prompt += `\n\nLanguage-specific guidance:\n${guidanceLines.join('\n')}`;
    }
  }

  if (includeContextDetection) {
    // Remove any existing output format line from the base prompt to avoid conflict
    prompt = prompt.replace(/\nRequired output format:.*$/m, '');

    prompt += `\n\nAlso evaluate whether context about this key's usage would help future quality checks:
- "contextNeed": "required" — text is genuinely ambiguous (e.g. "Train", "Light", "Save", "By", "Draft")
- "contextNeed": "useful" — short/generic, context would improve confidence
- "contextNeed": "none" — meaning is universally clear
Add "contextReason" (1 sentence, max 30 words) if required or useful.

Return ONLY valid JSON in this format (no flat locale keys, only this structure):
{"contextNeed": "<required|useful|none>", "contextReason": "<string or null>", "translations": {"uk": "...", "nb": "...", ...}}`;
  }

  return prompt;
}

/**
 * Builds the quality check prompt for a single entry (pure, not async).
 * Pass aiCfg obtained from AiConfigService.getConfig().
 */
export function buildQualityPrompt(
  source: string,
  translation: string,
  locale: string,
  mode: 'translation_quality' | 'language_quality' = 'translation_quality',
  context: string | undefined,
  localeGuidance: string | undefined,
  aiCfg: AiConfigEntity,
): string {
  const template =
    mode === 'translation_quality'
      ? aiCfg.qualityTranslatePrompt
      : aiCfg.qualityLanguagePrompt;

  const vars: Record<string, string> = { source, translation, locale };
  if (context?.trim()) {
    vars.meaning_rule =
      `Context: "${context.trim()}"\n` +
      `This context is DEFINITIVE — evaluate the translation against it ONLY.`;
  } else {
    vars.meaning_rule = `No context provided. Accept any translation that fits standard software UI usage.`;
  }

  const identicalHint =
    mode === 'translation_quality' && source.trim() === translation.trim()
      ? `\n\nIMPORTANT: The translation is IDENTICAL to the English source text. This is often a sign that the text was not translated at all. Some words (like "taxi", "hotel", "internet") are legitimately the same across languages — if so, score normally. But if this is a phrase or word that should differ in ${locale}, score it very low (1-3) and comment that it appears untranslated.`
      : '';

  const guidanceHint = localeGuidance
    ? `\n\nLanguage-specific guidance for ${locale}: ${localeGuidance}`
    : '';

  return interpolate(template, vars) + identicalHint + guidanceHint;
}

/**
 * Builds the bulk translate prompt for a single chunk of entries.
 */
export function buildBulkTranslatePrompt(
  chunk: Array<{
    key: string;
    text: string;
    context?: string;
    targetLocales?: string[];
  }>,
  translateRules: string,
  contextDetectionPrompt: string | null | undefined,
  localeGuidanceSection: string,
): string {
  const chunkData = chunk.map((e) => {
    const codes = e.targetLocales ?? [];
    return {
      key: e.key,
      text: e.text,
      targetLanguages: codes
        .map((code) => `${getLocaleName(code)} (${code})`)
        .join(', '),
      ...(e.context ? { context: e.context } : {}),
    };
  });

  return (
    `You are a software localization assistant. Translate each entry below.\n\n` +
    `${translateRules}\n\n` +
    `Context rule: if an entry has a "context" field, use it to determine the exact intended meaning. If no context, translate using the most common UI interpretation.\n\n` +
    `${contextDetectionPrompt ?? 'For each key set "contextNeed": "required" if text is genuinely ambiguous, "useful" if context would improve confidence, "none" if meaning is clear. Add "contextReason" (1 sentence, max 30 words) if required or useful.'}\n\n` +
    (localeGuidanceSection ? `${localeGuidanceSection}\n\n` : '') +
    `Return ONLY valid JSON (no markdown, no explanations):\n` +
    `{\n` +
    `  "<key>": {\n` +
    `    "contextNeed": "<required|useful|none>",\n` +
    `    "contextReason": "<string or null>",\n` +
    `    "translations": { "nb": "...", "sv": "..." }\n` +
    `  }\n` +
    `}\n\n` +
    `Entries to translate:\n` +
    `${JSON.stringify(chunkData)}`
  );
}
