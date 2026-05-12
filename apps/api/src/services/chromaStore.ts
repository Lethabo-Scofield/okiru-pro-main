/**
 * ChromaDB Vector Store Service
 *
 * Stage 3 of the certificate extraction pipeline.
 * Persists certificate embeddings in ChromaDB for semantic similarity search
 * and future RAG improvements.
 *
 * All exported functions are no-ops when CHROMA_URL is not configured —
 * the rest of the system continues to function without ChromaDB.
 */

import { createLogger } from '../logger.js';

const logger = createLogger('ChromaStore');

const CHROMA_URL = process.env.CHROMA_URL ?? '';
const COLLECTION_NAME = 'certificates';

// Singleton client / collection (lazy-initialised)
let chromaClient: unknown = null;
let chromaCollection: unknown = null;

export function isChromaConfigured(): boolean {
  return CHROMA_URL.length > 0;
}

async function getCollection(): Promise<unknown> {
  if (!isChromaConfigured()) return null;
  if (chromaCollection) return chromaCollection;

  try {
    const { ChromaClient } = (await import('chromadb')) as {
      ChromaClient: new (opts: { path: string }) => any;
    };

    if (!chromaClient) {
      chromaClient = new ChromaClient({ path: CHROMA_URL });
    }

    chromaCollection = await (chromaClient as any).getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });

    logger.info('ChromaDB collection ready', { url: CHROMA_URL, collection: COLLECTION_NAME });
    return chromaCollection;
  } catch (err: any) {
    logger.warn('Could not connect to ChromaDB', { url: CHROMA_URL, error: err.message });
    chromaClient = null;
    chromaCollection = null;
    return null;
  }
}

/**
 * Index a certificate document in ChromaDB.
 * Fire-and-forget — errors are logged but not rethrown.
 */
export async function indexCertificate(
  id: string,
  text: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  if (!isChromaConfigured()) return;

  try {
    const collection = await getCollection();
    if (!collection) return;

    // ChromaDB only accepts string | number | boolean in metadata values
    const cleanMeta: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (v !== null && v !== undefined) cleanMeta[k] = v;
    }

    await (collection as any).upsert({
      ids: [id],
      documents: [text.slice(0, 8_000)],
      metadatas: [cleanMeta],
    });

    logger.debug('Indexed certificate in ChromaDB', { id });
  } catch (err: any) {
    logger.warn('ChromaDB index failed (non-fatal)', { id, error: err.message });
    // Reset cached collection so next call retries the connection
    chromaCollection = null;
  }
}

/**
 * Find similar certificates via semantic similarity search.
 * Returns an ordered list of certificate IDs (most similar first).
 * Returns [] when ChromaDB is not configured or the query fails.
 */
export async function searchSimilar(query: string, limit = 10): Promise<string[]> {
  if (!isChromaConfigured()) return [];

  try {
    const collection = await getCollection();
    if (!collection) return [];

    const results = await (collection as any).query({
      queryTexts: [query],
      nResults: limit,
    });

    return ((results.ids as string[][])[0] ?? []) as string[];
  } catch (err: any) {
    logger.warn('ChromaDB search failed (non-fatal)', { error: err.message });
    return [];
  }
}
