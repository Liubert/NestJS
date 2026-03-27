import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, Space } from 'antd';
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';

const { Text } = Typography;

const ForgotPasswordPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  // Phase 1: shows the raw token so admin can pass it to the user manually
  const [result, setResult] = useState<{ token: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post('/auth/forgot-password', { email: values.email });
      setResult(res.data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="Reset password" style={{ width: 420 }}>
        {result ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="Temporary: email delivery not configured"
              description={result.note}
            />
            {result.token ? (
              <>
                <Text>Reset token (pass to the user via a secure channel):</Text>
                <Input.TextArea
                  value={result.token}
                  readOnly
                  autoSize
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Text type="secondary">
                  Direct the user to{' '}
                  <Link to={`/reset-password?token=${result.token}`}>
                    /reset-password
                  </Link>{' '}
                  with this token.
                </Text>
              </>
            ) : (
              <Text type="secondary">No account found for that email.</Text>
            )}
            <Link to="/login">
              <Button icon={<ArrowLeftOutlined />}>Back to login</Button>
            </Link>
          </Space>
        ) : (
          <Form onFinish={onFinish} layout="vertical">
            {error && (
              <Alert type="error" message={error} style={{ marginBottom: 16 }} />
            )}
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input prefix={<MailOutlined />} placeholder="user@example.com" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" style={{ width: '100%' }} size="large" loading={loading}>
                Request reset token
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link to="/login">Back to login</Link>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
