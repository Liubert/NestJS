import React, { useState, useCallback, useMemo } from 'react';
import {
  Table, Typography, Space, Input, Select, Button, Modal,
  Form, message, Tooltip, Popconfirm, Tag, Row, Col, Alert, Spin, Tabs, Empty,
  Collapse,
} from 'antd';
import {
  SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  ThunderboltOutlined, SafetyCertificateOutlined,
  ArrowRightOutlined, RollbackOutlined, SyncOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project { id: string; slug: string; name: string }

interface ProjectDetails {
  slug: string;
  name: string;
  locales: string[];
  namespaces: string[];
}

interface Entry {
  key: string;
  createdAt: string;
  values: Record<string, string>;
}

interface PaginatedEntries {
  data: Entry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SandboxStatus {
  initialized: boolean;
  initializedAt: string | null;
  hasChanges: boolean;
  snapshotCount: number;
}

interface DiffEntry {
  namespace: string;
  key: string;
  locale: string;
  status: 'added' | 'changed' | 'deleted';
  productionValue: string | null;
  sandboxValue: string | null;
}

interface DiffResult {
  total: number;
  added: number;
  changed: number;
  deleted: number;
  entries: DiffEntry[];
}

interface Snapshot {
  id: string;
  label: string | null;
  createdAt: string;
  entryCount: number;
}

interface QualityResult {
  score: number;
  level: 'green' | 'yellow' | 'red';
  comment: string;
}

// Key-level diff (multiple locale diffs collapsed into one)
interface KeyDiff {
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  locales: string[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

const fetchProjects = async (): Promise<Project[]> => {
  const res = await apiClient.get('/translations/projects?limit=200');
  return res.data.data;
};

const fetchProjectDetails = async (slug: string): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

const fetchEntries = async (
  slug: string, ns: string, page: number, limit: number,
  search: string, sortBy: string, sortOrder: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = { page, limit, sortBy, sortOrder };
  if (search.length >= 2) params.search = search;
  const res = await apiClient.get(
    `/translations/projects/${slug}/namespaces/${ns}/entries`, { params },
  );
  return res.data;
};

const createEntry = async (
  slug: string, ns: string, payload: { key: string; values: Record<string, string> },
) => {
  const res = await apiClient.post(`/translations/projects/${slug}/namespaces/${ns}/entries`, payload);
  return res.data;
};

const updateEntry = async (
  slug: string, ns: string, key: string, values: Record<string, string>,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values },
  );
  return res.data;
};

const deleteEntry = async (slug: string, ns: string, key: string) => {
  await apiClient.delete(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

const aiTranslate = async (text: string): Promise<Record<string, string>> => {
  const res = await apiClient.post('/translations/ai-translate', { text });
  return res.data;
};

const checkQuality = async (source: string, translation: string, locale: string): Promise<QualityResult> => {
  const res = await apiClient.post('/translations/ai-quality-check', {
    source, translation, locale, mode: 'translation_quality',
  });
  return res.data;
};

const fetchSandboxStatus = async (slug: string): Promise<SandboxStatus> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/status`);
  return res.data;
};

const fetchSandboxDiff = async (slug: string): Promise<DiffResult> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/diff`);
  return res.data;
};

const fetchSnapshots = async (slug: string): Promise<Snapshot[]> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/snapshots`);
  return res.data;
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const AI_LOCALES = ['uk', 'nb-NO', 'sv', 'da-DK'];

const QUALITY_CONFIG = {
  green:  { color: 'success', label: 'Good' },
  yellow: { color: 'warning', label: 'Review' },
  red:    { color: 'error',   label: 'Poor' },
} as const;

interface EditModalProps {
  open: boolean;
  entry: Entry | null;
  locales: string[];
  isNew: boolean;
  onClose: () => void;
  onSave: (key: string, values: Record<string, string>) => void;
  saving: boolean;
}

const EditModal: React.FC<EditModalProps> = ({ open, entry, locales, isNew, onClose, onSave, saving }) => {
  const [form] = Form.useForm();
  const [aiLoading, setAiLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityResults, setQualityResults] = useState<Record<string, QualityResult>>({});

  React.useEffect(() => {
    if (open) {
      setQualityResults({});
      entry ? form.setFieldsValue({ key: entry.key, ...entry.values }) : form.resetFields();
    }
  }, [open, entry, form]);

  const handleOk = () => {
    form.validateFields().then((vals) => {
      const { key: formKey, ...rest } = vals;
      const key = isNew ? formKey : (entry?.key ?? '');
      const values: Record<string, string> = {};
      for (const locale of locales) values[locale] = rest[locale] ?? '';
      onSave(key, values);
    });
  };

  const handleAiGenerate = async () => {
    const enText: string = form.getFieldValue('en') ?? '';
    if (!enText.trim()) { message.warning('Enter English text first'); return; }
    setAiLoading(true);
    try {
      const result = await aiTranslate(enText);
      const patch: Record<string, string> = {};
      for (const locale of AI_LOCALES) {
        if (result[locale] !== undefined) patch[locale] = result[locale];
      }
      form.setFieldsValue(patch);
      setQualityResults({});
      message.success('Translations generated');
    } catch {
      message.error('AI translation failed. Check that GEMINI_API_KEY is set.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCheckQuality = async () => {
    const vals = form.getFieldsValue();
    const enText: string = vals['en'] ?? '';
    if (!enText.trim()) { message.warning('English (source) text is required'); return; }
    const targetLocales = locales.filter((l) => l !== 'en' && vals[l]?.trim());
    if (!targetLocales.length) { message.warning('No translated values to check'); return; }
    setQualityLoading(true);
    setQualityResults({});
    try {
      const results = await Promise.all(
        targetLocales.map((locale) =>
          checkQuality(enText, vals[locale], locale).then((r) => [locale, r] as const),
        ),
      );
      setQualityResults(Object.fromEntries(results));
    } catch {
      message.error('Quality check failed. Check that GEMINI_API_KEY is set.');
    } finally {
      setQualityLoading(false);
    }
  };

  const hasEnLocale = locales.includes('en');
  const hasAiLocales = AI_LOCALES.some((l) => locales.includes(l));
  const hasTranslations = !isNew && locales.some((l) => l !== 'en');

  return (
    <Modal open={open} title={isNew ? 'Add translation key' : `Edit: ${entry?.key}`}
      onCancel={onClose} onOk={handleOk} confirmLoading={saving} width={640} destroyOnClose>
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {isNew && (
          <Form.Item name="key" label="Key" rules={[
            { required: true, message: 'Key is required' },
            { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Only letters, digits, dots, underscores, dashes' },
          ]}>
            <Input placeholder="e.g. accessControl" />
          </Form.Item>
        )}
        {locales.map((locale) => {
          const qr = qualityResults[locale];
          return (
            <Form.Item key={locale} name={locale} label={
              locale === 'en' && hasAiLocales ? (
                <Space>
                  <span>en</span>
                  <Button size="small" icon={<ThunderboltOutlined />} loading={aiLoading}
                    onClick={handleAiGenerate} type="dashed" disabled={!hasEnLocale}>
                    Generate with AI
                  </Button>
                  {hasTranslations && (
                    <Button size="small" icon={<SafetyCertificateOutlined />} loading={qualityLoading}
                      onClick={handleCheckQuality} type="dashed">
                      Check Quality
                    </Button>
                  )}
                </Space>
              ) : (
                <Space>
                  <span>{locale}</span>
                  {qr && (
                    <Tooltip title={qr.comment ?? undefined}>
                      <Tag color={QUALITY_CONFIG[qr.level].color}>
                        {QUALITY_CONFIG[qr.level].label} · {qr.score}/10
                      </Tag>
                    </Tooltip>
                  )}
                </Space>
              )
            }>
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
            </Form.Item>
          );
        })}
        {Object.keys(qualityResults).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {Object.entries(qualityResults).map(([locale, r]) => (
              <Alert key={locale}
                type={r.level === 'red' ? 'error' : r.level === 'yellow' ? 'warning' : 'info'}
                message={<><Tag>{locale}</Tag>{r.comment || 'Looks good'}</>}
                style={{ marginBottom: 6 }} showIcon />
            ))}
          </div>
        )}
      </Form>
    </Modal>
  );
};

// ─── Diff helpers ─────────────────────────────────────────────────────────────

// Row background colours for sandbox view
const ROW_BG: Record<string, string> = {
  added:   '#f6ffed',
  changed: '#fffbe6',
  deleted: '#fff1f0',
};

// Group locale-level diff entries into key-level diffs
function buildKeyDiffs(entries: DiffEntry[]): KeyDiff[] {
  const map = new Map<string, KeyDiff>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, { namespace: e.namespace, key: e.key, status: e.status, locales: [] });
    }
    map.get(id)!.locales.push(e.locale);
  }
  return Array.from(map.values());
}

// Build lookup: "namespace/key/locale" → DiffEntry
function buildDiffLookup(entries: DiffEntry[]): Map<string, DiffEntry> {
  const m = new Map<string, DiffEntry>();
  for (const e of entries) m.set(`${e.namespace}/${e.key}/${e.locale}`, e);
  return m;
}

// Build lookup: "namespace/key" → dominant status (added > deleted > changed)
function buildKeyStatusLookup(entries: DiffEntry[]): Map<string, DiffEntry['status']> {
  const m = new Map<string, DiffEntry['status']>();
  for (const e of entries) {
    const k = `${e.namespace}/${e.key}`;
    const existing = m.get(k);
    if (!existing || e.status === 'added' || (e.status === 'deleted' && existing === 'changed')) {
      m.set(k, e.status);
    }
  }
  return m;
}

// ─── Diff Summary ─────────────────────────────────────────────────────────────

interface DiffSummaryProps {
  diff: DiffResult;
}

const DiffSummary: React.FC<DiffSummaryProps> = ({ diff }) => {
  const keyDiffs = useMemo(() => buildKeyDiffs(diff.entries), [diff]);

  const added   = keyDiffs.filter((k) => k.status === 'added');
  const changed = keyDiffs.filter((k) => k.status === 'changed');
  const deleted = keyDiffs.filter((k) => k.status === 'deleted');

  const groups = [
    { label: 'Added',   color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f', items: added },
    { label: 'Changed', color: '#fa8c16', bg: '#fffbe6', border: '#ffe58f', items: changed },
    { label: 'Deleted', color: '#ff4d4f', bg: '#fff1f0', border: '#ffa39e', items: deleted },
  ].filter((g) => g.items.length > 0);

  if (!groups.length) return null;

  const collapseItems = groups.map((g) => ({
    key: g.label,
    label: (
      <Space>
        <span style={{ fontWeight: 500 }}>{g.label}</span>
        <Tag color={g.label === 'Added' ? 'green' : g.label === 'Changed' ? 'orange' : 'red'}>
          {g.items.length} key{g.items.length !== 1 ? 's' : ''}
        </Tag>
      </Space>
    ),
    children: (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {g.items.map((item) => (
          <Tooltip key={`${item.namespace}/${item.key}`}
            title={`${item.locales.length} locale${item.locales.length !== 1 ? 's' : ''}: ${item.locales.join(', ')}`}>
            <Tag style={{ fontFamily: 'monospace', fontSize: 12, cursor: 'default' }}>
              <span style={{ color: '#8c8c8c' }}>{item.namespace} /</span> {item.key}
            </Tag>
          </Tooltip>
        ))}
      </div>
    ),
  }));

  return (
    <Collapse
      size="small"
      defaultActiveKey={groups.map((g) => g.label)}
      style={{ marginBottom: 20 }}
      items={collapseItems}
    />
  );
};

// ─── Sandbox Tab ──────────────────────────────────────────────────────────────

interface SandboxTabProps {
  projectSlug: string;
}

const SandboxTab: React.FC<SandboxTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [namespace, setNamespace] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt'>('key');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['sandbox-status', projectSlug],
    queryFn: () => fetchSandboxStatus(projectSlug),
    enabled: !!projectSlug,
  } as any) as { data: SandboxStatus | undefined; isLoading: boolean };

  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!status?.initialized,
  } as any) as { data: DiffResult | undefined; isLoading: boolean };

  const { data: projectDetails } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  } as any) as { data: ProjectDetails | undefined };

  // Production entries (used as base for sandbox view — overlay diff on top)
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', projectSlug, namespace, page, pageSize, search, sortBy, sortOrder],
    queryFn: () => fetchEntries(projectSlug, namespace, page, pageSize, search, sortBy, sortOrder),
    enabled: !!projectSlug && !!namespace,
  } as any) as { data: PaginatedEntries | undefined; isLoading: boolean };

  React.useEffect(() => { setNamespace(''); setPage(1); }, [projectSlug]);

  React.useEffect(() => {
    if (projectDetails && projectDetails.namespaces.length > 0 && !namespace) {
      setNamespace(projectDetails.namespaces[0]);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales ?? [];

  // ── Diff lookups (memoized)
  const diffLookup     = useMemo(() => buildDiffLookup(diff?.entries ?? []), [diff]);
  const keyStatusMap   = useMemo(() => buildKeyStatusLookup(diff?.entries ?? []), [diff]);

  // "Added" entries for the current namespace — these won't appear in production entries query
  const addedEntries = useMemo((): Entry[] => {
    if (!diff || !namespace) return [];
    const keyMap = new Map<string, Record<string, string>>();
    for (const e of diff.entries) {
      if (e.status === 'added' && e.namespace === namespace) {
        if (!keyMap.has(e.key)) keyMap.set(e.key, {});
        if (e.sandboxValue != null) keyMap.get(e.key)![e.locale] = e.sandboxValue;
      }
    }
    return Array.from(keyMap.entries()).map(([key, values]) => ({ key, createdAt: '', values }));
  }, [diff, namespace]);

  // Table data: added entries first, then production entries
  const tableData = useMemo((): Entry[] => {
    return [...addedEntries, ...(entriesData?.data ?? [])];
  }, [addedEntries, entriesData]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
  };

  const initMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/init`, { force: false }).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Sandbox initialized — ${data.copiedRows} rows copied from production`);
      invalidate();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Failed to initialize'),
  });

  const promoteMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/promote`).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Pushed — ${data.promoted} entries are now live in production`);
      invalidate();
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setPushModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Push failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/reset`).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Sandbox reset — ${data.copiedRows} rows re-copied from production`);
      invalidate();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Reset failed'),
  });

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Entry> | SorterResult<Entry>[],
  ) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 50);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      setSortBy(s.field === 'createdAt' ? 'createdAt' : 'key');
      setSortOrder(s.order === 'descend' ? 'desc' : 'asc');
    }
  };

  if (!projectSlug) return <Empty description="Select a project" style={{ marginTop: 48 }} />;
  if (statusLoading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>;

  // ── Not initialized
  if (!status?.initialized) {
    return (
      <div style={{ maxWidth: 520, margin: '56px auto', textAlign: 'center' }}>
        <Title level={4} style={{ fontWeight: 400, marginBottom: 8 }}>Sandbox is not initialized</Title>
        <p style={{ color: '#8c8c8c', marginBottom: 28, lineHeight: 1.7 }}>
          The sandbox is a working copy of production. Initialize it to start making changes
          that will not affect production until you explicitly push them.
        </p>
        <Button type="primary" size="large" loading={initMutation.isPending}
          onClick={() => initMutation.mutate()}>
          Initialize sandbox
        </Button>
      </div>
    );
  }

  const hasChanges = !!status?.hasChanges;
  const total = diff?.total ?? 0;

  // ── Status panel colours
  const statusBg     = hasChanges ? '#fffbe6' : '#f6ffed';
  const statusBorder = hasChanges ? '#ffe58f' : '#b7eb8f';
  const statusIcon   = hasChanges
    ? <span style={{ fontSize: 18 }}>⚡</span>
    : <CheckCircleOutlined style={{ fontSize: 18, color: '#52c41a' }} />;

  // ── Sandbox view columns (show sandbox values; highlight changed)
  const sandboxColumns: ColumnsType<Entry> = [
    {
      title: 'Key', dataIndex: 'key', key: 'key', sorter: true, width: 220, fixed: 'left',
      render: (text: string) => {
        const rowStatus = keyStatusMap.get(`${namespace}/${text}`);
        return (
          <Space size={6}>
            <Tooltip title={text}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>
            </Tooltip>
            {rowStatus && (
              <Tag
                color={rowStatus === 'added' ? 'green' : rowStatus === 'deleted' ? 'red' : 'orange'}
                style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px', marginLeft: 4 }}
              >
                {rowStatus}
              </Tag>
            )}
          </Space>
        );
      },
    },
    ...locales.map((locale) => ({
      title: <Tag color="blue">{locale}</Tag>,
      key: locale,
      width: 200,
      render: (_: unknown, record: Entry) => {
        const diffCell = diffLookup.get(`${namespace}/${record.key}/${locale}`);
        const isDeleted = keyStatusMap.get(`${namespace}/${record.key}`) === 'deleted';

        // Determine which value to show: sandbox value if changed/added, production otherwise
        const sandboxVal = diffCell ? diffCell.sandboxValue : record.values[locale];
        const prodVal    = diffCell ? diffCell.productionValue : record.values[locale];
        const hasChange  = !!diffCell;

        if (isDeleted) {
          return (
            <Tooltip title="Removed in sandbox">
              <del style={{ color: '#ff4d4f', opacity: 0.7 }}>{prodVal}</del>
            </Tooltip>
          );
        }

        if (!sandboxVal) {
          return <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>;
        }

        return (
          <Tooltip
            title={hasChange && prodVal !== sandboxVal
              ? <span>Was: <em>{prodVal || '—'}</em></span>
              : undefined}
          >
            <span style={{
              display: 'block', wordBreak: 'break-word', whiteSpace: 'normal',
              fontWeight: hasChange ? 500 : undefined,
            }}>
              {sandboxVal}
            </span>
          </Tooltip>
        );
      },
    })),
  ];

  // ── Push modal diff columns
  const pushDiffColumns: ColumnsType<DiffEntry> = [
    { title: 'Namespace', dataIndex: 'namespace', key: 'ns', width: 120, ellipsis: true },
    {
      title: 'Key', dataIndex: 'key', key: 'key', width: 200, ellipsis: true,
      render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span>,
    },
    { title: 'Locale', dataIndex: 'locale', key: 'locale', width: 70 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 90,
      filters: [
        { text: 'Added', value: 'added' },
        { text: 'Changed', value: 'changed' },
        { text: 'Deleted', value: 'deleted' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (s: string) => (
        <Tag color={s === 'added' ? 'green' : s === 'deleted' ? 'red' : 'orange'}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Current (Production)', dataIndex: 'productionValue', key: 'prod', ellipsis: true,
      render: (v: string | null) =>
        v != null ? <span style={{ color: '#888' }}>{v}</span>
                  : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>,
    },
    {
      title: 'Incoming (Sandbox)', dataIndex: 'sandboxValue', key: 'sandbox', ellipsis: true,
      render: (v: string | null) =>
        v != null ? <span style={{ color: '#237804', fontWeight: 500 }}>{v}</span>
                  : <span style={{ color: '#cf1322', fontStyle: 'italic' }}>deleted</span>,
    },
  ];

  return (
    <>
      {/* ── Git-style status panel ── */}
      <div style={{
        background: statusBg,
        border: `1px solid ${statusBorder}`,
        borderRadius: 8,
        padding: '14px 18px',
        marginBottom: 20,
      }}>
        <Row align="middle" justify="space-between" wrap={false}>
          <Col flex="auto">
            <Space align="center" size={10}>
              {statusIcon}
              <Space direction="vertical" size={2}>
                <Space size={6} align="center">
                  <Tag color="blue" style={{ fontFamily: 'monospace', margin: 0 }}>sandbox</Tag>
                  <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 11 }} />
                  <Tag color="default" style={{ fontFamily: 'monospace', margin: 0 }}>production</Tag>
                </Space>
                {hasChanges ? (
                  <Text>
                    Sandbox is{' '}
                    <Text strong>ahead by {total} change{total !== 1 ? 's' : ''}</Text>
                    {diff && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {' '}({[
                          diff.added   > 0 ? `${diff.added} added`   : null,
                          diff.changed > 0 ? `${diff.changed} changed` : null,
                          diff.deleted > 0 ? `${diff.deleted} deleted` : null,
                        ].filter(Boolean).join(', ')})
                      </Text>
                    )}
                  </Text>
                ) : (
                  <Text type="success">Sandbox is up to date with production — nothing to push.</Text>
                )}
              </Space>
            </Space>
          </Col>
          <Col>
            <Space>
              <Popconfirm
                title="Reset sandbox?"
                description="All changes will be discarded. The sandbox will be re-copied from current production."
                onConfirm={() => resetMutation.mutate()}
                okText="Reset"
                okButtonProps={{ danger: true }}
              >
                <Button icon={<SyncOutlined />} size="small" loading={resetMutation.isPending}>
                  Reset
                </Button>
              </Popconfirm>
              {hasChanges && (
                <Button type="primary" size="middle" icon={<ArrowRightOutlined />}
                  onClick={() => setPushModalOpen(true)}>
                  Push to Production
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* ── Pending changes summary (collapsible, grouped by status) ── */}
      {hasChanges && !diffLoading && diff && (
        <DiffSummary diff={diff} />
      )}

      {/* ── Full sandbox translations list ── */}
      <Row gutter={12} style={{ marginBottom: 14 }}>
        <Col>
          <Select
            placeholder="Namespace"
            value={namespace || undefined}
            onChange={(val) => { setNamespace(val); setPage(1); setSearchInput(''); setSearch(''); }}
            style={{ width: 220 }}
            disabled={!projectDetails}
            options={(projectDetails?.namespaces ?? []).map((ns: string) => ({ value: ns, label: ns }))}
          />
        </Col>
        <Col flex="auto">
          <Input
            placeholder="Search by key or value..."
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            onBlur={handleSearch}
            allowClear
            onClear={() => { setSearchInput(''); setSearch(''); setPage(1); }}
            style={{ maxWidth: 360 }}
          />
        </Col>
      </Row>

      <Table<Entry>
        rowKey={(r) => r.key}
        columns={sandboxColumns}
        dataSource={tableData}
        loading={entriesLoading || diffLoading}
        scroll={{ x: true }}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize,
          // Added entries injected client-side; offset pagination total accordingly
          total: (entriesData?.meta.total ?? 0) + addedEntries.length,
          showSizeChanger: true,
          pageSizeOptions: ['25', '50', '100'],
          showTotal: (t) => `${t} keys`,
        }}
        size="small"
        onRow={(record) => {
          const rowStatus = keyStatusMap.get(`${namespace}/${record.key}`);
          return rowStatus ? { style: { background: ROW_BG[rowStatus] } } : {};
        }}
      />

      {/* ── Push to Production modal ── */}
      <Modal
        open={pushModalOpen}
        title={<Space><ArrowRightOutlined /><span>Push to Production</span></Space>}
        onCancel={() => setPushModalOpen(false)}
        width={1000}
        footer={[
          <Button key="cancel" onClick={() => setPushModalOpen(false)}>Cancel</Button>,
          <Button key="push" type="primary" icon={<ArrowRightOutlined />}
            loading={promoteMutation.isPending} onClick={() => promoteMutation.mutate()}>
            Push {total} change{total !== 1 ? 's' : ''} to Production
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          style={{ marginBottom: 16 }}
          message="Review all pending changes below. A snapshot of current production will be saved automatically before applying."
          showIcon
        />
        <Space style={{ marginBottom: 12 }}>
          <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>+{diff?.added ?? 0} added</Tag>
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>{diff?.changed ?? 0} changed</Tag>
          <Tag color="red" style={{ fontSize: 13, padding: '2px 10px' }}>−{diff?.deleted ?? 0} deleted</Tag>
        </Space>
        <Table<DiffEntry>
          rowKey={(r) => `${r.namespace}/${r.key}/${r.locale}`}
          columns={pushDiffColumns}
          dataSource={diff?.entries ?? []}
          size="small"
          scroll={{ x: true, y: 420 }}
          pagination={false}
          sticky
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
  const [namespace, setNamespace] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt'>('key');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');

  const { data: projectDetails } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  } as any) as { data: ProjectDetails | undefined };

  React.useEffect(() => { setNamespace(''); }, [projectSlug]);

  React.useEffect(() => {
    if (projectDetails && projectDetails.namespaces.length > 0 && !namespace) {
      setNamespace(projectDetails.namespaces[0]);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales ?? [];

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', projectSlug, namespace, page, pageSize, search, sortBy, sortOrder],
    queryFn: () => fetchEntries(projectSlug, namespace, page, pageSize, search, sortBy, sortOrder),
    enabled: !!projectSlug && !!namespace,
  } as any) as { data: PaginatedEntries | undefined; isLoading: boolean };

  const { data: snapshots = [] } = useQuery({
    queryKey: ['sandbox-snapshots', projectSlug],
    queryFn: () => fetchSnapshots(projectSlug),
    enabled: !!projectSlug && revertModalOpen,
  } as any) as { data: Snapshot[] };

  const createMutation = useMutation({
    mutationFn: ({ key, values }: { key: string; values: Record<string, string> }) =>
      createEntry(projectSlug, namespace, { key, values }),
    onSuccess: () => {
      message.success('Key created');
      qc.invalidateQueries({ queryKey: ['entries', projectSlug, namespace] });
      setEditModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error creating key'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, values }: { key: string; values: Record<string, string> }) =>
      updateEntry(projectSlug, namespace, key, values),
    onSuccess: () => {
      message.success('Saved');
      qc.invalidateQueries({ queryKey: ['entries', projectSlug, namespace] });
      setEditModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error saving'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteEntry(projectSlug, namespace, key),
    onSuccess: () => {
      message.success('Deleted');
      qc.invalidateQueries({ queryKey: ['entries', projectSlug, namespace] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error deleting'),
  });

  const revertMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/revert`, { snapshotId }).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Reverted — ${data.restored} entries restored`);
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setRevertModalOpen(false);
      setSelectedSnapshotId('');
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  const handleSearch = useCallback(() => { setSearch(searchInput); setPage(1); }, [searchInput]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Entry> | SorterResult<Entry>[],
  ) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 50);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      setSortBy(s.field === 'createdAt' ? 'createdAt' : 'key');
      setSortOrder(s.order === 'descend' ? 'desc' : 'asc');
    }
  };

  const columns: ColumnsType<Entry> = [
    {
      title: 'Key', dataIndex: 'key', key: 'key', sorter: true, width: 220, fixed: 'left',
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span>
        </Tooltip>
      ),
    },
    ...locales.map((locale) => ({
      title: <Tag color="blue">{locale}</Tag>,
      key: locale,
      width: 180,
      render: (_: unknown, record: Entry) => {
        const val = record.values[locale];
        return val
          ? <Tooltip title={val}><span style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'normal' }}>{val}</span></Tooltip>
          : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>;
      },
    })),
    {
      title: '', key: 'actions', width: 80, fixed: 'right',
      render: (_: unknown, record: Entry) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setEditEntry(record); setIsNewEntry(false); setEditModalOpen(true); }} />
          <Popconfirm title="Delete this key?" onConfirm={() => deleteMutation.mutate(record.key)}
            okText="Delete" okButtonProps={{ danger: true }}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Namespace"
            value={namespace || undefined}
            onChange={(val) => { setNamespace(val); setPage(1); }}
            style={{ width: 220 }}
            disabled={!projectDetails}
            options={(projectDetails?.namespaces ?? []).map((ns: string) => ({ value: ns, label: ns }))}
          />
        </Col>
        <Col flex="auto">
          <Input
            placeholder="Search by key or value..."
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            onBlur={handleSearch}
            allowClear
            onClear={() => { setSearchInput(''); setSearch(''); setPage(1); }}
            style={{ maxWidth: 360 }}
          />
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} disabled={!namespace}
            onClick={() => { setEditEntry(null); setIsNewEntry(true); setEditModalOpen(true); }}>
            Add key
          </Button>
        </Col>
        <Col>
          <Button icon={<RollbackOutlined />}
            onClick={() => { setSelectedSnapshotId(''); setRevertModalOpen(true); }}>
            Revert to snapshot
          </Button>
        </Col>
      </Row>

      <Table<Entry>
        rowKey="key"
        columns={columns}
        dataSource={entriesData?.data ?? []}
        loading={entriesLoading}
        scroll={{ x: true }}
        onChange={handleTableChange}
        pagination={{
          current: page, pageSize,
          total: entriesData?.meta.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: ['25', '50', '100'],
          showTotal: (total) => `${total} keys`,
        }}
        size="small"
      />

      <EditModal
        open={editModalOpen}
        entry={editEntry}
        locales={locales}
        isNew={isNewEntry}
        onClose={() => setEditModalOpen(false)}
        onSave={(key, values) => {
          if (isNewEntry) createMutation.mutate({ key, values });
          else updateMutation.mutate({ key, values });
        }}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      <Modal
        open={revertModalOpen}
        title="Revert production to snapshot"
        onCancel={() => { setRevertModalOpen(false); setSelectedSnapshotId(''); }}
        onOk={() => { if (selectedSnapshotId) revertMutation.mutate(selectedSnapshotId); }}
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
              { title: 'Label', dataIndex: 'label', key: 'label', render: (v: string | null) => v ?? '—' },
              { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => new Date(v).toLocaleString() },
              { title: 'Entries', dataIndex: 'entryCount', key: 'entryCount', width: 80 },
            ]}
          />
        )}
      </Modal>
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const TranslationsPage: React.FC = () => {
  const [projectSlug, setProjectSlug] = useState('');
  const [activeTab, setActiveTab] = useState('sandbox');

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  } as any) as { data: Project[]; isLoading: boolean };

  React.useEffect(() => {
    if (projects.length > 0 && !projectSlug) setProjectSlug(projects[0].slug);
  }, [projects, projectSlug]);

  const tabItems = [
    {
      key: 'sandbox',
      label: (
        <Space size={6}>
          <span>Sandbox</span>
          <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>source</Tag>
        </Space>
      ),
      children: <SandboxTab projectSlug={projectSlug} />,
    },
    {
      key: 'production',
      label: (
        <Space size={6}>
          <span>Production</span>
          <Tag color="default" style={{ margin: 0, fontSize: 11 }}>target</Tag>
        </Space>
      ),
      children: projectSlug
        ? <ProductionTab projectSlug={projectSlug} />
        : <Empty description="Select a project" style={{ marginTop: 48 }} />,
    },
  ];

  return (
    <div>
      <Row align="middle" gutter={16} style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Translations</Title>
        </Col>
        <Col>
          <Select
            placeholder="Select project"
            loading={projectsLoading}
            value={projectSlug || undefined}
            onChange={(val) => setProjectSlug(val)}
            style={{ width: 200 }}
            options={projects.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        destroyInactiveTabPane={false}
      />
    </div>
  );
};

export default TranslationsPage;
