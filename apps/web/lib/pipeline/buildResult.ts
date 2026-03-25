/**
 * RCOGP-Compliant B-BBEE Scorecard Calculator (Web Pipeline)
 *
 * Implements the same sector-aware formulas as apps/api/pipeline/sectorCalculators.ts
 * but operates on the flat `extractedData` record produced by entityToParseResult.ts.
 *
 * RCOGP Generic pillar max points:
 *   Ownership:       25 pts
 *   Management Ctrl:  8 pts
 *   Employment Eq.:  11 pts  (NOTE: Generic has separate EE; QSE combines with MC)
 *   Skills Dev.:     25 pts
 *   Pref. Proc.:     27 pts
 *   ESD:             15 pts
 *   SED:              5 pts
 *   YES Initiative:   5 pts (bonus)
 *   ─────────────────────────
 *   Total:          116 pts max
 *
 * Level thresholds (Revised Codes standard):
 *   ≥ 100 → Level 1  (135% recognition)
 *   ≥  95 → Level 2  (125%)
 *   ≥  90 → Level 3  (110%)
 *   ≥  80 → Level 4  (100%)
 *   ≥  75 → Level 5   (80%)
 *   ≥  70 → Level 6   (60%)
 *   ≥  55 → Level 7   (50%)
 *   ≥  40 → Level 8   (10%)
 *   <  40 → Non-Compliant (0%)
 */

import type { PipelineResult, PillarScore } from './types';
import type { ParseResult } from './extraction/entityToParseResult';

// ---------------------------------------------------------------------------
// Sector configuration import
// ---------------------------------------------------------------------------
import { SectorCfg, getSectorConfig } from './sectorConfig';


function r2(n: number): number { return Math.round(n * 100) / 100; }
function cap(val: number, max: number): number { return Math.min(val, max); }
function pct(v: any): number { 
  const str = String(v ?? '').replace(/[R\s,]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num > 1 ? num / 100 : num;
}
function rand(v: any): number {
  const str = String(v ?? '').replace(/[R\s,]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// Pillar Calculators — work from extractedData flat record
// ---------------------------------------------------------------------------

function calcOwnership(data: Record<string, any>, cfg: SectorCfg): PillarScore {
  const blackOwn   = pct(data['black_voting_rights']  ?? data['black_ownership_percentage'] ?? data['shareholding_pct']);
  const blackWomen = pct(data['black_women_voting_rights'] ?? data['black_women_ownership_percentage'] ?? data['black_women_ownership']);
  const blackEI    = pct(data['black_economic_interest'] ?? blackOwn);
  const blackWEI   = pct(data['black_women_economic_interest'] ?? blackWomen);
  const c = cfg.ownership;

  const votPts   = cap((blackOwn   / c.votingTarget)      * c.votingMaxPts,    c.votingMaxPts);
  const wVotPts  = cap((blackWomen / c.womenVotingTarget)  * c.womenVotingMaxPts, c.womenVotingMaxPts);
  const eiPts    = cap((blackEI    / c.eiTarget)           * c.eiMaxPts,        c.eiMaxPts);
  const wEIPts   = cap((blackWEI   / c.womenEITarget)      * c.womenEIMaxPts,   c.womenEIMaxPts);
  // Net value: proxy from ownership if not separately extracted
  const nvPts    = cap((blackOwn   / 0.25)                 * c.netValueMaxPts,  c.netValueMaxPts);

  const total = r2(cap(votPts + wVotPts + eiPts + wEIPts + nvPts, c.maxPoints));

  return {
    pillar: 'Ownership',
    weightedScore: total,
    maxScore: c.maxPoints,
    subItems: [
      { indicator: 'Black Voting Rights',            value: r2(blackOwn   * 100), target: c.votingTarget      * 100, score: r2(votPts),  maxScore: c.votingMaxPts },
      { indicator: 'Black Women Voting Rights',       value: r2(blackWomen * 100), target: c.womenVotingTarget * 100, score: r2(wVotPts), maxScore: c.womenVotingMaxPts },
      { indicator: 'Black Economic Interest',         value: r2(blackEI    * 100), target: c.eiTarget          * 100, score: r2(eiPts),   maxScore: c.eiMaxPts },
      { indicator: 'Black Women Economic Interest',   value: r2(blackWEI   * 100), target: c.womenEITarget     * 100, score: r2(wEIPts),  maxScore: c.womenEIMaxPts },
      { indicator: 'Net Value',                       value: r2(blackOwn   * 100), target: 25,                       score: r2(nvPts),   maxScore: c.netValueMaxPts },
    ],
  };
}

function calcManagement(data: Record<string, any>, cfg: SectorCfg): PillarScore {
  const boardBlack = pct(data['black_board_members']        ?? data['board_black_percentage']);
  const boardBW    = pct(data['black_women_board_members']  ?? data['board_black_women_percentage']);
  const execBlack  = pct(data['black_executive_directors']  ?? data['exec_black_percentage']  ?? data['black_executive_management']);
  const execBW     = pct(data['black_women_executive']      ?? data['exec_black_women_percentage'] ?? boardBW);
  const c = cfg.mc;

  const bbPts  = cap((boardBlack / c.boardBlackTarget)  * c.boardBlackMaxPts,  c.boardBlackMaxPts);
  const bwPts  = cap((boardBW    / c.boardBWTarget)     * c.boardBWMaxPts,     c.boardBWMaxPts);
  const ebPts  = cap((execBlack  / c.execBlackTarget)   * c.execBlackMaxPts,   c.execBlackMaxPts);
  const ewPts  = cap((execBW     / c.execBWTarget)      * c.execBWMaxPts,      c.execBWMaxPts);
  const total  = r2(cap(bbPts + bwPts + ebPts + ewPts, c.maxPoints));

  return {
    pillar: 'Management Control',
    weightedScore: total,
    maxScore: c.maxPoints,
    subItems: [
      { indicator: 'Black Board Members',          value: r2(boardBlack * 100), target: c.boardBlackTarget * 100, score: r2(bbPts), maxScore: c.boardBlackMaxPts },
      { indicator: 'Black Women Board Members',    value: r2(boardBW    * 100), target: c.boardBWTarget    * 100, score: r2(bwPts), maxScore: c.boardBWMaxPts },
      { indicator: 'Black Executive Directors',    value: r2(execBlack  * 100), target: c.execBlackTarget  * 100, score: r2(ebPts), maxScore: c.execBlackMaxPts },
      { indicator: 'Black Women Exec. Directors',  value: r2(execBW     * 100), target: c.execBWTarget     * 100, score: r2(ewPts), maxScore: c.execBWMaxPts },
    ],
  };
}

function calcSkills(data: Record<string, any>, cfg: SectorCfg): PillarScore {
  const leviable = rand(data['leviable_amount'] ?? data['skills_leviable_amount'] ?? 0);
  // skills_development_spend is the total spend on black people
  const totalBlackSpend = rand(data['skills_development_spend'] ?? data['training_cost'] ?? 0);
  const bursarySpend    = rand(data['bursary_spend'] ?? 0);
  const c = cfg.skills;

  const overallTarget  = leviable * c.overallSpendPct;
  const bursaryTarget  = leviable * c.bursarySpendPct;

  const genPts = overallTarget > 0 ? cap((totalBlackSpend / overallTarget) * c.overallMaxPts, c.overallMaxPts) : 0;
  const burPts = bursaryTarget > 0 ? cap((bursarySpend   / bursaryTarget)  * c.bursaryMaxPts, c.bursaryMaxPts) : 0;
  const total  = r2(cap(genPts + burPts, c.maxPoints));

  return {
    pillar: 'Skills Development',
    weightedScore: total,
    maxScore: c.maxPoints,
    subItems: [
      { indicator: 'Black Skills Spend (≥3.5% of leviable)', value: totalBlackSpend, target: overallTarget, score: r2(genPts), maxScore: c.overallMaxPts },
      { indicator: 'Bursaries (≥2.5% of leviable)',          value: bursarySpend,    target: bursaryTarget, score: r2(burPts), maxScore: c.bursaryMaxPts },
    ],
  };
}

function calcProcurement(data: Record<string, any>, cfg: SectorCfg): { pillar: PillarScore; recognisedSpend: number } {
  const tmps = rand(data['tmps'] ?? data['total_measured_procurement_spend'] ?? 0);
  const supplierSpend       = rand(data['supplier_spend'] ?? data['preferential_procurement_spend'] ?? 0);
  const supplierBeeLevel    = parseInt(String(data['supplier_bee_level'] ?? '4').replace(/[^0-9]/g, '') || '4');
  const supplierBlackOwn    = pct(data['supplier_black_ownership'] ?? 0);
  const c = cfg.procurement;

  const target = tmps * c.allTarget;
  const supplierLvlObj = cfg.levels.find(l => l.level === Math.min(8, Math.max(1, supplierBeeLevel)));
  const recognition = supplierLvlObj ? supplierLvlObj.recognition : 0;
  const recognisedSpend = supplierSpend * recognition;

  const allPts  = target > 0 ? cap((recognisedSpend / target) * c.allMaxPts, c.allMaxPts) : 0;
  // Black-owned (≥51%) bonus
  const bo51Pts = (supplierBlackOwn >= 0.51 && tmps > 0)
    ? cap((supplierSpend / tmps / c.bo51Target) * c.bo51MaxPts, c.bo51MaxPts)
    : 0;

  const total = r2(cap(allPts + bo51Pts, c.maxPoints));

  return {
    recognisedSpend,
    pillar: {
      pillar: 'Enterprise & Supplier Development',
      weightedScore: total,
      maxScore: c.maxPoints,
      subItems: [
        { indicator: 'Preferential Procurement (all suppliers)', value: r2(recognisedSpend), target: target, score: r2(allPts),  maxScore: c.allMaxPts },
        { indicator: 'Black-Owned Supplier Spend (≥51%)',        value: r2(supplierSpend),  target: tmps * c.bo51Target, score: r2(bo51Pts), maxScore: c.bo51MaxPts },
      ],
    },
  };
}

function calcESD(data: Record<string, any>, npat: number, cfg: SectorCfg): PillarScore {
  const sdSpend = rand(data['supplier_development_contributions'] ?? data['esd_amount'] ?? 0);
  const edSpend = rand(data['enterprise_development_contributions'] ?? 0);
  const c = cfg.esd;

  const targetSD = npat * c.sdPct;
  const targetED = npat * c.edPct;

  const sdPts = targetSD > 0 ? cap((sdSpend / targetSD) * c.sdMaxPts, c.sdMaxPts) : (sdSpend > 0 ? c.sdMaxPts : 0);
  const edPts = targetED > 0 ? cap((edSpend / targetED) * c.edMaxPts, c.edMaxPts) : (edSpend > 0 ? c.edMaxPts : 0);
  const total = r2(cap(sdPts + edPts, c.maxPoints));

  return {
    pillar: 'Enterprise & Supplier Development (ESD)',
    weightedScore: total,
    maxScore: c.maxPoints,
    subItems: [
      { indicator: 'Supplier Development (≥2% of NPAT)', value: sdSpend, target: targetSD, score: r2(sdPts), maxScore: c.sdMaxPts },
      { indicator: 'Enterprise Development (≥1% of NPAT)', value: edSpend, target: targetED, score: r2(edPts), maxScore: c.edMaxPts },
    ],
  };
}

function calcSED(data: Record<string, any>, npat: number, cfg: SectorCfg): PillarScore {
  const sedSpend = rand(data['socio_economic_spend'] ?? data['sed_amount'] ?? 0);
  const target   = npat * cfg.sed.spendPct;
  const score    = target > 0
    ? r2(cap((sedSpend / target) * cfg.sed.maxPoints, cfg.sed.maxPoints))
    : (sedSpend > 0 ? cfg.sed.maxPoints : 0);

  return {
    pillar: 'Socio-Economic Development',
    weightedScore: score,
    maxScore: cfg.sed.maxPoints,
    subItems: [{ indicator: 'SED Spend (≥1% of NPAT)', value: sedSpend, target, score, maxScore: cfg.sed.maxPoints }],
  };
}

function determineLevel(totalScore: number, cfg: SectorCfg): { label: string; recognition: number; level: number } {
  for (const t of cfg.levels) {
    if (totalScore >= t.minPoints) return t;
  }
  return cfg.levels[cfg.levels.length - 1];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildPipelineResult(parseResult: ParseResult, filename: string): PipelineResult {
  const data = parseResult.extractedData;
  const cfg  = getSectorConfig(parseResult.client.industrySector || 'RCOGP', parseResult.client.applicableScorecard || 'Generic');

  // Extract financial figures
  const revenue  = rand(data['revenue']  ?? data['total_revenue'] ?? 0);
  const npat     = rand(data['npat']     ?? 0);
  const leviable = rand(data['leviable_amount'] ?? data['skills_leviable_amount'] ?? 0);

  // Calculate each pillar
  const ownership         = calcOwnership(data, cfg);
  const management        = calcManagement(data, cfg);
  const skills            = calcSkills(data, cfg);
  const { pillar: procurementPillar, recognisedSpend } = calcProcurement(data, cfg);
  const esd               = calcESD(data, npat, cfg);
  const sed               = calcSED(data, npat, cfg);

  const pillars: PillarScore[] = [ownership, management, skills, procurementPillar, esd, sed];
  const totalScore = r2(pillars.reduce((sum, p) => sum + p.weightedScore, 0));
  const levelInfo  = determineLevel(totalScore, cfg);

  // Sub-minimum checks
  const ownSubMin  = ownership.weightedScore  >= cfg.ownership.maxPoints  * cfg.ownership.subMinPct;
  const skSubMin   = skills.weightedScore     >= cfg.skills.maxPoints     * cfg.skills.subMinPct;
  const prSubMin   = procurementPillar.weightedScore >= cfg.procurement.maxPoints * cfg.procurement.subMinPct;
  const allSubMin  = ownSubMin && skSubMin && prSubMin;

  const discountedLevel = !allSubMin ? Math.min(levelInfo.level + 1, 9) : levelInfo.level;
  const finalLevelInfo  = !allSubMin
    ? (cfg.levels.find(l => l.level === discountedLevel) ?? cfg.levels[cfg.levels.length - 1])
    : levelInfo;

  return {
    filename,
    client: parseResult.client,
    totalScore,
    level: levelInfo.label,
    pillars,
    scorecard: {
      beeLevel: finalLevelInfo.label,
      recognitionLevelPercent: finalLevelInfo.recognition,
      subMinimumsMet: allSubMin,
      isDiscounted: !allSubMin,
      discountedLevel: finalLevelInfo.label,
      pillars: {
        ownership:                   r2(ownership.weightedScore),
        managementControl:           r2(management.weightedScore),
        employmentEquity:            0,
        skillsDevelopment:           r2(skills.weightedScore),
        preferentialProcurement:     r2(recognisedSpend),
        enterpriseSupplierDevelopment: r2(esd.weightedScore),
        socioEconomicDevelopment:    r2(sed.weightedScore),
        yesInitiative:               0,
        totalPoints:                 totalScore,
      },
    },
    logs: [{
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Scored ${filename}: ${totalScore}/${ownership.maxScore + management.maxScore + skills.maxScore + procurementPillar.maxScore + esd.maxScore + sed.maxScore} → ${finalLevelInfo.label}`,
    }],
    createdAt: new Date().toISOString(),
  };
}
