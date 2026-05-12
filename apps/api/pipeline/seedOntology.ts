/**
 * Ontology Seed Script
 *
 * Seeds ArangoDB with B-BBEE sector rules, criteria, and entity fields
 * from the hierarchical entity manifest system.
 *
 * Usage: Run at startup or after schema changes to populate the ontology.
 *
 * Data flow:
 *   sectorConfig.ts + entityManifest.ts → ArangoDB collections
 *   (source of truth)                    (queryable graph)
 */

import {
  SectorRuleRepository,
  CriterionRepository,
  EntityFieldRepository,
} from '../arango/repositories/index.js';
import { ensureCollections } from '../arango/collections.js';
import { createLogger } from '../src/logger.js';

const logger = createLogger('SeedOntology');
import {
  getAllManifests,
  buildManifest,
  type EntityManifest,
  type PillarPack,
  type CriterionEntity,
  type EntityField,
} from './extraction/entityManifest.js';
import {
  getSectorConfig,
  type SectorConfig,
  listSectorConfigs,
} from './sectorConfig.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedResult {
  sectorCode: string;
  scorecardType: string;
  sectorRuleStored: boolean;
  criteriaCount: number;
  entityFieldsCount: number;
  errors: string[];
}

interface SeedSummary {
  totalSectors: number;
  totalCriteria: number;
  totalEntityFields: number;
  results: SeedResult[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Seed Functions
// ---------------------------------------------------------------------------

/**
 * Convert PillarPack to StoredPillarConfig format.
 */
function toStoredPillarConfig(pack: PillarPack, displayOrder: number) {
  return {
    code: pack.pillarCode,
    name: pack.pillarName,
    maxPoints: pack.maxPoints,
    hasSubMinimum: pack.hasSubMinimum,
    subMinimumThreshold: pack.subMinimumThreshold,
    displayOrder,
  };
}

/**
 * Convert CriterionEntity to StoredCriterion format.
 */
function toStoredCriterion(
  criterion: CriterionEntity,
  sectorCode: string,
  scorecardType: string,
  displayOrder: number
) {
  return {
    code: criterion.code,
    name: criterion.name,
    pillarCode: criterion.pillarCode,
    sectorCode: sectorCode.toUpperCase(),
    scorecardType,
    target: criterion.target,
    maxPoints: criterion.maxPoints,
    formulaId: criterion.formulaId,
    inputEntities: criterion.inputEntities,
    bonusCondition: criterion.bonusCondition,
    minimumThreshold: criterion.minimumThreshold,
    evidenceRequired: criterion.evidenceRequired,
    sectorOverrides: criterion.sectorOverrides,
    displayOrder,
  };
}

/**
 * Convert EntityField to StoredEntityField format.
 */
function toStoredEntityField(
  field: EntityField,
  sectorCode: string,
  scorecardType: string
) {
  return {
    id: field.id,
    name: field.name,
    pillarCode: field.pillarCode,
    sectorCode: sectorCode.toUpperCase(),
    scorecardType,
    criterionCodes: field.criterionCodes,
    fieldType: field.fieldType,
    required: field.required,
    defaultValue: field.defaultValue,
    validation: field.validation,
    extraction: field.extraction,
    ui: field.ui,
  };
}

/**
 * Build StoredSectorRule from SectorConfig.
 */
function toStoredSectorRule(
  config: SectorConfig,
  manifests: EntityManifest[]
): Omit<
  import('../arango/repositories/sectorRuleRepository.js').StoredSectorRule,
  '_key' | 'createdAt' | 'updatedAt'
> {
  // Always build pillar configs from the hardcoded SectorConfig (source of truth).
  // Do NOT use manifest.pillarPacks because buildManifest calls resolveSectorConfig
  // which reads stale ArangoDB values, creating a circular dependency during seeding.
  const pillarConfigs = [
    { code: 'clientInfo', name: 'Client Information', maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0, displayOrder: 0 },
    { code: 'financials', name: 'Financials', maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0, displayOrder: 1 },
    { code: 'ownership', name: 'Ownership', ...config.pillarConfigs.ownership, displayOrder: 2 },
    { code: 'managementControl', name: 'Management Control', ...config.pillarConfigs.managementControl, displayOrder: 3 },
    { code: 'employmentEquity', name: 'Employment Equity', ...(config.pillarConfigs.employmentEquity ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }), displayOrder: 4 },
    { code: 'skillsDevelopment', name: 'Skills Development', ...config.pillarConfigs.skillsDevelopment, displayOrder: 5 },
    { code: 'preferentialProcurement', name: 'Preferential Procurement', ...config.pillarConfigs.preferentialProcurement, displayOrder: 6 },
    { code: 'enterpriseSupplierDevelopment', name: 'Enterprise & Supplier Development', maxPoints: (config.pillarConfigs.supplierDevelopment?.maxPoints ?? 0) + (config.pillarConfigs.enterpriseDevelopment?.maxPoints ?? 0), hasSubMinimum: config.pillarConfigs.supplierDevelopment?.hasSubMinimum ?? false, subMinimumPercent: config.pillarConfigs.supplierDevelopment?.subMinimumPercent ?? 0, displayOrder: 7 },
    { code: 'socioEconomicDevelopment', name: 'Socio-Economic Development', ...config.pillarConfigs.socioEconomicDevelopment, displayOrder: 8 },
    { code: 'yesInitiative', name: 'YES Initiative', ...(config.pillarConfigs.yesInitiative ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }), displayOrder: 9 },
  ].map(p => ({
    code: p.code,
    name: p.name,
    maxPoints: p.maxPoints,
    hasSubMinimum: p.hasSubMinimum,
    subMinimumThreshold: p.maxPoints * ((p.subMinimumPercent ?? 0) / 100),
    displayOrder: p.displayOrder,
  }));

  // Use the verified totalMaxPoints from sectorConfig (source of truth from Excel)
  // rather than calculating from pillarConfigs which may have rounding errors
  const totalMaxPoints = config.totalMaxPoints ?? pillarConfigs.reduce((sum, p) => sum + p.maxPoints, 0);

  return {
    sectorCode: config.sectorCode.toUpperCase(),
    sectorName: config.sectorName,
    scorecardType: config.scorecardType,
    version: 'v1.0',
    totalMaxPoints,
    pillarConfigs,
    targets: config.targets as Record<string, unknown>,
    levelThresholds: config.levelThresholds,
    recognitionTable: config.recognitionTable,
    benefitFactors: config.benefitFactors,
    categoryWeightings: config.categoryWeightings,
    industryNorms: config.industryNorms,
  };
}

/**
 * Seed a single sector/type combination.
 */
async function seedSector(
  sectorCode: string,
  scorecardType: string,
  sectorRepo: SectorRuleRepository,
  criterionRepo: CriterionRepository,
  entityFieldRepo: EntityFieldRepository
): Promise<SeedResult> {
  const result: SeedResult = {
    sectorCode: sectorCode.toUpperCase(),
    scorecardType,
    sectorRuleStored: false,
    criteriaCount: 0,
    entityFieldsCount: 0,
    errors: [],
  };

  try {
    // Get sector config and manifest
    const config = getSectorConfig(sectorCode, scorecardType);
    let manifest: EntityManifest | null = null;
    // Construction uses its own indicator-matrix engine (constructionScoring.ts)
    // and does NOT use the legacy criteria/entityField extraction layer. Skip
    // manifest building so we don't write meaningless zero-target criteria
    // rows derived from the stubbed legacy targets.
    const isConstruction = sectorCode.toUpperCase() === 'CONSTRUCTION';
    if (!isConstruction) {
      try {
        manifest = await buildManifest(sectorCode, scorecardType);
      } catch {
        // Manifest build failed — continue with sector rule only
      }
    }

    // Get all manifests for pillar config building
    const allManifests = await getAllManifests();

    // 1. Store sector rule
    const sectorRule = toStoredSectorRule(config, allManifests);
    await sectorRepo.storeSectorRule(sectorRule);
    result.sectorRuleStored = true;

    // 2. Store criteria and entity fields (if manifest available)
    if (manifest) {
      // Store entity fields first (so edges can be created)
      for (const pack of manifest.pillarPacks) {
        for (const field of pack.entities) {
          try {
            const storedField = toStoredEntityField(
              field,
              sectorCode,
              scorecardType
            );
            await entityFieldRepo.storeEntityField(storedField);
            result.entityFieldsCount++;
          } catch (err) {
            result.errors.push(
              `Field ${field.id}: ${err instanceof Error ? err.message : 'unknown error'}`
            );
          }
        }
      }

      // Store criteria
      for (const pack of manifest.pillarPacks) {
        for (let i = 0; i < pack.criteria.length; i++) {
          const criterion = pack.criteria[i];
          try {
            const storedCriterion = toStoredCriterion(
              criterion,
              sectorCode,
              scorecardType,
              i
            );
            await criterionRepo.storeCriterion(storedCriterion);
            result.criteriaCount++;
          } catch (err) {
            result.errors.push(
              `Criterion ${criterion.code}: ${err instanceof Error ? err.message : 'unknown error'}`
            );
          }
        }
      }
    }
  } catch (err) {
    result.errors.push(
      `Sector seeding failed: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main Export Functions
// ---------------------------------------------------------------------------

/**
 * Seed the complete B-BBEE ontology into ArangoDB.
 *
 * This populates:
 *   - sector_rules: Sector configurations, pillar weights, targets, level thresholds
 *   - criteria: All scoreable criteria with formulas and input requirements
 *   - entity_fields: Atomic data fields with extraction hints and validation rules
 *
 * @param options Optional configuration
 * @returns Seed summary with counts and any errors
 */
export async function seedOntology(options?: {
  sectors?: Array<{ sectorCode: string; scorecardType: string }>;
  force?: boolean;
}): Promise<SeedSummary> {
  const startTime = Date.now();

  // Ensure collections exist
  await ensureCollections();

  // Initialize repositories
  const sectorRepo = new SectorRuleRepository();
  const criterionRepo = new CriterionRepository();
  const entityFieldRepo = new EntityFieldRepository();

  // Determine which sectors to seed
  const sectorsToSeed =
    options?.sectors ??
    listSectorConfigs().map(c => ({
      sectorCode: c.code,
      scorecardType: c.type,
    }));

  // Check for existing if not forcing
  let sectorsToActuallySeed = sectorsToSeed;
  if (!options?.force) {
    const existingSectors: Array<{ sectorCode: string; scorecardType: string }> =
      [];
    for (const { sectorCode, scorecardType } of sectorsToSeed) {
      const exists = await sectorRepo.exists(sectorCode, scorecardType);
      if (exists) {
        existingSectors.push({ sectorCode, scorecardType });
      }
    }

    if (existingSectors.length > 0) {
      logger.info('Skipping existing sectors', { skippedCount: existingSectors.length, hint: 'use force: true to override' });
      // Filter out existing sectors so we don't re-seed them
      const existingKeys = new Set(existingSectors.map(s => `${s.sectorCode}-${s.scorecardType}`));
      sectorsToActuallySeed = sectorsToSeed.filter(
        s => !existingKeys.has(`${s.sectorCode}-${s.scorecardType}`)
      );
    }

    if (sectorsToActuallySeed.length === 0) {
      logger.info('All sectors already seeded, nothing to do');
      return {
        totalSectors: 0,
        totalCriteria: 0,
        totalEntityFields: 0,
        results: [],
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Seed each sector
  const results: SeedResult[] = [];
  for (const { sectorCode, scorecardType } of sectorsToActuallySeed) {
    logger.info('Seeding sector', { sectorCode, scorecardType });
    const result = await seedSector(
      sectorCode,
      scorecardType,
      sectorRepo,
      criterionRepo,
      entityFieldRepo
    );
    results.push(result);

    if (result.errors.length > 0) {
      logger.warn('Sector seeding completed with errors', { sectorCode, scorecardType, errorCount: result.errors.length });
    } else {
      logger.info('Sector seeded', { sectorCode, scorecardType, criteriaCount: result.criteriaCount, entityFieldsCount: result.entityFieldsCount });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    totalSectors: results.length,
    totalCriteria: results.reduce((sum, r) => sum + r.criteriaCount, 0),
    totalEntityFields: results.reduce((sum, r) => sum + r.entityFieldsCount, 0),
    results,
    durationMs,
  };
}

/**
 * Seed a single sector/type combination (for targeted updates).
 */
export async function seedSectorOntology(
  sectorCode: string,
  scorecardType: string,
  options?: { force?: boolean }
): Promise<SeedResult> {
  await ensureCollections();

  const sectorRepo = new SectorRuleRepository();
  const criterionRepo = new CriterionRepository();
  const entityFieldRepo = new EntityFieldRepository();

  // Check for existing
  if (!options?.force) {
    const exists = await sectorRepo.exists(sectorCode, scorecardType);
    if (exists) {
      return {
        sectorCode: sectorCode.toUpperCase(),
        scorecardType,
        sectorRuleStored: false,
        criteriaCount: 0,
        entityFieldsCount: 0,
        errors: ['Sector already exists (use force: true to override)'],
      };
    }
  }

  return seedSector(
    sectorCode,
    scorecardType,
    sectorRepo,
    criterionRepo,
    entityFieldRepo
  );
}

/**
 * Verify the ontology is properly seeded.
 */
export async function verifyOntology(): Promise<{
  ok: boolean;
  sectors: Array<{
    sectorCode: string;
    scorecardType: string;
    ruleExists: boolean;
    criteriaCount: number;
    entityFieldsCount: number;
  }>;
  missing: string[];
}> {
  const sectorRepo = new SectorRuleRepository();
  const criterionRepo = new CriterionRepository();
  const entityFieldRepo = new EntityFieldRepository();

  const sectors = listSectorConfigs();
  const results: Array<{
    sectorCode: string;
    scorecardType: string;
    ruleExists: boolean;
    criteriaCount: number;
    entityFieldsCount: number;
  }> = [];
  const missing: string[] = [];

  for (const { code, type } of sectors) {
    const rule = await sectorRepo.getSectorRule(code, type);
    const criteriaCount = await criterionRepo.countBySector(code, type);
    const entityFieldsCount = await entityFieldRepo.countBySector(code, type);

    results.push({
      sectorCode: code,
      scorecardType: type,
      ruleExists: rule !== null,
      criteriaCount,
      entityFieldsCount,
    });

    if (!rule) {
      missing.push(`${code} ${type} sector rule`);
    }
  }

  return {
    ok: missing.length === 0,
    sectors: results,
    missing,
  };
}

/**
 * Clear all ontology data (use with caution).
 */
export async function clearOntology(): Promise<{
  sectorsRemoved: number;
  criteriaRemoved: number;
  entityFieldsRemoved: number;
}> {
  const { getArangoDB } = await import('../arango/connection.js');
  const { COLLECTIONS } = await import('../arango/collections.js');
  const db = getArangoDB();

  const criteriaCursor = await db.query(`
    FOR c IN ${COLLECTIONS.criteria}
      REMOVE c IN ${COLLECTIONS.criteria}
      COLLECT WITH COUNT INTO removed
    RETURN removed
  `);
  const criteriaRemoved = (await criteriaCursor.next()) || 0;

  const fieldsCursor = await db.query(`
    FOR e IN ${COLLECTIONS.entityFields}
      REMOVE e IN ${COLLECTIONS.entityFields}
      COLLECT WITH COUNT INTO removed
    RETURN removed
  `);
  const entityFieldsRemoved = (await fieldsCursor.next()) || 0;

  const sectorsCursor = await db.query(`
    FOR s IN ${COLLECTIONS.sectorRules}
      REMOVE s IN ${COLLECTIONS.sectorRules}
      COLLECT WITH COUNT INTO removed
    RETURN removed
  `);
  const sectorsRemoved = (await sectorsCursor.next()) || 0;

  return { sectorsRemoved, criteriaRemoved, entityFieldsRemoved };
}

// ---------------------------------------------------------------------------
// CLI / Direct Execution
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  // Running as script
  seedOntology({ force: process.argv.includes('--force') })
    .then(summary => {
      logger.info('Seed complete', {
        totalSectors: summary.totalSectors,
        totalCriteria: summary.totalCriteria,
        totalEntityFields: summary.totalEntityFields,
        durationMs: summary.durationMs,
      });

      const errors = summary.results.flatMap(r =>
        r.errors.map(e => `  - ${r.sectorCode} ${r.scorecardType}: ${e}`)
      );
      if (errors.length > 0) {
        logger.warn('Seed completed with errors', { errorCount: errors.length, errors });
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(err => {
      logger.error('Seed failed', err);
      process.exit(1);
    });
}
