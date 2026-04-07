import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConfigEntity } from './entities/ai-config.entity.js';

// ─── Default prompt templates ─────────────────────────────────────────────────
// Variables interpolated at runtime (unknown {{...}} are left as-is):
//   translatePrompt         → {{text}}, {{languages}}, {{context}}
//   qualityTranslatePrompt  → {{source}}, {{translation}}, {{locale}}, {{context}}
//   qualityLanguagePrompt   → {{translation}}, {{locale}}, {{context}}
//   contextDetectionPrompt  → (embedded in bulk quality prompt, no runtime variables)

export const DEFAULT_TRANSLATE_PROMPT = `\
You are a software localization assistant. Translate the following English UI text into the specified languages.

Rules:
- Use natural, concise wording suitable for UI labels and short phrases
- Preserve any placeholders, variables, or formatting tokens exactly (e.g. {{name}}, %s, {count})
- Return ONLY a valid JSON object with language codes as keys and translated strings as values
- No explanations, no commentary, no markdown fences — only raw JSON

Target languages: {{languages}}

Context (if provided): "{{context}}"
- If context is present, use it to determine the intended meaning and choose the most appropriate translation.
- If context is empty or not provided, translate using the most common UI interpretation.

English text: "{{text}}"

Required output format: {"uk": "...", "nb": "...", "sv": "...", "da": "..."}`;

export const DEFAULT_QUALITY_TRANSLATE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Source (English): "{{source}}"
Translation ({{locale}}): "{{translation}}"

{{meaning_rule}}

Checks:
- Grammar, spelling, punctuation ({{locale}} conventions)
- Natural, idiomatic phrasing for software/product UI
- Nuance and meaning preserved
- Placeholders ({{name}}, %s, {count}, {0}) preserved exactly

Scoring (1–100):
- 95–100: excellent, production-ready
- 80–94: strong, minor improvements only
- 60–79: understandable but imperfect
- below 60: significant errors

Comment: empty string if ≥95; otherwise explain the main issue (max 60 words).

Evaluate whether context about this key's usage would help:
- "contextNeed": "required" — text is genuinely ambiguous (e.g. "Train", "Light", "Save")
- "contextNeed": "useful" — short/generic, context would improve confidence
- "contextNeed": "none" — meaning is clear
Add "contextReason" if required or useful (1 sentence, max 30 words).

Return ONLY valid JSON:
{"score": <1-100>, "comment": "<string>", "contextNeed": "<required|useful|none>", "contextReason": "<string or null>"}`;

export const DEFAULT_QUALITY_LANGUAGE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Mode: language_quality
You are evaluating the quality of the text itself. Do NOT compare it to any source.
Text ({{locale}}): "{{translation}}"

Check only whether the text is written correctly and naturally in {{locale}}.
Do not evaluate translation accuracy.

Context (if provided): "{{context}}"
- If context is present, use it to judge whether the text is appropriate for its intended use.

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
- keep comment practical and concise, up to 60 words

Additionally, evaluate whether context about where/how this key is used would improve this evaluation:
- "contextNeed": "required" if the text is genuinely ambiguous — multiple meanings lead to different translations and a translator cannot confidently choose without context
- "contextNeed": "useful" if the text is short/generic and business intent or usage location would improve confidence, even though a reasonable default exists
- "contextNeed": "none" if the meaning is universally clear
If contextNeed is "required" or "useful", add "contextReason" — a short plain-language explanation (1 sentence, max 30 words).

Return ONLY valid JSON, no markdown, no extra text:
{"score": <1-100>, "comment": "<string>", "contextNeed": "<required|useful|none>", "contextReason": "<string or null>"}`;

export const DEFAULT_CONTEXT_DETECTION_PROMPT = `\
Context need:

Set "contextNeed" to:
- "required" — when the text can mean different things and context is necessary to choose the correct translation or evaluate translation quality.
- "useful" — when the text is understandable without context, but context would improve translation confidence or quality evaluation.
- "none" — when the meaning is clear and context is not needed.

Use context need not only for translation, but also for translation quality evaluation. If missing context could affect confidence in correctness, fluency, or meaning, mark it accordingly.

Examples:
- "required": "Charge", "Match"
- "useful": "Open", "Issue"
- "none": "Cancel", "Email"

When contextNeed is "required" or "useful", provide "contextReason" — one sentence (max 30 words) explaining why context helps.`;

// ─── Interpolation helper ─────────────────────────────────────────────────────

/** Replaces {{key}} in template with vars[key]. Unknown placeholders are left as-is. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w[\w-]*)\}\}/g,
    (_match, key: string) => vars[key] ?? '',
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface AiConfigUpdate {
  model?: string;
  translatePrompt?: string;
  qualityTranslatePrompt?: string;
  qualityLanguagePrompt?: string;
  contextDetectionPrompt?: string;
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
        contextDetectionPrompt: DEFAULT_CONTEXT_DETECTION_PROMPT,
      }),
    );
  }

  async updateConfig(dto: AiConfigUpdate): Promise<AiConfigEntity> {
    const config = await this.getConfig();
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        (config as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return this.repo.save(config);
  }

  async resetToDefaults(): Promise<AiConfigEntity> {
    return this.updateConfig({
      model: 'gemini-2.0-flash',
      translatePrompt: DEFAULT_TRANSLATE_PROMPT,
      qualityTranslatePrompt: DEFAULT_QUALITY_TRANSLATE_PROMPT,
      qualityLanguagePrompt: DEFAULT_QUALITY_LANGUAGE_PROMPT,
      contextDetectionPrompt: DEFAULT_CONTEXT_DETECTION_PROMPT,
    });
  }
}
