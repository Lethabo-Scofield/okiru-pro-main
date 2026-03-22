/**
 * Pipeline Adapter
 * 
 * Thin re-export layer so apps/web/server can import the B-BBEE pipeline
 * from apps/api/pipeline without hitting .js extension resolution issues.
 * tsx (used by this dev server) resolves .ts directly; the pipeline files
 * use .js extensions internally, which works within their own ts build but
 * fails when imported cross-package. This adapter does a single top-level
 * import that tsx can resolve, then re-exports the public API.
 */

// Entity manifest
export {
  buildManifestForSector,
  buildRCOGPGenericManifest,
  getAllManifests,
} from '../../api/pipeline/extraction/entityManifest';
export type {
  EntityManifest,
  EntityRequirement,
} from '../../api/pipeline/extraction/entityManifest';

// LLM Extractor
export {
  LLMExtractor,
  buildExtractionPrompt,
} from '../../api/pipeline/extraction/llmExtractor';
export type {
  LLMExtractionRequest,
  LLMExtractionResult,
} from '../../api/pipeline/extraction/llmExtractor';

// Entity → ParseResult mapper
export {
  entityResultsToParseResult,
  buildConfidenceReport,
} from '../../api/pipeline/extraction/entityToParseResult';

// Scorecard calculator
export { buildPipelineResult } from '../../api/pipeline/buildResult';

// Sector configuration
export {
  getSectorConfig,
  detectSectorFromName,
  listSectorConfigs,
  RCOGP_GENERIC,
  ICT_GENERIC,
  FSC_GENERIC,
  AGRI_GENERIC,
  RCOGP_QSE,
  ICT_QSE,
} from '../../api/pipeline/sectorConfig';
export type { SectorConfig } from '../../api/pipeline/sectorConfig';

// Types
export type { PipelineResult, PipelineLog } from '../../api/pipeline/types';
