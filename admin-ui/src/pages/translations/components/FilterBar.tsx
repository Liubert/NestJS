import React from 'react';
import { Row, Col, Select, Input, Button } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import type { FilterBarProps } from './types';

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const QUALITY_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'level:green', label: 'Good (80-100)' },
  { value: 'level:yellow', label: 'Review (50-80)' },
  { value: 'level:red', label: 'Poor (0-50)' },
  { value: 'level:unchecked', label: 'Not checked' },
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
          options={namespaces.map((ns: string) => ({
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
        <Select
          value={qualityFilter || ''}
          onChange={onQualityFilterChange}
          style={{ width: 180 }}
          placeholder="Filter by quality"
          options={QUALITY_FILTER_OPTIONS}
        />
      </Col>
      <Col>
        <Select
          value={sortBy}
          onChange={onSortByChange}
          style={{ width: 160 }}
          options={[
            { value: 'key', label: 'Sort: Key' },
            { value: 'createdAt', label: 'Sort: Created' },
            { value: 'qualityScore', label: 'Sort: Quality' },
          ]}
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
    </Row>
  );
};

export default FilterBar;
