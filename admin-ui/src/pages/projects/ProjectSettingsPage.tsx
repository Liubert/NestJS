import React, { useState } from 'react';
import {
  Typography, Button, Tag, Space, Divider, Spin, Modal, Form, Input,
  Popconfirm, message, Breadcrumb,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, TranslationOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  locales: string[];
  namespaces: string[];
}

const fetchProjectDetails = async (slug: string): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

const ProjectSettingsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [localeForm] = Form.useForm();
  const [nsForm] = Form.useForm();
  const [localeModalOpen, setLocaleModalOpen] = useState(false);
  const [nsModalOpen, setNsModalOpen] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', slug],
    queryFn: () => fetchProjectDetails(slug!),
    enabled: !!slug,
  } as any);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['project', slug] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const addLocaleMutation = useMutation({
    mutationFn: (code: string) =>
      apiClient.post(`/translations/projects/${slug}/locales`, { code }),
    onSuccess: () => {
      message.success('Locale added');
      invalidate();
      setLocaleModalOpen(false);
      localeForm.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error adding locale'),
  });

  const removeLocaleMutation = useMutation({
    mutationFn: (code: string) =>
      apiClient.delete(`/translations/projects/${slug}/locales/${code}`),
    onSuccess: () => { message.success('Locale removed'); invalidate(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error removing locale'),
  });

  const addNsMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.post(`/translations/projects/${slug}/namespaces`, { slug: ns }),
    onSuccess: () => {
      message.success('Namespace added');
      invalidate();
      setNsModalOpen(false);
      nsForm.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error adding namespace'),
  });

  const removeNsMutation = useMutation({
    mutationFn: (ns: string) =>
      apiClient.delete(`/translations/projects/${slug}/namespaces/${ns}`),
    onSuccess: () => { message.success('Namespace removed'); invalidate(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error removing namespace'),
  });

  if (isLoading) return <Spin />;
  if (!project) return <Text type="danger">Project not found</Text>;

  const p = project as ProjectDetails;

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/projects">Projects</Link> },
          { title: p.name },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
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

      {/* ── Locales ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>Locales</Title>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setLocaleModalOpen(true)}>
            Add locale
          </Button>
        </div>
        <Space wrap>
          {p.locales.length === 0 && (
            <Text type="secondary">No locales yet — add at least one to start translating</Text>
          )}
          {p.locales.map((code) => (
            <Tag
              key={code}
              color="blue"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {code}
              <Popconfirm
                title={`Remove locale "${code}"? Existing translation values for this locale will be deleted.`}
                onConfirm={() => removeLocaleMutation.mutate(code)}
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

      {/* ── Namespaces ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>Namespaces</Title>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setNsModalOpen(true)}>
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

      {/* ── Add Locale Modal ── */}
      <Modal
        open={localeModalOpen}
        title="Add locale"
        onCancel={() => { setLocaleModalOpen(false); localeForm.resetFields(); }}
        onOk={() => localeForm.validateFields().then((v) => addLocaleMutation.mutate(v.code))}
        confirmLoading={addLocaleMutation.isPending}
        destroyOnClose
      >
        <Form form={localeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="code"
            label="Locale code"
            extra="e.g. en, uk, nb-NO, sv, da-DK"
            rules={[
              { required: true, message: 'Code is required' },
              {
                pattern: /^[a-z]{2,3}(-[A-Z]{2,4})?$/,
                message: 'Format: en, uk, nb-NO',
              },
            ]}
          >
            <Input placeholder="en" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Add Namespace Modal ── */}
      <Modal
        open={nsModalOpen}
        title="Add namespace"
        onCancel={() => { setNsModalOpen(false); nsForm.resetFields(); }}
        onOk={() => nsForm.validateFields().then((v) => addNsMutation.mutate(v.slug))}
        confirmLoading={addNsMutation.isPending}
        destroyOnClose
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
                message: 'Lowercase letters, digits, dashes only',
              },
            ]}
          >
            <Input placeholder="common" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectSettingsPage;
