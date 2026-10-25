import { useState, useEffect, useRef } from 'react';
import { Modal, Spin, Alert, Tabs, Card, Tag, List, Empty, Statistic, Row, Col, Button, theme } from 'antd';
import {
  ThunderboltOutlined,
  BulbOutlined,
  FireOutlined,
  HeartOutlined,
  TeamOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  EditOutlined
} from '@ant-design/icons';
import type { AnalysisTask, ChapterAnalysisResponse } from '../types';
import ChapterRegenerationModal from './ChapterRegenerationModal';
import ChapterContentComparison from './ChapterContentComparison';

// 判断是否为移动设备
const isMobileDevice = () => window.innerWidth < 768;

interface ChapterAnalysisProps {
  chapterId: string;
  visible: boolean;
  onClose: () => void;
}

export default function ChapterAnalysis({ chapterId, visible, onClose }: ChapterAnalysisProps) {
  const { token } = theme.useToken();
  const [task, setTask] = useState<AnalysisTask | null>(null);
  const [analysis, setAnalysis] = useState<ChapterAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(isMobileDevice());
  const [regenerationModalVisible, setRegenerationModalVisible] = useState(false);
  const [comparisonModalVisible, setComparisonModalVisible] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<{ title: string; chapter_number: number; content: string } | null>(null);
  const [newGeneratedContent, setNewGeneratedContent] = useState('');
  const [newContentWordCount, setNewContentWordCount] = useState(0);
  const pollTimerRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (visible && chapterId) {
      setTask(null);
      setAnalysis(null);
      setChapterInfo(null);
      setError(null);
      void fetchAnalysisStatus(chapterId, generation);
    }

    // 监听窗口大小变化
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleResize);

    // Cleanup: stop polling when the component unmounts or closes
    return () => {
      window.removeEventListener('resize', handleResize);
      requestGenerationRef.current += 1;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, chapterId]);

  // 🔧 新增：独立的章节信息加载函数
  const loadChapterInfo = async (
    requestedChapterId = chapterId,
    generation = requestGenerationRef.current,
  ) => {
    try {
      const chapterResponse = await fetch(`/api/chapters/${requestedChapterId}`);
      if (chapterResponse.ok) {
        const chapterData = await chapterResponse.json();
        if (requestGenerationRef.current !== generation) return;
        setChapterInfo({
          title: chapterData.title,
          chapter_number: chapterData.chapter_number,
          content: chapterData.content || ''
        });
        console.log('✅ 已刷新章节内容，字数:', chapterData.content?.length || 0);
      }
    } catch (error) {
      console.error('❌ 加载章节信息失败:', error);
    }
  };

  const fetchAnalysisStatus = async (
    requestedChapterId = chapterId,
    generation = requestGenerationRef.current,
  ) => {
    try {
      setLoading(true);
      setError(null);

      // 🔧 使用独立的章节加载函数
      await loadChapterInfo(requestedChapterId, generation);

      const response = await fetch(`/api/chapters/${requestedChapterId}/analysis/status`);
      if (requestGenerationRef.current !== generation) return;

      if (response.status === 404) {
        setTask(null);
        setError('This chapter has not been analyzed yet');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to get analysis status');
      }

      const taskData: AnalysisTask = await response.json();

      // If status is none (no task), set task to null so the "Start Analysis" button shows
      if (taskData.status === 'none' || !taskData.has_task) {
        setTask(null);
        setError(null); // 清除错误，这不是错误状态
        return;
      }

      setTask(taskData);

      if (taskData.status === 'completed') {
        await fetchAnalysisResult(requestedChapterId, generation);
      } else if (taskData.status === 'running' || taskData.status === 'pending') {
        startPolling(requestedChapterId, generation);
      }
    } catch (err) {
      if (requestGenerationRef.current === generation) {
        setError((err as Error).message);
      }
    } finally {
      if (requestGenerationRef.current === generation) {
        setLoading(false);
      }
    }
  };

  const fetchAnalysisResult = async (
    requestedChapterId = chapterId,
    generation = requestGenerationRef.current,
  ) => {
    try {
      const response = await fetch(`/api/chapters/${requestedChapterId}/analysis`);
      if (!response.ok) {
        throw new Error('Failed to get analysis results');
      }
      const data: ChapterAnalysisResponse = await response.json();
      if (requestGenerationRef.current !== generation) return;
      setAnalysis(data);
    } catch (err) {
      if (requestGenerationRef.current === generation) {
        setError((err as Error).message);
      }
    }
  };

  const startPolling = (requestedChapterId: string, generation: number) => {
    const deadline = Date.now() + 11 * 60 * 1000;

    const poll = async (): Promise<void> => {
      if (requestGenerationRef.current !== generation) return;
      if (Date.now() >= deadline) {
        setError('Analysis status check timed out. Please close and reopen.');
        return;
      }

      try {
        const response = await fetch(`/api/chapters/${requestedChapterId}/analysis/status`);
        if (requestGenerationRef.current !== generation) return;
        if (!response.ok) throw new Error('Failed to get analysis status');

        const taskData: AnalysisTask = await response.json();
        setTask(taskData);

        if (taskData.status === 'completed') {
          await fetchAnalysisResult(requestedChapterId, generation);
          await loadChapterInfo(requestedChapterId, generation);
          return;
        } else if (taskData.status === 'failed') {
          setError(taskData.error_message || 'Analysis failed');
          return;
        }
      } catch (err) {
        console.error('轮询错误:', err);
      }

      if (requestGenerationRef.current === generation) {
        pollTimerRef.current = window.setTimeout(() => {
          void poll();
        }, 2000);
      }
    };

    pollTimerRef.current = window.setTimeout(() => {
      void poll();
    }, 2000);
  };

  const triggerAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      // 🔧 触发分析前先刷新章节内容，确保分析的是最新内容
      await loadChapterInfo();

      const response = await fetch(`/api/chapters/${chapterId}/analyze`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start analysis');
      }

      // Close the modal right after triggering so the parent component takes over state
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };


  const renderStatusIcon = () => {
    if (!task) return null;

    switch (task.status) {
      case 'pending':
        return <ClockCircleOutlined style={{ color: 'var(--color-warning)' }} />;
      case 'running':
        return <Spin />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />;
      case 'failed':
        return <CloseCircleOutlined style={{ color: 'var(--color-error)' }} />;
      default:
        return null;
    }
  };

  const renderProgress = () => {
    if (!task || task.status === 'completed') return null;

    return (
      <div style={{
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px'
      }}>
        {/* 标题和图标 */}
        <div style={{
          textAlign: 'center',
          marginBottom: 32
        }}>
          {renderStatusIcon()}
          <div style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginTop: 16,
            color: task.status === 'failed' ? 'var(--color-error)' : 'var(--color-text-primary)'
          }}>
            {task.status === 'pending' && 'Waiting for analysis...'}
            {task.status === 'running' && 'AI is analyzing...'}
            {task.status === 'failed' && 'Analysis failed'}
          </div>
        </div>

        {/* 进度条 */}
        <div style={{
          width: '100%',
          maxWidth: '500px',
          marginBottom: 16
        }}>
          <div style={{
            height: 12,
            background: 'var(--color-bg-layout)',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 12
          }}>
            <div style={{
              height: '100%',
              background: task.status === 'failed'
                ? 'var(--color-error)'
                : task.progress === 100
                  ? 'var(--color-success)'
                  : 'var(--color-primary)',
              width: `${task.progress}%`,
              transition: 'all 0.3s ease',
              borderRadius: 6,
              boxShadow: task.progress > 0 && task.status !== 'failed'
                ? `0 0 10px color-mix(in srgb, ${token.colorPrimary} 30%, transparent)`
                : 'none'
            }} />
          </div>

          {/* 进度百分比 */}
          <div style={{
            textAlign: 'center',
            fontSize: 32,
            fontWeight: 'bold',
            color: task.status === 'failed' ? 'var(--color-error)' :
              task.progress === 100 ? 'var(--color-success)' : 'var(--color-primary)',
            marginBottom: 8
          }}>
            {task.progress}%
          </div>
        </div>

        {/* 状态消息 */}
        <div style={{
          textAlign: 'center',
          fontSize: 16,
          color: 'var(--color-text-secondary)',
          minHeight: 24,
          marginBottom: 16
        }}>
          {task.status === 'pending' && 'The analysis task has been created and is queued...'}
          {task.status === 'running' && 'Extracting key details and memory snippets...'}
        </div>

        {/* Error info */}
        {task.status === 'failed' && task.error_message && (
          <Alert
            message="Analysis failed"
            description={task.error_message}
            type="error"
            showIcon
            style={{
              marginTop: 16,
              maxWidth: '500px',
              width: '100%'
            }}
          />
        )}

        {/* Helpful text */}
        {task.status !== 'failed' && (
          <div style={{
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            marginTop: 16
          }}>
            The analysis may take a moment, please be patient.
          </div>
        )}
      </div>
    );
  };

  // 将分析建议转换为重新生成组件需要的格式
  const convertSuggestionsForRegeneration = () => {
    if (!analysis?.analysis?.suggestions) return [];

    return analysis.analysis.suggestions.map((suggestion, index) => ({
      category: 'Improvement suggestion',
      content: suggestion,
      priority: index < 3 ? 'high' : 'medium'
    }));
  };

  const renderAnalysisResult = () => {
    if (!analysis) return null;

    const { analysis: analysis_data, memories, entity_changes } = analysis;
    const hasEntityChanges = Boolean(
      entity_changes && (
        (entity_changes.careers?.changes?.length || 0) > 0 ||
        (entity_changes.character_states?.changes?.length || 0) > 0 ||
        (entity_changes.organization_states?.changes?.length || 0) > 0
      )
    );

    return (
      <Tabs
        defaultActiveKey="overview"
        style={{ height: '100%' }}
        items={[
          {
            key: 'overview',
            label: 'Overview',
            icon: <TrophyOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                {/* Regenerate-from-suggestions button */}
                {analysis_data.suggestions && analysis_data.suggestions.length > 0 && (
                  <Alert
                    message="Improvement suggestions found"
                    description={
                      <div>
                        <p style={{ marginBottom: 12 }}>AI found {analysis_data.suggestions.length} improvement suggestions. You can regenerate the chapter based on them.</p>
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={() => setRegenerationModalVisible(true)}
                          size={isMobile ? 'small' : 'middle'}
                        >
                          Regenerate from suggestions
                        </Button>
                      </div>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Card title="Overall Scores" style={{ marginBottom: 16 }} size={isMobile ? 'small' : 'default'}>
                  <Row gutter={isMobile ? 8 : 16}>
                    <Col span={isMobile ? 12 : 6}>
                      <Statistic
                        title="Overall Quality"
                        value={analysis_data.overall_quality_score || 0}
                        suffix="/ 10"
                        valueStyle={{ color: 'var(--color-success)' }}
                      />
                    </Col>
                    <Col span={isMobile ? 12 : 6}>
                      <Statistic
                        title="Pacing"
                        value={analysis_data.pacing_score || 0}
                        suffix="/ 10"
                      />
                    </Col>
                    <Col span={isMobile ? 12 : 6}>
                      <Statistic
                        title="Engagement"
                        value={analysis_data.engagement_score || 0}
                        suffix="/ 10"
                      />
                    </Col>
                    <Col span={isMobile ? 12 : 6}>
                      <Statistic
                        title="Coherence"
                        value={analysis_data.coherence_score || 0}
                        suffix="/ 10"
                      />
                    </Col>
                  </Row>
                </Card>

                {analysis_data.analysis_report && (
                  <Card title="Analysis Summary" style={{ marginBottom: 16 }} size={isMobile ? 'small' : 'default'}>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: isMobile ? 13 : 14 }}>
                      {analysis_data.analysis_report}
                    </pre>
                  </Card>
                )}

                {hasEntityChanges && entity_changes && (
                  <Card title="Linked Entity Updates" style={{ marginBottom: 16 }} size={isMobile ? 'small' : 'default'}>
                    <Row gutter={isMobile ? 8 : 16} style={{ marginBottom: 16 }}>
                      <Col span={isMobile ? 24 : 8}>
                        <Statistic
                          title="Career Updates"
                          value={entity_changes.careers?.updated_count || 0}
                        />
                      </Col>
                      <Col span={isMobile ? 24 : 8}>
                        <Statistic
                          title="Character State/Relationship Updates"
                          value={
                            (entity_changes.character_states?.state_updated_count || 0) +
                            (entity_changes.character_states?.relationship_created_count || 0) +
                            (entity_changes.character_states?.relationship_updated_count || 0) +
                            (entity_changes.character_states?.org_updated_count || 0)
                          }
                        />
                      </Col>
                      <Col span={isMobile ? 24 : 8}>
                        <Statistic
                          title="Organization State Updates"
                          value={entity_changes.organization_states?.updated_count || 0}
                        />
                      </Col>
                    </Row>

                    {entity_changes.careers?.changes?.length ? (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Career changes: </strong>
                        <div style={{ marginTop: 8 }}>
                          {entity_changes.careers.changes.map((change, index) => (
                            <Tag key={`career-${index}`} color="blue" style={{ marginBottom: 8 }}>
                              {change}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {entity_changes.character_states?.changes?.length ? (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Character/relationship changes: </strong>
                        <List
                          size="small"
                          dataSource={entity_changes.character_states.changes}
                          renderItem={(item) => <List.Item>{item}</List.Item>}
                        />
                      </div>
                    ) : null}

                    {entity_changes.organization_states?.changes?.length ? (
                      <div>
                        <strong>Organization state changes: </strong>
                        <List
                          size="small"
                          dataSource={entity_changes.organization_states.changes}
                          renderItem={(item) => <List.Item>{item}</List.Item>}
                        />
                      </div>
                    ) : null}
                  </Card>
                )}

                {analysis_data.suggestions && analysis_data.suggestions.length > 0 && (
                  <Card title={<><BulbOutlined /> Improvement Suggestions</>} size={isMobile ? 'small' : 'default'}>
                    <List
                      dataSource={analysis_data.suggestions}
                      renderItem={(item, index) => (
                        <List.Item>
                          <span>{index + 1}. {item}</span>
                        </List.Item>
                      )}
                    />
                  </Card>
                )}
              </div>
            )
          },
          {
            key: 'hooks',
            label: `Hooks (${analysis_data.hooks?.length || 0})`,
            icon: <ThunderboltOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                <Card size={isMobile ? 'small' : 'default'}>
                  {analysis_data.hooks && analysis_data.hooks.length > 0 ? (
                    <List
                      dataSource={analysis_data.hooks}
                      renderItem={(hook) => (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <div>
                                <Tag color="blue">{hook.type}</Tag>
                                <Tag color="orange">{hook.position}</Tag>
                                <Tag color="red">Strength: {hook.strength}/10</Tag>
                              </div>
                            }
                            description={hook.content}
                          />
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="No hooks" />
                  )}
                </Card>
              </div>
            )
          },
          {
            key: 'foreshadows',
            label: `Foreshadowing (${analysis_data.foreshadows?.length || 0})`,
            icon: <FireOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                <Card size={isMobile ? 'small' : 'default'}>
                  {analysis_data.foreshadows && analysis_data.foreshadows.length > 0 ? (
                    <List
                      dataSource={analysis_data.foreshadows}
                      renderItem={(foreshadow) => (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <div>
                                <Tag color={foreshadow.type === 'planted' ? 'green' : 'purple'}>
                                  {foreshadow.type === 'planted' ? 'Planted' : 'Resolved'}
                                </Tag>
                                <Tag>Strength: {foreshadow.strength}/10</Tag>
                                <Tag>Subtlety: {foreshadow.subtlety}/10</Tag>
                                {foreshadow.reference_chapter && (
                                  <Tag color="cyan">Echoes Chapter {foreshadow.reference_chapter}</Tag>
                                )}
                              </div>
                            }
                            description={foreshadow.content}
                          />
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="No foreshadowing" />
                  )}
                </Card>
              </div>
            )
          },
          {
            key: 'emotion',
            label: 'Emotional Arc',
            icon: <HeartOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                <Card size={isMobile ? 'small' : 'default'}>
                  {analysis_data.emotional_tone ? (
                    <div>
                      <Row gutter={isMobile ? 8 : 16} style={{ marginBottom: isMobile ? 16 : 24 }}>
                        <Col span={isMobile ? 24 : 12}>
                          <Statistic
                            title="Dominant Emotion"
                            value={analysis_data.emotional_tone}
                          />
                        </Col>
                        <Col span={isMobile ? 24 : 12}>
                          <Statistic
                            title="Emotional Intensity"
                            value={(analysis_data.emotional_intensity * 10).toFixed(1)}
                            suffix="/ 10"
                          />
                        </Col>
                      </Row>
                      <Card type="inner" title="Plot Stage" size="small">
                        <p><strong>Stage: </strong>{analysis_data.plot_stage}</p>
                        <p><strong>Conflict level: </strong>{analysis_data.conflict_level} / 10</p>
                        {analysis_data.conflict_types && analysis_data.conflict_types.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Conflict types: </strong>
                            {analysis_data.conflict_types.map((type, idx) => (
                              <Tag key={idx} color="red" style={{ margin: 4 }}>
                                {type}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  ) : (
                    <Empty description="No emotional analysis" />
                  )}
                </Card>
              </div>
            )
          },
          {
            key: 'characters',
            label: `Characters (${analysis_data.character_states?.length || 0})`,
            icon: <TeamOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                <Card size={isMobile ? 'small' : 'default'}>
                  {analysis_data.character_states && analysis_data.character_states.length > 0 ? (
                    <List
                      dataSource={analysis_data.character_states}
                      renderItem={(char) => (
                        <List.Item>
                          <Card
                            type="inner"
                            title={char.character_name}
                            size="small"
                            style={{ width: '100%' }}
                          >
                            <p><strong>State change: </strong>{char.state_before} → {char.state_after}</p>
                            <p><strong>Psychological change: </strong>{char.psychological_change}</p>
                            <p><strong>Key event: </strong>{char.key_event}</p>
                            {char.relationship_changes && Object.keys(char.relationship_changes).length > 0 && (
                              <div>
                                <strong>Relationship changes: </strong>
                                {Object.entries(char.relationship_changes).map(([name, change]) => (
                                  <Tag key={name} color="blue" style={{ margin: 4 }}>
                                    With {name}: {change}
                                  </Tag>
                                ))}
                              </div>
                            )}
                          </Card>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="No character analysis" />
                  )}
                </Card>
              </div>
            )
          },
          {
            key: 'memories',
            label: `Memories (${memories?.length || 0})`,
            icon: <FireOutlined />,
            children: (
              <div style={{ height: isMobile ? 'calc(80vh - 180px)' : 'calc(90vh - 220px)', overflowY: 'auto', paddingRight: '8px' }}>
                <Card size={isMobile ? 'small' : 'default'}>
                  {memories && memories.length > 0 ? (
                    <List
                      dataSource={memories}
                      renderItem={(memory) => (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <div>
                                <Tag color="blue">{memory.type}</Tag>
                                <Tag color="orange">Importance: {memory.importance.toFixed(1)}</Tag>
                                {memory.is_foreshadow === 1 && <Tag color="green">Foreshadowing planted</Tag>}
                                {memory.is_foreshadow === 2 && <Tag color="purple">Foreshadowing resolved</Tag>}
                                <span style={{ marginLeft: 8 }}>{memory.title}</span>
                              </div>
                            }
                            description={
                              <div>
                                <p>{memory.content}</p>
                                <div>
                                  {memory.tags.map((tag, idx) => (
                                    <Tag key={idx} style={{ margin: 2 }}>{tag}</Tag>
                                  ))}
                                </div>
                              </div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="No memory fragments" />
                  )}
                </Card>
              </div>
            )
          }
        ]}
      />
    );
  };

  return (
    <Modal
      title="Chapter Analysis"
      open={visible}
      onCancel={onClose}
      width={isMobile ? 'calc(100vw - 32px)' : '90%'}
      centered
      style={{
        maxWidth: isMobile ? 'calc(100vw - 32px)' : '1400px',
        margin: isMobile ? '0 auto' : undefined,
        padding: isMobile ? '0 16px' : undefined
      }}
      styles={{
        body: {
          padding: isMobile ? '12px' : '24px',
          paddingBottom: 0,
          maxHeight: isMobile ? 'calc(100vh - 200px)' : 'calc(90vh - 150px)',
          overflowY: 'auto'
        }
      }}
      footer={[
        <Button key="close" onClick={onClose} size={isMobile ? 'small' : 'middle'}>
          Close
        </Button>,
        !task && !loading && (
          <Button
            key="analyze"
            type="primary"
            icon={<ReloadOutlined />}
            onClick={triggerAnalysis}
            loading={loading}
            size={isMobile ? 'small' : 'middle'}
          >
            Start Analysis
          </Button>
        ),
        task && (task.status === 'failed') && (
          <Button
            key="reanalyze"
            type="primary"
            icon={<ReloadOutlined />}
            onClick={triggerAnalysis}
            loading={loading}
            danger
            size={isMobile ? 'small' : 'middle'}
          >
            Re-analyze
          </Button>
        ),
        task && task.status === 'completed' && (
          <Button
            key="reanalyze"
            type="default"
            icon={<ReloadOutlined />}
            onClick={triggerAnalysis}
            loading={loading}
            size={isMobile ? 'small' : 'middle'}
          >
            Re-analyze
          </Button>
        )
      ].filter(Boolean)}
    >
      {loading && !task && (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <Spin size="large" />
          <p style={{ marginTop: 16 }}>Loading...</p>
        </div>
      )}

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
        />
      )}

      {task && task.status !== 'completed' && renderProgress()}
      {task && task.status === 'completed' && analysis && renderAnalysisResult()}

      {/* 重新生成Modal */}
      {chapterInfo && (
        <ChapterRegenerationModal
          visible={regenerationModalVisible}
          onCancel={() => setRegenerationModalVisible(false)}
          onSuccess={(newContent: string, wordCount: number) => {
            // 保存新生成的内容
            setNewGeneratedContent(newContent);
            setNewContentWordCount(wordCount);
            // Close the regeneration dialog
            setRegenerationModalVisible(false);
            // 打开对比界面
            setComparisonModalVisible(true);
          }}
          chapterId={chapterId}
          chapterTitle={chapterInfo.title}
          chapterNumber={chapterInfo.chapter_number}
          suggestions={convertSuggestionsForRegeneration()}
          hasAnalysis={true}
        />
      )}

      {/* 内容对比组件 */}
      {chapterInfo && comparisonModalVisible && (
        <ChapterContentComparison
          visible={comparisonModalVisible}
          onClose={() => setComparisonModalVisible(false)}
          chapterId={chapterId}
          chapterTitle={chapterInfo.title}
          originalContent={chapterInfo.content}
          newContent={newGeneratedContent}
          wordCount={newContentWordCount}
          onApply={async () => {
            // 应用新内容后刷新章节信息和分析
            setChapterInfo(null);
            setAnalysis(null);

            // 重新加载章节内容
            try {
              const chapterResponse = await fetch(`/api/chapters/${chapterId}`);
              if (chapterResponse.ok) {
                const chapterData = await chapterResponse.json();
                setChapterInfo({
                  title: chapterData.title,
                  chapter_number: chapterData.chapter_number,
                  content: chapterData.content || ''
                });
              }
            } catch (error) {
              console.error('重新加载章节失败:', error);
            }

            // 刷新分析状态
            await fetchAnalysisStatus();
          }}
          onDiscard={() => {
            // 放弃新内容，清空状态
            setNewGeneratedContent('');
            setNewContentWordCount(0);
          }}
        />
      )}
    </Modal>
  );
}
