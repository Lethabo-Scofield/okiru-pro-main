/**
 * Assessment Repository
 *
 * Manages client B-BBEE assessments -- the evaluation of a specific
 * client for a specific financial year under a specific scorecard type.
 * Stores extracted cell values, calculation results, and audit trails.
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Assessment {
  _key?: string;
  clientId: string;
  clientName: string;
  financialYear: string;
  scorecardId: string;
  sectorCode: string;
  scorecardType: string;
  status: 'draft' | 'extracted' | 'calculated' | 'verified' | 'failed';
  sourceFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CellValue {
  _key?: string;
  assessmentId: string;
  sheet: string;
  cellAddress: string;
  row: number;
  column: string;
  rawValue: unknown;
  extractedValue: unknown;
  extractedType: string;
  formula: string | null;
  confidence: number;
  provenanceId: string | null;
  semanticTag: unknown;
}

export interface CalculationResult {
  _key?: string;
  assessmentId: string;
  pillar: string;
  pillarCode: string;
  calculatedPoints: number;
  maxPoints: number;
  percentage: number;
  subMinimumMet: boolean;
  breakdown: Record<string, number>;
  inputs: Record<string, unknown>;
  calculatedAt: string;
}

export interface AuditEntry {
  _key?: string;
  assessmentId: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AssessmentRepository {
  private get db() { return getArangoDB(); }

  async createAssessment(assessment: Omit<Assessment, '_key' | 'createdAt' | 'updatedAt'>): Promise<Assessment> {
    const now = new Date().toISOString();
    const doc = { ...assessment, createdAt: now, updatedAt: now };
    const col = this.db.collection(COLLECTIONS.assessments);
    const result = await col.save(doc);

    const edgeCol = this.db.collection(EDGE_COLLECTIONS.scoredUnder);
    await edgeCol.save({
      _from: `${COLLECTIONS.assessments}/${result._key}`,
      _to: `${COLLECTIONS.scorecards}/${assessment.scorecardId}`,
    });

    return { ...doc, _key: result._key };
  }

  async getAssessment(key: string): Promise<Assessment | null> {
    try {
      const col = this.db.collection(COLLECTIONS.assessments);
      return await col.document(key);
    } catch {
      return null;
    }
  }

  async getAssessmentsByClient(clientId: string): Promise<Assessment[]> {
    const cursor = await this.db.query(aql`
      FOR a IN ${this.db.collection(COLLECTIONS.assessments)}
        FILTER a.clientId == ${clientId}
        SORT a.createdAt DESC
        RETURN a
    `);
    return cursor.all();
  }

  async updateAssessmentStatus(key: string, status: Assessment['status']): Promise<void> {
    const col = this.db.collection(COLLECTIONS.assessments);
    await col.update(key, { status, updatedAt: new Date().toISOString() });
  }

  async storeCellValues(values: CellValue[]): Promise<number> {
    if (values.length === 0) return 0;
    const col = this.db.collection(COLLECTIONS.cellValues);
    const results = await col.saveAll(values);
    return results.length;
  }

  async getCellValues(assessmentId: string, sheet?: string): Promise<CellValue[]> {
    const cursor = sheet
      ? await this.db.query(aql`
          FOR c IN ${this.db.collection(COLLECTIONS.cellValues)}
            FILTER c.assessmentId == ${assessmentId} AND c.sheet == ${sheet}
            RETURN c
        `)
      : await this.db.query(aql`
          FOR c IN ${this.db.collection(COLLECTIONS.cellValues)}
            FILTER c.assessmentId == ${assessmentId}
            RETURN c
        `);
    return cursor.all();
  }

  async storeCalculationResult(result: CalculationResult): Promise<CalculationResult> {
    const col = this.db.collection(COLLECTIONS.calculationResults);
    const saved = await col.save(result);
    return { ...result, _key: saved._key };
  }

  async getCalculationResults(assessmentId: string): Promise<CalculationResult[]> {
    const cursor = await this.db.query(aql`
      FOR r IN ${this.db.collection(COLLECTIONS.calculationResults)}
        FILTER r.assessmentId == ${assessmentId}
        SORT r.pillar
        RETURN r
    `);
    return cursor.all();
  }

  async addAuditEntry(entry: Omit<AuditEntry, '_key'>): Promise<AuditEntry> {
    const col = this.db.collection(COLLECTIONS.auditEntries);
    const result = await col.save(entry);
    return { ...entry, _key: result._key };
  }

  async getAuditTrail(assessmentId: string): Promise<AuditEntry[]> {
    const cursor = await this.db.query(aql`
      FOR e IN ${this.db.collection(COLLECTIONS.auditEntries)}
        FILTER e.assessmentId == ${assessmentId}
        SORT e.timestamp
        RETURN e
    `);
    return cursor.all();
  }
}
