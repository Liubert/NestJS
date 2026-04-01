import React from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Space,
  Spin,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { TextArea } = Input;
const { Text } = Typography;

interface AiConfig {
  id: string;
  model: string;
  translatePrompt: string;
  qualityTranslatePrompt: string;
  qualityLanguagePrompt: string;
  updatedAt: string;
}

const fetchConfig = async (): Promise<AiConfig> => {
  const res = await apiClient.get<AiConfig>('/translations/ai-config');
  return res.data;
};

const saveConfig = async (dto: Partial<AiConfig>): Promise<AiConfig> => {
  const res = await apiClient.post<AiConfig>('/translations/ai-config', dto);
  return res.data;
};

const resetConfig = async (): Promise<AiConfig> => {
  const res = await apiClient.post<AiConfig>('/translations/ai-config/reset');
  return res.data;
};

const PROMPT_VARS: Record<string, string[]> = {
  translatePrompt: ['{{text}}', '{{languages}}'],
  qualityTranslatePrompt: ['{{source}}', '{{translation}}', '{{locale}}'],
  qualityLanguagePrompt: ['{{translation}}', '{{locale}}'],
};

const AiConfigPage: React.FC = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: fetchConfig,
  });

  // Populate form when data loads
  React.useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['ai-config'], updated);
      message.success('Configuration saved');
    },
    onError: () => message.error('Failed to save'),
  });

  const resetMutation = useMutation({
    mutationFn: resetConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['ai-config'], updated);
      form.setFieldsValue(updated);
      message.success('Reset to defaults');
    },
    onError: () => message.error('Failed to reset'),
  });

  const onFinish = (values: AiConfig) => {
    saveMutation.mutate(values);
  };

  const busy = saveMutation.isPending || resetMutation.isPending;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>AI / Prompt Configuration</Typography.Title>
        {data && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Last updated: {new Date(data.updatedAt).toLocaleString()}
          </Text>
        )}
      </div>

      {isLoading ? (
        <Spin />
      ) : (
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Card size="small" title="Model" style={{ marginBottom: 16 }}>
            <Form.Item name="model" label="Model name" rules={[{ required: true }]}>
              <Input placeholder="gemini-2.0-flash" />
            </Form.Item>
          </Card>

          <Card
            size="small"
            title="AI Translation Generation Prompt"
            style={{ marginBottom: 16 }}
            extra={<VarHints vars={PROMPT_VARS.translatePrompt} />}
          >
            <Form.Item name="translatePrompt" rules={[{ required: true }]} noStyle>
              <TextArea rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
          </Card>

          <Card
            size="small"
            title="Translation Accuracy Check Prompt"
            style={{ marginBottom: 16 }}
            extra={<VarHints vars={PROMPT_VARS.qualityTranslatePrompt} />}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Used when a source text exists — checks whether the translation correctly conveys the original meaning.
            </Text>
            <Form.Item name="qualityTranslatePrompt" rules={[{ required: true }]} noStyle>
              <TextArea rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
          </Card>

          <Card
            size="small"
            title="Writing Quality Check Prompt"
            style={{ marginBottom: 16 }}
            extra={<VarHints vars={PROMPT_VARS.qualityLanguagePrompt} />}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Used when there is no source to compare against — checks spelling, grammar, and naturalness of the text (including the default/English locale).
            </Text>
            <Form.Item name="qualityLanguagePrompt" rules={[{ required: true }]} noStyle>
              <TextArea rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
          </Card>

          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saveMutation.isPending}
              disabled={busy}
            >
              Save
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={resetMutation.isPending}
              disabled={busy}
              onClick={() => resetMutation.mutate()}
            >
              Reset to defaults
            </Button>
          </Space>
        </Form>
      )}
    </div>
  );
};

const VarHints: React.FC<{ vars: string[] }> = ({ vars }) => (
  <Space size={4}>
    <Text type="secondary" style={{ fontSize: 11 }}>Variables:</Text>
    {vars.map((v) => (
      <Text key={v} code style={{ fontSize: 11 }}>{v}</Text>
    ))}
  </Space>
);

export default AiConfigPage;
