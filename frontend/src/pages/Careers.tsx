import { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Form, Input, Select, message, Row, Col, Empty, Tabs, Card, Tag, Space, Divider, Typography, InputNumber } from 'antd';
import { ThunderboltOutlined, PlusOutlined, EditOutlined, DeleteOutlined, TrophyOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import SSEProgressModal from '../components/SSEProgressModal';
import { eventBus, EventNames } from '../store/eventBus';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface CareerStage {
    level: number;
    name: string;
    description?: string;
}

interface Career {
    id: string;
    project_id: string;
    name: string;
    type: 'main' | 'sub';
    description?: string;
    category?: string;
    stages: CareerStage[];
    max_stage: number;
    requirements?: string;
    special_abilities?: string;
    worldview_rules?: string;
    source: string;
}

export default function Careers() {
    const { projectId } = useParams<{ projectId: string }>();
    const [mainCareers, setMainCareers] = useState<Career[]>([]);
    const [subCareers, setSubCareers] = useState<Career[]>([]);
    const [, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [editingCareer, setEditingCareer] = useState<Career | null>(null);
    const [form] = Form.useForm();
    const [aiForm] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();

    // AI generation state
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const [aiMessage, setAiMessage] = useState('');

    const fetchCareers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/careers', {
                params: { project_id: projectId }
            }) as { main_careers?: Career[]; sub_careers?: Career[] };
            setMainCareers(response.main_careers || []);
            setSubCareers(response.sub_careers || []);
        } catch (error: unknown) {
            console.error('Failed to load careers:', error);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (projectId) {
            fetchCareers();
        }
    }, [projectId, fetchCareers]);

    useEffect(() => {
        const handleTaskSettled = (payload?: unknown) => {
            if (!payload || typeof payload !== 'object') return;
            const data = payload as { projectId?: string; resources?: string[] };
            if (data.projectId && data.projectId !== projectId) return;
            if (data.resources?.includes('careers')) {
                void fetchCareers();
            }
        };
        eventBus.on(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
        return () => eventBus.off(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
    }, [fetchCareers, projectId]);

    const handleOpenModal = (career?: Career) => {
        if (career) {
            setEditingCareer(career);
            form.setFieldsValue({
                ...career,
                stages: career.stages.map(s => `${s.level}. ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')
            });
        } else {
            setEditingCareer(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    interface CareerFormValues {
        name: string;
        type: 'main' | 'sub';
        description?: string;
        category?: string;
        stages?: string;
        requirements?: string;
        special_abilities?: string;
        worldview_rules?: string;
    }

    const handleSubmit = async (values: CareerFormValues) => {
        try {
            // Parse career stages.
            const stagesText = values.stages || '';
            const stages: CareerStage[] = stagesText.split('\n')
                .filter((line: string) => line.trim())
                .map((line: string, index: number) => {
                    const match = line.match(/^(\d+)\.\s*([^-]+)(?:\s*-\s*(.*))?$/);
                    if (match) {
                        return {
                            level: parseInt(match[1]),
                            name: match[2].trim(),
                            description: match[3]?.trim() || ''
                        };
                    }
                    return {
                        level: index + 1,
                        name: line.trim(),
                        description: ''
                    };
                });

            const data = {
                ...values,
                stages,
                max_stage: stages.length
            };

            if (editingCareer) {
                await api.put(`/careers/${editingCareer.id}`, data);
                message.success('Career updated successfully');
            } else {
                await api.post('/careers', {
                    ...data,
                    project_id: projectId,
                    source: 'manual'
                });
                message.success('Career created successfully');
            }

            setIsModalOpen(false);
            form.resetFields();
            fetchCareers();
        } catch (error: unknown) {
            const axiosError = error as { response?: { data?: { detail?: string } } };
            message.error(axiosError.response?.data?.detail || 'Operation failed');
        }
    };

    const handleDelete = async (id: string) => {
        modal.confirm({
            title: 'Confirm deletion',
            content: 'Are you sure you want to delete this career? It cannot be deleted while characters are using it.',
            centered: true,
            onOk: async () => {
                try {
                    await api.delete(`/careers/${id}`);
                    message.success('Career deleted successfully');
                    fetchCareers();
                } catch (error: unknown) {
                    const axiosError = error as { response?: { data?: { detail?: string } } };
                    message.error(axiosError.response?.data?.detail || 'Deletion failed');
                }
            }
        });
    };

    const handleAIGenerate = async (values: {
        main_career_count: number;
        sub_career_count: number;
        user_requirements?: string;
    }) => {
        setIsAIModalOpen(false);
        setAiGenerating(true);
        setAiProgress(0);
        setAiMessage('Starting career generation...');

        try {
            const userRequirements = values.user_requirements?.trim() || '';

            // Use fetch + POST instead of EventSource GET to avoid URL length limits.
            const response = await fetch('/api/careers/generate-system', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    project_id: projectId || '',
                    main_career_count: values.main_career_count,
                    sub_career_count: values.sub_career_count,
                    user_requirements: userRequirements,
                    enable_mcp: false
                })
            });

            if (!response.ok || !response.body) {
                setAiGenerating(false);
                message.error(`Request failed: ${response.status}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'progress') {
                                setAiProgress(data.progress || 0);
                                setAiMessage(data.message || '');
                            } else if (data.type === 'done') {
                                setTimeout(() => {
                                    setAiGenerating(false);
                                    message.success('AI career generation complete!');
                                    fetchCareers();
                                }, 1000);
                            } else if (data.type === 'error') {
                                setAiGenerating(false);
                                message.error(data.error || data.message || 'Generation failed');
                            }
                        } catch {
                            // Ignore non-JSON lines, such as heartbeat comments.
                        }
                    }
                }
            }

            setAiGenerating(false);
        } catch (err: unknown) {
            setAiGenerating(false);
            const error = err as Error;
            message.error(error.message || 'Failed to start generation');
        }
    };

    const renderCareerCard = (career: Career) => (
        <Card
            key={career.id}
            title={
                <Space>
                    <TrophyOutlined />
                    {career.name}
                    <Tag color={career.source === 'ai' ? 'blue' : 'default'}>
                        {career.source === 'ai' ? 'AI-generated' : 'Manually created'}
                    </Tag>
                    {career.category && <Tag>{career.category}</Tag>}
                </Space>
            }
            extra={
                <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(career)} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(career.id)} />
                </Space>
            }
            style={{ marginBottom: 16 }}
        >
            <Paragraph ellipsis={{ rows: 2 }}>{career.description || 'No description'}</Paragraph>
            <Divider style={{ margin: '12px 0' }} />
            <Text strong>Career stages ({career.max_stage}):</Text>
            <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 8 }}>
                {career.stages.slice(0, 5).map(stage => (
                    <div key={stage.level} style={{ marginLeft: 16, marginBottom: 4 }}>
                        <Text type="secondary">{stage.level}. {stage.name}</Text>
                        {stage.description && <Text type="secondary" style={{ fontSize: 12 }}> - {stage.description}</Text>}
                    </div>
                ))}
                {career.stages.length > 5 && (
                    <Text type="secondary" style={{ marginLeft: 16 }}>...and {career.stages.length - 5} more stages</Text>
                )}
            </div>
            {career.special_abilities && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text strong>Special abilities:</Text>
                    <Paragraph ellipsis={{ rows: 2 }} style={{ marginTop: 4 }}>{career.special_abilities}</Paragraph>
                </>
            )}
        </Card>
    );

    const tabItems = [
        {
            key: 'main',
            label: `Primary careers (${mainCareers.length})`,
            children: mainCareers.length > 0 ? (
                <div>{mainCareers.map(renderCareerCard)}</div>
            ) : (
                <Empty description="No primary careers yet" />
            )
        },
        {
            key: 'sub',
            label: `Secondary careers (${subCareers.length})`,
            children: subCareers.length > 0 ? (
                <div>{subCareers.map(renderCareerCard)}</div>
            ) : (
                <Empty description="No secondary careers yet" />
            )
        }
    ];

    return (
        <>
            {contextHolder}
            <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Fixed header */}
            <div style={{
                padding: '16px 16px 0 16px',
                flexShrink: 0
            }}>
                <div style={{
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <Title level={3} style={{ margin: 0 }}>
                        <TrophyOutlined style={{ marginRight: 8 }} />
                        Career Management
                    </Title>
                    <Space wrap>
                        <Button
                            type="dashed"
                            icon={<ThunderboltOutlined />}
                            onClick={() => {
                                aiForm.resetFields();
                                setIsAIModalOpen(true);
                            }}
                        >
                            Generate Careers with AI
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => handleOpenModal()}
                        >
                            Add Career
                        </Button>
                    </Space>
                </div>
            </div>

            {/* Scrollable content area */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '0 16px 16px 16px'
            }}>
                <Tabs items={tabItems} />
            </div>

            {/* Create/edit dialog */}
            <Modal
                title={editingCareer ? 'Edit Career' : 'Add Career'}
                open={isModalOpen}
                onCancel={() => {
                    setIsModalOpen(false);
                    form.resetFields();
                }}
                footer={null}
                width={700}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item label="Career Name" name="name" rules={[{ required: true }]}>
                                <Input placeholder="e.g., Swordsman, Alchemist" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Type" name="type" rules={[{ required: true }]} initialValue="main">
                                <Select>
                                    <Select.Option value="main">Primary Career</Select.Option>
                                    <Select.Option value="sub">Secondary Career</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label="Career Description" name="description">
                        <TextArea rows={2} placeholder="Describe this career..." />
                    </Form.Item>

                    <Form.Item label="Career Category" name="category">
                        <Input placeholder="e.g., Combat, Production, Support" />
                    </Form.Item>

                    <Form.Item label="Career Stages" name="stages" tooltip="One stage per line, in the format: 1. Stage name - description">
                        <TextArea
                            rows={8}
                            placeholder="Example:&#10;1. Apprentice - First steps&#10;2. Adept - A solid foundation&#10;3. Master - Reaching mastery"
                        />
                    </Form.Item>

                    <Form.Item label="Career Requirements" name="requirements">
                        <TextArea rows={2} placeholder="What is required to pursue this career..." />
                    </Form.Item>

                    <Form.Item label="Special Abilities" name="special_abilities">
                        <TextArea rows={2} placeholder="Special abilities associated with this career..." />
                    </Form.Item>

                    <Form.Item label="Worldbuilding Rules" name="worldview_rules">
                        <TextArea rows={2} placeholder="How this career fits into the world..." />
                    </Form.Item>

                    <Form.Item>
                        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editingCareer ? 'Update' : 'Create'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* AI career generation dialog */}
            <Modal
                title="Generate Careers with AI (Incremental)"
                open={isAIModalOpen}
                onCancel={() => setIsAIModalOpen(false)}
                footer={null}
            >
                <Form form={aiForm} layout="vertical" onFinish={handleAIGenerate}>
                    <Paragraph type="secondary">
                        AI will analyze the current worldbuilding and careers, then generate complementary careers.
                        <br />
                        💡 Generate multiple times to expand the career system. Existing careers will not be replaced.
                    </Paragraph>
                    <Divider style={{ margin: '12px 0' }} />
                    <Form.Item label="Primary careers to add" name="main_career_count" initialValue={3}>
                        <InputNumber min={1} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="Secondary careers to add" name="sub_career_count" initialValue={5}>
                        <InputNumber min={0} max={15} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        label="Additional requirements"
                        name="user_requirements"
                        rules={[{ max: 500, message: 'Additional requirements must be 500 characters or fewer' }]}
                        extra="Optional. Describe the career paths, abilities, constraints, or career types to avoid. AI will consider the existing worldbuilding and careers."
                    >
                        <TextArea
                            rows={4}
                            showCount
                            maxLength={500}
                            placeholder="For example: Add a primary career focused on intelligence gathering and infiltration, with secondary careers in medicine, commerce, or crafting. Avoid adding another purely combat-focused career."
                        />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <Button onClick={() => setIsAIModalOpen(false)}>Cancel</Button>
                            <Button type="primary" icon={<ThunderboltOutlined />} htmlType="submit">
                                Generate
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* AI generation progress */}
            <SSEProgressModal
                visible={aiGenerating}
                progress={aiProgress}
                message={aiMessage}
                title="Generating careers with AI..."
                onCancel={() => setAiGenerating(false)}
            />
            </div>
        </>
    );
}
