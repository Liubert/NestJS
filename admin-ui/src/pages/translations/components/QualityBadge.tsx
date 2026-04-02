import React from 'react';
import { Tooltip, Popconfirm, message } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { QualityBadgeProps } from './types';
import {
  markExpected,
  unmarkExpected,
  markSandboxExpected,
  unmarkSandboxExpected,
} from './api';

// ─── Constants ───────────────────────────────────────────────────────────────

export const AI_LOCALES = ['uk', 'nb-NO', 'sv', 'da-DK'];

export const QUALITY_CONFIG = {
  green: { color: 'success', label: 'Good' },
  yellow: { color: 'warning', label: 'Review' },
  red: { color: 'error', label: 'Poor' },
  expected: { color: 'processing', label: 'Expected' },
} as const;

export const QUALITY_COLOR: Record<string, string> = {
  green: '#52c41a',
  yellow: '#faad14',
  red: '#ff4d4f',
  expected: '#1677ff',
};

// ─── Quality Badge ────────────────────────────────────────────────────────────

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

  if (info.reviewState === 'skipped') {
    return (
      <Tooltip title="Quality check skipped — scored 100 by default">
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#1677ff',
            flexShrink: 0,
          }}
        />
      </Tooltip>
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

export default QualityBadge;
