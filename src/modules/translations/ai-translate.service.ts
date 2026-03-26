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

  async checkQuality(
    source: string,
    translation: string,
    locale: string,
  ): Promise<{
    score: number;
    level: 'green' | 'yellow' | 'red';
    comment: string | null;
  }> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on this server',
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a strict software localization quality evaluator. Evaluate this UI/product text translation with high professional standards.

Source (English): "${source}"
Translation (${locale}): "${translation}"

Evaluation criteria (be demanding, not generous):
- Meaning accuracy: must fully and accurately convey the source meaning
- Natural wording: must sound native and natural for product/UI usage in that language
- Grammar: must be grammatically correct with no errors
- Placeholders: variables/tokens like {{name}}, %s, {count} must be preserved exactly as-is
- Quality bar: "understandable" is not enough — the translation must be polished and professional

Scoring guide (strict):
- 10: perfect — no issues whatsoever
- 9: very good — only a minor stylistic improvement possible, meaning and grammar perfect
- 8: acceptable — has one noticeable wording, style, or minor accuracy issue
- 5–7: clear problems — unnatural phrasing, accuracy issues, or awkward grammar
- 1–4: poor quality — wrong meaning, serious grammar errors, or missing/broken placeholders

Comment rules:
- score 10 → comment: null
- score 9  → comment: what could still be improved (max 20 words)
- score 8  → comment: describe the noticeable issue (max 20 words)
- score 1–7 → comment: describe the main problem (max 20 words)

Level mapping:
- score 9–10 → level: "green"
- score 8    → level: "yellow"
- score 1–7  → level: "red"

Return ONLY a valid JSON object, no markdown, no extra text:
{"score": <1-10>, "level": "<green|yellow|red>", "comment": "<text or null>"}`;

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
        comment: string | null;
      };
      const score = Math.min(10, Math.max(1, Math.round(parsed.score)));
      const level: 'green' | 'yellow' | 'red' =
        score >= 9 ? 'green' : score === 8 ? 'yellow' : 'red';
      return {
        score,
        level,
        comment: score === 10 ? null : (parsed.comment ?? null),
      };
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
