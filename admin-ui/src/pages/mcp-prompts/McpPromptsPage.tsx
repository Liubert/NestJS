import React, { useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Input,
  message,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { HistoryOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { TextArea } = Input;
const { Text } = Typography;

interface PromptItem {
  key: string;
  description: string;
  defaultContent: string;
  hasOverride: boolean;
  content: string | null;
  version: number | null;
  createdAt: string | null;
}

interface HistoryItem {
  id: string;
  version: number;
  content: string;
  createdAt: string;
  updatedByName: string | null;
}

const fetchPrompts = async (): Promise<PromptItem[]> => {
  const res = await apiClient.get<PromptItem[]>('/mcp-prompts');
  return res.data;
};

const savePrompt = async ({ key, content }: { key: string; content: string }): Promise<PromptItem> => {
  const res = await apiClient.put<PromptItem>(`/mcp-prompts/${key}`, { content });
  return res.data;
};

const resetPrompt = async (key: string): Promise<void> => {
  await apiClient.post(`/mcp-prompts/${key}/reset`);
};

const fetchHistory = async (key: string): Promise<HistoryItem[]> => {
  const res = await apiClient.get<HistoryItem[]>(`/mcp-prompts/${key}/history`);
  return res.data;
};

const restoreVersion = async ({ key, version }: { key: string; version: number }): Promise<PromptItem> => {
  const res = await apiClient.post<PromptItem>(`/mcp-prompts/${key}/restore/${version}`);
  return res.data;
};

const McpPromptsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [historyDrawer, setHistoryDrawer] = useState<{ open: boolean; key: string | null }>({
    open: false,
    key: null,
  });

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['mcp-prompts'],
    queryFn: fetchPrompts,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['mcp-prompts-history', historyDrawer.key],
    queryFn: () => fetchHistory(historyDrawer.key!),
    enabled: !!historyDrawer.key,
  });

  const saveMutation = useMutation({
    mutationFn: savePrompt,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-prompts'] });
      message.success('Prompt saved');
    },
    onError: () => message.error('Failed to save prompt'),
  });

  const resetMutation = useMutation({
    mutationFn: resetPrompt,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-prompts'] });
      message.success('Reset to code default');
    },
    onError: () => message.error('Failed to reset prompt'),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreVersion,
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-prompts'] });
      void queryClient.invalidateQueries({ queryKey: ['mcp-prompts-history', historyDrawer.key] });
      setHistoryDrawer({ open: false, key: null });
      message.success(`Restored to version ${updated.version}`);
    },
    onError: () => message.error('Failed to restore version'),
  });

  const getTextAreaValue = (prompt: PromptItem): string => {
    if (editContent[prompt.key] !== undefined) return editContent[prompt.key];
    return prompt.content ?? prompt.defaultContent;
  };

  const historyColumns = [
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 80,
    },
    {
      title: 'Updated by',
      dataIndex: 'updatedByName',
      key: 'updatedByName',
      width: 140,
      render: (name: string | null) => name ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val: string) => new Date(val).toLocaleString(),
    },
    {
      title: 'Preview',
      dataIndex: 'content',
      key: 'content',
      render: (content: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {content.slice(0, 100)}{content.length > 100 ? '…' : ''}
        </Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, record: HistoryItem) => (
        <Button
          size="small"
          onClick={() =>
            restoreMutation.mutate({ key: historyDrawer.key!, version: record.version })
          }
          loading={restoreMutation.isPending}
        >
          Restore
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>MCP Prompts</Typography.Title>
        <Text type="secondary">
          Override the built-in MCP prompt templates stored in the database. Changes take effect within 60 seconds.
        </Text>
      </div>

      {isLoading ? (
        <Spin />
      ) : (
        (prompts ?? []).map((prompt) => {
          const busy = saveMutation.isPending || resetMutation.isPending;
          const currentValue = getTextAreaValue(prompt);
          const isDirty = editContent[prompt.key] !== undefined;

          return (
            <Card
              key={prompt.key}
              size="small"
              title={<Text strong style={{ fontFamily: 'monospace' }}>{prompt.key}</Text>}
              extra={
                <Space>
                  {prompt.hasOverride ? (
                    <Tag color="blue">DB override</Tag>
                  ) : (
                    <Tag color="default">Code default</Tag>
                  )}
                  {prompt.createdAt && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Updated: {new Date(prompt.createdAt).toLocaleString()}
                    </Text>
                  )}
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                {prompt.description}
              </Text>
              {!prompt.hasOverride && !isDirty && (
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  No override — using built-in code default. Type to create one.
                </Text>
              )}
              <TextArea
                value={currentValue}
                onChange={(e) =>
                  setEditContent((prev) => ({ ...prev, [prompt.key]: e.target.value }))
                }
                rows={14}
                style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}
              />
              <Space>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saveMutation.isPending && saveMutation.variables?.key === prompt.key}
                  disabled={busy || !isDirty}
                  onClick={() => {
                    saveMutation.mutate(
                      { key: prompt.key, content: currentValue },
                      {
                        onSuccess: () =>
                          setEditContent((prev) => {
                            const next = { ...prev };
                            delete next[prompt.key];
                            return next;
                          }),
                      },
                    );
                  }}
                >
                  Save
                </Button>
                {prompt.hasOverride && (
                  <>
                    <Popconfirm
                      title="Reset to code default?"
                      description="This will remove the DB override and use the built-in default."
                      onConfirm={() => resetMutation.mutate(prompt.key)}
                      okText="Reset"
                      cancelText="Cancel"
                    >
                      <Button
                        icon={<ReloadOutlined />}
                        loading={resetMutation.isPending && resetMutation.variables === prompt.key}
                        disabled={busy}
                        danger
                      >
                        Reset to default
                      </Button>
                    </Popconfirm>
                    <Button
                      icon={<HistoryOutlined />}
                      disabled={busy}
                      onClick={() => setHistoryDrawer({ open: true, key: prompt.key })}
                    >
                      View history
                    </Button>
                  </>
                )}
              </Space>
            </Card>
          );
        })
      )}

      <Drawer
        title={
          historyDrawer.key
            ? `History: ${historyDrawer.key}`
            : 'History'
        }
        open={historyDrawer.open}
        onClose={() => setHistoryDrawer({ open: false, key: null })}
        width={800}
        destroyOnClose
      >
        {historyLoading ? (
          <Spin />
        ) : (
          <Table<HistoryItem>
            dataSource={historyData ?? []}
            columns={historyColumns}
            rowKey="id"
            size="small"
            pagination={false}
          />
        )}
      </Drawer>
    </div>
  );
};

export { McpPromptsPage };
