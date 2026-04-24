/**
 * Evidence Repository
 *
 * Stores evidence references linking extracted values to their source documents.
 * Each evidence record traces a field value back to its origin (Excel cell, PDF page, etc.)
 *
 * Hierarchy: Assessment → EvidenceRef → EntityField
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types (aligned with entityManifest.ts EvidenceRef)
// ---------------------------------------------------------------------------

export interface StoredEvidenceRef {
  _key?: string;
  assessmentId: string;
  entityFieldId: string;
  sectorCode: string;
  scorecardType: string;
  documentType: 'toolkit_excel' | 'pdf_certificate' | 'manual_input' | 'info_request' | 'csv_import';
  documentName?: string;
  sheetName?: string;
  cellAddress?: string;
  pageNumber?: number;
  rowRange?: string;
  uploadedAt?: string;
  extractedAt: string;
  confidence?: number;
  rawValue?: unknown;
  normalizedValue?: unknown;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface EvidenceWithField extends StoredEvidenceRef {
  fieldName: string;
  pillarCode: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class EvidenceRepository {
  private get db() { return getArangoDB(); }

  /**
   * Store evidence reference for an extracted/entered value.
   */
  async storeEvidence(
    evidence: Omit<StoredEvidenceRef, '_key' | 'extractedAt'>
  ): Promise<StoredEvidenceRef> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.evidenceRefs);

    // Composite key: assessmentId + entityFieldId
    const key = `${evidence.assessmentId}_${evidence.entityFieldId}`;
    const doc = {
      ...evidence,
      _key: key,
      extractedAt: now,
    };

    const result = await col.save(doc, { overwriteMode: 'replace' });

    // Create edge to entity field
    try {
      const edgeCol = this.db.collection(EDGE_COLLECTIONS.hasEvidence);
      const fieldKey = `${evidence.entityFieldId}_${evidence.sectorCode}_${evidence.scorecardType}`.toUpperCase();
      await edgeCol.save({
        _from: `${COLLECTIONS.entityFields}/${fieldKey}`,
        _to: result._id,
      });
    } catch {
      // Entity field may not exist in DB
    }

    return { ...doc, _key: result._key };
  }

  /**
   * Store multiple evidence references in bulk.
   */
  async storeEvidences(
    evidences: Array<Omit<StoredEvidenceRef, '_key' | 'extractedAt'>>
  ): Promise<StoredEvidenceRef[]> {
    const results: StoredEvidenceRef[] = [];
    for (const evidence of evidences) {
      results.push(await this.storeEvidence(evidence));
    }
    return results;
  }

  /**
   * Get evidence by composite key.
   */
  async getEvidence(
    assessmentId: string,
    entityFieldId: string
  ): Promise<StoredEvidenceRef | null> {
    const key = `${assessmentId}_${entityFieldId}`;
    try {
      return await this.db.collection(COLLECTIONS.evidenceRefs).document(key);
    } catch {
      return null;
    }
  }

  /**
   * Get all evidence for an assessment.
   */
  async getEvidenceForAssessment(assessmentId: string): Promise<StoredEvidenceRef[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
        FILTER e.assessmentId == ${assessmentId}
        SORT e.entityFieldId
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Get evidence with field names for an assessment.
   */
  async getEvidenceWithFields(assessmentId: string): Promise<EvidenceWithField[]> {
    const cursor = await this.db.query(aql`
      FOR ev IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
        FILTER ev.assessmentId == ${assessmentId}
        LET field = DOCUMENT(${this.db.collection(COLLECTIONS.entityFields)},
          CONCAT(ev.entityFieldId, "_", ev.sectorCode, "_", ev.scorecardType))
        SORT ev.entityFieldId
        RETURN {
          _key: ev._key,
          assessmentId: ev.assessmentId,
          entityFieldId: ev.entityFieldId,
          sectorCode: ev.sectorCode,
          scorecardType: ev.scorecardType,
          documentType: ev.documentType,
          documentName: ev.documentName,
          sheetName: ev.sheetName,
          cellAddress: ev.cellAddress,
          pageNumber: ev.pageNumber,
          rowRange: ev.rowRange,
          uploadedAt: ev.uploadedAt,
          extractedAt: ev.extractedAt,
          confidence: ev.confidence,
          rawValue: ev.rawValue,
          normalizedValue: ev.normalizedValue,
          verifiedBy: ev.verifiedBy,
          verifiedAt: ev.verifiedAt,
          notes: ev.notes,
          fieldName: field != null ? field.name : ev.entityFieldId,
          pillarCode: field != null ? field.pillarCode : "unknown"
        }
    `);
    return cursor.all();
  }

  /**
   * Get evidence for a specific field in an assessment.
   */
  async getEvidenceForField(
    assessmentId: string,
    entityFieldId: string
  ): Promise<StoredEvidenceRef | null> {
    return this.getEvidence(assessmentId, entityFieldId);
  }

  /**
   * Get evidence by document type.
   */
  async getEvidenceByDocumentType(
    assessmentId: string,
    documentType: StoredEvidenceRef['documentType']
  ): Promise<StoredEvidenceRef[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
        FILTER e.assessmentId == ${assessmentId}
          AND e.documentType == ${documentType}
        SORT e.entityFieldId
        RETURN e
    `);
    return cursor.all();
  }

  /**
   * Update evidence with verification info.
   */
  async verifyEvidence(
    assessmentId: string,
    entityFieldId: string,
    verifiedBy: string,
    notes?: string
  ): Promise<boolean> {
    const key = `${assessmentId}_${entityFieldId}`;
    try {
      await this.db.collection(COLLECTIONS.evidenceRefs).update(key, {
        verifiedBy,
        verifiedAt: new Date().toISOString(),
        ...(notes && { notes }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update the normalized value for evidence.
   */
  async updateNormalizedValue(
    assessmentId: string,
    entityFieldId: string,
    normalizedValue: unknown
  ): Promise<boolean> {
    const key = `${assessmentId}_${entityFieldId}`;
    try {
      await this.db.collection(COLLECTIONS.evidenceRefs).update(key, {
        normalizedValue,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete evidence reference.
   */
  async deleteEvidence(
    assessmentId: string,
    entityFieldId: string
  ): Promise<boolean> {
    const key = `${assessmentId}_${entityFieldId}`;
    try {
      await this.db.collection(COLLECTIONS.evidenceRefs).remove(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all evidence for an assessment.
   */
  async deleteEvidenceForAssessment(assessmentId: string): Promise<number> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
        FILTER e.assessmentId == ${assessmentId}
        REMOVE e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
        COLLECT WITH COUNT INTO removed
      RETURN removed
    `);
    return cursor.next() || 0;
  }

  /**
   * Get confidence statistics for an assessment.
   */
  async getConfidenceStats(assessmentId: string): Promise<{
    total: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    manualInput: number;
    avgConfidence: number;
  }> {
    const cursor = await this.db.query(aql`
      LET stats = (
        FOR e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
          FILTER e.assessmentId == ${assessmentId}
          RETURN {
            confidence: e.confidence,
            isManual: e.documentType == "manual_input"
          }
      )
      RETURN {
        total: LENGTH(stats),
        highConfidence: LENGTH(FOR s IN stats FILTER s.confidence >= 0.9 RETURN 1),
        mediumConfidence: LENGTH(FOR s IN stats FILTER s.confidence >= 0.7 AND s.confidence < 0.9 RETURN 1),
        lowConfidence: LENGTH(FOR s IN stats FILTER s.confidence < 0.7 RETURN 1),
        manualInput: LENGTH(FOR s IN stats FILTER s.isManual RETURN 1),
        avgConfidence: AVG(FOR s IN stats RETURN s.confidence)
      }
    `);
    return cursor.next() || {
      total: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, manualInput: 0, avgConfidence: 0,
    };
  }

  /**
   * Check if all required fields have evidence.
   */
  async hasCompleteEvidence(
    assessmentId: string,
    requiredFieldIds: string[]
  ): Promise<{ complete: boolean; missing: string[] }> {
    const cursor = await this.db.query(aql`
      LET existing = (
        FOR e IN ${this.db.collection(COLLECTIONS.evidenceRefs)}
          FILTER e.assessmentId == ${assessmentId}
          RETURN e.entityFieldId
      )
      RETURN {
        complete: LENGTH(${requiredFieldIds}) == LENGTH(
          FOR f IN ${requiredFieldIds}
            FILTER f IN existing
            RETURN 1
        ),
        missing: (
          FOR f IN ${requiredFieldIds}
            FILTER f NOT IN existing
            RETURN f
        )
      }
    `);
    return cursor.next() || { complete: false, missing: requiredFieldIds };
  }
}
