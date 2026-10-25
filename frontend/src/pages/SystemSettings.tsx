import { useCallback, useEffect, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Table, Tag, Tabs, Typography, message, theme } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { BellOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeInvisibleOutlined, MailOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { announcementApi, authApi, settingsApi } from '../services/api';
import type { Announcement, AnnouncementCreate, AnnouncementLevel, AnnouncementStatus, AnnouncementStatusResponse, AnnouncementUpdate, SystemSMTPSettings, SystemSMTPSettingsUpdate, User } from '../types';
import MarkdownRenderer from '../components/MarkdownRenderer';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea, Search } = Input;

const qqDefaults: Pick<SystemSMTPSettings, 'smtp_provider' | 'smtp_host' | 'smtp_port' | 'smtp_use_ssl' | 'smtp_use_tls'> = {
  smtp_provider: 'qq',
  smtp_host: 'smtp.qq.com',
  smtp_port: 465,
  smtp_use_ssl: true,
  smtp_use_tls: false,
};

const announcementLevelText: Record<AnnouncementLevel, string> = {
  info: 'Notice',
  success: 'Success',
  warning: 'Warning',
  error: 'Important',
};

const announcementLevelColor: Record<AnnouncementLevel, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
};

const announcementStatusText: Record<AnnouncementStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  hidden: 'Hidden',
};

const announcementStatusColor: Record<AnnouncementStatus, string> = {
  draft: 'default',
  published: 'green',
  hidden: 'red',
};

type AnnouncementStatusFilter = AnnouncementStatus | 'all';

interface AnnouncementFormValues {
  title: string;
  content: string;
  summary?: string;
  level: AnnouncementLevel;
  status: AnnouncementStatus;
  pinned?: boolean;
  publish_at?: Dayjs | null;
  expire_at?: Dayjs | null;
}

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm');
};

const toIsoStringOrNull = (value?: Dayjs | null) => {
  if (!value) {
    return null;
  }
  return value.toISOString();
};

export default function SystemSettingsPage() {
  const { token } = theme.useToken();
  const [form] = Form.useForm<SystemSMTPSettingsUpdate>();
  const [announcementForm] = Form.useForm<AnnouncementFormValues>();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTargetEmail, setTestTargetEmail] = useState('');
  const [announcementStatus, setAnnouncementStatus] = useState<AnnouncementStatusResponse | null>(null);
  const [announcementStatusLoading, setAnnouncementStatusLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [announcementStatusFilter, setAnnouncementStatusFilter] = useState<AnnouncementStatusFilter>('all');
  const [announcementSearchKeyword, setAnnouncementSearchKeyword] = useState('');
  const [announcementPagination, setAnnouncementPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const { current: announcementCurrentPage, pageSize: announcementPageSize } = announcementPagination;

  const announcementContent = Form.useWatch('content', announcementForm) || '';

  const pageBackground = `linear-gradient(180deg, ${token.colorBgLayout} 0%, ${token.colorFillSecondary} 100%)`;
  const headerBackground = `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`;
  const footerSafeOffset = 88;
  const announcementAdminAvailable = announcementStatus?.mode === 'server';

  const loadAnnouncementStatus = useCallback(async () => {
    setAnnouncementStatusLoading(true);
    try {
      const status = await announcementApi.getStatus();
      setAnnouncementStatus(status);
      return status;
    } catch (error) {
      console.error('加载公告服务状态失败:', error);
      message.error('Failed to load announcement service status.');
      return null;
    } finally {
      setAnnouncementStatusLoading(false);
    }
  }, []);

  const loadAnnouncements = useCallback(async (page: number, pageSize: number, keyword: string) => {
    if (!announcementAdminAvailable) {
      setAnnouncements([]);
      setAnnouncementPagination(prev => ({ ...prev, total: 0 }));
      return;
    }

    setAnnouncementLoading(true);
    try {
      const result = await announcementApi.adminList({
        status: announcementStatusFilter,
        q: keyword.trim() || undefined,
        page,
        limit: pageSize,
        include_expired: true,
      });
      setAnnouncements(result.data?.items || []);
      setAnnouncementPagination({
        current: result.data?.page || page,
        pageSize: result.data?.limit || pageSize,
        total: result.data?.total || 0,
      });
    } catch (error) {
      console.error('加载公告列表失败:', error);
      message.error('Failed to load announcements. Make sure this instance is in server mode and your account has administrator privileges.');
    } finally {
      setAnnouncementLoading(false);
    }
  }, [announcementAdminAvailable, announcementStatusFilter]);

  const loadData = async () => {
    setInitialLoading(true);
    try {
      const [user, smtpSettings, status] = await Promise.all([
        authApi.getCurrentUser(),
        settingsApi.getSystemSMTPSettings(),
        announcementApi.getStatus().catch(() => null),
      ]);
      setCurrentUser(user);
      setAnnouncementStatus(status);
      form.setFieldsValue(smtpSettings);
    } catch (error) {
      console.error('加载系统设置失败:', error);
      message.error('Failed to load system settings.');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentUser?.is_admin && announcementAdminAvailable) {
      void loadAnnouncements(announcementCurrentPage, announcementPageSize, announcementSearchKeyword);
    }
    if (currentUser?.is_admin && announcementStatus && !announcementAdminAvailable) {
      setAnnouncements([]);
      setAnnouncementPagination(prev => ({ ...prev, total: 0 }));
    }
  }, [currentUser?.is_admin, announcementAdminAvailable, announcementStatus, announcementStatusFilter, loadAnnouncements, announcementCurrentPage, announcementPageSize, announcementSearchKeyword]);

  const handleProviderChange = (value: string) => {
    if (value === 'qq') {
      form.setFieldsValue(qqDefaults);
    }
  };

  const handleSave = async (values: SystemSMTPSettingsUpdate) => {
    setSaving(true);
    try {
      const payload = values.smtp_provider === 'qq'
        ? {
            ...values,
            ...qqDefaults,
            smtp_username: values.smtp_username,
            smtp_password: values.smtp_password,
            smtp_from_email: values.smtp_from_email,
            smtp_from_name: values.smtp_from_name,
            email_auth_enabled: values.email_auth_enabled,
            email_register_enabled: values.email_register_enabled,
            verification_code_ttl_minutes: values.verification_code_ttl_minutes,
            verification_resend_interval_seconds: values.verification_resend_interval_seconds,
          }
        : values;
      const result = await settingsApi.updateSystemSMTPSettings(payload);
      form.setFieldsValue(result);
      message.success('System SMTP settings saved.');
    } catch (error) {
      console.error('保存系统设置失败:', error);
      message.error('Failed to save system settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const toEmail = testTargetEmail.trim();
    if (!toEmail) {
      message.warning('Enter a test recipient email address first.');
      return;
    }

    setTesting(true);
    try {
      const result = await settingsApi.testSystemSMTPSettings({ to_email: toEmail });
      if (result.success) {
        message.success(result.message);
      } else {
        message.error(result.message || 'SMTP test failed.');
      }
    } catch (error) {
      console.error('测试 SMTP 配置失败:', error);
      message.error('Failed to test SMTP settings.');
    } finally {
      setTesting(false);
    }
  };

  const openCreateAnnouncementModal = () => {
    if (!announcementAdminAvailable) {
      message.warning('Announcements can only be published in server mode.');
      return;
    }
    setEditingAnnouncement(null);
    announcementForm.setFieldsValue({
      title: '',
      summary: '',
      content: '',
      level: 'info',
      status: 'published',
      pinned: false,
      publish_at: dayjs(),
      expire_at: null,
    });
    setAnnouncementModalOpen(true);
  };

  const openEditAnnouncementModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    announcementForm.setFieldsValue({
      title: announcement.title,
      summary: announcement.summary || '',
      content: announcement.content,
      level: announcement.level,
      status: announcement.status || 'published',
      pinned: announcement.pinned,
      publish_at: announcement.publish_at ? dayjs(announcement.publish_at) : null,
      expire_at: announcement.expire_at ? dayjs(announcement.expire_at) : null,
    });
    setAnnouncementModalOpen(true);
  };

  const closeAnnouncementModal = () => {
    setAnnouncementModalOpen(false);
    setEditingAnnouncement(null);
    announcementForm.resetFields();
  };

  const validateAnnouncementWindow = (values: AnnouncementFormValues) => {
    if (values.publish_at && values.expire_at && !values.expire_at.isAfter(values.publish_at)) {
      message.warning('The expiration time must be later than the publication time.');
      return false;
    }
    return true;
  };

  const appendMarkdownSnippet = (snippet: string) => {
    const currentContent = announcementForm.getFieldValue('content') || '';
    const separator = currentContent && !currentContent.endsWith('\n') ? '\n\n' : '';
    announcementForm.setFieldsValue({ content: `${currentContent}${separator}${snippet}` });
  };

  const buildAnnouncementCreatePayload = (values: AnnouncementFormValues): AnnouncementCreate => {
    const publishAt = toIsoStringOrNull(values.publish_at);
    const expireAt = toIsoStringOrNull(values.expire_at);
    const payload: AnnouncementCreate = {
      title: values.title.trim(),
      content: values.content.trim(),
      summary: values.summary?.trim() || undefined,
      level: values.level,
      status: values.status,
      pinned: Boolean(values.pinned),
    };

    if (publishAt) {
      payload.publish_at = publishAt;
    }
    if (expireAt) {
      payload.expire_at = expireAt;
    }

    return payload;
  };

  const buildAnnouncementUpdatePayload = (values: AnnouncementFormValues): AnnouncementUpdate => ({
    title: values.title.trim(),
    content: values.content.trim(),
    summary: values.summary?.trim() || undefined,
    level: values.level,
    status: values.status,
    pinned: Boolean(values.pinned),
    publish_at: toIsoStringOrNull(values.publish_at),
    expire_at: toIsoStringOrNull(values.expire_at),
  });

  const handleSaveAnnouncement = async (values: AnnouncementFormValues) => {
    if (!validateAnnouncementWindow(values)) {
      return;
    }

    setAnnouncementSaving(true);
    try {
      if (editingAnnouncement) {
        await announcementApi.adminUpdate(editingAnnouncement.id, buildAnnouncementUpdatePayload(values));
        message.success('Announcement updated.');
      } else {
        await announcementApi.adminCreate(buildAnnouncementCreatePayload(values));
        message.success('Announcement created.');
      }
      closeAnnouncementModal();
      await loadAnnouncements(announcementPagination.current, announcementPagination.pageSize, announcementSearchKeyword);
    } catch (error) {
      console.error('保存公告失败:', error);
      message.error('Failed to save the announcement. Make sure this instance is in server mode and your account has administrator privileges.');
    } finally {
      setAnnouncementSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    try {
      await announcementApi.adminDelete(announcementId);
      message.success('Announcement deleted.');
      await loadAnnouncements(announcementPagination.current, announcementPagination.pageSize, announcementSearchKeyword);
    } catch (error) {
      console.error('删除公告失败:', error);
      message.error('Failed to delete the announcement.');
    }
  };

  const handleAnnouncementStatusChange = async (announcementId: string, action: 'publish' | 'hide') => {
    try {
      if (action === 'publish') {
        await announcementApi.adminPublish(announcementId);
        message.success('Announcement published.');
      } else {
        await announcementApi.adminHide(announcementId);
        message.success('Announcement hidden.');
      }
      await loadAnnouncements(announcementPagination.current, announcementPagination.pageSize, announcementSearchKeyword);
    } catch (error) {
      console.error('更新公告状态失败:', error);
      message.error('Failed to update announcement status.');
    }
  };

  const handleAnnouncementSearch = (value: string) => {
    const keyword = value.trim();
    setAnnouncementSearchKeyword(keyword);
    setAnnouncementPagination(prev => ({ ...prev, current: 1 }));
    void loadAnnouncements(1, announcementPagination.pageSize, keyword);
  };

  const handleAnnouncementTableChange = (pagination: TablePaginationConfig) => {
    const nextPage = pagination.current || 1;
    const nextPageSize = pagination.pageSize || announcementPagination.pageSize;
    void loadAnnouncements(nextPage, nextPageSize, announcementSearchKeyword);
  };

  const announcementColumns: ColumnsType<Announcement> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      render: (title: string, record) => (
        <Space direction="vertical" size={4}>
          <Space size={6} wrap>
            <Text strong>{title}</Text>
            {record.pinned && <Tag color="gold">Pinned</Tag>}
          </Space>
          {record.summary && <Text type="secondary" style={{ fontSize: 12 }}>{record.summary}</Text>}
        </Space>
      ),
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: AnnouncementLevel) => <Tag color={announcementLevelColor[level]}>{announcementLevelText[level]}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status?: AnnouncementStatus) => {
        const currentStatus = status || 'published';
        return <Tag color={announcementStatusColor[currentStatus]}>{announcementStatusText[currentStatus]}</Tag>;
      },
    },
    {
      title: 'Publish Time',
      dataIndex: 'publish_at',
      key: 'publish_at',
      width: 150,
      render: (value?: string | null) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
    {
      title: 'Expiration Time',
      dataIndex: 'expire_at',
      key: 'expire_at',
      width: 150,
      render: (value?: string | null) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
    {
      title: 'Author',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 120,
      render: (value?: string | null) => value || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 240,
      render: (_, record) => {
        const currentStatus = record.status || 'published';
        return (
          <Space size="small" wrap>
            <Button size="small" icon={<EditOutlined />} disabled={!announcementAdminAvailable} onClick={() => openEditAnnouncementModal(record)}>
              Edit
            </Button>
            {currentStatus !== 'published' ? (
              <Button size="small" type="primary" icon={<SendOutlined />} disabled={!announcementAdminAvailable} onClick={() => void handleAnnouncementStatusChange(record.id, 'publish')}>
                Publish
              </Button>
            ) : (
              <Button size="small" icon={<EyeInvisibleOutlined />} disabled={!announcementAdminAvailable} onClick={() => void handleAnnouncementStatusChange(record.id, 'hide')}>
                Hide
              </Button>
            )}
            <Popconfirm
              title="Delete Announcement"
              description="Clients will no longer sync this announcement after it is deleted. Are you sure?"
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDeleteAnnouncement(record.id)}
              disabled={!announcementAdminAvailable}
            >
              <Button size="small" danger icon={<DeleteOutlined />} disabled={!announcementAdminAvailable}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  if (initialLoading) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: token.colorBgLayout }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!currentUser?.is_admin) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message="Access denied" description="Only administrators can access system settings." />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: `calc(100vh - ${footerSafeOffset}px)`,
        boxSizing: 'border-box',
        background: pageBackground,
        padding: 24,
        paddingBottom: footerSafeOffset,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      <Card
        bordered={false}
        style={{
          marginBottom: 24,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: `0 12px 32px ${token.colorFillSecondary}`,
        }}
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ background: headerBackground, padding: '28px 32px', color: '#fff' }}>
          <Space direction="vertical" size={6}>
            <Space>
              <SettingOutlined />
              <Title level={3} style={{ color: '#fff', margin: 0 }}>System Settings</Title>
            </Space>
            <Paragraph style={{ color: 'rgba(255,255,255,0.88)', margin: 0 }}>
              Administrators only. Configure SMTP email, email registration, and server announcements.
            </Paragraph>
          </Space>
        </div>
      </Card>

      <Tabs
        defaultActiveKey="smtp"
        items={[
          {
            key: 'smtp',
            label: (
              <Space>
                <MailOutlined />
                SMTP Settings
              </Space>
            ),
            children: (
              <Form form={form} layout="vertical" onFinish={handleSave}>
                <Row gutter={24}>
                  <Col xs={24} xl={16}>
                    <Card title="Email Service Configuration" bordered={false} style={{ borderRadius: 16 }}>
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 20 }}
                        message="QQ Mail Configuration"
                        description="If you use QQ Mail, enter your full QQ email address as the username and an SMTP authorization code—not your QQ login password—as the password. The recommended defaults are smtp.qq.com with SSL on port 465."
                      />

                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_provider" label="Email Provider" rules={[{ required: true, message: 'Select an email provider' }]}>
                            <Select onChange={handleProviderChange}>
                              <Option value="qq">QQ Mail</Option>
                              <Option value="custom">Custom SMTP</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_host" label="SMTP Host" rules={[{ required: true, message: 'Enter an SMTP host' }]}>
                            <Input placeholder="e.g., smtp.qq.com" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_port" label="SMTP Port" rules={[{ required: true, message: 'Enter an SMTP port' }]}>
                            <InputNumber style={{ width: '100%' }} min={1} max={65535} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_username" label="SMTP Username" rules={[{ required: true, message: 'Enter an SMTP username' }]}>
                            <Input placeholder="Full email address" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_password" label="SMTP Password / Authorization Code" rules={[{ required: true, message: 'Enter an SMTP authorization code' }]}>
                            <Input.Password placeholder="For QQ Mail, enter an authorization code" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_from_email" label="Sender Email">
                            <Input placeholder="Defaults to the username" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_from_name" label="Sender Name" rules={[{ required: true, message: 'Enter a sender name' }]}>
                            <Input placeholder="MuMuAINovel" />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_use_ssl" label="Enable SSL" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name="smtp_use_tls" label="Enable TLS" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Card>
                  </Col>

                  <Col xs={24} xl={8}>
                    <Card title="Registration and Verification Code Policy" bordered={false} style={{ borderRadius: 16, marginBottom: 24 }}>
                      <Form.Item name="email_auth_enabled" label="Enable Email Authentication" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="email_register_enabled" label="Enable Email Registration" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="verification_code_ttl_minutes" label="Verification Code Validity (minutes)" rules={[{ required: true, message: 'Enter the verification code validity period' }]}>
                        <InputNumber style={{ width: '100%' }} min={1} max={120} />
                      </Form.Item>
                      <Form.Item name="verification_resend_interval_seconds" label="Verification Code Resend Interval (seconds)" rules={[{ required: true, message: 'Enter the verification code resend interval' }]}>
                        <InputNumber style={{ width: '100%' }} min={10} max={3600} />
                      </Form.Item>
                    </Card>

                    <Card title="Actions" bordered={false} style={{ borderRadius: 16 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Input
                          value={testTargetEmail}
                          onChange={(e) => setTestTargetEmail(e.target.value)}
                          placeholder="Enter a test recipient email, e.g., 123456@qq.com"
                        />
                        <Button icon={<ReloadOutlined />} onClick={loadData} block>
                          Reload
                        </Button>
                        <Button icon={<SendOutlined />} loading={testing} onClick={handleTest} block>
                          Send Test Email
                        </Button>
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} block onClick={() => form.submit()}>
                          Save System Settings
                        </Button>
                        <Alert
                          type="success"
                          showIcon
                          icon={<CheckCircleOutlined />}
                          message="QQ Mail defaults are recommended"
                          description={<Text type="secondary">Save the SMTP settings first, enter a test recipient email, then select “Send Test Email” to send a real message through SMTP.</Text>}
                        />
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </Form>
            ),
          },
          {
            key: 'announcements',
            label: (
              <Space>
                <BellOutlined />
                Announcement Management
              </Space>
            ),
            children: (
              <Card bordered={false} style={{ borderRadius: 16 }}>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Alert
                    type={announcementAdminAvailable ? 'info' : 'warning'}
                    showIcon
                    message={announcementAdminAvailable ? 'Announcement Publishing' : 'This instance cannot publish announcements'}
                    description={announcementAdminAvailable
                      ? 'Only administrators in server mode can publish, edit, hide, or delete announcements. Client instances periodically sync published announcements that have not expired.'
                      : `Announcements can only be published by the cloud server. Current mode: ${announcementStatus?.mode || 'Unknown'}${announcementStatus?.cloud_url ? `, Cloud URL: ${announcementStatus.cloud_url}` : ''}`}
                  />

                  <Row gutter={[16, 16]} justify="space-between" align="middle">
                    <Col xs={24} lg={14}>
                      <Space wrap>
                        <Button type="primary" icon={<PlusOutlined />} disabled={!announcementAdminAvailable} onClick={openCreateAnnouncementModal}>
                          Create Announcement
                        </Button>
                        <Button icon={<ReloadOutlined />} loading={announcementLoading || announcementStatusLoading} onClick={() => { void loadAnnouncementStatus(); void loadAnnouncements(announcementPagination.current, announcementPagination.pageSize, announcementSearchKeyword); }}>
                          Refresh List
                        </Button>
                        {announcementStatus && (
                          <Tag color={announcementAdminAvailable ? 'green' : 'orange'}>
                            {announcementStatus.mode === 'server' ? 'Server Mode' : 'Client Mode'}
                          </Tag>
                        )}
                      </Space>
                    </Col>
                    <Col xs={24} lg={10} style={{ textAlign: 'right' }}>
                      <Space wrap>
                        <Search
                          allowClear
                          placeholder="Search title, summary, or content"
                          style={{ width: 220 }}
                          onSearch={handleAnnouncementSearch}
                          disabled={!announcementAdminAvailable}
                        />
                        <Text type="secondary">Status</Text>
                        <Select<AnnouncementStatusFilter>
                          style={{ width: 120, textAlign: 'left' }}
                          value={announcementStatusFilter}
                          disabled={!announcementAdminAvailable}
                          onChange={(value) => {
                            setAnnouncementStatusFilter(value);
                            setAnnouncementPagination(prev => ({ ...prev, current: 1 }));
                          }}
                          options={[
                            { label: 'All', value: 'all' },
                            { label: 'Draft', value: 'draft' },
                            { label: 'Published', value: 'published' },
                            { label: 'Hidden', value: 'hidden' },
                          ]}
                        />
                      </Space>
                    </Col>
                  </Row>

                  <Table<Announcement>
                    rowKey="id"
                    columns={announcementColumns}
                    dataSource={announcements}
                    loading={announcementLoading}
                    pagination={{
                      current: announcementPagination.current,
                      pageSize: announcementPagination.pageSize,
                      total: announcementPagination.total,
                      showSizeChanger: true,
                      showTotal: (total) => `${total} announcements`,
                    }}
                    onChange={handleAnnouncementTableChange}
                    scroll={{ x: 1200 }}
                  />
                </Space>
              </Card>
            ),
          },
        ]}
      />
      </div>

      <Modal
        title={editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
        open={announcementModalOpen}
        onCancel={closeAnnouncementModal}
        onOk={() => announcementForm.submit()}
        confirmLoading={announcementSaving}
        okText={editingAnnouncement ? 'Save Changes' : 'Create Announcement'}
        cancelText="Cancel"
        width={1200}
        destroyOnClose
      >
        <Form form={announcementForm} layout="vertical" onFinish={handleSaveAnnouncement} preserve={false}>
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item
                name="title"
                label="Announcement Title"
                rules={[
                  { required: true, message: 'Enter an announcement title' },
                  { max: 120, message: 'The title cannot exceed 120 characters' },
                  { whitespace: true, message: 'The title cannot consist only of whitespace' },
                ]}
              >
                <Input placeholder="Enter an announcement title" maxLength={120} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="level" label="Announcement Level" rules={[{ required: true, message: 'Select an announcement level' }]}>
                <Select>
                  <Option value="info">Notice</Option>
                  <Option value="success">Success</Option>
                  <Option value="warning">Warning</Option>
                  <Option value="error">Important</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="summary" label="Summary" rules={[{ max: 255, message: 'The summary cannot exceed 255 characters' }]}>
            <Input placeholder="Optional brief description for the list and timeline" maxLength={255} showCount />
          </Form.Item>

          <Card
            size="small"
            title="Announcement Content (Markdown / Safe HTML)"
            style={{ marginBottom: 24, borderRadius: 12 }}
            extra={<Text type="secondary">Supports Markdown and safe HTML such as centered images, line breaks, and emphasis.</Text>}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Button size="small" onClick={() => appendMarkdownSnippet('## A Heading')}>Heading</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('**Important content**')}>Bold</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('- List item\n- List item')}>List</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('> Quote')}>Quote</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('[Link text](https://example.com)')}>Link</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('<p align="center">\n  <img src="https://avatars.githubusercontent.com/u/283105808?s=48&v=4" alt="DolOffer Logo" width="200"/>\n  <br>\n  <em>A leading platform for recommending quality digital products and sharing great deals</em>\n</p>')}>Centered Image</Button>
                <Button size="small" onClick={() => appendMarkdownSnippet('```\nCode\n```')}>Code Block</Button>
              </Space>

              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Form.Item
                    name="content"
                    label="Edit"
                    rules={[
                      { required: true, message: 'Enter announcement content' },
                      { whitespace: true, message: 'Announcement content cannot consist only of whitespace' },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <TextArea
                      style={{ height: 420, resize: 'vertical' }}
                      placeholder={[
                        'Enter announcement content in Markdown or safe HTML, for example:',
                        '## Release Notes',
                        '- Lists are supported',
                        '- **Important content** is supported',
                        '> Quotes are supported',
                        '[View details](https://example.com)',
                        '',
                        '<p align="center">',
                        '  <img src="https://avatars.githubusercontent.com/u/283105808?s=48&v=4" alt="DolOffer Logo" width="200"/>',
                        '  <br>',
                        '  <em>A leading platform for recommending quality digital products and sharing great deals</em>',
                        '</p>',
                      ].join('\n')}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={12}>
                  <Text strong>Preview</Text>
                  <div
                    style={{
                      marginTop: 8,
                      minHeight: 336,
                      maxHeight: 420,
                      overflow: 'auto',
                      padding: 16,
                      borderRadius: 10,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      background: token.colorFillQuaternary,
                    }}
                  >
                    <MarkdownRenderer content={announcementContent} />
                  </div>
                </Col>
              </Row>
            </Space>
          </Card>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="status" label="Publication Status" rules={[{ required: true, message: 'Select a publication status' }]}>
                <Select>
                  <Option value="draft">Draft</Option>
                  <Option value="published">Publish Now</Option>
                  <Option value="hidden">Hidden</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="publish_at" label="Publish Time">
                <DatePicker style={{ width: '100%' }} showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="expire_at"
                label="Expiration Time"
                dependencies={['publish_at']}
                rules={[
                  ({ getFieldValue }) => ({
                    validator(_, value: Dayjs | null) {
                      const publishAt = getFieldValue('publish_at') as Dayjs | null;
                      if (!value || !publishAt || value.isAfter(publishAt)) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('The expiration time must be later than the publication time'));
                    },
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="pinned" label="Pinned Announcement" valuePropName="checked" extra="Pinned announcements appear first in the announcement timeline on client instances.">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
