import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Form, Input, InputNumber, Select, Button, Card,
  Row, Col, Typography, Space, message, Radio, theme
} from 'antd';
import {
  RocketOutlined, ArrowLeftOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { AIProjectGenerator, type GenerationConfig } from '../components/AIProjectGenerator';
import type { WizardBasicInfo } from '../types';

const { TextArea } = Input;
const { Title, Paragraph } = Typography;

export default function ProjectWizardNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { token } = theme.useToken();

  // 状态管理
  const [currentStep, setCurrentStep] = useState<'form' | 'generating'>('form');
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig | null>(null);
  const [resumeProjectId, setResumeProjectId] = useState<string | null>(null);
  const requestedProjectId = searchParams.get('project_id');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check the URL parameters; if a project_id is present, resume generation
  useEffect(() => {
    if (!requestedProjectId) return;

    const projectId = requestedProjectId;

    const controller = new AbortController();
    const startTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;

      setResumeProjectId(projectId);
      void handleResumeGeneration(projectId, controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProjectId]);

  // Resume generation for an unfinished project
  const handleResumeGeneration = async (projectId: string, signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) {
        throw new Error('Failed to load project information');
      }
      const project = await response.json();

      const config: GenerationConfig = {
        title: project.title,
        description: project.description || '',
        theme: project.theme || '',
        genre: project.genre || '',
        narrative_perspective: project.narrative_perspective || 'Third person',
        target_words: project.target_words || 100000,
        chapter_count: 3,
        character_count: project.character_count || 5,
      };

      setGenerationConfig(config);
      setCurrentStep('generating');
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && error.name === 'AbortError'
      ) {
        return;
      }

      console.error('Failed to resume generation:', error);
      message.error('Failed to resume generation. Please try again.');
      navigate('/');
    }
  };

  // Start the generation flow
  const handleAutoGenerate = async (values: WizardBasicInfo) => {
    const config: GenerationConfig = {
      title: values.title,
      description: values.description,
      theme: values.theme,
      genre: values.genre,
      narrative_perspective: values.narrative_perspective,
      target_words: values.target_words || 100000,
      chapter_count: 3, // 默认生成3章大纲
      character_count: values.character_count || 5,
      outline_mode: values.outline_mode || 'one-to-many', // 添加大纲模式
    };

    setGenerationConfig(config);
    setCurrentStep('generating');
  };

  // 生成完成回调
  const handleComplete = (projectId: string) => {
    console.log('项目创建完成:', projectId);
  };

  // 返回表单页面
  const handleBack = () => {
    setCurrentStep('form');
    setGenerationConfig(null);
  };

  // 渲染表单页面
  const renderForm = () => (
    <Card>
      <Title level={isMobile ? 4 : 3} style={{ marginBottom: 24 }}>
        Create a new project
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 32 }}>
        After you fill in the basics, AI will generate the worldbuilding, characters, and outline nodes for you. Outline nodes can be expanded into chapters inside the project.
      </Paragraph>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleAutoGenerate}
        initialValues={{
          genre: ['Fantasy'],
          chapter_count: 30,
          narrative_perspective: 'Third person',
          character_count: 5,
          target_words: 100000,
          outline_mode: 'one-to-one',
        }}
      >
        <Form.Item
          label="Book title"
          name="title"
          rules={[{ required: true, message: 'Please enter the book title' }]}
        >
          <Input placeholder="Enter your novel title" size="large" />
        </Form.Item>

        <Form.Item
          label="Book synopsis"
          name="description"
          rules={[{ required: true, message: 'Please enter the synopsis' }]}
        >
          <TextArea
            rows={3}
            placeholder="Introduce your novel in one paragraph..."
            showCount
          />
        </Form.Item>

        <Form.Item
          label="Theme"
          name="theme"
          rules={[{ required: true, message: 'Please enter the theme' }]}
        >
          <TextArea
            rows={4}
            placeholder="Describe the central theme of your novel..."
            showCount
          />
        </Form.Item>

        <Form.Item
          label="Genre"
          name="genre"
          rules={[{ required: true, message: 'Please select a genre' }]}
        >
          <Select
            mode="tags"
            placeholder="Choose or enter genre tags (e.g. fantasy, urban, xianxia)"
            size="large"
            tokenSeparators={[',']}
            maxTagCount={5}
          >
            <Select.Option value="Fantasy">Fantasy</Select.Option>
            <Select.Option value="Urban">Urban</Select.Option>
            <Select.Option value="Historical">Historical</Select.Option>
            <Select.Option value="Science fiction">Science fiction</Select.Option>
            <Select.Option value="Wuxia">Wuxia</Select.Option>
            <Select.Option value="Xianxia">Xianxia</Select.Option>
            <Select.Option value="Mythic fantasy">Mythic fantasy</Select.Option>
            <Select.Option value="Mystery">Mystery</Select.Option>
            <Select.Option value="Romance">Romance</Select.Option>
            <Select.Option value="Cultivation">Cultivation</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="Outline chapter mode"
          name="outline_mode"
          rules={[{ required: true, message: 'Please choose an outline mode' }]}
          tooltip="This cannot be changed after creation; choose the workflow that matches your writing style."
        >
          <Radio.Group size="large">
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Card
                  hoverable
                  style={{
                    borderWidth: 2,
                    height: '100%',
                  }}
                  onClick={() => form.setFieldValue('outline_mode', 'one-to-one')}
                >
                  <Radio value="one-to-one" style={{ width: '100%' }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                        <CheckCircleOutlined style={{ marginRight: 8, color: token.colorSuccess }} />
                        Traditional mode (1→1)
                      </div>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                        One outline matches one chapter, simple and direct.
                      </div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        💡 Best for: simple plots, fast drafting, short stories.
                      </div>
                    </Space>
                  </Radio>
                </Card>
              </Col>

              <Col xs={24} sm={12}>
                <Card
                  hoverable
                  style={{
                    borderWidth: 2,
                    height: '100%',
                  }}
                  onClick={() => form.setFieldValue('outline_mode', 'one-to-many')}
                >
                  <Radio value="one-to-many" style={{ width: '100%' }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                        <CheckCircleOutlined style={{ marginRight: 8, color: token.colorSuccess }} />
                        Detailed mode (1→N) recommended
                      </div>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                        One outline can expand into multiple chapters with flexible control.
                      </div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        💡 Best for: complex plots, long-form narratives, fine-grained control.
                      </div>
                    </Space>
                  </Radio>
                </Card>
              </Col>
            </Row>
          </Radio.Group>
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Narrative perspective"
              name="narrative_perspective"
              rules={[{ required: true, message: 'Please select a narrative perspective' }]}
            >
              <Select size="large" placeholder="Choose the novel's narrative perspective">
                <Select.Option value="First person">First person</Select.Option>
                <Select.Option value="Third person">Third person</Select.Option>
                <Select.Option value="Omniscient">Omniscient</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Character count"
              name="character_count"
              rules={[{ required: true, message: 'Please enter the character count' }]}
            >
              <InputNumber
                min={3}
                max={20}
                style={{ width: '100%' }}
                size="large"
                addonAfter="people"
                placeholder="AI-generated character count"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Target word count"
          name="target_words"
          rules={[{ required: true, message: 'Please enter the target word count' }]}
        >
          <InputNumber
            min={10000}
            style={{ width: '100%' }}
            size="large"
            addonAfter="words"
            placeholder="Target word count for the entire novel"
          />
        </Form.Item>

        <Form.Item>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              icon={<RocketOutlined />}
            >
              Start creating the project
            </Button>
            <Button
              size="large"
              block
              onClick={() => navigate('/')}
            >
              Back to home
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: token.colorBgBase,
    }}>
      {/* 顶部标题栏 - 固定不滚动 */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: token.colorPrimary,
        boxShadow: `0 6px 20px color-mix(in srgb, ${token.colorPrimary} 30%, transparent)`,
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '12px 16px' : '16px 24px',
        }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            size={isMobile ? 'middle' : 'large'}
            disabled={currentStep === 'generating'}
            style={{
              background: `color-mix(in srgb, ${token.colorWhite} 20%, transparent)`,
              borderColor: `color-mix(in srgb, ${token.colorWhite} 30%, transparent)`,
              color: token.colorWhite,
            }}
          >
            {isMobile ? 'Back' : 'Back to home'}
          </Button>

          <Title level={isMobile ? 4 : 2} style={{
            margin: 0,
            color: token.colorWhite,
            textShadow: '0 2px 4px color-mix(in srgb, var(--ant-color-black) 18%, transparent)',
          }}>
            <RocketOutlined style={{ marginRight: 8 }} />
            Project creation wizard
          </Title>

          <div style={{ width: isMobile ? 60 : 120 }}></div>
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: isMobile ? '8px 12px 12px' : '12px 20px 16px',
      }}>
        {currentStep === 'form' && renderForm()}
        {currentStep === 'generating' && generationConfig && (
          <AIProjectGenerator
            config={generationConfig}
            storagePrefix="wizard"
            onComplete={handleComplete}
            onBack={handleBack}
            isMobile={isMobile}
            resumeProjectId={resumeProjectId || undefined}
          />
        )}
      </div>
    </div>
  );
}
