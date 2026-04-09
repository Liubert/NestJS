import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { Space, Tooltip, Tag, Button, Popconfirm, Typography } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import QualityBadge, { QUALITY_COLOR } from './QualityBadge';
import type { Entry } from './types';

// ─── Filter label helpers ─────────────────────────────────────────────────────

const dot = (color: string) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: color,
      marginRight: 7,
      flexShrink: 0,
    }}
  />
);

const filterLabel = (icon: React.ReactNode, text: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
    {icon}
    {text}
  </span>
);

const QUALITY_FILTERS = [
  { text: filterLabel(dot(QUALITY_COLOR.green), 'Good'), value: 'level:green' },
  { text: filterLabel(dot(QUALITY_COLOR.yellow), 'Review'), value: 'level:yellow' },
  { text: filterLabel(dot(QUALITY_COLOR.red), 'Poor'), value: 'level:red' },
  { text: filterLabel(dot('#d9d9d9'), 'Unchecked'), value: 'level:unchecked' },
  { text: filterLabel(dot('#8c8c8c'), 'Needs context'), value: 'level:needs_context' },
  { text: filterLabel(<MinusCircleOutlined style={{ color: '#8c8c8c', marginRight: 7 }} />, 'Skipped'), value: 'state:skipped' },
  { text: filterLabel(<CheckCircleOutlined style={{ color: QUALITY_COLOR.expected, marginRight: 7 }} />, 'Expected'), value: 'state:expected' },
  { text: filterLabel(<CloseCircleOutlined style={{ color: QUALITY_COLOR.failed, marginRight: 7 }} />, 'Failed'), value: 'state:failed' },
  { text: filterLabel(<StopOutlined style={{ color: '#bbb', marginRight: 7 }} />, 'Pending'), value: 'state:not_checked' },
];

const { Text } = Typography;

// ─── Column Factory ───────────────────────────────────────────────────────────

export function buildColumns(
  locales: string[],
  projectSlug: string,
  namespace: string,
  isSandbox: boolean | undefined,
  onQualityUpdate: () => void,
  onEdit: ((entry: Entry) => void) | undefined,
  onDelete: ((key: string) => void) | undefined,
  getFlagForCode: (code: string) => string,
  renderKeyExtra?: (key: string, namespace: string) => React.ReactNode,
  deleteConfirmTitle?: string,
  deleteConfirmDescription?: string,
  onResetLocale?: (locale: string) => void,
  defaultLocale?: string,
): ColumnsType<Entry> {
  const readOnly = !onEdit && !onDelete;
  return [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      sorter: true,
      width: 200,
      fixed: 'left',
      render: (text: string, record: Entry) => (
        <Space size={6}>
          <Text
            style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 160, display: 'block' }}
            ellipsis={{ tooltip: text }}
          >
            {text}
          </Text>
          {record.context && (
            <Tooltip title={record.context}>
              <InfoCircleOutlined
                style={{ color: '#1677ff', fontSize: 12, cursor: 'help' }}
              />
            </Tooltip>
          )}
          {record.contextNeed === 'required' && !record.context && (
            <Tooltip
              title={record.contextReason ?? 'Ambiguous term — context required to ensure accurate translation. Quality scores are capped until context is added.'}
            >
              <Tag
                color="error"
                style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', cursor: 'help', marginLeft: 2 }}
              >
                needs context
              </Tag>
            </Tooltip>
          )}
          {record.contextNeed === 'useful' && !record.context && (
            <Tooltip
              title={record.contextReason ?? 'Context would improve translation quality'}
            >
              <Tag
                color="warning"
                style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', cursor: 'help', marginLeft: 2 }}
              >
                needs context
              </Tag>
            </Tooltip>
          )}
          {renderKeyExtra?.(text, namespace)}
        </Space>
      ),
    },
    ...locales.map((locale) => ({
      title: (
        <Space size={4}>
          <Tag color="blue">
            {getFlagForCode(locale)} {locale}
          </Tag>
          {isSandbox && onResetLocale && locale !== defaultLocale && (
            <Popconfirm
              title={`Reset "${locale}" translations?`}
              description="All sandbox translations for this locale will be deleted and re-translated automatically."
              onConfirm={() => onResetLocale(locale)}
              okText="Reset"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                icon={<SyncOutlined />}
                danger
                style={{ padding: '0 2px', height: 20, width: 20, minWidth: 20 }}
              />
            </Popconfirm>
          )}
        </Space>
      ),
      key: locale,
      width: 150,
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
              onUpdate={onQualityUpdate}
            />
            {val ? (
              <Text
                style={{ maxWidth: 110, display: 'block', fontSize: 12 }}
                ellipsis={{ tooltip: val }}
              >
                {val}
              </Text>
            ) : (
              <span style={{ color: '#d9d9d9', fontSize: 11 }}>—</span>
            )}
          </Space>
        );
      },
    })),
    {
      title: (
        <Tooltip title="Minimum quality score across all locales. Sort or filter to find worst translations.">
          Quality
        </Tooltip>
      ),
      key: 'qualityScore',
      dataIndex: 'qualityScore',
      sorter: true,
      filterMultiple: false,
      filters: QUALITY_FILTERS,
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
    ...(readOnly ? [] : [{
      title: '',
      key: 'actions',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: Entry) => (
        <Space size={4}>
          <Tooltip title="Edit translation">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit!(record)}
            />
          </Tooltip>
          <Popconfirm
            title={deleteConfirmTitle ?? 'Delete this key?'}
            description={deleteConfirmDescription}
            onConfirm={() => onDelete!(record.key)}
            okText="Delete Entry"
            okButtonProps={{ danger: true }}
            cancelText="Keep"
          >
            <Tooltip title="Delete key">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }]),
  ];
}
