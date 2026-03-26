export { DocumentChunker } from './documentChunker.js';
export type { DocumentChunk, ChunkerConfig } from './documentChunker.js';

export { ProvenanceTracker } from './provenanceTracker.js';
export type { ProvenanceRecord } from './provenanceTracker.js';

export {
  computeConfidence,
  calibrateConfidence,
  CONFIDENCE_THRESHOLD,
} from './confidenceScorer.js';
export type { ConfidenceFactors, ConfidenceResult } from './confidenceScorer.js';

export {
  validateOwnership,
  validateFinancials,
  validateEmployees,
  validateSuppliers,
  validateAll,
} from './validator.js';
export type { ValidationIssue, ValidationResult } from './validator.js';

export { buildRCOGPGenericManifest, buildManifestForSector, getAllManifests, buildGenericManifest, buildCustomManifest } from './entityManifest.js';
export type { EntityManifest, EntityRequirement, SheetHint, RetrievalHints, ValidationRules } from './entityManifest.js';

export { BM25Index } from './bm25Index.js';
export type { BM25SearchResult } from './bm25Index.js';

export {
  EntityIndex,
  DEFAULT_BBBEE_ENTITY_CONFIGS,
  DEFAULT_GENERIC_ENTITY_CONFIGS,
} from './entityIndex.js';
export type {
  EntityConfig,
  EntitySearchResult,
} from './entityIndex.js';

export { HybridRetriever } from './hybridRetriever.js';
export type { RetrievalResult, HybridRetrieverConfig } from './hybridRetriever.js';
export { normalizeScores } from './hybridRetriever.js';

export { LLMExtractor, buildExtractionPrompt, structuralVerify, isAvailable as isLLMAvailable, getPreferredProvider } from './llmExtractor.js';
export type { LLMExtractionRequest, LLMExtractionResult, LLMExtractorConfig } from './llmExtractor.js';

export {
  extractPageEntities,
  extractDocumentEntities,
  getEntitySummary,
  normalizeEntityValue,
  isAmbiguousEntity,
  AUDIT_ENTITY_TYPES,
  DEFAULT_BBBEE_PATTERNS,
  DEFAULT_FINANCIAL_PATTERNS,
  createPatternSet,
} from './nerEngine.js';
export type { PageEntity, PageEntitiesResult, EntityType, PatternSet } from './nerEngine.js';

// Azure OpenAI integration
export {
  getAzureChatClient,
  getAzureEmbeddingClient,
  isAzureOpenAIConfigured,
  generateEmbeddings,
  generateEmbedding,
  chatCompletion,
  rerankWithLLM,
  EMBEDDING_DIMENSIONS,
} from './azureOpenAIClient.js';

// Embedding store
export {
  InMemoryVectorStore,
  createVectorStore,
  batchCosineSimilarity,
} from './embeddingStore.js';
export type { ChunkEmbedding, VectorSearchResult } from './embeddingStore.js';
