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
  failed: '#fa8c16', // orange — system error, not quality judgment
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
        <SyncOutlined spin style={{ color: '#8c8c8c', fontSize: 12 }} />
      </Tooltip>
    );
  }

  if (info.reviewState === 'failed') {
    return (
      <Tooltip title="Quality review failed — will retry">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
          <WarningOutlined style={{ color: '#fa8c16', fontSize: 12 }} />
          <span style={{ fontSize: 12, color: '#fa8c16' }}>fail</span>
        </span>
      </Tooltip>
    );
  }

  if (info.reviewState === 'not_checked') {
    return (
      <Tooltip title="Not yet reviewed">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#d9d9d9',
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 12, color: '#bbb' }}>—</span>
        </span>
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
        cancelText="Keep expected"
      >
        {badge}
      </Popconfirm>
    );
  }

  if (info.reviewState === 'skipped') {
    return (
      <Tooltip title="Quality check skipped — scored 100 by default">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#1677ff',
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 12, color: '#1677ff' }}>skip</span>
        </span>
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: canInteract ? 'pointer' : 'help',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: QUALITY_COLOR[info.level ?? ''] ?? '#bbb',
            flexShrink: 0,
            display: 'inline-block',
          }}
        />
        <span style={{ fontSize: 12, color: QUALITY_COLOR[info.level ?? ''] ?? '#bbb' }}>
          {info.score ?? '?'}
        </span>
      </span>
    </Tooltip>
  );

  if (!canInteract) return badge;

  return (
    <Popconfirm
      title="Confirm this translation?"
      description="This translation will be marked as correct and skip future revalidation."
      onConfirm={async () => {
        try {
          if (isSandbox)
            await markSandboxExpected(slug, namespace, entryKey, locale);
          else await markExpected(slug, namespace, entryKey, locale);
          message.success('Translation confirmed');
          onUpdate?.();
        } catch {
          message.error('Failed to confirm');
        }
      }}
      okText="Confirm"
      cancelText="Cancel"
    >
      {badge}
    </Popconfirm>
  );
};

export default QualityBadge;
