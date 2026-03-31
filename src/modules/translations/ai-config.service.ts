import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfigEntity } from './entities/ai-config.entity.js';

// ─── Default prompt templates ─────────────────────────────────────────────────
// Variables interpolated at runtime (unknown {{...}} are left as-is):
//   translatePrompt         → {{text}}, {{languages}}
//   qualityTranslatePrompt  → {{source}}, {{translation}}, {{locale}}
//   qualityLanguagePrompt   → {{translation}}, {{locale}}

export const DEFAULT_TRANSLATE_PROMPT = `\
You are a software localization assistant. Translate the following English UI text into the specified languages.

Rules:
- Use natural, concise wording suitable for UI labels and short phrases
- Preserve any placeholders, variables, or formatting tokens exactly (e.g. {{name}}, %s, {count})
- Return ONLY a valid JSON object with language codes as keys and translated strings as values
- No explanations, no commentary, no markdown fences — only raw JSON

Target languages: {{languages}}

English text: "{{text}}"

Required output format: {"uk": "...", "nb-NO": "...", "sv": "...", "da-DK": "..."}`;

export const DEFAULT_QUALITY_TRANSLATE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Mode: translation_quality
You are evaluating a translation. Check both translation accuracy AND writing quality.
Source (English): "{{source}}"
Translation ({{locale}}): "{{translation}}"

Additional checks for this mode:
- Does the translation accurately convey the meaning of the source?
- Is nuance preserved correctly?
- Does the translation sound natural in UI/product context?
- Meaning errors or lost nuance must reduce the score significantly.

Checks to apply (all modes):
- Grammar: correct forms, agreement, case, verb forms
- Spelling: correctly spelled in {{locale}}
- Punctuation: follows conventions of {{locale}}
- Comma usage: correct placement
- Unnatural or awkward phrasing
- Clumsy sentence structure
- Natural wording for software/product UI
- Placeholders, variables, interpolation tokens ({{name}}, %s, {count}, {0}) and markup must be preserved exactly

Scoring rules — be strict. Do NOT round up. Do NOT give benefit of the doubt. Score on a 1–100 scale:
- 95–100: excellent, production-ready, no meaningful issues
- 80–94: very strong, minor improvement opportunities
- 60–79: understandable, but clearly imperfect
- below 60: noticeable quality problems

Comment rules:
- score 95–100: comment should be empty string
- score 80–94: comment must explain what could still be improved
- score below 80: comment must explain the main issue
- keep comment practical and concise, up to 30 words

Level mapping (strict):
- green: score 90 or above
- yellow: score 80–89
- red: score below 80

Return ONLY valid JSON, no markdown, no extra text:
{"score": <1-100>, "level": "<green|yellow|red>", "comment": "<string>"}`;

export const DEFAULT_QUALITY_LANGUAGE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Mode: language_quality
You are evaluating the quality of the text itself. Do NOT compare it to any source.
Text ({{locale}}): "{{translation}}"

Check only whether the text is written correctly and naturally in {{locale}}.
Do not evaluate translation accuracy.

Checks to apply:
- Grammar: correct forms, agreement, case, verb forms
- Spelling: correctly spelled in {{locale}}
- Punctuation: follows conventions of {{locale}}
- Comma usage: correct placement
- Unnatural or awkward phrasing
- Clumsy sentence structure
- Natural wording for software/product UI
- Placeholders, variables, interpolation tokens ({{name}}, %s, {count}, {0}) and markup must be preserved exactly

Scoring rules — be strict. Do NOT round up. Do NOT give benefit of the doubt. Score on a 1–100 scale:
- 95–100: excellent, production-ready, no meaningful issues
- 80–94: very strong, minor improvement opportunities
- 60–79: understandable, but clearly imperfect
- below 60: noticeable quality problems

Comment rules:
- score 95–100: comment should be empty string
- score 80–94: comment must explain what could still be improved
- score below 80: comment must explain the main issue
- keep comment practical and concise, up to 30 words

Level mapping (strict):
- green: score 90 or above
- yellow: score 80–89
- red: score below 80

Return ONLY valid JSON, no markdown, no extra text:
{"score": <1-100>, "level": "<green|yellow|red>", "comment": "<string>"}`;

// ─── Interpolation helper ─────────────────────────────────────────────────────

/** Replaces {{key}} in template with vars[key]. Unknown placeholders are left as-is. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w[\w-]*)\}\}/g,
    (match, key: string) => vars[key] ?? match,
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface AiConfigUpdate {
  model?: string;
  translatePrompt?: string;
  qualityTranslatePrompt?: string;
  qualityLanguagePrompt?: string;
  greenMinScore?: number;
  yellowMinScore?: number;
}

@Injectable()
export class AiConfigService {
  constructor(
    @InjectRepository(AiConfigEntity)
    private readonly repo: Repository<AiConfigEntity>,
  ) {}

  async getConfig(): Promise<AiConfigEntity> {
    const [existing] = await this.repo.find({ take: 1 });
    if (existing) return existing;

    return this.repo.save(
      this.repo.create({
        model: 'gemini-2.0-flash',
        translatePrompt: DEFAULT_TRANSLATE_PROMPT,
        qualityTranslatePrompt: DEFAULT_QUALITY_TRANSLATE_PROMPT,
        qualityLanguagePrompt: DEFAULT_QUALITY_LANGUAGE_PROMPT,
        greenMinScore: 90,
        yellowMinScore: 80,
      }),
    );
  }

  async updateConfig(dto: AiConfigUpdate): Promise<AiConfigEntity> {
    const config = await this.getConfig();
    Object.assign(config, dto);
    return this.repo.save(config);
  }

  async resetToDefaults(): Promise<AiConfigEntity> {
    return this.updateConfig({
      model: 'gemini-2.0-flash',
      translatePrompt: DEFAULT_TRANSLATE_PROMPT,
      qualityTranslatePrompt: DEFAULT_QUALITY_TRANSLATE_PROMPT,
      qualityLanguagePrompt: DEFAULT_QUALITY_LANGUAGE_PROMPT,
      greenMinScore: 90,
      yellowMinScore: 80,
    });
  }
}
