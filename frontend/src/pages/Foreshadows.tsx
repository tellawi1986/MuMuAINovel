import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select,
  InputNumber, Switch, message, Tooltip, Popconfirm, Statistic,
  Row, Col, Empty, Divider, Badge, Alert, Pagination, Dropdown, theme
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, SyncOutlined, EditOutlined, DeleteOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  BulbOutlined, EyeOutlined, FlagOutlined, WarningOutlined,
  ClockCircleOutlined, MoreOutlined, ReloadOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { foreshadowApi, chapterApi, characterApi } from '../services/api';
import type {
  Foreshadow, ForeshadowCreate, ForeshadowUpdate, ForeshadowStats,
  ForeshadowStatus, ForeshadowCategory, Chapter, Character
} from '../types';
import { eventBus, EventNames } from '../store/eventBus';

const { TextArea } = Input;
const { Option } = Select;

// 状态配置
const STATUS_CONFIG: Record<ForeshadowStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'default', icon: <ClockCircleOutlined /> },
  planted: { label: 'Planted', color: 'green', icon: <BulbOutlined /> },
  resolved: { label: 'Resolved', color: 'blue', icon: <CheckCircleOutlined /> },
  partially_resolved: { label: 'Partially Resolved', color: 'orange', icon: <ExclamationCircleOutlined /> },
  abandoned: { label: 'Abandoned', color: 'default', icon: <CloseCircleOutlined /> },
};

// 分类配置
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  identity: { label: 'Identity', color: 'purple' },
  mystery: { label: 'Mystery', color: 'magenta' },
  item: { label: 'Item', color: 'gold' },
  relationship: { label: 'Relationship', color: 'cyan' },
  event: { label: 'Event', color: 'blue' },
  ability: { label: 'Ability', color: 'green' },
  prophecy: { label: 'Prophecy', color: 'volcano' },
};

export default function Foreshadows() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(false);
  const [foreshadows, setForeshadows] = useState<Foreshadow[]>([]);
  const [stats, setStats] = useState<ForeshadowStats | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 筛选条件
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);
  
  // 模态框状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [plantModalVisible, setPlantModalVisible] = useState(false);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  
  const [currentForeshadow, setCurrentForeshadow] = useState<Foreshadow | null>(null);
  const [form] = Form.useForm();
  const [plantForm] = Form.useForm();
  const [resolveForm] = Form.useForm();
  const [syncing, setSyncing] = useState(false);
  
  // 表格容器引用，用于计算滚动高度
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState<number>(400);
  const { token } = theme.useToken();

  // 加载伏笔列表
  const loadForeshadows = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const response = await foreshadowApi.getProjectForeshadows(projectId, {
        status: statusFilter,
        category: categoryFilter,
        source_type: sourceFilter,
        page: currentPage,
        limit: pageSize,
      });
      
      setForeshadows(response.items);
      setTotal(response.total);
      if (response.stats) {
        setStats(response.stats);
      }
    } catch (error) {
      console.error('加载伏笔列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, categoryFilter, sourceFilter, currentPage, pageSize]);

  // 加载章节列表（用于选择）
  const loadChapters = useCallback(async () => {
    if (!projectId) return;
    try {
      const chaptersData = await chapterApi.getChapters(projectId);
      setChapters(chaptersData);
    } catch (error) {
      console.error('加载章节列表失败:', error);
    }
  }, [projectId]);

  // 加载角色列表（用于关联角色）
  const loadCharacters = useCallback(async () => {
    if (!projectId) return;
    try {
      const charactersData = await characterApi.getCharacters(projectId);
      setCharacters(charactersData);
    } catch (error) {
      console.error('加载角色列表失败:', error);
    }
  }, [projectId]);

  // 加载统计
  const loadStats = useCallback(async () => {
    if (!projectId) return;
    try {
      // 获取当前最大章节号（只计算有内容的章节，与表格显示逻辑保持一致）
      const chaptersWithContent = chapters.filter(c => c.content);
      const maxChapter = chaptersWithContent.length > 0
        ? Math.max(...chaptersWithContent.map(c => c.chapter_number))
        : undefined;
      const statsData = await foreshadowApi.getForeshadowStats(projectId, maxChapter);
      setStats(statsData);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  }, [projectId, chapters]);

  useEffect(() => {
    loadForeshadows();
    loadChapters();
    loadCharacters();
  }, [loadForeshadows, loadChapters, loadCharacters]);

  useEffect(() => {
    const handleTaskSettled = (payload?: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { projectId?: string; resources?: string[] };
      if (data.projectId && data.projectId !== projectId) return;
      if (!data.resources?.includes('foreshadows')) return;
      void loadForeshadows();
      void loadStats();
    };
    eventBus.on(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
    return () => eventBus.off(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
  }, [loadForeshadows, loadStats, projectId]);

  // 计算表格滚动高度
  useEffect(() => {
    const calculateTableHeight = () => {
      if (tableContainerRef.current) {
        // 获取容器高度，减去表头高度（约55px）
        const containerHeight = tableContainerRef.current.clientHeight;
        setTableScrollY(Math.max(containerHeight - 55, 200));
      }
    };
    
    calculateTableHeight();
    window.addEventListener('resize', calculateTableHeight);
    
    // 延迟再计算一次，确保布局完成
    const timer = setTimeout(calculateTableHeight, 100);
    
    return () => {
      window.removeEventListener('resize', calculateTableHeight);
      clearTimeout(timer);
    };
  }, [stats]); // Recalculate when stats change because the statistic card height can change.

  useEffect(() => {
    if (chapters.length > 0) {
      loadStats();
    }
  }, [chapters, loadStats]);

  // 创建/编辑伏笔
  const handleSave = async (values: ForeshadowCreate | ForeshadowUpdate) => {
    try {
      if (currentForeshadow) {
        await foreshadowApi.updateForeshadow(currentForeshadow.id, values as ForeshadowUpdate);
        message.success('Foreshadow updated successfully');
      } else {
        await foreshadowApi.createForeshadow({
          ...values,
          project_id: projectId!,
        } as ForeshadowCreate);
        message.success('Foreshadow created successfully');
      }
      setEditModalVisible(false);
      form.resetFields();
      setCurrentForeshadow(null);
      loadForeshadows();
    } catch (error) {
      console.error('保存伏笔失败:', error);
    }
  };

  // 删除伏笔
  const handleDelete = async (id: string) => {
    try {
      await foreshadowApi.deleteForeshadow(id);
      message.success('Foreshadow deleted successfully');
      loadForeshadows();
    } catch (error) {
      console.error('删除伏笔失败:', error);
    }
  };

  // 标记埋入
  const handlePlant = async (values: { chapter_id: string; hint_text?: string }) => {
    if (!currentForeshadow) return;
    
    const chapter = chapters.find(c => c.id === values.chapter_id);
    if (!chapter) return;
    
    try {
      await foreshadowApi.plantForeshadow(currentForeshadow.id, {
        chapter_id: values.chapter_id,
        chapter_number: chapter.chapter_number,
        hint_text: values.hint_text,
      });
      message.success('Foreshadow marked as planted');
      setPlantModalVisible(false);
      plantForm.resetFields();
      setCurrentForeshadow(null);
      loadForeshadows();
    } catch (error) {
      console.error('标记埋入失败:', error);
    }
  };

  // 标记回收
  const handleResolve = async (values: { chapter_id: string; resolution_text?: string; is_partial?: boolean }) => {
    if (!currentForeshadow) return;
    
    const chapter = chapters.find(c => c.id === values.chapter_id);
    if (!chapter) return;
    
    try {
      await foreshadowApi.resolveForeshadow(currentForeshadow.id, {
        chapter_id: values.chapter_id,
        chapter_number: chapter.chapter_number,
        resolution_text: values.resolution_text,
        is_partial: values.is_partial,
      });
      message.success('Foreshadow marked as resolved');
      setResolveModalVisible(false);
      resolveForm.resetFields();
      setCurrentForeshadow(null);
      loadForeshadows();
    } catch (error) {
      console.error('标记回收失败:', error);
    }
  };

  // 标记废弃
  const handleAbandon = async (id: string) => {
    try {
      await foreshadowApi.abandonForeshadow(id);
      message.success('Foreshadow marked as abandoned');
      loadForeshadows();
    } catch (error) {
      console.error('标记废弃失败:', error);
    }
  };

  // 从分析同步
  const handleSync = async () => {
    if (!projectId) return;
    
    setSyncing(true);
    try {
      const result = await foreshadowApi.syncFromAnalysis(projectId, {
        auto_set_planted: true,
      });
      message.success(`Sync complete: added ${result.synced_count} foreshadows and skipped ${result.skipped_count}`);
      setSyncModalVisible(false);
      loadForeshadows();
    } catch (error) {
      console.error('同步失败:', error);
    } finally {
      setSyncing(false);
    }
  };

  // 打开编辑模态框
  const openEditModal = (foreshadow?: Foreshadow) => {
    setCurrentForeshadow(foreshadow || null);
    if (foreshadow) {
      // 确保数组类型字段不为null
      form.setFieldsValue({
        ...foreshadow,
        tags: foreshadow.tags || [],
        related_characters: foreshadow.related_characters || [],
      });
    } else {
      form.resetFields();
    }
    setEditModalVisible(true);
  };

  // 打开详情模态框
  const openDetailModal = (foreshadow: Foreshadow) => {
    setCurrentForeshadow(foreshadow);
    setDetailModalVisible(true);
  };

  // 打开埋入模态框
  const openPlantModal = (foreshadow: Foreshadow) => {
    setCurrentForeshadow(foreshadow);
    plantForm.resetFields();
    setPlantModalVisible(true);
  };

  // 打开回收模态框
  const openResolveModal = (foreshadow: Foreshadow) => {
    setCurrentForeshadow(foreshadow);
    resolveForm.resetFields();
    setResolveModalVisible(true);
  };

  // 计算紧急程度
  const getUrgencyBadge = (foreshadow: Foreshadow) => {
    if (foreshadow.status !== 'planted' || !foreshadow.target_resolve_chapter_number) {
      return null;
    }
    
    const chaptersWithContent = chapters.filter(c => c.content);
    const currentMaxChapter = chaptersWithContent.length > 0
      ? Math.max(...chaptersWithContent.map(c => c.chapter_number))
      : 0;
    
    const remaining = foreshadow.target_resolve_chapter_number - currentMaxChapter;
    
    if (remaining < 0) {
      return <Badge status="error" text={`${Math.abs(remaining)} chapters overdue`} />;
    } else if (remaining <= 3) {
      return <Badge status="warning" text={`${remaining} chapters remaining`} />;
    }
    return null;
  };

  // 状态排序优先级
  const statusOrder: Record<ForeshadowStatus, number> = {
    planted: 1,      // Planted foreshadows take priority because they need resolution.
    pending: 2,      // Pending foreshadows come next.
    partially_resolved: 3,
    resolved: 4,
    abandoned: 5,
  };

  // 表格列定义
  const columns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      sorter: (a: Foreshadow, b: Foreshadow) => statusOrder[a.status] - statusOrder[b.status],
      render: (status: ForeshadowStatus) => {
        const config = STATUS_CONFIG[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      sorter: (a: Foreshadow, b: Foreshadow) => a.title.localeCompare(b.title, 'zh-CN'),
      render: (title: string, record: Foreshadow) => (
        <Space direction="vertical" size={0}>
          <Space>
            <a onClick={() => openDetailModal(record)}>{title}</a>
            {record.is_long_term && (
              <Tag color="purple" style={{ marginLeft: 4 }}>Long-term</Tag>
            )}
          </Space>
          {getUrgencyBadge(record)}
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      sorter: (a: Foreshadow, b: Foreshadow) => {
        const catA = a.category || '';
        const catB = b.category || '';
        return catA.localeCompare(catB, 'zh-CN');
      },
      render: (category?: ForeshadowCategory) => {
        if (!category) return '-';
        const config = CATEGORY_CONFIG[category];
        return config ? <Tag color={config.color}>{config.label}</Tag> : category;
      },
    },
    {
      title: 'Plant Chapter',
      dataIndex: 'plant_chapter_number',
      key: 'plant_chapter_number',
      width: 120,
      sorter: (a: Foreshadow, b: Foreshadow) => {
        const valA = a.plant_chapter_number ?? 999999;
        const valB = b.plant_chapter_number ?? 999999;
        return valA - valB;
      },
      defaultSortOrder: 'ascend' as const,
      render: (num?: number) => num ? `Chapter ${num}` : '-',
    },
    {
      title: 'Planned Resolution',
      dataIndex: 'target_resolve_chapter_number',
      key: 'target_resolve_chapter_number',
      width: 120,
      sorter: (a: Foreshadow, b: Foreshadow) => {
        const valA = a.target_resolve_chapter_number ?? 999999;
        const valB = b.target_resolve_chapter_number ?? 999999;
        return valA - valB;
      },
      render: (num?: number) => num ? `Chapter ${num}` : '-',
    },
    {
      title: 'Importance',
      dataIndex: 'importance',
      key: 'importance',
      width: 100,
      sorter: (a: Foreshadow, b: Foreshadow) => a.importance - b.importance,
      render: (importance: number) => {
        const stars = Math.round(importance * 5);
        return '★'.repeat(stars) + '☆'.repeat(5 - stars);
      },
    },
    {
      title: 'Source',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 80,
      sorter: (a: Foreshadow, b: Foreshadow) => {
        const srcA = a.source_type || '';
        const srcB = b.source_type || '';
        return srcA.localeCompare(srcB);
      },
      render: (source?: string) => (
        <Tag color={source === 'analysis' ? 'blue' : 'green'}>
          {source === 'analysis' ? 'Analysis' : 'Manual'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: Foreshadow) => (
        <Space size="small">
          <Tooltip title="View details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetailModal(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          {record.status === 'pending' && (
            <Tooltip title="Mark as planted">
              <Button type="text" size="small" icon={<FlagOutlined />} onClick={() => openPlantModal(record)} />
            </Tooltip>
          )}
          {record.status === 'planted' && (
            <Tooltip title="Mark as resolved">
              <Button type="text" size="small" icon={<CheckCircleOutlined />} onClick={() => openResolveModal(record)} />
            </Tooltip>
          )}
          {record.status !== 'abandoned' && record.status !== 'resolved' && (
            <Popconfirm
              title="Are you sure you want to abandon this foreshadow?"
              onConfirm={() => handleAbandon(record.id)}
            >
              <Tooltip title="Abandon">
                <Button type="text" size="small" danger icon={<CloseCircleOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          <Popconfirm
            title="Are you sure you want to delete this foreshadow?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Statistics cards */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={3}>
            <Card size="small">
              <Statistic title="Total" value={stats.total} />
            </Card>
          </Col>
          <Col span={3}>
            <Card size="small">
              <Statistic title="Pending" value={stats.pending} valueStyle={{ color: token.colorTextSecondary }} />
            </Card>
          </Col>
          <Col span={3}>
            <Card size="small">
              <Statistic title="Planted" value={stats.planted} valueStyle={{ color: token.colorSuccess }} />
            </Card>
          </Col>
          <Col span={3}>
            <Card size="small">
              <Statistic title="Resolved" value={stats.resolved} valueStyle={{ color: token.colorPrimary }} />
            </Card>
          </Col>
          <Col span={3}>
            <Card size="small">
              <Statistic title="Long-term Foreshadows" value={stats.long_term_count} valueStyle={{ color: token.colorInfo }} />
            </Card>
          </Col>
          <Col span={3}>
            <Card size="small">
              <Statistic 
                title="Overdue"
                value={stats.overdue_count} 
                valueStyle={{ color: stats.overdue_count > 0 ? token.colorError : token.colorTextSecondary }}
                prefix={stats.overdue_count > 0 ? <WarningOutlined /> : null}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Overdue reminder */}
      {stats && stats.overdue_count > 0 && (
        <Alert
          message={`${stats.overdue_count} foreshadows are overdue`}
          description="Resolve these foreshadows in upcoming chapters or adjust their planned resolution chapters."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Automatic sync notice */}
      <Alert
        message={
          <Space>
            <InfoCircleOutlined />
            <span>Foreshadows sync automatically when chapter analysis is complete. No manual action is needed.</span>
          </Space>
        }
        type="info"
        showIcon={false}
        style={{ marginBottom: 16 }}
        closable
      />

      {/* Toolbar */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: 120 }}
            value={statusFilter}
            onChange={setStatusFilter}
          >
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Option key={key} value={key}>{config.label}</Option>
            ))}
          </Select>
          <Select
            placeholder="Filter by category"
            allowClear
            style={{ width: 100 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
          >
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <Option key={key} value={key}>{config.label}</Option>
            ))}
          </Select>
          <Select
            placeholder="Filter by source"
            allowClear
            style={{ width: 100 }}
            value={sourceFilter}
            onChange={setSourceFilter}
          >
            <Option value="analysis">Analysis</Option>
            <Option value="manual">Manual</Option>
          </Select>
        </Space>
        <Space>
          <Tooltip title="Refresh list">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={loadForeshadows}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'sync',
                  icon: <SyncOutlined />,
                  label: 'Sync analyzed foreshadows manually',
                  onClick: () => setSyncModalVisible(true),
                },
              ] as MenuProps['items'],
            }}
            placement="bottomRight"
          >
            <Button icon={<MoreOutlined />}>More</Button>
          </Dropdown>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openEditModal()}
          >
            Add Foreshadow
          </Button>
        </Space>
      </div>

      {/* Foreshadow list - scrollable table body with a fixed header */}
      <div
        ref={tableContainerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0, // Allow flex children to shrink.
        }}
      >
        <Table
          dataSource={foreshadows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ y: tableScrollY }}
          locale={{
            emptyText: <Empty description="No foreshadows yet. Select Add Foreshadow to get started." />,
          }}
        />
      </div>

      {/* Paginator - fixed at the bottom and centered */}
      <div style={{
        padding: '12px 0',
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        background: token.colorBgContainer,
      }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={(page, size) => {
            setCurrentPage(page);
            if (size !== pageSize) {
              setPageSize(size);
            }
          }}
          showSizeChanger
          showTotal={(total) => `${total} total`}
          showQuickJumper
        />
      </div>

      {/* Create/edit modal */}
      <Modal
        title={currentForeshadow ? 'Edit Foreshadow' : 'Add Foreshadow'}
        open={editModalVisible}
        centered
        onCancel={() => {
          setEditModalVisible(false);
          setCurrentForeshadow(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={800}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            importance: 0.5,
            strength: 5,
            subtlety: 5,
            is_long_term: false,
            auto_remind: true,
            remind_before_chapters: 5,
            include_in_context: true,
          }}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="title" label="Foreshadow Title" rules={[{ required: true, message: 'Enter a title' }]}>
                <Input placeholder="Briefly describe the foreshadow" maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="Category">
                <Select placeholder="Select a category" allowClear>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <Option key={key} value={key}>{config.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="content" label="Foreshadow Content" rules={[{ required: true, message: 'Enter content' }]}>
            <TextArea rows={3} placeholder="Describe the foreshadow and its purpose in detail" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="plant_chapter_number" label="Planned Plant Chapter">
                <InputNumber min={1} placeholder="Chapter number" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="target_resolve_chapter_number" label="Planned Resolution Chapter">
                <InputNumber min={1} placeholder="Chapter number" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="related_characters" label="Related Characters">
                <Select
                  mode="multiple"
                  placeholder="Select related characters"
                  optionFilterProp="children"
                  maxTagCount={3}
                >
                  {characters
                    .filter(char => !char.is_organization)
                    .map(char => (
                      <Option key={char.name} value={char.name}>
                        {char.name} {char.role_type ? `(${char.role_type})` : ''}
                      </Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="importance" label="Importance (0-1)">
                <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="strength" label="Strength (1-10)">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="subtlety" label="Subtlety (1-10)">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_long_term" label="Long-term Foreshadow" valuePropName="checked">
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hint_text" label="Hint Text">
                <TextArea rows={2} placeholder="Subtle description to use when planting the foreshadow" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notes" label="Notes">
                <TextArea rows={2} placeholder="Writing notes (visible only to the author)" />
              </Form.Item>
            </Col>
          </Row>
          
          <Divider style={{ margin: '12px 0' }}>AI Assistance Settings</Divider>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="auto_remind" label="Automatic Reminders" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="include_in_context" label="Include in Generation Context" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="remind_before_chapters" label="Remind Me This Many Chapters Ahead" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Details modal */}
      <Modal
        title="Foreshadow Details"
        open={detailModalVisible}
        centered
        onCancel={() => {
          setDetailModalVisible(false);
          setCurrentForeshadow(null);
        }}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>,
          <Button key="edit" type="primary" onClick={() => {
            setDetailModalVisible(false);
            openEditModal(currentForeshadow!);
          }}>
            Edit
          </Button>,
        ]}
        width={600}
      >
        {currentForeshadow && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <h3>{currentForeshadow.title}</h3>
                <Space>
                  <Tag color={STATUS_CONFIG[currentForeshadow.status].color}>
                    {STATUS_CONFIG[currentForeshadow.status].label}
                  </Tag>
                  {currentForeshadow.is_long_term && <Tag color="purple">Long-term Foreshadow</Tag>}
                  {currentForeshadow.category && CATEGORY_CONFIG[currentForeshadow.category] && (
                    <Tag color={CATEGORY_CONFIG[currentForeshadow.category].color}>
                      {CATEGORY_CONFIG[currentForeshadow.category].label}
                    </Tag>
                  )}
                </Space>
              </Col>
              
              <Col span={24}>
                <strong>Foreshadow Content:</strong>
                <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{currentForeshadow.content}</p>
              </Col>
              
              {currentForeshadow.hint_text && (
                <Col span={24}>
                  <strong>Hint Text:</strong>
                  <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: token.colorTextSecondary }}>
                    {currentForeshadow.hint_text}
                  </p>
                </Col>
              )}
              
              {currentForeshadow.resolution_text && (
                <Col span={24}>
                  <strong>Reveal Text:</strong>
                  <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: token.colorTextSecondary }}>
                    {currentForeshadow.resolution_text}
                  </p>
                </Col>
              )}
              
              <Col span={12}>
                <strong>Plant Chapter:</strong> {currentForeshadow.plant_chapter_number ? `Chapter ${currentForeshadow.plant_chapter_number}` : 'Not set'}
              </Col>
              <Col span={12}>
                <strong>Planned Resolution:</strong> {currentForeshadow.target_resolve_chapter_number ? `Chapter ${currentForeshadow.target_resolve_chapter_number}` : 'Not set'}
              </Col>
              
              {currentForeshadow.actual_resolve_chapter_number && (
                <Col span={24}>
                  <strong>Actual Resolution:</strong> Chapter {currentForeshadow.actual_resolve_chapter_number}
                </Col>
              )}
              
              <Col span={8}>
                <strong>Importance:</strong> {'★'.repeat(Math.round(currentForeshadow.importance * 5))}
              </Col>
              <Col span={8}>
                <strong>Strength:</strong> {currentForeshadow.strength}/10
              </Col>
              <Col span={8}>
                <strong>Subtlety:</strong> {currentForeshadow.subtlety}/10
              </Col>
              
              {currentForeshadow.related_characters && currentForeshadow.related_characters.length > 0 && (
                <Col span={24}>
                  <strong>Related Characters:</strong>
                  <div style={{ marginTop: 4 }}>
                    {currentForeshadow.related_characters.map((name, idx) => (
                      <Tag key={idx}>{name}</Tag>
                    ))}
                  </div>
                </Col>
              )}
              
              {currentForeshadow.notes && (
                <Col span={24}>
                  <strong>Notes:</strong>
                  <p style={{ marginTop: 8, color: token.colorTextSecondary }}>{currentForeshadow.notes}</p>
                </Col>
              )}
              
              <Col span={24}>
                <strong>Source:</strong> {currentForeshadow.source_type === 'analysis' ? 'Extracted from chapter analysis' : 'Added manually'}
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* Mark as planted modal */}
      <Modal
        title="Mark Foreshadow as Planted"
        open={plantModalVisible}
        centered
        onCancel={() => {
          setPlantModalVisible(false);
          setCurrentForeshadow(null);
          plantForm.resetFields();
        }}
        onOk={() => plantForm.submit()}
        destroyOnClose
      >
        <Form form={plantForm} layout="vertical" onFinish={handlePlant}>
          <Form.Item name="chapter_id" label="Select Plant Chapter" rules={[{ required: true, message: 'Select a chapter' }]}>
            <Select placeholder="Select a chapter">
              {chapters.map(chapter => (
                <Option key={chapter.id} value={chapter.id}>
                  Chapter {chapter.chapter_number} - {chapter.title}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="hint_text" label="Hint Text (Optional)">
            <TextArea rows={3} placeholder="Record the subtle description used to plant the foreshadow" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Mark as resolved modal */}
      <Modal
        title="Mark Foreshadow as Resolved"
        open={resolveModalVisible}
        centered
        onCancel={() => {
          setResolveModalVisible(false);
          setCurrentForeshadow(null);
          resolveForm.resetFields();
        }}
        onOk={() => resolveForm.submit()}
        destroyOnClose
      >
        <Form form={resolveForm} layout="vertical" onFinish={handleResolve}>
          <Form.Item name="chapter_id" label="Select Resolution Chapter" rules={[{ required: true, message: 'Select a chapter' }]}>
            <Select placeholder="Select a chapter">
              {chapters.map(chapter => (
                <Option key={chapter.id} value={chapter.id}>
                  Chapter {chapter.chapter_number} - {chapter.title}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="resolution_text" label="Reveal Text (Optional)">
            <TextArea rows={3} placeholder="Record how the foreshadow is revealed" />
          </Form.Item>
          <Form.Item name="is_partial" label="Partially Resolved" valuePropName="checked">
            <Switch checkedChildren="Partial" unCheckedChildren="Full" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Sync modal */}
      <Modal
        title="Manually Sync Analyzed Foreshadows"
        open={syncModalVisible}
        centered
        onCancel={() => setSyncModalVisible(false)}
        onOk={handleSync}
        confirmLoading={syncing}
        okText="Start Sync"
      >
        <Alert
          message="Note"
          description="Foreshadows usually sync automatically after chapter analysis. Use this feature to manually sync any that may have been missed."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <p>This will extract foreshadow information from completed chapter analyses and sync it to the foreshadow manager.</p>
        <ul>
          <li>Existing foreshadow records will not be overwritten.</li>
          <li>Newly synced foreshadows will be marked as "Planted."</li>
          <li>After syncing, you can view and edit them in the list.</li>
        </ul>
      </Modal>
    </div>
  );
}
