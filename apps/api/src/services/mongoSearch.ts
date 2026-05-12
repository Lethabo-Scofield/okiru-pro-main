/**
 * MongoDB Search Service — Replaces Azure AI Search
 *
 * Uses MongoDB $text search with BM25-like ranking via textScore.
 * When ChromaDB is available, hybridSearchCertificates merges MongoDB BM25 results
 * with ChromaDB semantic-similarity results using Reciprocal Rank Fusion (RRF).
 *
 * Supports:
 * - Full-text search across company name, VAT number, filename, extracted text
 * - Filter by status, company size, B-BBEE level
 * - Sort by relevance score (textScore) + expiry date
 * - Pagination
 */

import type { PipelineStage } from 'mongoose';
import { CertificateMetadataModel } from '../../models.js';
import { createLogger } from '../logger.js';
import { searchSimilar, isChromaConfigured } from './chromaStore.js';
import { BM25Index } from '../../pipeline/extraction/bm25Index.js';

const logger = createLogger('MongoSearch');

export interface SearchFilters {
  status?: 'valid' | 'expiring' | 'expired' | 'unknown' | 'all';
  companySize?: string;
  minBbbeeLevel?: number;
  maxBbbeeLevel?: number;
  verifiedOnly?: boolean;
}

export interface SearchResult {
  id: string;
  blobName: string;
  fileName: string;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  bbbeeScore: number | null;
  expiryDate: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  verified: boolean;
  extractedText: string | null;
  score: number;
  snippet: string;
}

/**
 * Ensure MongoDB text index exists on certificate_metadata collection.
 * This should be called once at startup.
 */
export async function ensureSearchIndex(): Promise<void> {
  try {
    const collection = CertificateMetadataModel.collection;
    const indexes = await collection.indexes();

    // Check if text index already exists
    const hasTextIndex = indexes.some((idx: any) =>
      idx.key && (idx.key.$text || idx.key.supplierName === 'text')
    );

    if (hasTextIndex) {
      logger.info('MongoDB text index already exists');
      return;
    }

    // Create compound text index with weights for BM25-like ranking
    await collection.createIndex(
      {
        supplierName: 'text',
        vatNumber: 'text',
        fileName: 'text',
        extractedText: 'text',
        companySize: 'text',
      },
      {
        name: 'certificate_search_text',
        weights: {
          supplierName: 10,      // Highest priority - company name
          vatNumber: 8,        // High priority - exact match identifier
          fileName: 5,         // Medium priority
          extractedText: 3,    // Lower priority - body text
          companySize: 2,      // Lowest - EME/QSE/Generic
        },
        default_language: 'english',
        language_override: 'language',
      }
    );

    // Also create index on expiryDate for sorting
    await collection.createIndex({ expiryDate: 1 });
    await collection.createIndex({ status: 1 });
    await collection.createIndex({ bbbeeLevel: 1 });
    await collection.createIndex({ verified: 1 });
    await collection.createIndex({ companySize: 1 });
    await collection.createIndex({ vatNumber: 1 });

    logger.info('MongoDB search indexes created successfully');
  } catch (err) {
    logger.error('Failed to create search index', err);
    throw err;
  }
}

/**
 * Search certificates using MongoDB $text search with BM25-like scoring.
 *
 * @param query - Search query string
 * @param filters - Optional filters (status, size, level, etc.)
 * @param options - Pagination and sorting options
 * @returns Search results with relevance scores
 */
export async function searchCertificatesMongo(
  query: string,
  filters?: SearchFilters,
  options?: {
    limit?: number;
    skip?: number;
    sortBy?: 'relevance' | 'expiryDate' | 'companyName';
  }
): Promise<{ results: SearchResult[]; total: number }> {
  const startTime = Date.now();
  const sanitizedQuery = query.trim().replace(/[\*\+\-\|\!\(\)\{\}\[\]\^"\~\*\?:\\]/g, ' ');

  if (!sanitizedQuery) {
    return { results: [], total: 0 };
  }

  try {
    // Build match stage
    const matchStage: any = {
      $text: { $search: sanitizedQuery },
    };

    // Apply filters
    if (filters?.status && filters.status !== 'all') {
      matchStage.status = filters.status;
    }
    if (filters?.companySize && filters.companySize !== 'all') {
      matchStage.companySize = { $regex: new RegExp(filters.companySize, 'i') };
    }
    if (filters?.minBbbeeLevel !== undefined) {
      matchStage.bbbeeLevel = { $gte: filters.minBbbeeLevel };
    }
    if (filters?.maxBbbeeLevel !== undefined) {
      matchStage.bbbeeLevel = { ...matchStage.bbbeeLevel, $lte: filters.maxBbbeeLevel };
    }
    if (filters?.verifiedOnly) {
      matchStage.verified = true;
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: matchStage },
      {
        $addFields: {
          searchScore: { $meta: 'textScore' },
        },
      },
    ];

    // Sorting
    const sortBy = options?.sortBy || 'relevance';
    if (sortBy === 'relevance') {
      pipeline.push({ $sort: { searchScore: -1, expiryDate: -1 } });
    } else if (sortBy === 'expiryDate') {
      pipeline.push({ $sort: { expiryDate: -1, searchScore: -1 } });
    } else {
      pipeline.push({ $sort: { supplierName: 1, searchScore: -1 } });
    }

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await CertificateMetadataModel.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Pagination
    const skip = options?.skip || 0;
    const limit = options?.limit || 50;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute search
    const docs = await CertificateMetadataModel.aggregate(pipeline);

    // Transform to SearchResult
    const results: SearchResult[] = docs.map((doc) => ({
      id: doc.id || doc._id.toString(),
      blobName: doc.blobName,
      fileName: doc.fileName,
      companyName: doc.supplierName || extractCompanyNameFromFileName(doc.fileName),
      vatNumber: doc.vatNumber || null,
      companySize: doc.companySize || null,
      blackOwnership: doc.blackOwnership ?? null,
      blackWomenOwnership: doc.blackWomenOwnership ?? null,
      bbbeeLevel: doc.bbbeeLevel ?? null,
      bbbeeScore: doc.bbbeeScore ?? null,
      expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : null,
      status: doc.status || 'unknown',
      verified: !!doc.verified,
      extractedText: doc.extractedText?.substring(0, 500) || null,
      score: doc.searchScore || 0,
      snippet: generateSnippet(doc, sanitizedQuery),
    }));

    const duration = Date.now() - startTime;
    logger.info('Search completed', {
      query: sanitizedQuery,
      results: results.length,
      total,
      durationMs: duration,
    });

    return { results, total };
  } catch (err) {
    logger.error('Search failed', err);
    throw err;
  }
}

/**
 * Fuzzy search using regex for partial matches when $text search
 * doesn't return enough results (fallback for typos, partial words).
 */
export async function fuzzySearchCertificates(
  query: string,
  filters?: SearchFilters,
  options?: { limit?: number; skip?: number }
): Promise<{ results: SearchResult[]; total: number }> {
  const sanitized = query.trim();
  if (!sanitized) {
    return { results: [], total: 0 };
  }

  // Build regex pattern for fuzzy matching
  const escaped = sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'i');

  const matchStage: any = {
    $or: [
      { supplierName: { $regex: pattern } },
      { vatNumber: { $regex: pattern } },
      { fileName: { $regex: pattern } },
      { extractedText: { $regex: pattern } },
    ],
  };

  // Apply filters
  if (filters?.status && filters.status !== 'all') {
    matchStage.status = filters.status;
  }
  if (filters?.companySize && filters.companySize !== 'all') {
    matchStage.companySize = { $regex: new RegExp(filters.companySize, 'i') };
  }

  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    { $sort: { updatedAt: -1 } },
  ];

  // Count
  const countResult = await CertificateMetadataModel.aggregate([...pipeline, { $count: 'total' }]);
  const total = countResult[0]?.total || 0;

  // Paginate
  pipeline.push({ $skip: options?.skip || 0 });
  pipeline.push({ $limit: options?.limit || 50 });

  const docs = await CertificateMetadataModel.aggregate(pipeline);

  const results: SearchResult[] = docs.map((doc) => ({
    id: doc.id || doc._id.toString(),
    blobName: doc.blobName,
    fileName: doc.fileName,
    companyName: doc.supplierName || extractCompanyNameFromFileName(doc.fileName),
    vatNumber: doc.vatNumber || null,
    companySize: doc.companySize || null,
    blackOwnership: doc.blackOwnership ?? null,
    blackWomenOwnership: doc.blackWomenOwnership ?? null,
    bbbeeLevel: doc.bbbeeLevel ?? null,
    bbbeeScore: doc.bbbeeScore ?? null,
    expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : null,
    status: doc.status || 'unknown',
    verified: !!doc.verified,
    extractedText: doc.extractedText?.substring(0, 500) || null,
    score: 1, // Fuzzy search doesn't have textScore
    snippet: generateSnippet(doc, sanitized),
  }));

  return { results, total };
}

/**
 * Hybrid search combining three ranked lists via Reciprocal Rank Fusion (RRF):
 *   1. MongoDB $text search (BM25-weighted textScore)
 *   2. In-memory BM25 re-score of the MongoDB candidates on their extractedText
 *   3. ChromaDB semantic similarity search (when CHROMA_URL is configured)
 *
 * Falls back gracefully: if ChromaDB is unavailable the function returns the
 * MongoDB $text results (with optional fuzzy supplement), just like before.
 */
export async function hybridSearchCertificates(
  query: string,
  filters?: SearchFilters,
  options?: { limit?: number; skip?: number }
): Promise<{ results: SearchResult[]; total: number }> {
  const limit = options?.limit ?? 50;
  const skip = options?.skip ?? 0;

  // --- List 1: MongoDB $text (BM25-weighted) --------------------------------
  const textResult = await searchCertificatesMongo(query, filters, { ...options, limit: limit * 2 });

  // Supplement with fuzzy when $text returns few results
  let mongoResults = textResult.results;
  if (mongoResults.length < 5 && query.length > 2) {
    const fuzzy = await fuzzySearchCertificates(query, filters, { limit: limit * 2 });
    const seen = new Set(mongoResults.map((r) => r.id));
    mongoResults = [...mongoResults, ...fuzzy.results.filter((r) => !seen.has(r.id))];
  }

  // --- List 2: BM25 re-rank of the MongoDB candidates -----------------------
  const bm25 = new BM25Index();
  for (const r of mongoResults) {
    if (r.extractedText) bm25.addPage(r.id, r.extractedText);
  }
  bm25.build();
  const bm25Ranked = bm25.search(query, limit * 2).map((sr) => sr.pageId);

  // --- List 3: ChromaDB semantic similarity (optional) ----------------------
  const chromaIds = isChromaConfigured() ? await searchSimilar(query, limit * 2) : [];

  // --- RRF merge ------------------------------------------------------------
  const ranked = reciprocalRankFusion(
    [mongoResults.map((r) => r.id), bm25Ranked, chromaIds],
    60,
  );

  // Sort all known results by fused RRF score, then paginate
  const idToResult = new Map(mongoResults.map((r) => [r.id, r]));
  const merged = [...ranked.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => idToResult.get(id))
    .filter((r): r is SearchResult => r !== undefined);

  return {
    results: merged.slice(skip, skip + limit),
    total: textResult.total,
  };
}

/**
 * Compute a BM25 score for a single document against a query.
 * Useful for reranking a small candidate set without building a full BM25Index.
 * k1 = 1.5, b = 0.75, avgDocLen = 500 words (tuned for B-BBEE certificate snippets).
 */
export function bm25Score(
  extractedText: string | null,
  queryTerms: string[],
  avgDocLen = 500,
): number {
  if (!extractedText || queryTerms.length === 0) return 0;

  const k1 = 1.5;
  const b = 0.75;
  const words = extractedText.toLowerCase().split(/\W+/);
  const docLen = words.length;
  const tf = new Map<string, number>();
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);

  let score = 0;
  for (const term of queryTerms) {
    const termFreq = tf.get(term.toLowerCase()) ?? 0;
    if (termFreq === 0) continue;
    score += (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + (b * docLen) / avgDocLen));
  }
  return score;
}

/**
 * Reciprocal Rank Fusion.
 * Given N ranked lists of IDs, returns a Map<id, fusedScore> where
 *   fusedScore = Σ  1 / (k + rank)   for each list that contains the ID.
 * k = 60 is the standard RRF parameter.
 */
function reciprocalRankFusion(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, zeroBasedRank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + zeroBasedRank + 1));
    });
  }
  return scores;
}

/**
 * Get a single certificate by ID with full details.
 */
export async function getCertificateById(id: string): Promise<SearchResult | null> {
  const doc = await CertificateMetadataModel.findOne({ id });
  if (!doc) return null;

  return {
    id: doc.id,
    blobName: doc.blobName,
    fileName: doc.fileName,
    companyName: doc.supplierName || extractCompanyNameFromFileName(doc.fileName),
    vatNumber: doc.vatNumber || null,
    companySize: doc.companySize || null,
    blackOwnership: doc.blackOwnership ?? null,
    blackWomenOwnership: doc.blackWomenOwnership ?? null,
    bbbeeLevel: doc.bbbeeLevel ?? null,
    bbbeeScore: doc.bbbeeScore ?? null,
    expiryDate: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : null,
    status: (doc.status as any) || 'unknown',
    verified: !!doc.verified,
    extractedText: doc.extractedText?.substring(0, 2000) || null,
    score: 0,
    snippet: generateSnippet(doc, ''),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function extractCompanyNameFromFileName(fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const noExt = base.replace(/\.[a-z0-9]+$/i, '');
  let working = noExt.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    ''
  );

  // Remove date prefixes
  const leadingPrefixPatterns = [
    /^\d{4}[\s_\-]+\d{1,2}[\s_\-]+\d{1,2}[\s_\-]+/,
    /^(?:19|20)\d{2}[\s._\-]+/,
    /^[\s\[\(]*\d+[\s._\-:)\]]+/,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pat of leadingPrefixPatterns) {
      const next = working.replace(pat, '');
      if (next !== working) {
        working = next;
        changed = true;
      }
    }
  }

  const trimmed = working
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\b(EME|QSE|Generic|Large|Specialised|Specialized)\b.*$/i, '')
    .replace(/\s*B[\s-]?BBEE.*$/i, '')
    .replace(/\s*Certificate.*$/i, '')
    .replace(/\s*Affidavit.*$/i, '')
    .replace(/\s*Scorecard.*$/i, '')
    .replace(/\s*Verification.*$/i, '')
    .replace(/\s+BEE$/i, '')
    .replace(/\s*\(?\d+\)?$/, '')
    .replace(/[\s_\-–—]+$/u, '')
    .trim();

  return trimmed || 'Unknown company';
}

function generateSnippet(doc: any, query: string): string {
  const parts: string[] = [];

  // Company name
  if (doc.supplierName) {
    parts.push(doc.supplierName);
  }

  // VAT number
  if (doc.vatNumber) {
    parts.push(`VAT: ${doc.vatNumber}`);
  }

  // Company size and level
  const metaParts: string[] = [];
  if (doc.companySize) {
    metaParts.push(doc.companySize);
  }
  if (doc.bbbeeLevel) {
    metaParts.push(`Level ${doc.bbbeeLevel}`);
  }
  if (metaParts.length) {
    parts.push(metaParts.join(' · '));
  }

  // Ownership info
  if (doc.blackOwnership !== null || doc.blackWomenOwnership !== null) {
    const ownershipParts: string[] = [];
    if (doc.blackOwnership !== null) {
      ownershipParts.push(`${doc.blackOwnership}% Black Owned`);
    }
    if (doc.blackWomenOwnership !== null) {
      ownershipParts.push(`${doc.blackWomenOwnership}% Black Women Owned`);
    }
    parts.push(ownershipParts.join(' · '));
  }

  // Expiry
  if (doc.expiryDate) {
    const date = new Date(doc.expiryDate).toISOString().slice(0, 10);
    parts.push(`Expires: ${date}`);
  }

  return parts.join(' · ') || doc.fileName || 'Certificate';
}
