import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AutoTranslateWorkerService } from './auto-translate-worker.service.js';
import { AiTranslateService } from './ai-translate.service.js';
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
    expect(dataSourceQueryMock).toHaveBeenCalledTimes(1);
    const [, params] = dataSourceQueryMock.mock.calls[0] as [
      string,
      unknown[][],
    ];
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

    // translation found → INSERT called
    expect(dataSourceQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = dataSourceQueryMock.mock.calls[0] as [
      string,
      unknown[][],
    ];
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

    expect(dataSourceQueryMock).toHaveBeenCalledTimes(1);
    const [, params] = dataSourceQueryMock.mock.calls[0] as [
      string,
      unknown[][],
    ];
    expect(params[3]).toEqual(expect.arrayContaining(['Привіт', 'Hej', 'Hej']));
  });
});
