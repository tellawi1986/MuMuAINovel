import { Modal, Timeline, Tag, Empty, Spin, Button, Space, Typography, theme } from 'antd';
import {
  BellOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  PushpinFilled,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { Announcement, AnnouncementLevel } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

const { Paragraph, Text, Title } = Typography;

interface AnnouncementTimelineModalProps {
  visible: boolean;
  announcements: Announcement[];
  loading?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
}

const levelConfig: Record<AnnouncementLevel, { color: string; label: string; icon: React.ReactNode }> = {
  info: { color: 'blue', label: 'Info', icon: <InfoCircleOutlined /> },
  success: { color: 'green', label: 'Success', icon: <CheckCircleOutlined /> },
  warning: { color: 'orange', label: 'Warning', icon: <WarningOutlined /> },
  error: { color: 'red', label: 'Important', icon: <CloseCircleOutlined /> },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'No time set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid time format';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AnnouncementTimelineModal({
  visible,
  announcements,
  loading = false,
  onClose,
  onRefresh,
  onMarkAllRead,
}: AnnouncementTimelineModalProps) {
  const { token } = theme.useToken();

  const handleClose = () => {
    onMarkAllRead();
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <BellOutlined />
          <span>System announcements</span>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={loading}
            title="Refresh announcements"
          />
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button key="close" type="primary" onClick={handleClose}>
          Close
        </Button>,
      ]}
      width={800}
      centered
      styles={{
        body: {
          maxHeight: '70vh',
          overflowY: 'auto',
          padding: '24px',
        },
      }}
    >
      <style>
        {`
          .announcement-timeline .ant-timeline-item-head-custom {
            background: transparent !important;
          }
        `}
      </style>
      {loading && announcements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="Loading announcements..." />
        </div>
      ) : announcements.length === 0 ? (
        <Empty description="No announcements yet" />
      ) : (
        <Timeline className="announcement-timeline">
          {announcements.map(item => {
            const config = levelConfig[item.level] || levelConfig.info;
            return (
              <Timeline.Item
                key={item.id}
                dot={
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'transparent',
                    border: `2px solid ${token.colorPrimary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: token.colorPrimary,
                  }}>
                    {item.pinned ? <PushpinFilled /> : <ExclamationCircleOutlined />}
                  </div>
                }
              >
                <div style={{ marginLeft: 10, paddingBottom: 18 }}>
                  <Space size="small" wrap style={{ marginBottom: 8 }}>
                    <Tag color={config.color} icon={config.icon}>{config.label}</Tag>
                    {item.pinned && <Tag color="gold" icon={<PushpinFilled />}>Pinned</Tag>}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {formatDateTime(item.publish_at || item.created_at)}
                    </Text>
                  </Space>

                  <Title level={5} style={{ margin: '0 0 8px' }}>
                    {item.title}
                  </Title>

                  {item.summary && (
                    <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                      {item.summary}
                    </Paragraph>
                  )}

                  <MarkdownRenderer content={item.content} compact />

                  {item.author_name && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Published by: {item.author_name}
                    </Text>
                  )}
                </div>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </Modal>
  );
}
