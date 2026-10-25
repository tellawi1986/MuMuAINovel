import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Empty,
  Spin,
  Modal,
  Form,
  message,
  Tooltip,
  Badge,
  Tabs,
  Typography,
  Pagination,
  Alert,
  Statistic,
  theme,
} from 'antd';
import {
  SearchOutlined,
  DownloadOutlined,
  HeartOutlined,
  HeartFilled,
  CloudUploadOutlined,
  EyeOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DeleteOutlined,
  CloudOutlined,
  DisconnectOutlined,
  SettingOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { promptWorkshopApi, authApi } from '../services/api';
import type {
  PromptWorkshopItem,
  PromptSubmission,
  PromptSubmissionCreate,
  User,
} from '../types';
import { PROMPT_CATEGORIES } from '../types';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export default function PromptWorkshop() {
  const [items, setItems] = useState<PromptWorkshopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);
  
  // 筛选条件
  const [category, setCategory] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'downloads'>('newest');
  
  // 服务状态
  const [serviceStatus, setServiceStatus] = useState<{
    mode: string;
    instance_id: string;
    cloud_connected?: boolean;
  } | null>(null);
  
  // 提交相关
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitForm] = Form.useForm();
  
  // 我的提交
  const [mySubmissions, setMySubmissions] = useState<PromptSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  
  // 详情弹窗
  const [detailItem, setDetailItem] = useState<PromptWorkshopItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // 导入状态
  const [importingId, setImportingId] = useState<string | null>(null);
  
  // 当前用户
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // 管理员审核相关
  const [adminSubmissions, setAdminSubmissions] = useState<PromptSubmission[]>([]);
  const [adminSubmissionsLoading, setAdminSubmissionsLoading] = useState(false);
  const [adminPendingCount, setAdminPendingCount] = useState(0);
  const [adminStats, setAdminStats] = useState<{
    total_items: number;
    total_official: number;
    total_pending: number;
    total_downloads: number;
    total_likes: number;
  } | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingSubmission, setReviewingSubmission] = useState<PromptSubmission | null>(null);
  const [reviewForm] = Form.useForm();
  const [reviewLoading, setReviewLoading] = useState(false);
  const [addOfficialModalOpen, setAddOfficialModalOpen] = useState(false);
  const [addOfficialForm] = Form.useForm();
  const [addOfficialLoading, setAddOfficialLoading] = useState(false);
  
  // 已发布提示词管理
  const [publishedItems, setPublishedItems] = useState<PromptWorkshopItem[]>([]);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<PromptWorkshopItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);
  
  // 当前活动的 Tab
  const [activeTab, setActiveTab] = useState<string>('browse');
  
  const isMobile = window.innerWidth <= 768;
  const { token } = theme.useToken();
  
  // 判断是否为服务端管理员
  const isServerAdmin = serviceStatus?.mode === 'server' && currentUser?.is_admin;

  // 卡片网格配置 - 与 WritingStyles 保持一致
  const gridConfig = {
    gutter: isMobile ? 8 : 16,
    xs: 24,
    sm: 24,
    md: 12,
    lg: 8,
    xl: 6,
  };

  // 加载服务状态和用户信息
  useEffect(() => {
    const init = async () => {
      try {
        const [status, user] = await Promise.all([
          promptWorkshopApi.getStatus(),
          authApi.getCurrentUser().catch(() => null),
        ]);
        setServiceStatus(status);
        setCurrentUser(user);
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    init();
  }, []);

  // 加载工坊列表
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await promptWorkshopApi.getItems({
        category: category || undefined,
        search: searchKeyword || undefined,
        sort: sortBy,
        page: currentPage,
        limit: pageSize,
      });
      setItems(response.data?.items || []);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Failed to load workshop items:', error);
      message.error('Failed to load the Prompt Workshop.');
    } finally {
      setLoading(false);
    }
  }, [category, searchKeyword, sortBy, currentPage, pageSize]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // 加载我的提交
  const loadMySubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const response = await promptWorkshopApi.getMySubmissions();
      setMySubmissions(response.data?.items || []);
    } catch (error) {
      console.error('Failed to load submissions:', error);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  // 导入到本地
  const handleImport = async (item: PromptWorkshopItem) => {
    setImportingId(item.id);
    try {
      await promptWorkshopApi.importItem(item.id);
      message.success(`“${item.name}” was imported to your local writing styles.`);
      // 刷新列表更新下载计数
      loadItems();
    } catch (error) {
      console.error('Failed to import item:', error);
      message.error('Import failed.');
    } finally {
      setImportingId(null);
    }
  };

  // 点赞
  const handleLike = async (item: PromptWorkshopItem) => {
    try {
      const response = await promptWorkshopApi.toggleLike(item.id);
      // 更新本地状态
      setItems(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, is_liked: response.liked, like_count: response.like_count }
          : i
      ));
    } catch (error) {
      console.error('Failed to toggle like:', error);
      message.error('Action failed.');
    }
  };

  // 提交新提示词
  const handleSubmit = async (values: PromptSubmissionCreate) => {
    setSubmitLoading(true);
    try {
      await promptWorkshopApi.submit({
        ...values,
        tags: values.tags ? (values.tags as unknown as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      });
      message.success('Submission received and awaiting administrator review.');
      setIsSubmitModalOpen(false);
      submitForm.resetFields();
      loadMySubmissions();
      // 如果是服务端管理员，刷新待审核列表
      if (isServerAdmin) {
        loadAdminSubmissions();
      }
    } catch (error) {
      console.error('Failed to submit:', error);
      message.error('Submission failed.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // 撤回提交（pending状态）
  const handleWithdraw = async (submissionId: string) => {
    try {
      await promptWorkshopApi.withdrawSubmission(submissionId);
      message.success('Submission withdrawn.');
      loadMySubmissions();
      // 如果是服务端管理员，刷新待审核列表
      if (isServerAdmin) {
        loadAdminSubmissions();
      }
    } catch (error) {
      console.error('Failed to withdraw:', error);
      message.error('Failed to withdraw the submission.');
    }
  };

  // 删除提交记录（已审核状态）
  const handleDeleteSubmission = async (submission: PromptSubmission) => {
    Modal.confirm({
      title: 'Delete Submission',
      content: `Are you sure you want to delete the submission for “${submission.name}”? This cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          await promptWorkshopApi.deleteSubmission(submission.id);
          message.success('Deleted successfully.');
          loadMySubmissions();
          // 如果是服务端管理员，刷新相关列表
          if (isServerAdmin) {
            loadAdminSubmissions();
          }
        } catch (error) {
          console.error('Failed to delete submission:', error);
          message.error('Failed to delete.');
        }
      },
    });
  };

  // 查看详情
  const handleViewDetail = async (item: PromptWorkshopItem) => {
    try {
      const response = await promptWorkshopApi.getItem(item.id);
      setDetailItem(response.data);
      setIsDetailModalOpen(true);
    } catch (error) {
      console.error('Failed to load detail:', error);
      message.error('Failed to load details.');
    }
  };

  // 获取分类标签颜色
  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: 'blue',
      fantasy: 'purple',
      martial: 'orange',
      romance: 'pink',
      scifi: 'cyan',
      horror: 'red',
      history: 'gold',
      urban: 'green',
      game: 'magenta',
      other: 'default',
    };
    return colors[cat] || 'default';
  };

  // 获取分类名称
  const getCategoryName = (cat: string) => {
    return PROMPT_CATEGORIES[cat] || cat;
  };
  
  // 获取分类选项列表
  const categoryOptions = Object.entries(PROMPT_CATEGORIES).map(([value, label]) => ({
    value,
    label,
  }));

  // 获取提交状态标签
  const getStatusTag = (status: string) => {
    const config: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      pending: { color: 'processing', icon: <ClockCircleOutlined />, text: 'Pending Review' },
      approved: { color: 'success', icon: <CheckCircleOutlined />, text: 'Approved' },
      rejected: { color: 'error', icon: <CloseCircleOutlined />, text: 'Rejected' },
    };
    const cfg = config[status] || config.pending;
    return <Tag color={cfg.color} icon={cfg.icon}>{cfg.text}</Tag>;
  };

  // 渲染筛选区域（固定在顶部）
  const renderFilterBar = () => (
    <div style={{ marginBottom: 16 }}>
      {/* 服务状态 */}
      {serviceStatus && !serviceStatus.cloud_connected && serviceStatus.mode === 'client' && (
        <Alert
          type="warning"
          message="Cloud service unavailable"
          description="The Prompt Workshop is unavailable. Check your connection or try again later."
          icon={<DisconnectOutlined />}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      {/* 筛选区域 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}>
        <Input
          placeholder="Search prompts..."
          prefix={<SearchOutlined />}
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          onPressEnter={() => { setCurrentPage(1); loadItems(); }}
          style={{ width: isMobile ? '100%' : 200 }}
          allowClear
        />
        <Select
          placeholder="Select a category"
          value={category}
          onChange={v => { setCategory(v); setCurrentPage(1); }}
          style={{ width: isMobile ? '100%' : 150 }}
          allowClear
        >
          {categoryOptions.map(cat => (
            <Select.Option key={cat.value} value={cat.value}>{cat.label}</Select.Option>
          ))}
        </Select>
        <Select
          value={sortBy}
          onChange={v => { setSortBy(v); setCurrentPage(1); }}
          style={{ width: isMobile ? '100%' : 120 }}
        >
          <Select.Option value="newest">Newest</Select.Option>
          <Select.Option value="popular">Most Popular</Select.Option>
          <Select.Option value="downloads">Most Downloaded</Select.Option>
        </Select>
        <Button
          icon={<SyncOutlined />}
          onClick={() => { setCurrentPage(1); loadItems(); }}
        >
          Refresh
        </Button>
      </div>
    </div>
  );

  // 渲染工坊列表（只有卡片部分，用于滚动区域）
  const renderWorkshopList = () => (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        <Spin spinning={loading}>
          {items.length === 0 ? (
            <Empty description="No prompts yet" />
          ) : (
              <Row
                gutter={[0, gridConfig.gutter]}
                style={{ marginLeft: 0, marginRight: 0 }}
              >
              {items.map(item => (
                <Col
                  key={item.id}
                  xs={gridConfig.xs}
                  sm={gridConfig.sm}
                  md={gridConfig.md}
                  lg={gridConfig.lg}
                  xl={gridConfig.xl}
                  style={{
                    paddingLeft: 0,
                    paddingRight: gridConfig.gutter / 2,
                    marginBottom: gridConfig.gutter
                  }}
                >
                  <Card
                    hoverable
                    style={{ 
                      height: '100%', 
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                    bodyStyle={{ 
                      padding: 16, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      flex: 1,
                    }}
                    actions={[
                      <Tooltip title="View Details" key="view">
                        <EyeOutlined onClick={() => handleViewDetail(item)} />
                      </Tooltip>,
                      <Tooltip title={item.is_liked ? 'Unlike' : 'Like'} key="like">
                        <span onClick={() => handleLike(item)}>
                          {item.is_liked ? (
                            <HeartFilled style={{ color: token.colorError }} />
                          ) : (
                            <HeartOutlined />
                          )}
                          <span style={{ marginLeft: 4 }}>{item.like_count || 0}</span>
                        </span>
                      </Tooltip>,
                      <Tooltip title="Import Locally" key="import">
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          loading={importingId === item.id}
                          onClick={() => handleImport(item)}
                        >
                          {item.download_count || 0}
                        </Button>
                      </Tooltip>,
                    ]}
                  >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <Space style={{ marginBottom: 12 }} wrap>
                        <Text strong style={{ fontSize: 16 }}>{item.name}</Text>
                        <Tag color={getCategoryColor(item.category)}>
                          {getCategoryName(item.category)}
                        </Tag>
                      </Space>
                      
                      {item.description && (
                        <Paragraph
                          type="secondary"
                          style={{ fontSize: 13, marginBottom: 12 }}
                          ellipsis={{ rows: 2, tooltip: item.description }}
                        >
                          {item.description}
                        </Paragraph>
                      )}
                      
                      <Paragraph
                        type="secondary"
                        style={{
                          fontSize: 12,
                          marginBottom: 0,
                          backgroundColor: token.colorFillQuaternary,
                          padding: 8,
                          borderRadius: 4,
                          flex: 1,
                          minHeight: 60,
                        }}
                        ellipsis={{ rows: 3 }}
                      >
                        {item.prompt_content}
                      </Paragraph>
                      
                      {item.tags && item.tags.length > 0 && (
                        <Space size={4} wrap style={{ marginTop: 8 }}>
                          {item.tags.slice(0, 3).map(tag => (
                            <Tag key={tag} style={{ fontSize: 11 }}>{tag}</Tag>
                          ))}
                          {item.tags.length > 3 && (
                            <Tag style={{ fontSize: 11 }}>+{item.tags.length - 3}</Tag>
                          )}
                        </Space>
                      )}
                    </div>
                    
                    <div style={{ marginTop: 8, color: token.colorTextTertiary, fontSize: 12 }}>
                      <Space>
                        <span><UserOutlined /> {item.author_name || 'Anonymous'}</span>
                      </Space>
                    </div>
                  </Card>
                </Col>
              ))}
              </Row>
          )}
        </Spin>
      </div>

      {total > 0 && (
        <div
          style={{
            flexShrink: 0,
            textAlign: 'center',
            padding: '12px 0 0',
            marginTop: 12,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
          }}
        >
          <Pagination
            current={currentPage}
            total={total}
            pageSize={pageSize}
            onChange={page => setCurrentPage(page)}
            showSizeChanger={false}
            showTotal={t => `${t} prompts`}
          />
        </div>
      )}
    </div>
  );

  // 渲染我的提交
  const renderMySubmissions = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text>View your submitted prompts and their review status.</Text>
        <Button icon={<SyncOutlined />} onClick={loadMySubmissions}>
          Refresh
        </Button>
      </div>
      
      <Spin spinning={submissionsLoading}>
          {mySubmissions.length === 0 ? (
            <Empty description="No submissions yet" />
          ) : (
            <Row gutter={[0, gridConfig.gutter]} style={{ marginLeft: 0, marginRight: 0 }}>
              {mySubmissions.map(sub => (
              <Col 
                key={sub.id} 
                xs={gridConfig.xs} 
                sm={gridConfig.sm} 
                md={gridConfig.md} 
                lg={gridConfig.lg}
                xl={gridConfig.xl}
                style={{
                  paddingLeft: 0,
                  paddingRight: gridConfig.gutter / 2,
                  marginBottom: gridConfig.gutter
                }}
              >
                <Card
                  style={{ borderRadius: 12, height: '100%', border: `1px solid ${token.colorBorderSecondary}` }}
                  bodyStyle={{ padding: 16 }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong>{sub.name}</Text>
                      {getStatusTag(sub.status)}
                    </div>
                    
                    <Tag color={getCategoryColor(sub.category)}>
                      {getCategoryName(sub.category)}
                    </Tag>
                    
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 12, marginBottom: 0 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {sub.prompt_content}
                    </Paragraph>
                    
                    {sub.status === 'rejected' && sub.review_note && (
                      <Alert
                        type="error"
                        message="Reason for Rejection"
                        description={sub.review_note}
                        style={{ fontSize: 12 }}
                      />
                    )}
                    
                    <div style={{ fontSize: 12, color: token.colorTextTertiary }}>
                      Submitted: {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '-'}
                    </div>
                    
                    <Space>
                      {sub.status === 'pending' && (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleWithdraw(sub.id)}
                        >
                          Withdraw
                        </Button>
                      )}
                      {sub.status !== 'pending' && (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleDeleteSubmission(sub)}
                        >
                          Delete Submission
                        </Button>
                      )}
                    </Space>
                  </Space>
                </Card>
              </Col>
            ))}
            </Row>
          )}
      </Spin>
    </div>
  );

  // 加载管理员待审核列表
  const loadAdminSubmissions = async () => {
    if (!isServerAdmin) return;
    
    setAdminSubmissionsLoading(true);
    try {
      const [subsResponse, statsResponse] = await Promise.all([
        promptWorkshopApi.adminGetSubmissions({ status: 'pending', limit: 50 }),
        promptWorkshopApi.adminGetStats(),
      ]);
      setAdminSubmissions(subsResponse.data?.items || []);
      setAdminPendingCount(subsResponse.data?.pending_count || 0);
      setAdminStats(statsResponse.data || null);
    } catch (error) {
      console.error('Failed to load admin submissions:', error);
    } finally {
      setAdminSubmissionsLoading(false);
    }
  };

  // 加载已发布的提示词列表（管理员用）
  const loadPublishedItems = async () => {
    if (!isServerAdmin) return;
    
    setPublishedLoading(true);
    try {
      const response = await promptWorkshopApi.getItems({ limit: 100 });
      setPublishedItems(response.data?.items || []);
    } catch (error) {
      console.error('Failed to load published items:', error);
    } finally {
      setPublishedLoading(false);
    }
  };

  // 删除已发布的提示词
  const handleDeleteItem = async (item: PromptWorkshopItem) => {
    Modal.confirm({
      title: 'Confirm Deletion',
      content: `Are you sure you want to delete “${item.name}”? This cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          await promptWorkshopApi.adminDeleteItem(item.id);
          message.success('Deleted successfully.');
          loadPublishedItems();
          loadAdminSubmissions();
          loadItems();
        } catch (error) {
          console.error('Failed to delete item:', error);
          message.error('Failed to delete.');
        }
      },
    });
  };

  // 编辑已发布的提示词
  const handleEditItem = async (values: { name: string; category: string; description?: string; prompt_content: string; tags?: string }) => {
    if (!editingItem) return;
    
    setEditLoading(true);
    try {
      await promptWorkshopApi.adminUpdateItem(editingItem.id, {
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      });
      message.success('Changes saved.');
      setEditModalOpen(false);
      setEditingItem(null);
      editForm.resetFields();
      loadPublishedItems();
      loadItems();
    } catch (error) {
      console.error('Failed to update item:', error);
      message.error('Failed to save changes.');
    } finally {
      setEditLoading(false);
    }
  };

  // 打开编辑弹窗
  const openEditModal = (item: PromptWorkshopItem) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      name: item.name,
      category: item.category,
      description: item.description,
      prompt_content: item.prompt_content,
      tags: item.tags?.join(', '),
    });
    setEditModalOpen(true);
  };

  // 审核提交
  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewingSubmission) return;
    
    setReviewLoading(true);
    try {
      const values = reviewForm.getFieldsValue();
      await promptWorkshopApi.adminReviewSubmission(reviewingSubmission.id, {
        action,
        review_note: values.review_note,
        category: values.category,
        tags: values.tags ? values.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
      });
      message.success(action === 'approve' ? 'Approved.' : 'Rejected.');
      setReviewModalOpen(false);
      setReviewingSubmission(null);
      reviewForm.resetFields();
      // 刷新所有相关数据
      loadAdminSubmissions();
      loadItems();
      loadPublishedItems();  // 通过时会新增到已发布列表
    } catch (error) {
      console.error('Failed to review:', error);
      message.error('Review failed.');
    } finally {
      setReviewLoading(false);
    }
  };

  // 添加官方提示词
  const handleAddOfficial = async (values: { name: string; category: string; description?: string; prompt_content: string; tags?: string }) => {
    setAddOfficialLoading(true);
    try {
      await promptWorkshopApi.adminCreateItem({
        ...values,
        tags: values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      });
      message.success('Added successfully.');
      setAddOfficialModalOpen(false);
      addOfficialForm.resetFields();
      loadItems();
      loadAdminSubmissions();
      loadPublishedItems();
    } catch (error) {
      console.error('Failed to add official item:', error);
      message.error('Failed to add.');
    } finally {
      setAddOfficialLoading(false);
    }
  };

  // 渲染管理员面板
  const renderAdminPanel = () => (
    <div>
      {/* 统计数据 */}
      {adminStats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Total Prompts" value={adminStats.total_items} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Official Prompts" value={adminStats.total_official} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Pending Review" value={adminStats.total_pending} valueStyle={{ color: token.colorWarning }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Total Downloads" value={adminStats.total_downloads} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Total Likes" value={adminStats.total_likes} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOfficialModalOpen(true)}>
                Add Official Prompt
              </Button>
            </Card>
          </Col>
        </Row>
      )}
      
      {/* 待审核列表 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Pending Submissions ({adminPendingCount})</Text>
        <Button icon={<SyncOutlined />} onClick={loadAdminSubmissions}>
          Refresh
        </Button>
      </div>
      
      <Spin spinning={adminSubmissionsLoading}>
        {adminSubmissions.length === 0 ? (
          <Empty description="No pending submissions" />
        ) : (
          <Row gutter={[0, gridConfig.gutter]} style={{ marginLeft: 0, marginRight: 0 }}>
            {adminSubmissions.map(sub => (
              <Col 
                key={sub.id} 
                xs={gridConfig.xs} 
                sm={gridConfig.sm} 
                md={gridConfig.md} 
                lg={gridConfig.lg}
                xl={gridConfig.xl}
                style={{
                  paddingLeft: 0,
                  paddingRight: gridConfig.gutter / 2,
                  marginBottom: gridConfig.gutter
                }}
              >
                <Card
                  style={{ borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                  bodyStyle={{ padding: 16 }}
                  actions={[
                    <Button
                      key="approve"
                      type="link"
                      style={{ color: token.colorSuccess }}
                      onClick={() => {
                        setReviewingSubmission(sub);
                        reviewForm.setFieldsValue({
                          category: sub.category,
                          tags: sub.tags?.join(', '),
                        });
                        setReviewModalOpen(true);
                      }}
                    >
                      Review
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text strong>{sub.name}</Text>
                    <Tag color={getCategoryColor(sub.category)}>
                      {getCategoryName(sub.category)}
                    </Tag>
                    
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 12, marginBottom: 0 }}
                      ellipsis={{ rows: 3 }}
                    >
                      {sub.prompt_content}
                    </Paragraph>
                    
                    <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                      <div>Submitted by: {sub.submitter_name || 'Unknown'}</div>
                      <div>Source: {sub.source_instance}</div>
                      <div>Date: {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '-'}</div>
                    </div>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>
      
      {/* 已发布提示词管理 */}
      <div style={{ marginTop: 32, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Manage Published Prompts ({publishedItems.length})</Text>
        <Button icon={<SyncOutlined />} onClick={loadPublishedItems}>
          Refresh
        </Button>
      </div>
      
      <Spin spinning={publishedLoading}>
        {publishedItems.length === 0 ? (
          <Empty description="No published prompts" />
        ) : (
          <Row gutter={[0, gridConfig.gutter]} style={{ marginLeft: 0, marginRight: 0 }}>
            {publishedItems.map(item => (
              <Col 
                key={item.id} 
                xs={gridConfig.xs} 
                sm={gridConfig.sm} 
                md={gridConfig.md} 
                lg={gridConfig.lg}
                xl={gridConfig.xl}
                style={{
                  paddingLeft: 0,
                  paddingRight: gridConfig.gutter / 2,
                  marginBottom: gridConfig.gutter
                }}
              >
                <Card
                  style={{ borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                  bodyStyle={{ padding: 16 }}
                  actions={[
                    <Tooltip title="Edit" key="edit">
                      <Button
                        type="link"
                        icon={<SettingOutlined />}
                        onClick={() => openEditModal(item)}
                      />
                    </Tooltip>,
                    <Tooltip title="Delete" key="delete">
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteItem(item)}
                      />
                    </Tooltip>,
                  ]}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong ellipsis style={{ maxWidth: 120 }}>{item.name}</Text>
                      {item.is_official && <Tag color="gold">Official</Tag>}
                    </div>
                    <Tag color={getCategoryColor(item.category)}>
                      {getCategoryName(item.category)}
                    </Tag>
                    
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 12, marginBottom: 0 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {item.prompt_content}
                    </Paragraph>
                    
                    <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                      <Space>
                        <span><HeartOutlined /> {item.like_count || 0}</span>
                        <span><DownloadOutlined /> {item.download_count || 0}</span>
                      </Space>
                    </div>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 固定区域：标题 + Tabs切换栏 + 筛选栏 */}
      <div style={{ flexShrink: 0 }}>
        {/* 标题和操作区 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '12px 0' : '16px 0',
          marginBottom: isMobile ? 12 : 16,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudOutlined />
            Prompt Workshop
            {serviceStatus?.mode === 'server' && (
              <Badge status="success" text="Server Mode" style={{ marginLeft: 8, fontSize: 12 }} />
            )}
          </h2>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => setIsSubmitModalOpen(true)}
          >
            Share My Prompt
          </Button>
        </div>

        {/* Tabs 切换栏（不含内容） */}
        <Tabs
          activeKey={activeTab}
          onChange={key => {
            setActiveTab(key);
            if (key === 'submissions') loadMySubmissions();
            if (key === 'admin') {
              loadAdminSubmissions();
              loadPublishedItems();
            }
          }}
          items={[
            { key: 'browse', label: 'Browse Workshop' },
            {
              key: 'submissions',
              label: (
                <Badge count={mySubmissions.filter(s => s.status === 'pending').length} size="small">
                  My Submissions
                </Badge>
              ),
            },
            ...(isServerAdmin ? [{
              key: 'admin',
              label: (
                <Badge count={adminPendingCount} size="small">
                  <span><SettingOutlined /> Review Management</span>
                </Badge>
              ),
            }] : []),
          ]}
          tabBarStyle={{ marginBottom: 16 }}
        />

        {/* 筛选栏（仅在浏览工坊时显示） */}
        {activeTab === 'browse' && renderFilterBar()}
      </div>

      {/* 内容区域：浏览工坊内部固定分页，其他 Tab 保持自身滚动 */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'browse' && renderWorkshopList()}
        {activeTab === 'submissions' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>{renderMySubmissions()}</div>
        )}
        {activeTab === 'admin' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>{renderAdminPanel()}</div>
        )}
      </div>

      {/* 提交弹窗 */}
      <Modal
        title="Share a Prompt with the Workshop"
        open={isSubmitModalOpen}
        onCancel={() => {
          setIsSubmitModalOpen(false);
          submitForm.resetFields();
        }}
        footer={null}
        width={isMobile ? '100%' : 600}
        centered
      >
        <Alert
          type="info"
          message="Submission Guidelines"
          description="Your prompt will be reviewed by an administrator and displayed in the workshop if approved. Make sure it is original and contains no sensitive information."
          style={{ marginBottom: 16 }}
          showIcon
        />
        
        <Form
          form={submitForm}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter a name' }]}
          >
            <Input placeholder="Name your prompt" maxLength={50} />
          </Form.Item>
          
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Select a category' }]}
          >
            <Select placeholder="Select a category">
              {categoryOptions.map(cat => (
                <Select.Option key={cat.value} value={cat.value}>{cat.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Briefly describe what this prompt does and its intended results" maxLength={200} />
          </Form.Item>
          
          <Form.Item
            name="prompt_content"
            label="Prompt Content"
            rules={[{ required: true, message: 'Enter the prompt content' }]}
          >
            <TextArea rows={6} placeholder="Enter the complete prompt..." />
          </Form.Item>
          
          <Form.Item
            name="author_display_name"
            label="Author Name"
            rules={[{ required: true, message: 'Enter an author name' }]}
            tooltip="The author name displayed after publication"
          >
            <Input placeholder="Enter an author name (required)" maxLength={50} />
          </Form.Item>
          
          <Form.Item name="tags" label="Tags">
            <Input placeholder="Enter comma-separated tags, e.g., fantasy, dialogue, subtle" />
          </Form.Item>
          
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsSubmitModalOpen(false);
                submitForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={submitLoading}>
                Submit for Review
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title={detailItem?.name}
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false);
          setDetailItem(null);
        }}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="import"
            type="primary"
            icon={<DownloadOutlined />}
            loading={importingId === detailItem?.id}
            onClick={() => detailItem && handleImport(detailItem)}
          >
            Import Locally
          </Button>,
        ]}
        width={isMobile ? '100%' : 700}
        centered
      >
        {detailItem && (
          <div>
            <Space style={{ marginBottom: 16 }} wrap>
              <Tag color={getCategoryColor(detailItem.category)}>
                {getCategoryName(detailItem.category)}
              </Tag>
              {detailItem.tags?.map(tag => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
            
            {detailItem.description && (
              <Paragraph style={{ marginBottom: 16 }}>
                {detailItem.description}
              </Paragraph>
            )}
            
            <div style={{
              backgroundColor: token.colorFillSecondary,
              padding: 16,
              borderRadius: 8,
              marginBottom: 16,
              maxHeight: 400,
              overflow: 'auto',
            }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Prompt Content</Text>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontSize: 13,
              }}>
                {detailItem.prompt_content}
              </pre>
            </div>
            
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">Author</Text>
                <div><UserOutlined /> {detailItem.author_name || 'Anonymous'}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary">Likes</Text>
                <div><HeartOutlined /> {detailItem.like_count || 0}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary">Downloads</Text>
                <div><DownloadOutlined /> {detailItem.download_count || 0}</div>
              </Col>
            </Row>
          </div>
        )}
      </Modal>
      {/* 审核弹窗 */}
      <Modal
        title={`Review: ${reviewingSubmission?.name}`}
        open={reviewModalOpen}
        onCancel={() => {
          setReviewModalOpen(false);
          setReviewingSubmission(null);
          reviewForm.resetFields();
        }}
        footer={null}
        width={700}
        centered
      >
        {reviewingSubmission && (
          <div>
            <div style={{
              backgroundColor: token.colorFillSecondary,
              padding: 16,
              borderRadius: 8,
              marginBottom: 16,
              maxHeight: 300,
              overflow: 'auto',
            }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Prompt Preview</Text>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontSize: 13,
              }}>
                {reviewingSubmission.prompt_content}
              </pre>
            </div>
            
            <Form form={reviewForm} layout="vertical">
              <Form.Item name="category" label="Category (editable)">
                <Select>
                  {categoryOptions.map(cat => (
                    <Select.Option key={cat.value} value={cat.value}>{cat.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item name="tags" label="Tags (editable, comma-separated)">
                <Input placeholder="fantasy, dialogue, subtle" />
              </Form.Item>
              
              <Form.Item name="review_note" label="Review Notes">
                <TextArea rows={2} placeholder="Enter a reason when rejecting..." />
              </Form.Item>
              
              <Form.Item>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button onClick={() => setReviewModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button danger loading={reviewLoading} onClick={() => handleReview('reject')}>
                    Reject
                  </Button>
                  <Button type="primary" loading={reviewLoading} onClick={() => handleReview('approve')}>
                    Approve
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* 添加官方提示词弹窗 */}
      <Modal
        title="Add Official Prompt"
        open={addOfficialModalOpen}
        onCancel={() => {
          setAddOfficialModalOpen(false);
          addOfficialForm.resetFields();
        }}
        footer={null}
        width={600}
        centered
      >
        <Form
          form={addOfficialForm}
          layout="vertical"
          onFinish={handleAddOfficial}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter a name' }]}
          >
            <Input placeholder="Prompt name" maxLength={50} />
          </Form.Item>
          
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Select a category' }]}
          >
            <Select placeholder="Select a category">
              {categoryOptions.map(cat => (
                <Select.Option key={cat.value} value={cat.value}>{cat.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Brief description" maxLength={200} />
          </Form.Item>
          
          <Form.Item
            name="prompt_content"
            label="Prompt Content"
            rules={[{ required: true, message: 'Enter the prompt content' }]}
          >
            <TextArea rows={8} placeholder="Enter the complete prompt..." />
          </Form.Item>
          
          <Form.Item name="tags" label="Tags">
            <Input placeholder="Comma-separated, e.g., fantasy, dialogue, subtle" />
          </Form.Item>
          
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setAddOfficialModalOpen(false);
                addOfficialForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={addOfficialLoading}>
                Add
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑提示词弹窗 */}
      <Modal
        title={`Edit: ${editingItem?.name}`}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingItem(null);
          editForm.resetFields();
        }}
        footer={null}
        width={600}
        centered
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditItem}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Enter a name' }]}
          >
            <Input placeholder="Prompt name" maxLength={50} />
          </Form.Item>
          
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Select a category' }]}
          >
            <Select placeholder="Select a category">
              {categoryOptions.map(cat => (
                <Select.Option key={cat.value} value={cat.value}>{cat.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Brief description" maxLength={200} />
          </Form.Item>
          
          <Form.Item
            name="prompt_content"
            label="Prompt Content"
            rules={[{ required: true, message: 'Enter the prompt content' }]}
          >
            <TextArea rows={8} placeholder="Enter the complete prompt..." />
          </Form.Item>
          
          <Form.Item name="tags" label="Tags">
            <Input placeholder="Comma-separated, e.g., fantasy, dialogue, subtle" />
          </Form.Item>
          
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setEditModalOpen(false);
                setEditingItem(null);
                editForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={editLoading}>
                Save Changes
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
