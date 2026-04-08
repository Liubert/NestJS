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

  describe('Bug 2 — default locale: must be skipped entirely', () => {
    it('returns null for default locale and does NOT call checkQuality', async () => {
      const { qbMock } = makeQbChain();
      const checkQuality = jest.fn().mockResolvedValue({
        score: 90,
        level: 'green',
        comment: 'ok',
        contextNeed: null,
        contextReason: null,
      });

      const EN_LOCALE_ID = 'en-locale-uuid';
      const EN_LOCALE_CODE = 'en';
      const UK_LOCALE_ID = 'uk-locale-uuid';
      const UK_LOCALE_CODE = 'uk';

      const sandboxRepo = {
        findOne: jest
          .fn()
          .mockImplementation((opts: { where?: { localeId?: string } }) => {
            if (opts.where?.localeId === EN_LOCALE_ID) {
              return Promise.resolve({
                value: 'source text',
                qualityReviewState: 'not_checked',
                qualityContentHash: null,
              });
            }
            if (opts.where?.localeId === UK_LOCALE_ID) {
              return Promise.resolve({
                value: 'переклад',
                qualityReviewState: 'not_checked',
                qualityContentHash: null,
              });
            }
            return Promise.resolve({ context: null });
          }),
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      };

      const project = { id: PROJECT_ID, sandboxInitializedAt: new Date() };
      const projectRepo = { findOne: jest.fn().mockResolvedValue(project) };
      const namespaceRepo = {
        findOne: jest.fn().mockResolvedValue({ id: NS_ID }),
      };
      const keyRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: KEY_ID,
          contextNeed: null,
          contextReason: null,
        }),
        save: jest.fn(),
      };
      const locales = [
        { id: EN_LOCALE_ID, code: EN_LOCALE_CODE, isDefault: true },
        { id: UK_LOCALE_ID, code: UK_LOCALE_CODE, isDefault: false },
      ];
      const localeRepo = { findBy: jest.fn().mockResolvedValue(locales) };

      const service = buildSandboxService({
        projectRepo,
        sandboxRepo,
        namespaceRepo,
        keyRepo,
        localeRepo,
        aiTranslateService: { checkQuality },
      });

      const results = await service.runSandboxQualityCheck(
        'my-project',
        'common',
        'my.key',
        'user-id',
        'USER' as any,
      );

      // Default locale must return null
      expect(results[EN_LOCALE_CODE]).toBeNull();
      // checkQuality must not be called for the default locale — only for uk
      const callLocales = checkQuality.mock.calls.map(
        (args: unknown[]) => args[2] as string,
      );
      expect(callLocales).not.toContain(EN_LOCALE_CODE);
      expect(callLocales).toContain(UK_LOCALE_CODE);
    });
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
