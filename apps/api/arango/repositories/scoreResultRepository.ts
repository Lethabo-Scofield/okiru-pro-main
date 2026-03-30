/**
 * Score Result Repository
 *
 * Stores calculated scores for criteria, pillars, and overall scorecard.
 * Links results to the calculation run that produced them.
 *
 * Hierarchy: CalculationRun → ScoreResult (criterion | pillar | overall)
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredScoreResult {
  _key?: string;
  assessmentId: string;
  calculationRunId: string;
  sectorCode: string;
  scorecardType: string;
  // What was scored
  type: 'criterion' | 'pillar' | 'overall';
  pillarCode?: string;
  criterionCode?: string;
  // Score details
  actualValue: number;
  targetValue: number | string;
  achievementPercentage: number;
  pointsAchieved: number;
  maxPoints: number;
  weightedScore: number;
  // Status
  subMinimumMet: boolean;
  isBonus: boolean;
  // Breakdown
  formulaUsed: string;
  inputs: Record<string, unknown>;
  intermediateSteps?: Record<string, number>;
  // Metadata
  calculatedAt?: string;
}

export interface StoredCalculationRun {
  _key?: string;
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  triggeredBy: 'extraction' | 'manual_entry' | 'verification' | 'recalculation';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  // Summary
  totalPoints: number;
  maxPoints: number;
  overallPercentage: number;
  beeLevel?: number;
  recognitionLevel?: number;
  subMinimumsMet: Record<string, boolean>;
}

export interface ScorecardSummary {
  assessmentId: string;
  calculationRunId: string;
  sectorCode: string;
  scorecardType: string;
  totalPoints: number;
  maxPoints: number;
  overallPercentage: number;
  beeLevel: number;
  recognitionLevel: number;
  pillarScores: Array<{
    pillarCode: string;
    points: number;
    maxPoints: number;
    percentage: number;
    subMinimumMet: boolean;
  }>;
  criterionScores: Array<{
    criterionCode: string;
    pillarCode: string;
    points: number;
    maxPoints: number;
    percentage: number;
  }>;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ScoreResultRepository {
  private get db() { return getArangoDB(); }

  // ==========================================================================
  // Calculation Run Operations
  // ==========================================================================

  async startCalculationRun(
    run: Omit<StoredCalculationRun, '_key' | 'startedAt' | 'status'>
  ): Promise<StoredCalculationRun> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.calculationRuns);

    const doc = {
      ...run,
      status: 'running' as const,
      startedAt: now,
    };

    const result = await col.save(doc);
    return { ...doc, _key: result._key };
  }

  async completeCalculationRun(
    runId: string,
    summary: {
      totalPoints: number;
      maxPoints: number;
      overallPercentage: number;
      beeLevel?: number;
      recognitionLevel?: number;
      subMinimumsMet: Record<string, boolean>;
    }
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.calculationRuns).update(runId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      ...summary,
    });
  }

  async failCalculationRun(
    runId: string,
    errorMessage: string
  ): Promise<void> {
    await this.db.collection(COLLECTIONS.calculationRuns).update(runId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage,
    });
  }

  async getCalculationRun(runId: string): Promise<StoredCalculationRun | null> {
    try {
      return await this.db.collection(COLLECTIONS.calculationRuns).document(runId);
    } catch {
      return null;
    }
  }

  async getLatestCalculationRun(assessmentId: string): Promise<StoredCalculationRun | null> {
    const cursor = await this.db.query(aql`
      FOR r IN ${this.db.collection(COLLECTIONS.calculationRuns)}
        FILTER r.assessmentId == ${assessmentId}
        SORT r.startedAt DESC
        LIMIT 1
        RETURN r
    `);
    return cursor.next() || null;
  }

  async getCalculationRuns(assessmentId: string): Promise<StoredCalculationRun[]> {
    const cursor = await this.db.query(aql`
      FOR r IN ${this.db.collection(COLLECTIONS.calculationRuns)}
        FILTER r.assessmentId == ${assessmentId}
        SORT r.startedAt DESC
        RETURN r
    `);
    return cursor.all();
  }

  // ==========================================================================
  // Score Result Operations
  // ==========================================================================

  async storeScoreResult(
    result: Omit<StoredScoreResult, '_key' | 'calculatedAt'>
  ): Promise<StoredScoreResult> {
    const now = new Date().toISOString();
    const col = this.db.collection(COLLECTIONS.scoreResults);

    // Composite key: calculationRunId + type + (pillarCode|criterionCode)
    const keyParts = [result.calculationRunId, result.type];
    if (result.pillarCode) keyParts.push(result.pillarCode);
    if (result.criterionCode) keyParts.push(result.criterionCode);
    const key = keyParts.join('_');

    const doc = { ...result, _key: key, calculatedAt: now };
    const saved = await col.save(doc, { overwriteMode: 'replace' });

    // Create edge to calculation run
    try {
      const edgeCol = this.db.collection(EDGE_COLLECTIONS.calculatedBy);
      await edgeCol.save({
        _from: saved._id,
        _to: `${COLLECTIONS.calculationRuns}/${result.calculationRunId}`,
      });
    } catch {
      // Calculation run may not exist
    }

    return { ...doc, _key: saved._key };
  }

  async storeScoreResults(
    results: Array<Omit<StoredScoreResult, '_key' | 'calculatedAt'>>
  ): Promise<StoredScoreResult[]> {
    const stored: StoredScoreResult[] = [];
    for (const result of results) {
      stored.push(await this.storeScoreResult(result));
    }
    return stored;
  }

  async getScoreResults(runId: string): Promise<StoredScoreResult[]> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
        FILTER s.calculationRunId == ${runId}
        SORT s.type, s.pillarCode, s.criterionCode
        RETURN s
    `);
    return cursor.all();
  }

  async getScoreResult(
    runId: string,
    type: StoredScoreResult['type'],
    code: string
  ): Promise<StoredScoreResult | null> {
    const keyParts = [runId, type];
    if (type === 'pillar') keyParts.push(code);
    if (type === 'criterion') keyParts.push(code);
    const key = keyParts.join('_');

    try {
      return await this.db.collection(COLLECTIONS.scoreResults).document(key);
    } catch {
      return null;
    }
  }

  async getPillarScores(runId: string): Promise<StoredScoreResult[]> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
        FILTER s.calculationRunId == ${runId}
          AND s.type == "pillar"
        SORT s.pillarCode
        RETURN s
    `);
    return cursor.all();
  }

  async getCriterionScores(runId: string, pillarCode?: string): Promise<StoredScoreResult[]> {
    const query = pillarCode
      ? aql`
        FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          FILTER s.calculationRunId == ${runId}
            AND s.type == "criterion"
            AND s.pillarCode == ${pillarCode}
          SORT s.criterionCode
          RETURN s
      `
      : aql`
        FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          FILTER s.calculationRunId == ${runId}
            AND s.type == "criterion"
          SORT s.pillarCode, s.criterionCode
          RETURN s
      `;
    const cursor = await this.db.query(query);
    return cursor.all();
  }

  // ==========================================================================
  // Aggregated Queries
  // ==========================================================================

  async getScorecardSummary(runId: string): Promise<ScorecardSummary | null> {
    const run = await this.getCalculationRun(runId);
    if (!run) return null;

    const [pillarScores, criterionScores] = await Promise.all([
      this.getPillarScores(runId),
      this.getCriterionScores(runId),
    ]);

    return {
      assessmentId: run.assessmentId,
      calculationRunId: runId,
      sectorCode: run.sectorCode,
      scorecardType: run.scorecardType,
      totalPoints: run.totalPoints,
      maxPoints: run.maxPoints,
      overallPercentage: run.overallPercentage,
      beeLevel: run.beeLevel ?? 0,
      recognitionLevel: run.recognitionLevel ?? 0,
      pillarScores: pillarScores.map(p => ({
        pillarCode: p.pillarCode!,
        points: p.pointsAchieved,
        maxPoints: p.maxPoints,
        percentage: p.achievementPercentage,
        subMinimumMet: p.subMinimumMet,
      })),
      criterionScores: criterionScores.map(c => ({
        criterionCode: c.criterionCode!,
        pillarCode: c.pillarCode!,
        points: c.pointsAchieved,
        maxPoints: c.maxPoints,
        percentage: c.achievementPercentage,
      })),
    };
  }

  async getLatestScorecardSummary(assessmentId: string): Promise<ScorecardSummary | null> {
    const run = await this.getLatestCalculationRun(assessmentId);
    if (!run?._key) return null;
    return this.getScorecardSummary(run._key);
  }

  async compareCalculationRuns(
    runId1: string,
    runId2: string
  ): Promise<{
    run1: ScorecardSummary | null;
    run2: ScorecardSummary | null;
    differences: Array<{
      type: string;
      code: string;
      points1: number;
      points2: number;
      delta: number;
    }>;
  }> {
    const [run1, run2] = await Promise.all([
      this.getScorecardSummary(runId1),
      this.getScorecardSummary(runId2),
    ]);

    if (!run1 || !run2) {
      return { run1, run2, differences: [] };
    }

    const differences: Array<{
      type: string;
      code: string;
      points1: number;
      points2: number;
      delta: number;
    }> = [];

    // Compare pillar scores
    for (const p1 of run1.pillarScores) {
      const p2 = run2.pillarScores.find(p => p.pillarCode === p1.pillarCode);
      if (p2 && p1.points !== p2.points) {
        differences.push({
          type: 'pillar',
          code: p1.pillarCode,
          points1: p1.points,
          points2: p2.points,
          delta: p2.points - p1.points,
        });
      }
    }

    // Compare criterion scores
    for (const c1 of run1.criterionScores) {
      const c2 = run2.criterionScores.find(c => c.criterionCode === c1.criterionCode);
      if (c2 && c1.points !== c2.points) {
        differences.push({
          type: 'criterion',
          code: c1.criterionCode,
          points1: c1.points,
          points2: c2.points,
          delta: c2.points - c1.points,
        });
      }
    }

    return { run1, run2, differences };
  }

  // ==========================================================================
  // Sub-minimum Tracking
  // ==========================================================================

  async getSubMinimumStatus(runId: string): Promise<Record<string, boolean>> {
    const cursor = await this.db.query(aql`
      LET results = (
        FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          FILTER s.calculationRunId == ${runId}
            AND s.type == "pillar"
          RETURN { [s.pillarCode]: s.subMinimumMet }
      )
      RETURN MERGE(results)
    `);
    return cursor.next() || {};
  }

  async getFailedSubMinimums(runId: string): Promise<string[]> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
        FILTER s.calculationRunId == ${runId}
          AND s.type == "pillar"
          AND s.subMinimumMet == false
        RETURN s.pillarCode
    `);
    return cursor.all();
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  async deleteCalculationRun(runId: string): Promise<boolean> {
    try {
      // Delete associated score results
      await this.db.query(aql`
        FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          FILTER s.calculationRunId == ${runId}
          REMOVE s IN ${this.db.collection(COLLECTIONS.scoreResults)}
      `);

      // Delete run
      await this.db.collection(COLLECTIONS.calculationRuns).remove(runId);
      return true;
    } catch {
      return false;
    }
  }

  async deleteResultsForAssessment(assessmentId: string): Promise<number> {
    const cursor = await this.db.query(aql`
      // First delete score results
      LET removedResults = (
        FOR s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          FILTER s.assessmentId == ${assessmentId}
          REMOVE s IN ${this.db.collection(COLLECTIONS.scoreResults)}
          COLLECT WITH COUNT INTO count
        RETURN count
      )
      // Then delete calculation runs
      LET removedRuns = (
        FOR r IN ${this.db.collection(COLLECTIONS.calculationRuns)}
          FILTER r.assessmentId == ${assessmentId}
          REMOVE r IN ${this.db.collection(COLLECTIONS.calculationRuns)}
          COLLECT WITH COUNT INTO count
        RETURN count
      )
      RETURN { results: removedResults[0], runs: removedRuns[0] }
    `);
    const result = await cursor.next();
    return result?.results || 0;
  }
}
