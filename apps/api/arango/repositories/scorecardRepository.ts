/**
 * Scorecard Repository
 *
 * Manages B-BBEE scorecard templates, their pillars, indicators,
 * and compliance targets in ArangoDB.
 */

import { aql } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS, EDGE_COLLECTIONS } from '../collections.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScorecardTemplate {
  _key?: string;
  name: string;
  sectorCode: string;           // e.g. "RCOGP", "ICT", "FSC", "AGRI"
  scorecardType: string;
  version: string;
  totalMaxPoints: number;
  levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
  createdAt: string;
  sourceFile: string;
}

export interface Pillar {
  _key?: string;
  scorecardId: string;
  name: string;
  code: string;                 // e.g. "ownership", "managementControl"
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;  // e.g. 0.4 = 40% of target
  displayOrder: number;
}

export interface Indicator {
  _key?: string;
  pillarId: string;
  name: string;
  code: string;
  maxPoints: number;
  description: string;
}

export interface ComplianceTarget {
  _key?: string;
  indicatorId: string;
  sectorCode: string;
  targetValue: number;
  targetUnit: 'percentage' | 'currency' | 'count' | 'number' | 'ratio';
  targetBase: string;           // e.g. "revenue", "npat", "leviable_amount", "tmps"
  weighting: number;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ScorecardRepository {
  private get db() { return getArangoDB(); }

  async createScorecard(template: ScorecardTemplate): Promise<ScorecardTemplate> {
    const col = this.db.collection(COLLECTIONS.scorecards);
    const result = await col.save({ ...template, createdAt: new Date().toISOString() });
    return { ...template, _key: result._key };
  }

  async getScorecardByType(sectorCode: string, scorecardType: string): Promise<ScorecardTemplate | null> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.scorecards)}
        FILTER s.sectorCode == ${sectorCode} AND s.scorecardType == ${scorecardType}
        SORT s.createdAt DESC
        LIMIT 1
        RETURN s
    `);
    const result = await cursor.next();
    return result || null;
  }

  async listScorecards(): Promise<ScorecardTemplate[]> {
    const cursor = await this.db.query(aql`
      FOR s IN ${this.db.collection(COLLECTIONS.scorecards)}
        SORT s.sectorCode, s.scorecardType
        RETURN s
    `);
    return cursor.all();
  }

  async createPillar(pillar: Pillar): Promise<Pillar> {
    const col = this.db.collection(COLLECTIONS.pillars);
    const result = await col.save(pillar);
    const edgeCol = this.db.collection(EDGE_COLLECTIONS.pillarOf);
    await edgeCol.save({
      _from: `${COLLECTIONS.pillars}/${result._key}`,
      _to: `${COLLECTIONS.scorecards}/${pillar.scorecardId}`,
    });
    return { ...pillar, _key: result._key };
  }

  async getPillarsByScorecard(scorecardId: string): Promise<Pillar[]> {
    const cursor = await this.db.query(aql`
      FOR p IN ${this.db.collection(COLLECTIONS.pillars)}
        FILTER p.scorecardId == ${scorecardId}
        SORT p.displayOrder
        RETURN p
    `);
    return cursor.all();
  }

  async createIndicator(indicator: Indicator): Promise<Indicator> {
    const col = this.db.collection(COLLECTIONS.indicators);
    const result = await col.save(indicator);
    const edgeCol = this.db.collection(EDGE_COLLECTIONS.indicatorOf);
    await edgeCol.save({
      _from: `${COLLECTIONS.indicators}/${result._key}`,
      _to: `${COLLECTIONS.pillars}/${indicator.pillarId}`,
    });
    return { ...indicator, _key: result._key };
  }

  async getIndicatorsByPillar(pillarId: string): Promise<Indicator[]> {
    const cursor = await this.db.query(aql`
      FOR i IN ${this.db.collection(COLLECTIONS.indicators)}
        FILTER i.pillarId == ${pillarId}
        RETURN i
    `);
    return cursor.all();
  }

  async createComplianceTarget(target: ComplianceTarget): Promise<ComplianceTarget> {
    const col = this.db.collection(COLLECTIONS.complianceTargets);
    const result = await col.save(target);
    return { ...target, _key: result._key };
  }

  async getTargetsForSector(sectorCode: string): Promise<ComplianceTarget[]> {
    const cursor = await this.db.query(aql`
      FOR t IN ${this.db.collection(COLLECTIONS.complianceTargets)}
        FILTER t.sectorCode == ${sectorCode}
        RETURN t
    `);
    return cursor.all();
  }

  async getFullScorecard(sectorCode: string, scorecardType: string): Promise<{
    scorecard: ScorecardTemplate;
    pillars: Array<Pillar & { indicators: Array<Indicator & { targets: ComplianceTarget[] }> }>;
  } | null> {
    const scorecard = await this.getScorecardByType(sectorCode, scorecardType);
    if (!scorecard || !scorecard._key) return null;

    const pillars = await this.getPillarsByScorecard(scorecard._key);
    const enrichedPillars = await Promise.all(
      pillars.map(async (p) => {
        const indicators = await this.getIndicatorsByPillar(p._key!);
        const enrichedIndicators = await Promise.all(
          indicators.map(async (ind) => {
            const targetCursor = await this.db.query(aql`
              FOR t IN ${this.db.collection(COLLECTIONS.complianceTargets)}
                FILTER t.indicatorId == ${ind._key} AND t.sectorCode == ${sectorCode}
                RETURN t
            `);
            const targets = await targetCursor.all();
            return { ...ind, targets };
          })
        );
        return { ...p, indicators: enrichedIndicators };
      })
    );

    return { scorecard, pillars: enrichedPillars };
  }
}
