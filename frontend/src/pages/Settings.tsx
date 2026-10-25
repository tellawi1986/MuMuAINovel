import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, Slider, InputNumber, message, Space, Typography, Spin, Modal, Alert, Grid, Tabs, List, Tag, Popconfirm, Empty, Row, Col, Switch, theme } from 'antd';
import { SaveOutlined, DeleteOutlined, ReloadOutlined, InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, PlusOutlined, EditOutlined, CopyOutlined, WarningOutlined, PictureOutlined } from '@ant-design/icons';
import { settingsApi, mcpPluginApi } from '../services/api';
import type { SettingsUpdate, APIKeyPreset, PresetCreateRequest, APIKeyPresetConfig } from '../types';
import { eventBus, EventNames } from '../store/eventBus';

const { Title, Text } = Typography;
const { Option } = Select;
const { useBreakpoint } = Grid;
const { TextArea } = Input;

export default function SettingsPage() {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md; // md断点是768px
  const [form] = Form.useForm();
  const [modal, contextHolder] = Modal.useModal();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasSettings, setHasSettings] = useState(false);
  const [isDefaultSettings, setIsDefaultSettings] = useState(false);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string; description: string }>>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [modelSearchText, setModelSearchText] = useState('');
  const [testingApi, setTestingApi] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    response_time_ms?: number;
    response_preview?: string;
    error?: string;
    error_type?: string;
    suggestions?: string[];
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [testingCoverApi, setTestingCoverApi] = useState(false);
  const [coverTestResult, setCoverTestResult] = useState<{
    success: boolean;
    message: string;
    provider?: string;
    model?: string;
  } | null>(null);

  // 预设相关状态
  const [activeTab, setActiveTab] = useState('current');
  const [presets, setPresets] = useState<APIKeyPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | undefined>();
  const [chapterAnalysisPresetId, setChapterAnalysisPresetId] = useState<string | undefined>();
  const [savingChapterAnalysisPreset, setSavingChapterAnalysisPreset] = useState(false);
  const [editingPreset, setEditingPreset] = useState<APIKeyPreset | null>(null);
  const [isPresetModalVisible, setIsPresetModalVisible] = useState(false);
  const [testingPresetId, setTestingPresetId] = useState<string | null>(null);
  const [presetForm] = Form.useForm();
  
  // 预设编辑窗口的模型列表状态（独立于当前配置的模型列表）
  const [presetModelOptions, setPresetModelOptions] = useState<Array<{ value: string; label: string; description: string }>>([]);
  const [fetchingPresetModels, setFetchingPresetModels] = useState(false);
  const [presetModelsFetched, setPresetModelsFetched] = useState(false);
  const [presetModelSearchText, setPresetModelSearchText] = useState('');

  const pageBackground = `linear-gradient(180deg, ${token.colorBgLayout} 0%, ${token.colorFillSecondary} 100%)`;
  const headerBackground = `linear-gradient(135deg, ${token.colorPrimary} 0%, ${token.colorPrimaryHover} 100%)`;

  useEffect(() => {
    loadSettings();
    if (activeTab === 'presets') {
      loadPresets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'presets') {
      loadPresets();
    } else if (activeTab === 'current') {
      // 切换到当前配置Tab时，刷新设置以获取最新数据
      loadSettings();
      // 清除旧的测试结果，因为可能是其他配置的测试结果
      setTestResult(null);
      setShowTestResult(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadSettings = async () => {
    setInitialLoading(true);
    try {
      const settings = await settingsApi.getSettings();
      form.setFieldsValue({
        ...defaultCoverSettings,
        ...settings,
        cover_api_provider: settings.cover_api_provider || defaultCoverSettings.cover_api_provider,
        cover_api_key: settings.cover_api_key ?? defaultCoverSettings.cover_api_key,
        cover_api_base_url: settings.cover_api_base_url || defaultCoverSettings.cover_api_base_url,
        cover_image_model: settings.cover_image_model || defaultCoverSettings.cover_image_model,
        cover_enabled: settings.cover_enabled ?? defaultCoverSettings.cover_enabled,
      });

      // 判断是否为默认设置（id='0'表示来自.env的默认配置）
      if (settings.id === '0' || !settings.id) {
        setIsDefaultSettings(true);
        setHasSettings(false);
      } else {
        setIsDefaultSettings(false);
        setHasSettings(true);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // 如果404表示还没有设置，使用默认值
      if (error?.response?.status === 404) {
        setHasSettings(false);
        setIsDefaultSettings(true);
        form.setFieldsValue({
          api_provider: 'openai',
          api_base_url: 'https://api.openai.com/v1',
          llm_model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 2000,
          disable_thinking: false,
          ...defaultCoverSettings,
        });
      } else {
        message.error('Failed to load settings');
      }
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSave = async (values: SettingsUpdate) => {
    setLoading(true);
    try {
      const normalizedValues: SettingsUpdate = {
        ...values,
        api_key: builtInKeyProviders.includes(values.api_provider || '') ? '' : values.api_key,
      };
      // 检查是否与 MCP 缓存的配置不一致
      const verifiedConfigStr = localStorage.getItem('mcp_verified_config');
      let configChanged = false;
      
      if (verifiedConfigStr) {
        try {
          const verifiedConfig = JSON.parse(verifiedConfigStr);
          configChanged =
            verifiedConfig.provider !== normalizedValues.api_provider ||
            verifiedConfig.baseUrl !== normalizedValues.api_base_url ||
            verifiedConfig.model !== normalizedValues.llm_model;
        } catch (e) {
          console.error('Failed to parse verified config:', e);
        }
      }
      
      await settingsApi.saveSettings(normalizedValues);
      message.success('Settings saved');
      setHasSettings(true);
      setIsDefaultSettings(false);
      
      // 保存后清除测试结果，因为配置可能已变更
      setTestResult(null);
      setShowTestResult(false);
      
      // 手动保存配置后，同步刷新预设激活状态。
      // 后端会在配置与激活预设不一致时自动取消激活，这里统一拉取最新状态，
      // 确保设置界面与预设列表联动一致。
      const previousActivePresetId = activePresetId;
      await loadPresets();
      
      if (previousActivePresetId) {
        const latestPresets = await settingsApi.getPresets();
        const stillActive = latestPresets.active_preset_id === previousActivePresetId;
        if (!stillActive) {
          setActivePresetId(undefined);
          message.info('Configuration changed; the active preset was cleared');
        }
      }
      
      // 如果配置发生变化，需要处理 MCP 插件
      if (configChanged) {
        // 清除 MCP 验证缓存
        localStorage.removeItem('mcp_verified_config');
        
        // 检查并禁用所有 MCP 插件
        try {
          const plugins = await mcpPluginApi.getPlugins();
          const activePlugins = plugins.filter(p => p.enabled);
          
          if (activePlugins.length > 0) {
            // 禁用所有插件
            message.loading({ content: 'Disabling MCP plugins...', key: 'disable_mcp' });
            await Promise.all(activePlugins.map(p => mcpPluginApi.togglePlugin(p.id, false)));
            message.success({ content: 'All MCP plugins have been disabled', key: 'disable_mcp' });
            
            // 显示提示弹窗
            modal.warning({
              title: (
                <Space>
                  <WarningOutlined style={{ color: token.colorWarning }} />
                  <span>API Configuration Changed</span>
                </Space>
              ),
              centered: true,
              content: (
                <div style={{ padding: '8px 0' }}>
                  <Alert
                    message="Your API configuration (provider, URL, or model) changed. All plugins were disabled automatically to ensure MCP plugins continue to work correctly."
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  <div style={{
                    padding: 12,
                    background: token.colorInfoBg,
                    border: `1px solid ${token.colorInfoBorder}`,
                    borderRadius: 8
                  }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>Complete these steps:</Text>
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                      <li>Go to MCP Plugin Management.</li>
                      <li>Run the "Model Capability Check" again.</li>
                      <li>Enable plugins after confirming the new model supports function calling.</li>
                    </ol>
                  </div>
                </div>
              ),
              okText: 'Go to MCP Plugins',
              cancelText: 'Later',
              onOk: () => {
                eventBus.emit(EventNames.SWITCH_TO_MCP_VIEW);
              },
            });
          }
        } catch (err) {
          console.error('Failed to disable MCP plugins:', err);
        }
      }
    } catch {
      message.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    modal.confirm({
      title: 'Reset Settings',
      content: 'Are you sure you want to restore the default settings?',
      centered: true,
      okText: 'Confirm',
      cancelText: 'Cancel',
      onOk: () => {
        form.setFieldsValue({
          api_provider: 'openai',
          api_key: '',
          api_base_url: 'https://api.openai.com/v1',
          llm_model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 2000,
          disable_thinking: false,
          ...defaultCoverSettings,
        });
        message.info('Settings restored to defaults. Select Save to apply them.');
      },
    });
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'Delete Settings',
      content: 'Are you sure you want to delete all settings? This action cannot be undone.',
      centered: true,
      okText: 'Confirm',
      cancelText: 'Cancel',
      okType: 'danger',
      onOk: async () => {
        setLoading(true);
        try {
          await settingsApi.deleteSettings();
          message.success('Settings deleted');
          setHasSettings(false);
          form.resetFields();
        } catch {
          message.error('Failed to delete settings');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const mumuTextDefaultUrl = 'https://zhongzhuan.mumuverse.space/v1';
  const mumuRegisterUrl = 'https://zhongzhuan.mumuverse.space/register?aff=gt7d';
  const xiaomiMimoDefaultUrl = 'https://token-plan-cn.xiaomimimo.com/v1';
  const builtInKeyProviders = ['xiaomi_mimo'];
  const xiaomiMimoDefaultModels = [
    { value: 'mimo-v2.5', label: 'mimo-v2.5', description: 'Official recommended Xiaomi MiMo model' },
  ];
  const mumuCoverBaseUrlOptions = [
    { value: 'https://zhongzhuan.mumuverse.space/v1beta', label: 'https://zhongzhuan.mumuverse.space/v1beta', defaultModel: 'gemini-3.1-flash-image-preview' },
    { value: 'https://zhongzhuan.mumuverse.space/v1', label: 'https://zhongzhuan.mumuverse.space/v1', defaultModel: 'gpt-image-2' },
  ];
  const defaultCoverSettings = {
    cover_enabled: false,
    cover_api_provider: 'mumu',
    cover_api_key: '',
    cover_api_base_url: mumuCoverBaseUrlOptions[0].value,
    cover_image_model: mumuCoverBaseUrlOptions[0].defaultModel,
  };

  const apiProviders = [
    {
      value: 'mumu',
      label: 'MuMu API',
      defaultUrl: mumuTextDefaultUrl,
      defaultModel: 'gemini-3-flash-preview'
    },
    {
      value: 'xiaomi_mimo',
      label: 'Xiaomi MiMo (Built-in)',
      defaultUrl: xiaomiMimoDefaultUrl,
      defaultModel: xiaomiMimoDefaultModels[0].value,
      builtInKey: true,
    },
    { value: 'openai', label: 'OpenAI Compatible', defaultUrl: 'https://api.openai.com/v1' },
    { value: 'anthropic', label: 'Anthropic (Claude)', defaultUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-5-5' },
    { value: 'gemini', label: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  ];

  const selectedProvider = Form.useWatch('api_provider', form);
  const selectedCoverProvider = Form.useWatch('cover_api_provider', form);
  const selectedPresetProvider = Form.useWatch('api_provider', presetForm);

  const handleProviderChange = (value: string) => {
    const provider = apiProviders.find(p => p.value === value);
    if (provider) {
      const nextValues: Record<string, string> = {};
      if (provider.defaultUrl) {
        nextValues.api_base_url = provider.defaultUrl;
      }
      if (provider.value === 'anthropic') {
        nextValues.llm_model = provider.defaultModel || 'claude-sonnet-5-5';
      }
      if (provider.value === 'mumu') {
        nextValues.api_key = '';
        nextValues.llm_model = provider.defaultModel || 'gemini-3-flash-preview';
      }
      if (builtInKeyProviders.includes(provider.value)) {
        nextValues.api_key = '';
        nextValues.llm_model = provider.defaultModel || xiaomiMimoDefaultModels[0].value;
      }
      form.setFieldsValue(nextValues);
    }
    // 清空模型列表，需要重新获取
    setModelOptions([]);
    setModelsFetched(false);
  };

  const coverApiProviders = [
    {
      value: 'mumu',
      label: 'MuMu API',
      defaultUrl: mumuCoverBaseUrlOptions[0].value,
      defaultModel: mumuCoverBaseUrlOptions[0].defaultModel,
    },
    { value: 'gemini', label: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    { value: 'grok', label: 'Grok', defaultUrl: 'https://api.x.ai/v1' },
  ];

  const handleCoverProviderChange = (value: string) => {
    const provider = coverApiProviders.find(p => p.value === value);
    if (!provider) {
      setCoverTestResult(null);
      return;
    }

    const nextValues: Record<string, string> = {};
    if (provider.defaultUrl) {
      nextValues.cover_api_base_url = provider.defaultUrl;
    }
    if (provider.value === 'mumu') {
      nextValues.cover_api_key = '';
      nextValues.cover_image_model = provider.defaultModel || mumuCoverBaseUrlOptions[0].defaultModel;
    }

    form.setFieldsValue(nextValues);
    setCoverTestResult(null);
  };

  const handleMumuCoverBaseUrlChange = (value: string) => {
    const option = mumuCoverBaseUrlOptions.find(item => item.value === value);
    form.setFieldsValue({
      cover_api_base_url: value,
      cover_image_model: option?.defaultModel || mumuCoverBaseUrlOptions[0].defaultModel,
    });
    setCoverTestResult(null);
  };

  const handleCoverTestConnection = async () => {
    const coverApiProvider = form.getFieldValue('cover_api_provider');
    const coverApiKey = form.getFieldValue('cover_api_key');
    const coverApiBaseUrl = form.getFieldValue('cover_api_base_url');
    const coverImageModel = form.getFieldValue('cover_image_model');

    if (!coverApiProvider || !coverApiKey || !coverImageModel) {
      message.warning('Complete the cover image configuration first');
      return;
    }

    setTestingCoverApi(true);
    setCoverTestResult(null);
    try {
      const result = await settingsApi.testCoverConnection({
        cover_api_provider: coverApiProvider,
        cover_api_key: coverApiKey,
        cover_api_base_url: coverApiBaseUrl,
        cover_image_model: coverImageModel,
      });
      setCoverTestResult(result);
      if (result.success) {
        message.success('Cover image API test succeeded');
      } else {
        message.error(result.message || 'Cover image API test failed');
      }
    } catch (error) {
      console.error('封面图片接口测试失败:', error);
      setCoverTestResult({
        success: false,
        message: 'Cover image API test failed',
      });
    } finally {
      setTestingCoverApi(false);
    }
  };

  const handleFetchModels = async (silent: boolean = false) => {
    const apiKey = form.getFieldValue('api_key');
    const apiBaseUrl = form.getFieldValue('api_base_url');
    const provider = form.getFieldValue('api_provider');

    const isBuiltInKeyProvider = builtInKeyProviders.includes(provider);

    if ((!apiKey && !isBuiltInKeyProvider) || !apiBaseUrl) {
      if (!silent) {
        message.warning('Enter the API key and API URL first');
      }
      return;
    }

    setFetchingModels(true);
    try {
      const response = await settingsApi.getAvailableModels({
        api_key: isBuiltInKeyProvider ? '' : apiKey,
        api_base_url: apiBaseUrl,
        provider: provider || 'openai'
      });

      setModelOptions(response.models);
      setModelsFetched(true);
      if (!silent) {
        message.success(`Retrieved ${response.count || response.models.length} available models`);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || 'Failed to retrieve the model list';
      if (!silent) {
        message.error(errorMsg);
      }
      setModelOptions([]);
      setModelsFetched(true); // Mark as attempted even if it failed, to avoid repeated requests.
    } finally {
      setFetchingModels(false);
    }
  };

  const handleModelSelectFocus = () => {
    // 如果还没有获取过模型列表，自动获取
    if (!modelsFetched && !fetchingModels) {
      handleFetchModels(true); // Run silently without a success notification.
    }
  };

  const handleTestConnection = async () => {
    const apiKey = form.getFieldValue('api_key');
    const apiBaseUrl = form.getFieldValue('api_base_url');
    const provider = form.getFieldValue('api_provider');
    const modelName = form.getFieldValue('llm_model');
    const temperature = form.getFieldValue('temperature');
    const maxTokens = form.getFieldValue('max_tokens');

    const isBuiltInKeyProvider = builtInKeyProviders.includes(provider);

    if ((!apiKey && !isBuiltInKeyProvider) || !apiBaseUrl || !provider || !modelName) {
      message.warning('Complete the configuration first');
      return;
    }

    setTestingApi(true);
    setTestResult(null);

    try {
      const result = await settingsApi.testApiConnection({
        api_key: isBuiltInKeyProvider ? '' : apiKey,
        api_base_url: apiBaseUrl,
        provider: provider,
        llm_model: modelName,
        temperature: temperature,
        max_tokens: maxTokens
      });

      setTestResult(result);
      setShowTestResult(true);

      if (result.success) {
        message.success(`Test succeeded! Response time: ${result.response_time_ms} ms`);
      } else {
        message.error('API test failed. See the details for more information.');
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || 'Test request failed';
      message.error(errorMsg);
      setTestResult({
        success: false,
        message: 'Test request failed',
        error: errorMsg,
        error_type: 'RequestError',
        suggestions: ['Check your network connection', 'Make sure the backend service is running']
      });
      setShowTestResult(true);
    } finally {
      setTestingApi(false);
    }
  };

  // ========== 预设管理函数 ==========

  const loadPresets = async () => {
    setPresetsLoading(true);
    try {
      const response = await settingsApi.getPresets();
      setPresets(response.presets);
      setActivePresetId(response.active_preset_id);
      setChapterAnalysisPresetId(response.chapter_analysis_preset_id);
    } catch (error) {
      message.error('Failed to load presets');
      console.error(error);
    } finally {
      setPresetsLoading(false);
    }
  };

  const showPresetModal = (preset?: APIKeyPreset) => {
    // 重置预设模型列表状态
    setPresetModelOptions([]);
    setPresetModelsFetched(false);
    
    if (preset) {
      setEditingPreset(preset);
      presetForm.setFieldsValue({
        name: preset.name,
        description: preset.description,
        ...preset.config,
      });
    } else {
      setEditingPreset(null);
      presetForm.resetFields();
      presetForm.setFieldsValue({
        api_provider: 'openai',
        api_base_url: 'https://api.openai.com/v1',
        temperature: 0.7,
        max_tokens: 32000,
      });
    }
    setIsPresetModalVisible(true);
  };

  const handlePresetCancel = () => {
    setIsPresetModalVisible(false);
    setEditingPreset(null);
    presetForm.resetFields();
    // 清除预设模型列表状态
    setPresetModelOptions([]);
    setPresetModelsFetched(false);
    setPresetModelSearchText('');
  };

  // 预设编辑窗口：获取模型列表
  const handleFetchPresetModels = async (silent: boolean = false) => {
    const apiKey = presetForm.getFieldValue('api_key');
    const apiBaseUrl = presetForm.getFieldValue('api_base_url');
    const provider = presetForm.getFieldValue('api_provider');

    const isBuiltInKeyProvider = builtInKeyProviders.includes(provider);

    if ((!apiKey && !isBuiltInKeyProvider) || !apiBaseUrl) {
      if (!silent) {
        message.warning('Enter the API key and API URL first');
      }
      return;
    }

    setFetchingPresetModels(true);
    try {
      const response = await settingsApi.getAvailableModels({
        api_key: isBuiltInKeyProvider ? '' : apiKey,
        api_base_url: apiBaseUrl,
        provider: provider || 'openai'
      });

      setPresetModelOptions(response.models);
      setPresetModelsFetched(true);
      if (!silent) {
        message.success(`Retrieved ${response.count || response.models.length} available models`);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || 'Failed to retrieve the model list';
      if (!silent) {
        message.error(errorMsg);
      }
      setPresetModelOptions([]);
      setPresetModelsFetched(true);
    } finally {
      setFetchingPresetModels(false);
    }
  };

  // 预设编辑窗口：模型选择框获得焦点时自动获取
  const handlePresetModelSelectFocus = () => {
    if (!presetModelsFetched && !fetchingPresetModels) {
      handleFetchPresetModels(true);
    }
  };

  // 预设编辑窗口：提供商变更时更新默认URL并清空模型列表
  const handlePresetProviderChange = (value: string) => {
    const provider = apiProviders.find(p => p.value === value);
    if (provider) {
      const nextValues: Record<string, string> = {};
      if (provider.defaultUrl) {
        nextValues.api_base_url = provider.defaultUrl;
      }
      if (provider.value === 'anthropic') {
        nextValues.llm_model = provider.defaultModel || 'claude-sonnet-5-5';
      }
      if (provider.value === 'mumu') {
        nextValues.api_key = '';
        nextValues.llm_model = provider.defaultModel || 'gemini-3-flash-preview';
      }
      if (builtInKeyProviders.includes(provider.value)) {
        nextValues.api_key = '';
        nextValues.llm_model = provider.defaultModel || xiaomiMimoDefaultModels[0].value;
      }
      presetForm.setFieldsValue(nextValues);
    }
    // 清空模型列表，需要重新获取
    setPresetModelOptions([]);
    setPresetModelsFetched(false);
  };

  const handlePresetSave = async () => {
    try {
      const values = await presetForm.validateFields();
      const isBuiltInKeyProvider = builtInKeyProviders.includes(values.api_provider);
      const config: APIKeyPresetConfig = {
        api_provider: values.api_provider,
        api_key: isBuiltInKeyProvider ? '' : values.api_key,
        api_base_url: values.api_base_url,
        llm_model: values.llm_model,
        temperature: values.temperature,
        max_tokens: values.max_tokens,
        system_prompt: values.system_prompt,
      };

      if (editingPreset) {
        await settingsApi.updatePreset(editingPreset.id, {
          name: values.name,
          description: values.description,
          config,
        });
        message.success('Preset updated');
      } else {
        const request: PresetCreateRequest = {
          name: values.name,
          description: values.description,
          config,
        };
        await settingsApi.createPreset(request);
        message.success('Preset created');
      }

      handlePresetCancel();
      loadPresets();
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  const handleChapterAnalysisPresetChange = async (presetId?: string) => {
    setSavingChapterAnalysisPreset(true);
    try {
      const normalizedPresetId = presetId || undefined;
      await settingsApi.setChapterAnalysisPresetSelection(normalizedPresetId);
      setChapterAnalysisPresetId(normalizedPresetId);
      message.success(normalizedPresetId ? 'A dedicated API configuration is set for chapter analysis' : 'Chapter analysis now uses the default API configuration');
      loadPresets();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Failed to configure the chapter analysis API');
      console.error(error);
    } finally {
      setSavingChapterAnalysisPreset(false);
    }
  };

  const handlePresetDelete = async (presetId: string) => {
    try {
      await settingsApi.deletePreset(presetId);
      message.success('Preset deleted');
      loadPresets();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Deletion failed');
      console.error(error);
    }
  };

  const handlePresetActivate = async (presetId: string, presetName: string) => {
    try {
      // 获取预设配置用于比较
      const preset = presets.find(p => p.id === presetId);
      
      await settingsApi.activatePreset(presetId);
      message.success(`Activated preset: ${presetName}`);
      
      // 激活预设后清除当前配置Tab的测试结果
      setTestResult(null);
      setShowTestResult(false);
      
      // 清除模型列表缓存，因为API配置可能已变更
      setModelOptions([]);
      setModelsFetched(false);
      
      loadPresets();
      loadSettings(); // 重新加载当前配置
      
      // 检查是否与 MCP 缓存的配置不一致
      if (preset) {
        const verifiedConfigStr = localStorage.getItem('mcp_verified_config');
        let configChanged = false;
        
        if (verifiedConfigStr) {
          try {
            const verifiedConfig = JSON.parse(verifiedConfigStr);
            configChanged =
              verifiedConfig.provider !== preset.config.api_provider ||
              verifiedConfig.baseUrl !== preset.config.api_base_url ||
              verifiedConfig.model !== preset.config.llm_model;
          } catch (e) {
            console.error('Failed to parse verified config:', e);
            configChanged = true; // 解析失败也视为配置变化
          }
        } else {
          // 没有缓存的配置，如果有启用的插件也需要处理
          configChanged = true;
        }
        
        if (configChanged) {
          // 清除 MCP 验证缓存
          localStorage.removeItem('mcp_verified_config');
          
          // 检查并禁用所有 MCP 插件
          try {
            const plugins = await mcpPluginApi.getPlugins();
            const activePlugins = plugins.filter(p => p.enabled);
            
            if (activePlugins.length > 0) {
              // 禁用所有插件
              message.loading({ content: 'Disabling MCP plugins...', key: 'disable_mcp' });
              await Promise.all(activePlugins.map(p => mcpPluginApi.togglePlugin(p.id, false)));
              message.success({ content: 'All MCP plugins have been disabled', key: 'disable_mcp' });
              
              // 显示提示弹窗
              modal.warning({
                title: (
                  <Space>
                    <WarningOutlined style={{ color: token.colorWarning }} />
                    <span>API Configuration Changed</span>
                  </Space>
                ),
                centered: true,
                content: (
                  <div style={{ padding: '8px 0' }}>
                    <Alert
                      message={`The API configuration changed after switching to preset "${presetName}". All plugins were disabled automatically to ensure MCP plugins continue to work correctly.`}
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                    <div style={{
                      padding: 12,
                      background: token.colorInfoBg,
                      border: `1px solid ${token.colorInfoBorder}`,
                      borderRadius: 8
                    }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>Complete these steps:</Text>
                      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                        <li>Go to MCP Plugin Management.</li>
                        <li>Run the "Model Capability Check" again.</li>
                        <li>Enable plugins after confirming the new model supports function calling.</li>
                      </ol>
                    </div>
                  </div>
                ),
                okText: 'Go to MCP Plugins',
                cancelText: 'Later',
                onOk: () => {
                  eventBus.emit(EventNames.SWITCH_TO_MCP_VIEW);
                },
              });
            }
          } catch (err) {
            console.error('Failed to disable MCP plugins:', err);
          }
        }
      }
    } catch (error) {
      message.error('Failed to activate preset');
      console.error(error);
    }
  };

  const handlePresetTest = async (presetId: string) => {
    setTestingPresetId(presetId);
    try {
      const result = await settingsApi.testPreset(presetId);
      if (result.success) {
        modal.success({
          title: 'Test Successful',
          centered: true,
          width: isMobile ? '90%' : 600,
          content: (
            <div style={{ padding: '8px 0' }}>
              <div style={{ marginBottom: 24, padding: 16, background: token.colorSuccessBg, border: `1px solid ${token.colorSuccessBorder}`, borderRadius: 8 }}>
                <Typography.Text strong style={{ color: token.colorSuccess }}>
                  ✓ API connection is working
                </Typography.Text>
              </div>

              <div style={{
                padding: 16,
                background: token.colorBgLayout,
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ marginBottom: 8, fontSize: 14 }}>
                  <Text type="secondary">Provider:</Text>
                  <Text strong>{result.provider?.toUpperCase() || 'N/A'}</Text>
                </div>
                <div style={{ marginBottom: 8, fontSize: 14 }}>
                  <Text type="secondary">Model:</Text>
                  <Text strong>{result.model || 'N/A'}</Text>
                </div>
                {result.response_time_ms !== undefined && (
                  <div style={{ fontSize: 14 }}>
                    <Text type="secondary">Response time:</Text>
                    <Text strong>{result.response_time_ms}ms</Text>
                  </div>
                )}
              </div>

              <Alert
                message="Preset configuration test passed. It is ready to use."
                type="success"
                showIcon
              />
            </div>
          ),
        });
      } else {
        modal.error({
          title: 'Test Failed',
          centered: true,
          width: isMobile ? '90%' : 600,
          content: (
            <div style={{ padding: '8px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <Alert
                  message={result.message || 'API test failed'}
                  type="error"
                  showIcon
                />
              </div>

              {result.error && (
                <div style={{
                  padding: 16,
                  background: token.colorErrorBg,
                  border: `1px solid ${token.colorErrorBorder}`,
                  borderRadius: 8,
                  marginBottom: 16
                }}>
                  <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Error details:</Text>
                  <Text style={{ fontSize: 13, color: token.colorError, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {result.error}
                  </Text>
                </div>
              )}

              {result.suggestions && result.suggestions.length > 0 && (
                <div style={{
                  padding: 16,
                  background: token.colorWarningBg,
                  border: `1px solid ${token.colorWarningBorder}`,
                  borderRadius: 8,
                  marginBottom: 16
                }}>
                  <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>💡 Suggestions:</Text>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                    {result.suggestions.map((s, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Alert
                message="There is a problem with the preset configuration. Check it and try again."
                type="warning"
                showIcon
              />
            </div>
          ),
        });
      }
    } catch (error) {
      message.error('Test failed');
      console.error(error);
    } finally {
      setTestingPresetId(null);
    }
  };

  const handleCreateFromCurrent = () => {
    const currentConfig = form.getFieldsValue();
    presetForm.setFieldsValue({
      name: '',
      description: '',
      ...currentConfig,
    });
    setEditingPreset(null);
    setIsPresetModalVisible(true);
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'blue';
      // case 'anthropic':
      //   return 'purple';
      case 'gemini':
        return 'green';
      case 'mumu':
        return 'magenta';
      default:
        return 'default';
    }
  };

  // ========== 渲染预设列表 ==========

  const renderPresetsList = () => (
    <Spin spinning={presetsLoading}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">Manage API configuration presets and switch between them quickly.</Text>
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCreateFromCurrent}>
              Create from Current
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showPresetModal()}>
              New Preset
            </Button>
          </Space>
        </div>

        <Card size="small" style={{ background: token.colorFillAlter, borderColor: token.colorBorderSecondary }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space direction="vertical" size={2}>
                <Text strong>Chapter Analysis API Configuration</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Choose a preset for chapter analysis. If none is selected, the default text model configuration is used.
                </Text>
              </Space>
              <Select
                allowClear
                placeholder="Default API Configuration"
                value={chapterAnalysisPresetId}
                loading={savingChapterAnalysisPreset}
                disabled={presetsLoading || savingChapterAnalysisPreset}
                style={{ minWidth: isMobile ? '100%' : 280 }}
                onChange={(value) => handleChapterAnalysisPresetChange(value)}
                options={presets.map((preset) => ({
                  value: preset.id,
                  label: `${preset.name} (${preset.config.llm_model})`,
                }))}
              />
            </Space>
            <Alert
              showIcon
              type="info"
              message={chapterAnalysisPresetId ? 'Chapter analysis will prioritize the selected preset.' : 'No chapter analysis preset is selected; the default API configuration will be used.'}
              style={{ padding: '6px 10px' }}
            />
          </Space>
        </Card>

        {presets.length === 0 ? (
          <Empty
            description="No presets available"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: '40px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => showPresetModal()}>
              Create Your First Preset
            </Button>
          </Empty>
        ) : (
          <List
            dataSource={presets}
            renderItem={(preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <List.Item
                  key={preset.id}
                  style={{
                    background: isActive ? token.colorInfoBg : 'transparent',
                    padding: '16px',
                    marginBottom: '8px',
                    border: isActive ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: '8px',
                  }}
                  actions={[
                    !isActive && (
                      <Button
                        type="link"
                        onClick={() => handlePresetActivate(preset.id, preset.name)}
                      >
                        Activate
                      </Button>
                    ),
                    <Button
                      key="test"
                      type="link"
                      icon={<ThunderboltOutlined />}
                      loading={testingPresetId === preset.id}
                      onClick={() => handlePresetTest(preset.id)}
                    >
                      Test
                    </Button>,
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => showPresetModal(preset)}
                    >
                      Edit
                    </Button>,
                    <Popconfirm
                      title="Are you sure you want to delete this preset?"
                      onConfirm={() => handlePresetDelete(preset.id)}
                      disabled={isActive}
                      okText="Confirm"
                      cancelText="Cancel"
                    >
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={isActive}
                      >
                        Delete
                      </Button>
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={
                      isActive && (
                        <CheckCircleOutlined
                          style={{ fontSize: '24px', color: token.colorSuccess }}
                        />
                      )
                    }
                    title={
                      <Space>
                        <span style={{ fontWeight: 'bold' }}>{preset.name}</span>
                        {isActive && <Tag color="success">Active</Tag>}
                        {preset.id === chapterAnalysisPresetId && <Tag color="processing">Chapter Analysis</Tag>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        {preset.description && (
                          <div style={{ color: token.colorTextSecondary }}>{preset.description}</div>
                        )}
                        <Space wrap>
                          <Tag color={getProviderColor(preset.config.api_provider)}>
                            {preset.config.api_provider.toUpperCase()}
                          </Tag>
                          <Tag>{preset.config.llm_model}</Tag>
                          <Tag>Temperature: {preset.config.temperature}</Tag>
                          <Tag>Tokens: {preset.config.max_tokens}</Tag>
                        </Space>
                        <div style={{ fontSize: '12px', color: token.colorTextTertiary }}>
                          Created: {new Date(preset.created_at).toLocaleString()}
                        </div>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Space>
    </Spin>
  );

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
              <Col xs={24} sm={12}>
                <Space direction="vertical" size={4}>
                  <Title level={isMobile ? 3 : 2} style={{ margin: 0, color: token.colorWhite, textShadow: `0 2px 4px ${token.colorBgMask}` }}>
                    AI API Settings
                  </Title>
                  <Text style={{ fontSize: isMobile ? 12 : 14, color: token.colorTextLightSolid, marginLeft: isMobile ? 40 : 48, opacity: 0.85 }}>
                    Configure AI API settings and manage API presets
                  </Text>
                </Space>
              </Col>
              <Col xs={24} sm={12}>
                {/* Reserved button area */}
              </Col>
            </Row>
          </Card>

          {/* Main content card */}
          <Card
            variant="borderless"
            style={{
              background: token.colorBgContainer,
              borderRadius: isMobile ? 12 : 16,
              boxShadow: token.boxShadowSecondary,
              flex: 1,
            }}
            styles={{
              body: {
                padding: isMobile ? '16px' : '24px'
              }
            }}
          >
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'current',
                  label: <Space size={6}><ThunderboltOutlined />Text Model Configuration</Space>,
                  children: (
                    <Space direction="vertical" size={isMobile ? 'middle' : 'large'} style={{ width: '100%' }}>

                      {/* Default configuration notice */}
                      {isDefaultSettings && (
                        <Alert
                          message="Using the defaults from the .env file"
                          description={
                            <div style={{ fontSize: isMobile ? '12px' : '14px' }}>
                              <p style={{ margin: '8px 0' }}>
                                These defaults were read from the server's <code>.env</code> file.
                              </p>
                              <p style={{ margin: '8px 0 0 0' }}>
                                Select "Save Settings" to save the configuration to the database and update the <code>.env</code> file.
                              </p>
                            </div>
                          }
                          type="info"
                          showIcon
                          style={{ marginBottom: isMobile ? 12 : 16 }}
                        />
                      )}

                      {/* Saved configuration notice */}
                      {hasSettings && !isDefaultSettings && (
                        <Alert
                          message="Using your saved personal configuration"
                          type="success"
                          showIcon
                          style={{ marginBottom: isMobile ? 12 : 16 }}
                        />
                      )}

                      {/* Form */}
                      <Spin spinning={initialLoading}>
                        <Form
                          form={form}
                          layout="vertical"
                          onFinish={handleSave}
                          autoComplete="off"
                        >
                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>API Provider</span>
                                <InfoCircleOutlined
                                  title="Choose your AI service provider"
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="api_provider"
                            rules={[{ required: true, message: 'Select an API provider' }]}
                          >
                            <Select size={isMobile ? 'middle' : 'large'} onChange={handleProviderChange}>
                              {apiProviders.map(provider => (
                                <Option key={provider.value} value={provider.value}>
                                  {provider.label}
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>

                          {selectedProvider === 'mumu' && (
                            <Alert
                              type="info"
                              showIcon
                              message="Dedicated MuMuのAPI provider"
                              description={
                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                  <Text>
                                    The dedicated URL was filled in automatically. Leave the API key blank here; register for free to get a usable key.
                                  </Text>
                                  <div>
                                    <Button
                                      type="primary"
                                      onClick={() => window.open(mumuRegisterUrl, '_blank', 'noopener,noreferrer')}
                                    >
                                      Open MuMuのAPI to register for free
                                    </Button>
                                  </div>
                                </Space>
                              }
                              style={{ marginBottom: 16 }}
                            />
                          )}

                          {selectedProvider === 'xiaomi_mimo' && (
                            <Alert
                              type="info"
                              showIcon
                              message="Built-in Xiaomi MiMo adapter"
                              description="Uses the OpenAI-compatible format and built-in service URL. The actual key is provided only through a backend environment variable and is not stored by the frontend or database."
                              style={{ marginBottom: 16 }}
                            />
                          )}

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>API Key</span>
                                <InfoCircleOutlined
                                  title="Your API key will be stored encrypted"
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="api_key"
                            rules={builtInKeyProviders.includes(selectedProvider) ? [] : [{ required: true, message: 'Enter an API key' }]}
                          >
                            <Input.Password
                              size={isMobile ? 'middle' : 'large'}
                              placeholder={builtInKeyProviders.includes(selectedProvider) ? 'Using the backend built-in key' : 'sk-...'}
                              autoComplete="new-password"
                              disabled={builtInKeyProviders.includes(selectedProvider)}
                            />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>API URL</span>
                                <InfoCircleOutlined
                                  title="Base URL for the API"
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="api_base_url"
                            rules={[
                              { required: true, message: 'Enter an API URL' },
                              { type: 'url', message: 'Enter a valid URL' }
                            ]}
                          >
                            <Input
                              size={isMobile ? 'middle' : 'large'}
                              placeholder="https://api.openai.com/v1"
                            />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>Model Name</span>
                                <InfoCircleOutlined
                                  title="Name of the AI model, e.g., gpt-4 or gpt-3.5-turbo"
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="llm_model"
                            rules={[{ required: true, message: 'Enter or select a model name' }]}
                          >
                            <Select
                              size={isMobile ? 'middle' : 'large'}
                              showSearch
                              placeholder={isMobile ? "Enter or select a model" : "Enter a model name or select Fetch"}
                              optionFilterProp="label"
                              loading={fetchingModels}
                              onFocus={handleModelSelectFocus}
                              onSearch={(value) => setModelSearchText(value)}
                              onSelect={() => setModelSearchText('')}
                              onBlur={() => setModelSearchText('')}
                              filterOption={(input, option) => {
                                // Always show manually entered options.
                                if (option?.value === input && !modelOptions.some(m => m.value === input)) return true;
                                return (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                                  (option?.description ?? '').toLowerCase().includes(input.toLowerCase());
                              }}
                              dropdownRender={(menu) => (
                                <>
                                  {menu}
                                  {fetchingModels && (
                                    <div style={{ padding: '8px 12px', color: token.colorTextSecondary, textAlign: 'center', fontSize: isMobile ? '12px' : '14px' }}>
                                      <Spin size="small" /> Fetching model list...
                                    </div>
                                  )}
                                  {!fetchingModels && modelOptions.length === 0 && modelsFetched && !modelSearchText && (
                                    <div style={{ padding: '8px 12px', color: token.colorError, textAlign: 'center', fontSize: isMobile ? '12px' : '14px' }}>
                                      Could not fetch the model list. You can enter a model name directly.
                                    </div>
                                  )}
                                  {!fetchingModels && modelOptions.length === 0 && !modelsFetched && !modelSearchText && (
                                    <div style={{ padding: '8px 12px', color: token.colorTextSecondary, textAlign: 'center', fontSize: isMobile ? '12px' : '14px' }}>
                                      Focus the field to fetch models automatically, or enter a model name directly.
                                    </div>
                                  )}
                                </>
                              )}
                              notFoundContent={
                                fetchingModels ? (
                                  <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: isMobile ? '12px' : '14px' }}>
                                    <Spin size="small" /> Loading...
                                  </div>
                                ) : null
                              }
                              suffixIcon={
                                !isMobile ? (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!fetchingModels) {
                                        setModelsFetched(false);
                                        handleFetchModels(false);
                                      }
                                    }}
                                    style={{
                                      cursor: fetchingModels ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '0 4px',
                                      height: '100%',
                                      marginRight: -8
                                    }}
                                    title="Fetch the model list again"
                                  >
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<ReloadOutlined />}
                                      loading={fetchingModels}
                                      style={{ pointerEvents: 'none' }}
                                    >
                                      Refresh
                                    </Button>
                                  </div>
                                ) : undefined
                              }
                              options={(() => {
                                const providerDefaultModels = selectedProvider === 'xiaomi_mimo' ? xiaomiMimoDefaultModels : [];
                                const combinedModels = [
                                  ...providerDefaultModels,
                                  ...modelOptions.filter(model => !providerDefaultModels.some(item => item.value === model.value)),
                                ];
                                const opts = combinedModels.map(model => ({
                                  value: model.value,
                                  label: model.label,
                                  description: model.description
                                }));
                                // Add a manual option when the entered text is not already listed.
                                if (modelSearchText && !modelOptions.some(m =>
                                  m.value.toLowerCase() === modelSearchText.toLowerCase() ||
                                  m.label.toLowerCase() === modelSearchText.toLowerCase()
                                )) {
                                  opts.unshift({
                                    value: modelSearchText,
                                    label: modelSearchText,
                                    description: 'Manually entered model name'
                                  });
                                }
                                return opts;
                              })()}
                              optionRender={(option) => (
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: isMobile ? '13px' : '14px' }}>
                                    {option.data.description === 'Manually entered model name' ? (
                                      <Space size={4}>
                                        <EditOutlined style={{ color: token.colorPrimary }} />
                                        <span>Use "{option.data.label}"</span>
                                      </Space>
                                    ) : option.data.label}
                                  </div>
                                  {option.data.description && option.data.description !== 'Manually entered model name' && (
                                    <div style={{ fontSize: isMobile ? '11px' : '12px', color: token.colorTextTertiary, marginTop: '2px' }}>
                                      {option.data.description}
                                    </div>
                                  )}
                                </div>
                              )}
                            />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>Temperature</span>
                                <InfoCircleOutlined
                                  title="Controls output randomness. Higher values are more random (0.0-2.0)."
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="temperature"
                          >
                            <Slider
                              min={0}
                              max={2}
                              step={0.1}
                              marks={{
                                0: { style: { fontSize: isMobile ? '11px' : '12px' }, label: '0.0' },
                                0.7: { style: { fontSize: isMobile ? '11px' : '12px' }, label: '0.7' },
                                1: { style: { fontSize: isMobile ? '11px' : '12px' }, label: '1.0' },
                                2: { style: { fontSize: isMobile ? '11px' : '12px' }, label: '2.0' }
                              }}
                            />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>Maximum Tokens</span>
                                <InfoCircleOutlined
                                  title="Maximum number of tokens for a single request"
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="max_tokens"
                            rules={[
                              { required: true, message: 'Enter the maximum number of tokens' },
                              { type: 'number', min: 1, message: 'Enter a number greater than 0' }
                            ]}
                          >
                            <InputNumber
                              size={isMobile ? 'middle' : 'large'}
                              style={{ width: '100%' }}
                              min={1}
                              placeholder="2000"
                            />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>Disable Model Reasoning</span>
                                <InfoCircleOutlined
                                  title="For reasoning models: when enabled, the model skips its reasoning phase and outputs the response directly, reducing latency and token usage. Services that do not support this option are unaffected."
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="disable_thinking"
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>

                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>System Prompt</span>
                                <InfoCircleOutlined
                                  title="Set a global system prompt to use with every AI request. Use it to define the AI's role, writing style, and more."
                                  style={{ color: token.colorTextSecondary, fontSize: isMobile ? '12px' : '14px' }}
                                />
                              </Space>
                            }
                            name="system_prompt"
                          >
                            <TextArea
                              rows={4}
                              placeholder="For example: You are a professional novel-writing assistant. Write vivid, nuanced prose..."
                              maxLength={10000}
                              showCount
                              style={{ fontSize: isMobile ? '13px' : '14px' }}
                            />
                          </Form.Item>

                          {/* Test result */}
                          {showTestResult && testResult && (
                            <Alert
                              message={
                                <Space>
                                  {testResult.success ? (
                                    <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: isMobile ? '16px' : '18px' }} />
                                  ) : (
                                    <CloseCircleOutlined style={{ color: token.colorError, fontSize: isMobile ? '16px' : '18px' }} />
                                  )}
                                  <span style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 500 }}>
                                    {testResult.message}
                                  </span>
                                </Space>
                              }
                              description={
                                <div style={{ marginTop: 8 }}>
                                  {testResult.success ? (
                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                      {testResult.response_time_ms && (
                                        <div style={{ fontSize: isMobile ? '12px' : '14px' }}>
                                          ⚡ Response time: <strong>{testResult.response_time_ms} ms</strong>
                                        </div>
                                      )}
                                      {testResult.response_preview && (
                                        <div style={{
                                          fontSize: isMobile ? '12px' : '13px',
                                          padding: '8px 12px',
                                          background: token.colorSuccessBg,
                                          borderRadius: '4px',
                                          border: `1px solid ${token.colorSuccessBorder}`,
                                          marginTop: '8px'
                                        }}>
                                          <div style={{ marginBottom: '4px', fontWeight: 500 }}>AI response preview:</div>
                                          <div style={{ color: token.colorTextSecondary }}>{testResult.response_preview}</div>
                                        </div>
                                      )}
                                      <div style={{ color: token.colorSuccess, fontSize: isMobile ? '12px' : '13px', marginTop: '4px' }}>
                                        ✓ API configuration is valid and ready to use
                                      </div>
                                    </Space>
                                  ) : (
                                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                      {testResult.error && (
                                        <div style={{
                                          fontSize: isMobile ? '12px' : '13px',
                                          padding: '8px 12px',
                                          background: token.colorErrorBg,
                                          borderRadius: '4px',
                                          border: `1px solid ${token.colorErrorBorder}`,
                                          color: token.colorError
                                        }}>
                                          <strong>Error details:</strong> {testResult.error}
                                        </div>
                                      )}
                                      {testResult.error_type && (
                                        <div style={{ fontSize: isMobile ? '11px' : '12px', color: token.colorTextSecondary }}>
                                          Error type: {testResult.error_type}
                                        </div>
                                      )}
                                      {testResult.suggestions && testResult.suggestions.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                          <div style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: 500, marginBottom: '4px' }}>
                                            💡 Suggested solutions:
                                          </div>
                                          <ul style={{
                                            margin: 0,
                                            paddingLeft: isMobile ? '16px' : '20px',
                                            fontSize: isMobile ? '12px' : '13px',
                                            color: token.colorTextSecondary
                                          }}>
                                            {testResult.suggestions.map((suggestion, index) => (
                                              <li key={index} style={{ marginBottom: '4px' }}>{suggestion}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </Space>
                                  )}
                                </div>
                              }
                              type={testResult.success ? 'success' : 'error'}
                              closable
                              onClose={() => setShowTestResult(false)}
                              style={{ marginBottom: isMobile ? 16 : 24 }}
                            />
                          )}

                          {/* Action buttons */}
                          <Form.Item style={{ marginBottom: 0, marginTop: isMobile ? 24 : 32 }}>
                            {isMobile ? (
                              // Mobile: stack buttons vertically.
                              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                <Button
                                  type="primary"
                                  size="large"
                                  icon={<SaveOutlined />}
                                  htmlType="submit"
                                  loading={loading}
                                  block
                                  style={{
                                    background: token.colorPrimary,
                                    border: 'none',
                                    height: '44px'
                                  }}
                                >
                                  Save Settings
                                </Button>
                                <Button
                                  size="large"
                                  icon={<ThunderboltOutlined />}
                                  onClick={handleTestConnection}
                                  loading={testingApi}
                                  block
                                  style={{
                                    borderColor: token.colorSuccess,
                                    color: token.colorSuccess,
                                    fontWeight: 500,
                                    height: '44px'
                                  }}
                                >
                                  {testingApi ? 'Testing...' : 'Test Connection'}
                                </Button>
                                <Space size="middle" style={{ width: '100%' }}>
                                  <Button
                                    size="large"
                                    icon={<ReloadOutlined />}
                                    onClick={handleReset}
                                    style={{ flex: 1, height: '44px' }}
                                  >
                                    Reset
                                  </Button>
                                  {hasSettings && (
                                    <Button
                                      danger
                                      size="large"
                                      icon={<DeleteOutlined />}
                                      onClick={handleDelete}
                                      loading={loading}
                                      style={{ flex: 1, height: '44px' }}
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </Space>
                              </Space>
                            ) : (
                              // Desktop: delete on the left; test, reset, and save on the right.
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '16px',
                                flexWrap: 'wrap'
                              }}>
                                {/* Left: delete button */}
                                {hasSettings ? (
                                  <Button
                                    danger
                                    size="large"
                                    icon={<DeleteOutlined />}
                                    onClick={handleDelete}
                                    loading={loading}
                                    style={{
                                      minWidth: '100px'
                                    }}
                                  >
                                    Delete Configuration
                                  </Button>
                                ) : (
                                  <div /> // Keep the buttons on the right aligned.
                                )}

                                {/* Right: test, reset, and save buttons */}
                                <Space size="middle">
                                  <Button
                                    size="large"
                                    icon={<ThunderboltOutlined />}
                                    onClick={handleTestConnection}
                                    loading={testingApi}
                                    style={{
                                      borderColor: token.colorSuccess,
                                      color: token.colorSuccess,
                                      fontWeight: 500,
                                      minWidth: '100px'
                                    }}
                                  >
                                    {testingApi ? 'Testing...' : 'Test'}
                                  </Button>
                                  <Button
                                    size="large"
                                    icon={<ReloadOutlined />}
                                    onClick={handleReset}
                                    style={{
                                      minWidth: '100px'
                                    }}
                                  >
                                    Reset
                                  </Button>
                                  <Button
                                    type="primary"
                                    size="large"
                                    icon={<SaveOutlined />}
                                    htmlType="submit"
                                    loading={loading}
                                    style={{
                                      background: token.colorPrimary,
                                      border: 'none',
                                      minWidth: '120px',
                                      fontWeight: 500
                                    }}
                                  >
                                    Save
                                  </Button>
                                </Space>
                              </div>
                            )}
                          </Form.Item>
                        </Form>
                      </Spin>
                    </Space>
                  ),
                },
                {
                  key: 'cover',
                  label: <Space size={6}><PictureOutlined />Image Model Configuration</Space>,
                  children: (
                    <Spin spinning={initialLoading}>
                      <Form form={form} layout="vertical" onFinish={handleSave} autoComplete="off">

                        <Form.Item label="Cover Image Generation" name="cover_enabled" style={{ marginBottom: 16 }}>
                          <Select
                            size={isMobile ? 'middle' : 'large'}
                            onChange={() => setCoverTestResult(null)}
                            options={[
                              { value: true, label: 'Enable cover image generation' },
                              { value: false, label: 'Disable cover image generation' },
                            ]}
                          />
                        </Form.Item>

                        <Form.Item label="Cover Image Provider" name="cover_api_provider" rules={[{ required: true, message: 'Select a cover image provider' }]}>
                          <Select size={isMobile ? 'middle' : 'large'} onChange={handleCoverProviderChange}>
                            {coverApiProviders.map(provider => (
                              <Option key={provider.value} value={provider.value}>{provider.label}</Option>
                            ))}
                          </Select>
                        </Form.Item>

                        {selectedCoverProvider === 'mumu' && (
                          <Alert
                            type="info"
                            showIcon
                            message="Dedicated MuMuのAPI adapter"
                            description={
                              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Text>
                                  MuMuのAPI image endpoint options are provided. The recommended model is filled in when you change the endpoint. Register on the MuMuのAPI site to get an API key.
                                </Text>
                                <div>
                                  <Button
                                    type="primary"
                                    onClick={() => window.open(mumuRegisterUrl, '_blank', 'noopener,noreferrer')}
                                  >
                                    Open MuMuのAPI to register for free
                                  </Button>
                                </div>
                              </Space>
                            }
                            style={{ marginBottom: 16 }}
                          />
                        )}

                        <Form.Item label="Cover Image API Key" name="cover_api_key" rules={[{ required: true, message: 'Enter a cover image API key' }]}>
                          <Input.Password size={isMobile ? 'middle' : 'large'} placeholder={selectedCoverProvider === 'mumu' ? 'Enter your MuMuのAPI key' : 'Enter the cover image API key'} autoComplete="new-password" />
                        </Form.Item>

                        <Form.Item label="Cover Image API URL" name="cover_api_base_url" rules={[{ type: 'url', message: 'Enter a valid URL' }]}>
                          {selectedCoverProvider === 'mumu' ? (
                            <Select
                              size={isMobile ? 'middle' : 'large'}
                              onChange={handleMumuCoverBaseUrlChange}
                              options={mumuCoverBaseUrlOptions.map(option => ({
                                value: option.value,
                                label: option.label,
                              }))}
                            />
                          ) : (
                            <Input size={isMobile ? 'middle' : 'large'} placeholder={selectedCoverProvider === 'grok' ? 'https://api.x.ai/v1' : 'https://generativelanguage.googleapis.com/v1beta'} />
                          )}
                        </Form.Item>

                        <Form.Item label="Cover Image Model" name="cover_image_model" rules={[{ required: true, message: 'Enter a cover image model name' }]}>
                          <Input
                            size={isMobile ? 'middle' : 'large'}
                            placeholder={selectedCoverProvider === 'mumu'
                              ? 'The recommended model is filled in after selecting an endpoint'
                              : selectedCoverProvider === 'grok'
                                ? 'grok-2-image'
                                : 'gemini-2.0-flash-exp-image-generation'}
                          />
                        </Form.Item>

                        {coverTestResult && (
                          <Alert
                            type={coverTestResult.success ? 'success' : 'error'}
                            showIcon
                            message={coverTestResult.message}
                            description={coverTestResult.success ? `Provider: ${coverTestResult.provider || '-'} / Model: ${coverTestResult.model || '-'}` : undefined}
                            style={{ marginBottom: 16 }}
                          />
                        )}

                        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Space wrap>
                              <Button
                                icon={<ThunderboltOutlined />}
                                onClick={handleCoverTestConnection}
                                loading={testingCoverApi}
                                style={{ borderColor: token.colorSuccess, color: token.colorSuccess, fontWeight: 500 }}
                              >
                                {testingCoverApi ? 'Testing...' : 'Test Cover Image API'}
                              </Button>
                              <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
                            </Space>
                            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={loading}>Save Cover Configuration</Button>
                          </Space>
                        </Form.Item>
                      </Form>
                    </Spin>
                  ),
                },
                {
                  key: 'presets',
                  label: <Space size={6}><CopyOutlined />Configuration Presets</Space>,
                  children: renderPresetsList(),
                },
              ]}
            />
          </Card>
        </div>

        {/* Preset editor dialog */}
        <Modal
          title={editingPreset ? 'Edit Preset' : 'Create Preset'}
          open={isPresetModalVisible}
          onOk={handlePresetSave}
          onCancel={handlePresetCancel}
          width={isMobile ? '95%' : 640}
          centered
          okText="Save"
          cancelText="Cancel"
          styles={{
            body: {
              padding: isMobile ? '16px' : '20px 24px'
            }
          }}
        >
          <Form
            form={presetForm}
            layout="vertical"
            size={isMobile ? 'middle' : 'large'}
          >
            {/* Basic information */}
            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <Form.Item
                  name="name"
                  label="Preset Name"
                  rules={[
                    { required: true, message: 'Enter a preset name' },
                    { max: 50, message: 'The name cannot exceed 50 characters' },
                  ]}
                  style={{ marginBottom: 16 }}
                >
                  <Input placeholder="e.g., Work Account - GPT-4" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name="api_provider"
                  label="API Provider"
                  rules={[{ required: true, message: 'Select a provider' }]}
                  style={{ marginBottom: 16 }}
                >
                  <Select placeholder="Select a provider" onChange={handlePresetProviderChange}>
                    <Select.Option value="mumu">MuMuのAPI</Select.Option>
                    <Select.Option value="xiaomi_mimo">Xiaomi MiMo (Built-in)</Select.Option>
                    <Select.Option value="openai">OpenAI</Select.Option>
                    <Select.Option value="gemini">Google Gemini</Select.Option>
                  </Select>
                </Form.Item>

                {selectedPresetProvider === 'mumu' && (
                  <Alert
                    type="info"
                    showIcon
                    message="Dedicated MuMuのAPI provider"
                    description={
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Text>
                          The dedicated URL was filled in automatically. Leave the API key blank here; register for free to get a usable key.
                        </Text>
                        <div>
                          <Button
                            type="primary"
                            onClick={() => window.open(mumuRegisterUrl, '_blank', 'noopener,noreferrer')}
                          >
                            Open MuMuのAPI to register for free
                          </Button>
                        </div>
                      </Space>
                    }
                    style={{ marginBottom: 16 }}
                  />
                )}

                {selectedPresetProvider === 'xiaomi_mimo' && (
                  <Alert
                    type="info"
                    showIcon
                    message="Built-in Xiaomi MiMo adapter"
                    description="Uses the backend's built-in key and OpenAI-compatible URL. The actual key is not saved in the preset."
                    style={{ marginBottom: 16 }}
                  />
                )}
              </Col>
            </Row>

            <Form.Item
              name="description"
              label="Preset Description"
              rules={[{ max: 200, message: 'The description cannot exceed 200 characters' }]}
              style={{ marginBottom: 16 }}
            >
              <Input placeholder="e.g., For everyday writing tasks (optional)" />
            </Form.Item>

            {/* API configuration */}
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="api_key"
                  label="API Key"
                  rules={builtInKeyProviders.includes(selectedPresetProvider) ? [] : [{ required: true, message: 'Enter an API key' }]}
                  style={{ marginBottom: 16 }}
                >
                  <Input.Password
                    placeholder={builtInKeyProviders.includes(selectedPresetProvider) ? 'Using the backend built-in key (not exposed)' : 'sk-...'}
                    disabled={builtInKeyProviders.includes(selectedPresetProvider)}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="api_base_url"
                  label="API Base URL"
                  style={{ marginBottom: 16 }}
                >
                  <Input placeholder="https://api.openai.com/v1" />
                </Form.Item>
              </Col>
            </Row>

            {/* Model configuration */}
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="llm_model"
                  label={
                    <Space size={4}>
                      <span>Model Name</span>
                      <InfoCircleOutlined
                        title="AI model name. Open the dropdown to fetch available models."
                        style={{ color: token.colorTextSecondary, fontSize: '12px' }}
                      />
                    </Space>
                  }
                  rules={[{ required: true, message: 'Select or enter a model name' }]}
                  style={{ marginBottom: 16 }}
                >
                  <Select
                    showSearch
                    placeholder="Enter a model name or select Fetch"
                    optionFilterProp="label"
                    loading={fetchingPresetModels}
                    onFocus={handlePresetModelSelectFocus}
                    onSearch={(value) => setPresetModelSearchText(value)}
                    onSelect={() => setPresetModelSearchText('')}
                    onBlur={() => setPresetModelSearchText('')}
                    filterOption={(input, option) => {
                      // 手动输入的选项始终显示
                      if (option?.value === input && !presetModelOptions.some(m => m.value === input)) return true;
                      return (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                        (option?.description ?? '').toLowerCase().includes(input.toLowerCase());
                    }}
                    dropdownRender={(menu) => (
                      <>
                        {menu}
                        {fetchingPresetModels && (
                          <div style={{ padding: '8px 12px', color: token.colorTextSecondary, textAlign: 'center', fontSize: '12px' }}>
                            <Spin size="small" /> Fetching model list...
                          </div>
                        )}
                        {!fetchingPresetModels && presetModelOptions.length === 0 && presetModelsFetched && !presetModelSearchText && (
                          <div style={{ padding: '8px 12px', color: token.colorError, textAlign: 'center', fontSize: '12px' }}>
                            Could not fetch the model list. You can enter a model name directly.
                          </div>
                        )}
                        {!fetchingPresetModels && presetModelOptions.length === 0 && !presetModelsFetched && !presetModelSearchText && (
                          <div style={{ padding: '8px 12px', color: token.colorTextSecondary, textAlign: 'center', fontSize: '12px' }}>
                            Focus the field to fetch models automatically, or enter a model name directly.
                          </div>
                        )}
                      </>
                    )}
                    notFoundContent={
                      fetchingPresetModels ? (
                        <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: '12px' }}>
                          <Spin size="small" /> Loading...
                        </div>
                      ) : null
                    }
                    suffixIcon={
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!fetchingPresetModels) {
                            setPresetModelsFetched(false);
                            handleFetchPresetModels(false);
                          }
                        }}
                        style={{
                          cursor: fetchingPresetModels ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 4px',
                          height: '100%',
                          marginRight: -8
                        }}
                        title="Fetch model list"
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={fetchingPresetModels}
                          style={{ pointerEvents: 'none' }}
                        >
                          Fetch
                        </Button>
                      </div>
                    }
                    options={(() => {
                      const providerDefaultModels = selectedPresetProvider === 'xiaomi_mimo' ? xiaomiMimoDefaultModels : [];
                      const combinedModels = [
                        ...providerDefaultModels,
                        ...presetModelOptions.filter(model => !providerDefaultModels.some(item => item.value === model.value)),
                      ];
                      const opts = combinedModels.map(model => ({
                        value: model.value,
                        label: model.label,
                        description: model.description
                      }));
                      // Add a manual option when the entered text is not already listed.
                      if (presetModelSearchText && !presetModelOptions.some(m =>
                        m.value.toLowerCase() === presetModelSearchText.toLowerCase() ||
                        m.label.toLowerCase() === presetModelSearchText.toLowerCase()
                      )) {
                        opts.unshift({
                          value: presetModelSearchText,
                          label: presetModelSearchText,
                          description: 'Manually entered model name'
                        });
                      }
                      return opts;
                    })()}
                    optionRender={(option) => (
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>
                          {option.data.description === 'Manually entered model name' ? (
                            <Space size={4}>
                              <EditOutlined style={{ color: token.colorPrimary }} />
                              <span>Use "{option.data.label}"</span>
                            </Space>
                          ) : option.data.label}
                        </div>
                        {option.data.description && option.data.description !== 'Manually entered model name' && (
                          <div style={{ fontSize: '11px', color: token.colorTextTertiary, marginTop: '2px' }}>
                            {option.data.description}
                          </div>
                        )}
                      </div>
                    )}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item
                  name="temperature"
                  label="Temperature"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 16 }}
                >
                  <InputNumber
                    min={0}
                    max={2}
                    step={0.1}
                    style={{ width: '100%' }}
                    placeholder="0.7"
                  />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item
                  name="max_tokens"
                  label="Maximum Tokens"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ marginBottom: 16 }}
                >
                  <InputNumber
                    min={1}
                    max={100000}
                    style={{ width: '100%' }}
                    placeholder="32000"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="system_prompt"
              label="System Prompt"
              style={{ marginBottom: 0 }}
            >
              <TextArea
                rows={isMobile ? 2 : 3}
                placeholder="For example: You are a professional novel-writing assistant... (optional)"
                maxLength={10000}
                showCount
              />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </>
  );
}
