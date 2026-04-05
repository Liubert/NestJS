import React, { useState } from 'react';
import {
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Input,
  Form,
  Alert,
  Typography,
  Popconfirm,
  message,
} from 'antd';
import { KeyOutlined, PlusOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { Text, Paragraph } = Typography;

interface McpToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface GenerateTokenResponse {
  token: string;
  id: string;
  name: string;
  createdAt: string;
}

async function fetchTokens(): Promise<McpToken[]> {
  const res = await apiClient.get<McpToken[]>('/mcp-tokens');
  return res.data;
}

async function generateToken(name: string): Promise<GenerateTokenResponse> {
  const res = await apiClient.post<GenerateTokenResponse>('/mcp-tokens', { name });
  return res.data;
}

async function revokeToken(id: string): Promise<void> {
  await apiClient.delete(`/mcp-tokens/${id}`);
}

export default function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [newTokenResult, setNewTokenResult] = useState<GenerateTokenResponse | null>(null);
  const [form] = Form.useForm();

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: fetchTokens,
  });

  const generateMutation = useMutation({
    mutationFn: generateToken,
    onSuccess: (data) => {
      setGenerateOpen(false);
      form.resetFields();
      setNewTokenResult(data);
      queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
    onError: () => {
      message.error('Failed to generate token');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeToken,
    onSuccess: () => {
      message.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
    onError: () => {
      message.error('Failed to revoke token');
    },
  });

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <KeyOutlined style={{ color: '#1677ff' }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, record: McpToken) =>
        record.revokedAt ? (
          <Tag color="red">Revoked</Tag>
        ) : (
          <Tag color="green">Active</Tag>
        ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Last used',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: McpToken) =>
        !record.revokedAt ? (
          <Popconfirm
            title="Revoke this token?"
            description="Any agent using this token will immediately lose access."
            onConfirm={() => revokeMutation.mutate(record.id)}
            okText="Revoke"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={revokeMutation.isPending && revokeMutation.variables === record.id}
            >
              Revoke
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 18 }}>API Tokens</Text>
          <div>
            <Text type="secondary">
              MCP tokens let AI agents authenticate with the localization API. Treat them like passwords.
            </Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
          Generate token
        </Button>
      </div>

      <Table
        dataSource={tokens}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
      />

      {/* Generate token modal */}
      <Modal
        title="Generate new API token"
        open={generateOpen}
        onCancel={() => { setGenerateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={generateMutation.isPending}
        okText="Generate"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => generateMutation.mutate(values.name)}
        >
          <Form.Item
            name="name"
            label="Token name"
            rules={[
              { required: true, message: 'Enter a name for this token' },
              { max: 100, message: 'Max 100 characters' },
            ]}
          >
            <Input placeholder="e.g. dev-laptop, ci-agent" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      {/* Show token once after generation */}
      <Modal
        title="Token generated"
        open={!!newTokenResult}
        onCancel={() => setNewTokenResult(null)}
        width={620}
        footer={
          <Button type="primary" onClick={() => setNewTokenResult(null)}>
            Done
          </Button>
        }
      >
        <Alert
          type="warning"
          message="Copy this token now — it won't be shown again."
          style={{ marginBottom: 20 }}
        />

        {/* Mac / Linux / Windows — single npx command */}
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Mac / Linux / Windows:</Text>
        <Paragraph
          copyable={{
            text: `claude mcp add -s user localization -e MCP_TOKEN=${newTokenResult?.token} -e BACKEND_URL=${import.meta.env.VITE_BACKEND_URL ?? window.location.origin} -- npx -y localization-mcp-server`,
            icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />],
            tooltips: ['Copy', 'Copied!'],
          }}
          style={{
            background: '#f5f5f5',
            padding: '10px 12px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 12,
            wordBreak: 'break-all',
            marginBottom: 8,
          }}
        >
          {`claude mcp add -s user localization -e MCP_TOKEN=${newTokenResult?.token} -e BACKEND_URL=${import.meta.env.VITE_BACKEND_URL ?? window.location.origin} -- npx -y localization-mcp-server`}
        </Paragraph>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 20 }}>
          Installs the server automatically if not present. Requires the package to be published to npm.
        </Text>

        {/* Raw token */}
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Raw token:</Text>
        <Paragraph
          copyable={{
            text: newTokenResult?.token,
            icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />],
            tooltips: ['Copy', 'Copied!'],
          }}
          style={{
            background: '#f5f5f5',
            padding: '10px 12px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 12,
            wordBreak: 'break-all',
            marginBottom: 8,
          }}
        >
          {newTokenResult?.token}
        </Paragraph>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Replace <code>/path/to/mcp-server</code> with the actual path to your MCP server directory.
        </Text>
      </Modal>
    </div>
  );
}
