import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { scoreToLevel } from './quality-constants.js';
import { getLocaleName } from './locale-registry.js';
import {
  buildBulkQualityPrompt,
  buildBulkTranslatePrompt,
  buildQualityPrompt as buildQualityPromptPure,
  buildTranslatePrompt as buildTranslatePromptPure,
  extractTranslateRules,
} from './ai-prompt-builder.js';

const BULK_CHUNK_SIZE = 10;

@Injectable()
export class AiTranslateService {
  private readonly logger = new Logger(AiTranslateService.name);

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
  ): Promise<{
    translations: Record<string, string>;
    contextNeed: 'required' | 'useful' | 'none';
    contextReason: string | null;
  }> {
    if (!targetLocales || targetLocales.length === 0) {
      return { translations: {}, contextNeed: 'none', contextReason: null };
    }

    const { results, contextInfo } = await this.bulkTranslate(
      [{ key: '__solo__', text, context, targetLocales }],
      projectId,
      localeGuidance,
    );

    const ctx = contextInfo['__solo__'];
    return {
      translations: results['__solo__'] ?? {},
      contextNeed: ctx?.need ?? 'none',
      contextReason: ctx?.reason ?? null,
    };
  }

  /**
   * Translate multiple entries (key + text) to their per-item targetLocales in a single bulk call.
   * Processes entries in chunks of BULK_CHUNK_SIZE (10) per Gemini request.
   * On parse failure for a chunk, skips those keys and continues.
   */
  async bulkTranslate(
    entries: Array<{
      key: string;
      text: string;
      context?: string;
      targetLocales?: string[];
      previousComment?: string | null;
    }>,
    projectId?: string,
    localeGuidance?: Record<string, string>,
  ): Promise<{
    results: Record<string, Record<string, string>>;
    contextInfo: Record<
      string,
      { need: 'required' | 'useful' | 'none'; reason: string | null }
    >;
  }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const aiCfg = await this.aiConfig.getConfig();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: aiCfg.model,
      generationConfig: { temperature: 1.0 },
    });

    if (projectId) await this.aiUsageService.assertDailyLimit(projectId);

    const results: Record<string, Record<string, string>> = {};
    const contextInfo: Record<
      string,
      { need: 'required' | 'useful' | 'none'; reason: string | null }
    > = {};
    const skippedKeys: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let chunksProcessed = 0;

    // Collect all unique locale codes across entries for guidance section
    const allLocaleCodes = new Set<string>();
    for (const e of entries) {
      const codes = e.targetLocales ?? [];
      for (const code of codes) allLocaleCodes.add(code);
    }

    // Build locale guidance section from all referenced locales
    let localeGuidanceSection = '';
    if (localeGuidance) {
      const guidanceLines = [...allLocaleCodes]
        .filter((code) => localeGuidance[code])
        .map(
          (code) =>
            `- ${getLocaleName(code)} (${code}): ${localeGuidance[code]}`,
        );
      if (guidanceLines.length) {
        localeGuidanceSection = `Language-specific guidance:\n${guidanceLines.join('\n')}`;
      }
    }

    const translateRules = extractTranslateRules(aiCfg.translatePrompt);

    for (let i = 0; i < entries.length; i += BULK_CHUNK_SIZE) {
      const chunk = entries.slice(i, i + BULK_CHUNK_SIZE);

      const prompt = buildBulkTranslatePrompt(
        chunk.map((e) => ({
          ...e,
          previousQualityNote: e.previousComment ?? undefined,
        })),
        translateRules,
        aiCfg.contextDetectionPrompt,
        localeGuidanceSection,
      );

      let raw: string;
      try {
        const result = await model.generateContent(prompt);
        raw = result.response.text().trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadGatewayException(`Gemini API error: ${msg}`);
      }

      totalInputTokens += Math.ceil(prompt.length / 4);
      totalOutputTokens += Math.ceil(raw.length / 4);
      chunksProcessed++;

      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch {
        this.logger.warn(
          `bulkTranslate: failed to parse chunk ${chunksProcessed} response, skipping ${chunk.length} keys`,
        );
        chunk.forEach((e) => skippedKeys.push(e.key));
        continue;
      }

      // New format: { key: { contextNeed, contextReason, translations: { locale: value } } }
      for (const [key, value] of Object.entries(parsed)) {
        const entry = value as {
          contextNeed?: string;
          contextReason?: string;
          translations?: Record<string, string>;
        };
        const need = entry.contextNeed;
        if (need === 'required' || need === 'useful' || need === 'none') {
          contextInfo[key] = {
            need,
            reason:
              typeof entry.contextReason === 'string'
                ? entry.contextReason
                : null,
          };
        }
        if (entry.translations && typeof entry.translations === 'object') {
          const requestedCodes = new Set(
            chunk.find((c) => c.key === key)?.targetLocales ?? [],
          );
          results[key] = Object.fromEntries(
            Object.entries(entry.translations).filter(
              ([code]) => requestedCodes.size === 0 || requestedCodes.has(code),
            ),
          );
        }
      }
    }

    if (projectId) {
      await this.aiUsageService
        .logUsage({
          projectId,
          operation: 'bulk_translate',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          model: aiCfg.model,
          metadata: {
            keyCount: entries.length,
            localeCount: allLocaleCodes.size,
            chunksProcessed,
            skippedKeys,
          },
        })
        .catch(() => {});
    }

    return { results, contextInfo };
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
    context?: string | null,
    previousComment?: string | null,
  ): Promise<{
    translations: Record<string, string>;
    contextNeed: 'required' | 'useful' | 'none' | null;
    contextReason: string | null;
  }> {
    const codes = Object.keys(targetLocales);
    if (codes.length === 0) {
      return { translations: {}, contextNeed: null, contextReason: null };
    }

    const { results, contextInfo } = await this.bulkTranslate(
      [
        {
          key: '__solo__',
          text,
          context: context ?? undefined,
          targetLocales: codes,
          previousComment: previousComment ?? undefined,
        },
      ],
      projectId,
      localeGuidance,
    );

    const info = contextInfo['__solo__'];
    return {
      translations: results['__solo__'] ?? {},
      contextNeed: info?.need ?? null,
      contextReason: info?.reason ?? null,
    };
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
      previousComment?: string | null;
    }>,
    chunkSize = 5,
    chunkTimeoutMs = 15_000,
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
    const model = genAI.getGenerativeModel({
      model: aiCfg.model,
      generationConfig: { temperature: 0.1 },
    });

    if (projectId) await this.aiUsageService.assertDailyLimit(projectId);

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

    // Items with no source (language-quality mode) are skipped — score 1 without an AI call.
    for (const item of items) {
      if (item.source === null) {
        results[item.key] = Object.fromEntries(
          Object.keys(item.translations).map((locale) => [
            locale,
            {
              score: 1,
              level: scoreToLevel(1),
              comment: 'No source text — quality check skipped',
            },
          ]),
        );
      }
    }
    const itemsWithSource = items.filter((item) => item.source !== null);

    for (let i = 0; i < itemsWithSource.length; i += chunkSize) {
      const chunk = itemsWithSource.slice(i, i + chunkSize);
      const prompt = buildBulkQualityPrompt(
        chunk,
        localeGuidance,
        aiCfg.qualityTranslatePrompt,
        aiCfg.contextDetectionPrompt ?? undefined,
      );

      let raw: string;
      try {
        const geminiCall = model
          .generateContent(prompt)
          .then((r) => r.response.text().trim());

        if (chunkTimeoutMs > 0) {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('chunk_timeout')),
              chunkTimeoutMs,
            ),
          );
          raw = await Promise.race([geminiCall, timeout]);
        } else {
          // No timeout — let Gemini take as long as needed (standalone worker)
          raw = await geminiCall;
        }
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

    // Placeholder integrity — AI cannot reliably detect renamed placeholders
    const ph = (s: string) => new Set(s.match(/{{(\w+)}}/g) ?? []);
    for (const item of items) {
      if (!item.source) continue;
      const src = ph(item.source);
      if (!src.size) continue;
      for (const [locale, val] of Object.entries(item.translations)) {
        const bad = [...src].filter((p) => !ph(val).has(p));
        if (!bad.length) continue;
        results[item.key] ??= {};
        results[item.key][locale] = {
          score: 1,
          level: scoreToLevel(1),
          comment: `Placeholder mismatch — missing: ${bad.join(', ')}`,
        };
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

  /**
   * Build the translate prompt string without making a Gemini call.
   * Used both by translate/translateForLocales internally and by the preview endpoint.
   */
  async buildTranslatePrompt(
    text: string,
    targetLocales: Record<string, string>,
    localeGuidance?: Record<string, string>,
    context?: string,
    includeContextDetection?: boolean,
  ): Promise<string> {
    const aiCfg = await this.aiConfig.getConfig();
    return buildTranslatePromptPure(
      text,
      targetLocales,
      localeGuidance,
      context,
      includeContextDetection,
      aiCfg,
    );
  }

  /**
   * Build the quality check prompt string without making a Gemini call.
   * Used only by the prompt-preview endpoint — actual quality checks go through bulkCheckQuality.
   */
  async buildQualityPrompt(
    source: string,
    translation: string,
    locale: string,
    mode: 'translation_quality' | 'language_quality' = 'translation_quality',
    context?: string,
    localeGuidance?: string,
  ): Promise<string> {
    const aiCfg = await this.aiConfig.getConfig();
    return buildQualityPromptPure(
      source,
      translation,
      locale,
      mode,
      context,
      localeGuidance,
      aiCfg,
    );
  }

  async checkQuality(
    source: string,
    translation: string,
    locale: string,
    _mode: 'translation_quality' | 'language_quality' = 'translation_quality',
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
    const items = [
      {
        key: '__solo__',
        source: source || null,
        context: context ?? null,
        translations: { [locale]: translation },
      },
    ];

    const guidanceMap = localeGuidance
      ? { [locale]: localeGuidance }
      : undefined;

    const { results, contextInfo, skippedKeys } = await this.bulkCheckQuality(
      items,
      1,
      15_000,
      projectId,
      guidanceMap,
    );

    if (skippedKeys.includes('__solo__')) {
      throw new BadGatewayException('Quality check timed out');
    }

    const localeResult = results['__solo__']?.[locale];
    const ctx = contextInfo['__solo__'];

    if (!localeResult) {
      throw new BadGatewayException('Quality check returned no result');
    }

    return {
      score: localeResult.score,
      level: localeResult.level,
      comment: localeResult.comment,
      contextNeed: ctx?.need ?? 'none',
      contextReason: ctx?.reason ?? null,
    };
  }

  // ─── Model validation ─────────────────────────────────────────────────────────

  /**
   * Validates that a Gemini model ID is usable by this system.
   * Makes a single lightweight call and checks the response is valid JSON
   * with the shape our system expects (score, comment fields).
   * Does NOT evaluate translation quality — only contract compatibility.
   */
  async validateModel(
    model: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.1 },
    });

    // Minimal prompt that mirrors our quality-check contract:
    // we expect {"score": number, "comment": string}
    const prompt = `You are a translation quality reviewer. Respond ONLY with valid JSON, no markdown.
Evaluate this translation:
Source: "Hello"
Translation (fr): "Bonjour"
Return: {"score": <1-100>, "comment": "<string>"}`;

    let raw: string;
    try {
      const result = await geminiModel.generateContent(prompt);
      raw = result.response.text();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Model API call failed: ${message}` };
    }

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return {
        valid: false,
        error: `Model did not return valid JSON. Response: ${cleaned.slice(0, 200)}`,
      };
    }

    if (
      typeof parsed.score !== 'number' ||
      typeof parsed.comment !== 'string'
    ) {
      return {
        valid: false,
        error: `Response JSON is missing required fields (score, comment). Got: ${JSON.stringify(parsed).slice(0, 200)}`,
      };
    }

    return { valid: true };
  }
}
