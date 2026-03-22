import type { ParseResult } from './excelParser.js';
import type { PipelineResult, PipelineLog } from './types.js';
import { r2 } from './calculators.js';
import { detectSectorFromName } from './sectorConfig.js';
import type { SectorConfig } from './sectorConfig.js';
import {
  calcOwnershipSector, calcMCSector, calcEESector,
  calcSkillsSector, calcProcurementSector, calcEsdSector,
  calcSedSector, determineLevelSector,
} from './sectorCalculators.js';
import { determineBeeLevel, LEVEL_POINTS_THRESHOLDS } from './levelDetermination.js';
import { generateSuggestions } from './suggestions.js';
import { resolveIndustryNorm } from './industryNorms.js';

function _isBlack(r: string) { return ['African', 'Coloured', 'Indian'].includes(r); }

function _boardBlackPct(employees: ParseResult['employees']): number {
  const board = employees.filter(e => e.designation === 'Board');
  return board.length > 0 ? board.filter(e => _isBlack(e.race)).length / board.length : 0;
}

function _execBlackPct(employees: ParseResult['employees']): number {
  const exec = employees.filter(e => e.designation === 'Executive');
  return exec.length > 0 ? exec.filter(e => _isBlack(e.race)).length / exec.length : 0;
}

function _disabledPct(employees: ParseResult['employees']): number {
  return employees.length > 0 ? employees.filter(e => e.isDisabled).length / employees.length : 0;
}

export function buildPipelineResult(parsed: ParseResult, filename: string): PipelineResult {
  const now = new Date().toISOString();

  const revenue = parsed.client.revenue || 0;
  const npat = parsed.client.npat || 0;
  const leviableAmount = parsed.client.leviableAmount || 0;
  const payroll = parsed.client.payroll || leviableAmount || 0;
  const tmps = parsed.client.tmps || 0;
  const tmpsInclusions = parsed.client.tmpsInclusions || revenue;
  const tmpsExclusions = parsed.client.tmpsExclusions || (revenue - tmps);

  const industryNorm = resolveIndustryNorm(parsed.client.industrySector || '', parsed.client.name || '');

  const actualMargin = revenue > 0 ? (npat / revenue) * 100 : 0;
  const deemedNpatUsed = revenue > 0 && (npat <= 0 || actualMargin < (industryNorm * 0.25));
  const deemedNpat = deemedNpatUsed ? revenue * (industryNorm / 100) : npat;
  const effectiveNpat = Math.max(deemedNpatUsed ? deemedNpat : npat, 0);

  const logs: PipelineLog[] = [...parsed.logs];
  const addLog = (msg: string, type: PipelineLog['type'] = 'info') => {
    logs.push({ message: msg, type, timestamp: new Date().toISOString() });
  };

  addLog(`Entity: ${parsed.client.name || filename}`, 'info');
  addLog(`Sector: ${parsed.client.industrySector || 'Generic'} · Industry norm: ${industryNorm}%`, 'info');
  addLog(`Revenue: R${(revenue / 1e6).toFixed(2)}M · NPAT: R${(npat / 1e6).toFixed(2)}M · Payroll: R${(leviableAmount / 1e6).toFixed(2)}M · TMPS: R${(tmps / 1e6).toFixed(2)}M`, 'info');
  if (deemedNpatUsed) {
    addLog(`Deemed NPAT used: R${(deemedNpat / 1e6).toFixed(2)}M (actual margin ${r2(actualMargin)}% < ${r2(industryNorm * 0.25)}% threshold)`, 'warning');
  }

  addLog(`Found ${parsed.shareholders.length} shareholders`, parsed.shareholders.length > 0 ? 'success' : 'warning');
  for (const s of parsed.shareholders.slice(0, 8)) {
    addLog(`  → ${s.name}: BO ${r2(s.blackOwnership * 100)}%, BWO ${r2(s.blackWomenOwnership * 100)}%`, 'info');
  }
  if (parsed.shareholders.length > 8) addLog(`  ... and ${parsed.shareholders.length - 8} more`, 'info');

  addLog(`Found ${parsed.employees.length} employees`, parsed.employees.length > 0 ? 'success' : 'warning');
  const designations: Record<string, number> = {};
  for (const e of parsed.employees) { designations[e.designation] = (designations[e.designation] || 0) + 1; }
  if (Object.keys(designations).length > 0) {
    addLog(`  → Breakdown: ${Object.entries(designations).map(([k, v]) => `${k}: ${v}`).join(', ')}`, 'info');
  }

  addLog(`Found ${parsed.trainingPrograms.length} training programmes`, parsed.trainingPrograms.length > 0 ? 'success' : 'warning');
  if (parsed.trainingPrograms.length > 0) {
    const blackTraining = parsed.trainingPrograms.filter(t => t.isBlack);
    const totalCost = parsed.trainingPrograms.reduce((a, t) => a + t.cost, 0);
    addLog(`  → Black learners: ${blackTraining.length} · Total spend: R${(totalCost / 1e6).toFixed(2)}M`, 'info');
  }

  addLog(`Found ${parsed.suppliers.length} suppliers`, parsed.suppliers.length > 0 ? 'success' : 'warning');
  if (parsed.suppliers.length > 0) {
    const totalSpend = parsed.suppliers.reduce((a, s) => a + s.spend, 0);
    const levelGroups: Record<number, number> = {};
    for (const s of parsed.suppliers) { levelGroups[s.beeLevel] = (levelGroups[s.beeLevel] || 0) + 1; }
    addLog(`  → Total spend: R${(totalSpend / 1e6).toFixed(2)}M · Levels: ${Object.entries(levelGroups).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `L${k}:${v}`).join(', ')}`, 'info');
  }

  addLog(`Found ${parsed.esdContributions.length} ESD + ${parsed.sedContributions.length} SED contributions`, (parsed.esdContributions.length + parsed.sedContributions.length) > 0 ? 'success' : 'warning');

  const sectorCfg: SectorConfig = detectSectorFromName(
    parsed.client.industrySector || parsed.client.applicableScorecard || '',
  );
  addLog(`Sector config: ${sectorCfg.sectorName} (${sectorCfg.sectorCode} ${sectorCfg.scorecardType})`, 'info');

  const own = calcOwnershipSector(parsed.shareholders, sectorCfg);
  const mcScore = calcMCSector(parsed.employees, sectorCfg);
  const eeScore = calcEESector(parsed.employees, sectorCfg);
  const sk = calcSkillsSector(parsed.trainingPrograms, leviableAmount, sectorCfg);
  const pr = calcProcurementSector(parsed.suppliers, tmps, sectorCfg);
  const esd = calcEsdSector(parsed.esdContributions, effectiveNpat, sectorCfg);
  const sed = calcSedSector(parsed.sedContributions, effectiveNpat, sectorCfg);

  const pCfg = sectorCfg.pillarConfigs;
  addLog(`Calculated: Ownership ${r2(own.total)}/${pCfg.ownership.maxPoints} · MC ${r2(mcScore)}/${pCfg.managementControl.maxPoints} · EE ${r2(eeScore)}/${pCfg.employmentEquity.maxPoints} · Skills ${r2(sk.total)}/${pCfg.skillsDevelopment.maxPoints} · Procurement ${r2(pr.total)}/${pCfg.preferentialProcurement.maxPoints} · ESD ${r2(esd.total)}/${pCfg.enterpriseSupplierDevelopment.maxPoints} · SED ${r2(sed.total)}/${pCfg.socioEconomicDevelopment.maxPoints}`, 'success');

  const pillarScores = {
    ownership: r2(own.total),
    managementControl: r2(mcScore),
    employmentEquity: r2(eeScore),
    skillsDevelopment: r2(sk.total),
    preferentialProcurement: r2(pr.total),
    enterpriseSupplierDevelopment: r2(esd.total),
    socioEconomicDevelopment: r2(sed.total),
    yesInitiative: 0,
    totalPoints: 0,
  };

  const sv = parsed.scorecardValues;
  if (sv) {
    // Detect when the toolkit stores MC+EE as a single combined element.
    // This happens when either:
    //   (a) An explicit 'managementControlAndEE' key exists, or
    //   (b) The 'managementControl' value exceeds 8 (its solo max),
    //       indicating it's really MC+EE combined (max 19).
    const mcMax = pCfg.managementControl.maxPoints;
    const eeMax = pCfg.employmentEquity.maxPoints;
    const mceeMax = mcMax + eeMax;
    const explicitCombined = sv.managementControlAndEE !== undefined;
    const implicitCombined = sv.managementControl !== undefined && sv.managementControl > mcMax + 0.5 && sv.employmentEquity === undefined;

    if (explicitCombined || implicitCombined) {
      const combinedRef = explicitCombined ? sv.managementControlAndEE! : sv.managementControl!;
      const combinedCalc = pillarScores.managementControl + pillarScores.employmentEquity;
      if (combinedRef >= 0 && combinedRef <= mceeMax * 1.5) {
        if (combinedCalc > 0) {
          const ratio = combinedRef / combinedCalc;
          pillarScores.managementControl = r2(Math.min(mcMax, pillarScores.managementControl * ratio));
          pillarScores.employmentEquity = r2(Math.min(eeMax, pillarScores.employmentEquity * ratio));
          addLog(`MC+EE combined ref ${r2(combinedRef)} → split MC ${pillarScores.managementControl} + EE ${pillarScores.employmentEquity}`, 'info');
        }
      }
      sv.managementControl = pillarScores.managementControl;
      sv.employmentEquity = pillarScores.employmentEquity;
      delete sv.managementControlAndEE;
    }

    const override = (key: keyof typeof pillarScores, svKey: string, maxPts: number, label: string) => {
      const ref = sv[svKey];
      if (ref !== undefined && ref >= 0 && ref <= maxPts * 1.5) {
        const calc = pillarScores[key];
        if (Math.abs(ref - calc) > maxPts * 0.15 || (ref > 0 && calc === 0) || (ref === 0 && calc > maxPts * 0.3)) {
          addLog(`Scorecard override: ${label} ${calc} → ${r2(ref)} (from Excel scorecard sheet)`, 'warning');
          pillarScores[key] = r2(ref);
        }
      }
    };
    override('ownership', 'ownership', pCfg.ownership.maxPoints, 'Ownership');
    override('managementControl', 'managementControl', pCfg.managementControl.maxPoints, 'MC');
    override('employmentEquity', 'employmentEquity', pCfg.employmentEquity.maxPoints, 'EE');
    override('skillsDevelopment', 'skillsDevelopment', pCfg.skillsDevelopment.maxPoints, 'Skills');
    override('preferentialProcurement', 'preferentialProcurement', pCfg.preferentialProcurement.maxPoints, 'Procurement');
    override('enterpriseSupplierDevelopment', 'enterpriseSupplierDevelopment', pCfg.enterpriseSupplierDevelopment.maxPoints, 'ESD');
    override('socioEconomicDevelopment', 'socioEconomicDevelopment', pCfg.socioEconomicDevelopment.maxPoints, 'SED');
    override('yesInitiative', 'yesInitiative', 5, 'YES');
  }

  pillarScores.totalPoints = r2(
    pillarScores.ownership + pillarScores.managementControl + pillarScores.employmentEquity +
    pillarScores.skillsDevelopment + pillarScores.preferentialProcurement +
    pillarScores.enterpriseSupplierDevelopment + pillarScores.socioEconomicDevelopment +
    pillarScores.yesInitiative
  );

  if (sv?.totalPoints !== undefined && sv.totalPoints > 0) {
    const diff = Math.abs(sv.totalPoints - pillarScores.totalPoints);
    if (diff > 5) {
      pillarScores.totalPoints = r2(sv.totalPoints);
    }
  }

  const ownSubMinThresh = pCfg.ownership.maxPoints * (pCfg.ownership.subMinimumPercent / 100);
  const skSubMinThresh = pCfg.skillsDevelopment.maxPoints * (pCfg.skillsDevelopment.subMinimumPercent / 100);
  const prSubMinThresh = pCfg.preferentialProcurement.maxPoints * (pCfg.preferentialProcurement.subMinimumPercent / 100);
  const ownSubMinMet = !pCfg.ownership.hasSubMinimum || pillarScores.ownership >= ownSubMinThresh || own.subMinMet;
  const skSubMinMet = !pCfg.skillsDevelopment.hasSubMinimum || pillarScores.skillsDevelopment >= skSubMinThresh || sk.subMinMet;
  const prSubMinMet = !pCfg.preferentialProcurement.hasSubMinimum || pillarScores.preferentialProcurement >= prSubMinThresh || pr.subMinMet;
  const allSubMinsMet = ownSubMinMet && skSubMinMet && prSubMinMet;
  const achieved = determineBeeLevel(pillarScores.totalPoints);
  const isNonCompliant = achieved.level >= 9;
  const discountedLevelNum = (!allSubMinsMet && !isNonCompliant) ? Math.min(achieved.level + 1, 8) : achieved.level;
  const discounted = determineBeeLevel(discountedLevelNum <= 8 ? LEVEL_POINTS_THRESHOLDS[discountedLevelNum - 1] : 0);

  const finalLevel = (!allSubMinsMet && !isNonCompliant) ? discounted : achieved;

  addLog(`Total: ${pillarScores.totalPoints} pts → ${achieved.label} (${achieved.recognition}% recognition)`, 'success');
  if (!ownSubMinMet) addLog(`Sub-minimum FAILED: Ownership (net value ${r2(own.total)} < threshold)`, 'error');
  if (!skSubMinMet) addLog(`Sub-minimum FAILED: Skills Development (${r2(sk.total)} < 8 pts)`, 'error');
  if (!prSubMinMet) addLog(`Sub-minimum FAILED: Procurement (${r2(pr.total)} < 10.8 pts)`, 'error');
  if (!allSubMinsMet && !isNonCompliant) {
    addLog(`Discounting applied: ${achieved.label} → ${discounted.label}`, 'warning');
  }
  if (allSubMinsMet) addLog(`All sub-minimums passed`, 'success');
  const suggestions = generateSuggestions(pillarScores, { ownership: ownSubMinMet, skills: skSubMinMet, procurement: prSubMinMet }, finalLevel.label);

  const blackOwnershipPct = own.blackOwnership > 0 ? r2(own.blackOwnership * 100) : 0;
  const blackFemalePct = own.blackWomenOwnership > 0 ? r2(own.blackWomenOwnership * 100) : 0;

  const hasEsd = esd.totalContributions > 0;
  const totalEntities = parsed.shareholders.length + parsed.employees.length +
    parsed.trainingPrograms.length + parsed.suppliers.length +
    parsed.esdContributions.length + parsed.sedContributions.length;

  let status: PipelineResult['status'] = 'failed';
  if (parsed.success && totalEntities > 0) status = 'success';
  else if (parsed.success) status = 'partial_success';

  return {
    status,
    processedAt: now,
    sourceFiles: [filename],
    extractionSummary: {
      sheetsParsed: parsed.stats.matchedSheets,
      sheetsTotal: parsed.stats.totalSheets,
      rowsExtracted: totalEntities,
      entitiesExtracted: parsed.stats.entitiesExtracted,
      warnings: parsed.warnings,
      errors: parsed.errors,
    },

    client: {
      name: parsed.client.name || filename.replace(/\.(xlsx?|csv)$/i, ''),
      tradeName: parsed.client.tradeName || parsed.client.name || '',
      address: parsed.client.address || '',
      registrationNumber: parsed.client.registrationNumber || '',
      vatNumber: parsed.client.vatNumber || '',
      financialYearEnd: parsed.client.financialYear || '',
      industrySector: parsed.client.industrySector || 'Generic',
      applicableScorecard: parsed.client.applicableScorecard || 'Generic',
      applicableCodes: parsed.client.applicableCodes || 'Revised Codes',
      certificateNumber: '',
    },

    financials: {
      revenue,
      npat,
      payroll,
      leviableAmount,
      tmpsInclusions: r2(tmpsInclusions),
      tmpsExclusions: r2(tmpsExclusions),
      tmps,
      deemedNpat: r2(deemedNpat),
      deemedNpatUsed,
      industryNormUsed: industryNorm,
    },

    ownership: {
      blackOwnershipPercent: blackOwnershipPct,
      blackFemaleOwnershipPercent: blackFemalePct,
      votingRightsBlack: blackOwnershipPct,
      economicInterestBlack: r2(own.economicInterest * 100),
      calculatedPoints: pillarScores.ownership,
      subMinimumMet: own.subMinMet,
      shareholders: parsed.shareholders.map(s => ({
        name: s.name,
        boPercent: r2(s.blackOwnership * 100),
        bwoPercent: r2(s.blackWomenOwnership * 100),
        shares: s.shares || 0,
        shareValue: s.shareValue || 0,
      })),
    },

    managementControl: {
      calculatedPoints: pillarScores.managementControl,
      employeesCount: parsed.employees.length,
      blackBoardPercent: r2(_boardBlackPct(parsed.employees) * 100),
      blackExecPercent: r2(_execBlackPct(parsed.employees) * 100),
      disabledPercent: r2(_disabledPct(parsed.employees) * 100),
      employees: parsed.employees.map(e => ({
        name: e.name,
        gender: e.gender,
        race: e.race,
        designation: e.designation,
        disabled: e.isDisabled,
      })),
    },

    skillsDevelopment: {
      calculatedPoints: pillarScores.skillsDevelopment,
      subMinimumMet: sk.subMinMet,
      leviableAmount,
      totalSpendBlack: sk.totalBlackSpend,
      trainingProgramsCount: parsed.trainingPrograms.length,
      trainings: parsed.trainingPrograms.map(t => ({
        name: t.name,
        category: t.category,
        cost: t.cost,
        isBlack: t.isBlack,
        isEmployed: t.isEmployed,
      })),
    },

    preferentialProcurement: {
      calculatedPoints: pillarScores.preferentialProcurement,
      subMinimumMet: pr.subMinMet,
      tmps,
      recognizedSpend: r2(pr.recognisedSpend),
      suppliersCount: parsed.suppliers.length,
      suppliers: parsed.suppliers.map(s => ({
        supplierName: s.name,
        level: s.beeLevel,
        spend: s.spend,
        blackOwnership: r2(s.blackOwnership * 100),
      })),
    },

    enterpriseSupplierDevelopment: {
      calculatedPoints: pillarScores.enterpriseSupplierDevelopment,
      totalContributions: r2(esd.totalContributions),
      esdList: parsed.esdContributions.map(c => ({
        beneficiary: c.beneficiary,
        type: c.type,
        amount: c.amount,
        category: c.category,
      })),
    },

    socioEconomicDevelopment: {
      calculatedPoints: pillarScores.socioEconomicDevelopment,
      totalSpend: r2(sed.totalSpend),
      sedList: parsed.sedContributions.map(c => ({
        beneficiary: c.beneficiary,
        type: c.type,
        amount: c.amount,
        category: c.category,
      })),
    },

    yes: {
      qualified: false,
      youthCount: 0,
      absorbedCount: 0,
    },

    scorecard: {
      pillars: pillarScores,
      beeLevel: finalLevel.label,
      recognitionLevelPercent: finalLevel.recognition,
      blackOwnershipPercent: blackOwnershipPct,
      blackFemaleOwnershipPercent: blackFemalePct,
      valueAddingSupplier: pr.recognisedSpend > 0 ? 'YES' : 'NO',
      edBeneficiary: hasEsd ? 'YES' : 'NO',
      edCategory: hasEsd ? 'CATEGORY A' : 'N/A',
      subMinimumsMet: allSubMinsMet,
      discountedLevel: discounted.label,
      isDiscounted: !allSubMinsMet && !isNonCompliant,
      yesTier: null,
    },

    rawData: {
      financeRaw: [`Revenue: ${revenue}`, `NPAT: ${npat}`, `Payroll: ${payroll}`, `TMPS: ${tmps}`],
      ownershipRaw: parsed.shareholders.map(s => `${s.name}: BO=${r2(s.blackOwnership * 100)}%, BWO=${r2(s.blackWomenOwnership * 100)}%`),
      mcRaw: parsed.employees.map(e => `${e.name}: ${e.gender}, ${e.race}, ${e.designation}`),
    },

    pdfCertificateData: {
      docNo: '',
      approvedBy: '',
      revisionNo: '',
      lastModified: '',
      verificationDate: '',
      analyst: '',
      signatory: '',
    },

    strategyPackSuggestions: suggestions,

    sheetsFound: parsed.sheetsFound || [],
    sheetsMatched: parsed.sheetsMatched || [],

    logs,
  };
}
