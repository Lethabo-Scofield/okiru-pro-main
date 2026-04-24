/**
 * Azure OpenAI Client — Two-Tier Model Strategy
 *
 * Premium tier (GPT-4o): classification, table extraction, vision, inference
 * Fast tier (GPT-4o-mini): entity extraction, verification, reranking
 * Embeddings: text-embedding-3-small for semantic search
 */

import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { createLogger } from '../../src/logger.js';

dotenv.config();

const logger = createLogger('AzureOpenAI');

// Azure OpenAI configuration from environment
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const AZURE_OPENAI_FAST_DEPLOYMENT = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || AZURE_OPENAI_DEPLOYMENT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

logger.info('Config loaded', { premium: AZURE_OPENAI_DEPLOYMENT, fast: AZURE_OPENAI_FAST_DEPLOYMENT, embeddings: AZURE_OPENAI_EMBEDDING_DEPLOYMENT });

// Embedding dimensions for text-embedding-3-small
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Premium chat client (GPT-4o) — classification, table extraction, vision, inference
 */
export function getAzureChatClient(): OpenAI | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    logger.warn('Missing configuration - AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY not set');
    return null;
  }

  return new OpenAI({
    apiKey: AZURE_OPENAI_API_KEY,
    baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}`,
    defaultQuery: { 'api-version': AZURE_OPENAI_API_VERSION },
    defaultHeaders: { 'api-key': AZURE_OPENAI_API_KEY },
  });
}

/**
 * Fast chat client (GPT-4o-mini) — entity extraction, verification, reranking
 * Falls back to premium deployment if AZURE_OPENAI_FAST_DEPLOYMENT is not set.
 */
export function getAzureFastChatClient(): OpenAI | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: AZURE_OPENAI_API_KEY,
    baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_FAST_DEPLOYMENT}`,
    defaultQuery: { 'api-version': AZURE_OPENAI_API_VERSION },
    defaultHeaders: { 'api-key': AZURE_OPENAI_API_KEY },
  });
}

/**
 * Get Azure OpenAI embeddings client
 */
export function getAzureEmbeddingClient(): OpenAI | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    logger.warn('Missing configuration - AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY not set');
    return null;
  }

  return new OpenAI({
    apiKey: AZURE_OPENAI_API_KEY,
    baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_EMBEDDING_DEPLOYMENT}`,
    defaultQuery: { 'api-version': AZURE_OPENAI_API_VERSION },
    defaultHeaders: { 'api-key': AZURE_OPENAI_API_KEY },
  });
}

/**
 * Check if Azure OpenAI is configured and available
 */
export function isAzureOpenAIConfigured(): boolean {
  return !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY);
}

/**
 * Generate embeddings for an array of texts
 * Uses text-embedding-3-small (1536 dimensions)
 */
export async function generateEmbeddings(
  texts: string[],
  options?: {
    batchSize?: number;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<number[][]> {
  const client = getAzureEmbeddingClient();
  if (!client) {
    throw new Error('Azure OpenAI embeddings client not configured');
  }

  const batchSize = options?.batchSize || 100;
  const embeddings: number[][] = [];

  // text-embedding-3-small has 8192 token limit (~4 chars/token on average).
  // Truncate any text that would exceed that to avoid 400 errors.
  const MAX_EMBED_CHARS = 7500;
  const safeBatch = (batch: string[]) =>
    batch.map(t => t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t);

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = safeBatch(texts.slice(i, i + batchSize));

    try {
      const response = await client.embeddings.create({
        model: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
        input: batch,
        encoding_format: 'float',
      });

      const batchEmbeddings = response.data.map(item => item.embedding);
      embeddings.push(...batchEmbeddings);

      if (options?.onProgress) {
        options.onProgress(Math.min(i + batchSize, texts.length), texts.length);
      }
    } catch (error) {
      logger.error('Error generating embeddings', error, { batchStart: i, batchEnd: i + batchSize });
      throw error;
    }
  }

  return embeddings;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

/**
 * Premium chat completion (GPT-4o) — for classification, table extraction, inference
 */
export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  }
): Promise<string> {
  const client = getAzureChatClient();
  if (!client) {
    throw new Error('Azure OpenAI chat client not configured');
  }

  try {
    const response = await client.chat.completions.create({
      model: AZURE_OPENAI_DEPLOYMENT,
      messages: messages as any,
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 1000,
      response_format: options?.responseFormat as any,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    logger.error('Premium chat completion error', error);
    throw error;
  }
}

/**
 * Fast chat completion (GPT-4o-mini) — for entity extraction, verification, reranking
 */
export async function fastChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  }
): Promise<string> {
  const client = getAzureFastChatClient();
  if (!client) {
    throw new Error('Azure OpenAI fast chat client not configured');
  }

  try {
    const response = await client.chat.completions.create({
      model: AZURE_OPENAI_FAST_DEPLOYMENT,
      messages: messages as any,
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 1000,
      response_format: options?.responseFormat as any,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    logger.error('Fast chat completion error', error);
    throw error;
  }
}

/**
 * Rerank candidates using fast tier (GPT-4o-mini)
 */
export async function rerankWithLLM(
  query: string,
  candidates: Array<{ id: string; text: string; initialScore: number }>,
  topK: number = 5
): Promise<Array<{ id: string; text: string; llmScore: number }>> {
  if (candidates.length === 0) return [];

  const limitedCandidates = candidates.slice(0, Math.min(candidates.length, 10));

  const prompt = `You are a relevance ranking system for B-BBEE document extraction.

Query: "${query}"

Candidates:
${limitedCandidates.map((c, i) => `${i + 1}. ID: ${c.id}\n   Text: ${c.text.substring(0, 500)}`).join('\n\n')}

Rate each candidate's relevance to the query on a scale of 0-10.
Return ONLY a JSON object in this format:
{
  "rankings": [
    {"id": "candidate-id", "score": 8.5},
    ...
  ]
}

Scores should reflect:
- 9-10: Exact match, contains the precise information requested
- 7-8: Strong match, likely contains the answer
- 5-6: Partial match, may contain relevant context
- 0-4: Weak or no match`;

  try {
    const response = await fastChatCompletion(
      [
        { role: 'system', content: 'You are a precise relevance ranking system. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0, responseFormat: { type: 'json_object' } }
    );

    const parsed = JSON.parse(response);
    const rankings: Array<{ id: string; score: number }> = parsed.rankings || [];

    const reranked = rankings
      .map(r => {
        const candidate = limitedCandidates.find(c => c.id === r.id);
        return candidate ? { ...candidate, llmScore: r.score } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.llmScore - a.llmScore)
      .slice(0, topK);

    return reranked;
  } catch (error) {
    logger.error('Reranking error', error);
    return limitedCandidates
      .map(c => ({ ...c, llmScore: c.initialScore * 10 }))
      .sort((a, b) => b.llmScore - a.llmScore)
      .slice(0, topK);
  }
}

/**
 * Azure OpenAI Client Class for advanced use cases (Vision, etc.)
 * Always uses premium tier (GPT-4o) since vision requires it.
 */
export class AzureOpenAIClient {
  private client: OpenAI | null;

  constructor() {
    this.client = getAzureChatClient();
  }

  get chat() {
    if (!this.client) {
      throw new Error('Azure OpenAI client not configured');
    }
    return this.client.chat;
  }

  get completions() {
    if (!this.client) {
      throw new Error('Azure OpenAI client not configured');
    }
    return this.client.chat.completions;
  }

  get deploymentName(): string {
    return AZURE_OPENAI_DEPLOYMENT;
  }
}
