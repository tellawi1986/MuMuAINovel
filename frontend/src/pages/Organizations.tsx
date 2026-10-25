import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, message, Modal, Form, Select, InputNumber, Input, Descriptions, Drawer, theme } from 'antd';
import { PlusOutlined, UserOutlined, EditOutlined, DeleteOutlined, UnorderedListOutlined, BankOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { useCharacterSync } from '../store/hooks';
import axios from 'axios';
import { eventBus, EventNames } from '../store/eventBus';

interface Organization {
  id: string;
  character_id: string;
  name: string;
  type: string;
  purpose: string;
  member_count: number;
  power_level: number;
  location?: string;
  motto?: string;
  color?: string;
}

interface OrganizationMember {
  id: string;
  character_id: string;
  character_name: string;
  position: string;
  rank: number;
  loyalty: number;
  contribution: number;
  status: string;
  joined_at?: string;
  left_at?: string;
  notes?: string;
}

interface Character {
  id: string;
  name: string;
  is_organization: boolean;
}

export default function Organizations() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentProject } = useStore();
  const { refreshCharacters } = useCharacterSync();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isEditMemberModalOpen, setIsEditMemberModalOpen] = useState(false);
  const [isEditOrgModalOpen, setIsEditOrgModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [form] = Form.useForm();
  const [editMemberForm] = Form.useForm();
  const [editOrgForm] = Form.useForm();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [modal, contextHolder] = Modal.useModal();
  const [orgListVisible, setOrgListVisible] = useState(false);
  const { token } = theme.useToken();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/organizations/project/${projectId}`);
      setOrganizations(res.data);
      if (res.data.length > 0 && !selectedOrg) {
        setSelectedOrg(res.data[0]);
        loadMembers(res.data[0].id);
      }
    } catch (error) {
      message.error('Failed to load organizations');
      console.error(error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadCharacters = useCallback(async () => {
    try {
      const res = await axios.get(`/api/characters?project_id=${projectId}`);
      setCharacters(res.data.items || []);
    } catch (error) {
      console.error('Failed to load characters', error);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadOrganizations();
      loadCharacters();
    }
  }, [projectId, loadOrganizations, loadCharacters]);

  useEffect(() => {
    const handleTaskSettled = (payload?: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { projectId?: string; resources?: string[] };
      if (data.projectId && data.projectId !== projectId) return;
      if (!data.resources?.includes('organizations')) return;
      void loadOrganizations();
      void loadCharacters();
      if (selectedOrg?.id) void loadMembers(selectedOrg.id);
    };
    eventBus.on(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
    return () => eventBus.off(EventNames.BACKGROUND_TASK_SETTLED, handleTaskSettled);
  }, [loadCharacters, loadOrganizations, projectId, selectedOrg?.id]);

  const loadMembers = async (orgId: string) => {
    try {
      const res = await axios.get(`/api/organizations/${orgId}/members`);
      setMembers(res.data);
    } catch (error) {
      message.error('Failed to load members');
      console.error(error);
    }
  };

  const handleSelectOrganization = (org: Organization) => {
    setSelectedOrg(org);
    loadMembers(org.id);
  };

  const handleAddMember = async (values: Record<string, unknown>) => {
    if (!selectedOrg) return;

    try {
      await axios.post(`/api/organizations/${selectedOrg.id}/members`, values);
      message.success('Member added successfully');
      setIsAddMemberModalOpen(false);
      form.resetFields();
      loadMembers(selectedOrg.id);
      loadOrganizations(); // Refresh member counts.
    } catch (error) {
      message.error('Failed to add member');
      console.error(error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    modal.confirm({
      title: 'Confirm removal',
      content: 'Are you sure you want to remove this member?',
      centered: true,
      okText: 'Remove',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await axios.delete(`/api/organizations/members/${memberId}`);
          message.success('Member removed successfully');
          if (selectedOrg) {
            loadMembers(selectedOrg.id);
            loadOrganizations(); // Refresh member counts.
          }
        } catch (error) {
          message.error('Failed to remove member');
          console.error(error);
        }
      }
    });
  };

  const handleEditMember = (member: OrganizationMember) => {
    setEditingMember(member);
    editMemberForm.setFieldsValue({
      position: member.position,
      rank: member.rank,
      loyalty: member.loyalty,
      contribution: member.contribution,
      status: member.status,
      notes: member.notes,
      joined_at: member.joined_at
    });
    setIsEditMemberModalOpen(true);
  };

  const handleUpdateMember = async (values: Record<string, unknown>) => {
    if (!editingMember) return;

    try {
      await axios.put(`/api/organizations/members/${editingMember.id}`, values);
      message.success('Member information updated successfully');
      setIsEditMemberModalOpen(false);
      editMemberForm.resetFields();
      setEditingMember(null);
      if (selectedOrg) {
        loadMembers(selectedOrg.id);
      }
    } catch (error) {
      message.error('Update failed');
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'green',
      retired: 'default',
      expelled: 'red',
      deceased: 'black'
    };
    return colors[status] || 'default';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      active: 'Active',
      retired: 'Retired',
      expelled: 'Expelled',
      deceased: 'Deceased'
    };
    return texts[status] || status;
  };

  const memberColumns = [
    {
      title: 'Name',
      dataIndex: 'character_name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <span>{name}</span>
        </Space>
      ),
      width: isMobile ? 100 : undefined,
    },
    {
      title: 'Position',
      dataIndex: 'position',
      key: 'position',
      render: (position: string, record: OrganizationMember) => (
        <Tag color="blue">{position} {!isMobile && `(Rank ${record.rank})`}</Tag>
      ),
      width: isMobile ? 120 : undefined,
    },
    {
      title: 'Loyalty',
      dataIndex: 'loyalty',
      key: 'loyalty',
      render: (loyalty: number) => (
        <span style={{ color: loyalty >= 70 ? 'green' : loyalty >= 40 ? 'orange' : 'red' }}>
          {loyalty}%
        </span>
      ),
      width: isMobile ? 80 : undefined,
    },
    {
      title: 'Contribution',
      dataIndex: 'contribution',
      key: 'contribution',
      render: (contribution: number) => `${contribution}%`,
      width: isMobile ? 80 : undefined,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
      width: isMobile ? 80 : undefined,
    },
    {
      title: 'Joined',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (time: string) => time || '-',
      width: isMobile ? 120 : undefined,
    },
    {
      title: 'Actions',
      key: 'action',
      render: (_: unknown, record: OrganizationMember) => (
        <Space size={isMobile ? 0 : 'small'}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditMember(record)}
            style={isMobile ? { padding: '4px' } : undefined}
          >
            {isMobile ? '' : 'Edit'}
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveMember(record.id)}
            style={isMobile ? { padding: '4px' } : undefined}
          >
            {isMobile ? '' : 'Remove'}
          </Button>
        </Space>
      ),
      width: isMobile ? 50 : undefined,
      fixed: isMobile ? 'right' as const : undefined,
    },
  ];

  // Filter out characters who are already members.
  const availableCharacters = characters.filter(
    c => !c.is_organization && !members.some(m => m.character_id === c.id)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {contextHolder}
      
      {/* Page title - desktop only */}
      {!isMobile && (
        <div style={{
          padding: '16px 0',
          marginBottom: 16,
          borderBottom: `1px solid ${token.colorBorderSecondary}`
        }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>
            <BankOutlined style={{ marginRight: 8 }} />
            Organization Management
          </h2>
        </div>
      )}
      
      <div style={{
        flex: 1,
        display: 'flex',
        gap: isMobile ? 0 : 16,
        flexDirection: isMobile ? 'column' : 'row',
        overflow: 'hidden'
      }}>
        {/* Organization list - desktop */}
        {!isMobile && (
        <Card
          title={`Organizations (${organizations.length})`}
          style={{ width: 300, height: '100%', overflow: 'hidden' }}
          bodyStyle={{ padding: 0, height: 'calc(100% - 57px)', overflow: 'auto' }}
          loading={loading}
        >
          {organizations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: token.colorTextTertiary }}>
              No organizations yet
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%', padding: '12px' }}>
              {organizations.map(org => (
                <Card
                  key={org.id}
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    border: selectedOrg?.id === org.id ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                    background: selectedOrg?.id === org.id ? token.colorPrimaryBg : 'transparent'
                  }}
                  onClick={() => handleSelectOrganization(org)}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <strong style={{ fontSize: 14 }}>{org.name}</strong>
                    <Tag color="blue">{org.type}</Tag>
                    <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                      Members: {org.member_count} | Influence: {org.power_level}
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Card>
        )}

        {/* Organization list drawer - mobile */}
      {isMobile && (
        <Drawer
          title="Organizations"
          placement="left"
          onClose={() => setOrgListVisible(false)}
          open={orgListVisible}
          width="85%"
          styles={{ body: { padding: 0 } }}
        >
          {organizations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: token.colorTextTertiary }}>
              No organizations yet
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%', padding: '12px' }}>
              {organizations.map(org => (
                <Card
                  key={org.id}
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    border: selectedOrg?.id === org.id ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                    background: selectedOrg?.id === org.id ? token.colorPrimaryBg : 'transparent'
                  }}
                  onClick={() => {
                    handleSelectOrganization(org);
                    setOrgListVisible(false);
                  }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <strong style={{ fontSize: 14 }}>{org.name}</strong>
                    <Tag color="blue">{org.type}</Tag>
                    <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                      Members: {org.member_count} | Influence: {org.power_level}
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Drawer>
        )}

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {!selectedOrg ? (
          <Card style={{ height: '100%' }}>
            <div style={{ textAlign: 'center', padding: '100px 20px', color: token.colorTextTertiary }}>
              {isMobile && organizations.length > 0 && (
                <Button
                  type="primary"
                  icon={<UnorderedListOutlined />}
                  onClick={() => setOrgListVisible(true)}
                  style={{ marginBottom: 20 }}
                >
                  Select an organization
                </Button>
              )}
              <div>Select an organization to view its details</div>
            </div>
          </Card>
        ) : (
          <>
            {/* Toolbar - shows the project title and organization list button on mobile */}
            {isMobile && (
              <Card size="small" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <BankOutlined />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      Organization Management
                    </span>
                    <Tag color="blue">{currentProject?.title}</Tag>
                  </Space>
                  <Button
                    icon={<UnorderedListOutlined />}
                    onClick={() => setOrgListVisible(true)}
                    size="small"
                  >
                    List
                  </Button>
                </div>
              </Card>
            )}

            {/* Content area */}
            <div style={{
              flex: 1,
              display: 'flex',
              gap: isMobile ? 0 : 16,
              overflow: 'hidden'
            }}>
              <Card
                style={{ flex: 1, overflow: 'auto' }}
                bodyStyle={{ padding: isMobile ? '12px' : '24px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={isMobile ? 'middle' : 'large'}>
                <Card
                  title="Organization Details"
                  size="small"
                  extra={
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        editOrgForm.setFieldsValue({
                          power_level: selectedOrg.power_level,
                          location: selectedOrg.location,
                          motto: selectedOrg.motto,
                          color: selectedOrg.color
                        });
                        setIsEditOrgModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  }
                >
                  <Descriptions column={isMobile ? 1 : 2} size="small">
                    <Descriptions.Item label="Organization Name">{selectedOrg.name}</Descriptions.Item>
                    <Descriptions.Item label="Type">{selectedOrg.type}</Descriptions.Item>
                    <Descriptions.Item label="Member Count">{selectedOrg.member_count}</Descriptions.Item>
                    <Descriptions.Item label="Influence Level">
                      <Tag color={selectedOrg.power_level >= 70 ? 'red' : selectedOrg.power_level >= 50 ? 'orange' : 'default'}>
                        {selectedOrg.power_level}
                      </Tag>
                    </Descriptions.Item>
                    {selectedOrg.location && (
                      <Descriptions.Item label="Location" span={isMobile ? 1 : 2}>
                        {selectedOrg.location}
                      </Descriptions.Item>
                    )}
                    {selectedOrg.color && (
                      <Descriptions.Item label="Representative Color">
                        {selectedOrg.color}
                      </Descriptions.Item>
                    )}
                    {selectedOrg.motto && (
                      <Descriptions.Item label="Motto / Slogan" span={2}>
                        {selectedOrg.motto}
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label="Organization Purpose" span={2}>
                      {selectedOrg.purpose}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <Card
                  title={`Organization Members (${members.length})`}
                  extra={
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => setIsAddMemberModalOpen(true)}
                      disabled={availableCharacters.length === 0}
                    >
                      Add Member
                    </Button>
                  }
                >
                  <Table
                    columns={memberColumns}
                    dataSource={members}
                    rowKey="id"
                    pagination={
                      members.length > 5
                        ? {
                          defaultPageSize: 5,
                          showSizeChanger: true,
                          showQuickJumper: !isMobile,
                          showTotal: (total) => `${total} members`,
                          pageSizeOptions: [5, 10, 20],
                          simple: isMobile,
                          position: ['bottomCenter'],
                        }
                        : false
                    }
                    size="small"
                    scroll={{
                      x: isMobile ? 'max-content' : undefined,
                      y: members.length > 10 ? 500 : undefined,
                    }}
                  />
                </Card>
                </Space>
              </Card>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Add member modal */}
      <Modal
        title="Add Organization Member"
        open={isAddMemberModalOpen}
        onCancel={() => {
          setIsAddMemberModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        centered={!isMobile}
        width={isMobile ? '100%' : 500}
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' } } : undefined}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddMember}
        >
          <Form.Item
            name="character_id"
            label="Select Character"
            rules={[{ required: true, message: 'Select a character' }]}
          >
            <Select
              placeholder="Select a character to add"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={availableCharacters.map(c => ({
                label: c.name,
                value: c.id
              }))}
            />
          </Form.Item>

          <Form.Item
            name="position"
            label="Position"
            rules={[{ required: true, message: 'Enter a position' }]}
          >
            <Input placeholder="e.g., Leader, Elder, Member" />
          </Form.Item>

          <Form.Item
            name="rank"
            label="Position Rank"
            initialValue={5}
            tooltip="Higher numbers indicate a higher rank"
          >
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="loyalty"
            label="Initial Loyalty"
            initialValue={50}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            initialValue="active"
          >
            <Select>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="retired">Retired</Select.Option>
              <Select.Option value="expelled">Expelled</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="joined_at"
            label="Joined"
          >
            <Input placeholder="e.g., At the founding, three years ago, or when the organization was created" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsAddMemberModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Add
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit member modal */}
      <Modal
        title="Edit Member Information"
        open={isEditMemberModalOpen}
        onCancel={() => {
          setIsEditMemberModalOpen(false);
          editMemberForm.resetFields();
          setEditingMember(null);
        }}
        footer={null}
        centered={true}
        width={isMobile ? '90%' : 500}
        style={isMobile ? {
          maxWidth: '90vw',
          margin: '0 auto'
        } : undefined}
        styles={isMobile ? {
          body: {
            maxHeight: 'calc(80vh - 110px)',
            overflowY: 'auto',
            padding: '20px 16px'
          }
        } : undefined}
      >
        <Form
          form={editMemberForm}
          layout="vertical"
          onFinish={handleUpdateMember}
        >
          <Form.Item
            name="position"
            label="Position"
            rules={[{ required: true, message: 'Enter a position' }]}
          >
            <Input placeholder="e.g., Leader, Elder, Member" />
          </Form.Item>

          <Form.Item
            name="rank"
            label="Position Rank"
            tooltip="Higher numbers indicate a higher rank"
          >
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="loyalty"
            label="Loyalty"
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>

          <Form.Item
            name="contribution"
            label="Contribution"
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
          >
            <Select>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="retired">Retired</Select.Option>
              <Select.Option value="expelled">Expelled</Select.Option>
              <Select.Option value="deceased">Deceased</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="joined_at"
            label="Joined"
          >
            <Input placeholder="e.g., At the founding, three years ago, or when the organization was created" />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={3} placeholder="Notes about this member" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsEditMemberModalOpen(false);
                editMemberForm.resetFields();
                setEditingMember(null);
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit organization modal */}
      <Modal
        title="Edit Organization Information"
        open={isEditOrgModalOpen}
        onCancel={() => {
          setIsEditOrgModalOpen(false);
          editOrgForm.resetFields();
        }}
        footer={null}
        centered={!isMobile}
        width={isMobile ? '100%' : 500}
        style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
        styles={isMobile ? { body: { maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' } } : undefined}
      >
        <Form
          form={editOrgForm}
          layout="vertical"
          onFinish={async (values) => {
            if (!selectedOrg) return;
            try {
              await axios.put(`/api/organizations/${selectedOrg.id}`, values);
              message.success('Organization information updated successfully');
              setIsEditOrgModalOpen(false);
              editOrgForm.resetFields();

              // Reload the updated organization list.
              const res = await axios.get(`/api/organizations/project/${projectId}`);
              setOrganizations(res.data);

              // Update the selected organization's details.
              const updatedOrg = res.data.find((org: Organization) => org.id === selectedOrg.id);
              if (updatedOrg) {
                setSelectedOrg(updatedOrg);
              }

              // Refresh the global store.
              await refreshCharacters();
            } catch (error) {
              message.error('Update failed');
              console.error(error);
            }
          }}
        >
          <Form.Item
            name="power_level"
            label="Influence Level"
            rules={[{ required: true, message: 'Enter an influence level' }]}
            tooltip="A value from 0 to 100 representing the organization's influence"
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="location"
            label="Location"
          >
            <Input placeholder="The organization's main area of operation or headquarters" />
          </Form.Item>

          <Form.Item
            name="motto"
            label="Motto / Slogan"
          >
            <Input placeholder="The organization's purpose, motto, or slogan" />
          </Form.Item>

          <Form.Item
            name="color"
            label="Representative Color"
          >
            <Input placeholder="e.g., crimson, gold, or black" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsEditOrgModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
