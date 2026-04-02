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

Required output format: {"uk": "...", "nb-NO": "...", "sv": "...", "da-DK": "..."}`;

export const DEFAULT_QUALITY_TRANSLATE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Mode: translation_quality
You are evaluating a translation. Check both translation accuracy AND writing quality.
Source (English): "{{source}}"
Translation ({{locale}}): "{{translation}}"

IMPORTANT — Ambiguity and multiple meanings:
- Many English words have multiple valid meanings depending on context (e.g. "train" can mean a rail vehicle or to practice/exercise; "moon" can mean the celestial body or a proper name; "light" can mean illumination, lightweight, or a pale color).
- Before judging accuracy, consider ALL reasonable meanings of the source text.
- If the translation is correct for ANY valid interpretation of the source that makes sense in a software/product UI context, treat it as accurate.
- Do NOT penalize a translation that uses a less common but valid interpretation.
- When the source is genuinely ambiguous, give the benefit of the doubt to the translator.
- Only flag a meaning error if the translation cannot reasonably correspond to any valid interpretation of the source.

Context (if provided): "{{context}}"
- If context is present, use it to determine the intended meaning and evaluate more precisely.
- If context is empty or not provided, evaluate using all reasonable interpretations as described above.

Additional checks:
- Does the translation accurately convey the meaning of the source (for at least one valid interpretation)?
- Is nuance preserved correctly?
- Does the translation sound natural in UI/product context?
- Meaning errors or lost nuance must reduce the score significantly — but only when the translation is genuinely wrong, not merely using an alternative valid meaning.

Checks to apply (all modes):
- Grammar: correct forms, agreement, case, verb forms
- Spelling: correctly spelled in {{locale}}
- Punctuation: follows conventions of {{locale}}
- Comma usage: correct placement
- Unnatural or awkward phrasing
- Clumsy sentence structure
- Natural wording for software/product UI
- Placeholders, variables, interpolation tokens ({{name}}, %s, {count}, {0}) and markup must be preserved exactly

Scoring rules — be strict on real errors, fair on ambiguity. Score on a 1–100 scale:
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
- "contextNeed": "required" if the source text is genuinely ambiguous — multiple meanings lead to different translations and a translator cannot confidently choose without context
- "contextNeed": "useful" if the text is short/generic and business intent or usage location would improve confidence, even though a reasonable default exists
- "contextNeed": "none" if the meaning is universally clear
If contextNeed is "required" or "useful", add "contextReason" — a short plain-language explanation (1 sentence, max 30 words).

Return ONLY valid JSON, no markdown, no extra text:
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
Context awareness instructions:

For each translation key, evaluate whether context about where/how the key is used
would improve translation confidence and quality evaluation.

Set "contextNeed" to "required" if:
- The source text has multiple valid meanings that lead to genuinely different translations
- Without context, a translator cannot confidently choose the correct meaning
- Examples: "Train" (vehicle vs exercise), "Save" (rescue vs store), "Light" (illumination vs weight)

Set "contextNeed" to "useful" if:
- The text is short or generic and business intent is unclear (e.g. "Process", "Review", "Apply")
- The label could refer to a user action, a status, or a domain concept
- Business users or future maintainers would benefit from knowing where this text appears
- Context would improve confidence even though a reasonable default translation exists
- Examples: "Submit", "Details", "Active", "Status", "View"

Set "contextNeed" to "none" if:
- The meaning is universally clear without additional context
- Common UI term with obvious meaning
- Examples: "Cancel", "OK", "Delete", "Email", "Password", "Settings", "Loading..."

When contextNeed is "required" or "useful", provide "contextReason" — a short
plain-language explanation (1 sentence, max 30 words) of why context helps.
Examples of good reasons:
- "This word has multiple meanings depending on the feature or screen"
- "Short generic label — business intent unclear without knowing the screen"
- "Could refer to a user action, a status, or a domain concept"

Do NOT set contextNeed to "required" or "useful" just because a word is simple.
Only flag when context genuinely improves correctness, clarity, or business understanding.

If "context" is already provided for a key, use it to determine the correct meaning and evaluate translations more precisely.
Do NOT lower scores for missing context — score purely on grammar and translation accuracy. Context penalties are applied separately by the system.`;

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
