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
