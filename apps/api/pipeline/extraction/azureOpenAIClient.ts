/**
 * Azure OpenAI Client
 *
 * Provides Azure OpenAI integration for:
 * - Chat completions (GPT-4o-mini for entity extraction)
 * - Embeddings (text-embedding-3-small for semantic search)
 */

import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Ensure environment is loaded (in case module is imported before main entry)
dotenv.config();

// Azure OpenAI configuration from environment
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

// Log configuration status on module load
const hasEndpoint = !!AZURE_OPENAI_ENDPOINT;
const hasKey = !!AZURE_OPENAI_API_KEY;
const hasDeployment = !!AZURE_OPENAI_DEPLOYMENT;
console.log(`[AzureOpenAI] Config status - endpoint:${hasEndpoint}, key:${hasKey}, deployment:${hasDeployment} (${AZURE_OPENAI_DEPLOYMENT})`);

// Embedding dimensions for text-embedding-3-small
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Get Azure OpenAI chat client for GPT-4o-mini
 */
export function getAzureChatClient(): OpenAI | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    console.warn('[AzureOpenAI] Missing configuration - AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY not set');
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
 * Get Azure OpenAI embeddings client
 */
export function getAzureEmbeddingClient(): OpenAI | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    console.warn('[AzureOpenAI] Missing configuration - AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY not set');
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

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

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
      console.error(`[AzureOpenAI] Error generating embeddings for batch ${i}-${i + batchSize}:`, error);
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
 * Chat completion with GPT-4o-mini
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
    console.error('[AzureOpenAI] Chat completion error:', error);
    throw error;
  }
}

/**
 * Rerank candidates using GPT-4o-mini
 * Returns reranked array with scores
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
    const response = await chatCompletion(
      [
        { role: 'system', content: 'You are a precise relevance ranking system. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0, responseFormat: { type: 'json_object' } }
    );

    const parsed = JSON.parse(response);
    const rankings: Array<{ id: string; score: number }> = parsed.rankings || [];

    // Merge with original candidates
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
    console.error('[AzureOpenAI] Reranking error:', error);
    // Fallback to initial scores
    return limitedCandidates
      .map(c => ({ ...c, llmScore: c.initialScore * 10 }))
      .sort((a, b) => b.llmScore - a.llmScore)
      .slice(0, topK);
  }
}

/**
 * Azure OpenAI Client Class for advanced use cases (Vision, etc.)
 * Reuses the same configuration as the function-based API
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
}
