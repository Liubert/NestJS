import React from 'react';
import { ConfigProvider, Layout, Menu, theme, Avatar, Dropdown, Space } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import {
  TranslationOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import TranslationsPage from './pages/translations/TranslationsPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectSettingsPage from './pages/projects/ProjectSettingsPage';
import UsersPage from './pages/users/UsersPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

const { Header, Content, Sider } = Layout;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const userMenu = {
    items: [
      {
        key: 'change-password',
        icon: <UserOutlined />,
        label: 'Change password',
        onClick: () => navigate('/change-password'),
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Logout',
        onClick: handleLogout,
      },
    ],
  };

  const menuItems = [
    {
      key: '/projects',
      icon: <AppstoreOutlined />,
      label: <Link to="/projects">Projects</Link>,
    },
    {
      key: '/translations',
      icon: <TranslationOutlined />,
      label: <Link to="/translations">Translations</Link>,
    },
    ...(isAdmin
      ? [
          {
            key: '/users',
            icon: <TeamOutlined />,
            label: <Link to="/users">Users</Link>,
          },
        ]
      : []),
  ];

  // Highlight parent route for /projects/:slug
  const selectedKey = location.pathname.startsWith('/projects')
    ? '/projects'
    : location.pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 32, margin: 16, background: 'rgba(255,255,255,0.2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
          LOCALIZATION SYSTEM
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown menu={userMenu}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.firstName || user?.email}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px 0' }}>
          <div style={{ padding: 24, minHeight: 360, background: colorBgContainer, borderRadius: borderRadiusLG }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

// Standalone page for change-password (outside AppLayout so it works after forced redirect)
const ChangePasswordPage = React.lazy(() => import('./pages/auth/ChangePasswordPage'));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/change-password"
              element={
                <PrivateRoute>
                  <React.Suspense fallback={null}>
                    <ChangePasswordPage />
                  </React.Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="*"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/translations" replace />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/:slug" element={<ProjectSettingsPage />} />
                      <Route path="/translations" element={<TranslationsPage />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/locales" element={<Navigate to="/projects" replace />} />
                    </Routes>
                  </AppLayout>
                </PrivateRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
