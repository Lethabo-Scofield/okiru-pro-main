import { SearchClient, SearchIndexClient, AzureKeyCredential } from '@azure/search-documents';
import { createLogger } from '../logger.js';

const logger = createLogger('AzureSearch');

export interface CertificateSearchDocument {
  id: string;
  document_id: string;
  user_id: string;
  file_name: string;
  content: string;
  file_url: string;
}

export interface SearchResult {
  file_name: string;
  file_url: string;
  snippet: string;
}

function getConfig() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_API_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME;

  if (!endpoint || !apiKey || !indexName) {
    return null;
  }

  return { endpoint, apiKey, indexName };
}

export function isAzureSearchConfigured(): boolean {
  return getConfig() !== null;
}

export function getSearchClient(): SearchClient<CertificateSearchDocument> | null {
  const config = getConfig();
  if (!config) {
    logger.warn('Azure AI Search not configured — AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, or AZURE_SEARCH_INDEX_NAME missing');
    return null;
  }

  return new SearchClient<CertificateSearchDocument>(
    config.endpoint,
    config.indexName,
    new AzureKeyCredential(config.apiKey)
  );
}

export function getSearchIndexClient(): SearchIndexClient | null {
  const config = getConfig();
  if (!config) return null;

  return new SearchIndexClient(
    config.endpoint,
    new AzureKeyCredential(config.apiKey)
  );
}

export async function searchCertificates(
  query: string,
  userId?: string
): Promise<SearchResult[]> {
  const client = getSearchClient();
  if (!client) {
    throw new Error('Azure AI Search is not configured');
  }

  const sanitizedUserId = userId ? userId.replace(/'/g, "''") : undefined;
  const filter = sanitizedUserId ? `user_id eq '${sanitizedUserId}'` : undefined;

  const searchResults = await client.search(query, {
    filter,
    top: 100,
    includeTotalCount: true,
    highlightFields: 'content',
    highlightPreTag: '',
    highlightPostTag: '',
  });

  const grouped = new Map<string, SearchResult>();

  for await (const result of searchResults.results) {
    const doc = result.document;
    const fileKey = doc.document_id || doc.file_name;

    if (!grouped.has(fileKey)) {
      const highlights = result.highlights?.content;
      const snippet = highlights && highlights.length > 0
        ? highlights[0]
        : (doc.content || '').substring(0, 200);

      grouped.set(fileKey, {
        file_name: doc.file_name,
        file_url: doc.document_id,
        snippet,
      });
    }
  }

  return Array.from(grouped.values());
}

export async function ensureIndex(): Promise<void> {
  const indexClient = getSearchIndexClient();
  const config = getConfig();
  if (!indexClient || !config) {
    throw new Error('Azure AI Search is not configured');
  }

  const indexDefinition = {
    name: config.indexName,
    fields: [
      { name: 'id', type: 'Edm.String' as const, key: true, filterable: true },
      { name: 'document_id', type: 'Edm.String' as const, filterable: true, searchable: true },
      { name: 'user_id', type: 'Edm.String' as const, filterable: true },
      { name: 'file_name', type: 'Edm.String' as const, filterable: true, searchable: true },
      { name: 'content', type: 'Edm.String' as const, searchable: true },
      { name: 'file_url', type: 'Edm.String' as const, filterable: false, searchable: false },
    ],
  };

  try {
    const existing = await indexClient.getIndex(config.indexName);
    const existingFieldNames = existing.fields.map(f => f.name);
    const requiredFields = indexDefinition.fields.map(f => f.name);
    const missingFields = requiredFields.filter(f => !existingFieldNames.includes(f));

    if (missingFields.length > 0) {
      logger.info('Index exists but missing fields — recreating', { indexName: config.indexName, missingFields });
      await indexClient.deleteIndex(config.indexName);
      await indexClient.createIndex(indexDefinition);
      logger.info('Search index recreated with updated schema', { indexName: config.indexName });
    } else {
      logger.info('Search index already exists with correct schema', { indexName: config.indexName });
    }
  } catch {
    logger.info('Creating search index', { indexName: config.indexName });
    await indexClient.createIndex(indexDefinition);
    logger.info('Search index created successfully', { indexName: config.indexName });
  }
}

export async function uploadDocuments(
  documents: CertificateSearchDocument[]
): Promise<void> {
  const client = getSearchClient();
  if (!client) {
    throw new Error('Azure AI Search is not configured');
  }

  const batchSize = 1000;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await client.uploadDocuments(batch);
    logger.info('Uploaded batch to search index', { batch: Math.floor(i / batchSize) + 1, count: batch.length });
  }
}
