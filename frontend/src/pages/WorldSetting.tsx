import { Card, Descriptions, Empty, Typography, Button, Modal, Form, Input, message, Flex, InputNumber, Select, theme } from 'antd';
import { GlobalOutlined, EditOutlined, SyncOutlined, FormOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useStore } from '../store';
import { worldSettingCardStyles } from '../components/CardStyles';
import { projectApi, wizardStreamApi } from '../services/api';
import { SSELoadingOverlay } from '../components/SSELoadingOverlay';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function WorldSetting() {
  const { currentProject, setCurrentProject } = useStore();
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditProjectModalVisible, setIsEditProjectModalVisible] = useState(false);
  const [editProjectForm] = Form.useForm();
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState(0);
  const [regenerateMessage, setRegenerateMessage] = useState('');
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
  const [newWorldData, setNewWorldData] = useState<{
    time_period: string;
    location: string;
    atmosphere: string;
    rules: string;
  } | null>(null);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [modal, contextHolder] = Modal.useModal();
  const { token } = theme.useToken();

  // Regenerate worldbuilding with AI.
  const handleRegenerate = async () => {
    if (!currentProject) return;

    modal.confirm({
      title: 'Confirm regeneration',
      content: 'Are you sure you want AI to regenerate the worldbuilding? This will replace the current content.',
      centered: true,
      okText: 'Regenerate',
      cancelText: 'Cancel',
      onOk: async () => {
        setIsRegenerating(true);
        setRegenerateProgress(0);
        setRegenerateMessage('Preparing to regenerate worldbuilding...');

        try {
          await wizardStreamApi.regenerateWorldBuildingStream(
            currentProject.id,
            {},
            {
              onProgress: (msg: string, progress: number) => {
                setRegenerateProgress(progress);
                setRegenerateMessage(msg);
              },
              onChunk: (chunk: string) => {
                // Optionally display the generated content fragment here.
                console.log('Generated fragment:', chunk);
              },
              onResult: (result: { time_period: string; location: string; atmosphere: string; rules: string }) => {
                // Save the regenerated data.
                const newData = {
                  time_period: result.time_period,
                  location: result.location,
                  atmosphere: result.atmosphere,
                  rules: result.rules,
                };
                setNewWorldData(newData);
              },
              onError: (errorMsg: string) => {
                console.error('Worldbuilding regeneration failed:', errorMsg);
                message.error(errorMsg || 'Regeneration failed. Please try again.');
              },
              onComplete: () => {
                setIsRegenerating(false);
                setRegenerateProgress(0);
                setRegenerateMessage('');
                // Show the preview dialog.
                setIsPreviewModalVisible(true);
              }
            }
          );
        } catch (error) {
          console.error('Error regenerating worldbuilding:', error);
          message.error('An error occurred while regenerating. Please try again.');
          setIsRegenerating(false);
          setRegenerateProgress(0);
          setRegenerateMessage('');
        }
      }
    });
  };

  // Confirm and save the regenerated content.
  const handleConfirmSave = async () => {
    if (!currentProject || !newWorldData) return;

    setIsSavingPreview(true);
    try {
      const updatedProject = await projectApi.updateProject(currentProject.id, {
        world_time_period: newWorldData.time_period,
        world_location: newWorldData.location,
        world_atmosphere: newWorldData.atmosphere,
        world_rules: newWorldData.rules,
      });

      setCurrentProject(updatedProject);
      message.success('Worldbuilding updated!');
      setIsPreviewModalVisible(false);
      setNewWorldData(null);
    } catch (error) {
      console.error('Failed to save:', error);
      message.error('Save failed. Please try again.');
    } finally {
      setIsSavingPreview(false);
    }
  };

  // Cancel saving and close the preview.
  const handleCancelSave = () => {
    setIsPreviewModalVisible(false);
    setNewWorldData(null);
    message.info('Cancelled. The existing content was kept.');
  };

  if (!currentProject) return null;

  // Check whether worldbuilding information exists.
  const hasWorldSetting = currentProject.world_time_period ||
    currentProject.world_location ||
    currentProject.world_atmosphere ||
    currentProject.world_rules;

  if (!hasWorldSetting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Fixed header */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: token.colorBgContainer,
          padding: '16px 0',
          marginBottom: 16,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center'
        }}>
          <GlobalOutlined style={{ fontSize: 24, marginRight: 12, color: token.colorPrimary }} />
          <h2 style={{ margin: 0 }}>Worldbuilding</h2>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Empty
            description="No worldbuilding information yet"
            style={{ marginTop: 60 }}
          >
            <Paragraph type="secondary">
              Worldbuilding is generated in the project setup wizard and provides the setting for your novel.
            </Paragraph>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {contextHolder}
      {/* Fixed header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: token.colorBgContainer,
        padding: '16px 0',
        marginBottom: 24,
        borderBottom: `1px solid ${token.colorBorderSecondary}`
      }}>
        <Flex
          justify="space-between"
          align="flex-start"
          gap={12}
          wrap="wrap"
        >
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
            <GlobalOutlined style={{ fontSize: 24, marginRight: 12, color: token.colorPrimary }} />
            <h2 style={{ margin: 0, whiteSpace: 'nowrap' }}>Worldbuilding</h2>
          </div>
          <Flex gap={8} wrap="wrap" style={{ flex: '0 1 auto' }}>
            <Button
              icon={<SyncOutlined />}
              onClick={handleRegenerate}
              disabled={isRegenerating}
              style={{
                minWidth: 'fit-content',
                flex: '1 1 auto'
              }}
            >
              <span className="button-text-mobile">Regenerate with AI</span>
            </Button>
            <Button
              type="primary"
              icon={<FormOutlined />}
              onClick={() => {
                editProjectForm.setFieldsValue({
                  title: currentProject.title || '',
                  description: currentProject.description || '',
                  theme: currentProject.theme || '',
                  genre: currentProject.genre || '',
                  narrative_perspective: currentProject.narrative_perspective || '',
                  target_words: currentProject.target_words || 0,
                });
                setIsEditProjectModalVisible(true);
              }}
              style={{
                minWidth: 'fit-content',
                flex: '1 1 auto'
              }}
            >
              <span className="button-text-mobile">Edit Basic Information</span>
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                editForm.setFieldsValue({
                  world_time_period: currentProject.world_time_period || '',
                  world_location: currentProject.world_location || '',
                  world_atmosphere: currentProject.world_atmosphere || '',
                  world_rules: currentProject.world_rules || '',
                });
                setIsEditModalVisible(true);
              }}
              style={{
                minWidth: 'fit-content',
                flex: '1 1 auto'
              }}
            >
              <span className="button-text-mobile">Edit Worldbuilding</span>
            </Button>
          </Flex>
        </Flex>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Card
          style={{
            ...worldSettingCardStyles.sectionCard,
            marginBottom: 16
          }}
          title={
            <span style={{ fontSize: 18, fontWeight: 500 }}>
              Basic Information
            </span>
          }
        >
          <Descriptions bordered column={1} styles={{ label: { width: 120, fontWeight: 500 } }}>
            <Descriptions.Item label="Novel Title">{currentProject.title}</Descriptions.Item>
            {currentProject.description && (
              <Descriptions.Item label="Synopsis">{currentProject.description}</Descriptions.Item>
            )}
            <Descriptions.Item label="Theme">{currentProject.theme || 'Not set'}</Descriptions.Item>
            <Descriptions.Item label="Genre">{currentProject.genre || 'Not set'}</Descriptions.Item>
            <Descriptions.Item label="Narrative Perspective">{currentProject.narrative_perspective || 'Not set'}</Descriptions.Item>
            <Descriptions.Item label="Target Word Count">
              {currentProject.target_words ? `${currentProject.target_words.toLocaleString()} words` : 'Not set'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          style={{
            ...worldSettingCardStyles.sectionCard,
            marginBottom: 16
          }}
          title={
            <span style={{ fontSize: 18, fontWeight: 500 }}>
              <GlobalOutlined style={{ marginRight: 8 }} />
              Worldbuilding
            </span>
          }
        >
          <div style={{ padding: '16px 0' }}>
            {currentProject.world_time_period && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ color: token.colorPrimary, marginBottom: 12 }}>
                  Time Period
                </Title>
                <Paragraph style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  padding: 16,
                  background: token.colorBgLayout,
                  borderRadius: 8,
                  borderLeft: `4px solid ${token.colorPrimary}`
                }}>
                  {currentProject.world_time_period}
                </Paragraph>
              </div>
            )}

            {currentProject.world_location && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ color: token.colorSuccess, marginBottom: 12 }}>
                  Location
                </Title>
                <Paragraph style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  padding: 16,
                  background: token.colorBgLayout,
                  borderRadius: 8,
                  borderLeft: `4px solid ${token.colorSuccess}`
                }}>
                  {currentProject.world_location}
                </Paragraph>
              </div>
            )}

            {currentProject.world_atmosphere && (
              <div style={{ marginBottom: 24 }}>
                <Title level={5} style={{ color: token.colorWarning, marginBottom: 12 }}>
                  Atmosphere
                </Title>
                <Paragraph style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  padding: 16,
                  background: token.colorBgLayout,
                  borderRadius: 8,
                  borderLeft: `4px solid ${token.colorWarning}`
                }}>
                  {currentProject.world_atmosphere}
                </Paragraph>
              </div>
            )}

            {currentProject.world_rules && (
              <div style={{ marginBottom: 0 }}>
                <Title level={5} style={{ color: token.colorError, marginBottom: 12 }}>
                  Rules
                </Title>
                <Paragraph style={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  padding: 16,
                  background: token.colorBgLayout,
                  borderRadius: 8,
                  borderLeft: `4px solid ${token.colorError}`
                }}>
                  {currentProject.world_rules}
                </Paragraph>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Edit worldbuilding modal */}
      <Modal
        title="Edit Worldbuilding"
        open={isEditModalVisible}
        centered
        onCancel={() => {
          setIsEditModalVisible(false);
          editForm.resetFields();
        }}
        onOk={async () => {
          try {
            const values = await editForm.validateFields();
            setIsSaving(true);

            const updatedProject = await projectApi.updateProject(currentProject.id, {
              world_time_period: values.world_time_period,
              world_location: values.world_location,
              world_atmosphere: values.world_atmosphere,
              world_rules: values.world_rules,
            });

            setCurrentProject(updatedProject);
            message.success('Worldbuilding updated successfully');
            setIsEditModalVisible(false);
            editForm.resetFields();
          } catch (error) {
            console.error('Failed to update worldbuilding:', error);
            message.error('Update failed. Please try again.');
          } finally {
            setIsSaving(false);
          }
        }}
        confirmLoading={isSaving}
        width={800}
        okText="Save"
        cancelText="Cancel"
      >
        <Form
          form={editForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="Time Period"
            name="world_time_period"
            rules={[{ required: true, message: 'Enter the time period' }]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the era in which the story takes place..."
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item
            label="Location"
            name="world_location"
            rules={[{ required: true, message: 'Enter the location' }]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the geography and environment where the story takes place..."
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item
            label="Atmosphere"
            name="world_atmosphere"
            rules={[{ required: true, message: 'Enter the atmosphere' }]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the story's overall mood and tone..."
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item
            label="Rules"
            name="world_rules"
            rules={[{ required: true, message: 'Enter the world rules' }]}
          >
            <TextArea
              rows={4}
              placeholder="Describe the world's special rules and conventions..."
              showCount
              maxLength={1000}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit project basics modal */}
      <Modal
        title="Edit Project Information"
        open={isEditProjectModalVisible}
        centered
        onCancel={() => {
          setIsEditProjectModalVisible(false);
          editProjectForm.resetFields();
        }}
        onOk={async () => {
          try {
            const values = await editProjectForm.validateFields();
            setIsSavingProject(true);

            const updatedProject = await projectApi.updateProject(currentProject.id, {
              title: values.title,
              description: values.description,
              theme: values.theme,
              genre: values.genre,
              narrative_perspective: values.narrative_perspective,
              target_words: values.target_words,
            });

            setCurrentProject(updatedProject);
            message.success('Project information updated successfully');
            setIsEditProjectModalVisible(false);
            editProjectForm.resetFields();
          } catch (error) {
            console.error('Failed to update project information:', error);
            message.error('Update failed. Please try again.');
          } finally {
            setIsSavingProject(false);
          }
        }}
        confirmLoading={isSavingProject}
        width={800}
        okText="Save"
        cancelText="Cancel"
      >
        <Form
          form={editProjectForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="Novel Title"
            name="title"
            rules={[
              { required: true, message: 'Enter a novel title' },
              { max: 200, message: 'The title cannot exceed 200 characters' }
            ]}
          >
            <Input
              placeholder="Enter a novel title"
              showCount
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            label="Synopsis"
            name="description"
            rules={[
              { max: 1000, message: 'The synopsis cannot exceed 1,000 characters' }
            ]}
          >
            <TextArea
              rows={4}
              placeholder="Enter a synopsis (optional)"
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item
            label="Theme"
            name="theme"
            rules={[
              { max: 500, message: 'The theme cannot exceed 500 characters' }
            ]}
          >
            <TextArea
              rows={3}
              placeholder="Enter a theme (optional)"
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            label="Genre"
            name="genre"
            rules={[
              { max: 100, message: 'The genre cannot exceed 100 characters' }
            ]}
          >
            <Input
              placeholder="Enter a genre, e.g., fantasy, contemporary, or science fiction (optional)"
              showCount
              maxLength={100}
            />
          </Form.Item>

          <Form.Item
            label="Narrative Perspective"
            name="narrative_perspective"
          >
            <Select
              placeholder="Select a narrative perspective (optional)"
              allowClear
              options={[
                { label: 'First person', value: '第一人称' },
                { label: 'Third person', value: '第三人称' },
                { label: 'Omniscient', value: '全知视角' }
              ]}
            />
          </Form.Item>

          <Form.Item
            label="Target Word Count"
            name="target_words"
            rules={[
              { type: 'number', min: 0, message: 'Target word count cannot be negative' },
              { type: 'number', max: 2147483647, message: 'Target word count is out of range' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="Enter a target word count (optional, maximum 2.1 billion)"
              min={0}
              max={2147483647}
              step={1000}
              addonAfter="words"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI regeneration loading overlay */}
      <SSELoadingOverlay
        loading={isRegenerating}
        progress={regenerateProgress}
        message={regenerateMessage}
      />

      {/* Preview regenerated content modal */}
      <Modal
        title="Preview Regenerated Worldbuilding"
        open={isPreviewModalVisible}
        centered
        width={900}
        onOk={handleConfirmSave}
        onCancel={handleCancelSave}
        confirmLoading={isSavingPreview}
        okText="Replace"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        {newWorldData && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: 24, padding: 16, background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8 }}>
              <Typography.Text type="warning" strong>
                ⚠️ Note: Clicking "Replace" will replace the current worldbuilding.
              </Typography.Text>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5} style={{ color: token.colorPrimary, marginBottom: 12 }}>
                Time Period
              </Title>
              <Paragraph style={{
                fontSize: 15,
                lineHeight: 1.8,
                padding: 16,
                background: token.colorBgLayout,
                borderRadius: 8,
                borderLeft: `4px solid ${token.colorPrimary}`
              }}>
                {newWorldData.time_period}
              </Paragraph>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5} style={{ color: token.colorSuccess, marginBottom: 12 }}>
                Location
              </Title>
              <Paragraph style={{
                fontSize: 15,
                lineHeight: 1.8,
                padding: 16,
                background: token.colorBgLayout,
                borderRadius: 8,
                borderLeft: `4px solid ${token.colorSuccess}`
              }}>
                {newWorldData.location}
              </Paragraph>
            </div>

            <div style={{ marginBottom: 24 }}>
              <Title level={5} style={{ color: token.colorWarning, marginBottom: 12 }}>
                Atmosphere
              </Title>
              <Paragraph style={{
                fontSize: 15,
                lineHeight: 1.8,
                padding: 16,
                background: token.colorBgLayout,
                borderRadius: 8,
                borderLeft: `4px solid ${token.colorWarning}`
              }}>
                {newWorldData.atmosphere}
              </Paragraph>
            </div>

            <div style={{ marginBottom: 0 }}>
              <Title level={5} style={{ color: token.colorError, marginBottom: 12 }}>
                Rules
              </Title>
              <Paragraph style={{
                fontSize: 15,
                lineHeight: 1.8,
                padding: 16,
                background: token.colorBgLayout,
                borderRadius: 8,
                borderLeft: `4px solid ${token.colorError}`
              }}>
                {newWorldData.rules}
              </Paragraph>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}