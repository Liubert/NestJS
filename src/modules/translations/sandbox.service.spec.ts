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

  const defaultSnapshotRepo = {};
  const defaultValueRepo = {};

  const defaultAiTranslateService = {
    checkQuality: jest.fn(),
  };

  const defaultAutoTranslateWorkerService = {};
  const defaultDataSource = {};

  return new SandboxService(
    (overrides.projectRepo ?? defaultProjectRepo) as any,
    (overrides.sandboxRepo ?? defaultSandboxRepo) as any,
    (overrides.snapshotRepo ?? defaultSnapshotRepo) as any,
    (overrides.valueRepo ?? defaultValueRepo) as any,
    (overrides.keyRepo ?? defaultKeyRepo) as any,
    (overrides.namespaceRepo ?? defaultNamespaceRepo) as any,
    (overrides.localeRepo ?? defaultLocaleRepo) as any,
    (overrides.dataSource ?? defaultDataSource) as any,
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
  const LOCALE_ID = 'locale-uuid';
  const LOCALE_CODE = 'uk';
  const TEST_VALUE = 'test translation value';

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
            return Promise.resolve({ value: 'Save', qualityReviewState: 'not_checked' });
          if (opts.where?.localeId === UK_ID)
            return Promise.resolve({ value: 'Зберегти', qualityReviewState: 'not_checked' });
          return Promise.resolve({ context: null });
        }),
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    const locales = [
      { id: EN_ID, code: 'en', isDefault: true },
      { id: UK_ID, code: 'uk', isDefault: false },
    ];

    const service = buildSandboxService({
      projectRepo: { findOne: jest.fn().mockResolvedValue({ id: PROJECT_ID, sandboxInitializedAt: new Date() }) },
      sandboxRepo,
      namespaceRepo: { findOne: jest.fn().mockResolvedValue({ id: NS_ID }) },
      keyRepo: { findOne: jest.fn().mockResolvedValue({ id: KEY_ID, contextNeed: null, contextReason: null }), save: jest.fn() },
      localeRepo: { findBy: jest.fn().mockResolvedValue(locales) },
      aiTranslateService: { checkQuality },
    });

    await service.runSandboxQualityCheck('my-project', 'common', 'Save', 'user-id', 'USER' as any);

    const calls = checkQuality.mock.calls as unknown[][];

    // EN call: source === translation, mode = language_quality
    const enCall = calls.find((c) => c[2] === 'en');
    expect(enCall).toBeDefined();
    expect(enCall![0]).toBe('Save');      // source
    expect(enCall![1]).toBe('Save');      // translation — same as source!
    expect(enCall![3]).toBe('language_quality');

    // UK call: source !== translation, mode = translation_quality
    const ukCall = calls.find((c) => c[2] === 'uk');
    expect(ukCall).toBeDefined();
    expect(ukCall![0]).toBe('Save');       // source
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
