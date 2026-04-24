/**
 * Criterion Repository
 *
 * Manages B-BBEE criteria (scoreable line items) within pillars.
 * Each criterion defines its target, max points, formula, and input entities.
 *
 * Hierarchy: SectorRule → Criterion → EntityField (via feedsInto edges)
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredCriterion {
  _key?: string;
  code: string;
  name: string;
  pillarCode: string;
  sectorCode: string;
  scorecardType: string;
  target: number | string;
  maxPoints: number;
  formulaId: string;
  inputEntities: string[];
  bonusCondition?: string;
  minimumThreshold?: number;
  evidenceRequired: string[];
  sectorOverrides?: Record<string, { target?: number | string; maxPoints?: number }>;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CriterionWithInputs extends StoredCriterion {
  inputEntityFields: Array<{
    _key: string;
    id: string;
    name: string;
    fieldType: string;
  }>;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CriterionRepository {
  private get db() { return getArangoDB(); }

  /**
   * Store a single criterion.
   */
  async storeCriterion(
    criterion: Omit<StoredCriterion, '_key' | 'createdAt' | 'updatedAt'>
  ): Promise<StoredCriterion> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.criteria);

    const doc = { ...criterion, createdAt: now, updatedAt: now };
    const result = await col.save(doc);

    // Create edges to input entity fields
    if (criterion.inputEntities.length > 0) {
      const edgeCol = this.db.collection(EDGE_COLLECTIONS.feedsInto);
      for (const entityId of criterion.inputEntities) {
        try {
          await edgeCol.save({
            _from: `${COLLECTIONS.entityFields}/${entityId}_${criterion.sectorCode}_${criterion.scorecardType}`,
            _to: result._id,
          });
        } catch {
          // Entity field may not exist yet; edges created during entity seeding
        }
      }
    }

    return { ...doc, _key: result._key };
  }

  /**
   * Store multiple criteria in bulk.
   */
  async storeCriteria(
    criteria: Array<Omit<StoredCriterion, '_key' | 'createdAt' | 'updatedAt'>>
  ): Promise<StoredCriterion[]> {
    const results: StoredCriterion[] = [];
    for (const criterion of criteria) {
      results.push(await this.storeCriterion(criterion));
    }
    return results;
  }

  /**
   * Get criterion by code, sector, and type.
   */
  async getCriterion(
    code: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredCriterion | null> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.code == ${code}
          AND c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        LIMIT 1
        RETURN c
    `);
    return cursor.next() || null;
  }

  /**
   * Get all criteria for a sector/type.
   */
  async getCriteriaBySector(
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredCriterion[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        SORT c.pillarCode, c.displayOrder, c.code
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Get criteria for a specific pillar.
   */
  async getCriteriaByPillar(
    pillarCode: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredCriterion[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.pillarCode == ${pillarCode}
          AND c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        SORT c.displayOrder, c.code
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Get criterion with its input entity fields.
   */
  async getCriterionWithInputs(
    code: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<CriterionWithInputs | null> {
    const criterion = await this.getCriterion(code, sectorCode, scorecardType);
    if (!criterion) return null;

    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
          AND e.id IN ${criterion.inputEntities}
        RETURN { _key: e._key, id: e.id, name: e.name, fieldType: e.fieldType }
    `);
    const inputEntityFields = await cursor.all();

    return { ...criterion, inputEntityFields };
  }

  /**
   * Get criteria by formula ID (useful for batch calculations).
   */
  async getCriteriaByFormula(
    formulaId: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredCriterion[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.formulaId == ${formulaId}
          AND c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        SORT c.pillarCode, c.code
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Get all criteria that use a specific entity as input.
   */
  async getCriteriaUsingEntity(
    entityId: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredCriterion[]> {
    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER ${entityId} IN c.inputEntities
          AND c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        SORT c.pillarCode, c.code
        RETURN c
    `);
    return cursor.all();
  }

  /**
   * Delete criterion by key.
   */
  async deleteCriterion(key: string): Promise<boolean> {
    try {
      await this.db.collection(COLLECTIONS.criteria).remove(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Count criteria for a sector.
   */
  async countBySector(sectorCode: string, scorecardType: string): Promise<number> {
    const cursor = await this.db.query(aql`
      RETURN LENGTH(
        FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
          FILTER c.sectorCode == ${sectorCode.toUpperCase()}
            AND c.scorecardType == ${scorecardType}
          RETURN 1
      )
    `);
    return cursor.next() || 0;
  }

  /**
   * Update sector override for a criterion.
   */
  async updateSectorOverride(
    code: string,
    sectorCode: string,
    scorecardType: string,
    overrideSector: string,
    override: { target?: number | string; maxPoints?: number }
  ): Promise<boolean> {
    const criterion = await this.getCriterion(code, sectorCode, scorecardType);
    if (!criterion?._key) return false;

    const existingOverrides = criterion.sectorOverrides || {};
    const updatedOverrides = {
      ...existingOverrides,
      [overrideSector]: override,
    };

    await this.db.collection(COLLECTIONS.criteria).update(criterion._key, {
      sectorOverrides: updatedOverrides,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }
}
