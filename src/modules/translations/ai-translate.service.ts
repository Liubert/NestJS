import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiConfigService, interpolate } from './ai-config.service.js';

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
  ) {}

  async translate(text: string): Promise<Record<string, string>> {
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

    try {
      return JSON.parse(cleaned) as Record<string, string>;
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }
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
      const prompt = this.buildBulkQualityPrompt(
        chunk,
        aiCfg.greenMinScore,
        aiCfg.yellowMinScore,
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
          const score = Math.min(10, Math.max(1, Math.round(r.score)));
          const level: 'green' | 'yellow' | 'red' =
            score >= aiCfg.greenMinScore
              ? 'green'
              : score >= aiCfg.yellowMinScore
                ? 'yellow'
                : 'red';
          results[key][locale] = { score, level, comment: r.comment ?? '' };
        }
      }
    }

    return results;
  }

  private buildBulkQualityPrompt(
    items: Array<{
      key: string;
      source: string | null;
      translations: Record<string, string>;
    }>,
    greenMinScore: number,
    yellowMinScore: number,
  ): string {
    return `You are a professional translation quality reviewer. Evaluate each translation below.

Score each translation 1–10:
- ${greenMinScore}–10: Excellent — accurate, natural, production-ready
- ${yellowMinScore}–${greenMinScore - 1}: Acceptable — understandable but has issues
- 1–${yellowMinScore - 1}: Poor — significant errors, needs rework

If "source" is present, compare translation accuracy to it. If "source" is null, evaluate language quality alone.

Return ONLY valid JSON with no markdown, no explanation, no extra keys:
{
  "<key>": { "<locale>": { "score": <number 1-10>, "comment": "<brief note or 'Looks good'>" } }
}

Translations to review:
${JSON.stringify(items, null, 2)}`;
  }

  async checkQuality(
    source: string,
    translation: string,
    locale: string,
    mode: 'translation_quality' | 'language_quality' = 'translation_quality',
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
      const score = Math.min(10, Math.max(1, Math.round(parsed.score)));
      const level: 'green' | 'yellow' | 'red' =
        score >= aiCfg.greenMinScore
          ? 'green'
          : score >= aiCfg.yellowMinScore
            ? 'yellow'
            : 'red';
      return { score, level, comment: parsed.comment ?? '' };
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
