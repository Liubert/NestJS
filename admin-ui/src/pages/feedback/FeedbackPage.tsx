import React, { useState } from 'react';
import {
  Table,
  Typography,
  Tag,
  Space,
  Select,
  Row,
  Col,
  Spin,
  Pagination,
  Modal,
  Input,
  Button,
  Descriptions,
  message,
  Tooltip,
  Dropdown,
  Popconfirm,
  Radio,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

const { Title } = Typography;

type FeedbackStatus = 'new' | 'planned' | 'done' | 'deferred' | 'rejected';

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
  agentModel: string | null;
  sessionId: string | null;
  createdAt: string;
  reviewed: boolean;
  reviewerNote: string | null;
  status: FeedbackStatus;
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

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  new: 'blue',
  planned: 'geekblue',
  done: 'green',
  deferred: 'gold',
  rejected: 'default',
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  planned: 'Planned',
  done: 'Done',
  deferred: 'Deferred',
  rejected: 'Rejected',
};

type StatusFilter = 'active' | FeedbackStatus;

const FeedbackPage: React.FC = () => {
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingItem, setReviewingItem] = useState<FeedbackItem | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');

  const queryStatus = statusFilter === 'active' ? undefined : statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', statusFilter, category, severity, page, limit],
    queryFn: async () => {
      const res = await apiClient.get('/feedback', {
        params: { category, severity, status: queryStatus, page, limit },
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

  const statusMutation = useMutation({
    mutationFn: (args: { id: string; status: FeedbackStatus }) =>
      apiClient.patch(`/feedback/${args.id}/status`, { status: args.status }),
    onSuccess: () => {
      message.success('Status updated');
      qc.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/${id}`),
    onSuccess: () => {
      message.success('Feedback deleted');
      qc.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: (e: any) =>
      message.error(e.response?.data?.message ?? 'Failed to delete feedback'),
  });

  const buildActionMenu = (record: FeedbackItem): MenuProps => ({
    items: [
      {
        key: 'done',
        icon: <CheckCircleOutlined />,
        label: 'Mark as Done',
        disabled: record.status === 'done',
        onClick: () => statusMutation.mutate({ id: record.id, status: 'done' }),
      },
      {
        key: 'planned',
        icon: <ClockCircleOutlined />,
        label: 'Mark as Planned',
        disabled: record.status === 'planned',
        onClick: () =>
          statusMutation.mutate({ id: record.id, status: 'planned' }),
      },
      {
        key: 'deferred',
        icon: <ClockCircleOutlined />,
        label: 'Move to Deferred',
        disabled: record.status === 'deferred',
        onClick: () =>
          statusMutation.mutate({ id: record.id, status: 'deferred' }),
      },
      {
        key: 'rejected',
        icon: <StopOutlined />,
        label: 'Reject',
        disabled: record.status === 'rejected',
        onClick: () =>
          statusMutation.mutate({ id: record.id, status: 'rejected' }),
      },
      { type: 'divider' },
      {
        key: 'review',
        label: 'Review...',
        onClick: () => {
          setReviewingItem(record);
          setReviewerNote(record.reviewerNote || '');
          setReviewModalOpen(true);
        },
      },
    ],
  });

  const expandedRowRender = (record: FeedbackItem) => (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="Full Message">{record.message}</Descriptions.Item>
      {record.actionAttempted && (
        <Descriptions.Item label="Action Attempted">
          {record.actionAttempted}
        </Descriptions.Item>
      )}
      {record.suggestion && (
        <Descriptions.Item label="Suggestion">{record.suggestion}</Descriptions.Item>
      )}
      <Descriptions.Item label="Agent Name">{record.agentName || '—'}</Descriptions.Item>
      <Descriptions.Item label="Agent Version">{record.agentVersion || '—'}</Descriptions.Item>
      <Descriptions.Item label="Agent Model">{record.agentModel || '—'}</Descriptions.Item>
      <Descriptions.Item label="Session ID">{record.sessionId || '—'}</Descriptions.Item>
      <Descriptions.Item label="Project">{record.project?.slug || '—'}</Descriptions.Item>
      {record.reviewerNote && (
        <Descriptions.Item label="Reviewer Note">{record.reviewerNote}</Descriptions.Item>
      )}
    </Descriptions>
  );

  const columns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'date',
      width: 150,
      render: (val: string) => {
        const d = new Date(val);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      },
    },
    {
      title: 'Source',
      key: 'source',
      width: 90,
      render: (_: unknown, record: FeedbackItem) => {
        const isAgent = !!record.agentName || record.isMcpToken;
        const label = isAgent
          ? record.agentModel || record.agentName || 'Agent'
          : 'User';
        return (
          <Tooltip title={label}>
            {isAgent ? (
              <Tag icon={<RobotOutlined />} color="purple">
                {record.agentName || 'MCP'}
              </Tag>
            ) : (
              <Tag icon={<UserOutlined />}>User</Tag>
            )}
          </Tooltip>
        );
      },
    },
    {
      title: 'Submitter',
      key: 'submitter',
      width: 160,
      render: (_: unknown, record: FeedbackItem) => record.user?.email ?? '—',
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
      width: 90,
      render: (val: string) => (
        <Tag color={SEVERITY_COLORS[val] ?? 'default'}>{val}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'workflowStatus',
      width: 100,
      render: (val: FeedbackStatus) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {STATUS_LABELS[val] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Tool/Endpoint',
      dataIndex: 'toolOrEndpoint',
      key: 'tool',
      width: 150,
      render: (val: string | null) => val || '—',
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      render: (val: string) =>
        val?.length > 300 ? val.slice(0, 300) + '...' : val,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: FeedbackItem) => (
        <Space>
          <Dropdown menu={buildActionMenu(record)} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />}>
              Actions
            </Button>
          </Dropdown>
          <Popconfirm
            title="Delete this feedback?"
            description="This action soft-deletes the item. It won't appear in normal views."
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleteMutation.isPending}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>Feedback</Title>

      <Row style={{ marginBottom: 16 }}>
        <Col>
          <Radio.Group
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="active">All Active</Radio.Button>
            <Radio.Button value="new">New</Radio.Button>
            <Radio.Button value="planned">Planned</Radio.Button>
            <Radio.Button value="done">Done</Radio.Button>
            <Radio.Button value="deferred">Deferred</Radio.Button>
            <Radio.Button value="rejected">Rejected</Radio.Button>
          </Radio.Group>
        </Col>
      </Row>

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
      </Row>

      {isLoading ? (
        <Spin />
      ) : (
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={items}
          pagination={false}
          expandable={{ expandedRowRender }}
        />
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
            reviewMutation.mutate({ id: reviewingItem.id, reviewerNote });
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
