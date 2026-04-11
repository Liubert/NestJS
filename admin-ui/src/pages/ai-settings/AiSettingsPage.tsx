import React from 'react';
import { Tabs, Typography } from 'antd';
import { RobotOutlined, MessageOutlined, EyeOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import AiConfigPage from '../ai-config/AiConfigPage';
import { McpPromptsPage } from '../mcp-prompts/McpPromptsPage';
import PromptPreview from './PromptPreview';

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
          {
            key: 'prompt-preview',
            label: (
              <span>
                <EyeOutlined /> Prompt Preview
              </span>
            ),
            children: <PromptPreview />,
          },
        ]}
      />
    </div>
  );
};

export default AiSettingsPage;
