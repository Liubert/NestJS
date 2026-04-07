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
{{context}}
English text: "{{text}}"

Required output format: {"<locale_code>": "..."}`;

export const DEFAULT_QUALITY_TRANSLATE_PROMPT = `\
You are a strict software localization and language quality reviewer.

Source (English): "{{source}}"
Translation ({{locale}}): "{{translation}}"

{{meaning_rule}}

Checks:
- Grammar, spelling, punctuation ({{locale}} conventions)
- Natural, idiomatic phrasing for software/product UI
- Nuance and meaning preserved
- Placeholders ({{name}}, %s, {count}, {0}) must be preserved EXACTLY — same names, same count. Any renaming, removal, or addition = score 1–3 regardless of other quality

Scoring (1–100):
- 90–100: excellent, production-ready
- 80–89: strong, minor improvements only
- 60–79: understandable but imperfect
- below 60: significant errors

Comment: empty string if ≥90; otherwise explain the main issue (max 60 words).

Context need — evaluate the ENGLISH SOURCE TEXT only, not the translation quality:

"required" — ANY of the following is true:
  - The word/phrase has 2+ meanings that would produce DIFFERENT words in translation.
  - It is a short label (1–2 words) with no surrounding sentence to anchor its meaning.
  - Do NOT apply "dominant meaning" reasoning — if another meaning is plausible in a UI, mark "required".

"useful" — phrase is 3+ words giving ~85% confidence, but UI location would still confirm intent.

"none" — meaning is 100% unambiguous in any software context.

Examples — "required": "Train", "Light", "Draft", "By", "Log", "Save", "Match", "Charge", "Issue", "Open", "File", "Record", "Run", "Post"
Examples — "useful": "Delete account", "Approve request"
Examples — "none": "Email address", "Password", "Sign in", "Cancel", "Loading..."

Do NOT let a high translation score influence contextNeed. A translation can be correct AND the source can still be ambiguous.
Add "contextReason" if required or useful (1 sentence, max 30 words explaining what other meanings are possible).

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
- 90–100: excellent, production-ready, no meaningful issues
- 80–89: very strong, minor improvement opportunities
- 60–79: understandable, but clearly imperfect
- below 60: noticeable quality problems

Comment rules:
- score 90–100: comment should be empty string
- score 80–89: comment must explain what could still be improved
- score below 80: comment must explain the main issue
- keep comment practical and concise, up to 60 words

Context need — evaluate the TEXT itself, independently of quality score:

"required" — ANY of the following is true:
  - The word/phrase has 2+ meanings that would produce DIFFERENT words in translation.
  - It is a short label (1–2 words) with no surrounding sentence to anchor its meaning.
  - Do NOT apply "dominant meaning" reasoning — if another meaning is plausible in a UI, mark "required".

"useful" — phrase is 3+ words giving ~85% confidence, but UI location would still confirm intent.

"none" — meaning is 100% unambiguous in any software context.

Examples — "required": "Train", "Light", "Draft", "By", "Log", "Save", "Match", "Charge", "Issue", "Open", "File", "Record", "Run", "Post"
Examples — "useful": "Delete account", "Approve request"
Examples — "none": "Email address", "Password", "Sign in", "Cancel", "Loading..."

Do NOT let a high quality score influence contextNeed.
If contextNeed is "required" or "useful", add "contextReason" — a short plain-language explanation (1 sentence, max 30 words).

Return ONLY valid JSON, no markdown, no extra text:
{"score": <1-100>, "comment": "<string>", "contextNeed": "<required|useful|none>", "contextReason": "<string or null>"}`;

export const DEFAULT_CONTEXT_DETECTION_PROMPT = `\
Context need — strict rules:

RULE 1 (short labels): If the text is 1–3 words AND has ANY alternate meaning in a software product → ALWAYS "required". No exceptions. Do not apply "dominant meaning" reasoning.
RULE 2 (longer phrases): If 4+ words give ~85% confidence in meaning but UI location would confirm → "useful".
RULE 3: "none" only when meaning is 100% unambiguous in every possible software context.

Single words and short prepositions are almost always "required": "By", "Log", "Draft", "Train", "Light", "Save", "Open", "Run", "Post", "File", "Issue", "Match", "Charge", "Record", "Close", "Set", "Tag"
Longer phrases can be "useful": "Delete account", "Approve request", "Reset password"
Clear phrases are "none": "Email address", "Password", "Sign in", "Cancel", "Loading..."

When contextNeed is "required" or "useful", provide "contextReason" — one sentence (max 30 words) explaining the alternate meanings.`;

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
