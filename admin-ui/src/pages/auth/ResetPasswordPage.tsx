import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';

const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token') ?? '';

  const onFinish = async (values: { newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword: values.newPassword,
      });
      message.success('Password reset successfully. Please log in.');
      navigate('/login');
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Reset failed — token may be expired or already used');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="Set new password" style={{ width: 400 }}>
        {!token && (
          <Alert
            type="error"
            message="Missing reset token"
            description="Open the reset link you received — it must contain a token parameter."
            style={{ marginBottom: 16 }}
          />
        )}
        <Form onFinish={onFinish} layout="vertical">
          {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
          <Form.Item
            name="newPassword"
            label="New password"
            rules={[
              { required: true, message: 'Required' },
              { min: 8, message: 'At least 8 characters' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="New password" size="large" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm password"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Repeat password" size="large" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              style={{ width: '100%' }}
              size="large"
              loading={loading}
              disabled={!token}
            >
              Set new password
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Link to="/login">Back to login</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
