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
