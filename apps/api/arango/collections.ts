/**
 * ArangoDB Collection Definitions & Initialization
 *
 * Defines all document and edge collections for the B-BBEE knowledge graph.
 * Call ensureCollections() at startup to create any missing collections.
 */

import type { Database } from 'arangojs';
import { getArangoDB } from './connection.js';

// Document collection names
export const COLLECTIONS = {
  scorecards: 'scorecards',
  pillars: 'pillars',
  indicators: 'indicators',
  complianceTargets: 'compliance_targets',
  clients: 'bee_clients',
  assessments: 'assessments',
  cellValues: 'cell_values',
  calculationResults: 'calculation_results',
  auditEntries: 'audit_entries',
  formulaGraphs: 'formula_graphs',
  scorecardModels: 'scorecard_models',
  cells: 'cells',
  scorecardSnapshots: 'scorecard_snapshots',
  entityManifests: 'entity_manifests',
  sectorModelMappings: 'sector_model_mappings',
} as const;

// Edge collection names
export const EDGE_COLLECTIONS = {
  pillarOf: 'pillar_of',
  dependsOn: 'depends_on',
  derivedFrom: 'derived_from',
  scoredUnder: 'scored_under',
  sectorApplies: 'sector_applies',
  indicatorOf: 'indicator_of',
  cellDependency: 'cell_dependency',
} as const;

const DOCUMENT_COLLECTIONS = Object.values(COLLECTIONS);
const EDGE_COLLECTION_LIST = Object.values(EDGE_COLLECTIONS);

export async function ensureCollections(db?: Database): Promise<void> {
  const database = db || getArangoDB();
  const existing = await database.listCollections();
  const existingNames = new Set(existing.map(c => c.name));

  for (const name of DOCUMENT_COLLECTIONS) {
    if (!existingNames.has(name)) {
      await database.createCollection(name);
      console.log(`[ArangoDB] Created document collection: ${name}`);
    }
  }

  for (const name of EDGE_COLLECTION_LIST) {
    if (!existingNames.has(name)) {
      await database.createEdgeCollection(name);
      console.log(`[ArangoDB] Created edge collection: ${name}`);
    }
  }

  await ensureIndexes(database);
}

async function ensureIndexes(db: Database): Promise<void> {
  const col = (name: string) => db.collection(name);

  await col(COLLECTIONS.pillars).ensureIndex({ type: 'persistent', fields: ['scorecardId'] });
  await col(COLLECTIONS.indicators).ensureIndex({ type: 'persistent', fields: ['pillarId'] });
  await col(COLLECTIONS.complianceTargets).ensureIndex({ type: 'persistent', fields: ['indicatorId', 'sectorCode'] });
  await col(COLLECTIONS.assessments).ensureIndex({ type: 'persistent', fields: ['clientId', 'financialYear'] });
  await col(COLLECTIONS.cellValues).ensureIndex({ type: 'persistent', fields: ['assessmentId', 'sheet'] });
  await col(COLLECTIONS.calculationResults).ensureIndex({ type: 'persistent', fields: ['assessmentId', 'pillar'] });
  await col(COLLECTIONS.auditEntries).ensureIndex({ type: 'persistent', fields: ['assessmentId', 'timestamp'] });
  await col(COLLECTIONS.formulaGraphs).ensureIndex({ type: 'persistent', fields: ['scorecardType', 'version'] });
  await col(COLLECTIONS.entityManifests).ensureIndex({ type: 'persistent', fields: ['sectorCode', 'scorecardType'] });
  await col(COLLECTIONS.sectorModelMappings).ensureIndex({ type: 'persistent', fields: ['sectorCode', 'scorecardType'], unique: true });
}
