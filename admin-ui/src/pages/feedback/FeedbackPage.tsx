import React, { useState, useMemo } from 'react';
import {
  Table, Typography, Tag, Collapse, Badge, Space, Select,
  Row, Col, Spin, Pagination, Modal, Input, Button, Descriptions,
  message,
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { Title } = Typography;

interface FeedbackItem {
  id: string;
  userId: string;
  projectId: string | null;
  isMcpToken: boolean;
  category: string;
  toolOrEndpoint: string | null;
  actionAttempted: string | null;
  resultStatus: string | null;
  severity: string;
  message: string;
  suggestion: string | null;
  agentName: string | null;
  agentVersion: string | null;
  sessionId: string | null;
  createdAt: string;
  reviewed: boolean;
  reviewerNote: string | null;
  user: { id: string; email: string };
  project: { id: string; slug: string } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  bug: 'red',
  confusion: 'orange',
  missing_feature: 'blue',
  suggestion: 'green',
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'green',
};

const FeedbackPage: React.FC = () => {
  const qc = useQueryClient();

  const [category, setCategory] = useState<string | undefined>(undefined);
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const [reviewed, setReviewed] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingItem, setReviewingItem] = useState<FeedbackItem | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', category, severity, reviewed, page, limit],
    queryFn: async () => {
      const res = await apiClient.get('/feedback', {
        params: { category, severity, reviewed, page, limit },
      });
      return res.data as { items: FeedbackItem[]; total: number };
    },
  });

  const items: FeedbackItem[] = data?.items ?? [];
  const total = data?.total ?? 0;

  const reviewMutation = useMutation({
    mutationFn: (args: { id: string; reviewerNote: string }) =>
      apiClient.patch(`/feedback/${args.id}`, {
        reviewed: true,
        reviewerNote: args.reviewerNote,
      }),
    onSuccess: () => {
      message.success('Marked as reviewed');
      qc.invalidateQueries({ queryKey: ['feedback'] });
      setReviewModalOpen(false);
      setReviewerNote('');
      setReviewingItem(null);
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Error reviewing feedback'),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const item of items) {
      const key = item.user?.email ?? 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const columns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'date',
      width: 160,
      render: (val: string) => {
        const d = new Date(val);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      },
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 130,
      render: (val: string) => (
        <Tag color={CATEGORY_COLORS[val] ?? 'default'}>{val}</Tag>
      ),
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (val: string) => (
        <Tag color={SEVERITY_COLORS[val] ?? 'default'}>{val}</Tag>
      ),
    },
    {
      title: 'Tool/Endpoint',
      dataIndex: 'toolOrEndpoint',
      key: 'tool',
      width: 160,
      render: (val: string | null) => val || '\u2014',
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (val: string) =>
        val?.length > 80 ? val.slice(0, 80) + '...' : val,
    },
    {
      title: 'Status',
      dataIndex: 'resultStatus',
      key: 'status',
      width: 100,
      render: (val: string | null) =>
        val ? <Tag>{val}</Tag> : '\u2014',
    },
    {
      title: 'Reviewed',
      dataIndex: 'reviewed',
      key: 'reviewed',
      width: 90,
      render: (val: boolean) =>
        val ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, record: FeedbackItem) => (
        <Button
          size="small"
          onClick={() => {
            setReviewingItem(record);
            setReviewerNote(record.reviewerNote || '');
            setReviewModalOpen(true);
          }}
        >
          Review
        </Button>
      ),
    },
  ];

  const expandedRowRender = (record: FeedbackItem) => (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="Full Message">{record.message}</Descriptions.Item>
      {record.suggestion && (
        <Descriptions.Item label="Suggestion">{record.suggestion}</Descriptions.Item>
      )}
      <Descriptions.Item label="Agent Name">
        {record.agentName || '\u2014'}
      </Descriptions.Item>
      <Descriptions.Item label="Agent Version">
        {record.agentVersion || '\u2014'}
      </Descriptions.Item>
      <Descriptions.Item label="Session ID">
        {record.sessionId || '\u2014'}
      </Descriptions.Item>
      <Descriptions.Item label="Project">
        {record.project?.slug || '\u2014'}
      </Descriptions.Item>
      {record.reviewerNote && (
        <Descriptions.Item label="Reviewer Note">
          {record.reviewerNote}
        </Descriptions.Item>
      )}
    </Descriptions>
  );

  const collapseItems = Array.from(grouped.entries()).map(([email, groupItems]) => ({
    key: email,
    label: (
      <Space>
        <span>{email}</span>
        <Badge count={groupItems.length} />
        {groupItems.some((i) => i.isMcpToken) && (
          <Tag color="green">MCP</Tag>
        )}
      </Space>
    ),
    children: (
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={groupItems}
        pagination={false}
        expandable={{ expandedRowRender }}
      />
    ),
  }));

  return (
    <div>
      <Title level={3}>Feedback</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            style={{ width: 180 }}
            placeholder="Category"
            allowClear
            value={category}
            onChange={(val) => {
              setCategory(val);
              setPage(1);
            }}
            options={[
              { value: 'bug', label: 'Bug' },
              { value: 'confusion', label: 'Confusion' },
              { value: 'missing_feature', label: 'Missing Feature' },
              { value: 'suggestion', label: 'Suggestion' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Col>
        <Col>
          <Select
            style={{ width: 180 }}
            placeholder="Severity"
            allowClear
            value={severity}
            onChange={(val) => {
              setSeverity(val);
              setPage(1);
            }}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Col>
        <Col>
          <Select
            style={{ width: 180 }}
            placeholder="Reviewed"
            allowClear
            value={reviewed}
            onChange={(val) => {
              setReviewed(val);
              setPage(1);
            }}
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </Col>
      </Row>

      {isLoading ? (
        <Spin />
      ) : (
        <Collapse accordion items={collapseItems} />
      )}

      <Pagination
        current={page}
        pageSize={limit}
        total={total}
        onChange={(p) => setPage(p)}
        style={{ marginTop: 16, textAlign: 'right' }}
        showSizeChanger={false}
      />

      <Modal
        title="Review Feedback"
        open={reviewModalOpen}
        onCancel={() => {
          setReviewModalOpen(false);
          setReviewingItem(null);
          setReviewerNote('');
        }}
        onOk={() => {
          if (reviewingItem) {
            reviewMutation.mutate({
              id: reviewingItem.id,
              reviewerNote,
            });
          }
        }}
        confirmLoading={reviewMutation.isPending}
      >
        <Input.TextArea
          rows={3}
          value={reviewerNote}
          onChange={(e) => setReviewerNote(e.target.value)}
          placeholder="Add a note (optional)"
        />
      </Modal>
    </div>
  );
};

export default FeedbackPage;
