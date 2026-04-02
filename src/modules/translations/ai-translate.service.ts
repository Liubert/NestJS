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

const TARGET_LOCALES: Record<string, string> = {
  uk: 'Ukrainian',
  'nb-NO': 'Norwegian Bokmål',
  sv: 'Swedish',
  'da-DK': 'Danish',
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

    const languages = Object.entries(TARGET_LOCALES)
      .map(([code, name]) => `${name} (${code})`)
      .join(', ');

    const prompt = interpolate(aiCfg.translatePrompt, { text, languages });

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
          metadata: { textLength: text.length, localeCount: Object.keys(parsed).length },
        })
        .catch(() => {}); // Non-blocking: don't fail the translation if logging fails
    }

    return parsed;
  }

  /**
   * Translate text into specific target locales (used by auto-translate worker).
   * @param text Source text to translate
   * @param targetLocales Map of locale code → language name, e.g. { uk: 'Ukrainian' }
   * @param projectId Optional project ID for usage tracking
   */
  async translateForLocales(
    text: string,
    targetLocales: Record<string, string>,
    projectId?: string,
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

    const prompt = interpolate(aiCfg.translatePrompt, { text, languages });

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
            localeCount: Object.keys(parsed).length,
          },
        })
        .catch(() => {});
    }

    return parsed;
  }

  /**
   * Reviews all translations in a batch with a single Gemini call per chunk.
   * Dramatically more efficient than calling checkQuality() once per key×locale.
   * @param items    Each item has a key name, optional source text, and a locale→translation map.
   * @param chunkSize Max keys per Gemini request (default 5 — keeps prompts small and fast).
   * @param chunkTimeoutMs Per-chunk Gemini timeout in ms (default 90s). Timed-out chunks are skipped.
   */
  async bulkCheckQuality(
    items: Array<{
      key: string;
      source: string | null;
      translations: Record<string, string>;
    }>,
    chunkSize = 5,
    chunkTimeoutMs = 90_000,
    projectId?: string,
  ): Promise<
    Record<
      string,
      Record<
        string,
        { score: number; level: 'green' | 'yellow' | 'red'; comment: string }
      >
    >
  > {
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

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const prompt = this.buildBulkQualityPrompt(chunk);

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
        if (msg === 'chunk_timeout') continue; // skip this chunk, mark those keys as failed
        throw new BadGatewayException(`Gemini API error: ${msg}`);
      }

      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      let parsed: Record<
        string,
        Record<string, { score: number; comment: string }>
      >;
      try {
        parsed = JSON.parse(cleaned) as typeof parsed;
      } catch {
        // chunk failed — skip, those keys get no results
        continue;
      }

      for (const [key, localeMap] of Object.entries(parsed)) {
        results[key] = {};
        for (const [locale, r] of Object.entries(localeMap)) {
          const score = Math.min(100, Math.max(1, Math.round(r.score)));
          const level = scoreToLevel(score);
          results[key][locale] = { score, level, comment: r.comment ?? '' };
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

    return results;
  }

  private buildBulkQualityPrompt(
    items: Array<{
      key: string;
      source: string | null;
      translations: Record<string, string>;
    }>,
  ): string {
    return `You are a professional translation quality reviewer. Evaluate each translation below.

IMPORTANT — Ambiguity and multiple meanings:
- Many English words have multiple valid meanings. If "source" is present, consider ALL reasonable meanings before judging accuracy.
- If the translation is correct for ANY valid interpretation that makes sense in a software/product UI, treat it as accurate.
- Only flag errors when the translation genuinely cannot correspond to any valid interpretation of the source.

Score each translation on a 1–100 scale:
- 95–100: Excellent — accurate, natural, production-ready
- 80–94: Very strong — minor improvement opportunities
- 60–79: Understandable but clearly imperfect
- 1–59: Significant errors, needs rework

If "source" is present, compare translation accuracy to it. If "source" is null, evaluate language quality alone.

Return ONLY valid JSON with no markdown, no explanation, no extra keys:
{
  "<key>": { "<locale>": { "score": <number 1-100>, "comment": "<brief note or empty string>" } }
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
  ): Promise<{
    score: number;
    level: 'green' | 'yellow' | 'red';
    comment: string;
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

    const prompt = interpolate(template, { source, translation, locale });

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
      const parsed = JSON.parse(cleaned) as { score: number; comment: string };
      const score = Math.min(100, Math.max(1, Math.round(parsed.score)));
      const level = scoreToLevel(score);
      const result = { score, level, comment: parsed.comment ?? '' };

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
