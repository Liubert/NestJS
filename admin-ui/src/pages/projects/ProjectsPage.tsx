import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Popconfirm,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

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
      createMutation.mutate({ slug: vals.slug, name: vals.name || vals.slug });
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
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
