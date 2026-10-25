import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  InputNumber,
  List,
  Row,
  Space,
  Spin,
  Statistic,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
  theme,
} from 'antd';
import {
  DatabaseOutlined,
  DeleteOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import type { UploadProps } from 'antd';
import { knowledgeApi } from '../services/api';
import type { KnowledgeBase, KnowledgeDocument, KnowledgeSearchHit } from '../types';
import './KnowledgeBase.css';

const { Dragger } = Upload;
const { Text, Paragraph, Title } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'default' },
  parsing: { label: 'Parsing', color: 'processing' },
  embedding: { label: 'Generating vectors', color: 'processing' },
  ready: { label: 'Completed', color: 'success' },
  failed: { label: 'Processing failed', color: 'error' },
};

const parseHeadingPath = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(' / ');
  if (!value) return '';
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).join(' / ') : String(value);
  } catch {
    return String(value);
  }
};

export default function KnowledgeBasePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { token } = theme.useToken();
  const [base, setBase] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [retrievalEnabled, setRetrievalEnabled] = useState(true);
  const [topK, setTopK] = useState(8);
  const [minScore, setMinScore] = useState(0.25);
  const [maxContextChars, setMaxContextChars] = useState(6000);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const bases = await knowledgeApi.listBases(projectId);
      let current = bases.items[0];
      if (!current) {
        current = (await knowledgeApi.createBase(projectId, {
          name: 'Project knowledge base',
          description: 'Stores reference materials and setting documents for this project.',
        })).item;
      }
      setBase(current);
      setRetrievalEnabled(current.settings?.retrieval_enabled ?? true);
      setTopK(current.settings?.top_k ?? 8);
      setMinScore(current.settings?.min_score ?? 0.25);
      setMaxContextChars(current.settings?.max_context_chars ?? 6000);
      setDocuments((await knowledgeApi.listDocuments(current.id)).items);
    } catch (error) {
      console.error('Failed to load knowledge base', error);
      message.error('Failed to load the knowledge base. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!documents.some((item) => ['pending', 'parsing', 'embedding'].includes(item.status))) return;
    const timer = window.setInterval(() => { void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [documents, load]);

  const uploadProps: UploadProps = useMemo(() => ({
    multiple: true,
    accept: '.txt,.md,.markdown,.json',
    showUploadList: false,
    beforeUpload: async (file) => {
      if (!base) return false;
      try {
        await knowledgeApi.uploadDocument(base.id, file);
        message.success(`${file.name} has been added to the indexing queue`);
        await load();
      } catch (error) {
        console.error('Failed to upload knowledge base document', error);
        message.error(error instanceof Error ? error.message : 'Upload failed. Please check the file format and size.');
      }
      return false;
    },
  }), [base, load]);

  const saveRetrievalSettings = async () => {
    if (!base) return;
    setSavingSettings(true);
    try {
      const response = await knowledgeApi.updateBase(base.id, {
        settings: {
          retrieval_enabled: retrievalEnabled,
          top_k: topK,
          min_score: minScore,
          max_context_chars: maxContextChars,
        },
      });
      setBase(response.item);
      message.success('Retrieval parameters saved');
    } catch (error) {
      console.error('Failed to save retrieval parameters', error);
      message.error('Failed to save retrieval parameters. Please try again later.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSearch = async () => {
    if (!base || !query.trim()) return;
    setSearching(true);
    try {
      setHits((await knowledgeApi.search(base.id, { query: query.trim(), top_k: topK, min_score: minScore })).items);
    } catch (error) {
      console.error('Knowledge base search failed', error);
      message.error('Search failed. Please try again later.');
    } finally {
      setSearching(false);
    }
  };

  const remove = async (document: KnowledgeDocument) => {
    try {
      await knowledgeApi.deleteDocument(document.id);
      message.success('Document deleted');
      await load();
    } catch (error) {
      console.error('Failed to delete knowledge base document', error);
      message.error('Deletion failed. Please try again later.');
    }
  };

  const reindex = async (document: KnowledgeDocument) => {
    try {
      await knowledgeApi.reindexDocument(document.id);
      message.success('Added back to the indexing queue');
      await load();
    } catch (error) {
      console.error('Failed to rebuild the knowledge base index', error);
      message.error('Reindexing failed. Please try again later.');
    }
  };

  if (loading && !base) {
    return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  }

  return (
    <div className="knowledge-base-page">
      <div
        style={{
          backgroundColor: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <Flex align="center" gap={12} style={{ minWidth: 0 }}>
            <DatabaseOutlined style={{ fontSize: 26, color: token.colorPrimary, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <Title level={2} style={{ margin: 0, lineHeight: 1.2 }}>
                {base?.name || 'Local knowledge base'}
              </Title>
              <Text type="secondary">
                Upload project reference materials. AI will use them when writing or retrieving chapter content.
              </Text>
            </div>
          </Flex>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </Flex>
      </div>

      <div className="knowledge-base-main">
        {base && (
          <Card size="small" className="knowledge-base-summary">
            <Row gutter={[16, 12]}>
              <Col xs={12} sm={8}>
                <Statistic title="Documents" value={base.document_count} suffix="files" />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic title="Text chunks" value={base.chunk_count} suffix="chunks" />
              </Col>
              <Col xs={24} sm={8}>
                <Statistic title="Index method" value="Local vector" valueStyle={{ fontSize: 20, color: token.colorPrimary }} />
              </Col>
            </Row>
          </Card>
        )}

        <div className="knowledge-base-panels">
          <div className="knowledge-base-panel">
            <Card
              className="knowledge-base-panel-card"
              title={<Space><InboxOutlined />Document management<Tag>{documents.length}</Tag></Space>}
              extra={<Button type="text" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} />}
            >
              <Dragger {...uploadProps} style={{ marginBottom: 18 }}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">Click or drag files here to upload</p>
                <p className="ant-upload-hint">Supports batch uploads; max 20MB per file</p>
              </Dragger>
              <List
                className="knowledge-base-document-list"
                dataSource={documents}
                split
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents yet" /> }}
                renderItem={(document) => {
                  const status = statusMap[document.status] || statusMap.pending;
                  return (
                    <List.Item
                      actions={[
                        document.status === 'failed' || document.status === 'ready'
                          ? <Button key="reindex" type="link" size="small" onClick={() => void reindex(document)}>Rebuild index</Button>
                          : null,
                        <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => void remove(document)} />,
                      ].filter(Boolean)}
                    >
                      <List.Item.Meta
                        title={<Space wrap>{document.title}<Tag color={status.color}>{status.label}</Tag></Space>}
                        description={(
                          <Space direction="vertical" size={0}>
                            <Text type="secondary">{document.original_filename}</Text>
                            <Text type="secondary">
                              {document.chunk_count} text chunks · {document.extracted_char_count.toLocaleString()} characters
                            </Text>
                            {document.error_message && <Text type="danger">{document.error_message}</Text>}
                          </Space>
                        )}
                      />
                    </List.Item>
                  );
                }}
              />
            </Card>
          </div>

          <div className="knowledge-base-panel">
            <Card
              className="knowledge-base-panel-card"
              title={<Space><SearchOutlined />Knowledge search</Space>}
            >
              <Flex gap={8} wrap="wrap" align="center" style={{ marginBottom: 12 }}>
                <Text type="secondary">Auto-inject</Text>
                <Switch size="small" checked={retrievalEnabled} onChange={setRetrievalEnabled} />
                <Text type="secondary">Recall count</Text>
                <InputNumber min={1} max={30} value={topK} onChange={(value) => setTopK(value ?? 8)} />
                <Text type="secondary">Minimum match score</Text>
                <InputNumber min={0} max={1} step={0.05} precision={2} value={minScore} onChange={(value) => setMinScore(value ?? 0.25)} />
                <Text type="secondary">Context cap</Text>
                <InputNumber min={1000} max={20000} step={500} value={maxContextChars} onChange={(value) => setMaxContextChars(value ?? 6000)} />
                <Button size="small" loading={savingSettings} onClick={() => void saveRetrievalSettings()}>Save settings</Button>
              </Flex>
              <Input.Search
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onSearch={() => void handleSearch()}
                loading={searching}
                enterButton="Search"
                placeholder="For example: What rules must the protagonist follow when entering the forbidden land?"
                size="large"
              />
              <List
                className="knowledge-base-search-list"
                itemLayout="vertical"
                dataSource={hits}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? 'No matching content' : 'Enter a question to begin searching'} /> }}
                renderItem={(hit) => {
                  const metadata = hit.metadata || {};
                  const heading = parseHeadingPath(metadata.heading_path);
                  return (
                    <List.Item style={{ paddingInline: 0 }}>
                      <div
                        style={{
                          width: '100%',
                          padding: 14,
                          background: token.colorFillAlter,
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: token.borderRadius,
                        }}
                      >
                        <Flex gap={8} wrap="wrap" align="center" style={{ marginBottom: 8 }}>
                          <Tag color="blue">Match {(hit.score * 100).toFixed(0)}%</Tag>
                          <Text strong>{metadata.original_filename || metadata.title || 'Knowledge base document'}</Text>
                          {heading && <Text type="secondary">{heading}</Text>}
                        </Flex>
                        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{hit.content}</Paragraph>
                      </div>
                    </List.Item>
                  );
                }}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
