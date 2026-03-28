import React, { useState, useCallback } from 'react';
import {
  Table, Typography, Space, Input, Select, Button, Modal,
  Form, message, Tooltip, Popconfirm, Tag, Row, Col, Alert, Spin,
} from 'antd';
import {
  SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  ThunderboltOutlined, SafetyCertificateOutlined,
  BranchesOutlined, CloudUploadOutlined, DiffOutlined, RollbackOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import apiClient from '../../api/client';

const { Title } = Typography;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  slug: string;
  name: string;
}

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

// ─── API calls ────────────────────────────────────────────────────────────────

const aiTranslate = async (text: string): Promise<Record<string, string>> => {
  const res = await apiClient.post('/translations/ai-translate', { text });
  return res.data;
};

interface QualityResult {
  score: number;
  level: 'green' | 'yellow' | 'red';
  comment: string;
}

const checkQuality = async (
  source: string,
  translation: string,
  locale: string,
): Promise<QualityResult> => {
  const res = await apiClient.post('/translations/ai-quality-check', {
    source,
    translation,
    locale,
    mode: 'translation_quality',
  });
  return res.data;
};

const fetchProjects = async (): Promise<Project[]> => {
  const res = await apiClient.get('/translations/projects?limit=200');
  return res.data.data;
};

const fetchProjectDetails = async (slug: string): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

const fetchEntries = async (
  projectSlug: string,
  ns: string,
  page: number,
  limit: number,
  search: string,
  sortBy: string,
  sortOrder: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = { page, limit, sortBy, sortOrder };
  if (search.length >= 2) params.search = search;
  const res = await apiClient.get(
    `/translations/projects/${projectSlug}/namespaces/${ns}/entries`,
    { params },
  );
  return res.data;
};

const createEntry = async (
  projectSlug: string,
  ns: string,
  payload: { key: string; values: Record<string, string> },
) => {
  const res = await apiClient.post(
    `/translations/projects/${projectSlug}/namespaces/${ns}/entries`,
    payload,
  );
  return res.data;
};

const updateEntry = async (
  projectSlug: string,
  ns: string,
  key: string,
  values: Record<string, string>,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${projectSlug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values },
  );
  return res.data;
};

const deleteEntry = async (projectSlug: string, ns: string, key: string) => {
  await apiClient.delete(
    `/translations/projects/${projectSlug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

const fetchSandboxStatus = async (slug: string): Promise<SandboxStatus> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/status`);
  return res.data;
};

const apiInitSandbox = async (slug: string, force = false) => {
  const res = await apiClient.post(`/translations/projects/${slug}/sandbox/init`, { force });
  return res.data;
};

const fetchSandboxDiff = async (slug: string): Promise<DiffResult> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/diff`);
  return res.data;
};

const apiPromoteSandbox = async (slug: string) => {
  const res = await apiClient.post(`/translations/projects/${slug}/sandbox/promote`);
  return res.data;
};

const apiRevertSandbox = async (slug: string, snapshotId: string) => {
  const res = await apiClient.post(`/translations/projects/${slug}/sandbox/revert`, { snapshotId });
  return res.data;
};

const apiResetSandbox = async (slug: string) => {
  const res = await apiClient.post(`/translations/projects/${slug}/sandbox/reset`);
  return res.data;
};

const fetchSnapshots = async (slug: string): Promise<Snapshot[]> => {
  const res = await apiClient.get(`/translations/projects/${slug}/sandbox/snapshots`);
  return res.data;
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean;
  entry: Entry | null;
  locales: string[];
  isNew: boolean;
  onClose: () => void;
  onSave: (key: string, values: Record<string, string>) => void;
  saving: boolean;
}

const AI_LOCALES = ['uk', 'nb-NO', 'sv', 'da-DK'];

const QUALITY_CONFIG = {
  green:  { color: 'success', label: 'Good' },
  yellow: { color: 'warning', label: 'Review' },
  red:    { color: 'error',   label: 'Poor' },
} as const;

const EditModal: React.FC<EditModalProps> = ({ open, entry, locales, isNew, onClose, onSave, saving }) => {
  const [form] = Form.useForm();
  const [aiLoading, setAiLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityResults, setQualityResults] = useState<Record<string, QualityResult>>({});

  React.useEffect(() => {
    if (open) {
      setQualityResults({});
      if (entry) {
        form.setFieldsValue({ key: entry.key, ...entry.values });
      } else {
        form.resetFields();
      }
    }
  }, [open, entry, form]);

  const handleOk = () => {
    form.validateFields().then((vals) => {
      const { key: formKey, ...rest } = vals;
      const key = isNew ? formKey : (entry?.key ?? '');
      const values: Record<string, string> = {};
      for (const locale of locales) {
        values[locale] = rest[locale] ?? '';
      }
      onSave(key, values);
    });
  };

  const handleAiGenerate = async () => {
    const enText: string = form.getFieldValue('en') ?? '';
    if (!enText.trim()) {
      message.warning('Enter English text first');
      return;
    }
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
    if (!enText.trim()) {
      message.warning('English (source) text is required for quality check');
      return;
    }
    const targetLocales = locales.filter((l) => l !== 'en' && vals[l]?.trim());
    if (!targetLocales.length) {
      message.warning('No translated values to check');
      return;
    }
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
    <Modal
      open={open}
      title={isNew ? 'Add translation key' : `Edit: ${entry?.key}`}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {isNew && (
          <Form.Item
            name="key"
            label="Key"
            rules={[
              { required: true, message: 'Key is required' },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: 'Only letters, digits, dots, underscores, dashes' },
            ]}
          >
            <Input placeholder="e.g. accessControl" />
          </Form.Item>
        )}
        {locales.map((locale) => {
          const qr = qualityResults[locale];
          return (
            <Form.Item
              key={locale}
              name={locale}
              label={
                locale === 'en' && hasAiLocales ? (
                  <Space>
                    <span>en</span>
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={aiLoading}
                      onClick={handleAiGenerate}
                      type="dashed"
                      disabled={!hasEnLocale}
                    >
                      Generate with AI
                    </Button>
                    {hasTranslations && (
                      <Button
                        size="small"
                        icon={<SafetyCertificateOutlined />}
                        loading={qualityLoading}
                        onClick={handleCheckQuality}
                        type="dashed"
                      >
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
              }
            >
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
            </Form.Item>
          );
        })}
        {Object.keys(qualityResults).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {Object.entries(qualityResults).map(([locale, r]) => (
              <Alert
                key={locale}
                type={r.level === 'red' ? 'error' : r.level === 'yellow' ? 'warning' : 'info'}
                message={<><Tag>{locale}</Tag>{r.comment || 'Looks good'}</>}
                style={{ marginBottom: 6 }}
                showIcon
              />
            ))}
          </div>
        )}
      </Form>
    </Modal>
  );
};

// ─── Diff status config ────────────────────────────────────────────────────────

const DIFF_STATUS: Record<string, { color: string; label: string }> = {
  added:   { color: 'green',  label: 'Added' },
  changed: { color: 'orange', label: 'Changed' },
  deleted: { color: 'red',    label: 'Deleted' },
};

const diffColumns: ColumnsType<DiffEntry> = [
  {
    title: 'NS',
    dataIndex: 'namespace',
    key: 'ns',
    width: 110,
    ellipsis: true,
  },
  {
    title: 'Key',
    dataIndex: 'key',
    key: 'key',
    width: 200,
    ellipsis: true,
    render: (t: string) => (
      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span>
    ),
  },
  {
    title: 'Locale',
    dataIndex: 'locale',
    key: 'locale',
    width: 70,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 90,
    render: (s: string) => (
      <Tag color={DIFF_STATUS[s]?.color}>{DIFF_STATUS[s]?.label ?? s}</Tag>
    ),
  },
  {
    title: 'Production',
    dataIndex: 'productionValue',
    key: 'prod',
    ellipsis: true,
    render: (v: string | null) =>
      v != null
        ? <span style={{ color: '#d32f2f' }}>{v}</span>
        : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>,
  },
  {
    title: 'Sandbox',
    dataIndex: 'sandboxValue',
    key: 'sandbox',
    ellipsis: true,
    render: (v: string | null) =>
      v != null
        ? <span style={{ color: '#388e3c' }}>{v}</span>
        : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>,
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

const TranslationsPage: React.FC = () => {
  const qc = useQueryClient();

  const [projectSlug, setProjectSlug] = useState<string>('');
  const [namespace, setNamespace] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt'>('key');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);

  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');

  // ── Projects list
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  } as any);

  // Auto-select first project
  React.useEffect(() => {
    if ((projects as Project[]).length > 0 && !projectSlug) {
      setProjectSlug((projects as Project[])[0].slug);
    }
  }, [projects, projectSlug]);

  // ── Project details (locales + namespaces)
  const { data: projectDetails } = useQuery({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  } as any);

  // Auto-select first namespace
  React.useEffect(() => {
    if (projectDetails && (projectDetails as ProjectDetails).namespaces.length > 0 && !namespace) {
      setNamespace((projectDetails as ProjectDetails).namespaces[0]);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales ?? [];

  // ── Entries
  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', projectSlug, namespace, page, pageSize, search, sortBy, sortOrder],
    queryFn: () => fetchEntries(projectSlug, namespace, page, pageSize, search, sortBy, sortOrder),
    enabled: !!projectSlug && !!namespace,
  } as any);

  // ── Sandbox status
  const { data: sandboxStatus } = useQuery({
    queryKey: ['sandbox-status', projectSlug],
    queryFn: () => fetchSandboxStatus(projectSlug),
    enabled: !!projectSlug,
  } as any) as { data: SandboxStatus | undefined };

  // ── Sandbox diff (only when modal is open)
  const { data: diffData, isLoading: diffLoading } = useQuery({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!sandboxStatus?.initialized && diffModalOpen,
  } as any) as { data: DiffResult | undefined; isLoading: boolean };

  // ── Snapshots (only when revert modal is open)
  const { data: snapshots = [] } = useQuery({
    queryKey: ['sandbox-snapshots', projectSlug],
    queryFn: () => fetchSnapshots(projectSlug),
    enabled: !!projectSlug && revertModalOpen,
  } as any) as { data: Snapshot[] };

  // ── Mutations
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

  const initMutation = useMutation({
    mutationFn: (force: boolean) => apiInitSandbox(projectSlug, force),
    onSuccess: (data: any) => {
      message.success(`Sandbox initialized (${data.copiedRows} rows copied)`);
      qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Failed to initialize sandbox'),
  });

  const promoteMutation = useMutation({
    mutationFn: () => apiPromoteSandbox(projectSlug),
    onSuccess: (data: any) => {
      message.success(`Promoted ${data.promoted} entries to production`);
      qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
      qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setDiffModalOpen(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Promote failed'),
  });

  const revertMutation = useMutation({
    mutationFn: (snapshotId: string) => apiRevertSandbox(projectSlug, snapshotId),
    onSuccess: (data: any) => {
      message.success(`Reverted — ${data.restored} entries restored`);
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setRevertModalOpen(false);
      setSelectedSnapshotId('');
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiResetSandbox(projectSlug),
    onSuccess: (data: any) => {
      message.success(`Sandbox reset (${data.copiedRows} rows)`);
      qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
      qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Reset failed'),
  });

  // ── Handlers
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
      setSortBy(s.field === 'createdAt' ? 'createdAt' : 'key');
      setSortOrder(s.order === 'descend' ? 'desc' : 'asc');
    }
  };

  const openEdit = (entry: Entry) => {
    setEditEntry(entry);
    setIsNewEntry(false);
    setEditModalOpen(true);
  };

  const openNew = () => {
    setEditEntry(null);
    setIsNewEntry(true);
    setEditModalOpen(true);
  };

  const handleSave = (key: string, values: Record<string, string>) => {
    if (isNewEntry) {
      createMutation.mutate({ key, values });
    } else {
      updateMutation.mutate({ key, values });
    }
  };

  // ── Columns
  const columns: ColumnsType<Entry> = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      sorter: true,
      width: 220,
      fixed: 'left',
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
          ? (
            <Tooltip title={val}>
              <span style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                {val}
              </span>
            </Tooltip>
          )
          : <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>;
      },
    })),
    {
      title: '',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: Entry) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Delete this key?"
            onConfirm={() => deleteMutation.mutate(record.key)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const canShow = !!projectSlug && !!namespace;
  const sb = sandboxStatus as SandboxStatus | undefined;

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>Translations</Title>

      {/* ── Selectors ── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Project"
            loading={projectsLoading}
            value={projectSlug || undefined}
            onChange={(val) => { setProjectSlug(val); setNamespace(''); setPage(1); }}
            style={{ width: 180 }}
            options={projects.map((p: Project) => ({ value: p.slug, label: p.name }))}
          />
        </Col>
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canShow}
            onClick={openNew}
          >
            Add key
          </Button>
        </Col>
      </Row>

      {/* ── Sandbox bar ── */}
      {projectSlug && (
        <div style={{
          marginBottom: 16,
          padding: '8px 14px',
          background: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <Space size={6}>
            <BranchesOutlined style={{ color: '#595959' }} />
            <span style={{ fontWeight: 500, color: '#595959' }}>Sandbox</span>
          </Space>

          {!sb?.initialized ? (
            <>
              <Tag>Not initialized</Tag>
              <Button
                size="small"
                loading={initMutation.isPending}
                onClick={() => initMutation.mutate(false)}
              >
                Initialize
              </Button>
            </>
          ) : (
            <>
              <Tag color={sb.hasChanges ? 'orange' : 'green'}>
                {sb.hasChanges ? 'Has changes' : 'In sync'}
              </Tag>

              <Button
                size="small"
                icon={<DiffOutlined />}
                onClick={() => setDiffModalOpen(true)}
              >
                View diff
              </Button>

              <Popconfirm
                title="Promote sandbox to production?"
                description="Current production will be snapshotted before being replaced."
                onConfirm={() => promoteMutation.mutate()}
                okText="Promote"
                okButtonProps={{ type: 'primary' }}
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  disabled={!sb.hasChanges}
                  loading={promoteMutation.isPending}
                >
                  Promote
                </Button>
              </Popconfirm>

              <Popconfirm
                title="Reset sandbox?"
                description="All sandbox changes will be discarded and re-copied from production."
                onConfirm={() => resetMutation.mutate()}
                okText="Reset"
                okButtonProps={{ danger: true }}
              >
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  danger
                  loading={resetMutation.isPending}
                >
                  Reset
                </Button>
              </Popconfirm>

              {sb.snapshotCount > 0 && (
                <Button
                  size="small"
                  icon={<RollbackOutlined />}
                  onClick={() => { setSelectedSnapshotId(''); setRevertModalOpen(true); }}
                >
                  Revert ({sb.snapshotCount})
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <Table<Entry>
        rowKey="key"
        columns={columns}
        dataSource={entriesData?.data ?? []}
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
      />

      {/* ── Edit / Add Modal ── */}
      <EditModal
        open={editModalOpen}
        entry={editEntry}
        locales={locales}
        isNew={isNewEntry}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      {/* ── Diff Modal ── */}
      <Modal
        open={diffModalOpen}
        title={`Sandbox diff${diffData ? ` — ${diffData.total} change${diffData.total !== 1 ? 's' : ''}` : ''}`}
        onCancel={() => setDiffModalOpen(false)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setDiffModalOpen(false)}>Close</Button>,
          <Popconfirm
            key="promote"
            title="Promote all changes to production?"
            description="Current production will be snapshotted before being replaced."
            onConfirm={() => promoteMutation.mutate()}
            okText="Promote"
            okButtonProps={{ type: 'primary' }}
            disabled={!diffData?.total}
          >
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={promoteMutation.isPending}
              disabled={!diffData?.total}
            >
              Promote to Production
            </Button>
          </Popconfirm>,
        ]}
      >
        {diffLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        ) : (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag color="green">+{diffData?.added ?? 0} added</Tag>
              <Tag color="orange">{diffData?.changed ?? 0} changed</Tag>
              <Tag color="red">−{diffData?.deleted ?? 0} deleted</Tag>
            </Space>
            <Table<DiffEntry>
              rowKey={(r) => `${r.namespace}/${r.key}/${r.locale}`}
              columns={diffColumns}
              dataSource={diffData?.entries ?? []}
              size="small"
              pagination={{ pageSize: 25, showSizeChanger: false, showTotal: (t) => `${t} entries` }}
              scroll={{ x: true }}
            />
          </>
        )}
      </Modal>

      {/* ── Revert Modal ── */}
      <Modal
        open={revertModalOpen}
        title="Revert production to snapshot"
        onCancel={() => { setRevertModalOpen(false); setSelectedSnapshotId(''); }}
        onOk={() => { if (selectedSnapshotId) revertMutation.mutate(selectedSnapshotId); }}
        confirmLoading={revertMutation.isPending}
        okText="Revert"
        okButtonProps={{ danger: true, disabled: !selectedSnapshotId }}
        width={640}
      >
        <Alert
          type="warning"
          message="This replaces current production values with those from the selected snapshot. Sandbox is not affected."
          style={{ marginBottom: 16 }}
          showIcon
        />
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
              render: (v: string | null) => v ?? <span style={{ color: '#aaa' }}>—</span>,
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
      </Modal>
    </div>
  );
};

export default TranslationsPage;
