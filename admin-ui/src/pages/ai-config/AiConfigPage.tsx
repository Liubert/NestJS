import React from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  message,
  Select,
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
  contextDetectionPrompt: string | null;
  updatedAt: string;
}

// Curated Gemini model list — Flash variants are fast and cheap;
// Pro variants offer more reasoning depth. Validation on Save prevents
// saving a model that isn't accessible with the current API key.
const MODEL_OPTIONS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (default — fast, balanced)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (newer generation, fast)' },
  { value: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro (most capable, slower)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (legacy — may require older API tier)' },
  { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro (legacy — may require older API tier)' },
];

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

const validateModelApi = async (model: string): Promise<void> => {
  await apiClient.post('/translations/ai-config/validate-model', { model });
};

const PROMPT_VARS: Record<string, string[]> = {
  translatePrompt: ['{{text}}', '{{languages}}'],
  qualityTranslatePrompt: ['{{source}}', '{{translation}}', '{{locale}}', '{{context}}'],
  qualityLanguagePrompt: ['{{translation}}', '{{locale}}', '{{context}}'],
};

const AiConfigPage: React.FC = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [validating, setValidating] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: fetchConfig,
  });

  React.useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['ai-config'], updated);
      message.success('Configuration saved');
      setValidationError(null);
    },
    onError: () => message.error('Failed to save'),
  });

  const resetMutation = useMutation({
    mutationFn: resetConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['ai-config'], updated);
      form.setFieldsValue(updated);
      message.success('Reset to defaults');
      setValidationError(null);
    },
    onError: () => message.error('Failed to reset'),
  });

  const onFinish = async (values: AiConfig) => {
    setValidationError(null);

    // Only validate if the model changed
    const currentModel = data?.model;
    if (values.model !== currentModel) {
      setValidating(true);
      try {
        await validateModelApi(values.model);
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Model returned an incompatible response format';
        setValidationError(typeof detail === 'string' ? detail : JSON.stringify(detail));
        setValidating(false);
        return;
      }
      setValidating(false);
    }

    saveMutation.mutate(values);
  };

  const busy = saveMutation.isPending || resetMutation.isPending || validating;

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
            <Form.Item name="model" label="Model" rules={[{ required: true }]}>
              <Select
                options={MODEL_OPTIONS}
                placeholder="Select a model"
                showSearch
                filterOption={(input, option) =>
                  (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            {validating && (
              <Space style={{ marginTop: 8 }}>
                <Spin size="small" />
                <Text type="secondary">Validating model compatibility…</Text>
              </Space>
            )}
            {validationError && (
              <Alert
                type="error"
                showIcon
                message="Model validation failed — model not saved"
                description={validationError}
                style={{ marginTop: 8 }}
              />
            )}
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

          <Card
            size="small"
            title="Context Detection Prompt"
            style={{ marginBottom: 16 }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Embedded in bulk quality evaluation. Controls how the AI decides whether a translation key needs context
              (e.g. ambiguous terms like "Save", "Train", "Light"). Keys marked as "context required" get a score cap
              when context is not provided. Leave empty to disable context detection entirely.
            </Text>
            <Form.Item name="contextDetectionPrompt" noStyle>
              <TextArea rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }}
                placeholder="Instructions for AI to determine which keys need context..." />
            </Form.Item>
          </Card>

          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saveMutation.isPending || validating}
              disabled={busy}
            >
              {validating ? 'Validating…' : 'Save'}
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
