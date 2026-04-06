import React, { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { TextArea } = Input;

const PromptPreview: React.FC = () => {
  const [form] = Form.useForm();
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const type = Form.useWatch('type', form) as string | undefined;

  const handlePreview = async () => {
    let values: Record<string, unknown>;
    try {
      values = (await form.validateFields()) as Record<string, unknown>;
    } catch {
      return;
    }

    let targetLocales: Record<string, string> | undefined;
    if (values.targetLocalesStr) {
      try {
        targetLocales = JSON.parse(values.targetLocalesStr as string) as Record<
          string,
          string
        >;
      } catch {
        void message.error('Invalid JSON in target locales');
        return;
      }
    }

    let localeSkill: Record<string, string> | undefined;
    if (values.localeSkillStr) {
      try {
        localeSkill = JSON.parse(values.localeSkillStr as string) as Record<
          string,
          string
        >;
      } catch {
        void message.error('Invalid JSON in locale skill');
        return;
      }
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        type: values.type,
        text: values.text,
        context: values.context || undefined,
        targetLocales: targetLocales || undefined,
        localeSkill: localeSkill || undefined,
      };

      if (values.type === 'quality') {
        body.translation = values.translation;
        body.locale = values.locale;
        body.mode = values.mode;
      }

      const response = await apiClient.post<{ prompt: string }>(
        '/translations/ai-preview-prompt',
        body,
      );
      setPrompt(response.data.prompt);
    } catch {
      void message.error('Failed to preview prompt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <Card size="small" title="Prompt Preview">
        <Form form={form} layout="vertical" initialValues={{ type: 'translate', mode: 'translation_quality' }}>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'translate', label: 'Translate' },
                { value: 'quality', label: 'Quality Check' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="text"
            label="Source Text"
            rules={[{ required: true, message: 'Source text is required' }]}
          >
            <TextArea rows={2} placeholder="Enter the English source text" />
          </Form.Item>

          {type === 'quality' && (
            <>
              <Form.Item name="translation" label="Translation">
                <TextArea rows={2} placeholder="Enter the translation to evaluate" />
              </Form.Item>

              <Form.Item name="locale" label="Locale">
                <Input placeholder="uk" />
              </Form.Item>

              <Form.Item name="mode" label="Mode">
                <Select
                  options={[
                    { value: 'translation_quality', label: 'Translation Quality' },
                    { value: 'language_quality', label: 'Language Quality' },
                  ]}
                />
              </Form.Item>
            </>
          )}

          {type === 'translate' && (
            <Form.Item name="targetLocalesStr" label="Target Locales (JSON)">
              <TextArea
                rows={2}
                placeholder='{"uk": "Ukrainian", "sv": "Swedish"}'
              />
            </Form.Item>
          )}

          <Form.Item name="localeSkillStr" label="Locale Skill (JSON, optional)">
            <TextArea
              rows={2}
              placeholder='{"uk": "Use informal tone", "sv": "Keep formal register"}'
            />
          </Form.Item>

          <Form.Item name="context" label="Context (optional)">
            <Input placeholder="Button label in checkout flow" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={handlePreview}
                loading={loading}
              >
                Preview Prompt
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {prompt && (
        <Card
          size="small"
          title={<Typography.Text>Generated Prompt</Typography.Text>}
          style={{ marginTop: 16 }}
        >
          <TextArea
            value={prompt}
            readOnly
            rows={20}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Card>
      )}
    </div>
  );
};

export default PromptPreview;
