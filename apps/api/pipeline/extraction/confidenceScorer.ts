/**
 * Confidence Scorer (Audit-AI Enhanced)
 *
 * Computes extraction confidence on a 10-point scale (0-10) using:
 * - Retrieval score (how well the retrieval matched)
 * - Entity alignment (matched vs expected entities)
 * - Structural verification (value exists in source text)
 * - Section match (found in expected section/zone)
 * - Dual extraction agreement (rule-based and LLM agree)
 *
 * Meets threshold when score >= 9.5 (95% confidence).
 */

export const CONFIDENCE_THRESHOLD = 9.5;

export interface ConfidenceFactors {
  retrievalScore: number; // 0-4 pts: how well the retrieval matched
  entityAlignment: number; // 0-1.5 pts: matched vs expected entities
  structuralVerification: number; // 0-3.5 pts: value exists in source text
  sectionMatch: number; // 0-0.5 pts: found in expected section/zone
  dualExtractionAgreement: number; // 0-0.5 pts: rule-based and LLM agree
}

export interface ConfidenceResult {
  score: number; // 0-10 scale
  normalizedScore: number; // 0-1 scale (score/10)
  factors: ConfidenceFactors;
  meetsThreshold: boolean; // >= 9.5 for 95% confidence
  explanation: string;
}

/**
 * Normalize retrieval score to 0-1, multiply by 4 (max 4 pts).
 * If retrievalScore <= 0, return 0.
 */
export function computeRetrievalFactor(retrievalScore: number, maxRetrievalScore: number): number {
  if (retrievalScore <= 0) return 0;
  if (maxRetrievalScore <= 0) return 0;
  const normalized = Math.min(1, retrievalScore / maxRetrievalScore);
  return normalized * 4;
}

/**
 * ratio = matched/expected, multiply by 1.5 (max 1.5 pts).
 */
export function computeEntityAlignmentFactor(matchedEntities: number, expectedEntities: number): number {
  if (expectedEntities <= 0) return 0;
  const ratio = Math.min(1, matchedEntities / expectedEntities);
  return ratio * 1.5;
}

/**
 * - If verified (value found in source text): 3.5
 * - If valueIsNull (honestly said not found): 2.5
 * - If NOT verified (potential hallucination): 0
 */
export function computeStructuralVerificationFactor(verified: boolean, valueIsNull: boolean): number {
  if (verified) return 3.5;
  if (valueIsNull) return 2.5;
  return 0;
}

/**
 * If found in expected zone: 0.5, else 0.
 */
export function computeSectionMatchFactor(foundInExpectedZone: boolean): number {
  return foundInExpectedZone ? 0.5 : 0;
}

/**
 * Both agree (both null or same value): 0.5
 * Disagree: 0
 */
export function computeDualExtractionFactor(
  llmValue: string | number | null,
  ruleBasedValue: string | number | null
): number {
  const bothNull = llmValue == null && ruleBasedValue == null;
  const bothSame =
    llmValue != null &&
    ruleBasedValue != null &&
    String(llmValue).trim() === String(ruleBasedValue).trim();
  return bothNull || bothSame ? 0.5 : 0;
}

export interface ComputeConfidenceParams {
  retrievalScore: number;
  maxRetrievalScore: number;
  matchedEntities: number;
  expectedEntities: number;
  structurallyVerified: boolean;
  valueIsNull: boolean;
  foundInExpectedZone: boolean;
  llmValue: string | number | null;
  ruleBasedValue: string | number | null;
}

/**
 * Compute full confidence from all factors.
 */
export function computeConfidence(params: ComputeConfidenceParams): ConfidenceResult {
  const factors: ConfidenceFactors = {
    retrievalScore: computeRetrievalFactor(params.retrievalScore, params.maxRetrievalScore),
    entityAlignment: computeEntityAlignmentFactor(params.matchedEntities, params.expectedEntities),
    structuralVerification: computeStructuralVerificationFactor(
      params.structurallyVerified,
      params.valueIsNull
    ),
    sectionMatch: computeSectionMatchFactor(params.foundInExpectedZone),
    dualExtractionAgreement: computeDualExtractionFactor(params.llmValue, params.ruleBasedValue),
  };

  const score = Math.max(0, Math.min(10, Object.values(factors).reduce((a, b) => a + b, 0)));
  const normalizedScore = score / 10;
  const meetsThreshold = score >= CONFIDENCE_THRESHOLD;

  const parts: string[] = [];
  parts.push(`Retrieval: ${factors.retrievalScore.toFixed(1)}/4 pts`);
  parts.push(`Entity alignment: ${factors.entityAlignment.toFixed(1)}/1.5 pts`);
  parts.push(`Structural verification: ${factors.structuralVerification.toFixed(1)}/3.5 pts`);
  parts.push(`Section match: ${factors.sectionMatch.toFixed(1)}/0.5 pts`);
  parts.push(`Dual extraction agreement: ${factors.dualExtractionAgreement.toFixed(1)}/0.5 pts`);
  const explanation = `Confidence ${score.toFixed(1)}/10: ${parts.join('; ')}. ${meetsThreshold ? 'Meets 95% threshold.' : 'Below threshold, recommend review.'}`;

  return { score, normalizedScore, factors, meetsThreshold, explanation };
}

/**
 * Backward compatibility: takes a flat signals map (signal name -> 0-1 score),
 * computes a weighted average (equal weights), and returns 0-1.
 */
export function calibrateConfidence(signals: Record<string, number>): number {
  const entries = Object.entries(signals);
  if (entries.length === 0) return 0;
  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  return Math.max(0, Math.min(1, sum / entries.length));
}
