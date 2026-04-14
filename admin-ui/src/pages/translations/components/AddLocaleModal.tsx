import React, { useState } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  Checkbox,
  Alert,
  message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { useSupportedLocales } from '../../../hooks/useSupportedLocales';

interface AddLocaleModalProps {
  open: boolean;
  onClose: () => void;
  projectSlug: string;
  existingLocaleCodes: string[];
  namespaceCount: number;
  onSuccess?: () => void;
}

const AddLocaleModal: React.FC<AddLocaleModalProps> = ({
  open,
  onClose,
  projectSlug,
  existingLocaleCodes,
  namespaceCount,
  onSuccess,
}) => {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [initTranslate, setInitTranslate] = useState(true);
  const { data: supportedLocales = [] } = useSupportedLocales();

  const localeMap = React.useMemo(
    () => new Map(supportedLocales.map((l) => [l.code, l])),
    [supportedLocales],
  );

  const mutation = useMutation({
    mutationFn: (vals: {
      code: string;
      aliases?: string[];
      localeSkill?: string;
      initTranslate?: boolean;
    }) => apiClient.post(`/translations/projects/${projectSlug}/locales`, vals),
    onSuccess: () => {
      message.success('Locale added');
      qc.invalidateQueries({ queryKey: ['project', projectSlug] });
      handleClose();
      onSuccess?.();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error adding locale'),
  });

  const handleClose = () => {
    form.resetFields();
    setSelectedCode(null);
    setInitTranslate(true);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Add locale"
      width={600}
      onCancel={handleClose}
      onOk={() =>
        form.validateFields().then((v) => {
          const loc = localeMap.get(v.code as string);
          mutation.mutate({
            code: v.code as string,
            aliases: (v.aliases as string[] | undefined) ?? loc?.aliases ?? [],
            localeSkill: (v.localeSkill as string | undefined) || undefined,
            initTranslate: !!v.initTranslate,
          });
        })
      }
      confirmLoading={mutation.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ initTranslate: true }}>
        <Form.Item
          name="code"
          label="Language"
          rules={[{ required: true, message: 'Select a language' }]}
        >
          <Select
            showSearch
            placeholder="Select language"
            optionFilterProp="label"
            onChange={(code: string) => {
              setSelectedCode(code);
              const loc = localeMap.get(code);
              if (loc) form.setFieldsValue({ aliases: loc.aliases });
              const skill = loc?.localeSkill;
              form.setFieldsValue({
                localeSkill: Array.isArray(skill) ? skill.join('\n') : (skill ?? ''),
              });
            }}
            options={supportedLocales.map((l) => ({
              value: l.code,
              label: `${l.flag} ${l.name} (${l.code})`,
              disabled: existingLocaleCodes.includes(l.code),
            }))}
          />
        </Form.Item>
        <div style={{ visibility: selectedCode ? 'visible' : 'hidden' }}>
          <Form.Item
            name="aliases"
            label="Aliases"
            extra="Alternative locale codes that map to this language"
          >
            <Select mode="tags" placeholder="e.g. en-US, en-GB" />
          </Form.Item>
          <Form.Item
            name="localeSkill"
            label="Language translation skill"
            extra={
              <span style={{ display: 'block', marginTop: 24 }}>
                Practical language-specific guide for AI: style, tone, grammar, anti-patterns, common mistakes, wording rules.
              </span>
            }
          >
            <Input.TextArea
              rows={10}
              maxLength={5000}
              showCount
              placeholder={`e.g.\n- Tone: formal "ви", not informal "ти"\n- Plural forms: 3 forms — 1 елемент, 2 елементи, 5 елементів\n- Anti-patterns: avoid anglicisms (налаштування, not сетинги)\n- UI wording: use imperative for buttons (Зберегти, not Збереження)\n- Common mistakes: "приймати участь" → "брати участь"\n- Quotation marks: «text» not "text"`}
            />
          </Form.Item>
          <Form.Item name="initTranslate" valuePropName="checked">
            <Checkbox onChange={(e) => setInitTranslate(e.target.checked)}>
              Auto-translate all existing keys for this locale
            </Checkbox>
          </Form.Item>
          {!initTranslate && namespaceCount > 0 && (
            <Alert
              type="warning"
              showIcon
              message="This locale will have empty values. You'll need to fill them manually or via an AI agent."
              style={{ marginBottom: 16 }}
            />
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default AddLocaleModal;
