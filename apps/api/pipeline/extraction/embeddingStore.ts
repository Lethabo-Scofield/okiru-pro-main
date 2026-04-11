/**
 * Embedding Store
 *
 * In-memory vector store for document chunk embeddings.
 * Uses cosine similarity for semantic search.
 *
 * Integrates with Azure OpenAI text-embedding-3-small (1536 dimensions)
 */

import { generateEmbeddings, generateEmbedding, EMBEDDING_DIMENSIONS } from './azureOpenAIClient.js';

export interface ChunkEmbedding {
  chunkId: string;
  pageId: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

export interface VectorSearchResult {
  chunkId: string;
  pageId: string;
  score: number; // Cosine similarity (0-1)
  text: string;
  metadata?: Record<string, any>;
}

/**
 * In-memory vector store for chunk embeddings
 */
export class InMemoryVectorStore {
  private chunks: Map<string, ChunkEmbedding> = new Map();
  private isReady: boolean = false;

  /**
   * Index chunks by generating embeddings and storing them
   */
  async indexChunks(
    chunks: Array<{ chunkId: string; pageId: string; text: string; metadata?: Record<string, any> }>,
    options?: {
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<void> {
    if (chunks.length === 0) {
      this.isReady = true;
      return;
    }

    // Generate embeddings for all chunk texts
    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(texts, {
      batchSize: 100,
      onProgress: options?.onProgress,
    });

    // Store chunks with their embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this.chunks.set(chunk.chunkId, {
        chunkId: chunk.chunkId,
        pageId: chunk.pageId,
        text: chunk.text,
        embedding: embeddings[i],
        metadata: chunk.metadata,
      });
    }

    this.isReady = true;
    console.log(`[EmbeddingStore] Indexed ${chunks.length} chunks with ${EMBEDDING_DIMENSIONS}-dim embeddings`);
  }

  /**
   * Search for similar chunks using cosine similarity
   */
  async search(
    query: string,
    topK: number = 10,
    minScore: number = 0.5
  ): Promise<VectorSearchResult[]> {
    if (!this.isReady) {
      throw new Error('Vector store not ready - call indexChunks() first');
    }

    if (this.chunks.size === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Calculate cosine similarity for all chunks
    const results: VectorSearchResult[] = [];
    for (const chunk of this.chunks.values()) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({
          chunkId: chunk.chunkId,
          pageId: chunk.pageId,
          score,
          text: chunk.text,
          metadata: chunk.metadata,
        });
      }
    }

    // Sort by score descending and take topK
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Search using a pre-computed embedding (for batch queries)
   */
  searchWithEmbedding(
    queryEmbedding: number[],
    topK: number = 10,
    minScore: number = 0.5
  ): VectorSearchResult[] {
    if (!this.isReady) {
      throw new Error('Vector store not ready - call indexChunks() first');
    }

    if (this.chunks.size === 0) {
      return [];
    }

    const results: VectorSearchResult[] = [];
    for (const chunk of this.chunks.values()) {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({
          chunkId: chunk.chunkId,
          pageId: chunk.pageId,
          score,
          text: chunk.text,
          metadata: chunk.metadata,
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Batch search: embed all queries in one API call, then search for each.
   * Much faster than N individual search() calls (saves N-1 embedding API calls).
   */
  async batchSearch(
    queries: string[],
    topK: number = 10,
    minScore: number = 0.5
  ): Promise<Map<string, VectorSearchResult[]>> {
    if (!this.isReady) {
      throw new Error('Vector store not ready - call indexChunks() first');
    }

    if (this.chunks.size === 0 || queries.length === 0) {
      return new Map();
    }

    // Generate all query embeddings in ONE API call
    const queryEmbeddings = await generateEmbeddings(queries, { batchSize: 100 });

    // Search for each query using the pre-computed embeddings
    const results = new Map<string, VectorSearchResult[]>();
    for (let i = 0; i < queries.length; i++) {
      const queryResults = this.searchWithEmbedding(queryEmbeddings[i], topK, minScore);
      results.set(queries[i], queryResults);
    }

    return results;
  }

  /**
   * Get a chunk by ID
   */
  getChunk(chunkId: string): ChunkEmbedding | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Get all chunks for a page
   */
  getChunksByPage(pageId: string): ChunkEmbedding[] {
    return Array.from(this.chunks.values()).filter(c => c.pageId === pageId);
  }

  /**
   * Get store statistics
   */
  getStats(): { totalChunks: number; isReady: boolean; dimensions: number } {
    return {
      totalChunks: this.chunks.size,
      isReady: this.isReady,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  /**
   * Clear all stored chunks
   */
  clear(): void {
    this.chunks.clear();
    this.isReady = false;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1 (we typically expect 0-1 for positive similarities)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalize a vector to unit length
 */
function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vec;
  return vec.map(val => val / norm);
}

/**
 * Batch cosine similarity computation for efficiency
 */
export function batchCosineSimilarity(
  queryEmbedding: number[],
  documentEmbeddings: number[][]
): number[] {
  const normalizedQuery = normalizeVector(queryEmbedding);

  return documentEmbeddings.map(docEmbedding => {
    const normalizedDoc = normalizeVector(docEmbedding);
    let dotProduct = 0;
    for (let i = 0; i < normalizedQuery.length; i++) {
      dotProduct += normalizedQuery[i] * normalizedDoc[i];
    }
    return dotProduct;
  });
}

/**
 * Create a new vector store instance
 */
export function createVectorStore(): InMemoryVectorStore {
  return new InMemoryVectorStore();
}

// Export types
export { EMBEDDING_DIMENSIONS };
