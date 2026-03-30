/**
 * Entity Field Repository
 *
 * Manages atomic data fields (EntityFields) that feed into criteria.
 * Each field has extraction hints, validation rules, and UI config.
 *
 * Hierarchy: SectorRule → EntityField → Criterion (via feedsInto edges)
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types (aligned with entityManifest.ts EntityField)
// ---------------------------------------------------------------------------

export interface StoredEntityField {
  _key?: string;
  id: string;
  name: string;
  pillarCode: string;
  sectorCode: string;
  scorecardType: string;
  criterionCodes: string[];
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
  validation: {
    min?: number;
    max?: number;
    enum?: string[];
    sumsWith?: string[];
  };
  extraction: {
    definition: string;
    aliases: string[];
    zones: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    mustHaveKeywords: string[];
    niceToHaveKeywords: string[];
    excludeKeywords: string[];
  };
  ui?: {
    inputType: 'text' | 'number' | 'select' | 'date' | 'toggle' | 'percentage';
    placeholder?: string;
    helpText?: string;
    group?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EntityFieldWithCriteria extends StoredEntityField {
  feedsInto: Array<{
    _key: string;
    code: string;
    name: string;
    formulaId: string;
  }>;
}

export interface ExtractableField {
  id: string;
  name: string;
  definition: string;
  aliases: string[];
  zones: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  fieldType: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class EntityFieldRepository {
  private get db() { return getArangoDB(); }

  /**
   * Store a single entity field.
   */
  async storeEntityField(
    field: Omit<StoredEntityField, '_key' | 'createdAt' | 'updatedAt'>
  ): Promise<StoredEntityField> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.entityFields);

    // Composite key: id + sectorCode + scorecardType
    const key = `${field.id}_${field.sectorCode}_${field.scorecardType}`;
    const doc = { ...field, _key: key, createdAt: now, updatedAt: now };

    const result = await col.save(doc, { overwriteMode: 'replace' });

    // Create edges to criteria this field feeds into
    if (field.criterionCodes.length > 0) {
      const edgeCol = this.db.collection(EDGE_COLLECTIONS.feedsInto);
      for (const criterionCode of field.criterionCodes) {
        try {
          const criteriaCursor = await this.db.query(aql`
            FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
              FILTER c.code == ${criterionCode}
                AND c.sectorCode == ${field.sectorCode.toUpperCase()}
                AND c.scorecardType == ${field.scorecardType}
              LIMIT 1
              RETURN c._id
          `);
          const criterionId = await criteriaCursor.next();
          if (criterionId) {
            await edgeCol.save({
              _from: result._id,
              _to: criterionId,
            });
          }
        } catch {
          // Criterion may not exist yet
        }
      }
    }

    return { ...doc, _key: result._key };
  }

  /**
   * Store multiple entity fields in bulk.
   */
  async storeEntityFields(
    fields: Array<Omit<StoredEntityField, '_key' | 'createdAt' | 'updatedAt'>>
  ): Promise<StoredEntityField[]> {
    const results: StoredEntityField[] = [];
    for (const field of fields) {
      results.push(await this.storeEntityField(field));
    }
    return results;
  }

  /**
   * Get entity field by composite id.
   */
  async getEntityField(
    id: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField | null> {
    const key = `${id}_${sectorCode}_${scorecardType}`.toUpperCase();
    try {
      return await this.db.collection(COLLECTIONS.entityFields).document(key);
    } catch {
      return null;
    }
  }

  /**
   * Get all entity fields for a sector/type.
   */
  async getEntityFieldsBySector(
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        SORT e.pillarCode, e.id
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Get entity fields for a specific pillar.
   */
  async getEntityFieldsByPillar(
    pillarCode: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.pillarCode == ${pillarCode}
          AND e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        SORT e.id
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Get entity fields that feed into a specific criterion.
   */
  async getEntityFieldsForCriterion(
    criterionCode: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER ${criterionCode} IN e.criterionCodes
          AND e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        SORT e.id
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Get entity field with its downstream criteria.
   */
  async getEntityFieldWithCriteria(
    id: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<EntityFieldWithCriteria | null> {
    const field = await this.getEntityField(id, sectorCode, scorecardType);
    if (!field) return null;

    const cursor = await this.db.query(aql`
      FOR c IN ${this.db.collection(COLLECTIONS.criteria)}
        FILTER c.code IN ${field.criterionCodes}
          AND c.sectorCode == ${sectorCode.toUpperCase()}
          AND c.scorecardType == ${scorecardType}
        RETURN { _key: c._key, code: c.code, name: c.name, formulaId: c.formulaId }
    `);
    const feedsInto = await cursor.all();

    return { ...field, feedsInto };
  }

  /**
   * Get fields optimized for extraction pipeline.
   */
  async getExtractableFields(
    sectorCode: string,
    scorecardType: string
  ): Promise<ExtractableField[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
        SORT e.pillarCode, e.id
        RETURN {
          id: e.id,
          name: e.name,
          definition: e.extraction.definition,
          aliases: e.extraction.aliases,
          zones: e.extraction.zones,
          positiveExamples: e.extraction.positiveExamples,
          negativeExamples: e.extraction.negativeExamples,
          fieldType: e.fieldType
        }
    `);
    return cursor.all();
  }

  /**
   * Find fields by keyword in name or aliases (fuzzy search).
   */
  async searchFields(
    keyword: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField[]> {
    const lowerKeyword = keyword.toLowerCase();
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
          AND (
            CONTAINS(LOWER(e.name), ${lowerKeyword})
            OR LENGTH(
              FOR alias IN e.extraction.aliases
                FILTER CONTAINS(LOWER(alias), ${lowerKeyword})
                RETURN 1
            ) > 0
          )
        SORT e.pillarCode, e.id
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Get fields that can be extracted from a specific zone/sheet.
   */
  async getFieldsForZone(
    zone: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<StoredEntityField[]> {
    const lowerZone = zone.toLowerCase();
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
          AND LENGTH(
            FOR z IN e.extraction.zones
              FILTER CONTAINS(LOWER(z), ${lowerZone})
              RETURN 1
          ) > 0
        SORT e.id
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Delete entity field by composite key.
   */
  async deleteEntityField(
    id: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<boolean> {
    const key = `${id}_${sectorCode}_${scorecardType}`.toUpperCase();
    try {
      await this.db.collection(COLLECTIONS.entityFields).remove(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Count entity fields for a sector.
   */
  async countBySector(sectorCode: string, scorecardType: string): Promise<number> {
    const cursor = await this.db.query(aql`
      RETURN LENGTH(
        FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
          FILTER e.sectorCode == ${sectorCode.toUpperCase()}
            AND e.scorecardType == ${scorecardType}
          RETURN 1
      )
    `);
    return cursor.next() || 0;
  }

  /**
   * Get all unique field groups for UI organization.
   */
  async getFieldGroups(
    pillarCode: string,
    sectorCode: string,
    scorecardType: string
  ): Promise<string[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.entityFields)}
        FILTER e.pillarCode == ${pillarCode}
          AND e.sectorCode == ${sectorCode.toUpperCase()}
          AND e.scorecardType == ${scorecardType}
          AND e.ui.group != null
        COLLECT group = e.ui.group
        SORT group
        RETURN group
    `);
    return cursor.all();
  }
}
