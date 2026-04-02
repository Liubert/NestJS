import React, { useState } from 'react';
import {
  Typography,
  Button,
  Tag,
  Space,
  Divider,
  Spin,
  Modal,
  Form,
  Input,
  Switch,
  Select,
  Popconfirm,
  message,
  Breadcrumb,
  Table,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  TranslationOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_BY_CODE,
  getFlagForCode,
} from '../../constants/supported-languages';

const { Title, Text } = Typography;

interface LocaleEntry {
  code: string;
  isDefault: boolean;
  aliases: string[];
}

interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  createdAt: string;
  locales: LocaleEntry[];
  namespaces: string[];
  autoTranslateEnabled: boolean;
}

interface MemberRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: 'owner' | 'member';
}

const fetchProjectDetails = async (slug: string): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

const fetchMembers = async (slug: string): Promise<MemberRow[]> => {
  const res = await apiClient.get(`/translations/projects/${slug}/members`);
  return res.data;
};

// ─── AI Usage Section ─────────────────────────────────────────────────────

interface AiUsageBreakdown {
  operation: string;
  totalTokens: number;
  callCount: number;
}

interface AiUsageData {
  totalTokens: number;
  breakdown: AiUsageBreakdown[];
}

const OPERATION_LABELS: Record<string, string> = {
  translate: 'Translation',
  quality_check: 'Quality Check',
  auto_translate: 'Auto-Translate',
};

const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const AiUsageSection: React.FC<{ slug: string }> = ({ slug }) => {
  const { data, isLoading } = useQuery<AiUsageData>({
    queryKey: ['ai-usage', slug],
    queryFn: async () => {
      const res = await apiClient.get(
        `/translations/projects/${slug}/ai-usage`,
      );
      return res.data;
    },
    enabled: !!slug,
  });

  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={5} style={{ margin: 0, marginBottom: 12 }}>
        AI Token Usage
      </Title>
      {isLoading ? (
        <Spin size="small" />
      ) : !data || data.totalTokens === 0 ? (
        <Text type="secondary">No AI usage recorded yet.</Text>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 20 }}>
              {formatTokens(data.totalTokens)}
            </Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              total tokens
            </Text>
          </div>
          <Table<AiUsageBreakdown>
            rowKey="operation"
            dataSource={data.breakdown}
            size="small"
            pagination={false}
            style={{ maxWidth: 500 }}
            columns={[
              {
                title: 'Operation',
                dataIndex: 'operation',
                key: 'operation',
                render: (op: string) => OPERATION_LABELS[op] ?? op,
              },
              {
                title: 'Tokens',
                dataIndex: 'totalTokens',
                key: 'totalTokens',
                width: 120,
                render: (v: number) => formatTokens(v),
              },
              {
                title: 'Calls',
                dataIndex: 'callCount',
                key: 'callCount',
                width: 80,
              },
            ]}
          />
        </>
      )}
    </div>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────

const ProjectSettingsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [localeForm] = Form.useForm();
  const [nsForm] = Form.useForm();
  const [memberForm] = Form.useForm();
  const [editLocaleForm] = Form.useForm();
  const [editNsForm] = Form.useForm();
  const [localeModalOpen, setLocaleModalOpen] = useState(false);
  const [nsModalOpen, setNsModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editLocaleModalOpen, setEditLocaleModalOpen] = useState(false);
  const [editLocaleCode, setEditLocaleCode] = useState('');
  const [editNsModalOpen, setEditNsModalOpen] = useState(false);
  const [editNsSlug, setEditNsSlug] = useState('');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', slug],
    queryFn: () => fetchProjectDetails(slug!),
    enabled: !!slug,
  } as any);

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', slug],
    queryFn: () => fetchMembers(slug!),
    enabled: !!slug,
  } as any);

  const invalidateProject = () => {
    qc.invalidateQueries({ queryKey: ['project', slug] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const invalidateMembers = () => {
    qc.invalidateQueries({ queryKey: ['project-members', slug] });
  };

  const addLocaleMutation = useMutation({
    mutationFn: (vals: { code: string; aliases?: string[] }) =>
      apiClient.post(`/translations/projects/${slug}/locales`, vals),
    onSuccess: () => {
      message.success('Locale added');
      invalidateProject();
      setLocaleModalOpen(false);
      localeForm.resetFields();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error adding locale'),
  });

  const updateLocaleMutation = useMutation({
    mutationFn: ({ code, aliases }: { code: string; aliases: string[] }) =>
      apiClient.patch(`/translations/projects/${slug}/locales/${code}`, {
        aliases,
      }),
    onSuccess: () => {
      message.success('Locale updated');
      invalidateProject();
      setEditLocaleModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error updating locale'),
  });

  const updateNsMutation = useMutation({
    mutationFn: ({ oldSlug, newSlug }: { oldSlug: string; newSlug: string }) =>
      apiClient.patch(`/translations/projects/${slug}/namespaces/${oldSlug}`, {
        slug: newSlug,
      }),
    onSuccess: () => {
      message.success('Namespace renamed');
      invalidateProject();
      setEditNsModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error renaming namespace'),
  });

  const removeLocaleMutation = useMutation({
    mutationFn: (code: string) =>
      apiClient.delete(`/translations/projects/${slug}/locales/${code}`),
    onSuccess: () => {
      message.success('Locale removed');
      invalidateProject();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error removing locale'),
  });

  const addNsMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.post(`/translations/projects/${slug}/namespaces`, { slug: ns }),
    onSuccess: () => {
      message.success('Namespace added');
      invalidateProject();
      setNsModalOpen(false);
      nsForm.resetFields();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error adding namespace'),
  });

  const removeNsMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.delete(`/translations/projects/${slug}/namespaces/${ns}`),
    onSuccess: () => {
      message.success('Namespace removed');
      invalidateProject();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error removing namespace'),
  });

  const addMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiClient.post(`/translations/projects/${slug}/members`, { email }),
    onSuccess: () => {
      message.success('Member added');
      invalidateMembers();
      setMemberModalOpen(false);
      memberForm.resetFields();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error adding member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/translations/projects/${slug}/members/${userId}`),
    onSuccess: () => {
      message.success('Member removed');
      invalidateMembers();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error removing member'),
  });

  if (isLoading) return <Spin />;
  if (!project) return <Text type="danger">Project not found</Text>;

  const p = project as ProjectDetails;
  const memberList = members as MemberRow[];

  const memberColumns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: MemberRow) =>
        [r.firstName, r.lastName].filter(Boolean).join(' ') || '—',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'owner' ? 'gold' : 'blue'}>{role}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: MemberRow) =>
        record.role === 'owner' ? null : (
          <Popconfirm
            title={`Remove ${record.email} from this project?`}
            onConfirm={() => removeMemberMutation.mutate(record.userId)}
            okText="Remove"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/projects">Projects</Link> },
          { title: p.name },
        ]}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          {p.name}{' '}
          <Text type="secondary" style={{ fontSize: 14, fontWeight: 'normal' }}>
            /{p.slug}
          </Text>
        </Title>
        <Button
          icon={<TranslationOutlined />}
          onClick={() => navigate('/translations')}
        >
          Open in Translations
        </Button>
      </div>

      {/* ── Auto-Translation ── */}
      <div style={{ marginBottom: 32 }}>
        <Title level={5} style={{ margin: 0, marginBottom: 12 }}>
          Auto-Translation
        </Title>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <Switch
            checked={project?.autoTranslateEnabled ?? false}
            onChange={async (checked) => {
              try {
                await apiClient.patch(
                  `/translations/projects/${slug}/sandbox/settings`,
                  { autoTranslateEnabled: checked },
                );
                qc.invalidateQueries({ queryKey: ['project', slug] });
                message.success(
                  checked
                    ? 'Auto-translation enabled'
                    : 'Auto-translation disabled',
                );
              } catch {
                message.error('Failed to update setting');
              }
            }}
          />
          <Text strong>
            {project?.autoTranslateEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="When enabled, the system continuously checks for missing translations and automatically generates them using AI. Auto-generated translations are created in sandbox only and must be manually reviewed and pushed to production."
          style={{ maxWidth: 600 }}
        />
      </div>

      {/* ── AI Token Usage ── */}
      <AiUsageSection slug={slug!} />

      <Divider />

      {/* ── Locales ── */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            Locales
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setLocaleModalOpen(true)}
          >
            Add locale
          </Button>
        </div>
        <Space wrap>
          {p.locales.length === 0 && (
            <Text type="secondary">
              No locales yet — add at least one to start translating
            </Text>
          )}
          {p.locales.map(({ code, isDefault, aliases }) => {
            const flag = getFlagForCode(code);
            const lang = LANGUAGE_BY_CODE[code];
            return (
              <Tag
                key={code}
                color="blue"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {flag && <span>{flag}</span>}
                {lang ? `${lang.name} (${code})` : code}
                {isDefault ? ' — default' : ''}
                {aliases?.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    [{aliases.join(', ')}]
                  </Text>
                )}
                <EditOutlined
                  style={{ cursor: 'pointer', fontSize: 10 }}
                  onClick={() => {
                    setEditLocaleCode(code);
                    editLocaleForm.setFieldsValue({ aliases: aliases || [] });
                    setEditLocaleModalOpen(true);
                  }}
                />
                {!isDefault && (
                  <Popconfirm
                    title={`Remove locale "${code}"? Existing translation values will be deleted.`}
                    onConfirm={() => removeLocaleMutation.mutate(code)}
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                  >
                    <DeleteOutlined
                      style={{ cursor: 'pointer', fontSize: 10 }}
                    />
                  </Popconfirm>
                )}
              </Tag>
            );
          })}
        </Space>
      </div>

      <Divider />

      {/* ── Namespaces ── */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            Namespaces
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setNsModalOpen(true)}
          >
            Add namespace
          </Button>
        </div>
        <Space wrap>
          {p.namespaces.length === 0 && (
            <Text type="secondary">No namespaces yet</Text>
          )}
          {p.namespaces.map((ns) => (
            <Tag
              key={ns}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {ns}
              <EditOutlined
                style={{ cursor: 'pointer', fontSize: 10 }}
                onClick={() => {
                  setEditNsSlug(ns);
                  editNsForm.setFieldsValue({ slug: ns });
                  setEditNsModalOpen(true);
                }}
              />
              <Popconfirm
                title={`Remove namespace "${ns}" and all its translation keys?`}
                onConfirm={() => removeNsMutation.mutate(ns)}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <DeleteOutlined style={{ cursor: 'pointer', fontSize: 10 }} />
              </Popconfirm>
            </Tag>
          ))}
        </Space>
      </div>

      <Divider />

      {/* ── Members ── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            Members
          </Title>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setMemberModalOpen(true)}
          >
            Add member
          </Button>
        </div>
        <Table
          rowKey="userId"
          size="small"
          columns={memberColumns}
          dataSource={memberList}
          pagination={false}
          style={{ maxWidth: 600 }}
        />
      </div>

      {/* ── Modals ── */}
      <Modal
        open={localeModalOpen}
        title="Add locale"
        onCancel={() => {
          setLocaleModalOpen(false);
          localeForm.resetFields();
        }}
        onOk={() =>
          localeForm.validateFields().then((v) => {
            const lang = LANGUAGE_BY_CODE[v.code];
            addLocaleMutation.mutate({
              code: v.code,
              aliases: v.aliases ?? lang?.aliases ?? [],
            });
          })
        }
        confirmLoading={addLocaleMutation.isPending}
        destroyOnHidden
      >
        <Form form={localeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="code"
            label="Language"
            rules={[{ required: true, message: 'Select a language' }]}
          >
            <Select
              showSearch
              placeholder="Select language"
              optionFilterProp="label"
              onChange={(code: string) => {
                const lang = LANGUAGE_BY_CODE[code];
                if (lang) localeForm.setFieldsValue({ aliases: lang.aliases });
              }}
              options={SUPPORTED_LANGUAGES.map((l) => {
                const alreadyAdded = p.locales.some(
                  (loc) => loc.code === l.code,
                );
                return {
                  value: l.code,
                  label: `${l.flag} ${l.name} (${l.code})`,
                  disabled: alreadyAdded,
                };
              })}
            />
          </Form.Item>
          <Form.Item
            name="aliases"
            label="Aliases"
            extra="Alternative locale codes that map to this language"
          >
            <Select mode="tags" placeholder="e.g. en-US, en-GB" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit locale aliases modal */}
      <Modal
        open={editLocaleModalOpen}
        title={`Edit locale: ${editLocaleCode}`}
        onCancel={() => {
          setEditLocaleModalOpen(false);
          editLocaleForm.resetFields();
        }}
        onOk={() =>
          editLocaleForm.validateFields().then((v) =>
            updateLocaleMutation.mutate({
              code: editLocaleCode,
              aliases: v.aliases ?? [],
            }),
          )
        }
        confirmLoading={updateLocaleMutation.isPending}
        destroyOnHidden
      >
        <Form form={editLocaleForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="aliases"
            label="Aliases"
            extra="Alternative locale codes that map to this language"
          >
            <Select mode="tags" placeholder="e.g. en-US, en-GB" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={nsModalOpen}
        title="Add namespace"
        onCancel={() => {
          setNsModalOpen(false);
          nsForm.resetFields();
        }}
        onOk={() =>
          nsForm.validateFields().then((v) => addNsMutation.mutate(v.slug))
        }
        confirmLoading={addNsMutation.isPending}
        destroyOnHidden
      >
        <Form form={nsForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="slug"
            label="Namespace slug"
            extra="e.g. common, backoffice-translations"
            rules={[
              { required: true, message: 'Slug is required' },
              {
                pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
                message: 'Lowercase, digits, dashes',
              },
            ]}
          >
            <Input placeholder="common" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit namespace modal */}
      <Modal
        open={editNsModalOpen}
        title={`Rename namespace: ${editNsSlug}`}
        onCancel={() => {
          setEditNsModalOpen(false);
          editNsForm.resetFields();
        }}
        onOk={() =>
          editNsForm
            .validateFields()
            .then((v) =>
              updateNsMutation.mutate({ oldSlug: editNsSlug, newSlug: v.slug }),
            )
        }
        confirmLoading={updateNsMutation.isPending}
        destroyOnHidden
      >
        <Form form={editNsForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="slug"
            label="New namespace slug"
            rules={[
              { required: true, message: 'Slug is required' },
              {
                pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
                message: 'Lowercase, digits, dashes',
              },
            ]}
          >
            <Input placeholder="common" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={memberModalOpen}
        title="Add member"
        onCancel={() => {
          setMemberModalOpen(false);
          memberForm.resetFields();
        }}
        onOk={() =>
          memberForm
            .validateFields()
            .then((v) => addMemberMutation.mutate(v.email))
        }
        confirmLoading={addMemberMutation.isPending}
        destroyOnHidden
      >
        <Form form={memberForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            label="User email"
            extra="The user must already exist in the system."
            rules={[
              {
                required: true,
                type: 'email',
                message: 'Valid email required',
              },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectSettingsPage;
