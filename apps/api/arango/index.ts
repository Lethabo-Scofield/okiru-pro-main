export { connectArango, getArangoDB, checkArangoHealth } from './connection.js';
export type { ArangoConfig } from './connection.js';

export { ensureCollections, COLLECTIONS, EDGE_COLLECTIONS } from './collections.js';

export { ScorecardRepository, AssessmentRepository, GraphRepository } from './repositories/index.js';
export type {
  ScorecardTemplate, Pillar, Indicator, ComplianceTarget,
  Assessment, CellValue, CalculationResult, AuditEntry,
  StoredFormulaGraph,
} from './repositories/index.js';

export {
  traceScoreProvenance,
  findCrossPillarDependencies,
  whatIfImpact,
  getScorecardGraphSummary,
} from './queries/index.js';
