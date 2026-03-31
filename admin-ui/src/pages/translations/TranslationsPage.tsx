import React, { useState, useCallback, useMemo } from 'react';
import {
  Table, Typography, Space, Input, Select, Button, Modal,
  Form, message, Tooltip, Popconfirm, Tag, Row, Col, Alert, Spin, Tabs, Empty,
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

interface LocaleInfo {
  code: string;
  isDefault: boolean;
}

interface ProjectDetails {
  slug: string;
  name: string;
  locales: LocaleInfo[];
  namespaces: string[];
}

interface QualityInfo {
  reviewState: 'not_checked' | 'queued' | 'processing' | 'checked' | 'failed';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | null;
  comment: string | null;
  checkedAt: string | null;
}

interface Entry {
  key: string;
  createdAt: string;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
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

// Key-level diff row for the review modal — one row per key, carries all locale entries
interface KeyDiffRow {
  id: string;
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  localeEntries: DiffEntry[];
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
  qualityLevel?: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = { page, limit, sortBy, sortOrder };
  if (search.length >= 2) params.search = search;
  if (qualityLevel) params.qualityLevel = qualityLevel;
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

const fetchSandboxEntries = async (
  slug: string, ns: string, page: number, limit: number,
  search: string, sortBy: string, sortOrder: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = { page, limit, sortBy, sortOrder };
  if (search.length >= 2) params.search = search;
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`, { params },
  );
  return res.data;
};

const createSandboxEntry = async (
  slug: string, ns: string, payload: { key: string; values: Record<string, string> },
) => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`, payload,
  );
  return res.data;
};

const updateSandboxEntry = async (
  slug: string, ns: string, key: string, values: Record<string, string>,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values },
  );
  return res.data;
};

const deleteSandboxEntry = async (slug: string, ns: string, key: string) => {
  await apiClient.delete(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

const revertSandboxKey = async (slug: string, ns: string, key: string) => {
  await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/revert`,
  );
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const AI_LOCALES = ['uk', 'nb-NO', 'sv', 'da-DK'];

const QUALITY_CONFIG = {
  green:  { color: 'success', label: 'Good' },
  yellow: { color: 'warning', label: 'Review' },
  red:    { color: 'error',   label: 'Poor' },
} as const;

const QUALITY_COLOR: Record<string, string> = {
  green:  '#52c41a',
  yellow: '#faad14',
  red:    '#ff4d4f',
};

const QualityBadge: React.FC<{ info: QualityInfo | null | undefined }> = ({ info }) => {
  if (!info) return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;

  if (info.reviewState === 'queued' || info.reviewState === 'processing') {
    return (
      <Tooltip title={info.reviewState === 'processing' ? 'Reviewing…' : 'Queued for review'}>
        <SyncOutlined spin style={{ color: '#8c8c8c', fontSize: 10 }} />
      </Tooltip>
    );
  }

  if (info.reviewState === 'failed') {
    return (
      <Tooltip title="Quality review failed — will retry">
        <span style={{ color: '#ff4d4f', fontSize: 11, fontWeight: 'bold', cursor: 'help' }}>!</span>
      </Tooltip>
    );
  }

  if (info.reviewState === 'not_checked') {
    return (
      <Tooltip title="Not yet reviewed">
        <span style={{
          display: 'inline-block',
          width: 10, height: 10,
          borderRadius: '50%',
          backgroundColor: '#d9d9d9',
          flexShrink: 0,
        }} />
      </Tooltip>
    );
  }

  // checked
  return (
    <Tooltip title={`Score: ${info.score ?? '?'}/100${info.comment ? ` — ${info.comment}` : ''}`}>
      <span style={{
        display: 'inline-block',
        width: 10, height: 10,
        borderRadius: '50%',
        backgroundColor: QUALITY_COLOR[info.level ?? ''] ?? '#bbb',
        cursor: 'help',
        flexShrink: 0,
      }} />
    </Tooltip>
  );
};

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
      if (entry) { form.setFieldsValue({ key: entry.key, ...entry.values }); } else { form.resetFields(); }
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
  const hasTranslations = locales.some((l) => l !== 'en');

  return (
    <Modal open={open} title={isNew ? 'Add translation key' : `Edit: ${entry?.key}`}
      onCancel={onClose} onOk={handleOk} confirmLoading={saving} width={640} destroyOnHidden>
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
                        {QUALITY_CONFIG[qr.level].label} · {qr.score}/100
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

// Group locale-level diff entries into key-level rows for the review modal
function buildKeyDiffRows(entries: DiffEntry[]): KeyDiffRow[] {
  const map = new Map<string, KeyDiffRow>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, { id, namespace: e.namespace, key: e.key, status: e.status, localeEntries: [] });
    }
    const row = map.get(id)!;
    row.localeEntries.push(e);
    // Dominant status: added > deleted > changed
    if (e.status === 'added' || (e.status === 'deleted' && row.status === 'changed')) {
      row.status = e.status;
    }
  }
  return Array.from(map.values());
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

// ─── Sandbox Tab ──────────────────────────────────────────────────────────────

interface SandboxTabProps {
  projectSlug: string;
}

const SandboxTab: React.FC<SandboxTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);
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

  const { data: diff } = useQuery({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!status?.initialized,
  } as any) as { data: DiffResult | undefined; isLoading: boolean };

  const { data: projectDetails } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  } as any) as { data: ProjectDetails | undefined };

  // Sandbox-specific entries (true sandbox view, not production overlay)
  const { data: sandboxEntries, isLoading: entriesLoading } = useQuery({
    queryKey: ['sandbox-entries', projectSlug, namespace, page, pageSize, search, sortBy, sortOrder],
    queryFn: () => fetchSandboxEntries(projectSlug, namespace, page, pageSize, search, sortBy, sortOrder),
    enabled: !!projectSlug && !!namespace && !!status?.initialized,
  } as any) as { data: PaginatedEntries | undefined; isLoading: boolean };

  React.useEffect(() => { setNamespace(''); setPage(1); }, [projectSlug]);

  React.useEffect(() => {
    if (projectDetails && projectDetails.namespaces.length > 0 && !namespace) {
      setNamespace(projectDetails.namespaces[0]);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales?.map((l) => l.code) ?? [];

  // Diff key-status lookup for row highlighting (ns/key → status)
  const keyStatusMap = useMemo(() => buildKeyStatusLookup(diff?.entries ?? []), [diff]);

  // Key-level change counts (must stay above early returns — Rules of Hooks)
  const keyDiffs    = useMemo(() => buildKeyDiffs(diff?.entries ?? []), [diff]);
  const keyDiffRows = useMemo(() => buildKeyDiffRows(diff?.entries ?? []), [diff]);
  const keyAdded   = keyDiffs.filter((k) => k.status === 'added').length;
  const keyChanged = keyDiffs.filter((k) => k.status === 'changed').length;
  const keyDeleted = keyDiffs.filter((k) => k.status === 'deleted').length;
  const total      = keyAdded + keyChanged + keyDeleted;

  const invalidateSandbox = () => {
    qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
  };

  const initMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/init`, { force: false }).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Sandbox initialized — ${data.copiedRows} rows copied from production`);
      invalidateSandbox();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Failed to initialize'),
  });

  const createMutation = useMutation({
    mutationFn: ({ key, values }: { key: string; values: Record<string, string> }) =>
      createSandboxEntry(projectSlug, namespace, { key, values }),
    onSuccess: () => {
      message.success('Key created in sandbox');
      invalidateSandbox();
      setEditModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error creating key'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, values }: { key: string; values: Record<string, string> }) =>
      updateSandboxEntry(projectSlug, namespace, key, values),
    onSuccess: () => {
      message.success('Saved to sandbox');
      invalidateSandbox();
      setEditModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error saving'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteSandboxEntry(projectSlug, namespace, key),
    onSuccess: () => {
      message.success('Key removed from sandbox');
      invalidateSandbox();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error deleting'),
  });

  const promoteMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/translations/projects/${projectSlug}/sandbox/promote`).then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Pushed — ${data.promoted} entries are now live in production`);
      invalidateSandbox();
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
      invalidateSandbox();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Reset failed'),
  });

  const revertKeyMutation = useMutation({
    mutationFn: ({ ns, key }: { ns: string; key: string }) =>
      revertSandboxKey(projectSlug, ns, key),
    onSuccess: () => {
      message.success('Change reverted');
      invalidateSandbox();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  // Auto-close review modal when all changes have been reverted
  React.useEffect(() => {
    if (pushModalOpen && diff && diff.total === 0) {
      setPushModalOpen(false);
    }
  }, [pushModalOpen, diff]);

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

  const statusBg     = hasChanges ? '#fffbe6' : '#f6ffed';
  const statusBorder = hasChanges ? '#ffe58f' : '#b7eb8f';
  const statusIcon   = hasChanges
    ? <span style={{ fontSize: 18 }}>⚡</span>
    : <CheckCircleOutlined style={{ fontSize: 18, color: '#52c41a' }} />;

  // Sandbox entries table columns — shows true sandbox values, highlights changed rows
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
                style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px' }}
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
      width: 180,
      render: (_: unknown, record: Entry) => {
        const val = record.values[locale];
        return (
          <Space size={4} align="start">
            <QualityBadge info={record.quality?.[locale]} />
            {val
              ? <Tooltip title={val}><span style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'normal' }}>{val}</span></Tooltip>
              : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>}
          </Space>
        );
      },
    })),
    {
      title: '', key: 'actions', width: 80, fixed: 'right',
      render: (_: unknown, record: Entry) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setEditEntry(record); setIsNewEntry(false); setEditModalOpen(true); }} />
          <Popconfirm
            title="Remove this key from sandbox?"
            description="The key will be marked for deletion and removed from production when you push."
            onConfirm={() => deleteMutation.mutate(record.key)}
            okText="Remove" okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const pushDiffColumns: ColumnsType<KeyDiffRow> = [
    { title: 'Namespace', dataIndex: 'namespace', key: 'ns', width: 130, ellipsis: true },
    {
      title: 'Key', dataIndex: 'key', key: 'key',
      render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
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
      title: 'Locales', key: 'locales', width: 160,
      render: (_: unknown, record: KeyDiffRow) => (
        <Space size={4} wrap>
          {record.localeEntries.map((e) => (
            <Tag key={e.locale} style={{ fontSize: 11, margin: 0 }}>{e.locale}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '', key: 'revert', width: 80,
      render: (_: unknown, record: KeyDiffRow) => (
        <Popconfirm
          title="Revert this change?"
          description="This key will be restored to its production value."
          onConfirm={() => revertKeyMutation.mutate({ ns: record.namespace, key: record.key })}
          okText="Revert" okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            icon={<RollbackOutlined />}
            loading={revertKeyMutation.isPending && revertKeyMutation.variables?.key === record.key}
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
      <div style={{
        background: statusBg, border: `1px solid ${statusBorder}`,
        borderRadius: 8, padding: '14px 18px', marginBottom: 20,
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
                    Sandbox is <Text strong>ahead by {total} change{total !== 1 ? 's' : ''}</Text>
                    {total > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {' '}({[
                          keyAdded   > 0 ? `${keyAdded} added`   : null,
                          keyChanged > 0 ? `${keyChanged} changed` : null,
                          keyDeleted > 0 ? `${keyDeleted} deleted` : null,
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
            {hasChanges && (
              <Space>
                <Popconfirm
                  title="Reset sandbox?"
                  description="All changes will be discarded. The sandbox will be re-copied from current production."
                  onConfirm={() => resetMutation.mutate()}
                  okText="Reset" okButtonProps={{ danger: true }}
                >
                  <Button icon={<SyncOutlined />} loading={resetMutation.isPending}>Reset</Button>
                </Popconfirm>
                <Button type="primary" icon={<ArrowRightOutlined />}
                  onClick={() => setPushModalOpen(true)}>
                  Review Changes
                </Button>
              </Space>
            )}
          </Col>
        </Row>
      </div>

      {/* ── Sandbox entries controls ── */}
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
        <Col>
          <Button type="primary" icon={<PlusOutlined />} disabled={!namespace}
            onClick={() => { setEditEntry(null); setIsNewEntry(true); setEditModalOpen(true); }}>
            Add key
          </Button>
        </Col>
      </Row>

      {/* ── Sandbox entries table ── */}
      <Table<Entry>
        rowKey="key"
        columns={sandboxColumns}
        dataSource={sandboxEntries?.data ?? []}
        loading={entriesLoading}
        scroll={{ x: true }}
        onChange={handleTableChange}
        pagination={{
          current: page, pageSize,
          total: sandboxEntries?.meta.total ?? 0,
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

      {/* ── Edit / Add modal (saves to sandbox) ── */}
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

      {/* ── Push to Production modal ── */}
      <Modal
        open={pushModalOpen}
        title={<Space><ArrowRightOutlined /><span>Review Changes</span></Space>}
        onCancel={() => setPushModalOpen(false)}
        width={1000}
        footer={[
          <Button key="cancel" onClick={() => setPushModalOpen(false)}>Cancel</Button>,
          <Button key="push" type="primary" icon={<ArrowRightOutlined />}
            loading={promoteMutation.isPending} onClick={() => promoteMutation.mutate()}>
            Push {total} key{total !== 1 ? 's' : ''} to Production
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
          <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>+{keyAdded} added</Tag>
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>{keyChanged} changed</Tag>
          <Tag color="red" style={{ fontSize: 13, padding: '2px 10px' }}>−{keyDeleted} deleted</Tag>
        </Space>
        <Table<KeyDiffRow>
          rowKey="id"
          columns={pushDiffColumns}
          dataSource={keyDiffRows}
          size="small"
          scroll={{ x: true, y: 420 }}
          pagination={false}
          sticky
          expandable={{
            expandedRowRender: (record) => (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', width: 80, fontWeight: 500, color: '#666' }}>Locale</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', width: 80, fontWeight: 500, color: '#666' }}>Status</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, color: '#666' }}>Production</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, color: '#666' }}>Sandbox</th>
                  </tr>
                </thead>
                <tbody>
                  {record.localeEntries.map((e) => (
                    <tr key={e.locale} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 8px' }}><Tag style={{ fontSize: 11, margin: 0 }}>{e.locale}</Tag></td>
                      <td style={{ padding: '4px 8px' }}>
                        <Tag color={e.status === 'added' ? 'green' : e.status === 'deleted' ? 'red' : 'orange'}
                          style={{ fontSize: 11, margin: 0 }}>
                          {e.status}
                        </Tag>
                      </td>
                      <td style={{ padding: '4px 8px', color: '#888', maxWidth: 260, wordBreak: 'break-word' }}>
                        {e.productionValue ?? <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '4px 8px', maxWidth: 260, wordBreak: 'break-word' }}>
                        {e.sandboxValue != null
                          ? <span style={{ color: '#237804', fontWeight: 500 }}>{e.sandboxValue}</span>
                          : <span style={{ color: '#cf1322', fontStyle: 'italic' }}>deleted</span>}
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
  const [namespace, setNamespace] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt' | 'qualityScore'>('key');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [qualityLevel, setQualityLevel] = useState('');
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

  const locales: string[] = projectDetails?.locales?.map((l) => l.code) ?? [];

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', projectSlug, namespace, page, pageSize, search, sortBy, sortOrder, qualityLevel],
    queryFn: () => fetchEntries(projectSlug, namespace, page, pageSize, search, sortBy, sortOrder, qualityLevel || undefined),
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
      const field = s.field as string;
      setSortBy(field === 'createdAt' ? 'createdAt' : field === 'qualityScore' ? 'qualityScore' : 'key');
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
        return (
          <Space size={4} align="start">
            <QualityBadge info={record.quality?.[locale]} />
            {val
              ? <Tooltip title={val}><span style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'normal' }}>{val}</span></Tooltip>
              : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>}
          </Space>
        );
      },
    })),
    {
      title: <Tooltip title="Minimum quality score across all locales (sort to find worst translations)">Quality</Tooltip>,
      key: 'qualityScore',
      dataIndex: 'qualityScore',
      sorter: true,
      width: 90,
      render: (_: unknown, record: Entry) => {
        const scores = locales
          .map((l) => record.quality?.[l]?.score)
          .filter((s): s is number => s != null);
        if (!scores.length) return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;
        const minScore = Math.min(...scores);
        const levels = locales.map((l) => record.quality?.[l]?.level).filter(Boolean);
        const level = levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green';
        return (
          <span style={{ color: QUALITY_COLOR[level] ?? '#bbb', fontWeight: 600, fontSize: 12 }}>
            {minScore}
          </span>
        );
      },
    },
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
          <Select
            value={qualityLevel || ''}
            onChange={(val) => { setQualityLevel(val); setPage(1); }}
            style={{ width: 150 }}
            options={[
              { value: '', label: 'All qualities' },
              { value: 'green', label: 'Green' },
              { value: 'yellow', label: 'Yellow' },
              { value: 'red', label: 'Red' },
              { value: 'unchecked', label: 'Not checked' },
            ]}
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
      label: 'Sandbox',
      children: <SandboxTab projectSlug={projectSlug} />,
    },
    {
      key: 'production',
      label: 'Production',
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
        destroyOnHidden={false}
      />
    </div>
  );
};

export default TranslationsPage;
