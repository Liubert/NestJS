import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  Space,
  Tooltip,
  Tag,
  message,
  Alert,
  Typography,
} from 'antd';
import {
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
import type { EditModalProps, QualityResult } from './types';
import {
  aiTranslate,
  checkQuality,
  markExpected,
  unmarkExpected,
  markSandboxExpected,
  unmarkSandboxExpected,
} from './api';
import { AI_LOCALES, QUALITY_COLOR, QUALITY_CONFIG } from './QualityBadge';
import { getFlagForCode } from '../../../constants/supported-languages';

// ─── Entry Edit Modal ─────────────────────────────────────────────────────────

const EntryEditModal: React.FC<EditModalProps> = ({
  open,
  entry,
  locales,
  isNew,
  onClose,
  onSave,
  saving,
  projectSlug,
  namespace,
  isSandbox,
  onQualityUpdate,
}) => {
  const [form] = Form.useForm();
  const [aiLoadingLocale, setAiLoadingLocale] = useState<string | null>(null); // null | 'all' | locale
  const [qualityLoadingLocale, setQualityLoadingLocale] = useState<
    string | null
  >(null); // null | 'all' | locale
  const [qualityResults, setQualityResults] = useState<
    Record<string, QualityResult>
  >({});
  const [expectedLoading, setExpectedLoading] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');

  const hasKey = isNew ? keyValue.trim().length > 0 : true;

  React.useEffect(() => {
    if (open) {
      setQualityResults({});
      setAiLoadingLocale(null);
      setQualityLoadingLocale(null);
      if (entry) {
        form.setFieldsValue({
          key: entry.key,
          context: entry.context ?? '',
          ...entry.values,
        });
        setKeyValue(entry.key);
      } else {
        form.resetFields();
        setKeyValue('');
      }
    }
  }, [open, entry, form]);

  const handleOk = () => {
    form.validateFields().then((vals) => {
      const { key: formKey, context: formContext, ...rest } = vals;
      const key = isNew ? formKey : (entry?.key ?? '');
      const values: Record<string, string> = {};
      for (const locale of locales) values[locale] = rest[locale] ?? '';
      onSave(key, values, formContext);
    });
  };

  // ── AI Translate (all locales) ──
  const handleAiGenerateAll = async () => {
    const enText: string = form.getFieldValue('en') ?? '';
    if (!enText.trim()) {
      message.warning('Enter English text first');
      return;
    }
    setAiLoadingLocale('all');
    try {
      const contextVal: string = form.getFieldValue('context') ?? '';
      const result = await aiTranslate(enText, projectSlug, contextVal);
      const patch: Record<string, string> = {};
      for (const locale of AI_LOCALES) {
        if (result[locale] !== undefined) patch[locale] = result[locale];
      }
      form.setFieldsValue(patch);
      setQualityResults({});
      message.success('Translations generated');
    } catch {
      message.error('AI translation failed. Check that GEMINI_API_KEY is set.');
    } finally {
      setAiLoadingLocale(null);
    }
  };

  // ── AI Translate (single locale) ──
  const handleAiGenerateOne = async (locale: string) => {
    const enText: string = form.getFieldValue('en') ?? '';
    if (!enText.trim()) {
      message.warning('Enter English text first');
      return;
    }
    setAiLoadingLocale(locale);
    try {
      const contextVal: string = form.getFieldValue('context') ?? '';
      const result = await aiTranslate(enText, projectSlug, contextVal);
      if (result[locale] !== undefined) {
        form.setFieldsValue({ [locale]: result[locale] });
        setQualityResults((prev) => {
          const next = { ...prev };
          delete next[locale];
          return next;
        });
        message.success(`${locale} translated`);
      }
    } catch {
      message.error('AI translation failed.');
    } finally {
      setAiLoadingLocale(null);
    }
  };

  // ── Quality Check (all locales) ──
  const handleCheckQualityAll = async () => {
    const vals = form.getFieldsValue();
    const enText: string = vals['en'] ?? '';
    if (!enText.trim()) {
      message.warning('English (source) text is required');
      return;
    }
    const allQualityLocales = locales.filter((l) => vals[l]?.trim());
    if (!allQualityLocales.length) {
      message.warning('No values to check');
      return;
    }
    setQualityLoadingLocale('all');
    setQualityResults({});
    try {
      const results = await Promise.all(
        allQualityLocales.map((locale) => {
          const isDefault = locale === 'en';
          return checkQuality(
            enText,
            vals[locale],
            locale,
            isDefault ? 'language_quality' : 'translation_quality',
            projectSlug,
          ).then((r) => [locale, r] as const);
        }),
      );
      setQualityResults(Object.fromEntries(results));
    } catch {
      message.error('Quality check failed. Check that GEMINI_API_KEY is set.');
    } finally {
      setQualityLoadingLocale(null);
    }
  };

  // ── Quality Check (single locale) ──
  const handleCheckQualityOne = async (locale: string) => {
    const vals = form.getFieldsValue();
    const enText: string = vals['en'] ?? '';
    if (!enText.trim()) {
      message.warning('English (source) text is required');
      return;
    }
    const text = vals[locale]?.trim();
    if (!text) {
      message.warning(`No value for ${locale}`);
      return;
    }
    setQualityLoadingLocale(locale);
    try {
      const isDefault = locale === 'en';
      const result = await checkQuality(
        enText,
        vals[locale],
        locale,
        isDefault ? 'language_quality' : 'translation_quality',
        projectSlug,
      );
      setQualityResults((prev) => ({ ...prev, [locale]: result }));
    } catch {
      message.error(`Quality check failed for ${locale}.`);
    } finally {
      setQualityLoadingLocale(null);
    }
  };

  const hasEnLocale = locales.includes('en');
  const hasAiLocales = AI_LOCALES.some((l) => locales.includes(l));
  const isAiLoading = aiLoadingLocale !== null;
  const isQualityLoading = qualityLoadingLocale !== null;

  return (
    <Modal
      open={open}
      title={isNew ? 'Add translation key' : `Edit: ${entry?.key}`}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okButtonProps={{ disabled: isNew && !hasKey }}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {isNew && (
          <Form.Item
            name="key"
            label="Key"
            rules={[
              { required: true, message: 'Key is required' },
              {
                pattern: /^[a-zA-Z0-9._-]+$/,
                message: 'Only letters, digits, dots, underscores, dashes',
              },
            ]}
          >
            <Input
              placeholder="e.g. accessControl"
              onChange={(e) => setKeyValue(e.target.value)}
            />
          </Form.Item>
        )}
        <Form.Item
          name="context"
          label={
            <Space size={4}>
              Context
              {entry?.contextNeed === 'required' && !entry?.context ? (
                <Tooltip title={entry?.contextReason}>
                  <Tag color="error" style={{ fontSize: 11, margin: 0 }}>
                    Required
                  </Tag>
                </Tooltip>
              ) : entry?.contextNeed === 'useful' && !entry?.context ? (
                <Tooltip title={entry?.contextReason}>
                  <Tag color="processing" style={{ fontSize: 11, margin: 0 }}>
                    Suggested
                  </Tag>
                </Tooltip>
              ) : (
                <Tag style={{ fontSize: 11, margin: 0 }}>optional</Tag>
              )}
            </Space>
          }
          extra={
            entry?.contextReason &&
            !entry?.context &&
            entry?.contextNeed !== 'none'
              ? entry.contextReason
              : undefined
          }
          style={isNew && !hasKey ? { marginBottom: 8 } : undefined}
        >
          <Input.TextArea
            placeholder="e.g. Button label on permissions settings page"
            maxLength={500}
            showCount
            style={{ maxHeight: 200, resize: 'vertical' }}
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
        </Form.Item>
        {(!entry?.contextReason || entry?.context || entry?.contextNeed === 'none') && (
          <Text type="secondary" style={{ fontSize: 12, marginTop: -12, marginBottom: 12, display: 'block' }}>
            <InfoCircleOutlined style={{ marginRight: 4 }} />
            Providing context improves auto-translation quality.
          </Text>
        )}
        {(!isNew || hasKey) && locales.map((locale) => {
          const qr = qualityResults[locale];
          const storedQuality = entry?.quality?.[locale];
          const isEnRow = locale === 'en';
          const isAiLocale = AI_LOCALES.includes(locale);
          const canToggleExpected = !isNew && projectSlug && namespace && entry;

          const handleToggleExpected = async () => {
            if (!canToggleExpected) return;
            setExpectedLoading(locale);
            try {
              if (storedQuality?.reviewState === 'expected') {
                if (isSandbox)
                  await unmarkSandboxExpected(
                    projectSlug,
                    namespace,
                    entry.key,
                    locale,
                  );
                else
                  await unmarkExpected(
                    projectSlug,
                    namespace,
                    entry.key,
                    locale,
                  );
                message.success('Unmarked as expected');
              } else {
                if (isSandbox)
                  await markSandboxExpected(
                    projectSlug,
                    namespace,
                    entry.key,
                    locale,
                  );
                else
                  await markExpected(projectSlug, namespace, entry.key, locale);
                message.success('Marked as expected');
              }
              onQualityUpdate?.();
            } catch {
              message.error('Failed to update expected status');
            } finally {
              setExpectedLoading(null);
            }
          };

          const labelContent = (
            <Space size={4} wrap>
              <span>
                {getFlagForCode(locale)} {locale}
              </span>
              {/* Stored quality state badge */}
              {!isNew &&
                storedQuality &&
                storedQuality.reviewState === 'checked' &&
                storedQuality.level && (
                  <Tooltip
                    title={`Stored: ${storedQuality.score}/100${storedQuality.comment ? ` — ${storedQuality.comment}` : ''}`}
                  >
                    <Tag
                      color={
                        QUALITY_CONFIG[storedQuality.level]?.color ?? 'default'
                      }
                      style={{ fontSize: 11, margin: 0 }}
                    >
                      {QUALITY_CONFIG[storedQuality.level]?.label ??
                        storedQuality.level}{' '}
                      · {storedQuality.score}
                    </Tag>
                  </Tooltip>
                )}
              {!isNew && storedQuality?.reviewState === 'expected' && (
                <Tag color="processing" style={{ fontSize: 11, margin: 0 }}>
                  <CheckCircleOutlined /> Expected
                </Tag>
              )}
              {!isNew && storedQuality?.reviewState === 'processing' && (
                <Tag style={{ fontSize: 11, margin: 0 }}>
                  <SyncOutlined spin /> Reviewing...
                </Tag>
              )}
              {/* Expected toggle button */}
              {canToggleExpected &&
                !isEnRow &&
                storedQuality &&
                storedQuality.reviewState !== 'not_checked' &&
                storedQuality.reviewState !== 'processing' && (
                  <Tooltip
                    title={
                      storedQuality.reviewState === 'expected'
                        ? 'Remove confirmation — translation will be revalidated'
                        : 'Confirm this translation is correct — skips future revalidation'
                    }
                  >
                    <Button
                      size="small"
                      type={
                        storedQuality.reviewState === 'expected'
                          ? 'primary'
                          : 'dashed'
                      }
                      icon={<CheckCircleOutlined />}
                      loading={expectedLoading === locale}
                      onClick={handleToggleExpected}
                      style={{
                        fontSize: 11,
                        padding: '0 6px',
                        height: 22,
                        ...(storedQuality.reviewState === 'expected'
                          ? { background: '#1677ff' }
                          : {}),
                      }}
                    >
                      {storedQuality.reviewState === 'expected'
                        ? 'Confirmed'
                        : 'Confirm'}
                    </Button>
                  </Tooltip>
                )}
              {/* English row: global buttons */}
              {isEnRow && hasAiLocales && (
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={aiLoadingLocale === 'all'}
                  disabled={isAiLoading || !hasEnLocale}
                  onClick={handleAiGenerateAll}
                  type="dashed"
                >
                  Auto-translate all
                </Button>
              )}
              {isEnRow && (
                <Button
                  size="small"
                  icon={<SafetyCertificateOutlined />}
                  loading={qualityLoadingLocale === 'all'}
                  disabled={isQualityLoading}
                  onClick={handleCheckQualityAll}
                  type="dashed"
                >
                  Check all
                </Button>
              )}
              {/* Per-locale translate button for AI locales */}
              {!isEnRow && isAiLocale && (
                <Tooltip title={`Translate ${locale}`}>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={aiLoadingLocale === locale}
                    disabled={isAiLoading || !hasEnLocale}
                    onClick={() => handleAiGenerateOne(locale)}
                    type="text"
                    style={{ color: '#1677ff', padding: '0 4px' }}
                  />
                </Tooltip>
              )}
              {/* Per-locale quality check button for all locales */}
              {!isEnRow && (
                <Tooltip title={`Check quality for ${locale}`}>
                  <Button
                    size="small"
                    icon={<SafetyCertificateOutlined />}
                    loading={qualityLoadingLocale === locale}
                    disabled={isQualityLoading}
                    onClick={() => handleCheckQualityOne(locale)}
                    type="text"
                    style={{ color: '#8c8c8c', padding: '0 4px' }}
                  />
                </Tooltip>
              )}
              {/* Quality result badge */}
              {qr && (
                <Tooltip title={qr.comment ?? undefined}>
                  <Tag color={QUALITY_CONFIG[qr.level].color}>
                    {QUALITY_CONFIG[qr.level].label} · {qr.score}/100
                  </Tag>
                </Tooltip>
              )}
            </Space>
          );

          return (
            <Form.Item key={locale} name={locale} label={labelContent}>
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />
            </Form.Item>
          );
        })}
        {Object.keys(qualityResults).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {Object.entries(qualityResults).map(([locale, r]) => (
              <Alert
                key={locale}
                type={
                  r.level === 'red'
                    ? 'error'
                    : r.level === 'yellow'
                      ? 'warning'
                      : 'info'
                }
                message={
                  <>
                    <Tag>{locale}</Tag>
                    {r.comment || 'Looks good'}
                  </>
                }
                style={{ marginBottom: 6 }}
                showIcon
              />
            ))}
          </div>
        )}
      </Form>
    </Modal>
  );
};

export default EntryEditModal;
