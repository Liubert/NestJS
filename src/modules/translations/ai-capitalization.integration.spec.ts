/**
 * Integration tests — capitalization preservation in translations.
 *
 * Verifies that the capitalization rule in translatePrompt is correctly
 * picked up by extractTranslateRules → buildBulkTranslatePrompt → Gemini.
 *
 * Requires GEMINI_API_KEY. Run manually:
 *   npx jest --testPathPattern=ai-capitalization.integration
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
import { extractTranslateRules } from './ai-prompt-builder.js';
import type { AiConfigEntity } from './entities/ai-config.entity.js';

const API_KEY = process.env.GEMINI_API_KEY;
const RUN = !!API_KEY;

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

// ─── Unit check: rule is present in extracted rules ───────────────────────────

describe('extractTranslateRules — capitalization rule', () => {
  it('preserves capitalization rule after extraction', () => {
    const rules = extractTranslateRules(DEFAULT_TRANSLATE_PROMPT);
    console.log('\n[extractTranslateRules output]\n', rules);
    expect(rules).toContain('capitalization');
  });
});

// ─── Integration tests ────────────────────────────────────────────────────────

(RUN ? describe : describe.skip)(
  'AI integration — capitalization preservation (real Gemini)',
  () => {
    let service: AiTranslateService;

    beforeAll(async () => {
      service = await buildService();
    });

    // ─── ALL CAPS ──────────────────────────────────────────────────────────────

    describe('ALL CAPS source', () => {
      const LOCALES = ['uk', 'nb'];

      it('translates "SAVE" preserving ALL CAPS', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'save_caps', text: 'SAVE', targetLocales: LOCALES },
        ]);

        for (const locale of LOCALES) {
          const val = results['save_caps']?.[locale];
          console.log(`[ALL CAPS / SAVE] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          expect(val).toBe(val.toUpperCase());
        }
      }, 30_000);

      it('translates "DELETE" preserving ALL CAPS', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'delete_caps', text: 'DELETE', targetLocales: LOCALES },
        ]);

        for (const locale of LOCALES) {
          const val = results['delete_caps']?.[locale];
          console.log(`[ALL CAPS / DELETE] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          expect(val).toBe(val.toUpperCase());
        }
      }, 30_000);
    });

    // ─── lowercase ─────────────────────────────────────────────────────────────

    describe('lowercase source', () => {
      it('translates "save" keeping all lowercase', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'save_lower', text: 'save', targetLocales: ['uk', 'nb'] },
        ]);

        for (const locale of ['uk', 'nb']) {
          const val = results['save_lower']?.[locale];
          console.log(`[lowercase / save] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          expect(val).toBe(val.toLowerCase());
        }
      }, 30_000);

      it('translates "home" (lowercase nav label) keeping all lowercase', async () => {
        // Reported bug: source "home" (lowercase) was being translated with
        // uppercase first letter (Hjem, Inicio, Etusivu etc.) — capitalization rule should prevent this.
        const ALL_LOCALES = ['uk', 'nb', 'sv', 'es', 'fi', 'de'];

        const { results } = await service.bulkTranslate([
          { key: 'home_lower', text: 'home', targetLocales: ALL_LOCALES },
        ]);

        for (const locale of ALL_LOCALES) {
          const val = results['home_lower']?.[locale];
          console.log(`[lowercase / home] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
        }

        // Languages without grammatical noun capitalisation: must be all lowercase
        for (const locale of ['uk', 'nb', 'sv', 'es', 'fi']) {
          const val = results['home_lower']?.[locale];
          expect(val).toBe(val.toLowerCase());
        }

        // German: all nouns are grammatically capitalised — the rule's exception
        // "unless the target language's grammar requires different casing" applies here.
        // Assert the first letter IS uppercase (correct German grammar).
        const de = results['home_lower']?.['de'];
        expect(de[0]).toBe(de[0].toUpperCase());
      }, 30_000);
    });

    // ─── Reported failing words ────────────────────────────────────────────────

    describe('reported failing words (lowercase source)', () => {
      // These specific words were observed producing capitalised translations
      // after namespace reset, despite lowercase source.
      const LOCALES = ['da', 'es', 'fi', 'is', 'nb', 'sv', 'uk'];

      it('"hey" stays lowercase in all locales', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'hey_lower', text: 'hey', targetLocales: LOCALES },
        ]);
        for (const locale of LOCALES) {
          const val = results['hey_lower']?.[locale];
          console.log(`[lowercase / hey] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          // German nouns are capitalised by grammar
          if (locale !== 'de') {
            expect(val).toBe(val.toLowerCase());
          }
        }
      }, 30_000);

      it('"reservation" stays lowercase in all locales', async () => {
        const { results } = await service.bulkTranslate([
          {
            key: 'reservation_lower',
            text: 'reservation',
            targetLocales: LOCALES,
          },
        ]);
        for (const locale of LOCALES) {
          const val = results['reservation_lower']?.[locale];
          console.log(`[lowercase / reservation] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          expect(val).toBe(val.toLowerCase());
        }
      }, 30_000);

      it('"book" stays lowercase in all locales', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'book_lower', text: 'book', targetLocales: LOCALES },
        ]);
        for (const locale of LOCALES) {
          const val = results['book_lower']?.[locale];
          console.log(`[lowercase / book] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          expect(val).toBe(val.toLowerCase());
        }
      }, 30_000);
    });

    // ─── Sentence case ─────────────────────────────────────────────────────────

    describe('Sentence case (first letter capitalised)', () => {
      it('translates "Save changes" with first letter capitalised', async () => {
        const { results } = await service.bulkTranslate([
          {
            key: 'save_changes',
            text: 'Save changes',
            targetLocales: ['uk', 'nb'],
          },
        ]);

        for (const locale of ['uk', 'nb']) {
          const val = results['save_changes']?.[locale];
          console.log(`[Sentence case / Save changes] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
          // First character should be uppercase
          expect(val[0]).toBe(val[0].toUpperCase());
          // Not entirely all-caps (sentence case, not ALL CAPS)
          expect(val).not.toBe(val.toUpperCase());
        }
      }, 30_000);
    });

    // ─── camelCase ─────────────────────────────────────────────────────────────

    describe('camelCase / PascalCase source (technical keys)', () => {
      it('translates "addNewUser" and checks result is logged', async () => {
        const { results } = await service.bulkTranslate([
          {
            key: 'add_new_user_camel',
            text: 'addNewUser',
            targetLocales: ['uk', 'nb'],
          },
        ]);

        // camelCase is a technical identifier — Gemini may or may not preserve it,
        // but we log the output to understand actual behaviour.
        for (const locale of ['uk', 'nb']) {
          const val = results['add_new_user_camel']?.[locale];
          console.log(`[camelCase / addNewUser] ${locale}: "${val}"`);
          expect(val).toBeTruthy();
        }
      }, 30_000);
    });

    // ─── Bulk: multiple casing variants in one request ─────────────────────────

    describe('bulk request: mixed casing in one call', () => {
      it('preserves casing for all three variants in a single Gemini call', async () => {
        const { results } = await service.bulkTranslate([
          { key: 'caps', text: 'CANCEL', targetLocales: ['uk'] },
          { key: 'lower', text: 'cancel', targetLocales: ['uk'] },
          { key: 'title', text: 'Cancel', targetLocales: ['uk'] },
        ]);

        const caps = results['caps']?.['uk'];
        const lower = results['lower']?.['uk'];
        const title = results['title']?.['uk'];

        console.log(`[bulk casing] CANCEL → "${caps}"`);
        console.log(`[bulk casing] cancel → "${lower}"`);
        console.log(`[bulk casing] Cancel → "${title}"`);

        expect(caps).toBeTruthy();
        expect(lower).toBeTruthy();
        expect(title).toBeTruthy();

        // ALL CAPS must stay ALL CAPS
        expect(caps).toBe(caps.toUpperCase());

        // lowercase must stay lowercase
        expect(lower).toBe(lower.toLowerCase());

        // Title case: first letter upper, rest lower (single word)
        expect(title[0]).toBe(title[0].toUpperCase());
        expect(title.slice(1)).toBe(title.slice(1).toLowerCase());
      }, 30_000);
    });
  },
);
