/**
 * Sector Rule Repository
 *
 * Stores B-BBEE sector configurations, pillar weights, compliance targets,
 * and level thresholds in ArangoDB as the source of truth.
 *
 * The hierarchy is:
 *   SectorRule → PillarConfig[] → Targets → LevelThresholds
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types (matching sectorConfig.ts structure for persistence)
// ---------------------------------------------------------------------------

export interface StoredPillarConfig {
  code: string;
  name: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  displayOrder: number;
}

export interface StoredLevelThreshold {
  level: number;
  minPoints: number;
  recognition: number;
}

export interface StoredSectorRule {
  _key?: string;
  sectorCode: string;
  sectorName: string;
  scorecardType: 'Generic' | 'QSE' | 'EME';
  version: string;
  totalMaxPoints: number;
  pillarConfigs: StoredPillarConfig[];
  targets: Record<string, unknown>;
  levelThresholds: StoredLevelThreshold[];
  recognitionTable?: Array<{ beeLevel: number; recognitionPercent: number; multiplier: number }>;
  benefitFactors?: Array<{ contributionType: string; sdFactor: number; edFactor: number }>;
  categoryWeightings?: Array<{ code: string; name: string; weighting: number; cap?: number }>;
  industryNorms?: Array<{ industry: string; normPercent: number; quarterThresholdPercent: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface SectorRuleWithRelations extends StoredSectorRule {
  criteria: Array<{ _key: string; code: string; name: string }>;
  entityFields: Array<{ _key: string; id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SectorRuleRepository {
  private get db() { return getArangoDB(); }

  /**
   * Store a sector rule configuration.
   * Creates or updates based on sectorCode + scorecardType composite key.
   */
  async storeSectorRule(rule: Omit<StoredSectorRule, '_key' | 'createdAt' | 'updatedAt'>): Promise<StoredSectorRule> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.sectorRules);

    // Check for existing
    const existing = await this.getSectorRule(rule.sectorCode, rule.scorecardType);

    if (existing?._key) {
      // Update
      const update = {
        ...rule,
        updatedAt: now,
      };
      await col.update(existing._key, update);
      return { ...existing, ...update };
    }

    // Create new
    const doc = { ...rule, createdAt: now, updatedAt: now };
    const result = await col.save(doc, { overwriteMode: 'ignore' });
    return { ...doc, _key: result._key };
  }

  /**
   * Get sector rule by sector code and type.
   */
  async getSectorRule(sectorCode: string, scorecardType: string): Promise<StoredSectorRule | null> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.sectorRules)}
        FILTER s.sectorCode == ${sectorCode.toUpperCase()} 
          AND s.scorecardType == ${scorecardType}
        SORT s.updatedAt DESC
        LIMIT 1
        RETURN s
    `);
    return cursor.next() || null;
  }

  /**
   * Get all sector rules.
   */
  async listSectorRules(): Promise<StoredSectorRule[]> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.sectorRules)}
        SORT s.sectorCode, s.scorecardType
        RETURN s
    `);
    return cursor.all();
  }

  /**
   * Get sector rule with all related criteria and entity fields.
   */
  async getFullSectorRule(sectorCode: string, scorecardType: string): Promise<SectorRuleWithRelations | null> {
    const rule = await this.getSectorRule(sectorCode, scorecardType);
    if (!rule?._key) return null;

    // Get related criteria
    const criteriaCursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        SORT c.pillarCode, c.code
        RETURN { _key: c._key, code: c.code, name: c.name }
    `);
    const criteria = await criteriaCursor.all();

    // Get related entity fields
    const fieldsCursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        SORT e.pillarCode, e.id
        RETURN { _key: e._key, id: e.id, name: e.name }
    `);
    const entityFields = await fieldsCursor.all();

    return { ...rule, criteria, entityFields };
  }

  /**
   * Delete sector rule and all related criteria/entity fields.
   */
  async deleteSectorRule(sectorCode: string, scorecardType: string): Promise<boolean> {
    const rule = await this.getSectorRule(sectorCode, scorecardType);
    if (!rule?._key) return false;

    // Delete related criteria
    await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        REMOVE c IN ${this.db.collection(COLLECTIONS.criteria)}
    `);

    // Delete related entity fields
    await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        REMOVE e IN ${this.db.collection(COLLECTIONS.entityFields)}
    `);

    // Delete rule
    await this.db.collection(COLLECTIONS.sectorRules).remove(rule._key);
    return true;
  }

  /**
   * Check if sector rule exists.
   */
  async exists(sectorCode: string, scorecardType: string): Promise<boolean> {
    const rule = await this.getSectorRule(sectorCode, scorecardType);
    return rule !== null;
  }

  /**
   * Get total max points for a sector (for validation).
   */
  async getTotalMaxPoints(sectorCode: string, scorecardType: string): Promise<number | null> {
    const rule = await this.getSectorRule(sectorCode, scorecardType);
    return rule?.totalMaxPoints ?? null;
  }
}
