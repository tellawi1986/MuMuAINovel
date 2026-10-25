import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { List, Button, Modal, Form, Input, Select, message, Empty, Space, Badge, Tag, Card, InputNumber, Alert, Radio, Descriptions, Collapse, Popconfirm, Pagination, theme } from 'antd';
import { EditOutlined, FileTextOutlined, ThunderboltOutlined, LockOutlined, DownloadOutlined, SettingOutlined, FundOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, RocketOutlined, StopOutlined, InfoCircleOutlined, CaretRightOutlined, DeleteOutlined, BookOutlined, FormOutlined, PlusOutlined, ReadOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { eventBus, EventNames } from '../store/eventBus';
import { useChapterSync } from '../store/hooks';
import { generateChapterBackground } from '../services/backgroundTaskService';
import { projectApi, writingStyleApi, chapterApi } from '../services/api';
import type { Chapter, ChapterUpdate, ApiError, WritingStyle, AnalysisTask, ExpansionPlanData } from '../types';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import ChapterAnalysis from '../components/ChapterAnalysis';
import ExpansionPlanEditor from '../components/ExpansionPlanEditor';
import { SSELoadingOverlay } from '../components/SSELoadingOverlay';
import ChapterReader from '../components/ChapterReader';
import PartialRegenerateToolbar from '../components/PartialRegenerateToolbar';
import PartialRegenerateModal from '../components/PartialRegenerateModal';

const { TextArea } = Input;

// localStorage 缓存键名
const WORD_COUNT_CACHE_KEY = 'chapter_default_word_count';
const DEFAULT_WORD_COUNT = 3000;

// 从 localStorage 读取缓存的字数
const getCachedWordCount = (): number => {
  try {
    const cached = localStorage.getItem(WORD_COUNT_CACHE_KEY);
    if (cached) {
      const value = parseInt(cached, 10);
      if (!isNaN(value) && value >= 500 && value <= 10000) {
        return value;
      }
    }
  } catch (error) {
    console.warn('读取字数缓存失败:', error);
  }
  return DEFAULT_WORD_COUNT;
};

// 保存字数到 localStorage
const setCachedWordCount = (value: number): void => {
  try {
    localStorage.setItem(WORD_COUNT_CACHE_KEY, String(value));
  } catch (error) {
    console.warn('保存字数缓存失败:', error);
  }
};

export default function Chapters() {
  const { currentProject, chapters, outlines, setCurrentChapter, setCurrentProject } = useStore();
  const [modal, contextHolder] = Modal.useModal();
  const { token } = theme.useToken();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [editorForm] = Form.useForm();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const contentTextAreaRef = useRef<TextAreaRef>(null);
  const [writingStyles, setWritingStyles] = useState<WritingStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<number | undefined>();
  const [targetWordCount, setTargetWordCount] = useState<number>(getCachedWordCount);
  const [availableModels, setAvailableModels] = useState<Array<{ value: string, label: string }>>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [batchSelectedModel, setBatchSelectedModel] = useState<string | undefined>(); // 批量生成的模型选择
  const [batchSelectedSkillKey, setBatchSelectedSkillKey] = useState<string | undefined>(); // 批量生成的Skill选择
  const [temporaryNarrativePerspective, setTemporaryNarrativePerspective] = useState<string | undefined>(); // 临时人称选择
  const [availableSkills, setAvailableSkills] = useState<Array<{ template_key: string; template_name: string; description: string; category: string }>>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | undefined>();
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisChapterId, setAnalysisChapterId] = useState<string | null>(null);
  // 分析任务状态管理
  const [analysisTasksMap, setAnalysisTasksMap] = useState<Record<string, AnalysisTask>>({});
  const analysisPollingIntervalRef = useRef<number | null>(null);
  const activeAnalysisPollingIdsRef = useRef<Set<string>>(new Set());
  const analysisPollingInFlightRef = useRef(false);
  const analysisPollingRequestIdRef = useRef(0);
  const currentProjectIdRef = useRef<string | undefined>(currentProject?.id);
  currentProjectIdRef.current = currentProject?.id;
  const editingIdRef = useRef<string | null>(editingId);
  editingIdRef.current = editingId;

  // 列表查询与分页状态
  const [chapterSearchKeyword, setChapterSearchKeyword] = useState('');
  const [chapterPage, setChapterPage] = useState(1);
  const [chapterPageSize, setChapterPageSize] = useState(20);

  // 阅读器状态
  const [readerVisible, setReaderVisible] = useState(false);
  const [readingChapter, setReadingChapter] = useState<Chapter | null>(null);

  // 规划编辑状态
  const [planEditorVisible, setPlanEditorVisible] = useState(false);
  const [editingPlanChapter, setEditingPlanChapter] = useState<Chapter | null>(null);

  // 局部重写状态
  const [partialRegenerateToolbarVisible, setPartialRegenerateToolbarVisible] = useState(false);
  const [partialRegenerateToolbarPosition, setPartialRegenerateToolbarPosition] = useState({ top: 0, left: 0 });
  const [selectedTextForRegenerate, setSelectedTextForRegenerate] = useState('');
  const [selectionStartPosition, setSelectionStartPosition] = useState(0);
  const [selectionEndPosition, setSelectionEndPosition] = useState(0);
  const [partialRegenerateModalVisible, setPartialRegenerateModalVisible] = useState(false);

  // 单章节生成进度状态
  const [singleChapterProgress, setSingleChapterProgress] = useState(0);
  const [singleChapterProgressMessage, setSingleChapterProgressMessage] = useState('');


  // 批量生成相关状态
  const [batchGenerateVisible, setBatchGenerateVisible] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchAnalyzingUnanalyzed, setBatchAnalyzingUnanalyzed] = useState(false);
  const [batchTaskId, setBatchTaskId] = useState<string | null>(null);
  const [batchForm] = Form.useForm();
  const [manualCreateForm] = Form.useForm();
  const [batchProgress, setBatchProgress] = useState<{
    status: string;
    total: number;
    completed: number;
    current_chapter_number: number | null;
    estimated_time_minutes?: number;
  } | null>(null);
  const batchPollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 读取 textarea 原生选区。textarea 的选区不会出现在 window.getSelection() 中，
  // 且失焦后 selectionStart/selectionEnd 仍然保留，因此可以稳定支持拖拽出编辑框和点击外部。
  const getTextAreaSelection = useCallback(() => {
    if (!isEditorOpen || isGenerating) return null;

    const textArea = contentTextAreaRef.current?.resizableTextArea?.textArea;
    if (!textArea) return null;

    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    if (end <= start) return null;

    const selectedText = textArea.value.substring(start, end);
    if (selectedText.trim().length < 10) return null;

    return { textArea, start, end, selectedText };
  }, [isEditorOpen, isGenerating]);

  // 处理文本选中 - 检测选中文本并显示浮动工具栏
  const handleTextSelection = useCallback(() => {
    const currentSelection = getTextAreaSelection();
    if (!currentSelection) {
      setPartialRegenerateToolbarVisible(false);
      return;
    }

    const { textArea, start, end, selectedText: selectedInTextArea } = currentSelection;
    const textContent = textArea.value;

    // 计算浮动工具栏位置
    const rect = textArea.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textArea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

    // 计算选中文本起始位置所在的行号
    const textBeforeSelection = textContent.substring(0, start);
    const startLine = textBeforeSelection.split('\n').length - 1;

    // 计算选中文本在 textarea 中的视觉位置，并考虑内部滚动偏移
    const scrollTop = textArea.scrollTop;
    const visualTop = (startLine * lineHeight) + paddingTop - scrollTop;
    const toolbarTop = rect.top + visualTop - 45;
    const toolbarLeft = rect.right - 180;

    setSelectedTextForRegenerate(selectedInTextArea);
    setSelectionStartPosition(start);
    setSelectionEndPosition(end);

    // 如果选中位置不在可视区域内，固定在 textarea 边缘
    let finalTop = toolbarTop;
    if (visualTop < 0) {
      finalTop = rect.top + 10;
    } else if (visualTop > textArea.clientHeight) {
      finalTop = rect.bottom - 50;
    }

    setPartialRegenerateToolbarPosition({
      top: Math.max(rect.top + 10, Math.min(finalTop, rect.bottom - 50)),
      left: Math.min(Math.max(rect.left + 20, toolbarLeft), window.innerWidth - 200),
    });
    setPartialRegenerateToolbarVisible(true);
  }, [getTextAreaSelection]);
  // 更新工具栏位置的函数（不检测选中，只更新位置）
  const updateToolbarPosition = useCallback(() => {
    if (!partialRegenerateToolbarVisible || !selectedTextForRegenerate) return;
    
    const textArea = contentTextAreaRef.current?.resizableTextArea?.textArea;
    if (!textArea) return;
    
    const rect = textArea.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textArea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    
    const textContent = textArea.value;
    const textBeforeSelection = textContent.substring(0, selectionStartPosition);
    const startLine = textBeforeSelection.split('\n').length - 1;
    
    const scrollTop = textArea.scrollTop;
    const visualTop = (startLine * lineHeight) + paddingTop - scrollTop;
    
    const toolbarTop = rect.top + visualTop - 45;
    // 固定在 textarea 右上角，不随选中位置变化
    const toolbarLeft = rect.right - 180;
    
    // 工具栏固定在 textarea 可视区域内，即使选中文本滚出视野也保持显示
    // 如果选中位置在可视区域内，跟随选中位置
    // 如果滚出视野，固定在顶部或底部边缘
    let finalTop = toolbarTop;
    if (visualTop < 0) {
      // 选中位置在上方视野外，工具栏固定在顶部
      finalTop = rect.top + 10;
    } else if (visualTop > textArea.clientHeight) {
      // 选中位置在下方视野外，工具栏固定在底部
      finalTop = rect.bottom - 50;
    }
    
    setPartialRegenerateToolbarPosition({
      top: Math.max(rect.top + 10, Math.min(finalTop, rect.bottom - 50)),
      left: Math.min(Math.max(rect.left + 20, toolbarLeft), window.innerWidth - 200),
    });
  }, [partialRegenerateToolbarVisible, selectedTextForRegenerate, selectionStartPosition]);

  // 监听选中事件
  useEffect(() => {
    if (!isEditorOpen) return;

    const textArea = contentTextAreaRef.current?.resizableTextArea?.textArea;
    if (!textArea) return;

    const handleMouseUp = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-partial-regenerate-toolbar]')) return;

      // 在 document 级别监听，拖拽出 textarea 后松开鼠标也能捕获选区。
      window.setTimeout(handleTextSelection, 0);
    };

    const handleKeyUp = () => {
      // 键盘扩选、收缩选区以及清除选区都通过统一逻辑处理。
      window.setTimeout(handleTextSelection, 0);
    };

    const handleSelect = () => {
      // 原生 textarea 的 select 事件比 window.selection 更可靠。
      handleTextSelection();
    };
    const handleScroll = () => {
      // 滚动时更新位置（使用 requestAnimationFrame 优化性能）
      requestAnimationFrame(updateToolbarPosition);
    };

    // 监听 textarea 滚动
    document.addEventListener('mouseup', handleMouseUp, true);
    textArea.addEventListener('keyup', handleKeyUp);
    textArea.addEventListener('select', handleSelect);
    textArea.addEventListener('scroll', handleScroll);

    // 同时监听 Modal body 滚动（Modal 内容可能在外层容器滚动）
    const modalBody = textArea.closest('.ant-modal-body');
    if (modalBody) {
      modalBody.addEventListener('scroll', handleScroll);
    }

    // 监听窗口大小变化
    window.addEventListener('resize', handleScroll);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp, true);
      textArea.removeEventListener('keyup', handleKeyUp);
      textArea.removeEventListener('select', handleSelect);
      textArea.removeEventListener('scroll', handleScroll);
      if (modalBody) {
        modalBody.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('resize', handleScroll);
    };
  }, [isEditorOpen, handleTextSelection, updateToolbarPosition]);



  const {
    refreshChapters,
    updateChapter,
    deleteChapter,
    generateChapterContentStream
  } = useChapterSync();

  useEffect(() => {
    if (currentProject?.id) {
      const projectId = currentProject.id;
      if (analysisPollingIntervalRef.current !== null) {
        clearInterval(analysisPollingIntervalRef.current);
        analysisPollingIntervalRef.current = null;
      }
      analysisPollingRequestIdRef.current += 1;
      analysisPollingInFlightRef.current = false;
      activeAnalysisPollingIdsRef.current.clear();
      setAnalysisTasksMap({});

      void refreshChapters(projectId).then((latestChapters) => {
        if (currentProjectIdRef.current === projectId) {
          void loadAnalysisTasks(latestChapters, projectId);
        }
      });
      loadWritingStyles();
      checkAndRestoreBatchTask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (analysisPollingIntervalRef.current !== null) {
        clearInterval(analysisPollingIntervalRef.current);
        analysisPollingIntervalRef.current = null;
      }
      if (batchPollingIntervalRef.current !== null) {
        clearInterval(batchPollingIntervalRef.current);
        batchPollingIntervalRef.current = null;
      }
    };
  }, []);

  const clearAnalysisPollingIfIdle = useCallback(() => {
    if (activeAnalysisPollingIdsRef.current.size === 0 && analysisPollingIntervalRef.current) {
      clearInterval(analysisPollingIntervalRef.current);
      analysisPollingIntervalRef.current = null;
    }
  }, []);

  const pollActiveAnalysisTasks = useCallback(async () => {
    const projectId = currentProjectIdRef.current;
    if (!projectId || analysisPollingInFlightRef.current) return;

    const activeIds = Array.from(activeAnalysisPollingIdsRef.current);
    if (activeIds.length === 0) {
      clearAnalysisPollingIfIdle();
      return;
    }

    analysisPollingInFlightRef.current = true;
    const requestId = analysisPollingRequestIdRef.current + 1;
    analysisPollingRequestIdRef.current = requestId;

    try {
      const response = await chapterApi.getBatchAnalysisStatuses(projectId, activeIds);
      if (currentProjectIdRef.current !== projectId) return;

      const tasksMap = response.items || {};

      setAnalysisTasksMap(prev => ({
        ...prev,
        ...tasksMap,
      }));

      activeIds.forEach((chapterId) => {
        const task = tasksMap[chapterId];
        if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'none') {
          activeAnalysisPollingIdsRef.current.delete(chapterId);

          if (task?.status === 'completed') {
            message.success('Chapter analysis complete');
          } else if (task?.status === 'failed') {
            message.error(`Chapter analysis failed: ${task.error_message || 'Unknown error'}`);
          }
        }
      });

      clearAnalysisPollingIfIdle();
    } catch (error) {
      console.error('批量轮询分析任务失败:', error);
    } finally {
      if (analysisPollingRequestIdRef.current === requestId) {
        analysisPollingInFlightRef.current = false;
      }
    }
  }, [clearAnalysisPollingIfIdle]);

  const ensureAnalysisPolling = useCallback(() => {
    if (analysisPollingIntervalRef.current) return;

    analysisPollingIntervalRef.current = window.setInterval(() => {
      void pollActiveAnalysisTasks();
    }, 2000);

    // 立即执行一次
    void pollActiveAnalysisTasks();
  }, [pollActiveAnalysisTasks]);

  // 加载所有章节的分析任务状态（批量接口，避免逐章请求风暴）
  // 接受可选的 chaptersToLoad 参数，解决 React 状态更新延迟导致的问题
  const loadAnalysisTasks = useCallback(async (
    chaptersToLoad?: typeof chapters,
    projectId?: string,
  ) => {
    const targetChapters = chaptersToLoad || chapters;
    const targetProjectId = projectId || currentProjectIdRef.current;
    if (!targetChapters || targetChapters.length === 0 || !targetProjectId) return;

    const chapterIds = targetChapters
      .filter(chapter => chapter.content && chapter.content.trim() !== '')
      .map(chapter => chapter.id);

    if (chapterIds.length === 0) {
      setAnalysisTasksMap({});
      activeAnalysisPollingIdsRef.current.clear();
      clearAnalysisPollingIfIdle();
      return;
    }

    try {
      const response = await chapterApi.getBatchAnalysisStatuses(targetProjectId, chapterIds);
      if (currentProjectIdRef.current !== targetProjectId) return;

      const tasksMap = response.items || {};
      setAnalysisTasksMap(tasksMap);

      activeAnalysisPollingIdsRef.current.clear();
      Object.entries(tasksMap).forEach(([chapterId, task]) => {
        if (task?.status === 'pending' || task?.status === 'running') {
          activeAnalysisPollingIdsRef.current.add(chapterId);
        }
      });

      if (activeAnalysisPollingIdsRef.current.size > 0) {
        ensureAnalysisPolling();
      } else {
        clearAnalysisPollingIfIdle();
      }
    } catch (error) {
      console.error('批量加载分析任务状态失败:', error);
    }
  }, [chapters, clearAnalysisPollingIfIdle, ensureAnalysisPolling]);

  useEffect(() => {
    const handleTaskSettled = (payload?: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { projectId?: string; resources?: string[] };
      if (data.projectId && data.projectId !== currentProjectIdRef.current) return;
      if (!data.resources?.includes('analysis')) return;
      void refreshChapters().then(latestChapters => loadAnalysisTasks(latestChapters));
    };
    eventBus.on(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
    return () => eventBus.off(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
  }, [loadAnalysisTasks, refreshChapters]);

  // 启动单个章节的任务轮询（内部合并到批量轮询）
  const startPollingTask = (chapterId: string) => {
    activeAnalysisPollingIdsRef.current.add(chapterId);
    ensureAnalysisPolling();
  };

  const loadWritingStyles = async () => {
    if (!currentProject?.id) return;

    try {
      const response = await writingStyleApi.getProjectStyles(currentProject.id);
      setWritingStyles(response.styles);

      // 设置默认风格为初始选中
      const defaultStyle = response.styles.find(s => s.is_default);
      if (defaultStyle) {
        setSelectedStyleId(defaultStyle.id);
      }
    } catch (error) {
      console.error('加载写作风格失败:', error);
      message.error('Failed to load writing styles');
    }
  };

  // 加载可用的 Skill 列表
  const loadAvailableSkills = async () => {
    try {
      const response = await fetch('/api/skills/list');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setAvailableSkills(data);
        }
      }
    } catch (error) {
      console.error('加载 Skill 列表失败:', error);
    }
  };

  const loadAvailableModels = async () => {
    try {
      // 从设置API获取用户配置的模型列表
      const settingsResponse = await fetch('/api/settings');
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json();
        const { api_key, api_base_url, api_provider } = settings;

        if (api_base_url) {
          try {
            const modelsResponse = await fetch(
              `/api/settings/models?api_key=${encodeURIComponent(api_key || '')}&api_base_url=${encodeURIComponent(api_base_url)}&provider=${api_provider}`
            );
            if (modelsResponse.ok) {
              const data = await modelsResponse.json();
              if (data.models && data.models.length > 0) {
                setAvailableModels(data.models);
                // 设置默认模型为当前配置的模型
                setSelectedModel(settings.llm_model);
                return settings.llm_model; // 返回模型名称
              }
            }
          } catch {
            console.log('获取模型列表失败，将使用默认模型');
          }
        }
      }
    } catch (error) {
      console.error('加载可用模型失败:', error);
    }
    return null;
  };

  // 检查并恢复批量生成任务
  const checkAndRestoreBatchTask = async () => {
    if (!currentProject?.id) return;

    try {
      const response = await fetch(`/api/chapters/project/${currentProject.id}/batch-generate/active`);
      if (!response.ok) return;

      const data = await response.json();

      if (data.has_active_task && data.task) {
        const task = data.task;

        // 恢复任务状态（只在顶部进度条显示，不弹出Modal）
        setBatchTaskId(task.batch_id);
        setBatchProgress({
          status: task.status,
          total: task.total,
          completed: task.completed,
          current_chapter_number: task.current_chapter_number,
        });
        setBatchGenerating(true);
        // 不设置 setBatchGenerateVisible(true)，避免弹出Modal遮挡页面

        // 启动轮询
        startBatchPolling(task.batch_id);

        message.info('An unfinished batch generation task was found. Check the task list.');
      }
    } catch (error) {
      console.error('检查批量生成任务失败:', error);
    }
  };

  // 🔔 显示浏览器通知
  const showBrowserNotification = (title: string, body: string, type: 'success' | 'error' | 'info' = 'info') => {
    // 检查浏览器是否支持通知
    if (!('Notification' in window)) {
      console.log('浏览器不支持通知功能');
      return;
    }

    // 检查通知权限
    if (Notification.permission === 'granted') {
      // 选择图标
      const icon = type === 'success' ? '/logo.svg' : type === 'error' ? '/favicon.ico' : '/logo.svg';
      
      const notification = new Notification(title, {
        body,
        icon,
        badge: '/favicon.ico',
        tag: 'batch-generation', // 相同tag会替换旧通知
        requireInteraction: false, // 自动关闭
        silent: false, // 播放提示音
      });

      // 点击通知时聚焦到窗口
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 5秒后自动关闭
      setTimeout(() => {
        notification.close();
      }, 5000);
    } else if (Notification.permission !== 'denied') {
      // 如果权限未被明确拒绝，尝试请求权限
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          showBrowserNotification(title, body, type);
        }
      });
    }
  };

  // 按章节号排序并按大纲分组章节 (必须在早返回之前调用，避免违反 Hooks 规则)
  const { sortedChapters } = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);

    const groups: Record<string, {
      outlineId: string | null;
      outlineTitle: string;
      outlineOrder: number;
      chapters: Chapter[];
    }> = {};

    sorted.forEach(chapter => {
      const key = chapter.outline_id || 'uncategorized';

      if (!groups[key]) {
        groups[key] = {
          outlineId: chapter.outline_id || null,
          outlineTitle: chapter.outline_title || 'Uncategorized Chapter',
          outlineOrder: chapter.outline_order ?? 999,
          chapters: []
        };
      }

      groups[key].chapters.push(chapter);
    });

    return { sortedChapters: sorted };
  }, [chapters]);

  // 章节查询过滤（前端过滤，减少渲染压力）
  const filteredSortedChapters = useMemo(() => {
    const keyword = chapterSearchKeyword.trim().toLowerCase();
    if (!keyword) return sortedChapters;

    return sortedChapters.filter((chapter) => {
      return (
        String(chapter.chapter_number).includes(keyword) ||
        chapter.title.toLowerCase().includes(keyword) ||
        (chapter.outline_title || '').toLowerCase().includes(keyword)
      );
    });
  }, [sortedChapters, chapterSearchKeyword]);

  // 分页后的扁平章节
  const pagedSortedChapters = useMemo(() => {
    const start = (chapterPage - 1) * chapterPageSize;
    return filteredSortedChapters.slice(start, start + chapterPageSize);
  }, [filteredSortedChapters, chapterPage, chapterPageSize]);

  // one-to-many 模式分页后再按大纲分组
  const pagedGroupedChapters = useMemo(() => {
    const groups: Record<string, {
      outlineId: string | null;
      outlineTitle: string;
      outlineOrder: number;
      chapters: Chapter[];
    }> = {};

    pagedSortedChapters.forEach(chapter => {
      const key = chapter.outline_id || 'uncategorized';
      if (!groups[key]) {
        groups[key] = {
          outlineId: chapter.outline_id || null,
          outlineTitle: chapter.outline_title || 'Uncategorized Chapter',
          outlineOrder: chapter.outline_order ?? 999,
          chapters: []
        };
      }
      groups[key].chapters.push(chapter);
    });

    return Object.values(groups).sort((a, b) => a.outlineOrder - b.outlineOrder);
  }, [pagedSortedChapters]);

  // 搜索词或分页大小变化时重置到第一页
  useEffect(() => {
    setChapterPage(1);
  }, [chapterSearchKeyword, chapterPageSize, currentProject?.outline_mode]);

  // 数据变化导致页码越界时自动纠正
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredSortedChapters.length / chapterPageSize));
    if (chapterPage > maxPage) {
      setChapterPage(maxPage);
    }
  }, [filteredSortedChapters.length, chapterPage, chapterPageSize]);

  // 预计算每章可生成状态，避免在渲染阶段重复 O(n²) 扫描
  const chapterGenerateGateMap = useMemo(() => {
    const gateMap: Record<string, { canGenerate: boolean; reason: string }> = {};
    const incompleteChapterNumbers: number[] = [];
    const unanalyzedChapters: Array<{ chapterNumber: number; reason: string }> = [];

    sortedChapters.forEach((chapter) => {
      if (incompleteChapterNumbers.length > 0) {
        gateMap[chapter.id] = {
          canGenerate: false,
          reason: `Complete the preceding chapters first: ${incompleteChapterNumbers.join(', ')}`
        };
      } else if (unanalyzedChapters.length > 0) {
        gateMap[chapter.id] = {
          canGenerate: false,
          reason: `Analyze the preceding chapters first: ${unanalyzedChapters.map(c => c.chapterNumber).join(', ')} (${unanalyzedChapters.map(c => c.reason).join(', ')})`
        };
      } else {
        gateMap[chapter.id] = { canGenerate: true, reason: '' };
      }

      // 将当前章纳入“后续章节”的前置条件
      if (!chapter.content || chapter.content.trim() === '') {
        incompleteChapterNumbers.push(chapter.chapter_number);
      }

      const task = analysisTasksMap[chapter.id];
      if (!task || !task.has_task) {
        unanalyzedChapters.push({ chapterNumber: chapter.chapter_number, reason: 'Not analyzed' });
      } else if (task.status === 'pending') {
        unanalyzedChapters.push({ chapterNumber: chapter.chapter_number, reason: 'Waiting for analysis' });
      } else if (task.status === 'running') {
        unanalyzedChapters.push({ chapterNumber: chapter.chapter_number, reason: 'Analysis in progress' });
      } else if (task.status === 'failed') {
        unanalyzedChapters.push({ chapterNumber: chapter.chapter_number, reason: 'Analysis failed' });
      } else if (task.status !== 'completed') {
        unanalyzedChapters.push({ chapterNumber: chapter.chapter_number, reason: 'Unknown status' });
      }
    });

    return gateMap;
  }, [sortedChapters, analysisTasksMap]);

  // 当前可被“一键分析”的章节（有内容且未处于完成/进行中）
  const batchAnalyzableChapterCount = useMemo(() => {
    return sortedChapters.filter((chapter) => {
      if (!chapter.content || chapter.content.trim() === '') return false;
      const task = analysisTasksMap[chapter.id];
      if (!task || !task.has_task) return true;
      return task.status !== 'completed' && task.status !== 'pending' && task.status !== 'running';
    }).length;
  }, [sortedChapters, analysisTasksMap]);

  if (!currentProject) return null;

  // 获取人称的中文显示文本（同时支持中英文值）
  const getNarrativePerspectiveText = (perspective?: string): string => {
    const texts: Record<string, string> = {
      // 英文值映射（向后兼容）
      'first_person': 'First person (I)',
      'third_person': 'Third person (he/she)',
      'omniscient': 'Omniscient',
      // 中文值映射（项目设置使用）
      '第一人称': 'First person (I)',
      '第三人称': 'Third person (he/she)',
      '全知视角': 'Omniscient',
    };
    return texts[perspective || ''] || 'Third person (default)';
  };

  const canGenerateChapter = (chapter: Chapter): boolean => {
    return chapterGenerateGateMap[chapter.id]?.canGenerate ?? true;
  };

  const getGenerateDisabledReason = (chapter: Chapter): string => {
    return chapterGenerateGateMap[chapter.id]?.reason || '';
  };

  const handleOpenModal = (id: string) => {
    const chapter = chapters.find(c => c.id === id);
    if (chapter) {
      form.setFieldsValue(chapter);
      setEditingId(id);
      setIsModalOpen(true);
    }
  };

  const handleSubmit = async (values: ChapterUpdate) => {
    if (!editingId) return;

    try {
      await updateChapter(editingId, values);

      // 刷新章节列表以获取完整的章节数据（包括outline_title等联查字段）
      await refreshChapters();

      message.success('Chapter updated successfully');
      setIsModalOpen(false);
      form.resetFields();
    } catch {
      message.error('Operation failed');
    }
  };

  const handleOpenEditor = (id: string) => {
    const chapter = chapters.find(c => c.id === id);
    if (chapter) {
      setCurrentChapter(chapter);
      editorForm.setFieldsValue({
        title: chapter.title,
        content: chapter.content,
      });
      setEditingId(id);
      setTemporaryNarrativePerspective(undefined); // 重置人称选择
      setSelectedSkillKey(undefined); // 重置Skill选择
      setIsEditorOpen(true);
      // 打开编辑窗口时加载模型列表和Skill列表
      loadAvailableModels();
      loadAvailableSkills();
    }
  };

  const handleEditorSubmit = async (values: ChapterUpdate) => {
    if (!editingId || !currentProject) return;

    try {
      await updateChapter(editingId, values);

      // 刷新项目信息以更新总字数统计
      const updatedProject = await projectApi.getProject(currentProject.id);
      setCurrentProject(updatedProject);

      message.success('Chapter saved successfully');
      setIsEditorOpen(false);
    } catch {
      message.error('Save failed');
    }
  };

  const handleGenerate = async () => {
    if (!editingId) return;

    try {
      setIsContinuing(true);
      setIsGenerating(true);
      setSingleChapterProgress(0);
      setSingleChapterProgressMessage('Preparing to generate...');

      const result = await generateChapterContentStream(
        editingId,
        (content) => {
          editorForm.setFieldsValue({ content });

          if (contentTextAreaRef.current) {
            const textArea = contentTextAreaRef.current.resizableTextArea?.textArea;
            if (textArea) {
              textArea.scrollTop = textArea.scrollHeight;
            }
          }
        },
        selectedStyleId,
        targetWordCount,
        (progressMsg, progressValue) => {
          // 进度回调
          setSingleChapterProgress(progressValue);
          setSingleChapterProgressMessage(progressMsg);
        },
        selectedModel,  // 传递选中的模型
        temporaryNarrativePerspective,  // 传递临时人称参数
        selectedSkillKey  // 传递选中的Skill
      );

      message.success('AI writing complete. Analyzing chapter content...');

      // 如果返回了分析任务ID，启动轮询
      if (result?.analysis_task_id) {
        const taskId = result.analysis_task_id;
        setAnalysisTasksMap(prev => ({
          ...prev,
          [editingId]: {
            has_task: true,
            task_id: taskId,
            chapter_id: editingId,
            status: 'pending',
            progress: 0
          }
        }));

        // 启动轮询
        startPollingTask(editingId);
      }
    } catch (error) {
      const apiError = error as ApiError;
      message.error('AI writing failed: ' + (apiError.response?.data?.detail || apiError.message || 'Unknown error'));
    } finally {
      setIsContinuing(false);
      setIsGenerating(false);
      setSingleChapterProgress(0);
      setSingleChapterProgressMessage('');
    }
  };

  const showGenerateModal = (chapter: Chapter) => {
    const previousChapters = chapters.filter(
      c => c.chapter_number < chapter.chapter_number
    ).sort((a, b) => a.chapter_number - b.chapter_number);

    const selectedStyle = writingStyles.find(s => s.id === selectedStyleId);

    const instance = modal.confirm({
      title: 'Write Chapter Content with AI',
      width: 700,
      centered: true,
      content: (
        <div style={{ marginTop: 16 }}>
          <p>AI will write this chapter based on the following information:</p>
          <ul>
            <li>Chapter outline and requirements</li>
            <li>Project worldbuilding</li>
            <li>Related character information</li>
            <li><strong>Completed preceding chapters (to maintain story continuity)</strong></li>
            {selectedStyle && (
              <li><strong>Writing style: {selectedStyle.name}</strong></li>
            )}
            <li><strong>Target word count: {targetWordCount} words</strong></li>
          </ul>

          {previousChapters.length > 0 && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: token.colorInfoBg,
              borderRadius: token.borderRadius,
              border: `1px solid ${token.colorInfoBorder}`
            }}>
              <div style={{ marginBottom: 8, fontWeight: 500, color: token.colorPrimary }}>
                📚 Preceding chapters to reference ({previousChapters.length}):
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {previousChapters.map(ch => (
                  <div key={ch.id} style={{ padding: '4px 0', fontSize: 13 }}>
                    ✓ Chapter {ch.chapter_number}: {ch.title} ({ch.word_count || 0} words)
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextSecondary }}>
                💡 AI will refer to these chapters to maintain plot continuity and consistent character states.
              </div>
            </div>
          )}

          <p style={{ color: token.colorError, marginTop: 16, marginBottom: 0 }}>
            ⚠️ Note: This will overwrite the current chapter content.
          </p>
        </div>
      ),
      okText: 'Start Writing',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        instance.update({
          okButtonProps: { danger: true, loading: true },
          cancelButtonProps: { disabled: true },
          closable: false,
          maskClosable: false,
          keyboard: false,
        });

        try {
          if (!selectedStyleId) {
            message.error('Select a writing style first');
            instance.update({
              okButtonProps: { danger: true, loading: false },
              cancelButtonProps: { disabled: false },
              closable: true,
              maskClosable: true,
              keyboard: true,
            });
            return;
          }
          await handleGenerate();
          instance.destroy();
        } catch {
          instance.update({
            okButtonProps: { danger: true, loading: false },
            cancelButtonProps: { disabled: false },
            closable: true,
            maskClosable: true,
            keyboard: true,
          });
        }
      },
      onCancel: () => {
        if (isGenerating) {
          message.warning('AI is writing. Wait for it to finish.');
          return false;
        }
      },
    });
  };


  // 后台生成章节（关闭浏览器也不影响）
  // 不再强制显示进度弹窗，任务进度在右下角悬浮任务框中显示
  const handleBackgroundGenerate = async () => {
    if (!editingId) return;
    if (!selectedStyleId) {
      message.error("Select a writing style first");
      return;
    }

    try {
      const generatedChapterId = editingId;
      const generatedProjectId = currentProject?.id;
      let analysisTrackingStarted = false;

      const refreshGeneratedChapter = async () => {
        if (!generatedProjectId || currentProjectIdRef.current !== generatedProjectId) return [];

        const latestChapters = await refreshChapters(generatedProjectId);
        const latestChapter = latestChapters.find(chapter => chapter.id === generatedChapterId);
        if (latestChapter && editingIdRef.current === generatedChapterId) {
          setCurrentChapter(latestChapter);
          editorForm.setFieldsValue({
            title: latestChapter.title,
            content: latestChapter.content,
          });
        }

        projectApi.getProject(generatedProjectId).then(setCurrentProject).catch(console.error);
        return latestChapters;
      };

      await generateChapterBackground(
        generatedChapterId,
        {
          style_id: selectedStyleId,
          target_word_count: targetWordCount,
          model: selectedModel,
          narrative_perspective: temporaryNarrativePerspective,
        },
        async (status) => {
          if (status.progress_details?.stage !== 'analyzing' || analysisTrackingStarted) return;

          analysisTrackingStarted = true;
          const latestChapters = await refreshGeneratedChapter();
          await loadAnalysisTasks(latestChapters);
        },
        async () => {
          message.success("Background chapter generation and analysis complete!");
          const latestChapters = await refreshGeneratedChapter();
          await loadAnalysisTasks(latestChapters);
        },
        async (error) => {
          message.error("Background chapter task failed: " + error);
          const latestChapters = await refreshGeneratedChapter();
          await loadAnalysisTasks(latestChapters);
        }
      );

      message.info("Chapter generation started. Track its progress in the task panel at the bottom right.");
      // 通知悬浮任务框刷新
      eventBus.emit('background-task-created');
    } catch {
      message.error("Failed to create the background task");
    }
  };
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'draft': 'default',
      'pending': 'warning',
      'writing': 'processing',
      'completed': 'success',
    };
    return colors[status] || 'default';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      'draft': 'Draft',
      'pending': 'Pending',
      'writing': 'Writing',
      'completed': 'Completed',
    };
    return texts[status] || status;
  };

  const handleExport = () => {
    if (chapters.length === 0) {
      message.warning('This project has no chapters to export');
      return;
    }

    modal.confirm({
      title: 'Export Project Chapters',
      content: `Export all chapters of "${currentProject.title}" as a TXT file?`,
      centered: true,
      okText: 'Export',
      cancelText: 'Cancel',
      onOk: () => {
        try {
          projectApi.exportProject(currentProject.id);
          message.success('Starting export file download');
        } catch {
          message.error('Export failed. Please try again.');
        }
      },
    });
  };

  const handleShowAnalysis = (chapterId: string) => {
    setAnalysisChapterId(chapterId);
    setAnalysisVisible(true);
  };

  // 一键按章节顺序分析未分析章节
  const handleBatchAnalyzeUnanalyzed = async () => {
    if (!currentProject?.id) return;

    try {
      setBatchAnalyzingUnanalyzed(true);
      const result = await chapterApi.batchAnalyzeUnanalyzed(currentProject.id);

      if (result.total_started > 0) {
        setAnalysisTasksMap((prev) => ({
          ...prev,
          ...result.started_tasks,
        }));

        Object.keys(result.started_tasks).forEach((chapterId) => {
          startPollingTask(chapterId);
        });

        message.success(
          `Queued ${result.total_started} chapters for sequential analysis (skipped ${result.total_already_completed} already analyzed and ${result.total_skipped_running} in progress or queued)`
        );
      } else {
        message.info('No chapters are available to analyze. They may be empty, already analyzed, or currently being analyzed.');
      }

      // 刷新一次状态，确保前端与后端一致
      await loadAnalysisTasks();
    } catch (error: unknown) {
      const err = error as Error;
      message.error(`Batch analysis failed: ${err.message || 'Unknown error'}`);
    } finally {
      setBatchAnalyzingUnanalyzed(false);
    }
  };

  // 批量生成函数
  const handleBatchGenerate = async (values: {
    startChapterNumber: number;
    count: number;
    enableAnalysis: boolean;
    styleId?: number;
    targetWordCount?: number;
    model?: string;
  }) => {
    if (!currentProject?.id) return;

    // 调试日志
    console.log('[批量生成] 表单values:', values);
    console.log('[批量生成] batchSelectedModel状态:', batchSelectedModel);

    // 使用批量生成对话框中选择的风格和字数，如果没有选择则使用默认值
    const styleId = values.styleId || selectedStyleId;
    const wordCount = values.targetWordCount || targetWordCount;

    // 使用批量生成专用的模型状态
    const model = batchSelectedModel;

    console.log('[批量生成] 最终使用的model:', model);

    if (!styleId) {
      message.error('Select a writing style');
      return;
    }

    try {
      setBatchGenerating(true);
      setBatchGenerateVisible(false); // 关闭配置对话框，任务进度在悬浮任务框中显示

      const requestBody: {
        start_chapter_number: number;
        count: number;
        enable_analysis: boolean;
        style_id: number;
        target_word_count: number;
        model?: string;
        skill_key?: string;
      } = {
        start_chapter_number: values.startChapterNumber,
        count: values.count,
        enable_analysis: values.enableAnalysis,
        style_id: styleId,
        target_word_count: wordCount,
      };

      // 如果有模型参数，添加到请求体中
      if (model) {
        requestBody.model = model;
        console.log('[批量生成] 请求体包含model:', model);
      } else {
        console.log('[批量生成] 请求体不包含model，使用后端默认模型');
      }

      // 如果有 Skill 参数，添加到请求体中
      if (batchSelectedSkillKey) {
        requestBody.skill_key = batchSelectedSkillKey;
        console.log('[批量生成] 请求体包含skill_key:', batchSelectedSkillKey);
      }

      console.log('[批量生成] 完整请求体:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`/api/chapters/project/${currentProject.id}/batch-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create the batch generation task');
      }

      const result = await response.json();
      setBatchTaskId(result.batch_id);
      setBatchProgress({
        status: 'running',
        total: result.chapters_to_generate.length,
        completed: 0,
        current_chapter_number: values.startChapterNumber,
        estimated_time_minutes: result.estimated_time_minutes,
      });

      message.success(`Batch generation task created. Estimated time: ${result.estimated_time_minutes} minutes. Track progress in the task panel at the bottom right.`);
      // 通知悬浮任务框刷新
      eventBus.emit('background-task-created');

      // 🔔 触发浏览器通知（任务开始）
      showBrowserNotification(
        'Batch generation started',
        `Generating ${result.chapters_to_generate.length} chapters. Estimated time: ${result.estimated_time_minutes} minutes.`,
        'info'
      );

      // 开始轮询任务状态
      startBatchPolling(result.batch_id);

    } catch (error: unknown) {
      const err = error as Error;
      message.error('Failed to create the batch generation task: ' + (err.message || 'Unknown error'));
      setBatchGenerating(false);
      setBatchGenerateVisible(false);
    }
  };

  // 轮询批量生成任务状态
  const startBatchPolling = (taskId: string) => {
    if (batchPollingIntervalRef.current) {
      clearInterval(batchPollingIntervalRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`/api/chapters/batch-generate/${taskId}/status`);
        if (!response.ok) return;

        const status = await response.json();
        setBatchProgress({
          status: status.status,
          total: status.total,
          completed: status.completed,
          current_chapter_number: status.current_chapter_number,
        });

        // 每次轮询时刷新章节列表和分析状态，实时显示新生成的章节和分析进度
        // 使用 await 确保获取最新章节列表后再加载分析任务状态
        if (status.completed > 0) {
          const latestChapters = await refreshChapters();
          await loadAnalysisTasks(latestChapters);

          // 刷新项目信息以实时更新总字数统计
          if (currentProject?.id) {
            const updatedProject = await projectApi.getProject(currentProject.id);
            setCurrentProject(updatedProject);
          }
        }

        // 任务完成或失败，停止轮询
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          if (batchPollingIntervalRef.current) {
            clearInterval(batchPollingIntervalRef.current);
            batchPollingIntervalRef.current = null;
          }

          setBatchGenerating(false);

          // 立即刷新章节列表和分析任务状态（在显示消息前）
          // 使用 refreshChapters 返回的最新章节列表传递给 loadAnalysisTasks
          const finalChapters = await refreshChapters();
          await loadAnalysisTasks(finalChapters);

          // 刷新项目信息以更新总字数统计
          if (currentProject?.id) {
            const updatedProject = await projectApi.getProject(currentProject.id);
            setCurrentProject(updatedProject);
          }

          if (status.status === 'completed') {
            message.success(`Batch generation complete! ${status.completed} chapters generated successfully.`);
            // 🔔 触发浏览器通知
            showBrowserNotification(
              'Batch Generation Complete',
              `"${currentProject?.title || 'Project'}": ${status.completed} chapters generated successfully`,
              'success'
            );
          } else if (status.status === 'failed') {
            message.error(`Batch generation failed: ${status.error_message || 'Unknown error'}`);
            // 🔔 触发浏览器通知
            showBrowserNotification(
              'Batch Generation Failed',
              status.error_message || 'Unknown error',
              'error'
            );
          } else if (status.status === 'cancelled') {
            message.warning('Batch generation cancelled');
          }

          // 延迟关闭对话框，让用户看到最终状态
          setTimeout(() => {
            setBatchGenerateVisible(false);
            setBatchTaskId(null);
            setBatchProgress(null);
          }, 2000);
        }
      } catch (error) {
        console.error('轮询批量生成状态失败:', error);
      }
    };

    // 立即执行一次
    poll();

    // 每2秒轮询一次
    batchPollingIntervalRef.current = window.setInterval(poll, 2000);
  };

  // 取消批量生成
  const handleCancelBatchGenerate = async () => {
    if (!batchTaskId) return;

    try {
      const response = await fetch(`/api/chapters/batch-generate/${batchTaskId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Cancellation failed');
      }

      message.success('Batch generation cancelled');

      // 取消后立即刷新章节列表和分析任务，显示已生成的章节
      await refreshChapters();
      await loadAnalysisTasks();

      // 刷新项目信息以更新总字数统计
      if (currentProject?.id) {
        const updatedProject = await projectApi.getProject(currentProject.id);
        setCurrentProject(updatedProject);
      }
    } catch (error: unknown) {
      const err = error as Error;
      message.error('Cancellation failed: ' + (err.message || 'Unknown error'));
    }
  };

  // 打开批量生成对话框
  const handleOpenBatchGenerate = async () => {
    // 找到第一个未生成的章节
    const firstIncompleteChapter = sortedChapters.find(
      ch => !ch.content || ch.content.trim() === ''
    );

    if (!firstIncompleteChapter) {
      message.info('All chapters already have content');
      return;
    }

    // 检查该章节是否可以生成
    if (!canGenerateChapter(firstIncompleteChapter)) {
      const reason = getGenerateDisabledReason(firstIncompleteChapter);
      message.warning(reason);
      return;
    }

    // 打开对话框时加载模型列表和Skill列表，等待完成
    const defaultModel = await loadAvailableModels();
    loadAvailableSkills();

    console.log('[打开批量生成] defaultModel:', defaultModel);
    console.log('[打开批量生成] selectedStyleId:', selectedStyleId);

    // 设置批量生成的模型选择状态
    setBatchSelectedModel(defaultModel || undefined);

    // 重置表单并设置初始值（使用缓存的字数）
    batchForm.setFieldsValue({
      startChapterNumber: firstIncompleteChapter.chapter_number,
      count: 5,
      enableAnalysis: true,
      styleId: selectedStyleId,
      targetWordCount: getCachedWordCount(),
    });

    setBatchGenerateVisible(true);
  };

  // 手动创建章节(仅one-to-many模式)
  const showManualCreateChapterModal = () => {
    // 计算下一个章节号
    const nextChapterNumber = chapters.length > 0
      ? Math.max(...chapters.map(c => c.chapter_number)) + 1
      : 1;

    modal.confirm({
      title: 'Create Chapter Manually',
      width: 600,
      centered: true,
      content: (
        <Form
          form={manualCreateForm}
          layout="vertical"
          initialValues={{
            chapter_number: nextChapterNumber,
            status: 'draft'
          }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="Chapter Number"
            name="chapter_number"
            rules={[{ required: true, message: 'Enter a chapter number' }]}
            tooltip="Create chapters in order to ensure continuity."
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="Next number is calculated automatically" />
          </Form.Item>

          <Form.Item
            label="Chapter Title"
            name="title"
            rules={[{ required: true, message: 'Enter a title' }]}
          >
            <Input placeholder="e.g., Chapter 1: First Encounter" />
          </Form.Item>

          <Form.Item
            label="Associated Outline"
            name="outline_id"
            rules={[{ required: true, message: 'Select an outline' }]}
            tooltip="In one-to-many mode, each chapter must be associated with an outline."
          >
            <Select placeholder="Select an outline">
              {/* Use outlines from the store instead of extracting them from existing chapters. */}
              {[...outlines]
                .sort((a, b) => a.order_index - b.order_index)
                .map(outline => (
                  <Select.Option key={outline.id} value={outline.id}>
                    Volume {outline.order_index}: {outline.title}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Chapter Summary (Optional)"
            name="summary"
            tooltip="Briefly describe the main content and plot development of this chapter."
          >
            <TextArea
              rows={4}
              placeholder="Briefly describe this chapter..."
            />
          </Form.Item>

          <Form.Item
            label="Status"
            name="status"
          >
            <Select>
              <Select.Option value="draft">Draft</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="writing">Writing</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      ),
      okText: 'Create',
      cancelText: 'Cancel',
      onOk: async () => {
        const values = await manualCreateForm.validateFields();

        // 检查章节序号是否已存在
        const conflictChapter = chapters.find(
          ch => ch.chapter_number === values.chapter_number
        );

        if (conflictChapter) {
          // 显示冲突提示Modal
          modal.confirm({
            title: 'Chapter Number Conflict',
            icon: <InfoCircleOutlined style={{ color: token.colorError }} />,
            width: 500,
            centered: true,
            content: (
              <div>
                <p style={{ marginBottom: 12 }}>
                  Chapter <strong>{values.chapter_number}</strong> already exists:
                </p>
                <div style={{
                  padding: 12,
                  background: token.colorWarningBg,
                  borderRadius: token.borderRadius,
                  border: `1px solid ${token.colorWarningBorder}`,
                  marginBottom: 12
                }}>
                  <div><strong>Title:</strong> {conflictChapter.title}</div>
                  <div><strong>Status:</strong> {getStatusText(conflictChapter.status)}</div>
                  <div><strong>Word count:</strong> {conflictChapter.word_count || 0}</div>
                  {conflictChapter.outline_title && (
                    <div><strong>Outline:</strong> {conflictChapter.outline_title}</div>
                  )}
                </div>
                <p style={{ color: token.colorError, marginBottom: 8 }}>
                  ⚠️ Delete the existing chapter and create a new one?
                </p>
                <p style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 0 }}>
                  This cannot be undone. The chapter content and analysis results will also be deleted.
                </p>
              </div>
            ),
            okText: 'Delete and Create',
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: async () => {
              try {
                // 先删除旧章节
                await handleDeleteChapter(conflictChapter.id);

                // 等待一小段时间确保删除完成
                await new Promise(resolve => setTimeout(resolve, 300));

                // 创建新章节
                await chapterApi.createChapter({
                  project_id: currentProject.id,
                  ...values
                });

                message.success('Deleted the existing chapter and created a new one');
                await refreshChapters();

                // 刷新项目信息以更新字数统计
                const updatedProject = await projectApi.getProject(currentProject.id);
                setCurrentProject(updatedProject);

                manualCreateForm.resetFields();
              } catch (error: unknown) {
                const err = error as Error;
                message.error('Operation failed: ' + (err.message || 'Unknown error'));
                throw error;
              }
            }
          });

          // 阻止外层Modal关闭
          return Promise.reject();
        }

        // 没有冲突，直接创建
        try {
          await chapterApi.createChapter({
            project_id: currentProject.id,
            ...values
          });
          message.success('Chapter created successfully');
          await refreshChapters();

          // 刷新项目信息以更新字数统计
          const updatedProject = await projectApi.getProject(currentProject.id);
          setCurrentProject(updatedProject);

          manualCreateForm.resetFields();
        } catch (error: unknown) {
          const err = error as Error;
          message.error('Creation failed: ' + (err.message || 'Unknown error'));
          throw error;
        }
      }
    });
  };

  // 渲染分析状态标签
  const renderAnalysisStatus = (chapterId: string) => {
    const task = analysisTasksMap[chapterId];

    if (!task) {
      return null;
    }

    switch (task.status) {
      case 'pending':
        return (
          <Tag icon={<SyncOutlined spin />} color="processing">
            Waiting for analysis
          </Tag>
        );
      case 'running': {
        // 检查是否正在重试（后端会在error_message中包含"重试"信息）
        const isRetrying = task.error_message && task.error_message.includes('重试');
        return (
          <Tag
            icon={<SyncOutlined spin />}
            color={isRetrying ? "warning" : "processing"}
            title={task.error_message || undefined}
          >
            {isRetrying ? `Retrying ${task.progress}%` : `Analyzing ${task.progress}%`}
          </Tag>
        );
      }
      case 'completed':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Analyzed
          </Tag>
        );
      case 'failed':
        return (
          <Tag icon={<CloseCircleOutlined />} color="error" title={task.error_message || undefined}>
            Analysis failed
          </Tag>
        );
      default:
        return null;
    }
  };

  // 显示展开规划详情
  const showExpansionPlanModal = (chapter: Chapter) => {
    if (!chapter.expansion_plan) return;

    try {
      const planData: ExpansionPlanData = JSON.parse(chapter.expansion_plan);

      modal.info({
        title: (
          <Space style={{ flexWrap: 'wrap' }}>
            <InfoCircleOutlined style={{ color: token.colorPrimary }} />
            <span style={{ wordBreak: 'break-word' }}>Expansion Plan for Chapter {chapter.chapter_number}</span>
          </Space>
        ),
        width: isMobile ? 'calc(100vw - 32px)' : 800,
        centered: true,
        style: isMobile ? {
          maxWidth: 'calc(100vw - 32px)',
          margin: '0 auto',
          padding: '0 16px'
        } : undefined,
        styles: {
          body: {
            maxHeight: isMobile ? 'calc(100vh - 200px)' : 'calc(80vh - 110px)',
            overflowY: 'auto'
          }
        },
        content: (
          <div style={{ marginTop: 16 }}>
            <Descriptions
              column={1}
              size="small"
              bordered
              labelStyle={{
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                width: isMobile ? '80px' : '100px'
              }}
              contentStyle={{
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                overflowWrap: 'break-word'
              }}
            >
              <Descriptions.Item label="Chapter Title">
                <strong style={{
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                  overflowWrap: 'break-word'
                }}>
                  {chapter.title}
                </strong>
              </Descriptions.Item>
              <Descriptions.Item label="Emotional Tone">
                <Tag
                  color="blue"
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    height: 'auto',
                    lineHeight: '1.5',
                    padding: '4px 8px'
                  }}
                >
                  {planData.emotional_tone}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Conflict Type">
                <Tag
                  color="orange"
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    height: 'auto',
                    lineHeight: '1.5',
                    padding: '4px 8px'
                  }}
                >
                  {planData.conflict_type}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Estimated Word Count">
                <Tag color="green">{planData.estimated_words} words</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Narrative Goal">
                <span style={{
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                  overflowWrap: 'break-word'
                }}>
                  {planData.narrative_goal}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Key Events">
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {planData.key_events.map((event, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '4px 0',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        overflowWrap: 'break-word'
                      }}
                    >
                      <Tag color="purple" style={{ flexShrink: 0 }}>{idx + 1}</Tag>{' '}
                      <span style={{
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        overflowWrap: 'break-word'
                      }}>
                        {event}
                      </span>
                    </div>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Characters Involved">
                <Space wrap style={{ maxWidth: '100%' }}>
                  {planData.character_focus.map((char, idx) => (
                    <Tag
                      key={idx}
                      color="cyan"
                      style={{
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        height: 'auto',
                        lineHeight: '1.5'
                      }}
                    >
                      {char}
                    </Tag>
                  ))}
                </Space>
              </Descriptions.Item>
              {planData.scenes && planData.scenes.length > 0 && (
                <Descriptions.Item label="Scene Plan">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {planData.scenes.map((scene, idx) => (
                      <Card
                        key={idx}
                        size="small"
                        style={{
                          backgroundColor: token.colorFillQuaternary,
                          maxWidth: '100%',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{
                          marginBottom: 4,
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          overflowWrap: 'break-word'
                        }}>
                          <strong>📍 Location:</strong>
                          <span style={{
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            overflowWrap: 'break-word'
                          }}>
                            {scene.location}
                          </span>
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong>👥 Characters:</strong>
                          <Space
                            size="small"
                            wrap
                            style={{
                              marginLeft: isMobile ? 0 : 8,
                              marginTop: isMobile ? 4 : 0,
                              display: isMobile ? 'flex' : 'inline-flex'
                            }}
                          >
                            {scene.characters.map((char, charIdx) => (
                              <Tag
                                key={charIdx}
                                style={{
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  height: 'auto'
                                }}
                              >
                                {char}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                        <div style={{
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          overflowWrap: 'break-word'
                        }}>
                          <strong>🎯 Purpose:</strong>
                          <span style={{
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            overflowWrap: 'break-word'
                          }}>
                            {scene.purpose}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>
            <Alert
              message="Note"
              description="This planning information was generated by AI when expanding the outline. Use it as a reference when writing the chapter."
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          </div>
        ),
        okText: 'Close',
      });
    } catch (error) {
      console.error('解析展开规划失败:', error);
      message.error('Invalid expansion plan data format');
    }
  };

  // 删除章节处理函数
  const handleDeleteChapter = async (chapterId: string) => {
    try {
      await deleteChapter(chapterId);

      // 刷新章节列表
      await refreshChapters();

      // 刷新项目信息以更新总字数统计
      if (currentProject) {
        const updatedProject = await projectApi.getProject(currentProject.id);
        setCurrentProject(updatedProject);
      }

      message.success('Chapter deleted successfully');
    } catch (error: unknown) {
      const err = error as Error;
      message.error('Failed to delete chapter: ' + (err.message || 'Unknown error'));
    }
  };

  // 打开规划编辑器
  const handleOpenPlanEditor = (chapter: Chapter) => {
    // 直接打开编辑器,如果没有规划数据则创建新的
    setEditingPlanChapter(chapter);
    setPlanEditorVisible(true);
  };

  // 保存规划信息
  const handleSavePlan = async (planData: ExpansionPlanData) => {
    if (!editingPlanChapter) return;

    try {
      const response = await fetch(`/api/chapters/${editingPlanChapter.id}/expansion-plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(planData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Update failed');
      }

      // 刷新章节列表
      await refreshChapters();

      message.success('Planning information updated successfully');

      // 关闭编辑器
      setPlanEditorVisible(false);
      setEditingPlanChapter(null);
    } catch (error: unknown) {
      const err = error as Error;
      message.error('Failed to save the plan: ' + (err.message || 'Unknown error'));
      throw error;
    }
  };

  // 打开阅读器
  const handleOpenReader = (chapter: Chapter) => {
    setReadingChapter(chapter);
    setReaderVisible(true);
  };

  // 阅读器切换章节
  const handleReaderChapterChange = async (chapterId: string) => {
    try {
      const response = await fetch(`/api/chapters/${chapterId}`);
      if (!response.ok) throw new Error('Failed to retrieve chapter');
      const newChapter = await response.json();
      setReadingChapter(newChapter);
    } catch {
      message.error('Failed to load chapter');
    }
  };

  // 打开局部重写弹窗
  const handleOpenPartialRegenerate = () => {
    setPartialRegenerateToolbarVisible(false);
    setPartialRegenerateModalVisible(true);
  };

  // 应用局部重写结果
  const handleApplyPartialRegenerate = (newText: string, startPos: number, endPos: number) => {
    // 获取当前内容
    const currentContent = editorForm.getFieldValue('content') || '';
    
    // 替换选中部分
    const newContent = currentContent.substring(0, startPos) + newText + currentContent.substring(endPos);
    
    // 更新表单
    editorForm.setFieldsValue({ content: newContent });
    
    // 关闭弹窗
    setPartialRegenerateModalVisible(false);
    
    message.success('Partial rewrite applied');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {contextHolder}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: token.colorBgContainer,
        padding: isMobile ? '12px 0' : '16px 0',
        marginBottom: isMobile ? 12 : 16,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 12 : 0,
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 24 }}>
            <BookOutlined style={{ marginRight: 8 }} />
            Chapter Management
          </h2>
          <Tag
            color={currentProject.outline_mode === 'one-to-one' ? 'blue' : 'green'}
            style={{ width: 'fit-content' }}
          >
            {currentProject.outline_mode === 'one-to-one'
              ? 'Traditional mode: Chapters are managed in the outline. Go to the Outline page to edit them.'
              : 'Expanded mode: Chapters can be expanded from the outline.'}
          </Tag>
        </div>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : 'auto' }}>
          <Input.Search
            allowClear
            placeholder="Search chapters (number/title/outline)"
            value={chapterSearchKeyword}
            onChange={(e) => setChapterSearchKeyword(e.target.value)}
            style={{ width: isMobile ? '100%' : 280 }}
          />
          {currentProject.outline_mode === 'one-to-many' && (
            <Button
              icon={<PlusOutlined />}
              onClick={showManualCreateChapterModal}
              block={isMobile}
              size={isMobile ? 'middle' : 'middle'}
            >
              Create Manually
            </Button>
          )}
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleBatchAnalyzeUnanalyzed}
            loading={batchAnalyzingUnanalyzed}
            disabled={chapters.length === 0 || batchAnalyzableChapterCount === 0}
            block={isMobile}
            size={isMobile ? 'middle' : 'middle'}
            style={{ background: token.colorWarning, borderColor: token.colorWarning }}
            title={batchAnalyzableChapterCount === 0 ? 'No chapters available for batch analysis' : `Batch analyze ${batchAnalyzableChapterCount} chapters`}
          >
            Batch Analyze{batchAnalyzableChapterCount > 0 ? ` (${batchAnalyzableChapterCount})` : ''}
          </Button>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleOpenBatchGenerate}
            disabled={chapters.length === 0 || batchGenerating}
            loading={batchGenerating}
            block={isMobile}
            size={isMobile ? 'middle' : 'middle'}
            style={batchGenerating ? {} : { background: token.colorInfo, borderColor: token.colorInfo }}
          >
            {batchGenerating ? 'Generating...' : 'Generate in Batch'}
          </Button>
          <Button
            type="default"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={chapters.length === 0}
            block={isMobile}
            size={isMobile ? 'middle' : 'middle'}
          >
            Export as TXT
          </Button>
        </Space>
      </div>


      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {chapters.length === 0 ? (
          <Empty description="No chapters yet. Start writing!" />
        ) : filteredSortedChapters.length === 0 ? (
          <Empty description="No matching chapters found" />
        ) : currentProject.outline_mode === 'one-to-one' ? (
          // one-to-one 模式：直接显示扁平列表
          <List
            dataSource={pagedSortedChapters}
            renderItem={(item) => (
              <List.Item
                id={`chapter-item-${item.id}`}
                style={{
                  padding: '16px',
                  marginBottom: 16,
                  background: token.colorBgContainer,
                  borderRadius: token.borderRadius,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'flex-start' : 'center',
                }}
                actions={isMobile ? undefined : [
                  <Button
                    type="text"
                    icon={<ReadOutlined />}
                    onClick={() => handleOpenReader(item)}
                    disabled={!item.content || item.content.trim() === ''}
                    title={!item.content || item.content.trim() === '' ? 'No Content' : 'Immersive Reading'}
                  >
                    Read
                  </Button>,
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleOpenEditor(item.id)}
                  >
                    Edit
                  </Button>,
                  (() => {
                    const task = analysisTasksMap[item.id];
                    const isAnalyzing = task && (task.status === 'pending' || task.status === 'running');
                    const hasContent = item.content && item.content.trim() !== '';

                    return (
                      <Button
                        type="text"
                        icon={isAnalyzing ? <SyncOutlined spin /> : <FundOutlined />}
                        onClick={() => handleShowAnalysis(item.id)}
                        disabled={!hasContent || isAnalyzing}
                        loading={isAnalyzing}
                        title={
                            !hasContent ? 'Generate chapter content first' :
                            isAnalyzing ? 'Analysis in progress. Please wait...' :
                              ''
                        }
                      >
                        {isAnalyzing ? 'Analyzing' : 'Analyze'}
                      </Button>
                    );
                  })(),
                  <Button
                    type="text"
                    icon={<SettingOutlined />}
                    onClick={() => handleOpenModal(item.id)}
                  >
                    Edit Content
                  </Button>,
                ]}
              >
                <div style={{ width: '100%' }}>
                  <List.Item.Meta
                    avatar={!isMobile && <FileTextOutlined style={{ fontSize: 32, color: token.colorPrimary }} />}
                    title={
                      <div style={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        gap: isMobile ? 6 : 12,
                        width: '100%'
                      }}>
                        <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 500, flexShrink: 0 }}>
                          Chapter {item.chapter_number}: {item.title}
                        </span>
                        <Space wrap size={isMobile ? 4 : 8}>
                          <Tag color={getStatusColor(item.status)}>{getStatusText(item.status)}</Tag>
                          <Badge count={`${item.word_count || 0} words`} style={{ backgroundColor: token.colorSuccess }} />
                          {renderAnalysisStatus(item.id)}
                          {!canGenerateChapter(item) && (
                            <Tag icon={<LockOutlined />} color="warning" title={getGenerateDisabledReason(item)}>
                              Prerequisite Chapters
                            </Tag>
                          )}
                        </Space>
                      </div>
                    }
                    description={
                      item.content ? (
                        <div style={{ marginTop: 8, color: token.colorTextSecondary, lineHeight: 1.6, fontSize: isMobile ? 12 : 14 }}>
                          {item.content.substring(0, isMobile ? 80 : 150)}
                          {item.content.length > (isMobile ? 80 : 150) && '...'}
                        </div>
                      ) : (
                        <span style={{ color: token.colorTextTertiary, fontSize: isMobile ? 12 : 14 }}>No content</span>
                      )
                    }
                  />

                  {isMobile && (
                    <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }} wrap>
                      <Button
                        type="text"
                        icon={<ReadOutlined />}
                        onClick={() => handleOpenReader(item)}
                        size="small"
                        disabled={!item.content || item.content.trim() === ''}
                        title={!item.content || item.content.trim() === '' ? 'No Content' : 'Read'}
                      />
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEditor(item.id)}
                        size="small"
                        title="Edit"
                      />
                      {(() => {
                        const task = analysisTasksMap[item.id];
                        const isAnalyzing = task && (task.status === 'pending' || task.status === 'running');
                        const hasContent = item.content && item.content.trim() !== '';

                        return (
                          <Button
                            type="text"
                            icon={isAnalyzing ? <SyncOutlined spin /> : <FundOutlined />}
                            onClick={() => handleShowAnalysis(item.id)}
                            size="small"
                            disabled={!hasContent || isAnalyzing}
                            loading={isAnalyzing}
                            title={
                                !hasContent ? 'Generate chapter content first' :
                                isAnalyzing ? 'Analyzing' :
                                  'Analyze'
                            }
                          />
                        );
                      })()}
                      <Button
                        type="text"
                        icon={<SettingOutlined />}
                        onClick={() => handleOpenModal(item.id)}
                        size="small"
                        title="Edit Content"
                      />
                    </Space>
                  )}
                </div>
              </List.Item>
            )}
          />
        ) : (
          // one-to-many 模式：按大纲分组显示
          <Collapse
            bordered={false}
            defaultActiveKey={pagedGroupedChapters.length > 0 ? ['0'] : []}
            destroyInactivePanel
            expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
            style={{ background: 'transparent' }}
          >
            {pagedGroupedChapters.map((group, groupIndex) => (
              <Collapse.Panel
                key={groupIndex.toString()}
                header={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag color={group.outlineId ? 'blue' : 'default'} style={{ margin: 0 }}>
                      {group.outlineId ? `📖 Outline ${group.outlineOrder}` : '📝 Uncategorized'}
                    </Tag>
                    <span style={{ fontWeight: 600, fontSize: 16 }}>
                      {group.outlineTitle}
                    </span>
                    <Badge
                      count={`${group.chapters.length} chapters`}
                      style={{ backgroundColor: token.colorSuccess }}
                    />
                    <Badge
                      count={`${group.chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0)} words`}
                      style={{ backgroundColor: token.colorPrimary }}
                    />
                  </div>
                }
                style={{
                  marginBottom: 16,
                  background: token.colorBgContainer,
                  borderRadius: token.borderRadius,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <List
                  dataSource={group.chapters}
                  renderItem={(item) => (
                    <List.Item
                      id={`chapter-item-${item.id}`}
                      style={{
                        padding: '16px 0',
                        borderRadius: 8,
                        transition: 'background 0.3s ease',
                        flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'flex-start' : 'center',
                      }}
                      actions={isMobile ? undefined : [
                        <Button
                          type="text"
                          icon={<ReadOutlined />}
                          onClick={() => handleOpenReader(item)}
                          disabled={!item.content || item.content.trim() === ''}
                          title={!item.content || item.content.trim() === '' ? 'No Content' : 'Immersive Reading'}
                        >
                          Read
                        </Button>,
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenEditor(item.id)}
                        >
                          Edit
                        </Button>,
                        (() => {
                          const task = analysisTasksMap[item.id];
                          const isAnalyzing = task && (task.status === 'pending' || task.status === 'running');
                          const hasContent = item.content && item.content.trim() !== '';

                          return (
                            <Button
                              type="text"
                              icon={isAnalyzing ? <SyncOutlined spin /> : <FundOutlined />}
                              onClick={() => handleShowAnalysis(item.id)}
                              disabled={!hasContent || isAnalyzing}
                              loading={isAnalyzing}
                              title={
                                  !hasContent ? 'Generate chapter content first' :
                                  isAnalyzing ? 'Analysis in progress. Please wait...' :
                                    ''
                              }
                            >
                              {isAnalyzing ? 'Analyzing' : 'Analyze'}
                            </Button>
                          );
                        })(),
                        <Button
                          type="text"
                          icon={<SettingOutlined />}
                          onClick={() => handleOpenModal(item.id)}
                        >
                          Edit Content
                        </Button>,
                        // 只在 one-to-many 模式下显示删除按钮
                        ...(currentProject.outline_mode === 'one-to-many' ? [
                          <Popconfirm
                            title="Are you sure you want to delete this chapter?"
                            description="This cannot be undone. The chapter content and analysis results will also be deleted."
                            onConfirm={() => handleDeleteChapter(item.id)}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              Delete
                            </Button>
                          </Popconfirm>
                        ] : []),
                      ]}
                    >
                      <div style={{ width: '100%' }}>
                        <List.Item.Meta
                          avatar={!isMobile && <FileTextOutlined style={{ fontSize: 32, color: token.colorPrimary }} />}
                          title={
                            <div style={{
                              display: 'flex',
                              flexDirection: isMobile ? 'column' : 'row',
                              alignItems: isMobile ? 'flex-start' : 'center',
                              gap: isMobile ? 6 : 12,
                              width: '100%'
                            }}>
                              <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 500, flexShrink: 0 }}>
                                Chapter {item.chapter_number}: {item.title}
                              </span>
                              <Space wrap size={isMobile ? 4 : 8}>
                                <Tag color={getStatusColor(item.status)}>{getStatusText(item.status)}</Tag>
                                <Badge count={`${item.word_count || 0} words`} style={{ backgroundColor: token.colorSuccess }} />
                                {renderAnalysisStatus(item.id)}
                                {!canGenerateChapter(item) && (
                                  <Tag icon={<LockOutlined />} color="warning" title={getGenerateDisabledReason(item)}>
                                    Prerequisite Chapters
                                  </Tag>
                                )}
                                <Space size={4}>
                                  {item.expansion_plan && (
                                    <InfoCircleOutlined
                                      title="View Expansion Details"
                                      style={{ color: token.colorPrimary, cursor: 'pointer', fontSize: 16 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showExpansionPlanModal(item);
                                      }}
                                    />
                                  )}
                                  <FormOutlined
                                    title={item.expansion_plan ? "Edit Plan" : "Create Plan"}
                                    style={{ color: token.colorSuccess, cursor: 'pointer', fontSize: 16 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPlanEditor(item);
                                    }}
                                  />
                                </Space>
                              </Space>
                            </div>
                          }
                          description={
                            item.content ? (
                              <div style={{ marginTop: 8, color: token.colorTextSecondary, lineHeight: 1.6, fontSize: isMobile ? 12 : 14 }}>
                                {item.content.substring(0, isMobile ? 80 : 150)}
                                {item.content.length > (isMobile ? 80 : 150) && '...'}
                              </div>
                            ) : (
                              <span style={{ color: token.colorTextTertiary, fontSize: isMobile ? 12 : 14 }}>No content</span>
                            )
                          }
                        />

                        {isMobile && (
                          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }} wrap>
                            <Button
                              type="text"
                              icon={<ReadOutlined />}
                              onClick={() => handleOpenReader(item)}
                              size="small"
                              disabled={!item.content || item.content.trim() === ''}
                              title={!item.content || item.content.trim() === '' ? 'No Content' : 'Read'}
                            />
                            <Button
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => handleOpenEditor(item.id)}
                              size="small"
                              title="Edit"
                            />
                            {(() => {
                              const task = analysisTasksMap[item.id];
                              const isAnalyzing = task && (task.status === 'pending' || task.status === 'running');
                              const hasContent = item.content && item.content.trim() !== '';

                              return (
                                <Button
                                  type="text"
                                  icon={isAnalyzing ? <SyncOutlined spin /> : <FundOutlined />}
                                  onClick={() => handleShowAnalysis(item.id)}
                                  size="small"
                                  disabled={!hasContent || isAnalyzing}
                                  loading={isAnalyzing}
                                  title={
                                      !hasContent ? 'Generate chapter content first' :
                                      isAnalyzing ? 'Analyzing' :
                                        'Analyze'
                                  }
                                />
                              );
                            })()}
                            <Button
                              type="text"
                              icon={<SettingOutlined />}
                              onClick={() => handleOpenModal(item.id)}
                              size="small"
                              title="Edit Content"
                            />
                            {/* Show the delete button only in one-to-many mode. */}
                            {currentProject.outline_mode === 'one-to-many' && (
                              <Popconfirm
                                title="Are you sure you want to delete this?"
                                description="This cannot be undone."
                                onConfirm={() => handleDeleteChapter(item.id)}
                                okText="Delete"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                              >
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  size="small"
                                  title="Delete Chapter"
                                />
                              </Popconfirm>
                            )}
                          </Space>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              </Collapse.Panel>
            ))}
          </Collapse>
        )}
      </div>

      {filteredSortedChapters.length > 0 && (
        <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={chapterPage}
            pageSize={chapterPageSize}
            total={filteredSortedChapters.length}
            showSizeChanger
            pageSizeOptions={['10', '20', '50', '100']}
            onChange={(page, size) => {
              setChapterPage(page);
              if (size !== chapterPageSize) {
                setChapterPageSize(size);
                setChapterPage(1);
              }
            }}
            showTotal={(total) => `${total} total`}
            size={isMobile ? 'small' : 'default'}
          />
        </div>
      )}

      <Modal
        title={editingId ? 'Edit Chapter Information' : 'Add Chapter'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        centered
        width={isMobile ? 'calc(100vw - 32px)' : 520}
        style={isMobile ? {
          maxWidth: 'calc(100vw - 32px)',
          margin: '0 auto',
          padding: '0 16px'
        } : undefined}
        styles={{
          body: {
            maxHeight: isMobile ? 'calc(100vh - 200px)' : 'calc(80vh - 110px)',
            overflowY: 'auto'
          }
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Chapter Title"
            name="title"
            tooltip={
              currentProject.outline_mode === 'one-to-one'
                ? "Chapter titles are managed by the outline. Edit them on the Outline page."
                : "Chapter titles can be edited in one-to-many mode."
            }
            rules={
              currentProject.outline_mode === 'one-to-many'
                ? [{ required: true, message: 'Enter a chapter title' }]
                : undefined
            }
          >
            <Input
              placeholder="Enter a chapter title"
              disabled={currentProject.outline_mode === 'one-to-one'}
            />
          </Form.Item>

          <Form.Item
            label="Chapter Number"
            name="chapter_number"
            tooltip="Chapter numbers cannot be changed. Delete the associated outline and regenerate it."
          >
            <Input type="number" placeholder="Chapter order number" disabled />
          </Form.Item>

          <Form.Item label="Status" name="status">
            <Select placeholder="Select a status">
              <Select.Option value="draft">Draft</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="writing">Writing</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Update
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Chapter Content"
        open={isEditorOpen}
        onCancel={() => {
          if (isGenerating) {
            message.warning('AI is writing. Wait for it to finish before closing.');
            return;
          }
          setIsEditorOpen(false);
        }}
        closable={!isGenerating}
        maskClosable={false}
        keyboard={!isGenerating}
        width={isMobile ? 'calc(100vw - 32px)' : '85%'}
        centered
        style={isMobile ? {
          maxWidth: 'calc(100vw - 32px)',
          margin: '0 auto',
          padding: '0 16px'
        } : undefined}
        styles={{
          body: {
            maxHeight: isMobile ? 'calc(100vh - 200px)' : 'calc(100vh - 110px)',
            overflowY: 'auto',
            padding: isMobile ? '16px 12px' : '8px'
          }
        }}
        footer={null}
      >
        <Form form={editorForm} layout="vertical" onFinish={handleEditorSubmit}>
          {/* Chapter title and AI writing buttons */}
          <Form.Item
            label="Chapter Title"
            tooltip="In one-to-one mode, edit the title in the outline. In one-to-many mode, use the Edit button."
            style={{ marginBottom: isMobile ? 16 : 12 }}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="title" noStyle>
                <Input disabled style={{ flex: 1 }} />
              </Form.Item>
              {editingId && (() => {
                const currentChapter = chapters.find(c => c.id === editingId);
                const canGenerate = currentChapter ? canGenerateChapter(currentChapter) : false;
                const disabledReason = currentChapter ? getGenerateDisabledReason(currentChapter) : '';

                return (
                  <>
                  <Button
                    type="primary"
                    icon={canGenerate ? <ThunderboltOutlined /> : <LockOutlined />}
                    onClick={() => currentChapter && showGenerateModal(currentChapter)}
                    loading={isContinuing}
                    disabled={!canGenerate}
                    danger={!canGenerate}
                    style={{ fontWeight: 'bold' }}
                    title={!canGenerate ? disabledReason : 'Write using the outline and preceding chapters (streaming)'}
                  >
                    {isMobile ? 'AI' : 'Write with AI'}
                  </Button>
                  <Button
                    icon={<RocketOutlined />}
                    onClick={handleBackgroundGenerate}
                    disabled={!canGenerate || isContinuing}
                    style={{ fontWeight: 'bold' }}
                    title={!canGenerate ? disabledReason : 'Background generation: runs when the browser is closed and saves automatically when complete'}
                  >
                    {isMobile ? 'Background' : 'Generate in Background'}
                  </Button>
                  </>
                );
              })()}
            </Space.Compact>
          </Form.Item>


          {/* Writing style and narrative perspective */}
          <div style={{
            display: isMobile ? 'block' : 'flex',
            gap: isMobile ? 0 : 16,
            marginBottom: isMobile ? 0 : 12
          }}>
            <Form.Item
              label="Writing Style"
              tooltip="Choose the writing style for AI generation."
              required
              style={{ flex: 1, marginBottom: isMobile ? 16 : 0 }}
            >
              <Select
                placeholder="Select a writing style"
                value={selectedStyleId}
                onChange={setSelectedStyleId}
                disabled={isGenerating}
                status={!selectedStyleId ? 'error' : undefined}
              >
                {writingStyles.map(style => (
                  <Select.Option key={style.id} value={style.id}>
                    {style.name}{style.is_default && ' (Default)'}
                  </Select.Option>
                ))}
              </Select>
              {!selectedStyleId && (
                <div style={{ color: token.colorError, fontSize: 12, marginTop: 4 }}>Select a writing style</div>
              )}
            </Form.Item>

            <Form.Item
              label="Narrative Perspective"
              tooltip="First person (I) is immersive; third person (he/she) is more objective; omniscient perspective knows everything."
              style={{ flex: 1, marginBottom: isMobile ? 16 : 0 }}
            >
              <Select
                placeholder={`Project default: ${getNarrativePerspectiveText(currentProject?.narrative_perspective)}`}
                value={temporaryNarrativePerspective}
                onChange={setTemporaryNarrativePerspective}
                allowClear
                disabled={isGenerating}
              >
                <Select.Option value="第一人称">First person (I)</Select.Option>
                <Select.Option value="第三人称">Third person (he/she)</Select.Option>
                <Select.Option value="全知视角">Omniscient</Select.Option>
              </Select>
              {temporaryNarrativePerspective && (
                <div style={{ color: token.colorSuccess, fontSize: 12, marginTop: 4 }}>
                  ✓ {getNarrativePerspectiveText(temporaryNarrativePerspective)}
                </div>
              )}
            </Form.Item>
          </div>

          {/* Target word count, AI model, and skill */}
          <div style={{
            display: isMobile ? 'block' : 'flex',
            gap: isMobile ? 0 : 16,
            marginBottom: isMobile ? 16 : 12
          }}>
            <Form.Item
              label="Apply Skill"
              tooltip="Choose a skill workflow to guide AI writing, or use the standard writing process."
              style={{ flex: 1, marginBottom: isMobile ? 16 : 0 }}
            >
              <Select
                placeholder="No skill (standard writing)"
                value={selectedSkillKey}
                onChange={setSelectedSkillKey}
                allowClear
                disabled={isGenerating}
                showSearch
                optionFilterProp="label"
              >
                {availableSkills.map(skill => (
                  <Select.Option key={skill.template_key} value={skill.template_key} label={skill.template_name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{skill.template_name}</span>
                      <Tag style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>{skill.category}</Tag>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              {selectedSkillKey && (() => {
                const skill = availableSkills.find(s => s.template_key === selectedSkillKey);
                return skill ? (
                  <div style={{ color: token.colorSuccess, fontSize: 12, marginTop: 4 }}>
                    ✓ {skill.description}
                  </div>
                ) : null;
              })()}
            </Form.Item>

            <Form.Item
              label="Target Word Count"
              tooltip="Target length for AI-generated chapters. The actual count may vary slightly. Your changes are saved automatically."
              style={{ flex: 1, marginBottom: isMobile ? 16 : 0 }}
            >
              <InputNumber
                min={500}
                max={10000}
                step={100}
                value={targetWordCount}
                onChange={(value) => {
                  const newValue = value || DEFAULT_WORD_COUNT;
                  setTargetWordCount(newValue);
                  setCachedWordCount(newValue);
                }}
                disabled={isGenerating}
                style={{ width: '100%' }}
                formatter={(value) => `${value} words`}
                parser={(value) => parseInt(value?.replace(' words', '') || '0', 10) as unknown as 500}
              />
            </Form.Item>

            <Form.Item
              label="AI Model"
              tooltip="Choose the AI model for chapter generation, or use the default model."
              style={{ flex: 1, marginBottom: isMobile ? 16 : 0 }}
            >
              <Select
                placeholder={selectedModel ? `Default: ${availableModels.find(m => m.value === selectedModel)?.label || selectedModel}` : "Use default model"}
                value={selectedModel}
                onChange={setSelectedModel}
                allowClear
                disabled={isGenerating}
                showSearch
                optionFilterProp="label"
              >
                {availableModels.map(model => (
                  <Select.Option key={model.value} value={model.value} label={model.label}>
                    {model.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item label="Chapter Content" name="content">
            <TextArea
              ref={contentTextAreaRef}
              rows={isMobile ? 12 : 20}
              placeholder="Start writing..."
              style={{ fontFamily: 'monospace', fontSize: isMobile ? 12 : 14 }}
              disabled={isGenerating}
            />
          </Form.Item>

          {/* Partial rewrite floating toolbar */}
          <div data-partial-regenerate-toolbar>
            <PartialRegenerateToolbar
              visible={partialRegenerateToolbarVisible && !isGenerating}
              position={partialRegenerateToolbarPosition}
              selectedText={selectedTextForRegenerate}
              onRegenerate={handleOpenPartialRegenerate}
            />
          </div>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center' }}>
              <Space style={{ width: isMobile ? '100%' : 'auto' }}>
                <Button
                  onClick={() => {
                    if (isGenerating) {
                      message.warning('AI is writing. Wait for it to finish before closing.');
                      return;
                    }
                    setIsEditorOpen(false);
                  }}
                  block={isMobile}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  block={isMobile}
                  disabled={isGenerating}
                >
                  Save Chapter
                </Button>
              </Space>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {analysisChapterId && (
        <ChapterAnalysis
          chapterId={analysisChapterId}
          visible={analysisVisible}
          onClose={() => {
            setAnalysisVisible(false);

            // 刷新章节列表以显示最新内容
            refreshChapters();

            // 刷新项目信息以更新字数统计
            if (currentProject) {
              projectApi.getProject(currentProject.id)
                .then(updatedProject => {
                  setCurrentProject(updatedProject);
                })
                .catch(error => {
                  console.error('刷新项目信息失败:', error);
                });
            }

            // 延迟500ms后批量刷新分析状态，避免单章接口高频调用
            setTimeout(() => {
              loadAnalysisTasks();
            }, 500);

            setAnalysisChapterId(null);
          }}
        />
      )}

      {/* Batch generation dialog */}
      <Modal
        title={
          <Space>
            <RocketOutlined style={{ color: token.colorInfo }} />
            <span>Batch Generate Chapter Content</span>
          </Space>
        }
        open={batchGenerateVisible}
        onCancel={() => {
          if (batchGenerating) {
            modal.confirm({
              title: 'Confirm Cancellation',
              content: 'Batch generation is in progress. Are you sure you want to cancel?',
              okText: 'Cancel Generation',
              cancelText: 'Continue Generating',
              centered: true,
              onOk: () => {
                handleCancelBatchGenerate();
                setBatchGenerateVisible(false);
              },
            });
          } else {
            setBatchGenerateVisible(false);
          }
        }}
        footer={!batchGenerating ? (
          <Space style={{ width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button onClick={() => setBatchGenerateVisible(false)}>
              Cancel
            </Button>
            <Button type="primary" icon={<RocketOutlined />} onClick={() => batchForm.submit()}>
              Start Batch Generation
            </Button>
          </Space>
        ) : null}
        width={isMobile ? 'calc(100vw - 32px)' : 700}
        centered
        closable={!batchGenerating}
        maskClosable={!batchGenerating}
        style={isMobile ? {
          maxWidth: 'calc(100vw - 32px)',
          margin: '0 auto',
          padding: '0 16px'
        } : undefined}
        styles={{
          body: {
            maxHeight: isMobile ? 'calc(100vh - 200px)' : 'calc(100vh - 260px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }
        }}
      >
        {!batchGenerating ? (
          <Form
            form={batchForm}
            layout="vertical"
            onFinish={handleBatchGenerate}
            initialValues={{
              startChapterNumber: sortedChapters.find(ch => !ch.content || ch.content.trim() === '')?.chapter_number || 1,
              count: 5,
              enableAnalysis: true,
              styleId: selectedStyleId,
              targetWordCount: getCachedWordCount(),
              model: selectedModel,
            }}
          >
            <Alert
              message="Batch generation: chapters are generated in order, use a consistent style and word count, and stop if any chapter fails."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* Starting chapter and number of chapters */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0 : 16 }}>
              <Form.Item
                label="Starting Chapter"
                name="startChapterNumber"
                rules={[{ required: true, message: 'Select a chapter' }]}
                style={{ flex: 1, marginBottom: 12 }}
              >
                <Select placeholder="Select a starting chapter">
                  {sortedChapters
                    .filter(ch => !ch.content || ch.content.trim() === '')
                    .filter(ch => canGenerateChapter(ch))
                    .map(ch => (
                      <Select.Option key={ch.id} value={ch.chapter_number}>
                        Chapter {ch.chapter_number}: {ch.title}
                      </Select.Option>
                    ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Number of Chapters"
                name="count"
                rules={[{ required: true, message: 'Select a number' }]}
                style={{ marginBottom: 12 }}
              >
                <Radio.Group buttonStyle="solid" size={isMobile ? 'small' : 'middle'}>
                  <Radio.Button value={5}>5 chapters</Radio.Button>
                  <Radio.Button value={10}>10 chapters</Radio.Button>
                  <Radio.Button value={15}>15 chapters</Radio.Button>
                  <Radio.Button value={20}>20 chapters</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </div>

            {/* Writing style and target word count */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0 : 16 }}>
              <Form.Item
                label="Writing Style"
                name="styleId"
                rules={[{ required: true, message: 'Select a writing style' }]}
                style={{ flex: 1, marginBottom: 12 }}
              >
                <Select placeholder="Select a writing style" showSearch optionFilterProp="children">
                  {writingStyles.map(style => (
                    <Select.Option key={style.id} value={style.id}>
                      {style.name}{style.is_default && ' (Default)'}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Target Word Count"
                name="targetWordCount"
                rules={[{ required: true, message: 'Set a target word count' }]}
                tooltip="Your changes are saved automatically."
                style={{ flex: 1, marginBottom: 12 }}
              >
                <InputNumber
                  min={500}
                  max={10000}
                  step={100}
                  style={{ width: '100%' }}
                  formatter={(value) => `${value} words`}
                  parser={(value) => parseInt(value?.replace(' words', '') || '0', 10) as unknown as 500}
                  onChange={(value) => {
                    if (value) {
                      setCachedWordCount(value);
                    }
                  }}
                />
              </Form.Item>
            </div>

            {/* AI model and skill */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0 : 16 }}>
              <Form.Item
                label="AI Model"
                tooltip="Leave blank to use the default model."
                style={{ flex: 1, marginBottom: 12 }}
              >
                <Select
                  placeholder={batchSelectedModel ? `Default: ${availableModels.find(m => m.value === batchSelectedModel)?.label || batchSelectedModel}` : "Use default model"}
                  value={batchSelectedModel}
                  onChange={setBatchSelectedModel}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                >
                  {availableModels.map(model => (
                    <Select.Option key={model.value} value={model.value} label={model.label}>
                      {model.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Apply Skill"
                tooltip="Choose a skill workflow to guide batch writing, or use the standard writing process."
                style={{ flex: 1, marginBottom: 12 }}
              >
                <Select
                  placeholder="No skill (standard writing)"
                  value={batchSelectedSkillKey}
                  onChange={setBatchSelectedSkillKey}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                >
                  {availableSkills.map(skill => (
                    <Select.Option key={skill.template_key} value={skill.template_key} label={skill.template_name}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{skill.template_name}</span>
                        <Tag style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>{skill.category}</Tag>
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>

            {/* Synchronous analysis (always enabled) */}
            <Form.Item
              label="Synchronous Analysis"
              name="enableAnalysis"
              tooltip="Required to maintain plot continuity."
              style={{ marginBottom: 12 }}
            >
              <Radio.Group disabled>
                <Radio value={true}>
                  <span style={{ fontSize: 12, color: token.colorSuccess }}>✓ Character states update automatically</span>
                </Radio>
              </Radio.Group>
            </Form.Item>
          </Form>
        ) : (
          <div>
            <Alert
              message="Tips"
              description={
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                  <li>Batch generation may take some time. You can switch to another page.</li>
                  <li>If you close and reopen the page, task progress will be restored automatically.</li>
                  <li>Select "Cancel Task" at any time to stop generation.</li>
                  {batchProgress?.estimated_time_minutes && batchProgress.completed === 0 && (
                    <li>⏱️ Estimated time: about {batchProgress.estimated_time_minutes} minutes</li>
                  )}
                </ul>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <div style={{ textAlign: 'center' }}>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => {
                  modal.confirm({
                    title: 'Confirm Cancellation',
                    content: 'Are you sure you want to cancel batch generation? Chapters already generated will be kept.',
                    okText: 'Cancel Generation',
                    cancelText: 'Continue Generating',
                    okButtonProps: { danger: true },
                    onOk: handleCancelBatchGenerate,
                  });
                }}
              >
                Cancel Task
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Single-chapter generation progress */}
      <SSELoadingOverlay
        loading={isGenerating}
        progress={singleChapterProgress}
        message={singleChapterProgressMessage}
      />

      {/* Chapter reader */}
      {readingChapter && (
        <ChapterReader
          visible={readerVisible}
          chapter={readingChapter}
          onClose={() => {
            setReaderVisible(false);
            setReadingChapter(null);
          }}
          onChapterChange={handleReaderChapterChange}
        />
      )}

      {/* Partial rewrite dialog */}
      {editingId && (
        <PartialRegenerateModal
          visible={partialRegenerateModalVisible}
          chapterId={editingId}
          selectedText={selectedTextForRegenerate}
          startPosition={selectionStartPosition}
          endPosition={selectionEndPosition}
          styleId={selectedStyleId}
          onClose={() => setPartialRegenerateModalVisible(false)}
          onApply={handleApplyPartialRegenerate}
        />
      )}

      {/* Plan editor */}
      {editingPlanChapter && currentProject && (() => {
        let parsedPlanData = null;
        try {
          if (editingPlanChapter.expansion_plan) {
            parsedPlanData = JSON.parse(editingPlanChapter.expansion_plan);
          }
        } catch (error) {
          console.error('解析规划数据失败:', error);
        }

        return (
          <ExpansionPlanEditor
            visible={planEditorVisible}
            planData={parsedPlanData}
            chapterSummary={editingPlanChapter.summary || null}
            projectId={currentProject.id}
            onSave={handleSavePlan}
            onCancel={() => {
              setPlanEditorVisible(false);
              setEditingPlanChapter(null);
            }}
          />
        );
      })()}
    </div>
  );
}
