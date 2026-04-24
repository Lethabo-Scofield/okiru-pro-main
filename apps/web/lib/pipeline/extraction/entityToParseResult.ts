import type { LLMExtractionResult } from './llmExtractor';

export interface ParseResult {
  client: {
    name: string;
    industrySector: string;
    applicableScorecard: string;
  };
  extractedData: Record<string, any>;
  confidenceScores: Record<string, number>;
}

export function entityResultsToParseResult(
  results: LLMExtractionResult[],
  meta: { clientName: string; industrySector: string; applicableScorecard: string }
): ParseResult {
  const extractedData: Record<string, any> = {};
  const confidenceScores: Record<string, number> = {};

  for (const result of results) {
    extractedData[result.entityName] = result.extractedValue;
    confidenceScores[result.entityName] = result.confidence;
  }

  return {
    client: {
      name: meta.clientName,
      industrySector: meta.industrySector,
      applicableScorecard: meta.applicableScorecard,
    },
    extractedData,
    confidenceScores,
  };
}

export interface ConfidenceReportEntry {
  entity: string;
  confidence: number;
  status: 'high' | 'medium' | 'low' | 'missing';
}

export function buildConfidenceReport(
  results: LLMExtractionResult[],
  requiredRoles: string[]
): ConfidenceReportEntry[] {
  const report: ConfidenceReportEntry[] = [];

  for (const role of requiredRoles) {
    const result = results.find(r => r.entityName === role);
    if (!result || result.extractedValue === null) {
      report.push({ entity: role, confidence: 0, status: 'missing' });
    } else if (result.confidence >= 0.8) {
      report.push({ entity: role, confidence: result.confidence, status: 'high' });
    } else if (result.confidence >= 0.5) {
      report.push({ entity: role, confidence: result.confidence, status: 'medium' });
    } else {
      report.push({ entity: role, confidence: result.confidence, status: 'low' });
    }
  }

  return report;
}
