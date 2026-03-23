import * as XLSX from 'xlsx';
import { calculateOwnershipScore } from './calculators/ownership';
import { calculateManagementScore } from './calculators/management';
import { calculateSkillsScore } from './calculators/skills';
import { calculateProcurementScore } from './calculators/procurement';
import { calculateEsdScore, calculateSedScore } from './calculators/esd-sed';

interface ExportOptions {
  analystName?: string;
  reportNotes?: string;
  includeDraft2026?: boolean;
}

function fmt(value: number): number {
  return Number(value.toFixed(2));
}

function pct(value: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

export const exportAuditorExcel = (state: any, options: ExportOptions = {}) => {
  const wb = XLSX.utils.book_new();
  const today = new Date();
  const currentLevel = state.scorecard.isDiscounted ? state.scorecard.discountedLevel : state.scorecard.achievedLevel;

  const defaultOwnership = { id: '', clientId: '', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 };
  const defaultManagement = { id: '', clientId: '', employees: [] };
  const defaultSkills = { id: '', clientId: '', leviableAmount: state.client?.leviableAmount || 0, trainingPrograms: [] };
  const defaultProcurement = { id: '', clientId: '', tmps: 0, suppliers: [] };
  const defaultEsd = { id: '', clientId: '', contributions: [] };
  const defaultSed = { id: '', clientId: '', contributions: [] };

  const ownCalc = calculateOwnershipScore(state.ownership || defaultOwnership);
  const mgtCalc = calculateManagementScore(state.management || defaultManagement);
  const skillCalc = calculateSkillsScore(state.skills || defaultSkills);
  const procCalc = calculateProcurementScore(state.procurement || defaultProcurement);
  const esdCalc = calculateEsdScore(state.esd || defaultEsd, state.client?.npat || 0);
  const sedCalc = calculateSedScore(state.sed || defaultSed, state.client?.npat || 0);

  const deemedNpat = state.client.industryNorm && state.client.npat < (state.client.revenue * state.client.industryNorm * 0.25)
    ? state.client.revenue * state.client.industryNorm
    : null;

  const summaryRows: any[][] = [
    ['B-BBEE SCORECARD — AUDITOR WORKING PAPER'],
    [''],
    ['ENTITY INFORMATION'],
    ['Entity Name', state.client.name],
    ['Trading As', state.client.tradeName || ''],
    ['Financial Year', state.client.financialYear],
    ['Measurement Period', state.client.measurementPeriodStart && state.client.measurementPeriodEnd ? `${state.client.measurementPeriodStart} to ${state.client.measurementPeriodEnd}` : 'Full financial year'],
    ['Industry Sector', state.client.industrySector || 'Generic'],
    ['EAP Province', state.client.eapProvince || 'National'],
    ['Date Generated', today.toLocaleDateString('en-ZA')],
    ['Verification Analyst', options.analystName || 'Not specified'],
    [''],
    ['FINANCIAL SUMMARY'],
    ['Revenue (ZAR)', state.client.revenue],
    ['Net Profit After Tax (ZAR)', state.client.npat],
    ['Leviable Amount / Payroll (ZAR)', state.client.leviableAmount],
    ['TMPS (ZAR)', state.procurement?.tmps || 0],
    ['Industry Norm', state.client.industryNorm || 'Not set'],
    ['Deemed NPAT Applied', deemedNpat ? `Yes — R ${deemedNpat.toLocaleString('en-ZA')}` : 'No'],
    [''],
    ['GENERIC SCORECARD (Amended Codes of Good Practice)'],
    ['Element', 'Indicator', 'Weighting', 'Target Points', 'Score Achieved', 'Achievement %', 'Sub-minimum', 'Sub-min Met'],
    ['Ownership', '', 25, 25, fmt(ownCalc.total), pct(ownCalc.total, 25), '≥ 10 pts', ownCalc.total >= 10 || ownCalc.subMinimumMet ? 'Yes' : 'No'],
    ...ownCalc.subLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Management Control', '', 19, 19, fmt(mgtCalc.total), pct(mgtCalc.total, 19), 'N/A', 'N/A'],
    ...mgtCalc.subLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Skills Development', '', 25, 25, fmt(skillCalc.total), pct(skillCalc.total, 25), '≥ 10 pts', state.scorecard.skillsDevelopment.subMinimumMet ? 'Yes' : 'No'],
    ...skillCalc.subLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Preferential Procurement', '', 29, 29, fmt(procCalc.base), pct(procCalc.base, 29), '≥ 11.6 pts (base)', state.scorecard.procurement.subMinimumMet ? 'Yes' : 'No'],
    ...procCalc.subLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Supplier Development', '', 10, 10, fmt(esdCalc.sdTotal), pct(esdCalc.sdTotal, 10), '≥ 4 pts', esdCalc.sdSubMinimumMet ? 'Yes' : 'No'],
    ...esdCalc.sdSubLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Enterprise Development', '', 7, 7, fmt(esdCalc.edTotal), pct(esdCalc.edTotal, 7), '≥ 2 pts', esdCalc.edSubMinimumMet ? 'Yes' : 'No'],
    ...esdCalc.edSubLines.map(sl => ['', sl.name, '', sl.weighting, fmt(sl.score), '', '', '']),
    ['Socio-Economic Development', '', 5, 5, fmt(sedCalc.total), pct(sedCalc.total, 5), 'N/A', 'N/A'],
    ['', 'SED Contributions (1% of NPAT)', '', 5, fmt(sedCalc.total), '', '', ''],
    ['YES Initiative', '', 5, 5, fmt(state.scorecard.yesInitiative?.score || 0), pct(state.scorecard.yesInitiative?.score || 0, 5), 'N/A', 'N/A'],
    [''],
    ['TOTAL', '', 120, 120, fmt(state.scorecard.total.score), pct(state.scorecard.total.score, 120), '', state.scorecard.isDiscounted ? 'DISCOUNTED' : 'ALL MET'],
    [''],
    ['RESULT'],
    ['B-BBEE Status Level', currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`],
    ['Achieved Level (before discount)', state.scorecard.achievedLevel >= 9 ? 'Non-Compliant' : `Level ${state.scorecard.achievedLevel}`],
    ['Discounted Level', state.scorecard.isDiscounted ? (state.scorecard.discountedLevel >= 9 ? 'Non-Compliant' : `Level ${state.scorecard.discountedLevel}`) : 'N/A — no discounting'],
    ['Recognition Level', state.scorecard.recognitionLevel],
    ['Discounting Applied', state.scorecard.isDiscounted ? 'Yes — Priority element sub-minimum not met' : 'No'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 45 }, { wch: 45 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }];
  wsSummary['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 12, c: 0 }, e: { r: 12, c: 7 } },
    { s: { r: 20, c: 0 }, e: { r: 20, c: 7 } },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Scorecard");

  const levelRows: any[][] = [
    ['LEVEL DETERMINATION & SUB-MINIMUM ANALYSIS'],
    [''],
    ['LEVEL TABLE (Generic Scorecard)'],
    ['Level', 'Minimum Points', 'Recognition Level', 'Procurement Recognition'],
    ['Level 1', '≥ 100', '135%', '135% of spend recognised'],
    ['Level 2', '≥ 95', '125%', '125% of spend recognised'],
    ['Level 3', '≥ 90', '110%', '110% of spend recognised'],
    ['Level 4', '≥ 80', '100%', '100% of spend recognised'],
    ['Level 5', '≥ 75', '80%', '80% of spend recognised'],
    ['Level 6', '≥ 70', '60%', '60% of spend recognised'],
    ['Level 7', '≥ 55', '50%', '50% of spend recognised'],
    ['Level 8', '≥ 40', '10%', '10% of spend recognised'],
    ['Non-Compliant', '< 40', '0%', 'Not recognised'],
    [''],
    ['ENTITY LEVEL DETERMINATION'],
    ['Total Points Scored', fmt(state.scorecard.total.score)],
    ['Achieved Level (before discounting)', state.scorecard.achievedLevel >= 9 ? 'Non-Compliant' : `Level ${state.scorecard.achievedLevel}`],
    ['Discounting Applied', state.scorecard.isDiscounted ? 'Yes' : 'No'],
    ['Final B-BBEE Level', currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`],
    ['Recognition Level', state.scorecard.recognitionLevel],
    [''],
    ['SUB-MINIMUM ANALYSIS (Priority Elements)'],
    ['Priority Element', 'Sub-min Threshold', 'Actual Score', 'Score Used for Test', 'Sub-min Met', 'Impact if Failed'],
    ['Ownership', '≥ 10 pts (or BO ≥ 25%)', fmt(ownCalc.total), ownCalc.fullOwnershipAwarded ? 'Full BO ≥ 25% — auto-pass' : `${fmt(ownCalc.total)} pts`, ownCalc.total >= 10 || ownCalc.subMinimumMet ? 'Yes' : 'No', 'Level discounted by 1'],
    ['Skills Development', '≥ 10 pts (40% of 25)', fmt(skillCalc.total), `${fmt(skillCalc.total)} pts`, skillCalc.subMinimumMet ? 'Yes' : 'No', 'Level discounted by 1'],
    ['Preferential Procurement (base)', '≥ 11.6 pts (base score)', fmt(procCalc.base), `${fmt(procCalc.base)} pts (base only, excl. DG bonus)`, procCalc.subMinimumMet ? 'Yes' : 'No', 'Level discounted by 1'],
    ['Supplier Development', '≥ 4 pts (40% of 10)', fmt(esdCalc.sdTotal), `${fmt(esdCalc.sdTotal)} pts`, esdCalc.sdSubMinimumMet ? 'Yes' : 'No', 'Level discounted by 1'],
    ['Enterprise Development', '≥ 2 pts (40% of 5 base)', fmt(esdCalc.edTotal), `${fmt(esdCalc.edTotal - esdCalc.graduationBonus - esdCalc.jobsCreatedBonus)} base pts`, esdCalc.edSubMinimumMet ? 'Yes' : 'No', 'Level discounted by 1'],
    [''],
    ['NON-PRIORITY ELEMENTS (No sub-minimum applies)'],
    ['Management Control', 'N/A', fmt(mgtCalc.total), '', '', ''],
    ['Socio-Economic Development', 'N/A', fmt(sedCalc.total), '', '', ''],
    ['YES Initiative', 'N/A', fmt(state.scorecard.yesInitiative?.score || 0), '', '', ''],
    [''],
    ['DISCOUNTING RULE'],
    ['If ANY priority element fails its sub-minimum, the achieved level is discounted by 1 (e.g. Level 1 becomes Level 2).'],
    ['Multiple sub-minimum failures still only result in a single level discount.'],
    ['A level cannot be discounted below Level 8. Non-compliant entities (Level 9) are not further discounted.'],
  ];

  const wsLevel = XLSX.utils.aoa_to_sheet(levelRows);
  wsLevel['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 18 }, { wch: 35 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsLevel, "Level Determination");

  const financeRows: any[][] = [
    ['FINANCIAL DATA & DEEMED NPAT ANALYSIS'],
    [''],
    ['PRIMARY FINANCIALS'],
    ['Metric', 'Value (ZAR)', 'Formula / Notes'],
    ['Revenue', state.client.revenue, ''],
    ['Net Profit After Tax (NPAT)', state.client.npat, deemedNpat ? 'Below 25% of industry norm — deemed NPAT may apply' : ''],
    ['Leviable Amount (Payroll)', state.client.leviableAmount, 'Used for Skills Development targets'],
    ['Total Measured Procurement Spend (TMPS)', state.procurement?.tmps || 0, state.procurement?.tmpsManualOverride ? 'Manual override applied' : 'Calculated from supplier data'],
    [''],
    ['INDUSTRY NORM'],
    ['Industry Sector', state.client.industrySector || 'Generic', ''],
    ['Industry Norm Rate', state.client.industryNorm || 'Not set', ''],
    ['Revenue × Industry Norm', state.client.industryNorm ? state.client.revenue * state.client.industryNorm : 'N/A', 'Deemed NPAT if margin test fails'],
    ['Actual Profit Margin', state.client.revenue > 0 ? `${((state.client.npat / state.client.revenue) * 100).toFixed(2)}%` : '0%', 'NPAT / Revenue'],
    ['25% of Industry Norm', state.client.industryNorm ? `${(state.client.industryNorm * 25).toFixed(2)}%` : 'N/A', 'Threshold for deemed NPAT test'],
    ['Deemed NPAT Test', deemedNpat ? 'FAILED — actual margin below 25% of industry norm' : 'PASSED — actual margin above threshold', ''],
    ['Deemed NPAT Amount', deemedNpat || 'N/A', deemedNpat ? 'Revenue × Industry Norm' : ''],
    ['NPAT Used for Calculations', deemedNpat || state.client.npat, deemedNpat ? 'Deemed NPAT applied' : 'Actual NPAT used'],
    [''],
    ['DERIVED TARGETS'],
    ['Skills Dev Target (3.5% of Leviable Amount)', state.client.leviableAmount * 0.035, ''],
    ['Skills Bursary Target (2.5% of Leviable Amount)', state.client.leviableAmount * 0.025, ''],
    ['Procurement Target (80% of TMPS)', (state.procurement?.tmps || 0) * 0.8, ''],
    ['ESD — Supplier Dev Target (2% of NPAT)', Math.abs(state.client.npat) * 0.02, ''],
    ['ESD — Enterprise Dev Target (1% of NPAT)', Math.abs(state.client.npat) * 0.01, ''],
    ['SED Target (1% of NPAT)', Math.abs(state.client.npat) * 0.01, ''],
    [''],
    ['FINANCIAL HISTORY'],
    ['Year', 'Revenue (ZAR)', 'NPAT (ZAR)', 'Margin %'],
  ];

  const financialHistory = state.client.financialHistory || [];
  financialHistory.forEach((fy: any) => {
    financeRows.push([fy.year, fy.revenue, fy.npat, fy.revenue > 0 ? `${((fy.npat / fy.revenue) * 100).toFixed(2)}%` : '0%']);
  });
  if (financialHistory.length === 0) {
    financeRows.push(['No historical data available', '', '', '']);
  }

  const wsFinance = XLSX.utils.aoa_to_sheet(financeRows);
  wsFinance['!cols'] = [{ wch: 45 }, { wch: 25 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsFinance, "Finance");

  const shareholders = state.ownership?.shareholders || [];
  const totalShares = shareholders.reduce((sum: number, sh: any) => sum + (sh.shares || 0), 0);

  const ownershipRows: any[][] = [
    ['OWNERSHIP — ELEMENT 1 (Max 25 Points)'],
    [''],
    ['COMPANY VALUATION'],
    ['Metric', 'Value (ZAR)'],
    ['Company Value', state.ownership?.companyValue || 0],
    ['Outstanding Debt', state.ownership?.outstandingDebt || 0],
    ['Net Value (Company Value − Debt)', (state.ownership?.companyValue || 0) - (state.ownership?.outstandingDebt || 0)],
    ['Years Ownership Held', state.ownership?.yearsHeld || 0],
    ['Graduation Factor (Year ' + (state.ownership?.yearsHeld || 0) + ')', ownCalc.fullOwnershipAwarded ? '1.0 (full ownership)' : ''],
    [''],
    ['SHAREHOLDING REGISTER'],
    ['#', 'Shareholder Name', 'Ownership Type', 'Black Ownership %', 'Black Women %', 'Shares', 'Share Value (ZAR)', '% of Total Shares', 'Weighted BO %', 'Weighted BWO %', 'New Entrant'],
  ];

  shareholders.forEach((sh: any, idx: number) => {
    const weight = totalShares > 0 ? sh.shares / totalShares : 0;
    ownershipRows.push([
      idx + 1,
      sh.name,
      (sh.ownershipType || 'shareholder').replace(/_/g, ' '),
      fmt(sh.blackOwnership * 100),
      fmt(sh.blackWomenOwnership * 100),
      sh.shares,
      sh.shareValue,
      pct(sh.shares, totalShares),
      fmt(sh.blackOwnership * weight * 100),
      fmt(sh.blackWomenOwnership * weight * 100),
      sh.blackNewEntrant ? 'Yes' : 'No',
    ]);
  });

  const totalWeightedBO = shareholders.reduce((sum: number, sh: any) => {
    const w = totalShares > 0 ? sh.shares / totalShares : 0;
    return sum + sh.blackOwnership * w * 100;
  }, 0);
  const totalWeightedBWO = shareholders.reduce((sum: number, sh: any) => {
    const w = totalShares > 0 ? sh.shares / totalShares : 0;
    return sum + sh.blackWomenOwnership * w * 100;
  }, 0);

  ownershipRows.push([
    '', 'TOTALS', '', '', '', totalShares,
    shareholders.reduce((sum: number, sh: any) => sum + (sh.shareValue || 0), 0),
    '100.0%', fmt(totalWeightedBO), fmt(totalWeightedBWO), '',
  ]);

  ownershipRows.push(
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target', 'Max Points', 'Score Achieved'],
    ...ownCalc.subLines.map(sl => [sl.name, sl.target, sl.weighting, fmt(sl.score)]),
    [''],
    ['TOTAL OWNERSHIP SCORE', '', 25, fmt(ownCalc.total)],
    ['Full Ownership Awarded (BO ≥ 25%)', '', ownCalc.fullOwnershipAwarded ? 'Yes' : 'No', '', '', ownCalc.fullOwnershipAwarded ? 'All ownership indicators awarded full points' : ''],
    ['Sub-minimum Met', '', ownCalc.subMinimumMet ? 'Yes' : 'No', '', '', ownCalc.fullOwnershipAwarded ? 'Auto-pass: BO ≥ 25%' : `Net Value points ${fmt(ownCalc.netValue)} ${ownCalc.netValue >= 3.2 ? '≥' : '<'} 3.2 threshold`],
  );

  const wsOwnership = XLSX.utils.aoa_to_sheet(ownershipRows);
  wsOwnership['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsOwnership, "Ownership");

  const employees = state.management?.employees || [];

  const mgmtRows: any[][] = [
    ['MANAGEMENT CONTROL — ELEMENT 2 (Max 19 Points)'],
    [''],
    ['WORKFORCE DEMOGRAPHICS BY DESIGNATION'],
    ['Designation', 'Total', 'African', 'Coloured', 'Indian', 'White', 'Total Black', 'Black %', 'Black Female', 'BWO %', 'Black Male', 'Disabled', 'Disabled Black'],
  ];

  const designations = ['Board', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior'];
  const demoSummary: any[] = [];
  designations.forEach(d => {
    const desg = employees.filter((e: any) => e.designation === d);
    const total = desg.length;
    const african = desg.filter((e: any) => e.race === 'African').length;
    const coloured = desg.filter((e: any) => e.race === 'Coloured').length;
    const indian = desg.filter((e: any) => e.race === 'Indian').length;
    const white = desg.filter((e: any) => e.race === 'White').length;
    const black = african + coloured + indian;
    const blackFemale = desg.filter((e: any) => ['African', 'Coloured', 'Indian'].includes(e.race) && e.gender === 'Female').length;
    const blackMale = desg.filter((e: any) => ['African', 'Coloured', 'Indian'].includes(e.race) && e.gender === 'Male').length;
    const disabled = desg.filter((e: any) => e.isDisabled).length;
    const disabledBlack = desg.filter((e: any) => e.isDisabled && ['African', 'Coloured', 'Indian'].includes(e.race)).length;

    demoSummary.push({ d, total, african, coloured, indian, white, black, blackFemale, blackMale, disabled, disabledBlack });

    if (total > 0) {
      mgmtRows.push([
        d, total, african, coloured, indian, white, black,
        pct(black, total), blackFemale, pct(blackFemale, total),
        blackMale, disabled, disabledBlack,
      ]);
    }
  });

  const allBlack = employees.filter((e: any) => ['African', 'Coloured', 'Indian'].includes(e.race)).length;
  const allBlackFemale = employees.filter((e: any) => ['African', 'Coloured', 'Indian'].includes(e.race) && e.gender === 'Female').length;
  const allBlackMale = employees.filter((e: any) => ['African', 'Coloured', 'Indian'].includes(e.race) && e.gender === 'Male').length;
  const allDisabled = employees.filter((e: any) => e.isDisabled).length;
  const allDisabledBlack = employees.filter((e: any) => e.isDisabled && ['African', 'Coloured', 'Indian'].includes(e.race)).length;

  mgmtRows.push([
    'TOTAL', employees.length,
    employees.filter((e: any) => e.race === 'African').length,
    employees.filter((e: any) => e.race === 'Coloured').length,
    employees.filter((e: any) => e.race === 'Indian').length,
    employees.filter((e: any) => e.race === 'White').length,
    allBlack, pct(allBlack, employees.length),
    allBlackFemale, pct(allBlackFemale, employees.length),
    allBlackMale, allDisabled, allDisabledBlack,
  ]);

  mgmtRows.push(
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target', 'Max Points', 'Score Achieved'],
    ...mgtCalc.subLines.map(sl => [sl.name, sl.target, sl.weighting, fmt(sl.score)]),
    [''],
    ['TOTAL MANAGEMENT CONTROL', '', 19, fmt(mgtCalc.total)],
  );

  mgmtRows.push(
    [''],
    ['EMPLOYEE REGISTER'],
    ['#', 'Full Name', 'Gender', 'Race', 'Designation Level', 'Disabled', 'Black (ACI)'],
  );
  employees.forEach((e: any, idx: number) => {
    const isBlack = ['African', 'Coloured', 'Indian'].includes(e.race);
    mgmtRows.push([idx + 1, e.name, e.gender, e.race, e.designation, e.isDisabled ? 'Yes' : 'No', isBlack ? 'Yes' : 'No']);
  });

  const wsMgmt = XLSX.utils.aoa_to_sheet(mgmtRows);
  wsMgmt['!cols'] = [{ wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsMgmt, "Management Control");

  const programs = state.skills?.trainingPrograms || [];
  const leviable = state.skills?.leviableAmount || state.client.leviableAmount || 0;

  const skillsRows: any[][] = [
    ['SKILLS DEVELOPMENT — ELEMENT 3 (Max 25 Points)'],
    [''],
    ['TARGETS & SPEND'],
    ['Metric', 'Value (ZAR)', 'Formula'],
    ['Leviable Amount (Payroll)', leviable, ''],
    ['Overall Skills Target (6%)', leviable * 0.06, '6% × Leviable Amount'],
    ['Bursary Target (2.5%)', leviable * 0.025, '2.5% × Leviable Amount'],
    ['Black Disabled Target (0.3%)', leviable * 0.003, '0.3% × Leviable Amount'],
    [''],
    ['ACTUAL SPEND'],
    ['Total Black Recognised Spend', skillCalc.rawStats.blackSpend, pct(skillCalc.rawStats.blackSpend, leviable) + ' of Leviable Amount'],
    ['Bursary Spend', skillCalc.rawStats.bursarySpend, pct(skillCalc.rawStats.bursarySpend, leviable) + ' of Leviable Amount'],
    ['Black Disabled Spend', skillCalc.rawStats.disabledSpend, ''],
    ['Non-Black Spend', programs.filter((p: any) => !p.isBlack).reduce((s: number, p: any) => s + p.cost, 0), 'Not counted towards score'],
    ['Total All Training Spend', programs.reduce((s: number, p: any) => s + p.cost, 0), 'Including non-black spend'],
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target', 'Max Points', 'Score Achieved'],
    ...skillCalc.subLines.map(sl => [sl.name, sl.target, sl.weighting, fmt(sl.score)]),
    [''],
    ['TOTAL SKILLS SCORE', '', 25, fmt(skillCalc.total)],
    ['Sub-minimum Threshold', '', '', '≥ 10 pts (40% of 25)'],
    ['Sub-minimum Met', '', '', skillCalc.subMinimumMet ? 'Yes' : 'No'],
    [''],
    ['RAW STATS'],
    ['Black Recognised Spend', skillCalc.rawStats.blackSpend, '', ''],
    ['Bursary Spend', skillCalc.rawStats.bursarySpend, '', ''],
    ['Disabled Spend', skillCalc.rawStats.disabledSpend, '', ''],
    ['Learnership Count', skillCalc.rawStats.learnershipCount, '', ''],
    ['Absorbed Count', skillCalc.rawStats.absorbedCount, '', ''],
    ['Absorption Rate', `${fmt(skillCalc.rawStats.absorptionRate * 100)}%`, '', ''],
    [''],
    ['SPEND BY CATEGORY'],
    ['Category', 'Count', 'Total Spend (ZAR)', 'Black Spend (ZAR)', '% of Total'],
  ];

  const categories = ['learnership', 'internship', 'short_course', 'bursary', 'other'];
  categories.forEach(cat => {
    const catProgs = programs.filter((p: any) => p.category === cat);
    const catTotal = catProgs.reduce((s: number, p: any) => s + p.cost, 0);
    const catBlack = catProgs.filter((p: any) => p.isBlack).reduce((s: number, p: any) => s + p.cost, 0);
    if (catProgs.length > 0) {
      skillsRows.push([cat.replace(/_/g, ' '), catProgs.length, catTotal, catBlack, pct(catTotal, programs.reduce((s: number, p: any) => s + p.cost, 0))]);
    }
  });

  skillsRows.push(
    [''],
    ['TRAINING PROGRAMME REGISTER'],
    ['#', 'Programme Name', 'Category', 'Cost (ZAR)', 'Employed', 'Black (ACI)', 'Gender', 'Race', 'Disabled', 'Start Date', 'End Date'],
  );
  programs.forEach((p: any, idx: number) => {
    skillsRows.push([
      idx + 1, p.name, (p.category || '').replace(/_/g, ' '), p.cost,
      p.isEmployed ? 'Yes' : 'No', p.isBlack ? 'Yes' : 'No',
      p.gender || '', p.race || '', p.isDisabled ? 'Yes' : 'No',
      p.startDate || '', p.endDate || '',
    ]);
  });

  const wsSkills = XLSX.utils.aoa_to_sheet(skillsRows);
  wsSkills['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSkills, "Skills Development");

  const suppliers = state.procurement?.suppliers || [];
  const RECOGNITION_TABLE: Record<number, number> = { 1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00, 5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0 };

  const procRows: any[][] = [
    ['PREFERENTIAL PROCUREMENT — ELEMENT 4 (Max 29 Base + 2 Bonus = 31 Points)'],
    [''],
    ['PROCUREMENT OVERVIEW'],
    ['Metric', 'Value (ZAR)', 'Notes'],
    ['Total Measured Procurement Spend (TMPS)', state.procurement?.tmps || 0, state.procurement?.tmpsManualOverride ? 'Manual override' : 'Calculated'],
    ['Target (80% of TMPS)', (state.procurement?.tmps || 0) * 0.8, 'Empowering supplier spend target'],
    ['Designated Group Target (12% of TMPS)', (state.procurement?.tmps || 0) * 0.12, '51%+ Black Owned supplier spend'],
    [''],
    ['RECOGNITION LEVEL TABLE'],
    ['B-BBEE Level', 'Recognition %', 'Procurement Recognition Factor'],
    ['Level 1', '135%', 'R 1.00 spent = R 1.35 recognised'],
    ['Level 2', '125%', 'R 1.00 spent = R 1.25 recognised'],
    ['Level 3', '110%', 'R 1.00 spent = R 1.10 recognised'],
    ['Level 4', '100%', 'R 1.00 spent = R 1.00 recognised'],
    ['Level 5', '80%', 'R 1.00 spent = R 0.80 recognised'],
    ['Level 6', '60%', 'R 1.00 spent = R 0.60 recognised'],
    ['Level 7', '50%', 'R 1.00 spent = R 0.50 recognised'],
    ['Level 8', '10%', 'R 1.00 spent = R 0.10 recognised'],
    ['Non-Compliant', '0%', 'Not recognised'],
    [''],
    ['SUPPLIER REGISTER'],
    ['#', 'Supplier Name', 'B-BBEE Level', 'Enterprise Type', 'Recognition %', 'Black Own %', 'BWO %', 'Youth %', 'Disabled %', 'Annual Spend (ZAR)', 'Recognised Spend (ZAR)', '51%+ BO (DG)', 'Certificate Expiry', 'Expired'],
  ];

  let totSpend = 0;
  let totRecognised = 0;
  let totDG = 0;
  let totBWO = 0;
  const todayDate = new Date();

  suppliers.forEach((s: any, idx: number) => {
    const recFactor = RECOGNITION_TABLE[s.beeLevel] || 0;
    const recognised = s.spend * recFactor;
    const is51BO = s.blackOwnership >= 0.51;
    const isBWO30 = (s.blackWomenOwnership || 0) >= 0.30;
    totSpend += s.spend;
    totRecognised += recognised;
    if (is51BO) totDG += s.spend;
    if (isBWO30) totBWO += s.spend;

    const expired = s.certificateExpiryDate ? new Date(s.certificateExpiryDate) < todayDate : false;

    procRows.push([
      idx + 1,
      s.name,
      s.beeLevel === 0 ? 'Non-Compliant' : `Level ${s.beeLevel}`,
      (s.enterpriseType || 'generic').toUpperCase(),
      `${(recFactor * 100).toFixed(0)}%`,
      `${fmt(s.blackOwnership * 100)}%`,
      `${fmt((s.blackWomenOwnership || 0) * 100)}%`,
      `${fmt((s.youthOwnership || 0) * 100)}%`,
      `${fmt((s.disabledOwnership || 0) * 100)}%`,
      s.spend,
      recognised,
      is51BO ? 'Yes' : 'No',
      s.certificateExpiryDate || 'Not set',
      expired ? 'EXPIRED' : '',
    ]);
  });

  procRows.push([
    '', 'TOTALS', '', '', '', '', '', '', '', totSpend, totRecognised, '', '', '',
  ]);

  procRows.push(
    [''],
    ['SPEND ANALYSIS'],
    ['Category', 'Spend (ZAR)', '% of TMPS', '% of Total Spend'],
    ['Total Spend with All Suppliers', totSpend, pct(totSpend, state.procurement?.tmps || 0), '100.0%'],
    ['Recognised B-BBEE Procurement Spend', totRecognised, pct(totRecognised, state.procurement?.tmps || 0), pct(totRecognised, totSpend)],
    ['51%+ Black Owned Supplier Spend (DG)', totDG, pct(totDG, state.procurement?.tmps || 0), pct(totDG, totSpend)],
    ['30%+ Black Women Owned Spend', totBWO, pct(totBWO, state.procurement?.tmps || 0), pct(totBWO, totSpend)],
    ['EME Spend', suppliers.filter((s: any) => s.enterpriseType === 'eme').reduce((a: number, s: any) => a + s.spend, 0), '', ''],
    ['QSE Spend', suppliers.filter((s: any) => s.enterpriseType === 'qse').reduce((a: number, s: any) => a + s.spend, 0), '', ''],
    ['Generic Enterprise Spend', suppliers.filter((s: any) => s.enterpriseType === 'generic').reduce((a: number, s: any) => a + s.spend, 0), '', ''],
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target', 'Actual', 'Max Points', 'Score', 'Calculation'],
    ...procCalc.subLines.map(sl => [sl.name, sl.target, '', sl.weighting, fmt(sl.score), sl.isBonus ? 'Bonus tick-box' : '']),
    [''],
    ['TOTAL PROCUREMENT (Base)', '', '', 29, fmt(procCalc.base), 'Used for sub-minimum test'],
    ['TOTAL PROCUREMENT (incl. Bonuses)', '', '', 31, fmt(procCalc.total), 'Final procurement score'],
    ['Sub-minimum Threshold', '', '', '', '≥ 11.6 pts', 'Applied to base score only'],
    ['Sub-minimum Met', '', '', '', procCalc.subMinimumMet ? 'Yes' : 'No', `Base score ${fmt(procCalc.base)} ${procCalc.base >= 11.6 ? '≥' : '<'} 11.6 pts`],
  );

  const wsProc = XLSX.utils.aoa_to_sheet(procRows);
  wsProc['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsProc, "Procurement");

  const esdContributions = state.esd?.contributions || [];
  const esdRows: any[][] = [
    ['ENTERPRISE & SUPPLIER DEVELOPMENT — ELEMENT 5 (Max 15 Points)'],
    [''],
    ['TARGETS (Based on NPAT)'],
    ['Metric', 'Value (ZAR)', 'Formula'],
    ['Net Profit After Tax (NPAT)', state.client.npat, ''],
    ['Supplier Development Target (2% of NPAT)', Math.abs(state.client.npat) * 0.02, '2% × |NPAT|'],
    ['Enterprise Development Target (1% of NPAT)', Math.abs(state.client.npat) * 0.01, '1% × |NPAT|'],
    [''],
    ['BENEFIT FACTOR TABLE'],
    ['Contribution Type', 'Benefit Factor', 'Description'],
    ['Grant / Donation', '100%', 'Full value recognised'],
    ['Interest-Free Loan', '70%', '70% of value recognised'],
    ['Professional Services', '80%', '80% of value recognised'],
    ['Other', '100%', 'Full value recognised'],
    [''],
    ['CONTRIBUTION REGISTER'],
    ['#', 'Beneficiary', 'Category', 'Type', 'Nominal Amount (ZAR)', 'Benefit Factor', 'Recognised Amount (ZAR)'],
  ];

  const getBenefitFactor = (type: string) => {
    switch(type) {
      case 'grant': return 1.0;
      case 'interest_free_loan': return 0.7;
      case 'professional_services': return 0.8;
      default: return 1.0;
    }
  };

  let sdNominal = 0, sdRecognised = 0, edNominal = 0, edRecognised = 0;
  esdContributions.forEach((c: any, idx: number) => {
    const factor = getBenefitFactor(c.type);
    const recognised = c.amount * factor;
    if (c.category === 'supplier_development') { sdNominal += c.amount; sdRecognised += recognised; }
    else if (c.category === 'enterprise_development') { edNominal += c.amount; edRecognised += recognised; }

    esdRows.push([
      idx + 1,
      c.beneficiary,
      c.category.replace(/_/g, ' '),
      c.type.replace(/_/g, ' '),
      c.amount,
      `${(factor * 100).toFixed(0)}%`,
      recognised,
    ]);
  });

  esdRows.push(
    [''],
    ['TOTALS BY CATEGORY'],
    ['Category', 'Nominal Amount (ZAR)', 'Recognised Amount (ZAR)', 'Target (ZAR)', '% of Target'],
    ['Supplier Development', sdNominal, sdRecognised, Math.abs(state.client.npat) * 0.02, pct(sdRecognised, Math.abs(state.client.npat) * 0.02)],
    ['Enterprise Development', edNominal, edRecognised, Math.abs(state.client.npat) * 0.01, pct(edRecognised, Math.abs(state.client.npat) * 0.01)],
    ['TOTAL ESD', sdNominal + edNominal, sdRecognised + edRecognised, '', ''],
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target (ZAR)', 'Recognised Spend (ZAR)', 'Achievement %', 'Max Points', 'Score', 'Calculation'],
    ['Supplier Development (2% of NPAT)', Math.abs(state.client.npat) * 0.02, sdRecognised, pct(sdRecognised, Math.abs(state.client.npat) * 0.02), 10, fmt(esdCalc.sdTotal), `(Recognised / Target) × 10, capped at 10`],
    ['Enterprise Development (1% of NPAT)', Math.abs(state.client.npat) * 0.01, edRecognised, pct(edRecognised, Math.abs(state.client.npat) * 0.01), 5, fmt(esdCalc.enterpriseDev), `(Recognised / Target) × 5`],
    ['ED Graduation Bonus', '', '', '', 1, fmt(esdCalc.graduationBonus), 'Tick-box evidence required'],
    ['ED Jobs Created Bonus', '', '', '', 1, fmt(esdCalc.jobsCreatedBonus), 'Tick-box evidence required'],
    [''],
    ['SD TOTAL', '', '', '', 10, fmt(esdCalc.sdTotal), 'Sub-min ≥ 4 pts (40%)'],
    ['ED TOTAL', '', '', '', 7, fmt(esdCalc.edTotal), 'Sub-min ≥ 2 pts (40% of 5 base)'],
    ['SD + ED TOTAL', '', '', '', 17, fmt(esdCalc.total), ''],
  );

  const wsEsd = XLSX.utils.aoa_to_sheet(esdRows);
  wsEsd['!cols'] = [{ wch: 5 }, { wch: 45 }, { wch: 25 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsEsd, "ESD");

  const sedContributions = state.sed?.contributions || [];
  const sedRows: any[][] = [
    ['SOCIO-ECONOMIC DEVELOPMENT — ELEMENT 6 (Max 5 Points)'],
    [''],
    ['TARGETS'],
    ['Metric', 'Value (ZAR)', 'Formula'],
    ['Net Profit After Tax (NPAT)', state.client.npat, ''],
    ['SED Target (1% of NPAT)', Math.abs(state.client.npat) * 0.01, '1% × |NPAT|'],
    [''],
    ['CONTRIBUTION REGISTER'],
    ['#', 'Beneficiary', 'Category', 'Type', 'Amount (ZAR)'],
  ];

  let sedTotalAmt = 0;
  sedContributions.forEach((c: any, idx: number) => {
    sedTotalAmt += c.amount;
    sedRows.push([
      idx + 1,
      c.beneficiary,
      (c.category || '').replace(/_/g, ' '),
      (c.type || '').replace(/_/g, ' '),
      c.amount,
    ]);
  });

  sedRows.push(
    [''],
    ['TOTALS'],
    ['Total SED Contributions', '', '', '', sedTotalAmt],
    ['SED Target', '', '', '', Math.abs(state.client.npat) * 0.01],
    ['Achievement', '', '', '', pct(sedTotalAmt, Math.abs(state.client.npat) * 0.01)],
    [''],
    ['SCORING DETAIL'],
    ['Indicator', 'Target (ZAR)', 'Actual Spend (ZAR)', 'Achievement %', 'Max Points', 'Score', 'Calculation'],
    ['SED Contributions (1% of NPAT)', Math.abs(state.client.npat) * 0.01, sedTotalAmt, pct(sedTotalAmt, Math.abs(state.client.npat) * 0.01), 5, fmt(sedCalc.total), `(${pct(sedTotalAmt, Math.abs(state.client.npat) * 0.01)} / 100%) × 5`],
    [''],
    ['TOTAL SED SCORE', '', '', '', 5, fmt(sedCalc.total), 'Capped at 5 pts'],
  );

  const wsSed = XLSX.utils.aoa_to_sheet(sedRows);
  wsSed['!cols'] = [{ wch: 5 }, { wch: 45 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 15 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsSed, "SED");

  const auditRows: any[][] = [
    ['AUDIT TRAIL & VERIFICATION NOTES'],
    [''],
    ['REPORT GENERATION'],
    ['Event', 'Detail', 'Timestamp'],
    ['Report Generated', `By ${options.analystName || 'System'}`, today.toISOString()],
    ['Platform', 'Okiru.Pro B-BBEE Compliance Intelligence Platform', ''],
    ['Applicable Codes', 'Amended Codes of Good Practice (2013)', ''],
    ['B-BBEE Act', 'Act No. 53 of 2003, Amendment Act No. 46 of 2013', ''],
    ['Data Source', 'Imported Excel file / Manual data entry', ''],
    [''],
    ['SCORECARD RESULT'],
    ['Total Points', `${fmt(state.scorecard.total.score)} / 120`, ''],
    ['Achieved Level', state.scorecard.achievedLevel >= 9 ? 'Non-Compliant' : `Level ${state.scorecard.achievedLevel}`, ''],
    ['Final Level', currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`, ''],
    ['Recognition Level', state.scorecard.recognitionLevel, ''],
    ['Discounting Applied', state.scorecard.isDiscounted ? 'Yes' : 'No', ''],
    [''],
    ['PILLAR SCORES'],
    ['Element', 'Score', 'Target', 'Sub-min'],
    ['Ownership', fmt(ownCalc.total), 25, ownCalc.total >= 10 || ownCalc.subMinimumMet ? 'Met' : 'FAILED'],
    ['Management Control', fmt(mgtCalc.total), 19, 'N/A'],
    ['Skills Development', fmt(skillCalc.total), 25, skillCalc.subMinimumMet ? 'Met' : 'FAILED'],
    ['Procurement (base)', fmt(procCalc.base), 29, procCalc.subMinimumMet ? 'Met' : 'FAILED'],
    ['Procurement (incl. bonuses)', fmt(procCalc.total), 31, ''],
    ['Supplier Development', fmt(esdCalc.sdTotal), 10, esdCalc.sdSubMinimumMet ? 'Met' : 'FAILED'],
    ['Enterprise Development', fmt(esdCalc.edTotal), 7, esdCalc.edSubMinimumMet ? 'Met' : 'FAILED'],
    ['SED', fmt(sedCalc.total), 5, 'N/A'],
    ['YES Initiative', fmt(state.scorecard.yesInitiative?.score || 0), 5, 'N/A'],
    ['TOTAL', fmt(state.scorecard.total.score), 120, ''],
    [''],
    ['FLAGS & OBSERVATIONS'],
  ];

  if (state.scorecard.isDiscounted) {
    auditRows.push(['FLAG', 'Sub-minimum not met — level discounted by 1', '']);
    if (!(ownCalc.total >= 10 || ownCalc.subMinimumMet)) auditRows.push(['SUB-MIN FAIL', `Ownership: ${fmt(ownCalc.total)} pts < 10 pts threshold`, '']);
    if (!skillCalc.subMinimumMet) auditRows.push(['SUB-MIN FAIL', `Skills Development: ${fmt(skillCalc.total)} pts < 10 pts threshold`, '']);
    if (!procCalc.subMinimumMet) auditRows.push(['SUB-MIN FAIL', `Procurement base: ${fmt(procCalc.base)} pts < 11.6 pts threshold`, '']);
    if (!esdCalc.sdSubMinimumMet) auditRows.push(['SUB-MIN FAIL', `Supplier Development: ${fmt(esdCalc.sdTotal)} pts < 4 pts threshold (40% of 10)`, '']);
    if (!esdCalc.edSubMinimumMet) auditRows.push(['SUB-MIN FAIL', `Enterprise Development: ${fmt(esdCalc.edTotal - esdCalc.graduationBonus - esdCalc.jobsCreatedBonus)} base pts < 2 pts threshold (40% of 5)`, '']);
  } else {
    auditRows.push(['OK', 'All priority element sub-minimums met', '']);
  }

  if (ownCalc.fullOwnershipAwarded) {
    auditRows.push(['NOTE', 'Full Ownership Awarded — BO ≥ 25%, all ownership indicators receive full points', '']);
  }

  if (deemedNpat) {
    auditRows.push(['FLAG', `Deemed NPAT applied: R ${deemedNpat.toLocaleString('en-ZA')} (actual margin below 25% of industry norm)`, '']);
  }

  if (options.includeDraft2026) {
    auditRows.push(['FLAG', 'Draft 2026 B-BBEE Code amendments included in analysis', '']);
  }

  const expiredSuppliers = suppliers.filter((s: any) => s.certificateExpiryDate && new Date(s.certificateExpiryDate) < todayDate);
  if (expiredSuppliers.length > 0) {
    auditRows.push(['WARNING', `${expiredSuppliers.length} supplier(s) have expired B-BBEE certificates`, '']);
    expiredSuppliers.forEach((s: any) => {
      auditRows.push(['', `  ${s.name} — expired ${s.certificateExpiryDate}`, '']);
    });
  }

  if (options.reportNotes) {
    auditRows.push([''], ['ANALYST NOTES'], [options.reportNotes]);
  }

  auditRows.push(
    [''],
    ['DISCLAIMER'],
    ['This report is generated by Okiru.Pro and does not constitute a formal verification certificate.'],
    ['For formal verification, engage a SANAS-accredited B-BBEE verification agency.'],
    ['Calculations are based on the Generic Scorecard — sector-specific codes may produce different results.'],
  );

  const wsAudit = XLSX.utils.aoa_to_sheet(auditRows);
  wsAudit['!cols'] = [{ wch: 20 }, { wch: 70 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsAudit, "Audit Trail");

  const gapRows: any[][] = [
    ['GAPS ANALYSIS & RECOMMENDATIONS'],
    [''],
    ['Pillar', 'Current Score', 'Target', 'Gap (pts)', 'Gap %', 'Achievement %', 'Priority', 'Recommendation'],
  ];

  const pillars = [
    { name: 'Ownership', score: ownCalc.total, target: 25 },
    { name: 'Management Control', score: mgtCalc.total, target: 19 },
    { name: 'Skills Development', score: skillCalc.total, target: 25 },
    { name: 'Procurement (base)', score: procCalc.base, target: 29 },
    { name: 'Supplier Development', score: esdCalc.sdTotal, target: 10 },
    { name: 'Enterprise Development', score: esdCalc.edTotal, target: 7 },
    { name: 'Socio-Economic Dev', score: sedCalc.total, target: 5 },
  ];

  pillars.forEach(p => {
    const gap = Math.max(0, p.target - p.score);
    const gapPctVal = p.target > 0 ? ((gap / p.target) * 100).toFixed(1) : '0.0';
    const achievePct = p.target > 0 ? ((p.score / p.target) * 100).toFixed(1) : '0.0';
    let recommendation = '';
    let priority = 'Low';

    if (gap <= 0) {
      recommendation = 'Target achieved — maintain current performance and ensure data is audit-ready';
    } else if (p.name === 'Ownership') {
      priority = gap > 10 ? 'Critical' : gap > 5 ? 'High' : 'Medium';
      recommendation = 'Increase black shareholding via share schemes, broad-based trusts, or new equity partners. Consider new entrant structures for bonus points.';
    } else if (p.name === 'Management Control') {
      priority = gap > 10 ? 'High' : gap > 5 ? 'Medium' : 'Low';
      recommendation = 'Appoint black individuals at Executive Director and Other Executive Management levels. Target Senior Management pipeline with succession planning.';
    } else if (p.name === 'Skills Development') {
      priority = gap > 10 ? 'Critical' : gap > 5 ? 'High' : 'Medium';
      recommendation = 'Increase accredited training spend to 3.5% of leviable amount. Prioritise bursaries for black students (2.5% target). Ensure all spend is properly documented with certificates.';
    } else if (p.name.includes('Procurement')) {
      priority = gap > 10 ? 'Critical' : gap > 5 ? 'High' : 'Medium';
      recommendation = 'Source from Level 1-2 B-BBEE suppliers for maximum recognition uplift. Target 51%+ black-owned vendors for Designated Group bonus. Review expired certificates.';
    } else if (p.name.includes('Enterprise')) {
      priority = gap > 5 ? 'High' : gap > 2 ? 'Medium' : 'Low';
      recommendation = 'Increase SD contributions (2% NPAT) and ED contributions (1% NPAT). Consider interest-free loans, mentorship, and direct investment in qualifying EMEs/QSEs.';
    } else if (p.name.includes('Socio')) {
      priority = gap > 2 ? 'Medium' : 'Low';
      recommendation = 'Direct SED contributions to education, healthcare, or infrastructure projects benefiting black communities. Document beneficiary impact.';
    }

    gapRows.push([p.name, fmt(p.score), p.target, fmt(gap), `${gapPctVal}%`, `${achievePct}%`, priority, recommendation]);
  });

  gapRows.push(
    [''],
    ['QUICK WINS (Smallest gaps first)'],
  );

  const sortedByGap = [...pillars].sort((a, b) => {
    const gapA = Math.max(0, a.target - a.score);
    const gapB = Math.max(0, b.target - b.score);
    return gapA - gapB;
  }).filter(p => p.target - p.score > 0);

  sortedByGap.forEach((p, i) => {
    const gap = Math.max(0, p.target - p.score);
    gapRows.push([`${i + 1}. ${p.name}`, '', '', fmt(gap), '', '', '', `Close ${fmt(gap)} pt gap to reach full ${p.target} pts`]);
  });

  if (options.includeDraft2026) {
    gapRows.push([''], ['DRAFT 2026 CONSIDERATIONS']);
    gapRows.push(['Draft 2026 amendments may introduce: Transformation Fund contributions, revised Skills targets, enhanced YES weighting, updated EAP demographics.']);
    gapRows.push(['These draft provisions are subject to change and should not be relied upon until formally gazetted.']);
  }

  const wsGaps = XLSX.utils.aoa_to_sheet(gapRows);
  wsGaps['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGaps, "Gaps & Recommendations");

  const entityName = state.client.name.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = today.toISOString().split('T')[0];
  const fileName = `Auditor_Pack_${entityName}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
};

export const exportToExcel = exportAuditorExcel;
