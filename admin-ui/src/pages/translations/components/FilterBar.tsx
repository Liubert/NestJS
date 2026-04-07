import React from 'react';
import { Row, Col, Select, Input, Button, Dropdown, Tooltip, Badge } from 'antd';
import { SearchOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import type { FilterBarProps, NamespaceInfo } from './types';
import { QUALITY_COLOR } from './QualityBadge';

const scoreToLevel = (score: number) =>
  score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';

const nsLabel = (
  { slug, avgScore }: NamespaceInfo,
  hasChanges?: boolean,
) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {hasChanges && (
      <Badge color="orange" style={{ flexShrink: 0 }} />
    )}
    {avgScore !== null && !hasChanges && (
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: QUALITY_COLOR[scoreToLevel(avgScore)],
          flexShrink: 0,
          display: 'inline-block',
        }}
      />
    )}
    {slug}
    {avgScore !== null && (
      <Tooltip title="Avg quality score for all translations in this namespace">
        <span style={{ fontSize: 11, color: QUALITY_COLOR[scoreToLevel(avgScore)], fontWeight: 500, cursor: 'help' }}>
          {avgScore}/100
        </span>
      </Tooltip>
    )}
  </span>
);

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const FilterBar: React.FC<FilterBarProps> = ({
  namespace,
  namespaces,
  onNamespaceChange,
  searchInput,
  onSearchInputChange,
  onSearch,
  onAddKey,
  disabled,
  extraControls,
  settingsItems,
  onSettingsClick,
  changedNamespaces,
}) => {
  return (
    <Row gutter={12} style={{ marginBottom: 14 }}>
      <Col>
        <Select
          placeholder="Namespace"
          value={namespace || undefined}
          onChange={onNamespaceChange}
          style={{ width: 220 }}
          disabled={disabled}
          options={namespaces.map((ns) => ({
            value: ns.slug,
            label: nsLabel(ns, changedNamespaces?.has(ns.slug)),
          }))}
        />
      </Col>
      <Col flex="auto">
        <Input
          placeholder="Search by key or value..."
          prefix={<SearchOutlined />}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onPressEnter={onSearch}
          onBlur={onSearch}
          allowClear
          onClear={() => {
            onSearchInputChange('');
            onSearch();
          }}
          style={{ maxWidth: 360 }}
        />
      </Col>
      <Col>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!namespace}
          onClick={onAddKey}
        >
          Add key
        </Button>
      </Col>
      {extraControls}
      {settingsItems && settingsItems.length > 0 && (
        <Col>
          <Dropdown
            menu={{
              items: settingsItems as any,
              onClick: ({ key }) => onSettingsClick?.(key),
            }}
            trigger={['click']}
          >
            <Button icon={<SettingOutlined />} />
          </Dropdown>
        </Col>
      )}
    </Row>
  );
};

export default FilterBar;
