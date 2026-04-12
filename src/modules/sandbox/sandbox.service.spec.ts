import { SandboxService } from './sandbox.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSandboxService(
  overrides: Record<string, unknown> = {},
): SandboxService {
  const defaultSandboxRepo = {
    findOne: jest.fn(),
    findBy: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const defaultLocaleRepo = {
    findBy: jest.fn(),
  };

  const defaultNamespaceRepo = {
    findOne: jest.fn(),
  };

  const defaultKeyRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const defaultProjectRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const defaultValueRepo = {};

  const defaultAiTranslateService = {
    checkQuality: jest.fn(),
  };

  const defaultAutoTranslateWorkerService = {};
  const defaultDataSource = {};
  const defaultAccess = {
    requireProject: jest.fn(),
    assertAccess: jest.fn(),
    assertOwnerOrAdmin: jest.fn(),
    isAdmin: jest.fn(),
  };
  const defaultPromotionService = {
    getDiff: jest.fn(),
  };

  return new SandboxService(
    (overrides.projectRepo ?? defaultProjectRepo) as any,
    (overrides.sandboxRepo ?? defaultSandboxRepo) as any,
    (overrides.valueRepo ?? defaultValueRepo) as any,
    (overrides.keyRepo ?? defaultKeyRepo) as any,
    (overrides.namespaceRepo ?? defaultNamespaceRepo) as any,
    (overrides.localeRepo ?? defaultLocaleRepo) as any,
    (overrides.dataSource ?? defaultDataSource) as any,
    (overrides.access ?? defaultAccess) as any,
    (overrides.promotionService ?? defaultPromotionService) as any,
    (overrides.aiTranslateService ?? defaultAiTranslateService) as any,
    (overrides.autoTranslateWorkerService ??
      defaultAutoTranslateWorkerService) as any,
  );
}

// ─── runSandboxQualityCheck ───────────────────────────────────────────────────

describe('runSandboxQualityCheck', () => {
  const PROJECT_ID = 'project-uuid';
  const NS_ID = 'ns-uuid';
  const KEY_ID = 'key-uuid';
  // LOCALE_ID, LOCALE_CODE, TEST_VALUE removed — not yet used in tests

  function makeQbChain() {
    const executeMock = jest.fn().mockResolvedValue(undefined);
    const whereMock = jest.fn().mockReturnThis();
    const setMock = jest.fn().mockReturnThis();
    const updateMock = jest.fn().mockReturnThis();
    const qbMock = {
      update: updateMock,
      set: setMock,
      where: whereMock,
      execute: executeMock,
    };
    return { qbMock, executeMock, whereMock, setMock, updateMock };
  }

  // Input:  key "Save", en="Save" (default), uk="Зберегти"
  // checkQuality mock returns score=70 for en, score=90 for uk
  //
  // Expected (current behaviour):
  //   en → checkQuality("Save", "Save", "en", "language_quality")
  //        i.e. source === translation — same text compared against itself
  //   uk → checkQuality("Save", "Зберегти", "uk", "translation_quality")
  //        i.e. normal source vs translation comparison
  it('calls checkQuality for EN with source===translation (language_quality mode)', async () => {
    const { qbMock } = makeQbChain();

    const checkQuality = jest.fn().mockResolvedValue({
      score: 70,
      level: 'yellow',
      comment: 'Identical source/translation',
      contextNeed: 'none',
      contextReason: null,
    });

    const EN_ID = 'en-id';
    const UK_ID = 'uk-id';

    const sandboxRepo = {
      findOne: jest
        .fn()
        .mockImplementation((opts: { where?: { localeId?: string } }) => {
          if (opts.where?.localeId === EN_ID)
            return Promise.resolve({
              value: 'Save',
              qualityReviewState: 'not_checked',
            });
          if (opts.where?.localeId === UK_ID)
            return Promise.resolve({
              value: 'Зберегти',
              qualityReviewState: 'not_checked',
            });
          return Promise.resolve({ context: null });
        }),
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    const locales = [
      { id: EN_ID, code: 'en', isDefault: true },
      { id: UK_ID, code: 'uk', isDefault: false },
    ];

    const service = buildSandboxService({
      projectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: PROJECT_ID,
        }),
      },
      sandboxRepo,
      namespaceRepo: { findOne: jest.fn().mockResolvedValue({ id: NS_ID }) },
      keyRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: KEY_ID,
          contextNeed: null,
          contextReason: null,
        }),
        save: jest.fn(),
      },
      localeRepo: { findBy: jest.fn().mockResolvedValue(locales) },
      aiTranslateService: { checkQuality },
    });

    await service.runSandboxQualityCheck(
      'my-project',
      'common',
      'Save',
      'user-id',
      'USER' as any,
    );

    const calls = checkQuality.mock.calls as unknown[][];

    // EN call: source === translation, mode = language_quality
    const enCall = calls.find((c) => c[2] === 'en');
    expect(enCall).toBeDefined();
    expect(enCall![0]).toBe('Save'); // source
    expect(enCall![1]).toBe('Save'); // translation — same as source!
    expect(enCall![3]).toBe('language_quality');

    // UK call: source !== translation, mode = translation_quality
    const ukCall = calls.find((c) => c[2] === 'uk');
    expect(ukCall).toBeDefined();
    expect(ukCall![0]).toBe('Save'); // source
    expect(ukCall![1]).toBe('Зберегти'); // translation
    expect(ukCall![3]).toBe('translation_quality');
  });
});

// ─── persistQualityResults ────────────────────────────────────────────────────

describe('persistQualityResults', () => {
  describe('Bug 3 — expected guard: must not overwrite entries with reviewState=expected', () => {
    it('skips update for sandbox values with qualityReviewState=expected', async () => {
      const executeMock = jest.fn().mockResolvedValue(undefined);
      const whereMock = jest.fn().mockReturnThis();
      const setMock = jest.fn().mockReturnThis();
      const updateMock = jest.fn().mockReturnThis();
      const qbMock = {
        update: updateMock,
        set: setMock,
        where: whereMock,
        execute: executeMock,
      };

      const sandboxRepo = {
        findOne: jest.fn().mockResolvedValue({
          value: 'accepted translation',
          qualityReviewState: 'expected',
        }),
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      };

      const PROJECT_ID = 'proj-uuid';
      const NS_ID = 'ns-uuid';
      const KEY_ID = 'key-uuid';
      const LOCALE_ID = 'locale-uuid';

      const namespaceRepo = {
        findOne: jest.fn().mockResolvedValue({ id: NS_ID }),
      };
      const keyRepo = {
        findOne: jest.fn().mockResolvedValue({ id: KEY_ID }),
        save: jest.fn(),
      };
      const locales = [{ id: LOCALE_ID, code: 'uk', isDefault: false }];
      const localeRepo = { findBy: jest.fn().mockResolvedValue(locales) };
      const projectRepo = { findOne: jest.fn() };

      const service = buildSandboxService({
        projectRepo,
        sandboxRepo,
        namespaceRepo,
        keyRepo,
        localeRepo,
      });

      await service.persistQualityResults(PROJECT_ID, 'common', {
        'my.key': {
          uk: { score: 50, level: 'red', comment: 'Poor quality' },
        },
      });

      expect(executeMock).not.toHaveBeenCalled();
    });
  });
});

// ─── analyzeEntries ───────────────────────────────────────────────────────────

describe('analyzeEntries', () => {
  const PROJECT_ID = 'proj-uuid';
  const NS_ID = 'ns-uuid';

  /**
   * Build a QueryBuilder chain mock that resolves getRawMany() with the given rows.
   * Uses mockReturnThis() for all intermediate chain methods to allow arbitrary chaining depth.
   */
  function makeAnalyzeQbChain(rawRows: { key: string; value: string }[]) {
    const getRawManyMock = jest.fn().mockResolvedValue(rawRows);
    const qbMock: Record<string, jest.Mock> = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      getRawMany: getRawManyMock,
    };
    // All chain methods return the same qbMock object (except getRawMany)
    qbMock.innerJoin.mockReturnValue(qbMock);
    qbMock.where.mockReturnValue(qbMock);
    qbMock.andWhere.mockReturnValue(qbMock);
    qbMock.select.mockReturnValue(qbMock);
    return { qbMock, getRawManyMock };
  }

  function buildService(
    existingKeys: { id: string; key: string }[],
    rawSourceValues: { key: string; value: string }[],
  ) {
    const { qbMock } = makeAnalyzeQbChain(rawSourceValues);

    const projectRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: PROJECT_ID,
      }),
    };
    const namespaceRepo = {
      findOne: jest.fn().mockResolvedValue({ id: NS_ID }),
    };
    const localeRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'loc-id', code: 'en', isDefault: true }),
      findBy: jest.fn(),
    };
    const keyRepo = {
      find: jest.fn().mockResolvedValue(existingKeys),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const sandboxRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    return buildSandboxService({
      projectRepo,
      namespaceRepo,
      localeRepo,
      keyRepo,
      sandboxRepo,
    });
  }

  it('classifies a new key with new text as safe_to_create', async () => {
    const service = buildService([], []);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [{ key: 'new.key', text: 'New text' }],
      'user-id',
      'USER' as any,
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('safe_to_create');
    expect(result.results[0].recommendation).toBe('create');
    expect(result.summary.safeToCreate).toBe(1);
  });

  it('classifies as key_exists_same_value when key and text both match', async () => {
    const existingKeys = [
      { id: 'key-1', key: 'existing.key', namespaceId: NS_ID },
    ];
    const rawSourceValues = [{ key: 'existing.key', value: 'Same text' }];
    const service = buildService(existingKeys as any, rawSourceValues);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [{ key: 'existing.key', text: 'Same text' }],
      'user-id',
      'USER' as any,
    );

    expect(result.results[0].status).toBe('key_exists_same_value');
    expect(result.results[0].recommendation).toBe('skip');
    expect(result.summary.alreadyExistSameValue).toBe(1);
  });

  it('classifies as key_exists_different_value when key exists but text differs', async () => {
    const existingKeys = [
      { id: 'key-1', key: 'existing.key', namespaceId: NS_ID },
    ];
    const rawSourceValues = [{ key: 'existing.key', value: 'Old text' }];
    const service = buildService(existingKeys as any, rawSourceValues);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [{ key: 'existing.key', text: 'New different text' }],
      'user-id',
      'USER' as any,
    );

    expect(result.results[0].status).toBe('key_exists_different_value');
    expect(result.results[0].recommendation).toBe('update');
    expect(result.results[0].conflict?.existingValue).toBe('Old text');
    expect(result.summary.keyConflicts).toBe(1);
  });

  it('classifies as value_exists_under_other_key when source text matches exactly one other key', async () => {
    const existingKeys = [
      { id: 'key-1', key: 'other.key', namespaceId: NS_ID },
    ];
    const rawSourceValues = [{ key: 'other.key', value: 'Shared text' }];
    const service = buildService(existingKeys as any, rawSourceValues);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [{ key: 'new.key', text: 'Shared text' }],
      'user-id',
      'USER' as any,
    );

    expect(result.results[0].status).toBe('value_exists_under_other_key');
    expect(result.results[0].recommendation).toBe('reuse');
    expect(result.results[0].conflict?.existingKeys).toEqual(['other.key']);
    expect(result.summary.sourceTextDuplicates).toBe(1);
  });

  it('classifies duplicate_in_batch for two entries with the same key', async () => {
    const service = buildService([], []);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [
        { key: 'dup.key', text: 'First text' },
        { key: 'dup.key', text: 'Second text' },
      ],
      'user-id',
      'USER' as any,
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('duplicate_in_batch');
    expect(result.results[1].status).toBe('duplicate_in_batch');
    expect(result.summary.batchConflicts).toBe(2);
  });

  it('returns correct summary counts for a mixed batch', async () => {
    const existingKeys = [
      { id: 'key-1', key: 'existing.key', namespaceId: NS_ID },
    ];
    const rawSourceValues = [{ key: 'existing.key', value: 'Same text' }];
    const service = buildService(existingKeys as any, rawSourceValues);

    const result = await service.analyzeEntries(
      'proj',
      'common',
      [
        { key: 'new.key', text: 'Brand new text' },
        { key: 'existing.key', text: 'Same text' },
      ],
      'user-id',
      'USER' as any,
    );

    expect(result.summary.total).toBe(2);
    expect(result.summary.safeToCreate).toBe(1);
    expect(result.summary.alreadyExistSameValue).toBe(1);
    expect(result.summary.keyConflicts).toBe(0);
    expect(result.summary.sourceTextDuplicates).toBe(0);
    expect(result.summary.batchConflicts).toBe(0);
  });
});
