/**
 * Integration tests — real Gemini API calls.
 *
 * Requires GEMINI_API_KEY in environment. Skipped automatically when missing.
 * Run manually: npx jest --testPathPattern=ai-translate.integration
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import {
  DEFAULT_TRANSLATE_PROMPT,
  DEFAULT_QUALITY_TRANSLATE_PROMPT,
  DEFAULT_QUALITY_LANGUAGE_PROMPT,
  DEFAULT_CONTEXT_DETECTION_PROMPT,
} from './ai-config.service.js';
import {
  CONTEXT_REQUIRED_FACTOR,
  CONTEXT_USEFUL_FACTOR,
  scoreToLevel,
} from './quality-constants.js';
import type { AiConfigEntity } from './entities/ai-config.entity.js';

const API_KEY = process.env.GEMINI_API_KEY;
const RUN = !!API_KEY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultConfig(): AiConfigEntity {
  return {
    id: 'cfg-test',
    model: 'gemini-2.0-flash',
    translatePrompt: DEFAULT_TRANSLATE_PROMPT,
    qualityTranslatePrompt: DEFAULT_QUALITY_TRANSLATE_PROMPT,
    qualityLanguagePrompt: DEFAULT_QUALITY_LANGUAGE_PROMPT,
    contextDetectionPrompt: DEFAULT_CONTEXT_DETECTION_PROMPT,
    updatedAt: new Date(),
  } as AiConfigEntity;
}

/** Apply context penalty — mirrors QualityWorkerService logic */
function applyContextPenalty(
  score: number,
  contextNeed: string | null | undefined,
  hasContext: boolean,
): number {
  if (!contextNeed || contextNeed === 'none' || hasContext) return score;
  const factor =
    contextNeed === 'required'
      ? CONTEXT_REQUIRED_FACTOR
      : CONTEXT_USEFUL_FACTOR;
  return Math.max(1, Math.round(score * factor));
}

async function buildService(): Promise<AiTranslateService> {
  const module = await Test.createTestingModule({
    providers: [
      AiTranslateService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'GEMINI_API_KEY' ? API_KEY : undefined,
        },
      },
      {
        provide: AiConfigService,
        useValue: {
          getConfig: jest.fn().mockResolvedValue(makeDefaultConfig()),
        },
      },
      {
        provide: AiUsageService,
        useValue: {
          assertDailyLimit: jest.fn().mockResolvedValue(undefined),
          logUsage: jest.fn().mockResolvedValue(undefined),
        },
      },
    ],
  }).compile();

  return module.get(AiTranslateService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AI integration — translate + quality (real Gemini)', () => {
  let service: AiTranslateService;

  beforeAll(async () => {
    if (!RUN) return;
    service = await buildService();
  });

  // ─── "Book" — with context ─────────────────────────────────────────────────

  describe('ambiguous word WITH context', () => {
    const KEY = 'book_reservation';
    const SOURCE = 'Book';
    const CONTEXT =
      'Button that allows the user to reserve a meeting room or appointment';

    it('translates to reservation meaning in Ukrainian', async () => {
      if (!RUN) return;

      const { results } = await service.bulkTranslate([
        { key: KEY, text: SOURCE, context: CONTEXT, targetLocales: ['uk'] },
      ]);

      const translation = results[KEY]?.['uk'];
      expect(translation).toBeTruthy();
      // Should be "забронювати", "бронювати", "резервувати" — not "книга" (book as noun)
      expect(translation.toLowerCase()).toMatch(/брон|резерв/);
    }, 30_000);

    it('quality check returns green score when context provided', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: CONTEXT,
          translations: { uk: 'Забронювати' },
        },
      ]);

      const r = results[KEY]?.['uk'];
      expect(r).toBeDefined();

      const penalized = applyContextPenalty(
        r.score,
        contextInfo[KEY]?.need,
        true,
      );
      expect(penalized).toBeGreaterThanOrEqual(90);
      expect(scoreToLevel(penalized)).toBe('green');
    }, 30_000);
  });

  // ─── "Book" — without context ──────────────────────────────────────────────

  describe('ambiguous word WITHOUT context', () => {
    const KEY = 'book_no_context';
    const SOURCE = 'Book';

    it('quality check flags contextNeed as required', async () => {
      if (!RUN) return;

      const { contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: null,
          translations: { uk: 'Книга' },
        },
      ]);

      expect(contextInfo[KEY]?.need).toBe('required');
      expect(contextInfo[KEY]?.reason).toBeTruthy();
    }, 30_000);

    it('quality score after penalty is NOT green', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: null,
          translations: { uk: 'Книга' },
        },
      ]);

      const r = results[KEY]?.['uk'];
      expect(r).toBeDefined();

      const penalized = applyContextPenalty(
        r.score,
        contextInfo[KEY]?.need,
        false,
      );
      console.log(
        `[Book no ctx] raw=${r.score} contextNeed=${contextInfo[KEY]?.need ?? 'n/a'} penalized=${penalized}`,
      );
      expect(penalized).toBeLessThan(90);
      expect(scoreToLevel(penalized)).not.toBe('green');
    }, 30_000);
  });

  // ─── "Home" — with context ─────────────────────────────────────────────────

  describe('"Home" navigation label WITH context', () => {
    const KEY = 'home_nav';
    const SOURCE = 'Home';
    const CONTEXT =
      'Top navigation tab in a web app. Clicking it goes to the main dashboard. In Ukrainian UI this label is typically "Головна" (meaning: main/primary page), NOT "дім" or "додому" (house/going home).';

    it('translates to homepage/main page meaning in Ukrainian', async () => {
      if (!RUN) return;

      const { results } = await service.bulkTranslate([
        { key: KEY, text: SOURCE, context: CONTEXT, targetLocales: ['uk'] },
      ]);

      const translation = results[KEY]?.['uk'];
      expect(translation).toBeTruthy();
      // Should be "Головна" / "Головна сторінка" — not "дім" / "додому" (house meaning)
      expect(translation.toLowerCase()).toMatch(/голов/);
    }, 30_000);

    it('quality check returns green score when context provided', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: CONTEXT,
          translations: { uk: 'Головна' },
        },
      ]);

      const r = results[KEY]?.['uk'];
      expect(r).toBeDefined();

      const penalized = applyContextPenalty(
        r.score,
        contextInfo[KEY]?.need,
        true,
      );
      expect(penalized).toBeGreaterThanOrEqual(90);
      expect(scoreToLevel(penalized)).toBe('green');
    }, 30_000);
  });

  // ─── "Home" — without context ──────────────────────────────────────────────

  describe('"Home" WITHOUT context', () => {
    const KEY = 'home_no_context';
    const SOURCE = 'Home';

    it('quality check flags contextNeed as required', async () => {
      if (!RUN) return;

      const { contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: null,
          translations: { uk: 'Головна' },
        },
      ]);

      expect(contextInfo[KEY]?.need).toBe('required');
      expect(contextInfo[KEY]?.reason).toBeTruthy();
    }, 30_000);

    it('quality score after penalty is NOT green', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: null,
          translations: { uk: 'Головна' },
        },
      ]);

      const r = results[KEY]?.['uk'];
      expect(r).toBeDefined();

      const penalized = applyContextPenalty(
        r.score,
        contextInfo[KEY]?.need,
        false,
      );
      expect(penalized).toBeLessThan(90);
    }, 30_000);
  });

  // ─── "Book" — content meaning (to read) ──────────────────────────────────

  describe('"Book" noun with context "to read"', () => {
    const KEY = 'book_to_read';
    const SOURCE = 'book';
    const CONTEXT = 'to read';

    it('translates to noun form in all target locales — no dual alternatives', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkTranslate([
        {
          key: KEY,
          text: SOURCE,
          context: CONTEXT,
          targetLocales: ['fi', 'uk', 'nb', 'es'],
        },
      ]);

      const translations = results[KEY] ?? {};

      // Must produce single-word noun — no slash-separated alternatives
      for (const [locale, value] of Object.entries(translations)) {
        expect(value).toBeTruthy();
        expect(value).not.toMatch(/\//);
        console.log(`[book/to read] ${locale}: "${value}"`);
      }

      // fi → kirja, uk → книга, nb → bok, es → libro
      expect(translations['fi']?.toLowerCase()).toContain('kirja');
      expect(translations['uk']?.toLowerCase()).toMatch(/книг/);
      expect(translations['nb']?.toLowerCase()).toContain('bok');
      expect(translations['es']?.toLowerCase()).toContain('libro');

      // Context was provided → contextNeed must NOT be "required"
      const ctxNeed = contextInfo[KEY]?.need;
      console.log(`[book/to read] contextNeed=${ctxNeed}`);
      expect(ctxNeed).toBe('none');
    }, 30_000);

    it('quality check with context "to read" — contextNeed is none, score is green', async () => {
      if (!RUN) return;

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: CONTEXT,
          translations: {
            fi: 'kirja',
            uk: 'книга',
            nb: 'bok',
            es: 'libro',
          },
        },
      ]);

      // Context was provided → should NOT flag as required
      const ctxNeed = contextInfo[KEY]?.need;
      console.log(`[book/to read quality] contextNeed=${ctxNeed}`);
      expect(ctxNeed).toBe('none');

      // All translations should score green (correct noun form)
      for (const [locale, r] of Object.entries(results[KEY] ?? {})) {
        console.log(
          `[book/to read quality] ${locale}: score=${r.score} level=${r.level} comment="${r.comment}"`,
        );
        expect(r.score).toBeGreaterThanOrEqual(70);
      }
    }, 30_000);
  });

  // ─── Unambiguous key always passes ────────────────────────────────────────

  describe('unambiguous key — "Email address"', () => {
    it('translates correctly and gets green quality without context', async () => {
      if (!RUN) return;

      const KEY = 'email_label';
      const SOURCE = 'Email address';

      const { results: translateResults } = await service.bulkTranslate([
        { key: KEY, text: SOURCE, targetLocales: ['uk'] },
      ]);
      expect(translateResults[KEY]?.['uk']).toBeTruthy();

      const { results, contextInfo } = await service.bulkCheckQuality([
        {
          key: KEY,
          source: SOURCE,
          context: null,
          translations: { uk: translateResults[KEY]['uk'] },
        },
      ]);

      const r = results[KEY]?.['uk'];
      expect(r).toBeDefined();

      const need = contextInfo[KEY]?.need ?? 'none';
      const penalized = applyContextPenalty(r.score, need, false);
      expect(penalized).toBeGreaterThanOrEqual(90);
      expect(scoreToLevel(penalized)).toBe('green');
    }, 30_000);
  });
});
