import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TARGET_LOCALES: Record<string, string> = {
  uk: 'Ukrainian',
  'nb-NO': 'Norwegian Bokmål',
  sv: 'Swedish',
  'da-DK': 'Danish',
};

@Injectable()
export class AiTranslateService {
  constructor(private readonly config: ConfigService) {}

  async translate(text: string): Promise<Record<string, string>> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const langList = Object.entries(TARGET_LOCALES)
      .map(([code, name]) => `${name} (${code})`)
      .join(', ');

    const prompt = `You are a software localization assistant. Translate the following English UI text into the specified languages.

Rules:
- Use natural, concise wording suitable for UI labels and short phrases
- Preserve any placeholders, variables, or formatting tokens exactly (e.g. {{name}}, %s, {count})
- Return ONLY a valid JSON object with language codes as keys and translated strings as values
- No explanations, no commentary, no markdown fences — only raw JSON

Target languages: ${langList}

English text: "${text}"

Required output format: {"uk": "...", "nb-NO": "...", "sv": "...", "da-DK": "..."}`;

    let raw: string;
    try {
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Gemini API error: ${msg}`);
    }

    // Strip optional markdown code fences
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
}
