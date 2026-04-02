import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { Space, Tooltip, Tag, Button, Popconfirm } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import QualityBadge, { QUALITY_COLOR } from './QualityBadge';
import type { Entry } from './types';
import { getFlagForCode } from '../../../constants/supported-languages';

// ─── Column Factory ───────────────────────────────────────────────────────────

export function buildColumns(
  locales: string[],
  projectSlug: string,
  namespace: string,
  isSandbox: boolean | undefined,
  onQualityUpdate: () => void,
  onEdit: (entry: Entry) => void,
  onDelete: (key: string) => void,
  renderKeyExtra?: (key: string, namespace: string) => React.ReactNode,
  deleteConfirmTitle?: string,
  deleteConfirmDescription?: string,
): ColumnsType<Entry> {
  return [
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
          {record.contextNeed === 'required' && !record.context && (
            <Tooltip
              title={`Context required — ${record.contextReason ?? 'ambiguous term'}. Quality scores capped.`}
            >
              <WarningOutlined
                style={{ color: '#ff4d4f', fontSize: 12, cursor: 'help' }}
              />
            </Tooltip>
          )}
          {record.contextNeed === 'useful' && !record.context && (
            <Tooltip
              title={`Context suggested — ${record.contextReason ?? 'would improve quality'}`}
            >
              <InfoCircleOutlined
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
              onUpdate={onQualityUpdate}
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
            onClick={() => onEdit(record)}
          />
          <Popconfirm
            title={deleteConfirmTitle ?? 'Delete this key?'}
            description={deleteConfirmDescription}
            onConfirm={() => onDelete(record.key)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];
}
