import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  Typography,
  Space,
  Input,
  Select,
  Button,
  Modal,
  Checkbox,
  Form,
  message,
  Tooltip,
  Popconfirm,
  Tag,
  Row,
  Col,
  Alert,
  Spin,
  Tabs,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  RollbackOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import apiClient from '../../api/client';
import { getFlagForCode } from '../../constants/supported-languages';

const { Title, Text } = Typography;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  slug: string;
  name: string;
}

interface LocaleInfo {
  code: string;
  isDefault: boolean;
}

interface ProjectDetails {
  slug: string;
  name: string;
  locales: LocaleInfo[];
  namespaces: string[];
}

interface QualityInfo {
  reviewState:
    | 'not_checked'
    | 'queued'
    | 'processing'
    | 'checked'
    | 'expected'
    | 'failed';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | 'expected' | null;
  comment: string | null;
  checkedAt: string | null;
}

interface Entry {
  key: string;
  createdAt: string;
  context: string | null;
  contextRequired: boolean | null;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
}

interface PaginatedEntries {
  data: Entry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SandboxStatus {
  initialized: boolean;
  initializedAt: string | null;
  hasChanges: boolean;
  snapshotCount: number;
}

interface DiffEntry {
  namespace: string;
  key: string;
  locale: string;
  status: 'added' | 'changed' | 'deleted';
  productionValue: string | null;
  sandboxValue: string | null;
}

interface DiffResult {
  total: number;
  added: number;
  changed: number;
  deleted: number;
  entries: DiffEntry[];
}

interface Snapshot {
  id: string;
  label: string | null;
  createdAt: string;
  entryCount: number;
}

interface QualityResult {
  score: number;
  level: 'green' | 'yellow' | 'red' | 'expected';
  comment: string;
}

// Key-level diff (multiple locale diffs collapsed into one)
interface KeyDiff {
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  locales: string[];
}

// Key-level diff row for the review modal — one row per key, carries all locale entries
interface KeyDiffRow {
  id: string;
  namespace: string;
  key: string;
  status: 'added' | 'changed' | 'deleted';
  localeEntries: DiffEntry[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

const fetchProjects = async (): Promise<Project[]> => {
  const res = await apiClient.get('/translations/projects?limit=200');
  return res.data.data;
};

const fetchProjectDetails = async (slug: string): Promise<ProjectDetails> => {
  const res = await apiClient.get(`/translations/projects/${slug}`);
  return res.data;
};

const fetchEntries = async (
  slug: string,
  ns: string,
  page: number,
  limit: number,
  search: string,
  sortBy: string,
  sortOrder: string,
  qualityLevel?: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  if (search.length >= 2) params.search = search;
  if (qualityLevel) params.qualityLevel = qualityLevel;
  const res = await apiClient.get(
    `/translations/projects/${slug}/namespaces/${ns}/entries`,
    { params },
  );
  return res.data;
};

const createEntry = async (
  slug: string,
  ns: string,
  payload: { key: string; values: Record<string, string>; context?: string },
) => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/namespaces/${ns}/entries`,
    payload,
  );
  return res.data;
};

const updateEntry = async (
  slug: string,
  ns: string,
  key: string,
  values: Record<string, string>,
  context?: string,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values, ...(context !== undefined ? { context } : {}) },
  );
  return res.data;
};

const deleteEntry = async (slug: string, ns: string, key: string) => {
  await apiClient.delete(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

const aiTranslate = async (
  text: string,
  projectSlug?: string,
): Promise<Record<string, string>> => {
  const res = await apiClient.post('/translations/ai-translate', {
    text,
    projectSlug,
  });
  return res.data;
};

const checkQuality = async (
  source: string,
  translation: string,
  locale: string,
  mode: 'translation_quality' | 'language_quality' = 'translation_quality',
  projectSlug?: string,
): Promise<QualityResult> => {
  const res = await apiClient.post('/translations/ai-quality-check', {
    source,
    translation,
    locale,
    mode,
    projectSlug,
  });
  return res.data;
};

const fetchSandboxStatus = async (slug: string): Promise<SandboxStatus> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/status`,
  );
  return res.data;
};

const fetchSandboxDiff = async (slug: string): Promise<DiffResult> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/diff`,
  );
  return res.data;
};

const fetchSnapshots = async (slug: string): Promise<Snapshot[]> => {
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/snapshots`,
  );
  return res.data;
};

const fetchSandboxEntries = async (
  slug: string,
  ns: string,
  page: number,
  limit: number,
  search: string,
  sortBy: string,
  sortOrder: string,
  qualityLevel?: string,
): Promise<PaginatedEntries> => {
  const params: Record<string, string | number> = {
    page,
    limit,
    sortBy,
    sortOrder,
  };
  if (search.length >= 2) params.search = search;
  if (qualityLevel) params.qualityLevel = qualityLevel;
  const res = await apiClient.get(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`,
    { params },
  );
  return res.data;
};

const createSandboxEntry = async (
  slug: string,
  ns: string,
  payload: { key: string; values: Record<string, string>; context?: string },
) => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries`,
    payload,
  );
  return res.data;
};

const updateSandboxEntry = async (
  slug: string,
  ns: string,
  key: string,
  values: Record<string, string>,
  context?: string,
) => {
  const res = await apiClient.patch(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
    { values, ...(context !== undefined ? { context } : {}) },
  );
  return res.data;
};

const deleteSandboxEntry = async (slug: string, ns: string, key: string) => {
  await apiClient.delete(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}`,
  );
};

const revertSandboxKey = async (slug: string, ns: string, key: string) => {
  await apiClient.post(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/revert`,
  );
};

const markExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<QualityInfo> => {
  const res = await apiClient.post<QualityInfo>(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
  return res.data;
};

const unmarkExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
};

const markSandboxExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<QualityInfo> => {
  const res = await apiClient.post<QualityInfo>(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
  return res.data;
};

const unmarkSandboxExpected = async (
  slug: string,
  ns: string,
  key: string,
  locale: string,
): Promise<void> => {
  await apiClient.delete(
    `/translations/projects/${slug}/sandbox/namespaces/${ns}/entries/${encodeURIComponent(key)}/locales/${locale}/mark-expected`,
  );
};

const promoteSelective = async (
  slug: string,
  keys: { namespace: string; key: string }[],
): Promise<{ snapshotId: string; promoted: number }> => {
  const res = await apiClient.post(
    `/translations/projects/${slug}/sandbox/promote-selective`,
    { keys },
  );
  return res.data;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const AI_LOCALES = ['uk', 'nb-NO', 'sv', 'da-DK'];

const QUALITY_CONFIG = {
  green: { color: 'success', label: 'Good' },
  yellow: { color: 'warning', label: 'Review' },
  red: { color: 'error', label: 'Poor' },
  expected: { color: 'processing', label: 'Expected' },
} as const;

const QUALITY_COLOR: Record<string, string> = {
  green: '#52c41a',
  yellow: '#faad14',
  red: '#ff4d4f',
  expected: '#1677ff',
};

const ROW_BG: Record<string, string> = {
  added: '#f6ffed',
  changed: '#fffbe6',
  deleted: '#fff1f0',
};

// ─── Quality Badge ───────────────────────────────────────────────────────────

interface QualityBadgeProps {
  info: QualityInfo | null | undefined;
  slug?: string;
  namespace?: string;
  entryKey?: string;
  locale?: string;
  isSandbox?: boolean;
  onUpdate?: () => void;
}

const QualityBadge: React.FC<QualityBadgeProps> = ({
  info,
  slug,
  namespace,
  entryKey,
  locale,
  isSandbox,
  onUpdate,
}) => {
  if (!info) return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;

  if (info.reviewState === 'queued' || info.reviewState === 'processing') {
    return (
      <Tooltip
        title={
          info.reviewState === 'processing'
            ? 'Reviewing...'
            : 'Queued for review'
        }
      >
        <SyncOutlined spin style={{ color: '#8c8c8c', fontSize: 10 }} />
      </Tooltip>
    );
  }

  if (info.reviewState === 'failed') {
    return (
      <Tooltip title="Quality review failed — will retry">
        <span
          style={{
            color: '#ff4d4f',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'help',
          }}
        >
          !
        </span>
      </Tooltip>
    );
  }

  if (info.reviewState === 'not_checked') {
    return (
      <Tooltip title="Not yet reviewed">
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#d9d9d9',
            flexShrink: 0,
          }}
        />
      </Tooltip>
    );
  }

  if (info.reviewState === 'expected') {
    const canInteract = slug && namespace && entryKey && locale;
    const badge = (
      <Tooltip title="Manually accepted — score: 100/100">
        <CheckCircleOutlined
          style={{
            color: '#1677ff',
            fontSize: 12,
            cursor: canInteract ? 'pointer' : 'help',
          }}
        />
      </Tooltip>
    );

    if (!canInteract) return badge;

    return (
      <Popconfirm
        title="Unmark expected?"
        description="This will reset validation status. The item will be revalidated."
        onConfirm={async () => {
          try {
            if (isSandbox)
              await unmarkSandboxExpected(slug, namespace, entryKey, locale);
            else await unmarkExpected(slug, namespace, entryKey, locale);
            message.success('Unmarked');
            onUpdate?.();
          } catch {
            message.error('Failed to unmark');
          }
        }}
        okText="Reset"
        cancelText="Cancel"
      >
        {badge}
      </Popconfirm>
    );
  }

  // checked
  const canInteract = slug && namespace && entryKey && locale;
  const badge = (
    <Tooltip
      title={`Score: ${info.score ?? '?'}/100${info.comment ? ` — ${info.comment}` : ''}`}
    >
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: QUALITY_COLOR[info.level ?? ''] ?? '#bbb',
          cursor: canInteract ? 'pointer' : 'help',
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );

  if (!canInteract) return badge;

  return (
    <Popconfirm
      title="Mark as expected?"
      description="This translation will be accepted and skip future validation."
      onConfirm={async () => {
        try {
          if (isSandbox)
            await markSandboxExpected(slug, namespace, entryKey, locale);
          else await markExpected(slug, namespace, entryKey, locale);
          message.success('Marked as expected');
          onUpdate?.();
        } catch {
          message.error('Failed to mark as expected');
        }
      }}
      okText="Accept"
      cancelText="Cancel"
    >
      {badge}
    </Popconfirm>
  );
};

// ─── Edit Modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean;
  entry: Entry | null;
  locales: string[];
  isNew: boolean;
  onClose: () => void;
  onSave: (
    key: string,
    values: Record<string, string>,
    context?: string,
  ) => void;
  saving: boolean;
  projectSlug?: string;
  namespace?: string;
  isSandbox?: boolean;
  onQualityUpdate?: () => void;
}

const EditModal: React.FC<EditModalProps> = ({
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
      } else {
        form.resetFields();
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
      const result = await aiTranslate(enText, projectSlug);
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
      const result = await aiTranslate(enText, projectSlug);
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
            <Input placeholder="e.g. accessControl" />
          </Form.Item>
        )}
        <Form.Item
          name="context"
          label={
            <Space size={4}>
              Context{' '}
              {entry?.contextRequired && !entry?.context && (
                <Tag color="warning" style={{ fontSize: 11 }}>
                  Required
                </Tag>
              )}
            </Space>
          }
        >
          <Input.TextArea
            placeholder="Describe where this key is used (e.g. 'Save button in expense form footer')"
            maxLength={500}
            showCount
            rows={2}
          />
        </Form.Item>
        {locales.map((locale) => {
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
                        ? 'Remove manual acceptance'
                        : 'Accept — skip future validation'
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
                        ? 'Accepted'
                        : 'Accept'}
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
                  Translate All
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
                  Check All
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

// ─── Diff helpers ────────────────────────────────────────────────────────────

function buildKeyDiffs(entries: DiffEntry[]): KeyDiff[] {
  const map = new Map<string, KeyDiff>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, {
        namespace: e.namespace,
        key: e.key,
        status: e.status,
        locales: [],
      });
    }
    map.get(id)!.locales.push(e.locale);
  }
  return Array.from(map.values());
}

function buildKeyDiffRows(entries: DiffEntry[]): KeyDiffRow[] {
  const map = new Map<string, KeyDiffRow>();
  for (const e of entries) {
    const id = `${e.namespace}/${e.key}`;
    if (!map.has(id)) {
      map.set(id, {
        id,
        namespace: e.namespace,
        key: e.key,
        status: e.status,
        localeEntries: [],
      });
    }
    const row = map.get(id)!;
    row.localeEntries.push(e);
    if (
      e.status === 'added' ||
      (e.status === 'deleted' && row.status === 'changed')
    ) {
      row.status = e.status;
    }
  }
  return Array.from(map.values());
}

function buildKeyStatusLookup(
  entries: DiffEntry[],
): Map<string, DiffEntry['status']> {
  const m = new Map<string, DiffEntry['status']>();
  for (const e of entries) {
    const k = `${e.namespace}/${e.key}`;
    const existing = m.get(k);
    if (
      !existing ||
      e.status === 'added' ||
      (e.status === 'deleted' && existing === 'changed')
    ) {
      m.set(k, e.status);
    }
  }
  return m;
}

// ─── Shared Entries Table ────────────────────────────────────────────────────

interface EntriesTableProps {
  projectSlug: string;
  queryKeyPrefix: string;
  fetchFn: (
    slug: string,
    ns: string,
    page: number,
    limit: number,
    search: string,
    sortBy: string,
    sortOrder: string,
    qualityLevel?: string,
  ) => Promise<PaginatedEntries>;
  createFn: (
    slug: string,
    ns: string,
    payload: { key: string; values: Record<string, string>; context?: string },
  ) => Promise<unknown>;
  updateFn: (
    slug: string,
    ns: string,
    key: string,
    values: Record<string, string>,
    context?: string,
  ) => Promise<unknown>;
  deleteFn: (slug: string, ns: string, key: string) => Promise<void>;
  enabled?: boolean;
  onMutationSuccess?: () => void;
  // Sandbox customization
  getRowProps?: (
    record: Entry,
    namespace: string,
  ) => React.HTMLAttributes<HTMLElement>;
  renderKeyExtra?: (key: string, namespace: string) => React.ReactNode;
  clientFilter?: (record: Entry, namespace: string) => boolean;
  isSandbox?: boolean;
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  extraControls?: React.ReactNode;
}

const EntriesTable: React.FC<EntriesTableProps> = ({
  projectSlug,
  queryKeyPrefix,
  fetchFn,
  createFn,
  updateFn,
  deleteFn,
  enabled = true,
  onMutationSuccess,
  getRowProps,
  renderKeyExtra,
  clientFilter,
  isSandbox,
  deleteConfirmTitle = 'Delete this key?',
  deleteConfirmDescription,
  extraControls,
}) => {
  const qc = useQueryClient();
  const prevProjectSlugRef = useRef(projectSlug);
  const [namespace, setNamespaceRaw] = useState(
    () => localStorage.getItem('translations_namespace') || '',
  );
  const setNamespace = (ns: string) => {
    setNamespaceRaw(ns);
    localStorage.setItem('translations_namespace', ns);
  };
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<'key' | 'createdAt' | 'qualityScore'>(
    'key',
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [qualityLevel, setQualityLevel] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);

  const { data: projectDetails } = useQuery<ProjectDetails>({
    queryKey: ['project', projectSlug],
    queryFn: () => fetchProjectDetails(projectSlug),
    enabled: !!projectSlug,
  });

  React.useEffect(() => {
    if (prevProjectSlugRef.current !== projectSlug) {
      setNamespace('');
      setPage(1);
      prevProjectSlugRef.current = projectSlug;
    }
  }, [projectSlug]);

  React.useEffect(() => {
    if (projectDetails && projectDetails.namespaces.length > 0 && !namespace) {
      setNamespace(projectDetails.namespaces[0]);
    }
  }, [projectDetails, namespace]);

  const locales: string[] = projectDetails?.locales?.map((l) => l.code) ?? [];

  const { data: entriesData, isLoading: entriesLoading } =
    useQuery<PaginatedEntries>({
      queryKey: [
        queryKeyPrefix,
        projectSlug,
        namespace,
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
        qualityLevel,
      ],
      queryFn: () =>
        fetchFn(
          projectSlug,
          namespace,
          page,
          pageSize,
          search,
          sortBy,
          sortOrder,
          qualityLevel || undefined,
        ),
      enabled: !!projectSlug && !!namespace && enabled,
    });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queryKeyPrefix, projectSlug] });
    onMutationSuccess?.();
  }, [qc, queryKeyPrefix, projectSlug, onMutationSuccess]);

  const createMutation = useMutation({
    mutationFn: ({
      key,
      values,
      context,
    }: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }) => createFn(projectSlug, namespace, { key, values, context }),
    onSuccess: () => {
      message.success('Key created');
      invalidate();
      setEditModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error creating key'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      key,
      values,
      context,
    }: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }) => updateFn(projectSlug, namespace, key, values, context),
    onSuccess: () => {
      message.success('Saved');
      invalidate();
      setEditModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error saving'),
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFn(projectSlug, namespace, key),
    onSuccess: () => {
      message.success('Deleted');
      invalidate();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error deleting'),
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
  }, [searchInput]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Entry> | SorterResult<Entry>[],
  ) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 50);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s?.field) {
      const field = s.field as string;
      setSortBy(
        field === 'createdAt'
          ? 'createdAt'
          : field === 'qualityScore'
            ? 'qualityScore'
            : 'key',
      );
      setSortOrder(s.order === 'descend' ? 'desc' : 'asc');
    }
  };

  const columns: ColumnsType<Entry> = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      sorter: true,
      width: 240,
      fixed: 'left',
      render: (text: string, record: Entry) => (
        <Space size={6}>
          <Tooltip title={text}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {text}
            </span>
          </Tooltip>
          {record.context && (
            <Tooltip title={record.context}>
              <InfoCircleOutlined
                style={{ color: '#1677ff', fontSize: 12, cursor: 'help' }}
              />
            </Tooltip>
          )}
          {record.contextRequired && !record.context && (
            <Tooltip title="Context required but missing — quality scores may be capped">
              <WarningOutlined
                style={{ color: '#faad14', fontSize: 12, cursor: 'help' }}
              />
            </Tooltip>
          )}
          {renderKeyExtra?.(text, namespace)}
        </Space>
      ),
    },
    ...locales.map((locale) => ({
      title: (
        <Tag color="blue">
          {getFlagForCode(locale)} {locale}
        </Tag>
      ),
      key: locale,
      width: 180,
      render: (_: unknown, record: Entry) => {
        const val = record.values[locale];
        return (
          <Space size={4} align="start">
            <QualityBadge
              info={record.quality?.[locale]}
              slug={projectSlug}
              namespace={namespace}
              entryKey={record.key}
              locale={locale}
              isSandbox={isSandbox}
              onUpdate={invalidate}
            />
            {val ? (
              <Tooltip title={val}>
                <span
                  style={{
                    display: 'block',
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                  }}
                >
                  {val}
                </span>
              </Tooltip>
            ) : (
              <span style={{ color: '#ccc', fontStyle: 'italic' }}>—</span>
            )}
          </Space>
        );
      },
    })),
    {
      title: (
        <Tooltip title="Minimum quality score across all locales (sort to find worst translations)">
          Quality
        </Tooltip>
      ),
      key: 'qualityScore',
      dataIndex: 'qualityScore',
      sorter: true,
      width: 90,
      render: (_: unknown, record: Entry) => {
        const scores = locales
          .map((l) => record.quality?.[l]?.score)
          .filter((s): s is number => s != null);
        if (!scores.length)
          return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;
        const minScore = Math.min(...scores);
        const levels = locales
          .map((l) => record.quality?.[l]?.level)
          .filter(Boolean);
        const level = levels.includes('red')
          ? 'red'
          : levels.includes('yellow')
            ? 'yellow'
            : levels.includes('expected')
              ? 'expected'
              : 'green';
        return (
          <span
            style={{
              color: QUALITY_COLOR[level] ?? '#bbb',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {minScore}
          </span>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: Entry) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditEntry(record);
              setIsNewEntry(false);
              setEditModalOpen(true);
            }}
          />
          <Popconfirm
            title={deleteConfirmTitle}
            description={deleteConfirmDescription}
            onConfirm={() => deleteMutation.mutate(record.key)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={12} style={{ marginBottom: 14 }}>
        <Col>
          <Select
            placeholder="Namespace"
            value={namespace || undefined}
            onChange={(val) => {
              setNamespace(val);
              setPage(1);
              setSearchInput('');
              setSearch('');
            }}
            style={{ width: 220 }}
            disabled={!projectDetails}
            options={(projectDetails?.namespaces ?? []).map((ns: string) => ({
              value: ns,
              label: ns,
            }))}
          />
        </Col>
        <Col flex="auto">
          <Input
            placeholder="Search by key or value..."
            prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearch}
            onBlur={handleSearch}
            allowClear
            onClear={() => {
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
            style={{ maxWidth: 360 }}
          />
        </Col>
        <Col>
          <Select
            value={qualityLevel || ''}
            onChange={(val) => {
              setQualityLevel(val);
              setPage(1);
            }}
            style={{ width: 150 }}
            options={[
              { value: '', label: 'All qualities' },
              { value: 'green', label: 'Green' },
              { value: 'yellow', label: 'Yellow' },
              { value: 'red', label: 'Red' },
              { value: 'expected', label: 'Expected' },
              { value: 'unchecked', label: 'Not checked' },
              { value: 'needs_context', label: 'Needs Context' },
            ]}
          />
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!namespace}
            onClick={() => {
              setEditEntry(null);
              setIsNewEntry(true);
              setEditModalOpen(true);
            }}
          >
            Add key
          </Button>
        </Col>
        {extraControls}
      </Row>

      <Table<Entry>
        rowKey="key"
        columns={columns}
        dataSource={
          clientFilter
            ? (entriesData?.data ?? []).filter((r) =>
                clientFilter(r, namespace),
              )
            : (entriesData?.data ?? [])
        }
        loading={entriesLoading}
        scroll={{ x: true }}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize,
          total: entriesData?.meta.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: ['25', '50', '100'],
          showTotal: (total) => `${total} keys`,
        }}
        size="small"
        onRow={
          getRowProps ? (record) => getRowProps(record, namespace) : undefined
        }
      />

      <EditModal
        open={editModalOpen}
        entry={editEntry}
        locales={locales}
        isNew={isNewEntry}
        onClose={() => setEditModalOpen(false)}
        onSave={(key, values, context) => {
          if (isNewEntry) createMutation.mutate({ key, values, context });
          else updateMutation.mutate({ key, values, context });
        }}
        saving={createMutation.isPending || updateMutation.isPending}
        projectSlug={projectSlug}
        namespace={namespace}
        isSandbox={isSandbox}
        onQualityUpdate={invalidate}
      />
    </>
  );
};

// ─── Sandbox Tab ─────────────────────────────────────────────────────────────

interface SandboxTabProps {
  projectSlug: string;
}

const SandboxTab: React.FC<SandboxTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(
    new Set(),
  );
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('');
  const [reviewNsFilter, setReviewNsFilter] = useState<string>('');
  const [reviewQualityFilter, setReviewQualityFilter] = useState<string>('');
  const [reviewPage, setReviewPage] = useState(1);
  const REVIEW_PAGE_SIZE = 50;
  const [sandboxChangeFilter, setSandboxChangeFilter] = useState<string>('');

  const { data: status, isLoading: statusLoading } = useQuery<SandboxStatus>({
    queryKey: ['sandbox-status', projectSlug],
    queryFn: () => fetchSandboxStatus(projectSlug),
    enabled: !!projectSlug,
  });

  const { data: diff } = useQuery<DiffResult>({
    queryKey: ['sandbox-diff', projectSlug],
    queryFn: () => fetchSandboxDiff(projectSlug),
    enabled: !!projectSlug && !!status?.initialized,
  });

  const keyStatusMap = useMemo(
    () => buildKeyStatusLookup(diff?.entries ?? []),
    [diff],
  );
  const keyDiffs = useMemo(() => buildKeyDiffs(diff?.entries ?? []), [diff]);
  const keyDiffRows = useMemo(
    () => buildKeyDiffRows(diff?.entries ?? []),
    [diff],
  );
  const keyAdded = keyDiffs.filter((k) => k.status === 'added').length;
  const keyChanged = keyDiffs.filter((k) => k.status === 'changed').length;
  const keyDeleted = keyDiffs.filter((k) => k.status === 'deleted').length;
  const total = keyAdded + keyChanged + keyDeleted;

  const invalidateSandbox = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['sandbox-status', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-diff', projectSlug] });
    qc.invalidateQueries({ queryKey: ['sandbox-entries', projectSlug] });
  }, [qc, projectSlug]);

  const initMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/init`, {
          force: false,
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(
        `Sandbox initialized — ${data.copiedRows} rows copied from production`,
      );
      invalidateSandbox();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Failed to initialize'),
  });

  const promoteMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/promote`)
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(
        `Pushed — ${data.promoted} entries are now live in production`,
      );
      invalidateSandbox();
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setPushModalOpen(false);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Push failed'),
  });

  const promoteSelectiveMutation = useMutation({
    mutationFn: (keys: { namespace: string; key: string }[]) =>
      promoteSelective(projectSlug, keys),
    onSuccess: (data) => {
      message.success(
        `Pushed — ${data.promoted} entries are now live in production`,
      );
      invalidateSandbox();
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setPushModalOpen(false);
      setSelectedRowKeys(new Set());
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Push failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/reset`)
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(
        `Sandbox reset — ${data.copiedRows} rows re-copied from production`,
      );
      invalidateSandbox();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Reset failed'),
  });

  const revertKeyMutation = useMutation({
    mutationFn: ({ ns, key }: { ns: string; key: string }) =>
      revertSandboxKey(projectSlug, ns, key),
    onSuccess: () => {
      message.success('Change reverted');
      invalidateSandbox();
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  // Auto-close review modal when all changes have been reverted
  React.useEffect(() => {
    if (pushModalOpen && diff && diff.total === 0) {
      setPushModalOpen(false);
    }
  }, [pushModalOpen, diff]);

  // ── Review modal: filtered + paginated data (must be before early returns) ──
  const reviewNamespaces = useMemo(() => {
    const ns = new Set(keyDiffRows.map((r) => r.namespace));
    return Array.from(ns).sort();
  }, [keyDiffRows]);

  const filteredDiffRows = useMemo(() => {
    let rows = keyDiffRows;
    if (reviewStatusFilter)
      rows = rows.filter((r) => r.status === reviewStatusFilter);
    if (reviewNsFilter)
      rows = rows.filter((r) => r.namespace === reviewNsFilter);
    if (reviewQualityFilter) {
      if (reviewQualityFilter === 'unchecked') {
        rows = rows.filter((r) => r.worstQualityLevel === null);
      } else {
        rows = rows.filter((r) => r.worstQualityLevel === reviewQualityFilter);
      }
    }
    return rows;
  }, [keyDiffRows, reviewStatusFilter, reviewNsFilter, reviewQualityFilter]);

  const paginatedDiffRows = useMemo(() => {
    const start = (reviewPage - 1) * REVIEW_PAGE_SIZE;
    return filteredDiffRows.slice(start, start + REVIEW_PAGE_SIZE);
  }, [filteredDiffRows, reviewPage, REVIEW_PAGE_SIZE]);

  // Init selection when modal opens
  const handleOpenReview = useCallback(() => {
    setSelectedRowKeys(new Set(keyDiffRows.map((r) => r.id)));
    setReviewStatusFilter('');
    setReviewNsFilter('');
    setReviewQualityFilter('');
    setReviewPage(1);
    setPushModalOpen(true);
  }, [keyDiffRows]);

  // Selection helpers
  const allFilteredSelected =
    filteredDiffRows.length > 0 &&
    filteredDiffRows.every((r) => selectedRowKeys.has(r.id));
  const someFilteredSelected = filteredDiffRows.some((r) =>
    selectedRowKeys.has(r.id),
  );
  const selectedCount = keyDiffRows.filter((r) =>
    selectedRowKeys.has(r.id),
  ).length;

  const toggleSelectAll = useCallback(() => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filteredDiffRows) next.delete(r.id);
      } else {
        for (const r of filteredDiffRows) next.add(r.id);
      }
      return next;
    });
  }, [allFilteredSelected, filteredDiffRows]);

  const toggleRow = useCallback((id: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePromoteSelected = useCallback(() => {
    const selectedKeys = keyDiffRows
      .filter((r) => selectedRowKeys.has(r.id))
      .map((r) => ({ namespace: r.namespace, key: r.key }));

    if (selectedKeys.length === total) {
      promoteMutation.mutate();
    } else {
      promoteSelectiveMutation.mutate(selectedKeys);
    }
  }, [
    keyDiffRows,
    selectedRowKeys,
    total,
    promoteMutation,
    promoteSelectiveMutation,
  ]);

  if (!projectSlug)
    return <Empty description="Select a project" style={{ marginTop: 48 }} />;
  if (statusLoading)
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );

  // ── Not initialized
  if (!status?.initialized) {
    return (
      <div style={{ maxWidth: 520, margin: '56px auto', textAlign: 'center' }}>
        <Title level={4} style={{ fontWeight: 400, marginBottom: 8 }}>
          Sandbox is not initialized
        </Title>
        <p style={{ color: '#8c8c8c', marginBottom: 28, lineHeight: 1.7 }}>
          The sandbox is a working copy of production. Initialize it to start
          making changes that will not affect production until you explicitly
          push them.
        </p>
        <Button
          type="primary"
          size="large"
          loading={initMutation.isPending}
          onClick={() => initMutation.mutate()}
        >
          Initialize sandbox
        </Button>
      </div>
    );
  }

  const hasChanges = !!status?.hasChanges;
  const statusBg = hasChanges ? '#fffbe6' : '#f6ffed';
  const statusBorder = hasChanges ? '#ffe58f' : '#b7eb8f';
  const statusIcon = hasChanges ? (
    <span style={{ fontSize: 18 }}>⚡</span>
  ) : (
    <CheckCircleOutlined style={{ fontSize: 18, color: '#52c41a' }} />
  );

  const pushDiffColumns: ColumnsType<KeyDiffRow> = [
    {
      title: (
        <Checkbox
          checked={allFilteredSelected}
          indeterminate={!allFilteredSelected && someFilteredSelected}
          onChange={toggleSelectAll}
        />
      ),
      key: 'select',
      width: 40,
      render: (_: unknown, record: KeyDiffRow) => (
        <Checkbox
          checked={selectedRowKeys.has(record.id)}
          onChange={() => toggleRow(record.id)}
        />
      ),
    },
    {
      title: 'Namespace',
      dataIndex: 'namespace',
      key: 'ns',
      width: 130,
      ellipsis: true,
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (t: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag
          color={s === 'added' ? 'green' : s === 'deleted' ? 'red' : 'orange'}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Quality',
      key: 'quality',
      width: 80,
      render: (_: unknown, record: KeyDiffRow) => {
        if (record.minQualityScore === null)
          return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>;
        const level = record.worstQualityLevel ?? 'green';
        return (
          <span
            style={{
              color: QUALITY_COLOR[level] ?? '#bbb',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {record.minQualityScore}
          </span>
        );
      },
    },
    {
      title: 'Locales',
      key: 'locales',
      width: 160,
      render: (_: unknown, record: KeyDiffRow) => (
        <Space size={4} wrap>
          {record.localeEntries.map((e) => (
            <Tag key={e.locale} style={{ fontSize: 11, margin: 0 }}>
              {getFlagForCode(e.locale)} {e.locale}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      key: 'revert',
      width: 80,
      render: (_: unknown, record: KeyDiffRow) => (
        <Popconfirm
          title="Revert this change?"
          description="This key will be restored to its production value."
          onConfirm={() =>
            revertKeyMutation.mutate({ ns: record.namespace, key: record.key })
          }
          okText="Revert"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            icon={<RollbackOutlined />}
            loading={
              revertKeyMutation.isPending &&
              revertKeyMutation.variables?.key === record.key
            }
          >
            Revert
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {/* ── Git-style status panel ── */}
      <div
        style={{
          background: statusBg,
          border: `1px solid ${statusBorder}`,
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
        }}
      >
        <Row align="middle" justify="space-between" wrap={false}>
          <Col flex="auto">
            <Space align="center" size={10}>
              {statusIcon}
              <Space direction="vertical" size={2}>
                <Space size={6} align="center">
                  <Tag
                    color="blue"
                    style={{ fontFamily: 'monospace', margin: 0 }}
                  >
                    sandbox
                  </Tag>
                  <ArrowRightOutlined
                    style={{ color: '#8c8c8c', fontSize: 11 }}
                  />
                  <Tag
                    color="default"
                    style={{ fontFamily: 'monospace', margin: 0 }}
                  >
                    production
                  </Tag>
                </Space>
                {hasChanges ? (
                  <Text>
                    Sandbox is{' '}
                    <Text strong>
                      ahead by {total} change{total !== 1 ? 's' : ''}
                    </Text>
                    {total > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {' '}
                        (
                        {[
                          keyAdded > 0 ? `${keyAdded} added` : null,
                          keyChanged > 0 ? `${keyChanged} changed` : null,
                          keyDeleted > 0 ? `${keyDeleted} deleted` : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        )
                      </Text>
                    )}
                  </Text>
                ) : (
                  <Text type="success">
                    Sandbox is up to date with production — nothing to push.
                  </Text>
                )}
              </Space>
            </Space>
          </Col>
          <Col>
            {hasChanges && (
              <Space>
                <Popconfirm
                  title="Reset sandbox?"
                  description="All changes will be discarded. The sandbox will be re-copied from current production."
                  onConfirm={() => resetMutation.mutate()}
                  okText="Reset"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    icon={<SyncOutlined />}
                    loading={resetMutation.isPending}
                  >
                    Reset
                  </Button>
                </Popconfirm>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={handleOpenReview}
                >
                  Review Changes
                </Button>
              </Space>
            )}
          </Col>
        </Row>
      </div>

      {/* ── Shared entries table ── */}
      <EntriesTable
        projectSlug={projectSlug}
        queryKeyPrefix="sandbox-entries"
        fetchFn={fetchSandboxEntries}
        createFn={createSandboxEntry}
        updateFn={updateSandboxEntry}
        deleteFn={deleteSandboxEntry}
        enabled={!!status?.initialized}
        onMutationSuccess={invalidateSandbox}
        isSandbox
        deleteConfirmTitle="Remove this key from sandbox?"
        deleteConfirmDescription="The key will be marked for deletion and removed from production when you push."
        renderKeyExtra={(key, namespace) => {
          const rowStatus = keyStatusMap.get(`${namespace}/${key}`);
          return rowStatus ? (
            <Tag
              color={
                rowStatus === 'added'
                  ? 'green'
                  : rowStatus === 'deleted'
                    ? 'red'
                    : 'orange'
              }
              style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px' }}
            >
              {rowStatus}
            </Tag>
          ) : null;
        }}
        getRowProps={(record, namespace) => {
          const rowStatus = keyStatusMap.get(`${namespace}/${record.key}`);
          return rowStatus ? { style: { background: ROW_BG[rowStatus] } } : {};
        }}
        clientFilter={
          sandboxChangeFilter
            ? (record, namespace) => {
                const rowStatus = keyStatusMap.get(
                  `${namespace}/${record.key}`,
                );
                if (sandboxChangeFilter === 'unchanged') return !rowStatus;
                return rowStatus === sandboxChangeFilter;
              }
            : undefined
        }
        extraControls={
          <Col>
            <Select
              value={sandboxChangeFilter}
              onChange={setSandboxChangeFilter}
              style={{ width: 160 }}
              options={[
                { value: '', label: 'All changes' },
                { value: 'added', label: 'Added' },
                { value: 'changed', label: 'Changed' },
                { value: 'deleted', label: 'Deleted' },
                { value: 'unchanged', label: 'Unchanged' },
              ]}
            />
          </Col>
        }
      />

      {/* ── Push to Production modal ── */}
      <Modal
        open={pushModalOpen}
        title={
          <Space>
            <ArrowRightOutlined />
            <span>Review Changes</span>
          </Space>
        }
        onCancel={() => setPushModalOpen(false)}
        width={1100}
        footer={[
          <Button key="cancel" onClick={() => setPushModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="push"
            type="primary"
            icon={<ArrowRightOutlined />}
            loading={
              promoteMutation.isPending || promoteSelectiveMutation.isPending
            }
            disabled={selectedCount === 0}
            onClick={handlePromoteSelected}
          >
            Push {selectedCount} of {total} key{total !== 1 ? 's' : ''} to
            Production
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          style={{ marginBottom: 12 }}
          message="Review and select changes to push. A snapshot of current production will be saved automatically."
          showIcon
        />

        {/* Summary tags */}
        <Space style={{ marginBottom: 12 }}>
          <Tag color="green" style={{ fontSize: 13, padding: '2px 10px' }}>
            +{keyAdded} added
          </Tag>
          <Tag color="orange" style={{ fontSize: 13, padding: '2px 10px' }}>
            {keyChanged} changed
          </Tag>
          <Tag color="red" style={{ fontSize: 13, padding: '2px 10px' }}>
            −{keyDeleted} deleted
          </Tag>
          {selectedCount < total && (
            <Tag color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>
              {selectedCount} selected
            </Tag>
          )}
        </Space>

        {/* Filters row */}
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col>
            <Select
              value={reviewStatusFilter}
              onChange={(v) => {
                setReviewStatusFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 140 }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'added', label: 'Added' },
                { value: 'changed', label: 'Changed' },
                { value: 'deleted', label: 'Deleted' },
              ]}
            />
          </Col>
          <Col>
            <Select
              value={reviewNsFilter}
              onChange={(v) => {
                setReviewNsFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 180 }}
              options={[
                { value: '', label: 'All namespaces' },
                ...reviewNamespaces.map((ns) => ({ value: ns, label: ns })),
              ]}
            />
          </Col>
          <Col>
            <Select
              value={reviewQualityFilter}
              onChange={(v) => {
                setReviewQualityFilter(v);
                setReviewPage(1);
              }}
              style={{ width: 150 }}
              options={[
                { value: '', label: 'All qualities' },
                { value: 'green', label: 'Green' },
                { value: 'yellow', label: 'Yellow' },
                { value: 'red', label: 'Red' },
                { value: 'unchecked', label: 'Not checked' },
                { value: 'needs_context', label: 'Needs Context' },
              ]}
            />
          </Col>
        </Row>

        <Table<KeyDiffRow>
          rowKey="id"
          columns={pushDiffColumns}
          dataSource={paginatedDiffRows}
          size="small"
          scroll={{ x: true, y: 420 }}
          pagination={{
            current: reviewPage,
            pageSize: REVIEW_PAGE_SIZE,
            total: filteredDiffRows.length,
            onChange: setReviewPage,
            showTotal: (t) => `${t} keys`,
            size: 'small',
          }}
          sticky
          expandable={{
            expandedRowRender: (record) => (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 80,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Locale
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 80,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        width: 60,
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Quality
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Production
                    </th>
                    <th
                      style={{
                        padding: '4px 8px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#666',
                      }}
                    >
                      Sandbox
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {record.localeEntries.map((e) => (
                    <tr
                      key={e.locale}
                      style={{ borderTop: '1px solid #f0f0f0' }}
                    >
                      <td style={{ padding: '4px 8px' }}>
                        <Tag style={{ fontSize: 11, margin: 0 }}>
                          {getFlagForCode(e.locale)} {e.locale}
                        </Tag>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <Tag
                          color={
                            e.status === 'added'
                              ? 'green'
                              : e.status === 'deleted'
                                ? 'red'
                                : 'orange'
                          }
                          style={{ fontSize: 11, margin: 0 }}
                        >
                          {e.status}
                        </Tag>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {e.quality?.score != null ? (
                          <Tooltip title={e.quality.comment ?? undefined}>
                            <span
                              style={{
                                color:
                                  QUALITY_COLOR[e.quality.level ?? ''] ??
                                  '#bbb',
                                fontWeight: 600,
                                fontSize: 11,
                                cursor: e.quality.comment ? 'help' : 'default',
                              }}
                            >
                              {e.quality.score}
                            </span>
                          </Tooltip>
                        ) : (
                          <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          color: '#888',
                          maxWidth: 240,
                          wordBreak: 'break-word',
                        }}
                      >
                        {e.productionValue ?? (
                          <span style={{ color: '#ccc', fontStyle: 'italic' }}>
                            —
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '4px 8px',
                          maxWidth: 240,
                          wordBreak: 'break-word',
                        }}
                      >
                        {e.sandboxValue != null ? (
                          <span style={{ color: '#237804', fontWeight: 500 }}>
                            {e.sandboxValue}
                          </span>
                        ) : (
                          <span
                            style={{ color: '#cf1322', fontStyle: 'italic' }}
                          >
                            deleted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
            rowExpandable: () => true,
          }}
        />
      </Modal>
    </>
  );
};

// ─── Production Tab ──────────────────────────────────────────────────────────

interface ProductionTabProps {
  projectSlug: string;
}

const ProductionTab: React.FC<ProductionTabProps> = ({ projectSlug }) => {
  const qc = useQueryClient();
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');

  const { data: snapshots = [] } = useQuery<Snapshot[]>({
    queryKey: ['sandbox-snapshots', projectSlug],
    queryFn: () => fetchSnapshots(projectSlug),
    enabled: !!projectSlug && revertModalOpen,
  });

  const revertMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      apiClient
        .post(`/translations/projects/${projectSlug}/sandbox/revert`, {
          snapshotId,
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      message.success(`Reverted — ${data.restored} entries restored`);
      qc.invalidateQueries({ queryKey: ['entries', projectSlug] });
      setRevertModalOpen(false);
      setSelectedSnapshotId('');
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Revert failed'),
  });

  if (!projectSlug)
    return <Empty description="Select a project" style={{ marginTop: 48 }} />;

  return (
    <>
      <EntriesTable
        projectSlug={projectSlug}
        queryKeyPrefix="entries"
        fetchFn={fetchEntries}
        createFn={createEntry}
        updateFn={updateEntry}
        deleteFn={deleteEntry}
        extraControls={
          <Col>
            <Button
              icon={<RollbackOutlined />}
              onClick={() => {
                setSelectedSnapshotId('');
                setRevertModalOpen(true);
              }}
            >
              Revert to snapshot
            </Button>
          </Col>
        }
      />

      <Modal
        open={revertModalOpen}
        title="Revert production to snapshot"
        onCancel={() => {
          setRevertModalOpen(false);
          setSelectedSnapshotId('');
        }}
        onOk={() => {
          if (selectedSnapshotId) revertMutation.mutate(selectedSnapshotId);
        }}
        confirmLoading={revertMutation.isPending}
        okText="Revert"
        okButtonProps={{ danger: true, disabled: !selectedSnapshotId }}
        width={600}
      >
        <Alert
          type="warning"
          message="This replaces current production values with those from the selected snapshot."
          style={{ marginBottom: 16 }}
          showIcon
        />
        {snapshots.length === 0 ? (
          <Empty description="No snapshots available" />
        ) : (
          <Table<Snapshot>
            rowKey="id"
            dataSource={snapshots}
            size="small"
            pagination={false}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedSnapshotId ? [selectedSnapshotId] : [],
              onChange: (keys) => setSelectedSnapshotId(keys[0] as string),
            }}
            columns={[
              {
                title: 'Label',
                dataIndex: 'label',
                key: 'label',
                render: (v: string | null) => v ?? '—',
              },
              {
                title: 'Created',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (v: string) => new Date(v).toLocaleString(),
              },
              {
                title: 'Entries',
                dataIndex: 'entryCount',
                key: 'entryCount',
                width: 80,
              },
            ]}
          />
        )}
      </Modal>
    </>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const TranslationsPage: React.FC = () => {
  const [projectSlug, setProjectSlug] = useState(
    () => localStorage.getItem('translations_projectSlug') || '',
  );
  const [activeTab, setActiveTab] = useState('sandbox');

  const handleProjectChange = (val: string) => {
    setProjectSlug(val);
    localStorage.setItem('translations_projectSlug', val);
  };

  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    Project[]
  >({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  React.useEffect(() => {
    if (projects.length > 0 && !projectSlug) {
      const first = projects[0].slug;
      setProjectSlug(first);
      localStorage.setItem('translations_projectSlug', first);
    }
  }, [projects, projectSlug]);

  const tabItems = [
    {
      key: 'sandbox',
      label: 'Sandbox',
      children: <SandboxTab projectSlug={projectSlug} />,
    },
    {
      key: 'production',
      label: 'Production',
      children: projectSlug ? (
        <ProductionTab projectSlug={projectSlug} />
      ) : (
        <Empty description="Select a project" style={{ marginTop: 48 }} />
      ),
    },
  ];

  return (
    <div>
      <Row align="middle" gutter={16} style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Translations
          </Title>
        </Col>
        <Col>
          <Select
            placeholder="Select project"
            loading={projectsLoading}
            value={projectSlug || undefined}
            onChange={handleProjectChange}
            style={{ width: 200 }}
            options={projects.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </Col>
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        destroyOnHidden={false}
      />
    </div>
  );
};

export default TranslationsPage;
