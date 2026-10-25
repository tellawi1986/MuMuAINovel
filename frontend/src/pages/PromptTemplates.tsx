import { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Button,
  Switch,
  Modal,
  Input,
  Tag,
  message,
  Space,
  Typography,
  Row,
  Col,
  Alert,
  Upload,
  Spin,
  Empty,
  theme
} from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  DownloadOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { promptTemplateCardStyles, promptTemplateCardHoverHandlers, promptTemplateGridConfig } from '../components/CardStyles';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface PromptTemplate {
  id: string;
  template_key: string;
  template_name: string;
  template_content: string;
  description: string;
  category: string;
  parameters: string;
  is_active: boolean;
  is_system_default: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryGroup {
  category: string;
  count: number;
  templates: PromptTemplate[];
}

export default function PromptTemplates() {
  const { token } = theme.useToken();
  const [modal, contextHolder] = Modal.useModal();
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('0');
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const isMobile = window.innerWidth <= 768;

  // Load template data.
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await axios.get<CategoryGroup[]>('/api/prompt-templates/categories');
      setCategories(response.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      message.error(err.response?.data?.detail || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Get templates in the selected category.
  const getCurrentTemplates = (): PromptTemplate[] => {
    const index = parseInt(selectedCategory);
    if (index === 0) {
      return categories.flatMap(cat => cat.templates);
    }
    return categories[index - 1]?.templates || [];
  };

  // Edit a template.
  const handleEdit = (template: PromptTemplate) => {
    setEditingTemplate({ ...template });
    setEditorVisible(true);
  };

  // Save a template.
  const handleSave = async () => {
    if (!editingTemplate) return;

    try {
      setLoading(true);
      const createsAccountCopy = editingTemplate.is_system_default;
      await axios.post('/api/prompt-templates', {
        template_key: editingTemplate.template_key,
        template_name: editingTemplate.template_name,
        template_content: editingTemplate.template_content,
        description: editingTemplate.description,
        category: editingTemplate.category,
        parameters: editingTemplate.parameters,
        is_active: editingTemplate.is_active
      });
      message.success(createsAccountCopy ? 'Saved as a custom copy for the current account' : 'Saved successfully');
      setEditorVisible(false);
      loadTemplates();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      message.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  // Restore the system default.
  const handleReset = async (templateKey: string) => {
    modal.confirm({
      title: 'Confirm Reset',
      content: 'Delete this account’s custom copy and restore the system default? This will not affect other accounts.',
      okText: 'Confirm',
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          setLoading(true);
          await axios.post(`/api/prompt-templates/${templateKey}/reset`);
          message.success('Restored the system default');
          loadTemplates();
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: string } } };
          message.error(err.response?.data?.detail || 'Reset failed');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Toggle the enabled state.
  const handleToggleActive = async (template: PromptTemplate, checked: boolean) => {
    try {
      await axios.put(`/api/prompt-templates/${template.template_key}`, {
        is_active: checked
      });
      loadTemplates();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      message.error(err.response?.data?.detail || 'Operation failed');
    }
  };

  // Export all templates.
  const handleExport = async () => {
    try {
      const response = await axios.post('/api/prompt-templates/export');
      const stats = response.data.statistics;
      
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-templates-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      if (stats) {
        message.success(
          `Exported ${stats.total} prompt configurations (${stats.customized} custom, ${stats.system_default} system defaults)`,
          5
        );
      } else {
        message.success('Exported successfully');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      message.error(err.response?.data?.detail || 'Export failed');
    }
  };

  // Import templates.
  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const response = await axios.post('/api/prompt-templates/import', data);
      
      const result = response.data;
      const stats = result.statistics;
      
      // Build a detailed success message.
      let successMsg = `Import successful!\n`;
      if (stats) {
        successMsg += `• Kept system defaults: ${stats.kept_system_default}\n`;
        successMsg += `• Created/updated custom templates: ${stats.created_or_updated}`;
        
        if (stats.converted_to_custom > 0) {
          successMsg += `\n• Modified defaults converted to custom: ${stats.converted_to_custom}`;
        }
      }
      
      // Show details if any templates were converted.
      if (result.converted_templates && result.converted_templates.length > 0) {
        modal.info({
          title: 'Import Complete',
          width: 600,
          centered: true,
          content: (
            <div>
              <p style={{ marginBottom: 16 }}>{successMsg}</p>
              {result.converted_templates.length > 0 && (
                <div>
                  <p style={{ fontWeight: 'bold', marginBottom: 8 }}>The following templates differ from the system defaults and were converted to custom templates:</p>
                  <ul style={{ marginLeft: 20 }}>
                    {result.converted_templates.map((t: { template_key: string; template_name: string }) => (
                      <li key={t.template_key}>
                        {t.template_name} ({t.template_key})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ),
          okText: 'OK'
        });
      } else {
        message.success(successMsg, 5);
      }
      
      loadTemplates();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      message.error(err.response?.data?.detail || 'Import failed');
    }
    return false; // Prevent the default upload behavior.
  };

  const currentTemplates = getCurrentTemplates();
  const pageBackground = `linear-gradient(180deg, ${token.colorBgLayout} 0%, ${token.colorFillSecondary} 100%)`;
  const headerBackground = `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`;

  return (
    <>
      {contextHolder}
      <div style={{
      minHeight: '90vh',
      background: pageBackground,
      padding: isMobile ? '20px 16px 70px' : '24px 24px 70px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Top navigation card */}
        <Card
          variant="borderless"
          style={{
            background: headerBackground,
            borderRadius: isMobile ? 16 : 24,
            boxShadow: token.boxShadowSecondary,
            marginBottom: isMobile ? 20 : 24,
            border: 'none',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Decorative background elements */}
          <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: token.colorWhite, opacity: 0.08, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -40, left: '30%', width: 120, height: 120, borderRadius: '50%', background: token.colorWhite, opacity: 0.05, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', right: '15%', width: 80, height: 80, borderRadius: '50%', background: token.colorWhite, opacity: 0.06, pointerEvents: 'none' }} />

          <Row align="middle" justify="space-between" gutter={[16, 16]} style={{ position: 'relative', zIndex: 1 }}>
            <Col xs={24} sm={12} md={14}>
              <Space direction="vertical" size={4}>
                <Title level={isMobile ? 3 : 2} style={{ margin: 0, color: token.colorWhite, textShadow: `0 2px 4px ${token.colorBgMask}` }}>
                  <FileSearchOutlined style={{ color: token.colorWhite, opacity: 0.9, marginRight: 8 }} />
                  Prompt Template Management
                </Title>
                <Text style={{ fontSize: isMobile ? 12 : 14, color: token.colorTextLightSolid, opacity: 0.85, marginLeft: isMobile ? 40 : 48 }}>
                  Manage custom AI prompts separately for each account
                </Text>
              </Space>
            </Col>
            <Col xs={24} sm={12} md={10}>
              <Space wrap style={{ justifyContent: isMobile ? 'flex-start' : 'flex-end', width: '100%' }}>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExport}
                  size={isMobile ? 'small' : 'middle'}
                  style={{
                    borderRadius: 12,
                    background: token.colorWhite,
                    border: `1px solid ${token.colorWhite}`,
                    boxShadow: token.boxShadow,
                    color: token.colorPrimary,
                    fontWeight: 600,
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  Export Configuration
                </Button>
                <Upload
                  accept=".json"
                  showUploadList={false}
                  beforeUpload={handleImport}
                >
                  <Button
                    icon={<UploadOutlined />}
                    size={isMobile ? 'small' : 'middle'}
                    style={{
                      borderRadius: 12,
                      background: token.colorWhite,
                      border: `1px solid ${token.colorWhite}`,
                      boxShadow: token.boxShadow,
                      color: token.colorPrimary,
                      fontWeight: 600,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    Import Configuration
                  </Button>
                </Upload>
              </Space>
            </Col>
          </Row>

          {/* Usage guidance */}
          <Alert
            message={
              <Space align="center">
                <InfoCircleOutlined style={{ fontSize: 16, color: token.colorPrimary }} />
                <Text strong style={{ fontSize: isMobile ? 13 : 14 }}>Instructions</Text>
              </Space>
            }
            description={
              <div>
                <Text style={{ fontSize: isMobile ? 12 : 13, display: 'block', marginBottom: 8 }}>
                  • <strong>System default templates</strong> (gray header): Always enabled; no toggle is needed. Editing creates a custom copy for the current account only.
                </Text>
                <Text style={{ fontSize: isMobile ? 12 : 13, display: 'block' }}>
                  • <strong>Custom templates</strong> (purple header): Apply only to the current account and can be enabled or disabled with the toggle. Use <Text code>{'{variable_name}'}</Text> for variable placeholders. Select "Reset" to restore the system default.
                </Text>
              </div>
            }
            type="info"
            showIcon={false}
            style={{
              marginTop: isMobile ? 16 : 24,
              borderRadius: 12,
              background: token.colorInfoBg,
              border: `1px solid ${token.colorInfoBorder}`
            }}
          />
        </Card>

        {/* Main content */}
        <div style={{ flex: 1 }}>
          <Spin spinning={loading}>
            {/* Category tabs */}
            {categories.length > 0 && (
              <Card
                variant="borderless"
                style={{
                  background: token.colorBgContainer,
                  borderRadius: isMobile ? 12 : 16,
                  boxShadow: token.boxShadowSecondary,
                  marginBottom: isMobile ? 16 : 24
                }}
                styles={{ body: { padding: isMobile ? '12px' : '16px' } }}
              >
                <Tabs
                  activeKey={selectedCategory}
                  onChange={setSelectedCategory}
                  items={[
                    { key: '0', label: `All (${categories.reduce((sum, cat) => sum + cat.count, 0)})` },
                    ...categories.map((cat, index) => ({
                      key: (index + 1).toString(),
                      label: `${cat.category} (${cat.count})`
                    }))
                  ]}
                />
              </Card>
            )}

            {/* Template list */}
            {currentTemplates.length === 0 ? (
              <Card
                variant="borderless"
                style={{
                  background: token.colorBgContainer,
                  borderRadius: isMobile ? 12 : 16,
                  boxShadow: token.boxShadowSecondary,
                }}
              >
                <Empty
                  description="No templates available"
                  style={{ padding: '80px 0' }}
                />
              </Card>
            ) : (
              <Row gutter={[16, 16]}>
                {currentTemplates.map(template => (
                  <Col {...promptTemplateGridConfig} key={template.id}>
                    <Card
                      hoverable
                      variant="borderless"
                      style={promptTemplateCardStyles.templateCard}
                      styles={{ body: { padding: 0, overflow: 'hidden' } }}
                      {...promptTemplateCardHoverHandlers}
                    >
                      {/* Header */}
                      <div style={{
                        background: template.is_system_default
                          ? token.colorFillTertiary
                          : token.colorPrimary,
                        padding: isMobile ? '16px' : '20px',
                        position: 'relative'
                      }}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Title level={isMobile ? 5 : 4} style={{ margin: 0, color: template.is_system_default ? token.colorText : token.colorWhite, flex: 1 }} ellipsis>
                              {template.template_name}
                            </Title>
                            {!template.is_system_default && (
                              <Switch
                                checked={template.is_active}
                                onChange={(checked) => handleToggleActive(template, checked)}
                                size={isMobile ? 'small' : 'default'}
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </div>
                          <Space wrap>
                            <Tag color={template.is_system_default ? 'default' : 'rgba(255,255,255,0.3)'} style={{ color: template.is_system_default ? token.colorTextSecondary : token.colorWhite, border: 'none' }}>
                              {template.category}
                            </Tag>
                            <Tag color={template.is_system_default ? 'default' : 'rgba(255,255,255,0.3)'} style={{ color: template.is_system_default ? token.colorTextSecondary : token.colorWhite, border: 'none' }}>
                              {template.is_system_default ? 'System Default' : 'Custom'}
                            </Tag>
                          </Space>
                        </Space>
                      </div>

                      {/* Content */}
                      <div style={{ padding: isMobile ? '16px' : '20px' }}>
                        <Paragraph
                          type="secondary"
                          ellipsis={{ rows: 3 }}
                          style={{ minHeight: 66, marginBottom: 16 }}
                        >
                          {template.description || 'No description'}
                        </Paragraph>

                        <Space wrap style={{ marginBottom: 16 }}>
                          <Tag
                            icon={<CheckCircleOutlined />}
                            color={template.is_system_default || template.is_active ? 'success' : 'default'}
                          >
                            {template.is_system_default ? 'Always enabled' : (template.is_active ? 'Enabled' : 'Disabled')}
                          </Tag>
                        </Space>

                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                          Template key: {template.template_key}
                        </Text>

                        {/* Actions */}
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(template)}
                            size={isMobile ? 'small' : 'middle'}
                            style={{ borderRadius: 6 }}
                          >
                            Edit
                          </Button>
                          <Button
                            icon={<ReloadOutlined />}
                            onClick={() => handleReset(template.template_key)}
                            size={isMobile ? 'small' : 'middle'}
                            style={{ borderRadius: 6 }}
                          >
                            Reset
                          </Button>
                        </Space>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </div>
      </div>

      {/* Edit dialog */}
      <Modal
        title={`Edit Template: ${editingTemplate?.template_name}`}
        open={editorVisible}
        onCancel={() => setEditorVisible(false)}
        onOk={handleSave}
        width={isMobile ? '100%' : 900}
        centered={!isMobile}
        confirmLoading={loading}
        okText="Save"
        cancelText="Cancel"
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={isMobile ? {
          body: {
            maxHeight: 'calc(100vh - 110px)',
            overflowY: 'auto',
            padding: '16px'
          }
        } : undefined}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Template Name</label>
            <Input
              value={editingTemplate?.template_name || ''}
              onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, template_name: e.target.value } : null)}
              placeholder="Enter a template name"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Description</label>
            <TextArea
              value={editingTemplate?.description || ''}
              onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, description: e.target.value } : null)}
              rows={2}
              placeholder="Briefly describe what this template is for"
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Template Content</label>
            <TextArea
              value={editingTemplate?.template_content || ''}
              onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, template_content: e.target.value } : null)}
              rows={isMobile ? 15 : 20}
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
              placeholder="Enter the prompt template..."
            />
          </div>

          <Alert
            message="Tip: Use {variable_name} for variable placeholders"
            type="info"
            showIcon
            style={{ borderRadius: 8 }}
          />
        </Space>
      </Modal>
    </div>
    </>
  );
}
