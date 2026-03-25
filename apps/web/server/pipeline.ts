/**
 * Pipeline Adapter
 *
 * Re-exports the B-BBEE pipeline from apps/api/pipeline so the web
 * server uses the same — more sophisticated — extraction engine.
 */

// Entity manifest
export {
  buildManifestForSector,
  buildRCOGPGenericManifest,
  getAllManifests,
} from '../../api/pipeline/extraction/entityManifest.js';
export type {
  EntityManifest,
  EntityRequirement,
} from '../../api/pipeline/extraction/entityManifest.js';

// LLM Extractor
export {
  LLMExtractor,
  buildExtractionPrompt,
} from '../../api/pipeline/extraction/llmExtractor.js';
export type {
  LLMExtractionRequest,
  LLMExtractionResult,
} from '../../api/pipeline/extraction/llmExtractor.js';

// Entity → ParseResult mapper + confidence report
export {
  entityResultsToParseResult,
  buildConfidenceReport,
} from '../../api/pipeline/extraction/entityToParseResult.js';

// Scorecard calculator
export { buildPipelineResult } from '../../api/pipeline/buildResult.js';

// Sector configuration
export {
  getSectorConfig,
  detectSectorFromName,
  listSectorConfigs,
} from '../../api/pipeline/sectorConfig.js';
export type { SectorConfig } from '../../api/pipeline/sectorConfig.js';

// Types
export type { PipelineResult, PipelineLog } from '../../api/pipeline/types.js';
