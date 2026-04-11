import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import type { AiConfigEntity } from './entities/ai-config.entity.js';

// ─── Gemini mock ──────────────────────────────────────────────────────────────

const generateContentMock = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: generateContentMock,
    }),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function geminiReturns(json: unknown): void {
  generateContentMock.mockResolvedValue({
    response: { text: () => JSON.stringify(json) },
  });
}

function makeConfig(overrides: Partial<AiConfigEntity> = {}): AiConfigEntity {
  return {
    id: 'cfg-1',
    model: 'gemini-2.0-flash',
    translatePrompt: `Translate {{text}} to {{languages}}.\n{{context}}\nRequired output format: {"uk": "..."}`,
    qualityTranslatePrompt: 'Evaluate translation quality.',
    qualityLanguagePrompt: 'Evaluate language quality.',
    contextDetectionPrompt: null,
    updatedAt: new Date(),
    ...overrides,
  } as AiConfigEntity;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function buildService(): Promise<AiTranslateService> {
  const module = await Test.createTestingModule({
    providers: [
      AiTranslateService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'GEMINI_API_KEY' ? 'test-key' : undefined,
        },
      },
      {
        provide: AiConfigService,
        useValue: { getConfig: jest.fn().mockResolvedValue(makeConfig()) },
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

// ─── bulkTranslate ────────────────────────────────────────────────────────────

describe('AiTranslateService — bulkTranslate response parsing', () => {
  let service: AiTranslateService;

  beforeEach(async () => {
    generateContentMock.mockReset();
    service = await buildService();
  });

  it('parses translations correctly', async () => {
    geminiReturns({
      greeting: {
        contextNeed: 'none',
        contextReason: null,
        translations: { uk: 'Привіт', nb: 'Hei' },
      },
    });

    const { results } = await service.bulkTranslate([
      { key: 'greeting', text: 'Hello', targetLocales: ['uk', 'nb'] },
    ]);

    expect(results['greeting']).toEqual({ uk: 'Привіт', nb: 'Hei' });
  });

  it('parses contextNeed = "required" with contextReason', async () => {
    geminiReturns({
      home: {
        contextNeed: 'required',
        contextReason: 'Could mean: app homepage, home address, or home screen',
        translations: { uk: 'Домашня сторінка', nb: 'Hjem' },
      },
    });

    const { results, contextInfo } = await service.bulkTranslate([
      { key: 'home', text: 'Home', targetLocales: ['uk', 'nb'] },
    ]);

    expect(contextInfo['home']).toEqual({
      need: 'required',
      reason: 'Could mean: app homepage, home address, or home screen',
    });
    expect(results['home']).toEqual({ uk: 'Домашня сторінка', nb: 'Hjem' });
  });

  it('parses contextNeed = "useful" with contextReason', async () => {
    geminiReturns({
      delete_account: {
        contextNeed: 'useful',
        contextReason: 'Tone (formal vs casual) depends on product',
        translations: { uk: 'Видалити акаунт' },
      },
    });

    const { contextInfo } = await service.bulkTranslate([
      { key: 'delete_account', text: 'Delete account', targetLocales: ['uk'] },
    ]);

    expect(contextInfo['delete_account']).toEqual({
      need: 'useful',
      reason: 'Tone (formal vs casual) depends on product',
    });
  });

  it('parses contextNeed = "none", contextReason is null', async () => {
    geminiReturns({
      email: {
        contextNeed: 'none',
        contextReason: null,
        translations: { uk: 'Електронна пошта' },
      },
    });

    const { contextInfo } = await service.bulkTranslate([
      { key: 'email', text: 'Email address', targetLocales: ['uk'] },
    ]);

    expect(contextInfo['email']).toEqual({ need: 'none', reason: null });
  });

  it('ignores unknown contextNeed values (does not add to contextInfo)', async () => {
    geminiReturns({
      foo: {
        contextNeed: 'maybe',
        contextReason: 'something',
        translations: { uk: 'Щось' },
      },
    });

    const { contextInfo } = await service.bulkTranslate([
      { key: 'foo', text: 'Foo', targetLocales: ['uk'] },
    ]);

    expect(contextInfo['foo']).toBeUndefined();
  });

  it('filters translations to only requested locale codes', async () => {
    geminiReturns({
      save: {
        contextNeed: 'none',
        contextReason: null,
        translations: { uk: 'Зберегти', nb: 'Lagre', fr: 'Enregistrer' },
      },
    });

    const { results } = await service.bulkTranslate([
      { key: 'save', text: 'Save', targetLocales: ['uk', 'nb'] },
    ]);

    expect(results['save']).toEqual({ uk: 'Зберегти', nb: 'Lagre' });
    expect(results['save']['fr']).toBeUndefined();
  });
});

// ─── bulkCheckQuality ─────────────────────────────────────────────────────────

describe('AiTranslateService — bulkCheckQuality response parsing', () => {
  let service: AiTranslateService;

  beforeEach(async () => {
    generateContentMock.mockReset();
    service = await buildService();
  });

  it('parses score, level, comment for each locale', async () => {
    geminiReturns({
      greeting: {
        contextNeed: 'none',
        contextReason: null,
        locales: {
          uk: { score: 95, comment: '' },
          nb: { score: 82, comment: 'Slightly unnatural phrasing' },
        },
      },
    });

    const { results } = await service.bulkCheckQuality([
      {
        key: 'greeting',
        source: 'Hello',
        context: null,
        translations: { uk: 'Привіт', nb: 'Hei' },
      },
    ]);

    expect(results['greeting']['uk']).toEqual({
      score: 95,
      level: 'green',
      comment: '',
    });
    expect(results['greeting']['nb']).toEqual({
      score: 82,
      level: 'yellow',
      comment: 'Slightly unnatural phrasing',
    });
  });

  it('parses contextNeed and contextReason from quality response', async () => {
    geminiReturns({
      book: {
        contextNeed: 'required',
        contextReason: 'Could mean: to book/reserve, or a book to read',
        locales: { uk: { score: 70, comment: 'Ambiguous without context' } },
      },
    });

    const { results, contextInfo } = await service.bulkCheckQuality([
      {
        key: 'book',
        source: 'Book',
        context: null,
        translations: { uk: 'Книга' },
      },
    ]);

    expect(contextInfo['book']).toEqual({
      need: 'required',
      reason: 'Could mean: to book/reserve, or a book to read',
    });
    expect(results['book']['uk'].score).toBe(70);
    expect(results['book']['uk'].level).toBe('red');
  });

  it('clamps score to 1–100 range', async () => {
    geminiReturns({
      key1: {
        contextNeed: 'none',
        contextReason: null,
        locales: { uk: { score: 150, comment: '' } },
      },
    });

    const { results } = await service.bulkCheckQuality([
      {
        key: 'key1',
        source: 'Text',
        context: null,
        translations: { uk: 'Текст' },
      },
    ]);

    expect(results['key1']['uk'].score).toBe(100);
  });

  it('scores 1 with placeholder mismatch comment when placeholder missing in translation', async () => {
    geminiReturns({
      greeting: {
        contextNeed: 'none',
        contextReason: null,
        locales: { uk: { score: 90, comment: '' } },
      },
    });

    const { results } = await service.bulkCheckQuality([
      {
        key: 'greeting',
        source: 'Hello {{name}}',
        context: null,
        translations: { uk: 'Привіт' }, // missing {{name}}
      },
    ]);

    expect(results['greeting']['uk'].score).toBe(1);
    expect(results['greeting']['uk'].level).toBe('red');
    expect(results['greeting']['uk'].comment).toContain('{{name}}');
  });

  it('skips AI call for items with null source and returns score 1', async () => {
    geminiReturns({});

    const { results } = await service.bulkCheckQuality([
      {
        key: 'lang_only',
        source: null,
        context: null,
        translations: { uk: 'Текст' },
      },
    ]);

    expect(results['lang_only']['uk'].score).toBe(1);
    expect(results['lang_only']['uk'].comment).toContain('No source text');
  });

  it('marks key as skipped when chunk times out', async () => {
    // Simulate the internal timeout signal — the service catches 'chunk_timeout'
    // and adds the key to skippedKeys instead of throwing.
    generateContentMock.mockRejectedValue(new Error('chunk_timeout'));

    const { skippedKeys } = await service.bulkCheckQuality([
      {
        key: 'slow_key',
        source: 'Text',
        context: null,
        translations: { uk: 'Текст' },
      },
    ]);

    expect(skippedKeys).toContain('slow_key');
  });
});

// ─── context penalty (quality worker logic) ───────────────────────────────────

describe('AiTranslateService — context penalty (proportional, min 1)', () => {
  let service: AiTranslateService;

  beforeEach(async () => {
    generateContentMock.mockReset();
    service = await buildService();
  });

  it('bulkCheckQuality returns raw scores — penalty is applied by the worker, not the service', async () => {
    // The service returns what Gemini says; the worker applies the penalty.
    // This test confirms the service does NOT silently alter scores.
    geminiReturns({
      home: {
        contextNeed: 'required',
        contextReason: 'Could mean homepage or home address',
        locales: { uk: { score: 90, comment: '' } },
      },
    });

    const { results, contextInfo } = await service.bulkCheckQuality([
      {
        key: 'home',
        source: 'Home',
        context: null,
        translations: { uk: 'Додому' },
      },
    ]);

    // Service returns unmodified score — worker responsibility to apply penalty
    expect(results['home']['uk'].score).toBe(90);
    expect(contextInfo['home'].need).toBe('required');
  });
});
