import { useState, useEffect, useRef } from 'react';
import { Button, Modal, Form, Input, Select, message, Row, Col, Empty, Tabs, Divider, Typography, Space, InputNumber, Checkbox, theme } from 'antd';
import { ThunderboltOutlined, UserOutlined, TeamOutlined, PlusOutlined, ExportOutlined, ImportOutlined, DownloadOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { useCharacterSync } from '../store/hooks';
import { charactersPageGridConfig } from '../components/CardStyles';
import { CharacterCard } from '../components/CharacterCard';
import { SSELoadingOverlay } from '../components/SSELoadingOverlay';
import type { Character, ApiError } from '../types';
import { characterApi } from '../services/api';
import { SSEPostClient } from '../utils/sseClient';
import api from '../services/api';

const { Title } = Typography;
const { TextArea } = Input;

interface Career {
  id: string;
  name: string;
  type: 'main' | 'sub';
  max_stage: number;
}

// 副职业数据类型
interface SubCareerData {
  career_id: string;
  stage: number;
}

// 角色创建表单值类型
interface CharacterFormValues {
  name: string;
  age?: string;
  gender?: string;
  role_type?: string;
  personality?: string;
  appearance?: string;
  background?: string;
  main_career_id?: string;
  main_career_stage?: number;
  sub_career_data?: SubCareerData[];
  // 组织字段
  organization_type?: string;
  organization_purpose?: string;
  organization_members?: string;
  power_level?: number;
  location?: string;
  motto?: string;
  color?: string;
}

// 角色创建数据类型
interface CharacterCreateData {
  project_id: string;
  name: string;
  is_organization: boolean;
  age?: string;
  gender?: string;
  role_type?: string;
  personality?: string;
  appearance?: string;
  background?: string;
  main_career_id?: string;
  main_career_stage?: number;
  sub_careers?: string;
  organization_type?: string;
  organization_purpose?: string;
  organization_members?: string;
  power_level?: number;
  location?: string;
  motto?: string;
  color?: string;
}

// 角色更新数据类型
interface CharacterUpdateData {
  name?: string;
  age?: string;
  gender?: string;
  role_type?: string;
  personality?: string;
  appearance?: string;
  background?: string;
  main_career_id?: string;
  main_career_stage?: number;
  sub_careers?: string;
  organization_type?: string;
  organization_purpose?: string;
  organization_members?: string;
  power_level?: number;
  location?: string;
  motto?: string;
  color?: string;
}

export default function Characters() {
  const { token } = theme.useToken();
  const { currentProject, characters } = useStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'character' | 'organization'>('all');
  const [generateForm] = Form.useForm();
  const [generateOrgForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'character' | 'organization'>('character');
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [mainCareers, setMainCareers] = useState<Career[]>([]);
  const [subCareers, setSubCareers] = useState<Career[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    refreshCharacters,
    deleteCharacter
  } = useCharacterSync();

  useEffect(() => {
    if (currentProject?.id) {
      refreshCharacters();
      fetchCareers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);
  const [modal, contextHolder] = Modal.useModal();

  const fetchCareers = async () => {
    if (!currentProject?.id) return;
    try {
      const response = await api.get<unknown, { main_careers: Career[]; sub_careers: Career[] }>('/careers', {
        params: { project_id: currentProject.id }
      });
      setMainCareers(response.main_careers || []);
      setSubCareers(response.sub_careers || []);
    } catch (error) {
      console.error('Failed to load careers:', error);
    }
  };

  if (!currentProject) return null;

  const handleDeleteCharacter = async (id: string) => {
    try {
      await deleteCharacter(id);
      message.success('Deleted successfully');
    } catch {
      message.error('Deletion failed');
    }
  };

  const handleGenerate = async (values: { name?: string; role_type: string; background?: string }) => {
    try {
      setIsGenerating(true);
      setProgress(0);
      setProgressMessage('Preparing to generate character...');

      const client = new SSEPostClient(
        '/api/characters/generate-stream',
        {
          project_id: currentProject.id,
          name: values.name,
          role_type: values.role_type,
          background: values.background,
        },
        {
          onProgress: (msg, prog) => {
            setProgress(prog);
            setProgressMessage(msg);
          },
          onResult: (data) => {
            console.log('Character generation complete:', data);
          },
          onError: (error) => {
            message.error(`Generation failed: ${error}`);
          },
          onComplete: () => {
            setProgress(100);
            setProgressMessage('Generation complete!');
          }
        }
      );

      await client.connect();
      message.success('Character generated successfully with AI');
      Modal.destroyAll();
      await refreshCharacters();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'AI character generation failed';
      message.error(errorMessage);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
        setProgressMessage('');
      }, 500);
    }
  };

  const handleGenerateOrganization = async (values: {
    name?: string;
    organization_type?: string;
    background?: string;
    requirements?: string;
  }) => {
    try {
      setIsGenerating(true);
      setProgress(0);
      setProgressMessage('Preparing to generate organization...');

      const client = new SSEPostClient(
        '/api/organizations/generate-stream',
        {
          project_id: currentProject.id,
          name: values.name,
          organization_type: values.organization_type,
          background: values.background,
          requirements: values.requirements,
        },
        {
          onProgress: (msg, prog) => {
            setProgress(prog);
            setProgressMessage(msg);
          },
          onResult: (data) => {
            console.log('Organization generation complete:', data);
          },
          onError: (error) => {
            message.error(`Generation failed: ${error}`);
          },
          onComplete: () => {
            setProgress(100);
            setProgressMessage('Generation complete!');
          }
        }
      );

      await client.connect();
      message.success('Organization generated successfully with AI');
      Modal.destroyAll();
      await refreshCharacters();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'AI organization generation failed';
      message.error(errorMessage);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
        setProgressMessage('');
      }, 500);
    }
  };

  const handleCreateCharacter = async (values: CharacterFormValues) => {
    try {
      const createData: CharacterCreateData = {
        project_id: currentProject.id,
        name: values.name,
        is_organization: createType === 'organization',
      };

      if (createType === 'character') {
        // Character fields.
        createData.age = values.age;
        createData.gender = values.gender;
        createData.role_type = values.role_type || 'supporting';
        createData.personality = values.personality;
        createData.appearance = values.appearance;
        createData.background = values.background;
        
        // Career fields.
        if (values.main_career_id) {
          createData.main_career_id = values.main_career_id;
          createData.main_career_stage = values.main_career_stage || 1;
        }
        
        // Process secondary career data.
        if (values.sub_career_data && Array.isArray(values.sub_career_data) && values.sub_career_data.length > 0) {
          createData.sub_careers = JSON.stringify(values.sub_career_data);
        }
      } else {
        // Organization fields.
        createData.organization_type = values.organization_type;
        createData.organization_purpose = values.organization_purpose;
        createData.background = values.background;
        createData.power_level = values.power_level;
        createData.location = values.location;
        createData.motto = values.motto;
        createData.color = values.color;
        createData.role_type = 'supporting'; // Organizations default to supporting roles.
      }

      await characterApi.createCharacter(createData);
      message.success(`${createType === 'character' ? 'Character' : 'Organization'} created successfully`);
      setIsCreateModalOpen(false);
      createForm.resetFields();
      await refreshCharacters();
    } catch {
      message.error('Creation failed');
    }
  };

  const handleEditCharacter = (character: Character) => {
    setEditingCharacter(character);

    // Extract secondary career data, including career IDs and stages.
    const subCareerData: SubCareerData[] = character.sub_careers?.map((sc) => ({
      career_id: sc.career_id,
      stage: sc.stage || 1
    })) || [];

    editForm.setFieldsValue({
      ...character,
      sub_career_data: subCareerData
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateCharacter = async (values: CharacterFormValues) => {
    if (!editingCharacter) return;

    try {
      // Extract secondary career data; use the remaining values for the update.
      const { sub_career_data: subCareerData, ...restValues } = values;
      const updateData: CharacterUpdateData = { ...restValues };

      // Convert to the sub_careers format.
      if (subCareerData && Array.isArray(subCareerData) && subCareerData.length > 0) {
        updateData.sub_careers = JSON.stringify(subCareerData);
      } else {
        updateData.sub_careers = JSON.stringify([]);
      }

      await characterApi.updateCharacter(editingCharacter.id, updateData);
      message.success('Updated successfully');
      setIsEditModalOpen(false);
      editForm.resetFields();
      setEditingCharacter(null);
      await refreshCharacters();
    } catch (error) {
      console.error('Update failed:', error);
      message.error('Update failed');
    }
  };

  const handleDeleteCharacterWrapper = (id: string) => {
    handleDeleteCharacter(id);
  };

  // Export selected characters and organizations.
  const handleExportSelected = async () => {
    if (selectedCharacters.length === 0) {
      message.warning('Select at least one character or organization');
      return;
    }

    try {
      await characterApi.exportCharacters(selectedCharacters);
      message.success(`Successfully exported ${selectedCharacters.length} characters/organizations`);
      setSelectedCharacters([]);
    } catch (error) {
      message.error('Export failed');
      console.error('Export error:', error);
    }
  };

  // Export a single character or organization.
  const handleExportSingle = async (characterId: string) => {
    try {
      await characterApi.exportCharacters([characterId]);
      message.success('Exported successfully');
    } catch (error) {
      message.error('Export failed');
      console.error('Export error:', error);
    }
  };

  // Handle file selection.
  const handleFileSelect = async (file: File) => {
    try {
      // Validate the file.
      const validation = await characterApi.validateImportCharacters(file);
      
      if (!validation.valid) {
        modal.error({
          title: 'File validation failed',
          centered: true,
          content: (
            <div>
              {validation.errors.map((error, index) => (
                <div key={index} style={{ color: token.colorError }}>• {error}</div>
              ))}
            </div>
          ),
        });
        return;
      }

      // Show the preview dialog.
      modal.confirm({
        title: 'Import Preview',
        width: 500,
        centered: true,
        content: (
          <div>
            <p><strong>File version:</strong> {validation.version}</p>
            <Divider style={{ margin: '12px 0' }} />
            <p><strong>Items to import:</strong></p>
            <ul style={{ marginLeft: 20 }}>
              <li>Characters: {validation.statistics.characters}</li>
              <li>Organizations: {validation.statistics.organizations}</li>
            </ul>
            {validation.warnings.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <p style={{ color: token.colorWarning }}><strong>⚠️ Warnings:</strong></p>
                <ul style={{ marginLeft: 20 }}>
                  {validation.warnings.map((warning, index) => (
                    <li key={index} style={{ color: token.colorWarning }}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
        okText: 'Import',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            const result = await characterApi.importCharacters(currentProject.id, file);
            
            if (result.success) {
              // Show the import results.
              modal.success({
                title: 'Import Complete',
                width: 600,
                centered: true,
                content: (
                  <div>
                    <p><strong>✅ Successfully imported: {result.statistics.imported}</strong></p>
                    {result.details.imported_characters.length > 0 && (
                      <>
                        <p style={{ marginTop: 12, marginBottom: 4 }}>Characters:</p>
                        <ul style={{ marginLeft: 20 }}>
                          {result.details.imported_characters.map((name, index) => (
                            <li key={index}>{name}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {result.details.imported_organizations.length > 0 && (
                      <>
                        <p style={{ marginTop: 12, marginBottom: 4 }}>Organizations:</p>
                        <ul style={{ marginLeft: 20 }}>
                          {result.details.imported_organizations.map((name, index) => (
                            <li key={index}>{name}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {result.statistics.skipped > 0 && (
                      <>
                        <Divider style={{ margin: '12px 0' }} />
                        <p style={{ color: token.colorWarning }}>⚠️ Skipped: {result.statistics.skipped}</p>
                        <ul style={{ marginLeft: 20 }}>
                          {result.details.skipped.map((name, index) => (
                            <li key={index} style={{ color: token.colorWarning }}>{name}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {result.warnings.length > 0 && (
                      <>
                        <Divider style={{ margin: '12px 0' }} />
                        <p style={{ color: token.colorWarning }}>⚠️ Warnings:</p>
                        <ul style={{ marginLeft: 20 }}>
                          {result.warnings.map((warning, index) => (
                            <li key={index} style={{ color: token.colorWarning }}>{warning}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {result.details.errors.length > 0 && (
                      <>
                        <Divider style={{ margin: '12px 0' }} />
                        <p style={{ color: token.colorError }}>❌ Failed: {result.statistics.errors}</p>
                        <ul style={{ marginLeft: 20 }}>
                          {result.details.errors.map((error, index) => (
                            <li key={index} style={{ color: token.colorError }}>{error}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ),
              });
              
              // Refresh the list.
              await refreshCharacters();
              setIsImportModalOpen(false);
            } else {
              message.error(result.message || 'Import failed');
            }
          } catch (error: unknown) {
            const apiError = error as ApiError;
            message.error(apiError.response?.data?.detail || 'Import failed');
            console.error('Import error:', error);
          }
        },
      });
    } catch (error: unknown) {
      const apiError = error as ApiError;
      message.error(apiError.response?.data?.detail || 'File validation failed');
      console.error('Validation error:', error);
    }
  };

  // 切换选择
  const toggleSelectCharacter = (id: string) => {
    setSelectedCharacters(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedCharacters.length === displayList.length) {
      setSelectedCharacters([]);
    } else {
      setSelectedCharacters(displayList.map(c => c.id));
    }
  };

  const showGenerateModal = () => {
    modal.confirm({
      title: 'Generate Character with AI',
      width: 600,
      centered: true,
      content: (
        <Form form={generateForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Character Name"
            name="name"
          >
            <Input placeholder="e.g., Jane Doe (optional; AI can generate a name)" />
          </Form.Item>
          <Form.Item
            label="Role"
            name="role_type"
            rules={[{ required: true, message: 'Select a role' }]}
          >
            <Select placeholder="Select a role">
              <Select.Option value="protagonist">Protagonist</Select.Option>
              <Select.Option value="supporting">Supporting character</Select.Option>
              <Select.Option value="antagonist">Antagonist</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="Background" name="background">
            <TextArea rows={3} placeholder="Briefly describe the character's background and story setting..." />
          </Form.Item>
        </Form>
      ),
      okText: 'Generate',
      cancelText: 'Cancel',
      onOk: async () => {
        const values = await generateForm.validateFields();
        await handleGenerate(values);
      },
    });
  };

  const showGenerateOrgModal = () => {
    modal.confirm({
      title: 'Generate Organization with AI',
      width: 600,
      centered: true,
      content: (
        <Form form={generateOrgForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Organization Name"
            name="name"
          >
            <Input placeholder="e.g., Skyblade Order (optional; AI can generate a name)" />
          </Form.Item>
          <Form.Item
            label="Organization Type"
            name="organization_type"
          >
            <Input placeholder="e.g., Order, guild, company, or academy (optional; AI can infer one from the worldbuilding)" />
          </Form.Item>
          <Form.Item label="Background" name="background">
            <TextArea rows={3} placeholder="Briefly describe the organization's background and setting..." />
          </Form.Item>
          <Form.Item label="Additional Requirements" name="requirements">
            <TextArea rows={2} placeholder="Any other requirements..." />
          </Form.Item>
        </Form>
      ),
      okText: 'Generate',
      cancelText: 'Cancel',
      onOk: async () => {
        const values = await generateOrgForm.validateFields();
        await handleGenerateOrganization(values);
      },
    });
  };

  const characterList = characters.filter(c => !c.is_organization);
  const organizationList = characters.filter(c => c.is_organization);

  const getDisplayList = () => {
    if (activeTab === 'character') return characterList;
    if (activeTab === 'organization') return organizationList;
    return characters;
  };

  const displayList = getDisplayList();

  const isMobile = window.innerWidth <= 768;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {contextHolder}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: 'var(--color-bg-container)',
        padding: isMobile ? '12px 0' : '16px 0',
        marginBottom: isMobile ? 12 : 16,
        borderBottom: '1px solid var(--color-border-secondary)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 12 : 0,
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center'
      }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 24 }}>
          <TeamOutlined style={{ marginRight: 8 }} />
          Character and Organization Management
        </h2>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateType('character');
              setIsCreateModalOpen(true);
            }}
            size={isMobile ? 'small' : 'middle'}
          >
            Create Character
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateType('organization');
              setIsCreateModalOpen(true);
            }}
            size={isMobile ? 'small' : 'middle'}
          >
            Create Organization
          </Button>
          <Button
            type="dashed"
            icon={<ThunderboltOutlined />}
            onClick={showGenerateModal}
            loading={isGenerating}
            size={isMobile ? 'small' : 'middle'}
          >
            Generate Character with AI
          </Button>
          <Button
            type="dashed"
            icon={<ThunderboltOutlined />}
            onClick={showGenerateOrgModal}
            loading={isGenerating}
            size={isMobile ? 'small' : 'middle'}
          >
            Generate Organization with AI
          </Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => setIsImportModalOpen(true)}
            size={isMobile ? 'small' : 'middle'}
          >
            Import
          </Button>
          {selectedCharacters.length > 0 && (
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportSelected}
              size={isMobile ? 'small' : 'middle'}
            >
              Export Selected ({selectedCharacters.length})
            </Button>
          )}
        </Space>
      </div>

      {characters.length > 0 && (
        <div style={{
          position: 'sticky',
          top: isMobile ? 60 : 72,
          zIndex: 9,
          backgroundColor: 'var(--color-bg-container)',
          paddingBottom: 8,
          borderBottom: '1px solid var(--color-border-secondary)',
        }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'all' | 'character' | 'organization')}
            items={[
              {
                key: 'all',
                label: `All (${characters.length})`,
              },
              {
                key: 'character',
                label: (
                  <span>
                    <UserOutlined /> Characters ({characterList.length})
                  </span>
                ),
              },
              {
                key: 'organization',
                label: (
                  <span>
                    <TeamOutlined /> Organizations ({organizationList.length})
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Bulk selection toolbar */}
      {characters.length > 0 && (
        <div style={{
          position: 'sticky',
          top: isMobile ? 120 : 132,
          zIndex: 8,
          backgroundColor: 'var(--color-bg-container)',
          paddingBottom: 8,
          paddingTop: 8,
          marginTop: 8,
          borderBottom: selectedCharacters.length > 0 ? '1px solid var(--color-border-secondary)' : 'none',
        }}>
          <Space>
            <Checkbox
              checked={selectedCharacters.length === displayList.length && displayList.length > 0}
              indeterminate={selectedCharacters.length > 0 && selectedCharacters.length < displayList.length}
              onChange={toggleSelectAll}
            >
              {selectedCharacters.length > 0 ? `${selectedCharacters.length} selected` : 'Select all'}
            </Checkbox>
            {selectedCharacters.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() => setSelectedCharacters([])}
              >
                Clear selection
              </Button>
            )}
          </Space>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {characters.length === 0 ? (
          <Empty description="No characters or organizations yet. Create one to get started!" />
        ) : (
          <>
            <Row gutter={isMobile ? [8, 8] : charactersPageGridConfig.gutter}>
              {activeTab === 'all' && (
                <>
                  {characterList.length > 0 && (
                    <>
                      <Col span={24}>
                        <Divider orientation="left">
                          <Title level={5} style={{ margin: 0 }}>
                            <UserOutlined style={{ marginRight: 8 }} />
                            Characters ({characterList.length})
                          </Title>
                        </Divider>
                      </Col>
                      {characterList.map((character) => (
                        <Col
                          xs={24}
                          sm={charactersPageGridConfig.sm}
                          md={charactersPageGridConfig.md}
                          lg={charactersPageGridConfig.lg}
                          xl={charactersPageGridConfig.xl}
                          key={character.id}
                          style={{ padding: isMobile ? '4px' : '8px' }}
                        >
                          <div style={{ position: 'relative' }}>
                            <Checkbox
                              checked={selectedCharacters.includes(character.id)}
                              onChange={() => toggleSelectCharacter(character.id)}
                              style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                            />
                            <CharacterCard
                              character={character}
                              onEdit={handleEditCharacter}
                              onDelete={handleDeleteCharacterWrapper}
                              onExport={() => handleExportSingle(character.id)}
                            />
                          </div>
                        </Col>
                      ))}
                    </>
                  )}

                  {organizationList.length > 0 && (
                    <>
                      <Col span={24}>
                        <Divider orientation="left">
                          <Title level={5} style={{ margin: 0 }}>
                            <TeamOutlined style={{ marginRight: 8 }} />
                            Organizations ({organizationList.length})
                          </Title>
                        </Divider>
                      </Col>
                      {organizationList.map((org) => (
                        <Col
                          xs={24}
                          sm={charactersPageGridConfig.sm}
                          md={charactersPageGridConfig.md}
                          lg={charactersPageGridConfig.lg}
                          xl={charactersPageGridConfig.xl}
                          key={org.id}
                          style={{ padding: isMobile ? '4px' : '8px' }}
                        >
                          <div style={{ position: 'relative' }}>
                            <Checkbox
                              checked={selectedCharacters.includes(org.id)}
                              onChange={() => toggleSelectCharacter(org.id)}
                              style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                            />
                            <CharacterCard
                              character={org}
                              onEdit={handleEditCharacter}
                              onDelete={handleDeleteCharacterWrapper}
                              onExport={() => handleExportSingle(org.id)}
                            />
                          </div>
                        </Col>
                      ))}
                    </>
                  )}
                </>
              )}

              {activeTab === 'character' && characterList.map((character) => (
                <Col
                  xs={24}
                  sm={charactersPageGridConfig.sm}
                  md={charactersPageGridConfig.md}
                  lg={charactersPageGridConfig.lg}
                  xl={charactersPageGridConfig.xl}
                  key={character.id}
                  style={{ padding: isMobile ? '4px' : '8px' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Checkbox
                      checked={selectedCharacters.includes(character.id)}
                      onChange={() => toggleSelectCharacter(character.id)}
                      style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                    />
                    <CharacterCard
                      character={character}
                      onEdit={handleEditCharacter}
                      onDelete={handleDeleteCharacterWrapper}
                      onExport={() => handleExportSingle(character.id)}
                    />
                  </div>
                </Col>
              ))}

              {activeTab === 'organization' && organizationList.map((org) => (
                <Col
                  xs={24}
                  sm={charactersPageGridConfig.sm}
                  md={charactersPageGridConfig.md}
                  lg={charactersPageGridConfig.lg}
                  xl={charactersPageGridConfig.xl}
                  key={org.id}
                  style={{ padding: isMobile ? '4px' : '8px' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Checkbox
                      checked={selectedCharacters.includes(org.id)}
                      onChange={() => toggleSelectCharacter(org.id)}
                      style={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}
                    />
                    <CharacterCard
                      character={org}
                      onEdit={handleEditCharacter}
                      onDelete={handleDeleteCharacterWrapper}
                      onExport={() => handleExportSingle(org.id)}
                    />
                  </div>
                </Col>
              ))}
            </Row>

            {displayList.length === 0 && (
              <Empty
                description={
                  activeTab === 'character'
                    ? 'No characters yet'
                    : activeTab === 'organization'
                      ? 'No organizations yet'
                      : 'No data'
                }
              />
            )}
          </>
        )}
      </div>

      <Modal
        title={editingCharacter?.is_organization ? 'Edit Organization' : 'Edit Character'}
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          editForm.resetFields();
          setEditingCharacter(null);
        }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => {
              setIsEditModalOpen(false);
              editForm.resetFields();
              setEditingCharacter(null);
            }}>
              Cancel
            </Button>
            <Button type="primary" onClick={() => editForm.submit()}>
              Save
            </Button>
          </Space>
        }
        centered
        width={isMobile ? '100%' : 700}
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={{
          body: {
            maxHeight: isMobile ? 'calc(100vh - 110px)' : 'calc(100vh - 200px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }
        }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateCharacter} style={{ marginTop: 8 }}>
          {!editingCharacter?.is_organization ? (
            <>
              {/* Edit character - name, role, age, and gender */}
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item
                    label="Character Name"
                    name="name"
                    rules={[{ required: true, message: 'Enter a character name' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Character name" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Role" name="role_type" style={{ marginBottom: 12 }}>
                    <Select>
                      <Select.Option value="protagonist">Protagonist</Select.Option>
                      <Select.Option value="supporting">Supporting character</Select.Option>
                      <Select.Option value="antagonist">Antagonist</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="Age" name="age" style={{ marginBottom: 12 }}>
                    <Input placeholder="e.g., 25" />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="Gender" name="gender" style={{ marginBottom: 12 }}>
                    <Select placeholder="Gender">
                      <Select.Option value={'\u7537'}>Male</Select.Option>
                      <Select.Option value={'\u5973'}>Female</Select.Option>
                      <Select.Option value={'\u5176\u4ed6'}>Other</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* Personality and appearance */}
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Personality" name="personality" style={{ marginBottom: 12 }}>
                    <TextArea rows={2} placeholder="Describe the character's personality..." />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Appearance" name="appearance" style={{ marginBottom: 12 }}>
                    <TextArea rows={2} placeholder="Describe the character's appearance..." />
                  </Form.Item>
                </Col>
              </Row>

              {/* Relationships (read-only; managed on the Relationships page) */}
              {editingCharacter?.relationships && (
                <Form.Item label="Relationships (managed on the Relationships page)" style={{ marginBottom: 12 }}>
                  <Input.TextArea
                    value={editingCharacter.relationships}
                    readOnly
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    style={{ backgroundColor: token.colorFillTertiary, cursor: 'default' }}
                  />
                </Form.Item>
              )}

              {/* Character background */}
              <Form.Item label="Character Background" name="background" style={{ marginBottom: 12 }}>
                <TextArea rows={2} placeholder="Describe the character's backstory..." />
              </Form.Item>

              {/* Career information */}
              {(mainCareers.length > 0 || subCareers.length > 0) && (
                <>
                  <Divider style={{ margin: '8px 0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Career Information</Typography.Text>
                  </Divider>
                  {mainCareers.length > 0 && (
                    <Row gutter={12}>
                      <Col span={16}>
                        <Form.Item label="Primary Career" name="main_career_id" tooltip="The character's primary career" style={{ marginBottom: 12 }}>
                          <Select placeholder="Select a primary career" allowClear size="small">
                            {mainCareers.map(career => (
                              <Select.Option key={career.id} value={career.id}>
                                {career.name} (max. stage {career.max_stage})
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Current Stage" name="main_career_stage" tooltip="The character's current stage in their primary career" style={{ marginBottom: 12 }}>
                          <InputNumber
                            min={1}
                            max={editForm.getFieldValue('main_career_id') ?
                              mainCareers.find(c => c.id === editForm.getFieldValue('main_career_id'))?.max_stage || 10
                              : 10}
                            style={{ width: '100%' }}
                            placeholder="Stage"
                            size="small"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  {subCareers.length > 0 && (
                    <Form.List name="sub_career_data">
                      {(fields, { add, remove }) => (
                        <>
                          <div style={{ marginBottom: 4 }}>
                            <Typography.Text strong style={{ fontSize: 12 }}>Secondary Careers</Typography.Text>
                          </div>
                          <div style={{ maxHeight: '80px', overflowY: 'auto', overflowX: 'hidden', marginBottom: 8, paddingRight: 8 }}>
                            {fields.map((field) => (
                              <Row key={field.key} gutter={8} style={{ marginBottom: 4 }}>
                                <Col span={16}>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'career_id']}
                                    rules={[{ required: true, message: 'Select a secondary career' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Select placeholder="Select a secondary career" size="small">
                                      {subCareers.map(career => (
                                        <Select.Option key={career.id} value={career.id}>
                                          {career.name} (max. stage {career.max_stage})
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={5}>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'stage']}
                                    rules={[{ required: true, message: 'Select a stage' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber
                                      min={1}
                                      max={(() => {
                                        const careerId = editForm.getFieldValue(['sub_career_data', field.name, 'career_id']);
                                        const career = subCareers.find(c => c.id === careerId);
                                        return career?.max_stage || 10;
                                      })()}
                                      placeholder="Stage"
                                      style={{ width: '100%' }}
                                      size="small"
                                    />
                                  </Form.Item>
                                </Col>
                                <Col span={3}>
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    onClick={() => remove(field.name)}
                                  >
                                    Remove
                                  </Button>
                                </Col>
                              </Row>
                            ))}
                          </div>
                          <Button
                            type="dashed"
                            onClick={() => add({ career_id: undefined, stage: 1 })}
                            block
                            size="small"
                          >
                            + Add Secondary Career
                          </Button>
                        </>
                      )}
                    </Form.List>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Edit organization - name, type, and influence level */}
              <Row gutter={12}>
                <Col span={10}>
                  <Form.Item
                    label="Organization Name"
                    name="name"
                    rules={[{ required: true, message: 'Enter an organization name' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Organization name" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="Organization Type"
                    name="organization_type"
                    rules={[{ required: true, message: 'Enter an organization type' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="e.g., Order, guild, company, or academy" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    label="Influence Level"
                    name="power_level"
                    tooltip="A value from 0 to 100"
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              {/* Organization purpose */}
              <Form.Item
                label="Organization Purpose"
                name="organization_purpose"
                rules={[{ required: true, message: "Enter the organization's purpose" }]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Describe the organization's mission and goals..." />
              </Form.Item>

              {/* Key members (read-only) */}
              <Form.Item
                label="Key Members"
                name="organization_members"
                style={{ marginBottom: 4 }}
                tooltip="Member information is managed in Organization Management and displayed here."
              >
                <TextArea
                  disabled
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="No members yet. Add them in Organization Management."
                  style={{ color: token.colorText, backgroundColor: token.colorFillAlter }}
                />
              </Form.Item>
              <div style={{ marginBottom: 12, fontSize: 12, color: token.colorTextTertiary }}>
                💡 Go to Organization Management to add or manage members.
              </div>

              {/* Location and representative color */}
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Location" name="location" style={{ marginBottom: 12 }}>
                    <Input placeholder="Headquarters location" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Representative Color" name="color" style={{ marginBottom: 12 }}>
                    <Input placeholder="e.g., gold" />
                  </Form.Item>
                </Col>
              </Row>

              {/* Motto / slogan */}
              <Form.Item label="Motto / Slogan" name="motto" style={{ marginBottom: 12 }}>
                <Input placeholder="The organization's purpose, motto, or slogan" />
              </Form.Item>

              {/* Organization background */}
              <Form.Item label="Organization Background" name="background" style={{ marginBottom: 12 }}>
                <TextArea rows={2} placeholder="Describe the organization's backstory..." />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* Manual character/organization creation modal */}
      <Modal
        title={createType === 'character' ? 'Create Character' : 'Create Organization'}
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          createForm.resetFields();
        }}
        footer={null}
        centered
        width={isMobile ? '100%' : 700}
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={{
          body: {
            maxHeight: isMobile ? 'calc(100vh - 110px)' : 'calc(100vh - 200px)',
            overflowY: 'auto',
            overflowX: 'hidden'
          }
        }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateCharacter} style={{ marginTop: 8 }}>
          {createType === 'character' ? (
            <>
              {/* Character basics - name, role, age, and gender */}
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item
                    label="Character Name"
                    name="name"
                    rules={[{ required: true, message: 'Enter a character name' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Character name" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Role" name="role_type" initialValue="supporting" style={{ marginBottom: 12 }}>
                    <Select>
                      <Select.Option value="protagonist">Protagonist</Select.Option>
                      <Select.Option value="supporting">Supporting character</Select.Option>
                      <Select.Option value="antagonist">Antagonist</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="Age" name="age" style={{ marginBottom: 12 }}>
                    <Input placeholder="e.g., 25" />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label="Gender" name="gender" style={{ marginBottom: 12 }}>
                    <Select placeholder="Gender">
                      <Select.Option value={'\u7537'}>Male</Select.Option>
                      <Select.Option value={'\u5973'}>Female</Select.Option>
                      <Select.Option value={'\u5176\u4ed6'}>Other</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* Personality and appearance */}
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Personality" name="personality" style={{ marginBottom: 12 }}>
                    <TextArea rows={2} placeholder="Describe the character's personality..." />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Appearance" name="appearance" style={{ marginBottom: 12 }}>
                    <TextArea rows={2} placeholder="Describe the character's appearance..." />
                  </Form.Item>
                </Col>
              </Row>

              {/* Character background */}
              <Form.Item label="Character Background" name="background" style={{ marginBottom: 12 }}>
                <TextArea rows={2} placeholder="Describe the character's backstory..." />
              </Form.Item>

              {/* Career information - collapsible section */}
              {(mainCareers.length > 0 || subCareers.length > 0) && (
                <>
                  <Divider style={{ margin: '8px 0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Career Information (Optional)</Typography.Text>
                  </Divider>
                  {mainCareers.length > 0 && (
                    <Row gutter={12}>
                      <Col span={16}>
                        <Form.Item label="Primary Career" name="main_career_id" tooltip="The character's primary career" style={{ marginBottom: 12 }}>
                          <Select placeholder="Select a primary career" allowClear size="small">
                            {mainCareers.map(career => (
                              <Select.Option key={career.id} value={career.id}>
                                {career.name} (max. stage {career.max_stage})
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item label="Current Stage" name="main_career_stage" tooltip="The character's current stage in their primary career" style={{ marginBottom: 12 }}>
                          <InputNumber
                            min={1}
                            max={createForm.getFieldValue('main_career_id') ?
                              mainCareers.find(c => c.id === createForm.getFieldValue('main_career_id'))?.max_stage || 10
                              : 10}
                            style={{ width: '100%' }}
                            placeholder="Stage"
                            size="small"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  {subCareers.length > 0 && (
                    <Form.List name="sub_career_data">
                      {(fields, { add, remove }) => (
                        <>
                          <div style={{ marginBottom: 4 }}>
                            <Typography.Text strong style={{ fontSize: 12 }}>Secondary Careers</Typography.Text>
                          </div>
                          <div style={{ maxHeight: '80px', overflowY: 'auto', overflowX: 'hidden', marginBottom: 8, paddingRight: 8 }}>
                            {fields.map((field) => (
                              <Row key={field.key} gutter={8} style={{ marginBottom: 4 }}>
                                <Col span={16}>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'career_id']}
                                    rules={[{ required: true, message: 'Select a secondary career' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <Select placeholder="Select a secondary career" size="small">
                                      {subCareers.map(career => (
                                        <Select.Option key={career.id} value={career.id}>
                                          {career.name} (max. stage {career.max_stage})
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                </Col>
                                <Col span={5}>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'stage']}
                                    rules={[{ required: true, message: 'Select a stage' }]}
                                    style={{ marginBottom: 0 }}
                                  >
                                    <InputNumber
                                      min={1}
                                      max={(() => {
                                        const careerId = createForm.getFieldValue(['sub_career_data', field.name, 'career_id']);
                                        const career = subCareers.find(c => c.id === careerId);
                                        return career?.max_stage || 10;
                                      })()}
                                      placeholder="Stage"
                                      style={{ width: '100%' }}
                                      size="small"
                                    />
                                  </Form.Item>
                                </Col>
                                <Col span={3}>
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    onClick={() => remove(field.name)}
                                  >
                                    Remove
                                  </Button>
                                </Col>
                              </Row>
                            ))}
                          </div>
                          <Button
                            type="dashed"
                            onClick={() => add({ career_id: undefined, stage: 1 })}
                            block
                            size="small"
                          >
                            + Add Secondary Career
                          </Button>
                        </>
                      )}
                    </Form.List>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Organization basics - name, type, and influence level */}
              <Row gutter={12}>
                <Col span={10}>
                  <Form.Item
                    label="Organization Name"
                    name="name"
                    rules={[{ required: true, message: 'Enter an organization name' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Organization name" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="Organization Type"
                    name="organization_type"
                    rules={[{ required: true, message: 'Enter an organization type' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="e.g., Order, guild, company, or academy" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item
                    label="Influence Level"
                    name="power_level"
                    initialValue={50}
                    tooltip="A value from 0 to 100"
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber min={0} max={100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              {/* Organization purpose */}
              <Form.Item
                label="Organization Purpose"
                name="organization_purpose"
                rules={[{ required: true, message: "Enter the organization's purpose" }]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Describe the organization's mission and goals..." />
              </Form.Item>

              {/* Location and representative color */}
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Location" name="location" style={{ marginBottom: 12 }}>
                    <Input placeholder="Headquarters location" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Representative Color" name="color" style={{ marginBottom: 12 }}>
                    <Input placeholder="e.g., gold" />
                  </Form.Item>
                </Col>
              </Row>

              {/* Motto / slogan */}
              <Form.Item label="Motto / Slogan" name="motto" style={{ marginBottom: 12 }}>
                <Input placeholder="The organization's purpose, motto, or slogan" />
              </Form.Item>

              {/* Organization background */}
              <Form.Item label="Organization Background" name="background" style={{ marginBottom: 12 }}>
                <TextArea rows={2} placeholder="Describe the organization's backstory..." />
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                createForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Import dialog */}
      <Modal
        title="Import Characters/Organizations"
        open={isImportModalOpen}
        onCancel={() => setIsImportModalOpen(false)}
        footer={null}
        width={500}
        centered
      >
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <DownloadOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
          <p style={{ fontSize: 16, marginBottom: 24 }}>
            Select a previously exported character/organization JSON file to import.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileSelect(file);
                e.target.value = ''; // Clear the input so the same file can be selected again.
              }
            }}
          />
          <Button
            type="primary"
            size="large"
            icon={<ImportOutlined />}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose File
          </Button>
          <Divider />
          <div style={{ textAlign: 'left', fontSize: 12, color: '#666' }}>
            <p style={{ marginBottom: 8 }}><strong>Notes:</strong></p>
            <ul style={{ marginLeft: 20 }}>
              <li>Import character/organization files in .json format.</li>
              <li>Characters and organizations with duplicate names will be skipped.</li>
              <li>Career information will be ignored if the career does not exist.</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* SSE progress */}
      <SSELoadingOverlay
        loading={isGenerating}
        progress={progress}
        message={progressMessage}
      />
    </div>
  );
}