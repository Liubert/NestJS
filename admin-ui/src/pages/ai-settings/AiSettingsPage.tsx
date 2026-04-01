import React from 'react';
import { Tabs, Typography } from 'antd';
import { RobotOutlined, MessageOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import AiConfigPage from '../ai-config/AiConfigPage';
import { McpPromptsPage } from '../mcp-prompts/McpPromptsPage';

const AiSettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'ai-config';

  const handleTabChange = (key: string) => {
    setSearchParams(key === 'ai-config' ? {} : { tab: key }, { replace: true });
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        AI Settings
      </Typography.Title>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'ai-config',
            label: (
              <span>
                <RobotOutlined /> AI Config
              </span>
            ),
            children: <AiConfigPage />,
          },
          {
            key: 'mcp-prompts',
            label: (
              <span>
                <MessageOutlined /> MCP Prompts
              </span>
            ),
            children: <McpPromptsPage />,
          },
        ]}
      />
    </div>
  );
};

export default AiSettingsPage;
