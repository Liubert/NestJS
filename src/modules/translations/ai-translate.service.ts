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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const modeBlock =
      mode === 'translation_quality'
        ? `Mode: translation_quality
You are evaluating a translation. Check both translation accuracy AND writing quality.
Source (English): "${source}"
Translation (${locale}): "${translation}"

Additional checks for this mode:
- Does the translation accurately convey the meaning of the source?
- Is nuance preserved correctly?
- Does the translation sound natural in UI/product context?
- Meaning errors or lost nuance must reduce the score significantly.`
        : `Mode: language_quality
You are evaluating the quality of the text itself. Do NOT compare it to any source.
Text (${locale}): "${translation}"

Check only whether the text is written correctly and naturally in ${locale}.
Do not evaluate translation accuracy.`;

    const prompt = `You are a strict software localization and language quality reviewer.

${modeBlock}

Checks to apply (all modes):
- Grammar: correct forms, agreement, case, verb forms
- Spelling: correctly spelled in ${locale}
- Punctuation: follows conventions of ${locale}
- Comma usage: correct placement
- Unnatural or awkward phrasing
- Clumsy sentence structure
- Natural wording for software/product UI
- Placeholders, variables, interpolation tokens ({{name}}, %s, {count}, {0}) and markup must be preserved exactly

Scoring rules — be strict. Do NOT round up. Do NOT give benefit of the doubt:
- 10: excellent, production-ready, no meaningful issues
- 9: very strong, but still has small improvement opportunities
- 8: understandable, but clearly imperfect
- below 8: noticeable quality problems

Important scoring behavior:
- grammar, spelling, punctuation, or unnatural phrasing must reduce the score
- multiple writing-quality issues must not receive a green score

Comment rules:
- score 10: comment should be empty string
- score 9: comment must explain what could still be improved
- score 8 or below: comment must explain the main issue
- keep comment practical and concise, up to 30 words

Level mapping (strict):
- green: score 9 or 10
- yellow: score 8
- red: score below 8

Return ONLY valid JSON, no markdown, no extra text:
{"score": <1-10>, "level": "<green|yellow|red>", "comment": "<string>"}`;

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
      };
      const score = Math.min(10, Math.max(1, Math.round(parsed.score)));
      const level: 'green' | 'yellow' | 'red' =
        score >= 9 ? 'green' : score === 8 ? 'yellow' : 'red';
      return {
        score,
        level,
        comment: parsed.comment ?? '',
      };
    } catch {
      throw new BadGatewayException(
        `Gemini returned unexpected format: ${cleaned.slice(0, 200)}`,
      );
    }
  }
}
