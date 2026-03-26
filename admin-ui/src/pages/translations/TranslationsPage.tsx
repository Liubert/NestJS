import React, { useState, useCallback } from 'react';
import {
  Table, Typography, Space, Input, Select, Button, Modal,
  Form, message, Tooltip, Popconfirm, Tag, Row, Col, Alert,
} from 'antd';
import {
  SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  ThunderboltOutlined, SafetyCertificateOutlined,
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

// ─── API calls ────────────────────────────────────────────────────────────────

const aiTranslate = async (text: string): Promise<Record<string, string>> => {
  const res = await apiClient.post('/translations/ai-translate', { text });
  return res.data;
};

interface QualityResult {
  score: number;
  level: 'good' | 'average' | 'bad';
  comment: string | null;
}

const checkQuality = async (
  source: string,
  translation: string,
  locale: string,
): Promise<QualityResult> => {
  const res = await apiClient.post('/translations/ai-quality-check', { source, translation, locale });
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
  good:    { color: 'success', label: 'Good' },
  average: { color: 'warning', label: 'Below average' },
  bad:     { color: 'error',   label: 'Bad' },
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
      const { key, ...rest } = vals;
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
        {Object.values(qualityResults).some((r) => r.level !== 'good') && (
          <div style={{ marginTop: 8 }}>
            {Object.entries(qualityResults)
              .filter(([, r]) => r.level !== 'good' && r.comment)
              .map(([locale, r]) => (
                <Alert
                  key={locale}
                  type={r.level === 'bad' ? 'error' : 'warning'}
                  message={<><Tag>{locale}</Tag>{r.comment}</>}
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
      ellipsis: true,
      render: (_: unknown, record: Entry) => {
        const val = record.values[locale];
        return val
          ? <Tooltip title={val}><span style={{ color: val ? undefined : '#bbb' }}>{val}</span></Tooltip>
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

      {/* ── Table ── */}
      <Table<Entry>
        rowKey="key"
        columns={columns}
        dataSource={entriesData?.data ?? []}
        loading={entriesLoading}
        scroll={{ x: 'max-content' }}
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
    </div>
  );
};

export default TranslationsPage;
