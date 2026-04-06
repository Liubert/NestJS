import React from 'react';
import { Row, Col, Select, Input, Button, Tooltip } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  FilterOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import type { FilterBarProps, NamespaceInfo } from './types';
import { QUALITY_COLOR } from './QualityBadge';

const scoreToLevel = (score: number) =>
  score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';

const nsLabel = ({ slug, avgScore }: NamespaceInfo) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {avgScore !== null && (
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
      <span style={{ fontSize: 11, color: QUALITY_COLOR[scoreToLevel(avgScore)], fontWeight: 500 }}>
        {avgScore}/100
      </span>
    )}
  </span>
);

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const QUALITY_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'level:green', label: 'Good (80-100)' },
  { value: 'level:yellow', label: 'Review (50-80)' },
  { value: 'level:red', label: 'Poor (0-50)' },
  { value: 'level:unchecked', label: 'Not checked yet' },
  { value: 'level:needs_context', label: 'Needs Context' },
  { value: 'state:skipped', label: 'Skipped' },
  { value: 'state:expected', label: 'Expected' },
  { value: 'state:failed', label: 'Failed' },
  { value: 'state:not_checked', label: 'Pending' },
];

const FilterBar: React.FC<FilterBarProps> = ({
  namespace,
  namespaces,
  onNamespaceChange,
  searchInput,
  onSearchInputChange,
  onSearch,
  qualityFilter,
  onQualityFilterChange,
  sortBy,
  onSortByChange,
  onAddKey,
  disabled,
  extraControls,
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
            label: nsLabel(ns),
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
        <Tooltip title="Filter by quality level">
          <Select
            value={qualityFilter || ''}
            onChange={onQualityFilterChange}
            style={{ width: 180 }}
            placeholder="Filter by quality"
            suffixIcon={<FilterOutlined />}
            options={QUALITY_FILTER_OPTIONS}
          />
        </Tooltip>
      </Col>
      <Col>
        <Tooltip title="Sort entries">
          <Select
            value={sortBy}
            onChange={onSortByChange}
            style={{ width: 160 }}
            suffixIcon={<SortAscendingOutlined />}
            options={[
              { value: 'key', label: 'Sort: Key' },
              { value: 'createdAt', label: 'Sort: Created' },
              { value: 'qualityScore', label: 'Sort: Quality score' },
            ]}
          />
        </Tooltip>
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
    </Row>
  );
};

export default FilterBar;
