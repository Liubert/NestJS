import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  Typography,
  Space,
  Select,
  Button,
  Modal,
  Checkbox,
  message,
  Tooltip,
  Popconfirm,
  Tag,
  Row,
  Col,
  Alert,
  Spin,
  Tabs,
  Empty,
} from 'antd';
import {
  ArrowRightOutlined,
  RollbackOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import apiClient from '../../api/client';
import { useSupportedLocales } from '../../hooks/useSupportedLocales';

// ─── Extracted Components ─────────────────────────────────────────────────────
import type {
  Project,
  ProjectDetails,
  PaginatedEntries,
  SandboxStatus,
  DiffResult,
  DiffEntry,
  Snapshot,
  KeyDiffRow,
  Entry,
  EntriesTableProps,
} from './components/types';
import {
  fetchProjects,
  fetchProjectDetails,
  fetchEntries,
  fetchSandboxStatus,
  fetchSandboxDiff,
  fetchSnapshots,
  fetchSandboxEntries,
  createSandboxEntry,
  updateSandboxEntry,
  deleteSandboxEntry,
  revertSandboxKey,
  promoteSelective,
} from './components/api';
import { QUALITY_COLOR } from './components/QualityBadge';
import { buildColumns } from './components/columns';
import FilterBar from './components/FilterBar';
import EntryEditModal from './components/EntryEditModal';
import AddLocaleModal from './components/AddLocaleModal';

const { Title, Text } = Typography;

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_BG: Record<string, string> = {
  added: '#f6ffed',
  changed: '#fffbe6',
  deleted: '#fff1f0',
};

const POLL_INTERVAL_MS = 10_000; // 10s background refresh

// ─── Diff helpers ─────────────────────────────────────────────────────────────


function buildKeyDiffRows(entries: DiffEntry[]): KeyDiffRow[] {
  const map = new Map<string, KeyDiffRow>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, {
        id,
        namespace: e.namespace,
        key: e.key,
        status: e.status,
        localeEntries: [],
        minQualityScore: null,
        worstQualityLevel: null,
      });
    }
    const row = map.get(id)!;
    row.localeEntries.push(e);
    if (
      e.status === 'added' ||
      (e.status === 'deleted' && row.status === 'changed')
    ) {
      row.status = e.status;
    }
    // Track quality aggregates
    if (e.quality?.score != null) {
      if (row.minQualityScore === null || e.quality.score < row.minQualityScore) {
        row.minQualityScore = e.quality.score;
      }
    }
    if (e.quality?.level) {
      const levelPriority: Record<string, number> = { red: 3, yellow: 2, green: 1, expected: 0 };
      const currentPriority = row.worstQualityLevel ? (levelPriority[row.worstQualityLevel] ?? 0) : -1;
      const newPriority = levelPriority[e.quality.level] ?? 0;
      if (newPriority > currentPriority) {
        row.worstQualityLevel = e.quality.level;
      }
    }
  }
  return Array.from(map.values());
}

function buildKeyStatusLookup(
  entries: DiffEntry[],
): Map<string, DiffEntry['status']> {
  const m = new Map<string, DiffEntry['status']>();
  for (const e of entries) {
    const k = `${e.namespace}/${e.key}`;
    const existing = m.get(k);
    if (
      !existing ||
      e.status === 'added' ||
      (e.status === 'deleted' && existing === 'changed')
    ) {
      m.set(k, e.status);
    }
  }
  return m;
}

// ─── Shared Entries Table ─────────────────────────────────────────────────────

const EntriesTable: React.FC<EntriesTableProps> = ({
  projectSlug,
  queryKeyPrefix,
  fetchFn,
  createFn,
  updateFn,
  deleteFn,
  enabled = true,
  onMutationSuccess,
  onNamespaceChange,
  changedNamespaces,
  getRowProps,
  renderKeyExtra,
  clientFilter,
  isSandbox,
  deleteConfirmTitle = 'Delete this key?',
  deleteConfirmDescription,
  extraControls,
}) => {
  const qc = useQueryClient();
  const prevProjectSlugRef = useRef(projectSlug);
  const [namespace, setNamespaceRaw] = useState(
    () => localStorage.getItem('translations_namespace') ?? '',
  );
  const setNamespace = (ns: unknown) => {
    const slug = typeof ns === 'string' ? ns : '';
    setNamespaceRaw(slug);
    localStorage.setItem('translations_namespace', slug);
    onNamespaceChange?.(slug);
  };
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt' | 'qualityScore'>(
    'key',
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [qualityLevel, setQualityLevel] = useState('');
  const [reviewState, setReviewState] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [addLocaleOpen, setAddLocaleOpen] = useState(false);
  const [resetLocalesModalOpen, setResetLocalesModalOpen] = useState(false);
  const [selectedLocalesForReset, setSelectedLocalesForReset] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ key: string; locale: string } | null>(null);

  const { data: supportedLocales = [] } = useSupportedLocales();
  const getFlagForCode = useCallback(
    (code: string) =>
      supportedLocales.find((l) => l.code === code)?.flag ?? '',
    [supportedLocales],
  );

  const { data: projectDetails } = useQuery<ProjectDetails>({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  });

  React.useEffect(() => {
    if (prevProjectSlugRef.current !== projectSlug) {
      setNamespace('');
      setPage(1);
      prevProjectSlugRef.current = projectSlug;
    }
  }, [projectSlug]);

  React.useEffect(() => {
    if (!projectDetails || projectDetails.namespaces.length === 0) return;
    if (!namespace || !projectDetails.namespaces.some((ns) => ns.slug === namespace)) {
      setNamespace(projectDetails.namespaces[0].slug);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales?.map((l) => l.code) ?? [];
  const defaultLocale = projectDetails?.locales?.find((l) => l.isDefault)?.code;

  const namespaceIsValid = !!projectDetails?.namespaces.some(
    (ns) => ns.slug === namespace,
  );

  const { data: entriesData, isLoading: entriesLoading, error: entriesError, isError: entriesIsError } =
    useQuery<PaginatedEntries>({
      queryKey: [
        queryKeyPrefix,
        projectSlug,
        namespace,
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
        qualityLevel,
        reviewState,
      ],
      queryFn: () =>
        fetchFn(
          projectSlug,
          namespace,
          page,
          pageSize,
          search,
          sortBy,
          sortOrder,
          qualityLevel || undefined,
          reviewState || undefined,
        ),
      enabled: !!projectSlug && namespaceIsValid && enabled,
      refetchInterval: POLL_INTERVAL_MS,
    });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queryKeyPrefix, projectSlug] });
    onMutationSuccess?.();
  }, [qc, queryKeyPrefix, projectSlug, onMutationSuccess]);

  const createMutation = useMutation({
    mutationFn: ({
      key,
      values,
      context,
    }: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }) => createFn!(projectSlug, namespace, { key, values, context }),
    onSuccess: () => {
      message.success('Key created');
      invalidate();
      setEditModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error creating key'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      key,
      values,
      context,
    }: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }) => updateFn!(projectSlug, namespace, key, values, context),
    onSuccess: () => {
      message.success('Saved');
      invalidate();
      setEditModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error saving'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFn!(projectSlug, namespace, key),
    onSuccess: () => {
      message.success('Deleted');
      invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error deleting'),
  });

  const resetNsQualityMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.post(
        `/translations/projects/${projectSlug}/sandbox/namespaces/${ns}/reset-quality`,
      ),
    onSuccess: (_data, ns) => {
      message.success(`Quality scores for "${ns}" reset — re-evaluation queued`);
      invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error resetting quality scores'),
  });

  const resetKeyLocaleMutation = useMutation({
    mutationFn: ({ key, locale }: { key: string; locale: string }) =>
      apiClient.post(
        `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/retranslate`,
        { key, locale },
      ),
    onSuccess: (_data: any, { key, locale }: { key: string; locale: string }) => {
      message.success(`Translation for "${key}" (${locale}) reset — re-translating...`);
      void invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error resetting translation'),
  });

  const handleSaveInlineEdit = useCallback(async (key: string, locale: string, value: string) => {
    if (!value.trim()) {
      setEditingCell(null);
      return;
    }
    try {
      await apiClient.patch(
        `/translations/projects/${projectSlug}/namespaces/${namespace}/entries/${encodeURIComponent(key)}`,
        { values: { [locale]: value } },
      );
      // If source locale was edited in sandbox, retranslate all non-expected locales
      if (isSandbox && locale === defaultLocale) {
        await apiClient.post(
          `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/retranslate`,
          { key },
        );
      }
      setEditingCell(null);
      void invalidate();
    } catch (e: any) {
      message.error(e.response?.data?.message ?? 'Error saving translation');
      setEditingCell(null);
    }
  }, [projectSlug, namespace, isSandbox, defaultLocale, invalidate]);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Entry> | SorterResult<Entry>[],
  ) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 50);

    const qualityFilterVal = filters.qualityScore?.[0] as string | undefined;
    if (qualityFilterVal?.startsWith('level:')) {
      setQualityLevel(qualityFilterVal.slice(6));
      setReviewState('');
    } else if (qualityFilterVal?.startsWith('state:')) {
      setQualityLevel('');
      setReviewState(qualityFilterVal.slice(6));
    } else {
      setQualityLevel('');
      setReviewState('');
    }

    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      const field = s.field as string;
      setSortBy(
        field === 'createdAt'
          ? 'createdAt'
          : field === 'qualityScore'
            ? 'qualityScore'
            : 'key',
      );
      setSortOrder(s.order === 'descend' ? 'desc' : 'asc');
    }
  };

  const columns = useMemo(
    () =>
      buildColumns(
        locales,
        projectSlug,
        namespace,
        isSandbox,
        invalidate,
        updateFn ? (entry) => {
          setEditEntry(entry);
          setIsNewEntry(false);
          setEditModalOpen(true);
        } : undefined,
        deleteFn ? (key) => deleteMutation.mutate(key) : undefined,
        getFlagForCode,
        renderKeyExtra,
        deleteConfirmTitle,
        deleteConfirmDescription,
        defaultLocale,
        isSandbox ? (key, locale) => resetKeyLocaleMutation.mutate({ key, locale }) : undefined,
        isSandbox ? {
          editingCell,
          onStartEdit: (key: string, locale: string) => setEditingCell({ key, locale }),
          onSaveEdit: handleSaveInlineEdit,
          onCancelEdit: () => setEditingCell(null),
        } : undefined,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locales, projectSlug, namespace, isSandbox, invalidate, getFlagForCode, renderKeyExtra, deleteConfirmTitle, deleteConfirmDescription, defaultLocale, editingCell, handleSaveInlineEdit],
  );

  const settingsItems = useMemo(() => {
    const items: Array<{ key: string; label: string; icon?: React.ReactNode; danger?: boolean } | { type: 'divider' }> = [
      { key: 'add-locale', label: 'Add locale', icon: <PlusOutlined /> },
    ];
    if (isSandbox && namespace) {
      items.push({ type: 'divider' });
      items.push({
        key: 'reset-translations',
        label: 'Reset translations',
        icon: <SyncOutlined />,
        danger: true,
      });
      items.push({
        key: 'reset-quality',
        label: 'Reset quality scores',
        icon: <ClearOutlined />,
        danger: false,
      });
    }
    return items;
  }, [isSandbox, namespace]);

  const handleSettingsClick = useCallback(
    (key: string) => {
      if (key === 'add-locale') {
        setAddLocaleOpen(true);
      } else if (key === 'reset-translations') {
        const nonDefault = locales.filter((l) => l !== defaultLocale);
        setSelectedLocalesForReset(nonDefault);
        setResetLocalesModalOpen(true);
      } else if (key === 'reset-quality') {
        Modal.confirm({
          title: `Reset quality scores for "${namespace}"?`,
          content: 'All quality scores in this namespace will be cleared and re-evaluated automatically. Manually confirmed (expected) entries are not affected.',
          okText: 'Reset quality',
          okButtonProps: { style: { background: '#faad14', borderColor: '#faad14' } },
          onOk: () => resetNsQualityMutation.mutateAsync(namespace),
        });
      }
    },
    [namespace, resetNsQualityMutation, locales, defaultLocale],
  );

  return (
    <>
      <FilterBar
        namespace={namespace}
        namespaces={projectDetails?.namespaces ?? []}
        onNamespaceChange={(val) => {
          setNamespace(val);
          setPage(1);
          setSearchInput('');
          setSearch('');
        }}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearch={handleSearch}
        onAddKey={createFn ? () => {
          setEditEntry(null);
          setIsNewEntry(true);
          setEditModalOpen(true);
        } : undefined}
        disabled={!projectDetails}
        extraControls={extraControls}
        settingsItems={settingsItems}
        onSettingsClick={handleSettingsClick}
        changedNamespaces={changedNamespaces}
      />

      {entriesIsError && (
        <Alert
          type="warning"
          showIcon
          closable
          message="Background refresh failed"
          description={
            (entriesError as any)?.response?.data?.message
            || (entriesError as Error)?.message
            || 'Could not refresh translations. Will retry automatically.'
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Table<Entry>
        rowKey="key"
        columns={columns}
        dataSource={
          clientFilter
            ? (entriesData?.data ?? []).filter((r) =>
                clientFilter(r, namespace),
              )
            : (entriesData?.data ?? [])
        }
        loading={entriesLoading}
        scroll={{ x: true }}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize,
          total: entriesData?.meta.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: ['25', '50', '100'],
          showTotal: (total) => `${total} keys`,
        }}
        size="small"
        onRow={
          getRowProps ? (record) => getRowProps(record, namespace) : undefined
        }
      />

      <EntryEditModal
        open={editModalOpen}
        entry={editEntry}
        locales={locales}
        defaultLocale={defaultLocale}
        isNew={isNewEntry}
        onClose={() => setEditModalOpen(false)}
        onSave={(key, values, context) => {
          if (isNewEntry) createMutation.mutate({ key, values, context });
          else updateMutation.mutate({ key, values, context });
        }}
        saving={createMutation.isPending || updateMutation.isPending}
        projectSlug={projectSlug}
        namespace={namespace}
        isSandbox={isSandbox}
        onQualityUpdate={invalidate}
      />

      <AddLocaleModal
        open={addLocaleOpen}
        onClose={() => setAddLocaleOpen(false)}
        projectSlug={projectSlug}
        existingLocaleCodes={locales}
        namespaceCount={projectDetails?.namespaces.length ?? 0}
      />

      <Modal
        open={resetLocalesModalOpen}
        title={`Reset translations for "${namespace}"?`}
        okText="Reset"
        okButtonProps={{ danger: true, disabled: selectedLocalesForReset.length === 0 }}
        onCancel={() => setResetLocalesModalOpen(false)}
        onOk={async () => {
          await Promise.all(
            selectedLocalesForReset.map((locale) =>
              apiClient.post(
                `/translations/projects/${projectSlug}/sandbox/namespaces/${namespace}/retranslate`,
                { locale },
              ),
            ),
          );
          message.success(
            `${selectedLocalesForReset.length} locale(s) reset — auto-translate will re-translate`,
          );
          invalidate();
          setResetLocalesModalOpen(false);
        }}
      >
        <p style={{ marginBottom: 12 }}>
          Select locales to reset. Translations will be deleted and re-translated
          automatically. This cannot be undone.
        </p>
        <Checkbox
          checked={
            selectedLocalesForReset.length ===
            locales.filter((l) => l !== defaultLocale).length
          }
          indeterminate={
            selectedLocalesForReset.length > 0 &&
            selectedLocalesForReset.length <
              locales.filter((l) => l !== defaultLocale).length
          }
          onChange={(e) =>
            setSelectedLocalesForReset(
              e.target.checked ? locales.filter((l) => l !== defaultLocale) : [],
            )
          }
          style={{ marginBottom: 8 }}
        >
          Select all
        </Checkbox>
        <Checkbox.Group
          options={locales
            .filter((l) => l !== defaultLocale)
            .map((l) => ({ label: l, value: l }))}
          value={selectedLocalesForReset}
          onChange={(vals) => setSelectedLocalesForReset(vals as string[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        />
      </Modal>
    </>
  );
};

// ─── Sandbox Tab ──────────────────────────────────────────────────────────────

interface SandboxTabProps {
  projectSlug: string;
}

const SandboxTab: React.FC<SandboxTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(
    new Set(),
  );
  const [currentNs, setCurrentNs] = useState(
    () => localStorage.getItem('translations_namespace') || '',
  );
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('');
  const [reviewQualityFilter, setReviewQualityFilter] = useState<string>('');
  const [reviewPage, setReviewPage] = useState(1);
  const REVIEW_PAGE_SIZE = 50;
  const [sandboxChangeFilter, setSandboxChangeFilter] = useState<string>('');

  const { data: supportedLocalesForFlags = [] } = useSupportedLocales();
  const getFlagForCode = useCallback(
    (code: string) => supportedLocalesForFlags.find((l) => l.code === code)?.flag ?? '',
    [supportedLocalesForFlags],
  );

  const { data: status, isLoading: statusLoading, isError: statusIsError } = useQuery<SandboxStatus>({
    queryKey: ['sandbox-status', projectSlug],
    queryFn: () => fetchSandboxStatus(projectSlug),
    enabled: !!projectSlug,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: diff, isError: diffIsError } = useQuery<DiffResult>({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!status,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const keyStatusMap = useMemo(
    () => buildKeyStatusLookup(diff?.entries ?? []),
    [diff],
  );
  const keyDiffRows = useMemo(
    () => buildKeyDiffRows(diff?.entries ?? []),
    [diff],
  );

  // Set of namespaces that have unpushed changes (for selector indicator)
  const changedNamespaces = useMemo(
    () => new Set(keyDiffRows.map((r) => r.namespace)),
    [keyDiffRows],
  );

  // Namespace-scoped diff: only show changes for the currently viewed namespace
  const nsKeyDiffRows = useMemo(
    () => (currentNs ? keyDiffRows.filter((r) => r.namespace === currentNs) : keyDiffRows),
    [keyDiffRows, currentNs],
  );
  const nsKeyAdded = nsKeyDiffRows.filter((k) => k.status === 'added').length;
  const nsKeyChanged = nsKeyDiffRows.filter((k) => k.status === 'changed').length;
  const nsKeyDeleted = nsKeyDiffRows.filter((k) => k.status === 'deleted').length;
  const nsTotal = nsKeyAdded + nsKeyChanged + nsKeyDeleted;

  const invalidateSandbox = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
  }, [qc, projectSlug]);

  const promoteSelectiveMutation = useMutation({
    mutationFn: (keys: { namespace: string; key: string }[]) =>
      promoteSelective(projectSlug, keys),
    onSuccess: (data) => {
      message.success(
        `Pushed — ${data.promoted} entries are now live in production`,
      );
      invalidateSandbox();
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setPushModalOpen(false);
      setSelectedRowKeys(new Set());
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Push failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/reset`)
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(
        `Sandbox reset — ${data.copiedRows} rows re-copied from production`,
      );
      invalidateSandbox();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Reset failed'),
  });

  const revertKeyMutation = useMutation({
    mutationFn: ({ ns, key }: { ns: string; key: string }) =>
      revertSandboxKey(projectSlug, ns, key),
    onSuccess: () => {
      message.success('Change reverted');
      invalidateSandbox();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  // Auto-close review modal when all ns changes have been pushed/reverted
  React.useEffect(() => {
    if (pushModalOpen && nsTotal === 0) {
      setPushModalOpen(false);
    }
  }, [pushModalOpen, nsTotal]);

  // ── Review modal: filtered + paginated (scoped to current namespace) ──
  const filteredDiffRows = useMemo(() => {
    let rows = nsKeyDiffRows;
    if (reviewStatusFilter)
      rows = rows.filter((r) => r.status === reviewStatusFilter);
    if (reviewQualityFilter) {
      if (reviewQualityFilter === 'unchecked') {
        rows = rows.filter((r) => r.worstQualityLevel === null);
      } else {
        rows = rows.filter((r) => r.worstQualityLevel === reviewQualityFilter);
      }
    }
    return rows;
  }, [nsKeyDiffRows, reviewStatusFilter, reviewQualityFilter]);

  const paginatedDiffRows = useMemo(() => {
    const start = (reviewPage - 1) * REVIEW_PAGE_SIZE;
    return filteredDiffRows.slice(start, start + REVIEW_PAGE_SIZE);
  }, [filteredDiffRows, reviewPage, REVIEW_PAGE_SIZE]);

  // Init selection when modal opens
  const handleOpenReview = useCallback(() => {
    setSelectedRowKeys(new Set(nsKeyDiffRows.map((r) => r.id)));
    setReviewStatusFilter('');
    setReviewQualityFilter('');
    setReviewPage(1);
    setPushModalOpen(true);
  }, [nsKeyDiffRows]);

  // Selection helpers
  const allFilteredSelected =
    filteredDiffRows.length > 0 &&
    filteredDiffRows.every((r) => selectedRowKeys.has(r.id));
  const someFilteredSelected = filteredDiffRows.some((r) =>
    selectedRowKeys.has(r.id),
  );
  const selectedCount = nsKeyDiffRows.filter((r) =>
    selectedRowKeys.has(r.id),
  ).length;

  const toggleSelectAll = useCallback(() => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filteredDiffRows) next.delete(r.id);
      } else {
        for (const r of filteredDiffRows) next.add(r.id);
      }
      return next;
    });
  }, [allFilteredSelected, filteredDiffRows]);

  const toggleRow = useCallback((id: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePromoteSelected = useCallback(() => {
    const selectedKeys = nsKeyDiffRows
      .filter((r) => selectedRowKeys.has(r.id))
      .map((r) => ({ namespace: r.namespace, key: r.key }));
    promoteSelectiveMutation.mutate(selectedKeys);
  }, [nsKeyDiffRows, selectedRowKeys, promoteSelectiveMutation]);

  if (!projectSlug)
    return <Empty description="Select a project" style={{ marginTop: 48 }} />;
  if (statusLoading)
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );

  const nsHasChanges = nsTotal > 0;
  const statusBg = nsHasChanges ? '#fffbe6' : '#f6ffed';
  const statusBorder = nsHasChanges ? '#ffe58f' : '#b7eb8f';
  const statusIcon = nsHasChanges ? (
    <span style={{ fontSize: 18 }}>⚡</span>
  ) : (
    <CheckCircleOutlined style={{ fontSize: 18, color: '#52c41a' }} />
  );

  const pushDiffColumns: ColumnsType<KeyDiffRow> = [
    {
      title: (
        <Checkbox
          checked={allFilteredSelected}
          indeterminate={!allFilteredSelected && someFilteredSelected}
          onChange={toggleSelectAll}
        />
      ),
      key: 'select',
      width: 40,
      render: (_: unknown, record: KeyDiffRow) => (
        <Checkbox
          checked={selectedRowKeys.has(record.id)}
          onChange={() => toggleRow(record.id)}
        />
      ),
    },
    {
      title: 'Namespace',
      dataIndex: 'namespace',
      key: 'ns',
      width: 130,
      ellipsis: true,
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (t: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag
          color={s === 'added' ? 'green' : s === 'deleted' ? 'red' : 'orange'}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Quality',
      key: 'quality',
      width: 80,
      render: (_: unknown, record: KeyDiffRow) => {
        if (record.minQualityScore === null)
          return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;
        const level = record.worstQualityLevel ?? 'green';
        return (
          <span
            style={{
              color: QUALITY_COLOR[level] ?? '#bbb',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {record.minQualityScore}
          </span>
        );
      },
    },
    {
      title: 'Locales',
      key: 'locales',
      width: 160,
      render: (_: unknown, record: KeyDiffRow) => (
        <Space size={4} wrap>
          {record.localeEntries.map((e) => (
            <Tag key={e.locale} style={{ fontSize: 11, margin: 0 }}>
              {getFlagForCode(e.locale)} {e.locale}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      key: 'revert',
      width: 80,
      render: (_: unknown, record: KeyDiffRow) => (
        <Popconfirm
          title="Revert this change?"
          description="This key will be restored to its production value."
          onConfirm={() =>
            revertKeyMutation.mutate({ ns: record.namespace, key: record.key })
          }
          okText="Revert"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            icon={<RollbackOutlined />}
            loading={
              revertKeyMutation.isPending &&
              revertKeyMutation.variables?.key === record.key
            }
          >
            Revert
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {(statusIsError || diffIsError) && (
        <Alert
          type="warning"
          showIcon
          closable
          message="Background refresh failed"
          description="Could not refresh sandbox data. Will retry automatically."
          style={{ marginBottom: 12 }}
        />
      )}

      {/* ── Git-style status panel ── */}
      <div
        style={{
          background: statusBg,
          border: `1px solid ${statusBorder}`,
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <Row align="middle" justify="space-between" wrap={false}>
          <Col flex="auto">
            <Space align="center" size={10}>
              {statusIcon}
              <Space direction="vertical" size={2}>
                <Space size={6} align="center">
                  <Tag
                    color="blue"
                    style={{ fontFamily: 'monospace', margin: 0 }}
                  >
                    sandbox
                  </Tag>
                  <ArrowRightOutlined
                    style={{ color: '#8c8c8c', fontSize: 11 }}
                  />
                  <Tag
                    color="default"
                    style={{ fontFamily: 'monospace', margin: 0 }}
                  >
                    production
                  </Tag>
                </Space>
                {nsHasChanges ? (
                  <Text>
                    <Text strong style={{ fontFamily: 'monospace' }}>{currentNs || 'sandbox'}</Text>
                    {' '}is{' '}
                    <Text strong>
                      ahead by {nsTotal} change{nsTotal !== 1 ? 's' : ''}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {' '}(
                      {[
                        nsKeyAdded > 0 ? `${nsKeyAdded} added` : null,
                        nsKeyChanged > 0 ? `${nsKeyChanged} changed` : null,
                        nsKeyDeleted > 0 ? `${nsKeyDeleted} deleted` : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      )
                    </Text>
                  </Text>
                ) : (
                  <Text type="success">
                    {currentNs ? (
                      <><Text strong style={{ fontFamily: 'monospace' }}>{currentNs}</Text> is up to date — nothing to push.</>
                    ) : (
                      'Sandbox is up to date with production — nothing to push.'
                    )}
                  </Text>
                )}
              </Space>
            </Space>
          </Col>
          <Col>
            {nsHasChanges && (
              <Space>
                <Popconfirm
                  title="Reset sandbox?"
                  description="All changes will be discarded. The sandbox will be re-copied from current production."
                  onConfirm={() => resetMutation.mutate()}
                  okText="Reset"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    icon={<SyncOutlined />}
                    loading={resetMutation.isPending}
                  >
                    Reset
                  </Button>
                </Popconfirm>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={handleOpenReview}
                >
                  Review Changes
                </Button>
              </Space>
            )}
          </Col>
        </Row>
      </div>

      {/* ── Shared entries table ── */}
      <EntriesTable
        projectSlug={projectSlug}
        queryKeyPrefix="sandbox-entries"
        fetchFn={fetchSandboxEntries}
        createFn={createSandboxEntry}
        updateFn={updateSandboxEntry}
        deleteFn={deleteSandboxEntry}
        enabled={!!status}
        onMutationSuccess={invalidateSandbox}
        onNamespaceChange={setCurrentNs}
        changedNamespaces={changedNamespaces}
        isSandbox
        deleteConfirmTitle="Remove this key from sandbox?"
        deleteConfirmDescription="The key will be marked for deletion and removed from production when you push."
        renderKeyExtra={(key, namespace) => {
          const rowStatus = keyStatusMap.get(`${namespace}/${key}`);
          return rowStatus ? (
            <Tag
              color={
                rowStatus === 'added'
                  ? 'green'
                  : rowStatus === 'deleted'
                    ? 'red'
                    : 'orange'
              }
              style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px' }}
            >
              {rowStatus}
            </Tag>
          ) : null;
        }}
        getRowProps={(record, namespace) => {
          const rowStatus = keyStatusMap.get(`${namespace}/${record.key}`);
          return rowStatus ? { style: { background: ROW_BG[rowStatus] } } : {};
        }}
        clientFilter={
          sandboxChangeFilter
            ? (record, namespace) => {
                const rowStatus = keyStatusMap.get(
                  `${namespace}/${record.key}`,
                );
                if (sandboxChangeFilter === 'unchanged') return !rowStatus;
                return rowStatus === sandboxChangeFilter;
              }
            : undefined
        }
        extraControls={
          <Col>
            <Select
              value={sandboxChangeFilter}
              onChange={setSandboxChangeFilter}
              style={{ width: 160 }}
              options={[
                { value: '', label: 'All changes' },
                { value: 'added', label: 'Added' },
                { value: 'changed', label: 'Changed' },
                { value: 'deleted', label: 'Deleted' },
                { value: 'unchanged', label: 'Unchanged' },
              ]}
            />
          </Col>
        }
      />

      {/* ── Push to Production modal ── */}
      <Modal
        open={pushModalOpen}
        title={
          <Space>
            <ArrowRightOutlined />
            <span>Review Changes</span>
          </Space>
        }
        onCancel={() => setPushModalOpen(false)}
        width={1100}
        footer={[
          <Button key="cancel" onClick={() => setPushModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="push"
            type="primary"
            icon={<ArrowRightOutlined />}
            loading={promoteSelectiveMutation.isPending}
            disabled={selectedCount === 0}
            onClick={handlePromoteSelected}
          >
            Push {selectedCount} of {nsTotal} key{nsTotal !== 1 ? 's' : ''} to Production
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          style={{ marginBottom: 12 }}
          message="Review and select changes to push. A snapshot of current production will be saved automatically."
          showIcon
        />

        {/* Summary tags */}
        <Space style={{ marginBottom: 12 }}>
          <Tag style={{ fontFamily: 'monospace', fontSize: 13, padding: '2px 10px' }}>
            {currentNs}
          </Tag>
          <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>
            +{nsKeyAdded} added
          </Tag>
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>
            {nsKeyChanged} changed
          </Tag>
          <Tag color="red" style={{ fontSize: 13, padding: '2px 10px' }}>
            −{nsKeyDeleted} deleted
          </Tag>
          {selectedCount < nsTotal && (
            <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>
              {selectedCount} selected
            </Tag>
          )}
        </Space>

        {/* Filters row */}
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col>
            <Select
              value={reviewStatusFilter}
              onChange={(v) => {
                setReviewStatusFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 140 }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'added', label: 'Added' },
                { value: 'changed', label: 'Changed' },
                { value: 'deleted', label: 'Deleted' },
              ]}
            />
          </Col>
          <Col>
            <Select
              value={reviewQualityFilter}
              onChange={(v) => {
                setReviewQualityFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 150 }}
              options={[
                { value: '', label: 'All qualities' },
                { value: 'green', label: 'Green' },
                { value: 'yellow', label: 'Yellow' },
                { value: 'red', label: 'Red' },
                { value: 'unchecked', label: 'Not checked' },
                { value: 'needs_context', label: 'Needs Context' },
              ]}
            />
          </Col>
        </Row>

        <Table<KeyDiffRow>
          rowKey="id"
          columns={pushDiffColumns}
          dataSource={paginatedDiffRows}
          size="small"
          scroll={{ x: true, y: 420 }}
          pagination={{
            current: reviewPage,
            pageSize: REVIEW_PAGE_SIZE,
            total: filteredDiffRows.length,
            onChange: setReviewPage,
            showTotal: (t) => `${t} keys`,
            size: 'small',
          }}
          sticky
          expandable={{
            expandedRowRender: (record) => (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 80,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Locale
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 80,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 60,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Quality
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Production
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Sandbox
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {record.localeEntries.map((e) => (
                    <tr
                      key={e.locale}
                      style={{ borderTop: '1px solid #f0f0f0' }}
                    >
                      <td style={{ padding: '4px 8px' }}>
                        <Tag style={{ fontSize: 11, margin: 0 }}>
                          {getFlagForCode(e.locale)} {e.locale}
                        </Tag>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Tag
                          color={
                            e.status === 'added'
                              ? 'green'
                              : e.status === 'deleted'
                                ? 'red'
                                : 'orange'
                          }
                          style={{ fontSize: 11, margin: 0 }}
                        >
                          {e.status}
                        </Tag>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {e.quality?.score != null ? (
                          <Tooltip title={e.quality.comment ?? undefined}>
                            <span
                              style={{
                                color:
                                  QUALITY_COLOR[e.quality.level ?? ''] ??
                                  '#bbb',
                                fontWeight: 600,
                                fontSize: 11,
                                cursor: e.quality.comment ? 'help' : 'default',
                              }}
                            >
                              {e.quality.score}
                            </span>
                          </Tooltip>
                        ) : (
                          <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          color: '#888',
                          maxWidth: 240,
                          wordBreak: 'break-word',
                        }}
                      >
                        {e.productionValue ?? (
                          <span style={{ color: '#ccc', fontStyle: 'italic' }}>
                            —
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          maxWidth: 240,
                          wordBreak: 'break-word',
                        }}
                      >
                        {e.sandboxValue != null ? (
                          <span style={{ color: '#237804', fontWeight: 500 }}>
                            {e.sandboxValue}
                          </span>
                        ) : (
                          <span
                            style={{ color: '#cf1322', fontStyle: 'italic' }}
                          >
                            deleted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
            rowExpandable: () => true,
          }}
        />
      </Modal>
    </>
  );
};

// ─── Production Tab ───────────────────────────────────────────────────────────

interface ProductionTabProps {
  projectSlug: string;
}

const ProductionTab: React.FC<ProductionTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ['sandbox-snapshots', projectSlug],
    queryFn: () => fetchSnapshots(projectSlug),
    enabled: !!projectSlug && revertModalOpen,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const revertMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/revert`, {
          snapshotId,
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Reverted — ${data.restored} entries restored`);
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setRevertModalOpen(false);
      setSelectedSnapshotId('');
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  if (!projectSlug)
    return <Empty description="Select a project" style={{ marginTop: 48 }} />;

  return (
    <>
      <EntriesTable
        projectSlug={projectSlug}
        queryKeyPrefix="entries"
        fetchFn={fetchEntries}
        extraControls={
          <Col>
            <Button
              icon={<RollbackOutlined />}
              onClick={() => {
                setSelectedSnapshotId('');
                setRevertModalOpen(true);
              }}
            >
              Revert to snapshot
            </Button>
          </Col>
        }
      />

      <Modal
        open={revertModalOpen}
        title="Revert production to snapshot"
        onCancel={() => {
          setRevertModalOpen(false);
          setSelectedSnapshotId('');
        }}
        onOk={() => {
          if (selectedSnapshotId) revertMutation.mutate(selectedSnapshotId);
        }}
        confirmLoading={revertMutation.isPending}
        okText="Revert"
        okButtonProps={{ danger: true, disabled: !selectedSnapshotId }}
        width={600}
      >
        <Alert
          type="warning"
          message="This replaces current production values with those from the selected snapshot."
          style={{ marginBottom: 16 }}
          showIcon
        />
        {snapshots.length === 0 ? (
          <Empty description="No snapshots available" />
        ) : (
          <Table<Snapshot>
            rowKey="id"
            dataSource={snapshots}
            size="small"
            pagination={false}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedSnapshotId ? [selectedSnapshotId] : [],
              onChange: (keys) => setSelectedSnapshotId(keys[0] as string),
            }}
            columns={[
              {
                title: 'Label',
                dataIndex: 'label',
                key: 'label',
                render: (v: string | null) => v ?? '—',
              },
              {
                title: 'Created',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (v: string) => new Date(v).toLocaleString(),
              },
              {
                title: 'Entries',
                dataIndex: 'entryCount',
                key: 'entryCount',
                width: 80,
              },
            ]}
          />
        )}
      </Modal>
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const TranslationsPage: React.FC = () => {
  const [projectSlug, setProjectSlug] = useState(
    () => localStorage.getItem('translations_projectSlug') || '',
  );
  const [activeTab, setActiveTab] = useState('sandbox');

  const handleProjectChange = (val: string) => {
    setProjectSlug(val);
    localStorage.setItem('translations_projectSlug', val);
  };

  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    Project[]
  >({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  React.useEffect(() => {
    if (projects.length > 0) {
      const slugExists = projects.some((p) => p.slug === projectSlug);
      if (!projectSlug || !slugExists) {
        const first = projects[0].slug;
        setProjectSlug(first);
        localStorage.setItem('translations_projectSlug', first);
      }
    }
  }, [projects, projectSlug]);

  const tabItems = [
    {
      key: 'sandbox',
      label: 'Sandbox',
      children: <SandboxTab projectSlug={projectSlug} />,
    },
    {
      key: 'production',
      label: 'Production',
      children: projectSlug ? (
        <ProductionTab projectSlug={projectSlug} />
      ) : (
        <Empty description="Select a project" style={{ marginTop: 48 }} />
      ),
    },
  ];

  return (
    <div>
      <Row align="middle" gutter={16} style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Translations
          </Title>
        </Col>
        <Col>
          <Select
            placeholder="Select project"
            loading={projectsLoading}
            value={projectSlug || undefined}
            onChange={handleProjectChange}
            style={{ width: 200 }}
            options={projects.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        destroyOnHidden={false}
      />
    </div>
  );
};

export default TranslationsPage;
