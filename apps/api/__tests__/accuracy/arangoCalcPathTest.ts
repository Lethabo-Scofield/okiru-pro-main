/**
 * ArangoDB Calculator Path Accuracy Test
 *
 * Verifies that ArangoDB-stored scorecard templates produce the same
 * calculation results as the direct sector calculator functions.
 *
 * Usage:
 *   npx tsx __tests__/accuracy/arangoCalcPathTest.ts
 *
 * Env: ARANGO_URL, ARANGO_DB, ARANGO_USER, ARANGO_PASS (or ARANGO_PASSWORD)
 * Defaults: localhost:8529, bbbee_db, root, ''
 *
 * If ArangoDB is unavailable, runs a "dry run" with in-code config only.
 */

import { Database, aql } from 'arangojs';
import type { ParseResult } from '../../pipeline/excelParser.js';
import type {
  SectorConfig,
  OwnershipTargets,
  MCTargets,
  EETargets,
  SkillsTargets,
  ProcurementTargets,
  EsdTargets,
  SedTargets,
  PillarConfig,
} from '../../pipeline/sectorConfig.js';
import {
  getSectorConfig,
  RCOGP_GENERIC,
  type SectorConfig as SectorConfigType,
} from '../../pipeline/sectorConfig.js';
import {
  calcOwnershipSector,
  calcMCSector,
  calcEESector,
  calcSkillsSector,
  calcProcurementSector,
  calcEsdSector,
  calcSedSector,
  determineLevelSector,
} from '../../pipeline/sectorCalculators.js';
import { COLLECTIONS } from '../../arango/collections.js';
import type { Pillar, Indicator, ComplianceTarget } from '../../arango/repositories/index.js';

// ---------------------------------------------------------------------------
// Env & connection
// ---------------------------------------------------------------------------

const ARANGO_URL = process.env.ARANGO_URL || 'http://127.0.0.1:8529';
const ARANGO_DB = process.env.ARANGO_DB || 'bbbee_db';
const ARANGO_USER = process.env.ARANGO_USER || 'root';
const ARANGO_PASS = process.env.ARANGO_PASS ?? process.env.ARANGO_PASSWORD ?? '';

async function tryConnectArango(): Promise<Database | null> {
  try {
    const systemDb = new Database({
      url: ARANGO_URL,
      auth: { username: ARANGO_USER, password: ARANGO_PASS },
    });
    const dbs = await systemDb.listDatabases();
    const dbName = dbs.includes(ARANGO_DB) ? ARANGO_DB : dbs[0] ?? 'okiru';
    const db = systemDb.database(dbName);
    await db.version();
    return db;
  } catch {
    return null;
  }
}

interface EnrichedPillar extends Pillar {
  indicators: Array<Indicator & { targets: ComplianceTarget[] }>;
}

interface FullScorecard {
  scorecard: {
    sectorCode: string;
    scorecardType: string;
    levelThresholds?: Array<{ level: number; minPoints: number; recognition: number }>;
    _key?: string;
  };
  pillars: EnrichedPillar[];
}

async function getFullScorecardFromDb(
  db: Database,
  sectorCode: string,
  scorecardType: string
): Promise<FullScorecard | null> {
  const scorecardsCol = db.collection(COLLECTIONS.scorecards);
  const pillarsCol = db.collection(COLLECTIONS.pillars);
  const indicatorsCol = db.collection(COLLECTIONS.indicators);
  const targetsCol = db.collection(COLLECTIONS.complianceTargets);

  const scorecardCursor = await db.query(aql`
    FOR s IN ${scorecardsCol}
      FILTER s.sectorCode == ${sectorCode} AND s.scorecardType == ${scorecardType}
      SORT s.createdAt DESC
      LIMIT 1
      RETURN s
  `);
  const scorecard = await scorecardCursor.next();
  if (!scorecard || !scorecard._key) return null;

  const pillarsCursor = await db.query(aql`
    FOR p IN ${pillarsCol}
      FILTER p.scorecardId == ${scorecard._key}
      SORT p.displayOrder
      RETURN p
  `);
  const pillars = await pillarsCursor.all();

  const enrichedPillars: EnrichedPillar[] = [];
  for (const p of pillars) {
    const indCursor = await db.query(aql`
      FOR i IN ${indicatorsCol}
        FILTER i.pillarId == ${p._key}
        RETURN i
    `);
    const indicators = await indCursor.all();
    const enrichedIndicators = await Promise.all(
      indicators.map(async (ind) => {
        const targetCursor = await db.query(aql`
          FOR t IN ${targetsCol}
            FILTER t.indicatorId == ${ind._key} AND t.sectorCode == ${sectorCode}
            RETURN t
        `);
        const targets = await targetCursor.all();
        return { ...ind, targets };
      })
    );
    enrichedPillars.push({ ...p, indicators: enrichedIndicators });
  }

  return { scorecard, pillars: enrichedPillars };
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

type Shareholder = ParseResult['shareholders'][0];
type Employee = ParseResult['employees'][0];
type Training = ParseResult['trainingPrograms'][0];
type Supplier = ParseResult['suppliers'][0];
type Contribution = ParseResult['esdContributions'][0];

function generateMockShareholders(count: number): Shareholder[] {
  const out: Shareholder[] = [];
  const names = ['Acme Holdings', 'Black Equity Fund', 'BWO Investments', 'Diversified Trust'];
  const boBwoPairs: [number, number][] = [
    [0.85, 0.45], [0.60, 0.30], [0.40, 0.15], [0.25, 0.10],
  ];
  for (let i = 0; i < count; i++) {
    const [bo, bwo] = boBwoPairs[i % boBwoPairs.length];
    out.push({
      name: names[i % names.length] + (i > 3 ? ` ${i}` : ''),
      blackOwnership: bo,
      blackWomenOwnership: Math.min(bwo, bo),
      shares: 100 / count,
      shareValue: 500000 * (0.8 + Math.random() * 0.4),
    });
  }
  return out;
}

function generateMockEmployees(count: number): Employee[] {
  const races = ['African', 'Coloured', 'Indian', 'White'];
  const designations = ['Board', 'Executive', 'Senior', 'Middle', 'Junior'];
  const out: Employee[] = [];
  for (let i = 0; i < count; i++) {
    const race = races[i % races.length];
    out.push({
      name: `Employee ${i + 1}`,
      gender: i % 3 === 0 ? 'Female' : 'Male',
      race,
      designation: designations[i % designations.length],
      isDisabled: i % 20 === 0,
    });
  }
  return out;
}

function generateMockTrainings(count: number, leviableAmount: number): Training[] {
  const targetPct = 0.035;
  const targetPerItem = (leviableAmount * targetPct) / Math.max(count, 1);
  const out: Training[] = [];
  const categories = ['bursary', 'learnership', 'training'];
  for (let i = 0; i < count; i++) {
    const cost = targetPerItem * (0.5 + Math.random());
    out.push({
      name: `Training ${i + 1}`,
      category: categories[i % categories.length],
      cost,
      learnerName: `Learner ${i + 1}`,
      isEmployed: i % 2 === 0,
      isBlack: i < count * 0.8,
    });
  }
  return out;
}

function generateMockSuppliers(count: number, tmps: number): Supplier[] {
  const spendPer = (tmps * 0.9) / Math.max(count, 1);
  const levels = [1, 2, 3, 4, 5, 6, 7];
  const out: Supplier[] = [];
  for (let i = 0; i < count; i++) {
    const bo = i % 3 === 0 ? 0.51 : i % 3 === 1 ? 0.30 : 0.15;
    out.push({
      name: `Supplier ${i + 1}`,
      beeLevel: levels[i % levels.length],
      blackOwnership: bo,
      spend: spendPer * (0.7 + Math.random() * 0.6),
    });
  }
  return out;
}

function generateMockESD(npat: number): Contribution[] {
  const targetSD = npat * 0.02;
  const targetED = npat * 0.01;
  return [
    { beneficiary: 'SD Beneficiary', type: 'grant', amount: targetSD * 0.8, category: 'supplier_development' },
    { beneficiary: 'ED Beneficiary', type: 'grant', amount: targetED * 0.7, category: 'enterprise_development' },
  ];
}

function generateMockSED(npat: number): Contribution[] {
  const target = npat * 0.01;
  return [
    { beneficiary: 'SED Beneficiary', type: 'donation', amount: target * 1.2, category: 'sed' },
  ];
}

// ---------------------------------------------------------------------------
// Build SectorConfig from ArangoDB full scorecard
// ---------------------------------------------------------------------------

function getTarget(indicator: Indicator & { targets: ComplianceTarget[] }, code: string): { value: number; maxPts: number } {
  const t = indicator.targets[0];
  return {
    value: t?.targetValue ?? 0,
    maxPts: indicator.maxPoints,
  };
}

function findIndicator(pillars: EnrichedPillar[], pillarCode: string, indCode: string) {
  const p = pillars.find(x => x.code === pillarCode);
  return p?.indicators.find(i => i.code === indCode);
}

function buildSectorConfigFromArango(full: FullScorecard): SectorConfig {
  const { scorecard, pillars } = full;
  const levelThresholds = scorecard.levelThresholds ?? RCOGP_GENERIC.levelThresholds;

  const pc = (p: EnrichedPillar): PillarConfig => ({
    maxPoints: p.maxPoints,
    hasSubMinimum: p.hasSubMinimum,
    subMinimumPercent: p.subMinimumThreshold * 100,
  });

  // Ownership
  const oVoting = findIndicator(pillars, 'ownership', 'own_voting_black');
  const oVotingBw = findIndicator(pillars, 'ownership', 'own_voting_bw');
  const oEi = findIndicator(pillars, 'ownership', 'own_ei_black');
  const oEiBw = findIndicator(pillars, 'ownership', 'own_ei_bw');
  const oNv = findIndicator(pillars, 'ownership', 'own_net_value');
  const oNew = findIndicator(pillars, 'ownership', 'own_new_entrants');

  const ownership: OwnershipTargets = {
    votingRightsTarget: oVoting ? getTarget(oVoting, 'own_voting_black').value : 0.25,
    votingRightsMaxPts: oVoting ? oVoting.maxPoints : 4,
    womenVotingTarget: oVotingBw ? getTarget(oVotingBw, 'own_voting_bw').value : 0.10,
    womenVotingMaxPts: oVotingBw ? oVotingBw.maxPoints : 2,
    economicInterestTarget: oEi ? getTarget(oEi, 'own_ei_black').value : 0.25,
    economicInterestMaxPts: oEi ? oEi.maxPoints : 8,
    womenEITarget: oEiBw ? getTarget(oEiBw, 'own_ei_bw').value : 0.10,
    womenEIMaxPts: oEiBw ? oEiBw.maxPoints : 2,
    netValueMaxPts: oNv ? oNv.maxPoints : 8,
    newEntrantsMaxPts: oNew ? oNew.maxPoints : 1,
  };

  // Management Control
  const mcBoardB = findIndicator(pillars, 'managementControl', 'mc_board_black');
  const mcBoardBw = findIndicator(pillars, 'managementControl', 'mc_board_bw');
  const mcExecB = findIndicator(pillars, 'managementControl', 'mc_exec_black');
  const mcExecBw = findIndicator(pillars, 'managementControl', 'mc_exec_bw');

  const mc: MCTargets = {
    boardBlackTarget: mcBoardB ? getTarget(mcBoardB!, 'mc_board_black').value : 0.50,
    boardBlackMaxPts: mcBoardB ? mcBoardB!.maxPoints : 1,
    boardBWTarget: mcBoardBw ? getTarget(mcBoardBw!, 'mc_board_bw').value : 0.25,
    boardBWMaxPts: mcBoardBw ? mcBoardBw!.maxPoints : 1,
    execBlackTarget: mcExecB ? getTarget(mcExecB!, 'mc_exec_black').value : 0.60,
    execBlackMaxPts: mcExecB ? mcExecB!.maxPoints : 2,
    execBWTarget: mcExecBw ? getTarget(mcExecBw!, 'mc_exec_bw').value : 0.30,
    execBWMaxPts: mcExecBw ? mcExecBw!.maxPoints : 2,
  };

  // Employment Equity
  const eeSenior = findIndicator(pillars, 'employmentEquity', 'ee_senior');
  const eeMiddle = findIndicator(pillars, 'employmentEquity', 'ee_middle');
  const eeJunior = findIndicator(pillars, 'employmentEquity', 'ee_junior');
  const eeDisabled = findIndicator(pillars, 'employmentEquity', 'ee_disabled');

  const ee: EETargets = {
    seniorMaxPts: eeSenior ? eeSenior.maxPoints : 5,
    middleMaxPts: eeMiddle ? eeMiddle.maxPoints : 4,
    juniorMaxPts: eeJunior ? eeJunior.maxPoints : 4,
    disabledMaxPts: eeDisabled ? eeDisabled.maxPoints : 2,
    disabledTarget: eeDisabled ? getTarget(eeDisabled!, 'ee_disabled').value : 0.02,
  };

  // Skills
  const sdSpend = findIndicator(pillars, 'skillsDevelopment', 'sd_spend_black');
  const sdBursary = findIndicator(pillars, 'skillsDevelopment', 'sd_bursaries');

  const skills: SkillsTargets = {
    overallSpendPercent: sdSpend ? getTarget(sdSpend!, 'sd_spend_black').value * 100 : 3.5,
    overallMaxPts: sdSpend ? sdSpend!.maxPoints : 20,
    bursarySpendPercent: sdBursary ? getTarget(sdBursary!, 'sd_bursaries').value * 100 : 2.5,
    bursaryMaxPts: sdBursary ? sdBursary!.maxPoints : 5,
  };

  // Procurement
  const ppAll = findIndicator(pillars, 'preferentialProcurement', 'pp_all');
  const ppQse = findIndicator(pillars, 'preferentialProcurement', 'pp_qse');
  const ppEme = findIndicator(pillars, 'preferentialProcurement', 'pp_eme');
  const pp51 = findIndicator(pillars, 'preferentialProcurement', 'pp_51bo');
  const pp30 = findIndicator(pillars, 'preferentialProcurement', 'pp_30bwo');
  const ppPillar = pillars.find(p => p.code === 'preferentialProcurement');
  const baseMax = ppPillar ? ppPillar.maxPoints - 2 : 25;

  const procurement: ProcurementTargets = {
    allSuppliersTarget: ppAll ? getTarget(ppAll!, 'pp_all').value : 0.80,
    allSuppliersMaxPts: ppAll ? ppAll!.maxPoints : 5,
    qseTarget: ppQse ? getTarget(ppQse!, 'pp_qse').value : 0.15,
    qseMaxPts: ppQse ? ppQse!.maxPoints : 3,
    emeTarget: ppEme ? getTarget(ppEme!, 'pp_eme').value : 0.15,
    emeMaxPts: ppEme ? ppEme!.maxPoints : 4,
    bo51Target: pp51 ? getTarget(pp51!, 'pp_51bo').value : 0.40,
    bo51MaxPts: pp51 ? pp51!.maxPoints : 10,
    bwo30Target: pp30 ? getTarget(pp30!, 'pp_30bwo').value : 0.12,
    bwo30MaxPts: pp30 ? pp30!.maxPoints : 5,
    bonusMaxPts: 2,
  };

  // ESD
  const esdSd = findIndicator(pillars, 'enterpriseSupplierDevelopment', 'esd_sd');
  const esdEd = findIndicator(pillars, 'enterpriseSupplierDevelopment', 'esd_ed');

  const esd: EsdTargets = {
    sdPercent: esdSd ? getTarget(esdSd!, 'esd_sd').value * 100 : 2.0,
    sdMaxPts: esdSd ? esdSd!.maxPoints : 10,
    edPercent: esdEd ? getTarget(esdEd!, 'esd_ed').value * 100 : 1.0,
    edMaxPts: esdEd ? esdEd!.maxPoints : 5,
  };

  // SED
  const sedInd = findIndicator(pillars, 'socioEconomicDevelopment', 'sed_spend');

  const sed: SedTargets = {
    spendPercent: sedInd ? getTarget(sedInd!, 'sed_spend').value * 100 : 1.0,
    maxPts: sedInd ? sedInd!.maxPoints : 5,
  };

  const pillarMap: Record<string, EnrichedPillar> = {};
  for (const p of pillars) pillarMap[p.code] = p;

  const defaultPillar: EnrichedPillar = {
    scorecardId: '',
    name: '',
    code: '',
    maxPoints: 0,
    hasSubMinimum: false,
    subMinimumThreshold: 0,
    displayOrder: 0,
    indicators: [],
  };

  return {
    sectorCode: scorecard.sectorCode,
    sectorName: `${scorecard.sectorCode} ${scorecard.scorecardType} (from ArangoDB)`,
    scorecardType: scorecard.scorecardType as 'Generic' | 'QSE' | 'EME',
    pillarConfigs: {
      ownership: pc(pillarMap['ownership'] ?? defaultPillar),
      managementControl: pc(pillarMap['managementControl'] ?? defaultPillar),
      employmentEquity: pc(pillarMap['employmentEquity'] ?? defaultPillar),
      skillsDevelopment: pc(pillarMap['skillsDevelopment'] ?? defaultPillar),
      preferentialProcurement: pc(pillarMap['preferentialProcurement'] ?? defaultPillar),
      enterpriseSupplierDevelopment: pc(pillarMap['enterpriseSupplierDevelopment'] ?? defaultPillar),
      socioEconomicDevelopment: pc(pillarMap['socioEconomicDevelopment'] ?? defaultPillar),
    },
    targets: { ownership, managementControl: mc, employmentEquity: ee, skills, procurement, esd, sed },
    levelThresholds,
  } as SectorConfig;
}

// ---------------------------------------------------------------------------
// Run calculations for a sector
// ---------------------------------------------------------------------------

interface CalcResults {
  ownership: number;
  managementControl: number;
  employmentEquity: number;
  skillsDevelopment: number;
  preferentialProcurement: number;
  enterpriseSupplierDevelopment: number;
  socioEconomicDevelopment: number;
  totalPoints: number;
  level: number;
  label: string;
}

function runCalcs(
  cfg: SectorConfigType,
  mock: {
    shareholders: Shareholder[];
    employees: Employee[];
    trainings: Training[];
    suppliers: Supplier[];
    esd: Contribution[];
    sed: Contribution[];
    leviableAmount: number;
    tmps: number;
    npat: number;
  }
): CalcResults {
  const ow = calcOwnershipSector(mock.shareholders, cfg);
  const mc = calcMCSector(mock.employees, cfg);
  const ee = calcEESector(mock.employees, cfg);
  const sk = calcSkillsSector(mock.trainings, mock.leviableAmount, cfg);
  const pp = calcProcurementSector(mock.suppliers, mock.tmps, cfg);
  const esd = calcEsdSector(mock.esd, mock.npat, cfg);
  const sed = calcSedSector(mock.sed, mock.npat, cfg);

  const total =
    (typeof ow === 'object' ? ow.total : ow) +
    mc +
    ee +
    (typeof sk === 'object' ? sk.total : sk) +
    (typeof pp === 'object' ? pp.total : pp) +
    (typeof esd === 'object' ? esd.total : esd) +
    (typeof sed === 'object' ? sed.total : sed);

  const levelInfo = determineLevelSector(total, cfg);

  return {
    ownership: typeof ow === 'object' ? ow.total : ow,
    managementControl: mc,
    employmentEquity: ee,
    skillsDevelopment: typeof sk === 'object' ? sk.total : sk,
    preferentialProcurement: typeof pp === 'object' ? pp.total : pp,
    enterpriseSupplierDevelopment: typeof esd === 'object' ? esd.total : esd,
    socioEconomicDevelopment: typeof sed === 'object' ? sed.total : sed,
    totalPoints: Math.round(total * 100) / 100,
    level: levelInfo.level,
    label: levelInfo.label,
  };
}

// ---------------------------------------------------------------------------
// Sector list for iteration
// ---------------------------------------------------------------------------

const ALL_SECTORS: Array<{ sectorCode: string; scorecardType: string }> = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { sectorCode: 'ICT', scorecardType: 'Generic' },
  { sectorCode: 'FSC', scorecardType: 'Generic' },
  { sectorCode: 'AGRI', scorecardType: 'Generic' },
  { sectorCode: 'RCOGP', scorecardType: 'QSE' },
  { sectorCode: 'ICT', scorecardType: 'QSE' },
];

const PILLAR_NAMES: Record<string, string> = {
  ownership: 'Ownership',
  managementControl: 'Management Control',
  employmentEquity: 'Employment Equity',
  skillsDevelopment: 'Skills Development',
  preferentialProcurement: 'Preferential Procurement',
  enterpriseSupplierDevelopment: 'Enterprise & Supplier Dev',
  socioEconomicDevelopment: 'Socio-Economic Development',
};

const DEVIATION_THRESHOLD = 0.02;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ArangoDB Calculator Path Accuracy Test');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ARANGO_URL: ${ARANGO_URL}  |  DB: ${ARANGO_DB}`);
  console.log('───────────────────────────────────────────────────────────────');

  const db = await tryConnectArango();
  const arangoAvailable = db !== null;

  if (!arangoAvailable) {
    console.log('  ArangoDB is not available. Running DRY RUN (in-code config only).');
    console.log('  To test ArangoDB path: start ArangoDB and ensure templates are ingested.');
  } else {
    console.log('  ArangoDB connected. Will compare in-code vs ArangoDB config results.');
  }

  // Synthetic test data
  const leviableAmount = 5_000_000;
  const tmps = 3_000_000;
  const npat = 800_000;

  const mock = {
    shareholders: generateMockShareholders(4),
    employees: generateMockEmployees(25),
    trainings: generateMockTrainings(8, leviableAmount),
    suppliers: generateMockSuppliers(12, tmps),
    esd: generateMockESD(npat),
    sed: generateMockSED(npat),
    leviableAmount,
    tmps,
    npat,
  };

  console.log('\n  Mock data:');
  console.log(`    Shareholders: ${mock.shareholders.length}, Employees: ${mock.employees.length}`);
  console.log(`    Trainings: ${mock.trainings.length}, Suppliers: ${mock.suppliers.length}`);
  console.log(`    Leviable: ${leviableAmount.toLocaleString()}, TMPS: ${tmps.toLocaleString()}, NPAT: ${npat.toLocaleString()}`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const { sectorCode, scorecardType } of ALL_SECTORS) {
    console.log(`\n  --- ${sectorCode} ${scorecardType} ---`);

    const inCodeConfig = getSectorConfig(sectorCode, scorecardType);
    const inCodeResults = runCalcs(inCodeConfig, mock);

    console.log(`    In-code: ${inCodeResults.totalPoints.toFixed(2)} pts → ${inCodeResults.label}`);

    if (!arangoAvailable || !db) {
      console.log('    ArangoDB: (skipped - no DB)');
      totalSkipped++;
      continue;
    }

    const full = await getFullScorecardFromDb(db, sectorCode, scorecardType);
    if (!full) {
      console.log(`    ArangoDB: (no template for ${sectorCode} ${scorecardType})`);
      totalSkipped++;
      continue;
    }

    let arangoConfig: SectorConfig;
    try {
      arangoConfig = buildSectorConfigFromArango(full as FullScorecard);
    } catch (err) {
      console.log(`    ArangoDB: build error - ${err instanceof Error ? err.message : String(err)}`);
      totalSkipped++;
      continue;
    }

    const arangoResults = runCalcs(arangoConfig as SectorConfigType, mock);

    let sectorPassed = true;
    const pillars = Object.keys(PILLAR_NAMES) as Array<keyof CalcResults>;

    for (const key of pillars) {
      if (key === 'totalPoints' || key === 'level' || key === 'label') continue;
      const inc = inCodeResults[key] as number;
      const ar = arangoResults[key] as number;
      const dev = Math.abs(inc - ar);
      const passed = dev <= DEVIATION_THRESHOLD;
      if (!passed) sectorPassed = false;
      const status = passed ? 'OK' : 'FAIL';
      console.log(`    [${status}] ${PILLAR_NAMES[key]}: in-code ${inc.toFixed(2)} vs Arango ${ar.toFixed(2)} (Δ ${dev.toFixed(3)})`);
    }

    const totalDev = Math.abs(inCodeResults.totalPoints - arangoResults.totalPoints);
    const totalOk = totalDev <= DEVIATION_THRESHOLD;
    if (!totalOk) sectorPassed = false;
    console.log(`    [${sectorPassed ? 'OK' : 'FAIL'}] Total: in-code ${inCodeResults.totalPoints.toFixed(2)} vs Arango ${arangoResults.totalPoints.toFixed(2)} (Δ ${totalDev.toFixed(3)})`);

    if (sectorPassed) totalPassed++;
    else totalFailed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${totalPassed} passed | ${totalFailed} failed | ${totalSkipped} skipped (no Arango template)`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
