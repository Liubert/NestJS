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
  KeyDiff,
  KeyDiffRow,
  Entry,
  EntriesTableProps,
} from './components/types';
import {
  fetchProjects,
  fetchProjectDetails,
  fetchEntries,
  createEntry,
  updateEntry,
  deleteEntry,
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

const { Title, Text } = Typography;

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_BG: Record<string, string> = {
  added: '#f6ffed',
  changed: '#fffbe6',
  deleted: '#fff1f0',
};

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function buildKeyDiffs(entries: DiffEntry[]): KeyDiff[] {
  const map = new Map<string, KeyDiff>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, {
        namespace: e.namespace,
        key: e.key,
        status: e.status,
        locales: [],
      });
    }
    map.get(id)!.locales.push(e.locale);
  }
  return Array.from(map.values());
}

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
    () => localStorage.getItem('translations_namespace') || '',
  );
  const setNamespace = (ns: string) => {
    setNamespaceRaw(ns);
    localStorage.setItem('translations_namespace', ns);
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

  const { data: entriesData, isLoading: entriesLoading } =
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
      enabled: !!projectSlug && !!namespace && enabled,
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
    }) => createFn(projectSlug, namespace, { key, values, context }),
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
    }) => updateFn(projectSlug, namespace, key, values, context),
    onSuccess: () => {
      message.success('Saved');
      invalidate();
      setEditModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error saving'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFn(projectSlug, namespace, key),
    onSuccess: () => {
      message.success('Deleted');
      invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error deleting'),
  });

  const resetNsTranslationsMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.post(
        `/translations/projects/${projectSlug}/namespaces/${ns}/reset-translations`,
      ),
    onSuccess: (_data, ns) => {
      message.success(`Translations for "${ns}" deleted — auto-translate will re-translate`);
      invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error resetting translations'),
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Entry> | SorterResult<Entry>[],
  ) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 50);
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
        (entry) => {
          setEditEntry(entry);
          setIsNewEntry(false);
          setEditModalOpen(true);
        },
        (key) => deleteMutation.mutate(key),
        getFlagForCode,
        renderKeyExtra,
        deleteConfirmTitle,
        deleteConfirmDescription,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locales, projectSlug, namespace, isSandbox, invalidate, getFlagForCode, renderKeyExtra, deleteConfirmTitle, deleteConfirmDescription],
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
        qualityFilter={
          qualityLevel
            ? `level:${qualityLevel}`
            : reviewState
              ? `state:${reviewState}`
              : ''
        }
        onQualityFilterChange={(val) => {
          if (val.startsWith('level:')) {
            setQualityLevel(val.slice(6));
            setReviewState('');
          } else if (val.startsWith('state:')) {
            setQualityLevel('');
            setReviewState(val.slice(6));
          } else {
            setQualityLevel('');
            setReviewState('');
          }
          setPage(1);
        }}
        sortBy={sortBy}
        onSortByChange={(val) => {
          setSortBy(val);
          setPage(1);
        }}
        onAddKey={() => {
          setEditEntry(null);
          setIsNewEntry(true);
          setEditModalOpen(true);
        }}
        disabled={!projectDetails}
        extraControls={
          <>
            {isSandbox && namespace && (
              <Col>
                <Popconfirm
                  title={`Delete all translations in "${namespace}" and re-translate?`}
                  description="Auto-translate will pick them up shortly. This cannot be undone."
                  onConfirm={() => resetNsTranslationsMutation.mutate(namespace)}
                  okText="Reset"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="Delete all sandbox translations for this namespace and re-translate from scratch">
                    <Button
                      size="small"
                      icon={<SyncOutlined />}
                      loading={resetNsTranslationsMutation.isPending}
                    >
                      Reset translations
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Col>
            )}
            {extraControls}
          </>
        }
      />

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
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('');
  const [reviewNsFilter, setReviewNsFilter] = useState<string>('');
  const [reviewQualityFilter, setReviewQualityFilter] = useState<string>('');
  const [reviewPage, setReviewPage] = useState(1);
  const REVIEW_PAGE_SIZE = 50;
  const [sandboxChangeFilter, setSandboxChangeFilter] = useState<string>('');

  const { data: supportedLocalesForFlags = [] } = useSupportedLocales();
  const getFlagForCode = useCallback(
    (code: string) => supportedLocalesForFlags.find((l) => l.code === code)?.flag ?? '',
    [supportedLocalesForFlags],
  );

  const { data: status, isLoading: statusLoading } = useQuery<SandboxStatus>({
    queryKey: ['sandbox-status', projectSlug],
    queryFn: () => fetchSandboxStatus(projectSlug),
    enabled: !!projectSlug,
  });

  const { data: diff } = useQuery<DiffResult>({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!status,
  });

  const keyStatusMap = useMemo(
    () => buildKeyStatusLookup(diff?.entries ?? []),
    [diff],
  );
  const keyDiffs = useMemo(() => buildKeyDiffs(diff?.entries ?? []), [diff]);
  const keyDiffRows = useMemo(
    () => buildKeyDiffRows(diff?.entries ?? []),
    [diff],
  );
  const keyAdded = keyDiffs.filter((k) => k.status === 'added').length;
  const keyChanged = keyDiffs.filter((k) => k.status === 'changed').length;
  const keyDeleted = keyDiffs.filter((k) => k.status === 'deleted').length;
  const total = keyAdded + keyChanged + keyDeleted;

  const invalidateSandbox = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
  }, [qc, projectSlug]);

  const promoteMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/promote`)
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(
        `Pushed — ${data.promoted} entries are now live in production`,
      );
      invalidateSandbox();
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setPushModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Push failed'),
  });

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

  // Auto-close review modal when all changes have been reverted
  React.useEffect(() => {
    if (pushModalOpen && diff && diff.total === 0) {
      setPushModalOpen(false);
    }
  }, [pushModalOpen, diff]);

  // ── Review modal: filtered + paginated data (must be before early returns) ──
  const reviewNamespaces = useMemo(() => {
    const ns = new Set(keyDiffRows.map((r) => r.namespace));
    return Array.from(ns).sort();
  }, [keyDiffRows]);

  const filteredDiffRows = useMemo(() => {
    let rows = keyDiffRows;
    if (reviewStatusFilter)
      rows = rows.filter((r) => r.status === reviewStatusFilter);
    if (reviewNsFilter)
      rows = rows.filter((r) => r.namespace === reviewNsFilter);
    if (reviewQualityFilter) {
      if (reviewQualityFilter === 'unchecked') {
        rows = rows.filter((r) => r.worstQualityLevel === null);
      } else {
        rows = rows.filter((r) => r.worstQualityLevel === reviewQualityFilter);
      }
    }
    return rows;
  }, [keyDiffRows, reviewStatusFilter, reviewNsFilter, reviewQualityFilter]);

  const paginatedDiffRows = useMemo(() => {
    const start = (reviewPage - 1) * REVIEW_PAGE_SIZE;
    return filteredDiffRows.slice(start, start + REVIEW_PAGE_SIZE);
  }, [filteredDiffRows, reviewPage, REVIEW_PAGE_SIZE]);

  // Init selection when modal opens
  const handleOpenReview = useCallback(() => {
    setSelectedRowKeys(new Set(keyDiffRows.map((r) => r.id)));
    setReviewStatusFilter('');
    setReviewNsFilter('');
    setReviewQualityFilter('');
    setReviewPage(1);
    setPushModalOpen(true);
  }, [keyDiffRows]);

  // Selection helpers
  const allFilteredSelected =
    filteredDiffRows.length > 0 &&
    filteredDiffRows.every((r) => selectedRowKeys.has(r.id));
  const someFilteredSelected = filteredDiffRows.some((r) =>
    selectedRowKeys.has(r.id),
  );
  const selectedCount = keyDiffRows.filter((r) =>
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
    const selectedKeys = keyDiffRows
      .filter((r) => selectedRowKeys.has(r.id))
      .map((r) => ({ namespace: r.namespace, key: r.key }));

    if (selectedKeys.length === total) {
      promoteMutation.mutate();
    } else {
      promoteSelectiveMutation.mutate(selectedKeys);
    }
  }, [
    keyDiffRows,
    selectedRowKeys,
    total,
    promoteMutation,
    promoteSelectiveMutation,
  ]);

  if (!projectSlug)
    return <Empty description="Select a project" style={{ marginTop: 48 }} />;
  if (statusLoading)
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );

  const hasChanges = !!status?.hasChanges;
  const statusBg = hasChanges ? '#fffbe6' : '#f6ffed';
  const statusBorder = hasChanges ? '#ffe58f' : '#b7eb8f';
  const statusIcon = hasChanges ? (
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
                {hasChanges ? (
                  <Text>
                    Sandbox is{' '}
                    <Text strong>
                      ahead by {total} change{total !== 1 ? 's' : ''}
                    </Text>
                    {total > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {' '}
                        (
                        {[
                          keyAdded > 0 ? `${keyAdded} added` : null,
                          keyChanged > 0 ? `${keyChanged} changed` : null,
                          keyDeleted > 0 ? `${keyDeleted} deleted` : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        )
                      </Text>
                    )}
                  </Text>
                ) : (
                  <Text type="success">
                    Sandbox is up to date with production — nothing to push.
                  </Text>
                )}
              </Space>
            </Space>
          </Col>
          <Col>
            {hasChanges && (
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
            loading={
              promoteMutation.isPending || promoteSelectiveMutation.isPending
            }
            disabled={selectedCount === 0}
            onClick={handlePromoteSelected}
          >
            Push {selectedCount} of {total} key{total !== 1 ? 's' : ''} to
            Production
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
          <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>
            +{keyAdded} added
          </Tag>
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>
            {keyChanged} changed
          </Tag>
          <Tag color="red" style={{ fontSize: 13, padding: '2px 10px' }}>
            −{keyDeleted} deleted
          </Tag>
          {selectedCount < total && (
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
              value={reviewNsFilter}
              onChange={(v) => {
                setReviewNsFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 180 }}
              options={[
                { value: '', label: 'All namespaces' },
                ...reviewNamespaces.map((ns) => ({ value: ns, label: ns })),
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
        createFn={createEntry}
        updateFn={updateEntry}
        deleteFn={deleteEntry}
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
