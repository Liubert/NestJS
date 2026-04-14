import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useSupportedLocales } from '../../hooks/useSupportedLocales';

const { Title } = Typography;

interface Project {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

const fetchProjects = async (): Promise<Project[]> => {
  const res = await apiClient.get('/translations/projects?limit=200');
  return res.data.data;
};

const createProject = async (dto: {
  slug: string;
  name: string;
  namespaces: string[];
  locales: string[];
}): Promise<Project> => {
  const res = await apiClient.post('/translations/projects', dto);
  return res.data;
};

const deleteProject = async (slug: string): Promise<void> => {
  await apiClient.delete(`/translations/projects/${slug}`);
};

const ProjectsPage: React.FC = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: supportedLocales = [] } = useSupportedLocales();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  } as any);

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      message.success('Project created');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error creating project'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      message.success('Project deleted');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error deleting project'),
  });

  const handleCreate = () => {
    form.validateFields().then((vals) => {
      createMutation.mutate({
        slug: vals.slug,
        name: vals.name || vals.slug,
        namespaces: vals.namespaces,
        locales: vals.locales,
      });
    });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    form.setFieldValue('slug', slug);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (slug: string) => <code>{slug}</code>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Project) => (
        <Popconfirm
          title="Delete this project and all its translations?"
          onConfirm={(e) => {
            e?.stopPropagation();
            deleteMutation.mutate(record.slug);
          }}
          onCancel={(e) => e?.stopPropagation()}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Projects
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          New project
        </Button>
      </div>

      <style>{`.clickable-row { cursor: pointer; } .clickable-row:hover td { background: #e6f4ff !important; }`}</style>
      <Table
        rowKey="slug"
        columns={columns}
        dataSource={projects as Project[]}
        loading={isLoading}
        size="small"
        pagination={false}
        onRow={(record) => ({
          onClick: () => navigate(`/projects/${record.slug}`),
          className: 'clickable-row',
        })}
      />

      <Modal
        open={modalOpen}
        title="Create project"
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="My Project" onChange={handleNameChange} />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug"
            extra="Lowercase letters, digits, and dashes. Used in API URLs."
            rules={[
              { required: true, message: 'Slug is required' },
              {
                pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
                message:
                  'Lowercase letters, digits, dashes only (no leading/trailing dash)',
              },
            ]}
          >
            <Input placeholder="my-project" />
          </Form.Item>
          <Form.Item
            name="locales"
            label="Translation languages"
            extra="Select languages for translation. English (en) is always the source."
            rules={[
              {
                required: true,
                message: 'At least one target language is required',
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder="Select languages..."
              optionFilterProp="label"
              options={supportedLocales
                .filter((l) => l.code !== 'en')
                .map((l) => ({
                  value: l.code,
                  label: `${l.flag} ${l.name} (${l.code})`,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="namespaces"
            label="Namespaces"
            extra="Pre-filled with common defaults. You can add or remove."
            initialValue={['frontend', 'backend']}
            rules={[
              {
                required: true,
                message: 'At least one namespace is required',
              },
            ]}
          >
            <Select
              mode="tags"
              placeholder="common"
              tokenSeparators={[',', ' ']}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
