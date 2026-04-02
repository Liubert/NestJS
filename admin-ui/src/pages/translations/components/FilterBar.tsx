import React from 'react';
import { Row, Col, Select, Input, Button } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import type { FilterBarProps } from './types';

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const FilterBar: React.FC<FilterBarProps> = ({
  namespace,
  namespaces,
  onNamespaceChange,
  searchInput,
  onSearchInputChange,
  onSearch,
  qualityLevel,
  onQualityLevelChange,
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
          value={qualityLevel || ''}
          onChange={onQualityLevelChange}
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
