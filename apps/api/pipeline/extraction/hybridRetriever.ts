import dotenv from 'dotenv';
dotenv.config();

import type { BM25SearchResult } from './bm25Index.js';
import type { EntitySearchResult } from './entityIndex.js';
import { BM25Index } from './bm25Index.js';
import { EntityIndex } from './entityIndex.js';
import type { InMemoryVectorStore, VectorSearchResult } from './embeddingStore.js';
import { rerankWithLLM } from './azureOpenAIClient.js';

export interface RetrievalResult {
  pageId: string;
  score: number;
  rank: number;
  sources: {
    entity?: number;
    bm25?: number;
    semantic?: number;
  };
  matchedEntities: string[];
  matchedTerms: string[];
}

export interface HybridRetrieverConfig {
  entityWeight: number;
  bm25Weight: number;
  semanticWeight: number;
  topK: number;
  deduplicateThreshold: number;
  enableReranking?: boolean; // Enable LLM reranking of top results
  rerankTopK?: number; // Number of results to rerank (default 5)
}

const DEFAULT_CONFIG: HybridRetrieverConfig = {
  entityWeight: 0.15,
  bm25Weight: 0.35,
  semanticWeight: 0.5,
  topK: 10,
  deduplicateThreshold: 0.01,
  enableReranking: true,
  rerankTopK: 5,
};

/**
 * Normalize scores to 0-1 range using min-max normalization.
 * If maxScore is provided, uses it as the max; otherwise computes from results.
 * If all scores are the same, returns 1 for all (avoids div by zero).
 */
export function normalizeScores(
  results: Array<{ pageId: string; score: number }>,
  maxScore?: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (results.length === 0) return out;

  const min = Math.min(...results.map((r) => r.score));
  const max = maxScore ?? Math.max(...results.map((r) => r.score));
  const range = max - min;

  for (const { pageId, score } of results) {
    const norm = range === 0 ? 1 : (score - min) / range;
    out.set(pageId, norm);
  }
  return out;
}

export class HybridRetriever {
  config: HybridRetrieverConfig;
  private bm25Index: BM25Index | undefined;
  private entityIndex: EntityIndex | undefined;
  private vectorStore: InMemoryVectorStore | undefined;

  constructor(
    bm25Index?: BM25Index,
    entityIndex?: EntityIndex,
    vectorStore?: InMemoryVectorStore,
    config: Partial<HybridRetrieverConfig> = {}
  ) {
    this.bm25Index = bm25Index;
    this.entityIndex = entityIndex;
    this.vectorStore = vectorStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the vector store for semantic search.
   */
  setVectorStore(vectorStore: InMemoryVectorStore): void {
    this.vectorStore = vectorStore;
  }

  /**
   * Build per-page scores from entity search results.
   * For each matching entity, distributes relevance to its pageIds.
   */
  private entityResultsToPageScores(
    entityResults: EntitySearchResult[]
  ): Array<{ pageId: string; score: number }> {
    const pageScoreMap = new Map<string, number>();

    for (const er of entityResults) {
      const scorePerPage = er.pageIds.length > 0 ? er.matchCount / er.pageIds.length : 0;
      for (const pageId of er.pageIds) {
        const prev = pageScoreMap.get(pageId) ?? 0;
        pageScoreMap.set(pageId, prev + scorePerPage);
      }
    }

    return [...pageScoreMap.entries()].map(([pageId, score]) => ({ pageId, score }));
  }

  search(query: string, topK?: number): RetrievalResult[] {
    return this.searchInternal(query, undefined, topK);
  }

  searchWithSemantic(
    query: string,
    semanticResults: Array<{ pageId: string; score: number }>,
    topK?: number
  ): RetrievalResult[] {
    return this.searchInternal(query, semanticResults, topK);
  }

  /**
   * Async search that generates query embedding and performs semantic search.
   * Returns hybrid fusion of BM25 + Entity + Semantic results.
   * Optionally reranks top results using LLM.
   */
  async searchWithEmbeddings(
    query: string,
    topK?: number,
    options?: {
      rerank?: boolean;
      rerankTopK?: number;
      getChunkText?: (pageId: string) => string | undefined;
    }
  ): Promise<RetrievalResult[]> {
    // Generate semantic results from vector store
    let semanticResults: Array<{ pageId: string; score: number }> = [];

    if (this.vectorStore) {
      try {
        const vectorResults = await this.vectorStore.search(query, Math.max((topK ?? this.config.topK) * 3, 30));
        semanticResults = vectorResults.map(r => ({
          pageId: r.pageId,
          score: r.score,
        }));
      } catch (error) {
        console.warn('[HybridRetriever] Vector search failed:', error);
        // Continue without semantic results
      }
    }

    // Perform hybrid fusion
    let results = this.searchInternal(query, semanticResults, topK);

    // Optional LLM reranking
    if (options?.rerank ?? this.config.enableReranking) {
      const rerankTopK = options?.rerankTopK ?? this.config.rerankTopK ?? 5;

      if (results.length > 0 && options?.getChunkText) {
        try {
          const candidates = results.slice(0, rerankTopK).map(r => ({
            id: r.pageId,
            text: options.getChunkText!(r.pageId) || '',
            initialScore: r.score,
          }));

          const reranked = await rerankWithLLM(query, candidates, rerankTopK);

          // Update results with reranked scores
          const rerankedMap = new Map(reranked.map(r => [r.id, r.llmScore]));

          results = results.map(r => {
            const rerankScore = rerankedMap.get(r.pageId);
            if (rerankScore !== undefined) {
              // Blend original score with LLM score (50/50)
              const blendedScore = (r.score * 0.5) + (rerankScore / 10 * 0.5);
              return { ...r, score: blendedScore };
            }
            return r;
          });

          // Re-sort by blended score
          results.sort((a, b) => b.score - a.score);

          // Update ranks
          results = results.map((r, idx) => ({ ...r, rank: idx + 1 }));
        } catch (error) {
          console.warn('[HybridRetriever] Reranking failed:', error);
          // Continue with original results
        }
      }
    }

    return results;
  }

  private searchInternal(
    query: string,
    semanticResults: Array<{ pageId: string; score: number }> | undefined,
    topK?: number
  ): RetrievalResult[] {
    const k = topK ?? this.config.topK;
    const searchLimit = Math.max(k * 5, 50);

    const entityPageScores: Array<{ pageId: string; score: number }> = [];
    const matchedEntities: string[] = [];
    let bm25Results: BM25SearchResult[] = [];
    const matchedTermsSet = new Set<string>();

    if (this.entityIndex) {
      const entityResults = this.entityIndex.searchEntities(query);
      for (const er of entityResults) {
        matchedEntities.push(er.name);
      }
      entityPageScores.push(...this.entityResultsToPageScores(entityResults));
    }

    if (this.bm25Index) {
      bm25Results = this.bm25Index.search(query, searchLimit);
      for (const r of bm25Results) {
        for (const t of r.matchedTerms) matchedTermsSet.add(t);
      }
    }

    const entityNorm = normalizeScores(entityPageScores);
    const bm25Norm = normalizeScores(
      bm25Results.map((r) => ({ pageId: r.pageId, score: r.score }))
    );
    const semanticNorm =
      semanticResults && semanticResults.length > 0
        ? normalizeScores(semanticResults)
        : new Map<string, number>();

    const allPageIds = new Set<string>();
    for (const { pageId } of entityPageScores) allPageIds.add(pageId);
    for (const r of bm25Results) allPageIds.add(r.pageId);
    for (const { pageId } of semanticResults ?? []) allPageIds.add(pageId);

    const fused: Array<{
      pageId: string;
      score: number;
      sources: { entity?: number; bm25?: number; semantic?: number };
    }> = [];

    const { entityWeight, bm25Weight, semanticWeight } = this.config;

    for (const pageId of allPageIds) {
      const entityScore = entityNorm.get(pageId) ?? 0;
      const bm25Score = bm25Norm.get(pageId) ?? 0;
      const semanticScore = semanticNorm.get(pageId) ?? 0;

      const finalScore =
        entityWeight * entityScore +
        bm25Weight * bm25Score +
        semanticWeight * semanticScore;

      fused.push({
        pageId,
        score: finalScore,
        sources: {
          ...(entityScore > 0 && { entity: entityScore }),
          ...(bm25Score > 0 && { bm25: bm25Score }),
          ...(semanticScore > 0 && { semantic: semanticScore }),
        },
      });
    }

    fused.sort((a, b) => b.score - a.score);

    // Deduplicate: same pageId can appear from multiple sources; keep highest score
    const byPage = new Map<string, (typeof fused)[0]>();
    for (const item of fused) {
      const existing = byPage.get(item.pageId);
      if (!existing || item.score > existing.score) {
        byPage.set(item.pageId, item);
      }
    }
    const deduped = [...byPage.values()].sort((a, b) => b.score - a.score);
    const top = deduped.slice(0, k);

    return top.map((item, idx) => ({
      pageId: item.pageId,
      score: item.score,
      rank: idx + 1,
      sources: item.sources,
      matchedEntities: [...matchedEntities],
      matchedTerms: [...matchedTermsSet],
    }));
  }

  addPage(pageId: string, text: string): void {
    this.bm25Index?.addPage(pageId, text);
    this.entityIndex?.indexPage(pageId, text);
    // Note: Vector store requires async indexing via indexChunks()
  }

  build(): void {
    this.bm25Index?.build();
  }

  getStats(): {
    bm25Stats: ReturnType<BM25Index['getStats']> | null;
    entityStats: ReturnType<EntityIndex['getStats']> | null;
    vectorStats: { totalChunks: number; isReady: boolean; dimensions: number } | null;
    config: HybridRetrieverConfig;
  } {
    return {
      bm25Stats: this.bm25Index?.getStats() ?? null,
      entityStats: this.entityIndex?.getStats() ?? null,
      vectorStats: this.vectorStore?.getStats() ?? null,
      config: { ...this.config },
    };
  }
}
