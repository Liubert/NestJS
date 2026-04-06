import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Form, Input, Select, Spin, Typography, message } from 'antd';
import apiClient from '../../api/client';
import { useSupportedLocales } from '../../hooks/useSupportedLocales';

const { TextArea } = Input;

const PromptPreview: React.FC = () => {
  const [form] = Form.useForm();
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { data: supportedLocales = [] } = useSupportedLocales();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const type = Form.useWatch('type', form) as string | undefined;
  const selectedLocales = Form.useWatch('locales', form) as string[] | undefined;
  const selectedLocale = Form.useWatch('locale', form) as string | undefined;

  const handlePreview = useCallback(async () => {
    const values = form.getFieldsValue() as Record<string, unknown>;
    if (!values.text) return;

    const buildLocaleSkill = (codes: string[]) => {
      const result: Record<string, string> = {};
      for (const code of codes) {
        const entry = supportedLocales.find((l) => l.code === code);
        if (entry?.localeSkill) {
          result[code] = Array.isArray(entry.localeSkill)
            ? (entry.localeSkill as string[]).join('\n')
            : entry.localeSkill;
        }
      }
      return Object.keys(result).length ? result : undefined;
    };

    const body: Record<string, unknown> = {
      type: values.type,
      text: values.text,
      context: values.context || undefined,
    };

    if (values.type === 'translate') {
      const codes = (values.locales as string[] | undefined) ?? [];
      const targetLocales = Object.fromEntries(
        codes.map((code) => {
          const entry = supportedLocales.find((l) => l.code === code);
          return [code, entry?.name ?? code];
        }),
      );
      body.targetLocales = Object.keys(targetLocales).length ? targetLocales : undefined;
      body.localeSkill = buildLocaleSkill(codes);
    } else {
      const locale = values.locale as string | undefined;
      body.locale = locale;
      body.translation = values.translation;
      body.mode = values.mode;
      body.localeSkill = locale ? buildLocaleSkill([locale]) : undefined;
    }

    setLoading(true);
    try {
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
  }, [form, supportedLocales]);

  const schedulePreview = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void handlePreview(), 600);
  }, [handlePreview]);

  // Auto-preview when locales load
  useEffect(() => {
    if (!supportedLocales.length) return;
    void handlePreview();
  }, [supportedLocales, handlePreview]);

  const localeOptions = supportedLocales.map((l) => ({
    value: l.code,
    label: `${l.flag} ${l.name} (${l.code})`,
  }));

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 220px)', minHeight: 500 }}>
      {/* Left: Form 40% */}
      <div style={{ flex: '0 0 40%', overflowY: 'auto' }}>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={schedulePreview}
          initialValues={{
            type: 'translate',
            locales: ['uk', 'de'],
            text: 'Save changes',
            context: 'Button label in settings page',
            translation: 'Зберегти зміни',
            locale: 'uk',
            mode: 'translation_quality',
          }}
        >
          <Form.Item name="type" label="Type">
            <Select
              options={[
                { value: 'translate', label: 'Translate' },
                { value: 'quality', label: 'Quality Check' },
              ]}
            />
          </Form.Item>

          <Form.Item name="text" label="Source Text">
            <Input />
          </Form.Item>

          {type === 'translate' && (
            <Form.Item name="locales" label="Target Locales">
              <Select mode="multiple" options={localeOptions} optionFilterProp="label" />
            </Form.Item>
          )}

          {type === 'quality' && (
            <>
              <Form.Item name="locale" label="Locale">
                <Select showSearch options={localeOptions} optionFilterProp="label" />
              </Form.Item>
              <Form.Item name="translation" label="Translation">
                <Input />
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

          <Form.Item name="context" label="Context">
            <Input />
          </Form.Item>
        </Form>

        {/* Skill preview (read-only info) */}
        {type === 'translate' && selectedLocales?.length ? (
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Skills applied:
            </Typography.Text>
            {selectedLocales.map((code) => {
              const entry = supportedLocales.find((l) => l.code === code);
              const skill = entry?.localeSkill
                ? Array.isArray(entry.localeSkill)
                  ? (entry.localeSkill as string[]).join('\n')
                  : entry.localeSkill
                : null;
              return skill ? (
                <div key={code} style={{ marginTop: 6 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {entry?.flag} {code}
                  </Typography.Text>
                  <pre
                    style={{
                      fontSize: 11,
                      background: '#f5f5f5',
                      padding: '4px 8px',
                      borderRadius: 4,
                      margin: '2px 0 0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {skill}
                  </pre>
                </div>
              ) : null;
            })}
          </div>
        ) : null}

        {type === 'quality' && selectedLocale ? (
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Skill applied:
            </Typography.Text>
            {(() => {
              const entry = supportedLocales.find((l) => l.code === selectedLocale);
              const skill = entry?.localeSkill
                ? Array.isArray(entry.localeSkill)
                  ? (entry.localeSkill as string[]).join('\n')
                  : entry.localeSkill
                : null;
              return skill ? (
                <pre
                  style={{
                    fontSize: 11,
                    background: '#f5f5f5',
                    padding: '4px 8px',
                    borderRadius: 4,
                    margin: '4px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {skill}
                </pre>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  No skill defined for {selectedLocale}
                </Typography.Text>
              );
            })()}
          </div>
        ) : null}
      </div>

      {/* Right: Prompt 60% */}
      <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Typography.Text type="secondary">Generated prompt</Typography.Text>
          {loading && <Spin size="small" />}
        </div>
        <TextArea
          value={prompt}
          readOnly
          style={{ fontFamily: 'monospace', fontSize: 12, flex: 1, resize: 'none' }}
        />
      </div>
    </div>
  );
};

export default PromptPreview;
