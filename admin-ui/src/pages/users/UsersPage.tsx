import React, { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space,
  Popconfirm, Typography, message, Tag,
} from 'antd';
import { PlusOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { Title, Text } = Typography;

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: 'user' | 'admin' | 'guest';
  mustChangePassword: boolean;
  createdAt: string;
}

const fetchUsers = async (): Promise<User[]> => {
  const res = await apiClient.get('/users');
  return res.data;
};

const createUser = async (dto: {
  email: string;
  password: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}) => {
  const res = await apiClient.post('/users', dto);
  return res.data;
};

const deleteUser = async (id: string): Promise<void> => {
  await apiClient.delete(`/users/${id}`);
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  user: 'blue',
  guest: 'default',
};

const UsersPage: React.FC = () => {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  } as any);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      message.success('User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error creating user'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      message.success('User deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error deleting user'),
  });

  const handleCreate = () => {
    form.validateFields().then((vals) => {
      createMutation.mutate(vals);
    });
  };

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: User) => [r.firstName, r.lastName].filter(Boolean).join(' ') || '—',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <Tag color={ROLE_COLORS[role] ?? 'default'}>{role}</Tag>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, r: User) =>
        r.mustChangePassword ? (
          <Tag icon={<KeyOutlined />} color="warning">Must change password</Tag>
        ) : null,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: User) => (
        <Popconfirm
          title={`Delete user ${record.email}?`}
          onConfirm={() => deleteMutation.mutate(record.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
          disabled={record.id === currentUser.id}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={record.id === currentUser.id}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Users</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Create user
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users as User[]}
        loading={isLoading}
        size="small"
        pagination={false}
      />

      <Modal
        open={modalOpen}
        title="Create user"
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          User will be required to change their password on first login.
        </Text>
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Initial password"
            rules={[
              { required: true, message: 'Password is required' },
              { min: 8, message: 'At least 8 characters' },
            ]}
          >
            <Input.Password placeholder="Min. 8 characters" />
          </Form.Item>
          <Form.Item name="firstName" label="First name">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="lastName" label="Last name">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="user">
            <Select options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersPage;
