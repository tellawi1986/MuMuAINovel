import { Modal, Form, Input, InputNumber, Select, Tag, Space, Button, message, Divider } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import type { ExpansionPlanData, Character } from '../types';
import { characterApi } from '../services/api';

const { TextArea } = Input;

interface ExpansionPlanEditorProps {
  visible: boolean;
  planData: ExpansionPlanData | null;
  chapterSummary: string | null;
  projectId: string;
  onSave: (data: ExpansionPlanData & { summary?: string }) => Promise<void>;
  onCancel: () => void;
}

export default function ExpansionPlanEditor({
  visible,
  planData,
  chapterSummary,
  projectId,
  onSave,
  onCancel
}: ExpansionPlanEditorProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  // 关键事件标签输入
  const [keyEventInput, setKeyEventInput] = useState('');
  const [keyEvents, setKeyEvents] = useState<string[]>([]);
  
  // 角色列表和选择
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);

  // 加载项目角色列表
  const loadCharacters = useCallback(async () => {
    try {
      setLoadingCharacters(true);
      setAvailableCharacters([]); // 重置为空数组
      const response = await characterApi.getCharacters(projectId);
      console.log('加载到的角色数据:', response);
      
      // API返回的是 {total, items} 格式,需要提取items
      let chars: Character[] = [];
      if (Array.isArray(response)) {
        chars = response;
      } else if (response && typeof response === 'object' && 'items' in response) {
        const responseObj = response as { items?: Character[] };
        if (Array.isArray(responseObj.items)) {
          chars = responseObj.items;
        }
      } else {
        console.error('角色API返回格式异常:', response);
        message.warning('Character data is in an unexpected format');
      }
      
      setAvailableCharacters(chars);
      console.log('设置的角色列表:', chars);
    } catch (error: unknown) {
      console.error('加载角色列表失败:', error);
      setAvailableCharacters([]);
      const err = error as Error;
      message.error('Failed to load characters: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoadingCharacters(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (visible && projectId) {
      loadCharacters();
    }
  }, [visible, projectId, loadCharacters]);

  // 当planData或chapterSummary变化时更新状态
  useEffect(() => {
    if (visible) {
      if (planData) {
        setKeyEvents(planData.key_events || []);
        setCharacters(planData.character_focus || []);
        form.setFieldsValue({
          summary: chapterSummary || '',
          emotional_tone: planData.emotional_tone,
          narrative_goal: planData.narrative_goal,
          conflict_type: planData.conflict_type,
          estimated_words: planData.estimated_words
        });
      } else {
        // 重置状态
        setKeyEvents([]);
        setCharacters([]);
        form.setFieldsValue({
          summary: chapterSummary || ''
        });
      }
    }
  }, [planData, chapterSummary, form, visible]);

  const handleAddKeyEvent = () => {
    if (keyEventInput.trim()) {
      setKeyEvents([...keyEvents, keyEventInput.trim()]);
      setKeyEventInput('');
    }
  };

  const handleAddCharacter = (characterName: string) => {
    if (characterName && !characters.includes(characterName)) {
      setCharacters([...characters, characterName]);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      // 验证至少有一个关键事件
      if (keyEvents.length === 0) {
        message.warning('Please add at least one key event');
        setLoading(false);
        return;
      }
      
      // 验证至少有一个角色
      if (characters.length === 0) {
        message.warning('Please add at least one involved character');
        setLoading(false);
        return;
      }
      
      const updatedPlan: ExpansionPlanData & { summary?: string } = {
        summary: values.summary,
        key_events: keyEvents,
        character_focus: characters,
        emotional_tone: values.emotional_tone,
        narrative_goal: values.narrative_goal,
        conflict_type: values.conflict_type,
        estimated_words: values.estimated_words,
        scenes: planData?.scenes || null
      };
      
      await onSave(updatedPlan);
      // message.success('Plan saved');
    } catch (error) {
      console.error('Save failed:', error);
      message.error('Save failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setKeyEvents([]);
    setCharacters([]);
    setKeyEventInput('');
    onCancel();
  };

  return (
    <Modal
      title="Edit Chapter Plan"
      open={visible}
      onCancel={handleCancel}
      width={700}
      centered
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          Save
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          emotional_tone: 'Tense and intense',
          conflict_type: 'Interpersonal conflict',
          estimated_words: 3000
        }}
      >
        {/* 情节概要 */}
        <Form.Item
          label="Plot summary"
          name="summary"
          tooltip="Briefly describe this chapter's main plot and direction"
        >
          <TextArea
            rows={3}
            placeholder="Briefly describe the main plot, e.g. the protagonist faces an unexpected event and sets off on a new adventure..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Divider orientation="left">Detailed Plan</Divider>

        {/* 关键事件 */}
        <Form.Item
          label="Key events"
          tooltip="Add at least one key event"
          required
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Type a key event, then press Enter or click Add"
                value={keyEventInput}
                onChange={(e) => setKeyEventInput(e.target.value)}
                onPressEnter={handleAddKeyEvent}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddKeyEvent}
              >
                Add
              </Button>
            </Space.Compact>
            <Space wrap>
              {keyEvents.map((event, idx) => (
                <Tag
                  key={idx}
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    setKeyEvents(keyEvents.filter((_, i) => i !== idx));
                  }}
                  color="purple"
                  style={{ marginBottom: 8 }}
                >
                  <span style={{ fontWeight: 'bold', marginRight: 4 }}>#{idx + 1}</span>
                  {event}
                </Tag>
              ))}
            </Space>
          </Space>
        </Form.Item>

        {/* 涉及角色 */}
        <Form.Item
          label="Characters involved"
          tooltip="Choose from this project's characters"
          required
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              placeholder="Select characters"
              style={{ width: '100%' }}
              loading={loadingCharacters}
              onChange={handleAddCharacter}
              value={undefined}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={Array.isArray(availableCharacters)
                ? availableCharacters
                    .filter(char => !characters.includes(char.name))
                    .map(char => ({
                      label: char.name,
                      value: char.name,
                    }))
                : []}
              notFoundContent={
                loadingCharacters ? 'Loading...' :
                !Array.isArray(availableCharacters) ? 'Failed to load characters' :
                availableCharacters.length === 0 ? 'No characters yet. Create them in Character Management first.' :
                'All characters added'
              }
            />
            <Space wrap>
              {characters.map((char, idx) => (
                <Tag
                  key={idx}
                  closable
                  onClose={() => setCharacters(characters.filter((_, i) => i !== idx))}
                  color="cyan"
                >
                  {char}
                </Tag>
              ))}
            </Space>
          </Space>
        </Form.Item>

        {/* 情感基调 */}
        <Form.Item
          label="Emotional tone"
          name="emotional_tone"
          rules={[{ required: true, message: 'Please enter an emotional tone' }]}
          tooltip="e.g. tense, heartwarming, suspenseful"
        >
          <Input
            placeholder="Enter an emotional tone, e.g. tense, heartwarming"
            maxLength={20}
          />
        </Form.Item>

        {/* 冲突类型 */}
        <Form.Item
          label="Conflict type"
          name="conflict_type"
          rules={[{ required: true, message: 'Please enter a conflict type' }]}
          tooltip="e.g. interpersonal, internal, environmental"
        >
          <Input
            placeholder="Enter a conflict type, e.g. interpersonal, internal"
            maxLength={20}
          />
        </Form.Item>

        {/* 预估字数 */}
        <Form.Item
          label="Estimated words"
          name="estimated_words"
          rules={[{ required: true, message: 'Please enter estimated words' }]}
        >
          <InputNumber
            min={500}
            max={10000}
            step={100}
            style={{ width: '100%' }}
            formatter={(value) => `${value} words`}
            parser={(value) => Number(value?.replace(' words', '')) as 500 | 10000}
          />
        </Form.Item>

        {/* 叙事目标 */}
        <Form.Item
          label="Narrative goal"
          name="narrative_goal"
          rules={[{ required: true, message: 'Please enter a narrative goal' }]}
        >
          <TextArea
            rows={3}
            placeholder="Describe this chapter's narrative goal, e.g. advance the main plot, deepen relationships, reveal key information..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}