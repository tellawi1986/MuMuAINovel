import { useState, useEffect } from 'react';
import { Button, Table, Modal, Form, Input, Tag, Space, message, Popconfirm, Card, theme, Empty, Badge, Tooltip, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ThunderboltOutlined, FileTextOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface SkillItem {
  template_key: string;
  name: string;
  template_name: string;
  display_name: string;
  category: string;
  description: string;
  triggers: string[];
}

interface SkillDetail {
  template_key: string;
  name: string;
  template_name: string;
  display_name: string;
  category: string;
  description: string;
  triggers: string[];
  body: string;
  raw_content: string;
  standalone_references: Record<string, string>;
}

const SKILL_CATEGORY_OPTIONS = [
  { label: 'Long-form Skill', value: 'Skill·长篇' },
  { label: 'Short-form Skill', value: 'Skill·短篇' },
  { label: 'Editing Skill', value: 'Skill·润色' },
  { label: 'Utility Skill', value: 'Skill·工具' },
  { label: 'Skill', value: 'Skill' },
];

const parseTriggers = (value: string): string[] => (
  (value || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
);

const formatTriggers = (triggers: string[]) => (triggers || []).join('\n');

const normalizeCategory = (value: string | string[]) => (
  Array.isArray(value) ? (value[0] || '').trim() : (value || '').trim()
);

export default function SkillManage() {
  const { token } = theme.useToken();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillDetail | null>(null);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewingContent, setViewingContent] = useState('');

  // 加载 Skill 列表
  const loadSkills = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/skills/list');
      if (response.ok) {
        const data = await response.json();
        setSkills(data);
      }
    } catch {
      message.error('Failed to load skills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  // 打开编辑弹窗
  const handleEdit = async (skill: SkillItem) => {
    try {
      const response = await fetch(`/api/skills/detail/${skill.template_key}`);
      if (response.ok) {
        const detail: SkillDetail = await response.json();
        setEditingSkill(detail);
        editForm.setFieldsValue({
          name: detail.name,
          display_name: detail.display_name || detail.template_name,
          category: detail.category,
          description: detail.description,
          triggers: formatTriggers(detail.triggers),
          body: detail.body,
          references: JSON.stringify(detail.standalone_references, null, 2),
        });
        setEditModalVisible(true);
      } else {
        message.error('Failed to load skill details.');
      }
    } catch {
      message.error('Failed to load skill details.');
    }
  };

  // 打开查看原始内容弹窗
  const handleViewRaw = async (skill: SkillItem) => {
    try {
      const response = await fetch(`/api/skills/detail/${skill.template_key}`);
      if (response.ok) {
        const detail: SkillDetail = await response.json();
        setViewingContent(detail.raw_content);
        setViewModalVisible(true);
      }
    } catch {
      message.error('Failed to load content.');
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingSkill) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      // 解析 references JSON
      let refs: Record<string, string> | undefined;
      if (values.references?.trim()) {
        try {
          refs = JSON.parse(values.references);
        } catch {
          message.error('Invalid reference JSON.');
          setSaving(false);
          return;
        }
      }

      const triggers = parseTriggers(values.triggers);
      if (triggers.length === 0) {
        message.error('Enter at least one trigger.');
        setSaving(false);
        return;
      }
      const category = normalizeCategory(values.category);
      if (!category) {
        message.error('Select or enter a category.');
        setSaving(false);
        return;
      }

      const response = await fetch(`/api/skills/update/${editingSkill.template_key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: values.display_name,
          category,
          description: values.description,
          triggers,
          body: values.body,
          references: refs,
        }),
      });

      if (response.ok) {
        message.success('Skill updated successfully.');
        setEditModalVisible(false);
        loadSkills();
      } else {
        const err = await response.json();
        message.error(err.detail || 'Update failed.');
      }
    } catch {
      message.error('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // 创建新 Skill
  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      let refs: Record<string, string> | undefined;
      if (values.references?.trim()) {
        try {
          refs = JSON.parse(values.references);
        } catch {
          message.error('Invalid reference JSON.');
          setSaving(false);
          return;
        }
      }

      const triggers = parseTriggers(values.triggers);
      if (triggers.length === 0) {
        message.error('Enter at least one trigger.');
        setSaving(false);
        return;
      }
      const category = normalizeCategory(values.category);
      if (!category) {
        message.error('Select or enter a category.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/skills/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          display_name: values.display_name,
          category,
          description: values.description,
          triggers,
          body: values.body,
          references: refs,
        }),
      });

      if (response.ok) {
        message.success('Skill created successfully.');
        setCreateModalVisible(false);
        createForm.resetFields();
        loadSkills();
      } else {
        const err = await response.json();
        message.error(err.detail || 'Creation failed.');
      }
    } catch {
      message.error('Creation failed.');
    } finally {
      setSaving(false);
    }
  };

  // 删除 Skill
  const handleDelete = async (skillKey: string) => {
    try {
      const response = await fetch(`/api/skills/delete/${skillKey}`, { method: 'DELETE' });
      if (response.ok) {
        message.success('Deleted successfully.');
        loadSkills();
      } else {
        const err = await response.json();
        message.error(err.detail || 'Deletion failed.');
      }
    } catch {
      message.error('Deletion failed.');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 220,
      ellipsis: true,
      render: (text: string, record: SkillItem) => (
        <div style={{ minWidth: 0 }}>
          <Tooltip title={text}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</strong>
          </Tooltip>
          <Tooltip title={record.name || record.template_key}>
            <span style={{ display: 'block', marginTop: 2, color: token.colorTextTertiary, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {record.name || record.template_key}
            </span>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (cat: string) => {
        const colorMap: Record<string, string> = {
          'Skill·长篇': 'blue',
          'Skill·短篇': 'green',
          'Skill·润色': 'orange',
          'Skill·工具': 'purple',
          'Skill': 'default',
        };
        const label = SKILL_CATEGORY_OPTIONS.find(option => option.value === cat)?.label || cat;
        return <Tag color={colorMap[cat] || 'default'}>{label}</Tag>;
      },
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span
            style={{
              display: 'block',
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: token.colorTextSecondary,
              fontSize: 13,
            }}
          >
            {text}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Triggers',
      dataIndex: 'triggers',
      key: 'triggers',
      width: 180,
      render: (triggers: string[]) => (
        <Space wrap size={4}>
          {triggers.slice(0, 3).map((t, i) => (
            <Tag key={i} style={{ fontSize: 11 }}>{t}</Tag>
          ))}
          {triggers.length > 3 && <Tag>+{triggers.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: SkillItem) => (
        <Space>
          <Button
            type="text"
            icon={<FileTextOutlined />}
            onClick={() => handleViewRaw(record)}
            size="small"
          >
            View
          </Button>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this skill?"
            description="This cannot be undone. Related files will be permanently deleted."
            onConfirm={() => handleDelete(record.template_key)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部标题栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
            Skill Management
            <Badge count={skills.length} style={{ marginLeft: 8, backgroundColor: token.colorPrimary }} />
          </h2>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
            Manage skill workflows online. Add, edit, or delete skills.
          </div>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadSkills}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateModalVisible(true);
            }}
          >
            Add Skill
          </Button>
        </Space>
      </div>

      {/* Skill 列表 */}
      {skills.length === 0 && !loading ? (
        <Card>
          <Empty description="No skills yet. Select “Add Skill” to create one.">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              Add Skill
            </Button>
          </Empty>
        </Card>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Table
            dataSource={skills}
            columns={columns}
            rowKey="template_key"
            loading={loading}
            pagination={false}
            size="middle"
            style={{ background: token.colorBgContainer }}
          />
        </div>
      )}

      {/* 查看原始内容弹窗 */}
      <Modal
        title="Raw SKILL.md Content"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        width={800}
        footer={<Button onClick={() => setViewModalVisible(false)}>Close</Button>}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
      >
        <pre style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 13,
          lineHeight: 1.6,
          background: token.colorFillQuaternary,
          padding: 16,
          borderRadius: 8,
        }}>
          {viewingContent}
        </pre>
      </Modal>

      {/* 编辑 Skill 弹窗 */}
      <Modal
        title="Edit Skill"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={900}
        footer={
          <Space>
            <Button onClick={() => setEditModalVisible(false)}>Cancel</Button>
            <Button type="primary" onClick={handleSaveEdit} loading={saving}>Save</Button>
          </Space>
        }
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="Internal Identifier" name="name" tooltip="The name field from SKILL.md. This cannot be changed when editing.">
            <Input disabled />
          </Form.Item>
          <Form.Item label="Display Name" name="display_name" rules={[{ required: true, whitespace: true, message: 'Enter a display name' }]}
            tooltip="The name shown in the table and toolbox.">
            <Input placeholder="e.g., Long-Form Story Analysis" maxLength={60} />
          </Form.Item>
          <Form.Item label="Category" name="category" rules={[{ required: true, message: 'Select a category' }]}
            tooltip="The skill category shown in the table and toolbox.">
            <Select
              showSearch
              options={SKILL_CATEGORY_OPTIONS}
              placeholder="Select or enter a category"
              mode="tags"
              maxCount={1}
              tokenSeparators={[',', '，', '、']}
            />
          </Form.Item>
          <Form.Item label="Description" name="description" rules={[{ required: true, whitespace: true, message: 'Enter a description' }]}
            tooltip="Describe the purpose of the skill. Use the name and trigger fields for those settings.">
            <TextArea rows={4} placeholder="Briefly describe the skill, its use cases, and how to use it..." />
          </Form.Item>
          <Form.Item label="Triggers" name="triggers" rules={[{ required: true, whitespace: true, message: 'Enter at least one trigger' }]}
            tooltip="Enter one trigger per line, or separate them with commas. Including /skill-name is recommended.">
            <TextArea rows={4} placeholder={'/story-long-analyze\n/analyze-this-book\nHelp me analyze this book'} />
          </Form.Item>
          <Form.Item label="Workflow Instructions" name="body" rules={[{ required: true, message: 'Enter workflow instructions' }]}
            tooltip="The Markdown body in SKILL.md, following the YAML front matter.">
            <TextArea rows={15} placeholder="Enter the complete skill workflow..." style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </Form.Item>
          <Form.Item label="References (JSON)" name="references"
            tooltip='Format: {"filename": "content"}. Leave blank to keep the existing references.'>
            <TextArea rows={8} placeholder='{"anti-ai-tips": "Writing tips...", "quality-check": "Quality checklist..."}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 创建 Skill 弹窗 */}
      <Modal
        title="Add New Skill"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        width={900}
        footer={
          <Space>
            <Button onClick={() => setCreateModalVisible(false)}>Cancel</Button>
            <Button type="primary" onClick={handleCreate} loading={saving}>Create</Button>
          </Space>
        }
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item label="Skill Name (English)" name="name" rules={[{ required: true, message: 'Enter a name' }]}
            tooltip="Use lowercase English letters and hyphens, e.g., my-new-skill. This will be the directory name and internal identifier.">
            <Input placeholder="my-new-skill" />
          </Form.Item>
          <Form.Item label="Display Name" name="display_name" rules={[{ required: true, whitespace: true, message: 'Enter a display name' }]}
            tooltip="The name shown in the table and toolbox.">
            <Input placeholder="e.g., My New Skill" maxLength={60} />
          </Form.Item>
          <Form.Item label="Category" name="category" rules={[{ required: true, message: 'Select a category' }]}
            tooltip="The skill category shown in the table and toolbox.">
            <Select
              showSearch
              options={SKILL_CATEGORY_OPTIONS}
              placeholder="Select or enter a category"
              mode="tags"
              maxCount={1}
              tokenSeparators={[',', '，', '、']}
            />
          </Form.Item>
          <Form.Item label="Description" name="description" rules={[{ required: true, whitespace: true, message: 'Enter a description' }]}
            tooltip="Describe the purpose of the skill. Use the name and trigger fields for those settings.">
            <TextArea rows={4} placeholder="Briefly describe the skill, its use cases, and how to use it..." />
          </Form.Item>
          <Form.Item label="Triggers" name="triggers" rules={[{ required: true, whitespace: true, message: 'Enter at least one trigger' }]}
            tooltip="Enter one trigger per line, or separate them with commas. Including /skill-name is recommended.">
            <TextArea rows={4} placeholder={'/my-new-skill\nMy new skill'} />
          </Form.Item>
          <Form.Item label="Workflow Instructions" name="body" rules={[{ required: true, message: 'Enter workflow instructions' }]}
            tooltip="The core Markdown content for the skill.">
            <TextArea rows={15} placeholder={"# my-new-skill: Skill Title\n\nYou are an expert in [topic]. Your task is to help the user [task].\n\n## Core Principles\n\n- Principle 1...\n\n## Workflow\n\n### Phase 1: Requirements\n..."} style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </Form.Item>
          <Form.Item label="References (Optional JSON)" name="references"
            tooltip='Format: {"filename": "content"}.'>
            <TextArea rows={8} placeholder='{"tips": "Reference tips...", "examples": "Examples..."}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
