/**
 * Pipeline Adapter
 * 
 * Thin re-export layer so the server can import the B-BBEE pipeline
 * from lib/pipeline. This adapter re-exports the public API.
 */

// Entity manifest
export {
  buildManifestForSector,
  buildRCOGPGenericManifest,
  getAllManifests,
} from '../lib/pipeline/extraction/entityManifest';
export type {
  EntityManifest,
  EntityRequirement,
} from '../lib/pipeline/extraction/entityManifest';

// LLM Extractor
export {
  LLMExtractor,
  buildExtractionPrompt,
} from '../lib/pipeline/extraction/llmExtractor';
export type {
  LLMExtractionRequest,
  LLMExtractionResult,
} from '../lib/pipeline/extraction/llmExtractor';

// Entity → ParseResult mapper
export {
  entityResultsToParseResult,
  buildConfidenceReport,
} from '../lib/pipeline/extraction/entityToParseResult';

// Scorecard calculator
export { buildPipelineResult } from '../lib/pipeline/buildResult';

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
} from '../lib/pipeline/sectorConfig';
export type { SectorConfig } from '../lib/pipeline/sectorConfig';

// Types
export type { PipelineResult, PipelineLog } from '../lib/pipeline/types';
