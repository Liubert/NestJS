#!/usr/bin/env node
/**
 * Test script: verifies that AI quality check correctly returns contextNeed
 * for genuinely ambiguous UI strings.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/test-context-detection.js
 *   GEMINI_API_KEY=... PROMPT_VARIANT=2 node scripts/test-context-detection.js
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const VARIANT = process.env.PROMPT_VARIANT ?? '1';

if (!API_KEY) {
  console.error('GEMINI_API_KEY is required');
  process.exit(1);
}

// ─── Test cases ───────────────────────────────────────────────────────────────
// Each case: source text, a plausible translation, expected contextNeed level
// 'required'/'useful' = PASS, 'none' = FAIL
const CASES = [
  // Genuinely ambiguous — multiple distinct meanings possible
  { source: 'Train',    translation: 'Поїзд',     locale: 'uk', expect: 'required', note: 'train (vehicle) vs train (exercise)' },
  { source: 'Light',    translation: 'Легкий',    locale: 'uk', expect: 'required', note: 'light (weight) vs light (illumination)' },
  { source: 'Save',     translation: 'Зберегти',  locale: 'uk', expect: 'required', note: 'save (file) vs save (rescue)' },
  { source: 'Draft',    translation: 'Чернетка',  locale: 'uk', expect: 'required', note: 'draft (document) vs draft (air current)' },
  { source: 'by',       translation: 'за',        locale: 'uk', expect: 'required', note: 'preposition with many meanings in UI' },
  // Short/generic — useful context
  { source: 'View',     translation: 'Переглянути', locale: 'uk', expect: 'useful', note: 'verb vs noun' },
  { source: 'Log',      translation: 'Журнал',    locale: 'uk', expect: 'useful',   note: 'log (records) vs log in vs log (wood)' },
  // Clearly unambiguous — should stay 'none'
  { source: 'Email address', translation: 'Адреса електронної пошти', locale: 'uk', expect: 'none', note: 'clear phrase' },
  { source: 'Password', translation: 'Пароль',    locale: 'uk', expect: 'none',     note: 'clear in UI context' },
];

// ─── Prompt variants ──────────────────────────────────────────────────────────
function buildPrompt(variant, { source, translation, locale }) {
  if (variant === '1') {
    // Current default (failing)
    return `You are a strict software localization and language quality reviewer.

Source (English): "${source}"
Translation (${locale}): "${translation}"

No context provided. Accept any translation that fits standard software UI usage.

Checks:
- Grammar, spelling, punctuation (${locale} conventions)
- Natural, idiomatic phrasing for software/product UI
- Nuance and meaning preserved
- Placeholders preserved exactly

Scoring (1–100):
- 95–100: excellent
- 80–94: strong
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
  }

  if (variant === '2') {
    // Key insight: evaluate source TEXT ambiguity independently of translation quality
    return `You are a strict software localization and quality reviewer.

Source (English): "${source}"
Translation (${locale}): "${translation}"

No context provided. Accept any translation that fits standard software UI usage.

Checks:
- Grammar, spelling, punctuation (${locale} conventions)
- Natural, idiomatic phrasing for software/product UI
- Placeholders preserved exactly

Scoring (1–100):
- 95–100: excellent
- 80–94: strong
- 60–79: understandable but imperfect
- below 60: significant errors

Comment: empty string if ≥95; otherwise explain the main issue (max 60 words).

IMPORTANT — Context need evaluation:
Evaluate the SOURCE English text INDEPENDENTLY of the translation quality.
Ask yourself: "If I only saw this English text with no other information, could it mean different things in different parts of a software UI?"

- "contextNeed": "required" — the English source text has multiple distinct meanings that would lead to DIFFERENT correct translations depending on context. Example: "Train" (vehicle vs exercise), "Light" (weight vs illumination), "Save" (file vs rescue), "Draft" (document vs air), "by" (preposition with many meanings).
- "contextNeed": "useful" — the English source text is short or generic, and knowing the UI location or intent would improve translation confidence, even if a reasonable default exists.
- "contextNeed": "none" — the English source text has ONE clear meaning in software UI regardless of context.

Do NOT let a high translation score influence contextNeed. A translation can be correct AND the source can still be ambiguous.
Add "contextReason" if required or useful (1 sentence, max 30 words explaining what other meanings are possible).

Return ONLY valid JSON:
{"score": <1-100>, "comment": "<string>", "contextNeed": "<required|useful|none>", "contextReason": "<string or null>"}`;
  }

  if (variant === '3') {
    // Even more explicit: list bad examples (where AI was wrong before)
    return `You are a strict software localization and quality reviewer.

Source (English): "${source}"
Translation (${locale}): "${translation}"

No context provided. Accept any translation that fits standard software UI usage.

Checks:
- Grammar, spelling, punctuation (${locale} conventions)
- Natural, idiomatic phrasing for software/product UI
- Placeholders preserved exactly

Scoring (1–100):
- 95–100: excellent
- 80–94: strong
- 60–79: understandable but imperfect
- below 60: significant errors

Comment: empty string if ≥95; otherwise explain the main issue (max 60 words).

Context need — evaluate the ENGLISH SOURCE TEXT only, not the translation:

Step 1: List ALL distinct meanings this English word/phrase could have in a software product.
Step 2: If there are 2+ distinct meanings that would require different translations → "required".
         If there is 1 clear dominant meaning but knowing context would help → "useful".
         If meaning is unambiguous in any software context → "none".

Examples where contextNeed = "required":
- "Train" → could be train (transportation) or to train (exercise/ML) → required
- "Light" → could be light (weight/mode) or light (illumination) → required
- "Save" → could be save (file/data) or save (rescue) → required
- "Draft" → could be draft (document) or draft (air current) or draft (military) → required
- "by" → preposition used in "Sort by", "Created by", "Approved by", "Powered by" — meaning depends entirely on UI context → required
- "Log" → log (records/journal) or log in/out or log (wood) → required

Examples where contextNeed = "none":
- "Email address" → universally clear
- "Password" → universally clear in software
- "Sign in" → universally clear

Add "contextReason" if required or useful (1 sentence, max 30 words).

Return ONLY valid JSON:
{"score": <1-100>, "comment": "<string>", "contextNeed": "<required|useful|none>", "contextReason": "<string or null>"}`;
  }

  throw new Error(`Unknown variant: ${variant}`);
}

// ─── Run tests ────────────────────────────────────────────────────────────────
async function run() {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  console.log(`\n=== Prompt variant ${VARIANT} ===\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of CASES) {
    const prompt = buildPrompt(VARIANT, tc);
    let raw;
    try {
      const result = await model.generateContent(prompt);
      raw = result.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    } catch (e) {
      console.log(`  ERROR ${tc.source}: ${e.message}`);
      failed++;
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.log(`  PARSE_ERROR ${tc.source}: ${raw.slice(0, 80)}`);
      failed++;
      continue;
    }

    const actual = parsed.contextNeed;
    const ok =
      tc.expect === 'none'
        ? actual === 'none'
        : actual === 'required' || actual === 'useful'; // required/useful both pass for 'useful' expect

    const icon = ok ? '✓' : '✗';
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`  ${icon} [${status}] "${tc.source}" → contextNeed="${actual}" (expect="${tc.expect}") reason="${parsed.contextReason ?? ''}"`);
    if (!ok) console.log(`         note: ${tc.note}`);

    ok ? passed++ : failed++;
  }

  console.log(`\nResult: ${passed}/${CASES.length} passed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
