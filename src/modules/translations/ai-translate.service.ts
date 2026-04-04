import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiConfigService, interpolate } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { scoreToLevel } from './quality-constants.js';

const DEFAULT_TARGET_LOCALES: Record<string, string> = {
  uk: 'Ukrainian',
  'nb-NO': 'Norwegian Bokmål',
  sv: 'Swedish',
  'da-DK': 'Danish',
};

const LOCALE_NAMES: Record<string, string> = {
  uk: 'Ukrainian',
  nb: 'Norwegian Bokmål',
  'nb-NO': 'Norwegian Bokmål',
  sv: 'Swedish',
  da: 'Danish',
  'da-DK': 'Danish',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  nl: 'Dutch',
  fi: 'Finnish',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  cs: 'Czech',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  sr: 'Serbian',
  ru: 'Russian',
};

@Injectable()
export class AiTranslateService {
  constructor(
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly aiUsageService: AiUsageService,
  ) {}

  async translate(
    text: string,
    projectId?: string,
    context?: string,
    targetLocales?: string[],
    localeGuidance?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const aiCfg = await this.aiConfig.getConfig();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: aiCfg.model });

    // If targetLocales is explicitly provided (even empty), respect it.
    // Only fall back to DEFAULT_TARGET_LOCALES when targetLocales is undefined.
    const localeEntries = targetLocales
      ? targetLocales.map((code) => [code, LOCALE_NAMES[code] ?? code])
      : Object.entries(DEFAULT_TARGET_LOCALES);

    if (localeEntries.length === 0) {
      return {};
    }

    const languages = localeEntries
      .map(([code, name]) => `${name} (${code})`)
      .join(', ');

    const translateVars: Record<string, string> = { text, languages };
    if (context) translateVars.context = context;
    let prompt = interpolate(aiCfg.translatePrompt, translateVars);

    // Inject locale-specific guidance when available
    if (localeGuidance) {
      const guidanceLines = localeEntries
        .filter(([code]) => localeGuidance[code])
        .map(([code, name]) => `- ${name} (${code}): ${localeGuidance[code]}`);
      if (guidanceLines.length) {
        prompt += `\n\nLanguage-specific guidance:\n${guidanceLines.join('\n')}`;
      }
    }

    let raw: string;
    try {
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Gemini API error: ${msg}`);
    }

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }

    // Filter response to only include requested locales
    const requestedCodes = new Set(localeEntries.map(([code]) => code));
    const filtered = Object.fromEntries(
      Object.entries(parsed).filter(([code]) => requestedCodes.has(code)),
    );

    if (projectId) {
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(raw.length / 4);
      await this.aiUsageService
        .logUsage({
          projectId,
          operation: 'translate',
          inputTokens,
          outputTokens,
          model: aiCfg.model,
          metadata: {
            textLength: text.length,
            localeCount: Object.keys(filtered).length,
          },
        })
        .catch(() => {}); // Non-blocking: don't fail the translation if logging fails
    }

    return filtered;
  }

  /**
   * Translate text to specific target locales (subset of all locales).
   * Used by auto-translate worker to translate only missing locales.
   * @param projectId Optional project ID for usage tracking
   */
  async translateForLocales(
    text: string,
    targetLocales: Record<string, string>,
    projectId?: string,
    localeGuidance?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const aiCfg = await this.aiConfig.getConfig();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: aiCfg.model });

    const languages = Object.entries(targetLocales)
      .map(([code, name]) => `${name} (${code})`)
      .join(', ');

    let prompt = interpolate(aiCfg.translatePrompt, { text, languages });

    // Inject locale-specific guidance when available
    if (localeGuidance) {
      const guidanceLines = Object.entries(targetLocales)
        .filter(([code]) => localeGuidance[code])
        .map(([code, name]) => `- ${name} (${code}): ${localeGuidance[code]}`);
      if (guidanceLines.length) {
        prompt += `\n\nLanguage-specific guidance:\n${guidanceLines.join('\n')}`;
      }
    }

    let raw: string;
    try {
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Gemini API error: ${msg}`);
    }

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, string>;
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }

    // Filter to only requested locales
    const requestedCodes = new Set(Object.keys(targetLocales));
    const filtered = Object.fromEntries(
      Object.entries(parsed).filter(([code]) => requestedCodes.has(code)),
    );

    if (projectId) {
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(raw.length / 4);
      await this.aiUsageService
        .logUsage({
          projectId,
          operation: 'auto_translate',
          inputTokens,
          outputTokens,
          model: aiCfg.model,
          metadata: {
            textLength: text.length,
            localeCount: Object.keys(filtered).length,
          },
        })
        .catch(() => {});
    }

    return filtered;
  }

  /**
   * Reviews all translations in a batch with a single Gemini call per chunk.
   * Returns per-locale scores AND per-key context need info.
   * @param items    Each item has a key name, optional source/context, and a locale→translation map.
   * @param chunkSize Max keys per Gemini request (default 5).
   * @param chunkTimeoutMs Per-chunk Gemini timeout in ms (default 90s). Timed-out chunks are skipped.
   */
  async bulkCheckQuality(
    items: Array<{
      key: string;
      source: string | null;
      context: string | null;
      translations: Record<string, string>;
    }>,
    chunkSize = 5,
    chunkTimeoutMs = 90_000,
    projectId?: string,
    localeGuidance?: Record<string, string>,
  ): Promise<{
    results: Record<
      string,
      Record<
        string,
        { score: number; level: 'green' | 'yellow' | 'red'; comment: string }
      >
    >;
    contextInfo: Record<
      string,
      { need: 'required' | 'useful' | 'none'; reason: string | null }
    >;
    skippedKeys: string[];
  }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const aiCfg = await this.aiConfig.getConfig();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: aiCfg.model });

    const results: Record<
      string,
      Record<
        string,
        { score: number; level: 'green' | 'yellow' | 'red'; comment: string }
      >
    > = {};
    const contextInfo: Record<
      string,
      { need: 'required' | 'useful' | 'none'; reason: string | null }
    > = {};
    const skippedKeys: string[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const prompt = this.buildBulkQualityPrompt(
        chunk,
        aiCfg.contextDetectionPrompt,
        localeGuidance,
      );

      let raw: string;
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('chunk_timeout')), chunkTimeoutMs),
        );
        const geminiCall = model
          .generateContent(prompt)
          .then((r) => r.response.text().trim());
        raw = await Promise.race([geminiCall, timeout]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'chunk_timeout') {
          chunk.forEach((item) => skippedKeys.push(item.key));
          continue;
        }
        throw new BadGatewayException(`Gemini API error: ${msg}`);
      }

      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Parse response — handles format with contextNeed + locales wrapper
      for (const [key, value] of Object.entries(parsed)) {
        const keyData = value as Record<string, unknown>;

        // Detect format: structured (has "locales" key) vs flat (locale map directly)
        const hasLocalesKey =
          keyData && typeof keyData === 'object' && 'locales' in keyData;

        if (hasLocalesKey) {
          // Structured: { contextNeed: string, contextReason: string, locales: { locale: { score, comment } } }
          const need = keyData.contextNeed as string | undefined;
          if (need === 'required' || need === 'useful' || need === 'none') {
            contextInfo[key] = {
              need,
              reason:
                typeof keyData.contextReason === 'string'
                  ? keyData.contextReason
                  : null,
            };
          } else if (typeof keyData.contextRequired === 'boolean') {
            // Backward compat: old format with boolean contextRequired
            contextInfo[key] = {
              need: keyData.contextRequired ? 'required' : 'none',
              reason: null,
            };
          }
          const localeMap = (keyData.locales ?? {}) as Record<
            string,
            { score: number; comment: string }
          >;
          results[key] = {};
          for (const [locale, r] of Object.entries(localeMap)) {
            if (r && typeof r.score === 'number') {
              const score = Math.min(100, Math.max(1, Math.round(r.score)));
              results[key][locale] = {
                score,
                level: scoreToLevel(score),
                comment: r.comment ?? '',
              };
            }
          }
        } else {
          // Fallback: old flat format { locale: { score, comment } }
          results[key] = {};
          for (const [locale, r] of Object.entries(keyData)) {
            const localeResult = r as { score?: number; comment?: string };
            if (localeResult && typeof localeResult.score === 'number') {
              const score = Math.min(
                100,
                Math.max(1, Math.round(localeResult.score)),
              );
              results[key][locale] = {
                score,
                level: scoreToLevel(score),
                comment: localeResult.comment ?? '',
              };
            }
          }
        }
      }
    }

    if (projectId) {
      const totalLocales = items.reduce(
        (sum, item) => sum + Object.keys(item.translations).length,
        0,
      );
      const inputTokens = Math.ceil(JSON.stringify(items).length / 4);
      const outputTokens = Math.ceil(JSON.stringify(results).length / 4);
      await this.aiUsageService
        .logUsage({
          projectId,
          operation: 'bulk_quality_check',
          inputTokens,
          outputTokens,
          model: (await this.aiConfig.getConfig()).model,
          metadata: { keyCount: items.length, localeCount: totalLocales },
        })
        .catch(() => {});
    }

    return { results, contextInfo, skippedKeys };
  }

  private buildBulkQualityPrompt(
    items: Array<{
      key: string;
      source: string | null;
      context: string | null;
      translations: Record<string, string>;
    }>,
    contextDetectionPrompt: string | null,
    localeGuidance?: Record<string, string>,
  ): string {
    const contextSection = contextDetectionPrompt
      ? `\n${contextDetectionPrompt}\n`
      : '';

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
          (code) =>
            `- ${LOCALE_NAMES[code] ?? code} (${code}): ${localeGuidance[code]}`,
        );
      if (guidanceLines.length) {
        guidanceSection = `\nLanguage-specific guidance:\n${guidanceLines.join('\n')}\n`;
      }
    }

    return `You are a professional translation quality reviewer. Evaluate each translation below.

IMPORTANT — Ambiguity and multiple meanings:
- Many English words have multiple valid meanings. If "source" is present, consider ALL reasonable meanings before judging accuracy.
- If the translation is correct for ANY valid interpretation that makes sense in a software/product UI, treat it as accurate.
- Only flag errors when the translation genuinely cannot correspond to any valid interpretation of the source.
- If "context" is present, use it to determine the correct meaning and evaluate more precisely.
${contextSection}${guidanceSection}
Score each translation on a 1–100 scale:
- 95–100: Excellent — accurate, natural, production-ready
- 80–94: Very strong — minor improvement opportunities
- 60–79: Understandable but clearly imperfect
- 1–59: Significant errors, needs rework

If "source" is present, compare translation accuracy to it. If "source" is null, evaluate language quality alone.

Comment rules:
- score 95–100: comment should be empty string
- score 80–94: comment must explain what could still be improved
- score below 80: comment must explain the main issue
- keep comment practical and concise, up to 60 words

Return ONLY valid JSON with no markdown, no explanation, no extra keys:
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
${JSON.stringify(items, null, 2)}`;
  }

  async checkQuality(
    source: string,
    translation: string,
    locale: string,
    mode: 'translation_quality' | 'language_quality' = 'translation_quality',
    projectId?: string,
    context?: string,
    localeGuidance?: string,
  ): Promise<{
    score: number;
    level: 'green' | 'yellow' | 'red';
    comment: string;
    contextNeed: 'required' | 'useful' | 'none';
    contextReason: string | null;
  }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const aiCfg = await this.aiConfig.getConfig();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: aiCfg.model });

    const template =
      mode === 'translation_quality'
        ? aiCfg.qualityTranslatePrompt
        : aiCfg.qualityLanguagePrompt;

    const vars: Record<string, string> = { source, translation, locale };
    if (context) vars.context = context;

    // When source and translation are identical, hint the AI to check for untranslated text
    const identicalHint =
      mode === 'translation_quality' && source.trim() === translation.trim()
        ? `\n\nIMPORTANT: The translation is IDENTICAL to the English source text. This is often a sign that the text was not translated at all. Some words (like "taxi", "hotel", "internet") are legitimately the same across languages — if so, score normally. But if this is a phrase or word that should differ in ${locale}, score it very low (1-3) and comment that it appears untranslated.`
        : '';

    const guidanceHint = localeGuidance
      ? `\n\nLanguage-specific guidance for ${locale}: ${localeGuidance}`
      : '';

    const prompt = interpolate(template, vars) + identicalHint + guidanceHint;

    let raw: string;
    try {
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Gemini API error: ${msg}`);
    }

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as {
        score: number;
        comment: string;
        contextNeed?: string;
        contextReason?: string;
      };
      const score = Math.min(100, Math.max(1, Math.round(parsed.score)));
      const level = scoreToLevel(score);
      const need = parsed.contextNeed;
      const contextNeed: 'required' | 'useful' | 'none' =
        need === 'required' || need === 'useful' ? need : 'none';
      const contextReason =
        contextNeed !== 'none' && typeof parsed.contextReason === 'string'
          ? parsed.contextReason
          : null;
      const result = {
        score,
        level,
        comment: parsed.comment ?? '',
        contextNeed,
        contextReason,
      };

      if (projectId) {
        const inputTokens = Math.ceil(prompt.length / 4);
        const outputTokens = Math.ceil(raw.length / 4);
        await this.aiUsageService
          .logUsage({
            projectId,
            operation: 'quality_check',
            inputTokens,
            outputTokens,
            model: aiCfg.model,
            metadata: { locale, mode },
          })
          .catch(() => {});
      }

      return result;
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
