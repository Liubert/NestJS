import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isMustChange = user?.mustChangePassword === true;

  const onFinish = async (values: {
    currentPassword: string;
    newPassword: string;
    confirm: string;
  }) => {
    if (values.newPassword !== values.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password changed successfully');
      // Clear mustChangePassword flag from local storage
      const updatedUser = { ...user, mustChangePassword: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      navigate('/');
      window.location.reload();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card
        title={isMustChange ? 'Set your password' : 'Change password'}
        style={{ width: 420 }}
      >
        {isMustChange && (
          <Alert
            type="warning"
            message="You must set a new password before continuing."
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}
        <Form onFinish={onFinish} layout="vertical">
          {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
          <Form.Item
            name="currentPassword"
            label="Current password"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Current password" size="large" />
          </Form.Item>
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
            label="Confirm new password"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Repeat new password" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ width: '100%' }} size="large" loading={loading}>
              Change password
            </Button>
          </Form.Item>
          {!isMustChange && (
            <div style={{ textAlign: 'center' }}>
              <Button type="link" onClick={() => navigate(-1)}>Cancel</Button>
            </div>
          )}
        </Form>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
