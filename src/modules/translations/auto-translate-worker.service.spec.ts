import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AutoTranslateWorkerService } from './auto-translate-worker.service.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import { ProjectEntity } from './entities/project.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLocale(code: string): LocaleEntity {
  const l = new LocaleEntity();
  l.id = `locale-${code}`;
  l.code = code;
  l.isDefault = false;
  l.localeSkill = null;
  return l;
}

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoTranslateWorkerService — translateKey locale code mismatch', () => {
  let service: AutoTranslateWorkerService;
  let translateForLocalesMock: jest.Mock;
  let dataSourceQueryMock: jest.Mock;

  const projectId = 'project-1';
  const keyId = 'key-1';

  beforeEach(async () => {
    translateForLocalesMock = jest.fn();
    dataSourceQueryMock = jest.fn().mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        AutoTranslateWorkerService,
        {
          provide: AiTranslateService,
          useValue: { translateForLocales: translateForLocalesMock },
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: makeRepo({
            update: jest.fn().mockResolvedValue(undefined),
          }),
        },
        {
          provide: getRepositoryToken(SandboxValueEntity),
          // No existing sandbox values → locale is "missing"
          useValue: makeRepo({ find: jest.fn().mockResolvedValue([]) }),
        },
        {
          provide: getRepositoryToken(LocaleEntity),
          useValue: makeRepo(),
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: dataSourceQueryMock },
        },
      ],
    }).compile();

    service = module.get(AutoTranslateWorkerService);
  });

  // ─── FIXED: locale code normalisation ──────────────────────────────────────

  it('FIXED: when locale.code is nb-NO but Gemini returns key nb — translation IS saved via primary-subtag fallback', async () => {
    const nbNoLocale = makeLocale('nb-NO');

    // Gemini normalises nb-NO → nb in the response JSON
    translateForLocalesMock.mockResolvedValue({
      translations: { nb: 'Hei verden' },
      contextNeed: null,
      contextReason: null,
    });

    await service['translateKey'](projectId, keyId, 'hello', 'Hello world', [
      nbNoLocale,
    ]);

    // fallback: translations['nb'] found for locale 'nb-NO' → INSERT called
    // translateKey: 1 UPSERT + 1 clear-pending UPDATE (+ optional contextNeed UPDATE)
    const insertCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO sandbox_values'),
    );
    expect(insertCalls).toHaveLength(1);
    const [, params] = insertCalls[0] as [string, unknown[][]];
    expect(params[3]).toEqual(['Hei verden']); // value saved
  });

  // ─── FIXED behaviour ────────────────────────────────────────────────────────

  it('FIXED: when locale.code is nb (2-char) and Gemini returns key nb — translation IS saved', async () => {
    const nbLocale = makeLocale('nb');

    // Gemini returns nb (same as locale.code now)
    translateForLocalesMock.mockResolvedValue({
      translations: { nb: 'Hei verden' },
      contextNeed: null,
      contextReason: null,
    });

    await service['translateKey'](projectId, keyId, 'hello', 'Hello world', [
      nbLocale,
    ]);

    // translation found → INSERT called (+ clear-pending UPDATE)
    const insertCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO sandbox_values'),
    );
    expect(insertCalls).toHaveLength(1);
    const [sql, params] = insertCalls[0] as [string, unknown[][]];
    expect(sql).toContain('INSERT INTO sandbox_values');
    // values array: [projectIds[], keyIds[], localeIds[], values[], ...]
    expect(params[3]).toEqual(['Hei verden']); // value saved
  });

  it('passes key context to translateForLocales', async () => {
    const ukLocale = makeLocale('uk');
    translateForLocalesMock.mockResolvedValue({
      translations: { uk: 'Забронювати' },
      contextNeed: 'required',
      contextReason: 'Ambiguous',
    });

    await service['translateKey'](
      projectId,
      keyId,
      'book',
      'book',
      [ukLocale],
      'reservation',
    );

    expect(translateForLocalesMock).toHaveBeenCalledWith(
      'book',
      expect.any(Object),
      projectId,
      undefined,
      'reservation',
      undefined, // previousComment: no existing sandbox values
    );
  });

  it('FIXED: simple 2-char codes (uk, sv, da) always match Gemini response keys', async () => {
    const locales = [makeLocale('uk'), makeLocale('sv'), makeLocale('da')];

    translateForLocalesMock.mockResolvedValue({
      translations: { uk: 'Привіт', sv: 'Hej', da: 'Hej' },
      contextNeed: null,
      contextReason: null,
    });

    await service['translateKey'](
      projectId,
      keyId,
      'hello',
      'Hello world',
      locales,
    );

    // translateKey: 1 UPSERT + 1 clear-pending UPDATE (+ optional contextNeed UPDATE)
    const insertCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO sandbox_values'),
    );
    expect(insertCalls).toHaveLength(1);
    const [, params] = insertCalls[0] as [string, unknown[][]];
    expect(params[3]).toEqual(expect.arrayContaining(['Привіт', 'Hej', 'Hej']));
  });
});

// ─── translateKeysBulk tests ────────────────────────────────────────────────

describe('AutoTranslateWorkerService — translateKeysBulk', () => {
  let service: AutoTranslateWorkerService;
  let bulkTranslateMock: jest.Mock;
  let dataSourceQueryMock: jest.Mock;
  let sandboxFindMock: jest.Mock;
  let projectUpdateMock: jest.Mock;

  const projectId = 'project-1';

  function makeLocaleWithSkill(
    code: string,
    skill: string | null = null,
  ): LocaleEntity {
    const l = new LocaleEntity();
    l.id = `locale-${code}`;
    l.code = code;
    l.isDefault = false;
    l.localeSkill = skill;
    return l;
  }

  beforeEach(async () => {
    bulkTranslateMock = jest.fn();
    dataSourceQueryMock = jest.fn().mockResolvedValue([]);
    sandboxFindMock = jest.fn().mockResolvedValue([]);
    projectUpdateMock = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        AutoTranslateWorkerService,
        {
          provide: AiTranslateService,
          useValue: {
            translateForLocales: jest.fn(),
            bulkTranslate: bulkTranslateMock,
          },
        },
        {
          provide: getRepositoryToken(ProjectEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findBy: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn().mockResolvedValue(null),
            update: projectUpdateMock,
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SandboxValueEntity),
          useValue: {
            find: sandboxFindMock,
            findBy: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue(undefined),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LocaleEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findBy: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue(undefined),
            save: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: dataSourceQueryMock },
        },
      ],
    }).compile();

    service = module.get(AutoTranslateWorkerService);
  });

  it('calls bulkTranslate once with all keys (not translateForLocales N times)', async () => {
    const locales = [makeLocaleWithSkill('uk'), makeLocaleWithSkill('sv')];
    sandboxFindMock.mockResolvedValue([]);

    bulkTranslateMock.mockResolvedValue({
      results: {
        hello: { uk: 'Привіт', sv: 'Hej' },
        world: { uk: 'Світ', sv: 'Värld' },
      },
      contextInfo: {},
    });

    const keys = [
      { keyId: 'key-1', keyName: 'hello', sourceText: 'Hello', context: null },
      { keyId: 'key-2', keyName: 'world', sourceText: 'World', context: null },
    ];

    await service['translateKeysBulk'](projectId, keys, locales);

    expect(bulkTranslateMock).toHaveBeenCalledTimes(1);
    const [entries] = bulkTranslateMock.mock.calls[0] as [
      Array<{ key: string; text: string; targetLocales: string[] }>,
    ];
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toBe('hello');
    expect(entries[1].key).toBe('world');
  });

  it('filters out keys where all locales already have sandbox values', async () => {
    const locales = [makeLocaleWithSkill('uk'), makeLocaleWithSkill('sv')];

    // key-1 has both locales already in sandbox
    sandboxFindMock.mockResolvedValue([
      { keyId: 'key-1', localeId: 'locale-uk' },
      { keyId: 'key-1', localeId: 'locale-sv' },
    ]);

    bulkTranslateMock.mockResolvedValue({ results: {}, contextInfo: {} });

    const keys = [
      {
        keyId: 'key-1',
        keyName: 'hello',
        sourceText: 'Hello',
        context: null,
      },
    ];

    await service['translateKeysBulk'](projectId, keys, locales);

    // bulkTranslate should not be called because all locales are present
    expect(bulkTranslateMock).not.toHaveBeenCalled();
  });

  it('handles locale code normalisation (nb-NO -> nb fallback in results)', async () => {
    const nbNoLocale = makeLocaleWithSkill('nb-NO');
    sandboxFindMock.mockResolvedValue([]);

    // Gemini normalises nb-NO → nb
    bulkTranslateMock.mockResolvedValue({
      results: { hello: { nb: 'Hei verden' } },
      contextInfo: {},
    });

    await service['translateKeysBulk'](
      projectId,
      [
        {
          keyId: 'key-1',
          keyName: 'hello',
          sourceText: 'Hello world',
          context: null,
        },
      ],
      [nbNoLocale],
    );

    // UPSERT should be called with the translated value
    // translateKey: 1 UPSERT + 1 clear-pending UPDATE (+ optional contextNeed UPDATE)
    const insertCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO sandbox_values'),
    );
    expect(insertCalls).toHaveLength(1);
    const [, params] = insertCalls[0] as [string, unknown[][]];
    expect(params[3]).toEqual(['Hei verden']);
  });

  it('issues a single UPSERT for all translations', async () => {
    const locales = [makeLocaleWithSkill('uk'), makeLocaleWithSkill('sv')];
    sandboxFindMock.mockResolvedValue([]);

    bulkTranslateMock.mockResolvedValue({
      results: {
        hello: { uk: 'Привіт', sv: 'Hej' },
        world: { uk: 'Світ', sv: 'Värld' },
      },
      contextInfo: {},
    });

    await service['translateKeysBulk'](
      projectId,
      [
        {
          keyId: 'key-1',
          keyName: 'hello',
          sourceText: 'Hello',
          context: null,
        },
        {
          keyId: 'key-2',
          keyName: 'world',
          sourceText: 'World',
          context: null,
        },
      ],
      locales,
    );

    // Only 1 UPSERT call (not 4 separate inserts)
    const upsertCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO sandbox_values'),
    );
    expect(upsertCalls).toHaveLength(1);
    const [, params] = upsertCalls[0] as [string, unknown[][]];
    // 4 values for 2 keys × 2 locales
    expect((params[3] as string[]).length).toBe(4);
  });

  it('persists contextNeed per key after bulk translation', async () => {
    const locales = [makeLocaleWithSkill('uk')];
    sandboxFindMock.mockResolvedValue([]);

    bulkTranslateMock.mockResolvedValue({
      results: { book: { uk: 'Книга' } },
      contextInfo: {
        book: { need: 'required', reason: 'Ambiguous word' },
      },
    });

    await service['translateKeysBulk'](
      projectId,
      [{ keyId: 'key-1', keyName: 'book', sourceText: 'book', context: null }],
      locales,
    );

    const updateCalls = (
      dataSourceQueryMock.mock.calls as [string, unknown[]][]
    ).filter(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('UPDATE sandbox_values') &&
        sql.includes('context_need'),
    );
    expect(updateCalls).toHaveLength(1);
    const [, params] = updateCalls[0];
    expect(params[0]).toBe('required');
    expect(params[1]).toBe('Ambiguous word');
  });

  it('pollAndProcess handles 429 rate-limit by skipping remaining keys for that project', async () => {
    // pollAndProcess main query returns 2 keys for same project
    dataSourceQueryMock.mockResolvedValueOnce([
      {
        project_id: projectId,
        key_id: 'key-1',
        key_name: 'hello',
        source_text: 'Hello',
        key_context: null,
        default_locale_id: 'locale-en',
      },
      {
        project_id: projectId,
        key_id: 'key-2',
        key_name: 'world',
        source_text: 'World',
        key_context: null,
        default_locale_id: 'locale-en',
      },
    ]);

    // localeRepo.findBy: called once for pollAndProcess per-project locale fetch
    const localeRepoMock = service['localeRepo'] as unknown as {
      findBy: jest.Mock;
    };
    localeRepoMock.findBy.mockResolvedValueOnce([makeLocaleWithSkill('uk')]);

    // sandboxRepo.find returns empty (no existing values)
    sandboxFindMock.mockResolvedValue([]);

    // bulkTranslate throws 429
    const rateLimitError = new HttpException(
      'Too Many Requests',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    bulkTranslateMock.mockRejectedValue(rateLimitError);

    // Should not throw — 429 is handled gracefully
    await expect(service['pollAndProcess']()).resolves.toBeUndefined();

    // translateKeysBulk (via bulkTranslate) should have been called once (then stopped on 429)
    expect(bulkTranslateMock).toHaveBeenCalledTimes(1);
  });
});
