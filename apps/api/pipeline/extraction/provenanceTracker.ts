/**
 * Provenance Tracker
 *
 * Records the exact origin of every extracted value -- which workbook,
 * sheet, row, column, and raw cell content produced each datum.  This
 * creates an audit trail from any final scorecard number back to the
 * source Excel cell.
 */

export interface ProvenanceRecord {
  id: string;
  sourceFile: string;
  sheet: string;
  cellAddress: string;
  row: number;
  column: string;
  rawValue: unknown;
  rawType: 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty';
  formula: string | null;
  extractedValue: unknown;
  extractedType: string;
  confidence: number;
  extractedAt: string;
  context: {
    leftLabel: string | null;
    aboveLabel: string | null;
    headerLabel: string | null;
  };
}

export class ProvenanceTracker {
  private records: ProvenanceRecord[] = [];
  private idCounter = 0;

  constructor(private sourceFile: string) {}

  record(params: {
    sheet: string;
    cellAddress: string;
    row: number;
    column: string;
    rawValue: unknown;
    rawType: ProvenanceRecord['rawType'];
    formula?: string | null;
    extractedValue: unknown;
    extractedType: string;
    confidence: number;
    context?: Partial<ProvenanceRecord['context']>;
  }): string {
    const id = `prov_${++this.idCounter}`;
    this.records.push({
      id,
      sourceFile: this.sourceFile,
      sheet: params.sheet,
      cellAddress: params.cellAddress,
      row: params.row,
      column: params.column,
      rawValue: params.rawValue,
      rawType: params.rawType,
      formula: params.formula ?? null,
      extractedValue: params.extractedValue,
      extractedType: params.extractedType,
      confidence: params.confidence,
      extractedAt: new Date().toISOString(),
      context: {
        leftLabel: params.context?.leftLabel ?? null,
        aboveLabel: params.context?.aboveLabel ?? null,
        headerLabel: params.context?.headerLabel ?? null,
      },
    });
    return id;
  }

  getAll(): ProvenanceRecord[] {
    return [...this.records];
  }

  getById(id: string): ProvenanceRecord | undefined {
    return this.records.find(r => r.id === id);
  }

  getBySheet(sheet: string): ProvenanceRecord[] {
    return this.records.filter(r => r.sheet === sheet);
  }

  getByType(extractedType: string): ProvenanceRecord[] {
    return this.records.filter(r => r.extractedType === extractedType);
  }

  getLowConfidence(threshold = 0.6): ProvenanceRecord[] {
    return this.records.filter(r => r.confidence < threshold);
  }

  summary(): {
    totalRecords: number;
    bySheet: Record<string, number>;
    byType: Record<string, number>;
    avgConfidence: number;
    lowConfidenceCount: number;
  } {
    const bySheet: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalConf = 0;
    let lowCount = 0;

    for (const r of this.records) {
      bySheet[r.sheet] = (bySheet[r.sheet] || 0) + 1;
      byType[r.extractedType] = (byType[r.extractedType] || 0) + 1;
      totalConf += r.confidence;
      if (r.confidence < 0.6) lowCount++;
    }

    return {
      totalRecords: this.records.length,
      bySheet,
      byType,
      avgConfidence: this.records.length > 0 ? totalConf / this.records.length : 0,
      lowConfidenceCount: lowCount,
    };
  }
}
