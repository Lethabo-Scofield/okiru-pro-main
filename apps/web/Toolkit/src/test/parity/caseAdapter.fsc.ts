/**
 * Toolkit parity, FSC: turn a case written in the FSC Empower toolkit's own
 * vocabulary (docs/toolkits/parity/gen_case_fsc.py) into the inputs our live
 * scorecard takes. The SAME case is filled into the real workbook and
 * recalculated by Excel (docs/toolkits/parity/toolkit_oracle.py), so a
 * difference on a scorecard line is a difference in the arithmetic, or an
 * input this adapter cannot express in our model — and the second kind is
 * reported in `unrepresented`, never papered over.
 *
 * The FSC template's inputs differ from RCOGP Generic's: Client Information
 * keeps its inputs in column D (SDL months in H4:H15, payroll per
 * management level in H20:I23), every training row carries a Management
 * Position, suppliers are flagged stock broker / fund manager / intermediary,
 * and SED and Consumer Education share one table split by a Pillar column.
 */
import type {
  Client, OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData,
  AfsData, EmpowermentFinancingData, Employee, TrainingProgram, Supplier, Contribution, Shareholder,
} from '../../lib/types';
import { resolveNpatForTargets } from '@/lib/npatDeemedCalculation';
import { normalizeFscSubSector } from '../../lib/sectors/fsc-utils';
import type { ToolkitCase, AdaptedCase } from './caseAdapter';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const yes = (v: unknown): boolean => String(v ?? '').trim().toLowerCase() === 'yes';
const rows = (c: ToolkitCase, t: string) => c.tables[t] ?? [];
const optStr = (v: unknown) => (v == null || v === '' ? undefined : String(v));

const DESIGNATION: Record<string, Employee['designation']> = {
  'Non-executive Director': 'Board',
  'Executive Director': 'Executive Director',
  'Other Executive Manager': 'Other Executive Management',
  'Senior Manager': 'Senior',
  'Middle Manager': 'Middle',
  'Junior Manager': 'Junior',
  'Semi-skilled': 'Semi-skilled',
  'Unskilled': 'Unskilled',
};

const SIZE: Record<string, Supplier['enterpriseType']> = { Generic: 'generic', QSE: 'qse', EME: 'eme' };

/** FSC toolkit contribution-type label → the benefit-factor key our ESD/SED tables use. */
export function fscContributionKey(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith('grant')) return 'grant';
  if (l.startsWith('direct cost')) return 'direct_cost';
  if (l.startsWith('discounts')) return 'discounts';
  if (l.startsWith('overhead')) return 'overhead_costs';
  if (l.startsWith('interest free') || l.startsWith('interest-free')) return 'interest_free_loan';
  // The FSC template calls the standard loan a "Prime Loan" (50%).
  if (l.startsWith('prime loan') || l.startsWith('standard loa')) return 'standard_loan';
  if (l.startsWith('guarantees')) return 'guarantees';
  if (l.startsWith('lower insterest') || l.startsWith('lower interest')) return 'lower_interest_loan';
  if (l.startsWith('minority investment')) return 'minority_investment';
  if (l.startsWith('professional services rendered at no cost')) return 'professional_services_free';
  if (l.startsWith('professional services rendered at discount')) return 'professional_services_discount';
  if (l.startsWith('time of employees')) return 'employee_time';
  if (l.startsWith('shorter payment')) return 'shorter_payment_terms';
  if (l.includes('lower dividend')) return 'lower_dividend_investment';
  return `unmapped:${label}`;
}

const SED_PILLAR: Record<string, Contribution['sedPillar']> = {
  'Socioeconomic Development': 'sed',
  'Consumer Education': 'consumer_education',
  'Fundisa Retail Fund': 'fundisa',
};

export function adaptFscToolkitCase(c: ToolkitCase): AdaptedCase {
  const unrepresented: string[] = [];
  const cell = (ref: string) => c.cells[ref];
  const C = (ref: string) => cell(`Client Information!${ref}`);

  // Leviable amount as the workbook derives it (Financials!I3, the named
  // range LeviableAmount): the larger of the SDL months × 100 and the payroll.
  let sdl = 0;
  for (let i = 4; i <= 15; i++) sdl += num(C(`H${i}`)) * 100;
  const leviable = Math.max(sdl, num(C('D18')));

  const history = [4, 5, 6].map((r, i) => ({
    id: `fy${i}`,
    year: String(2025 - i),
    revenue: num(cell(`Financials!E${r}`)),
    npat: num(cell(`Financials!C${r}`)),
  }));
  const npatResolved = resolveNpatForTargets({
    currentRevenue: num(C('D20')),
    currentNpat: num(C('D21')),
    industryNormPercent: num(C('D12')) * 100,
    priorYears: history.filter((h) => h.revenue !== 0 || h.npat !== 0)
      .map((h) => ({ yearLabel: h.year, revenue: h.revenue, npat: h.npat })),
    deemedNpatOverride: C('D26'),
  });

  const subSector = normalizeFscSubSector(String(C('D7') ?? 'Others'));
  const client: Client = {
    id: 'parity',
    name: String(C('D3') ?? 'Parity case'),
    registrationNumber: '',
    physicalAddress: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    sectorCode: 'FSC',
    industry: '',
    financialYear: '2026',
    measurementPeriodStart: String(C('D4') ?? ''),
    measurementPeriodEnd: String(C('E4') ?? ''),
    revenue: num(C('D20')),
    npat: npatResolved.effectiveNpat,
    leviableAmount: leviable,
    companySize: 'Generic',
    scorecardType: 'Generic',
    annualTurnover: num(C('D20')),
    numberOfEmployees: rows(c, 'tblMCData').length,
    eapProvince: String(C('D10') ?? 'National') as Client['eapProvince'],
    eapYear: num(C('D9')) || undefined,
    industryNorm: num(C('D12')) || undefined,
    financialHistory: history,
    fscSubSector: subSector,
    fscReinsurer: String(C('D8') ?? '') === 'Reinsurers',
  };

  // Ownership
  const ownRows = rows(c, 'tblOwnershipData');
  const valuation = rows(c, 'tblCompanyValuation')[0] ?? {};
  const shareholders: Shareholder[] = ownRows.map((r, i) => {
    const bo = num(r['BO%']);
    const bdg = num(r['BDG%']);
    const bne = num(r['BNE%']);
    return {
      designatedGroupOwnership: bdg,
      blackNewEntrantOwnership: bne,
      id: `sh${i + 1}`,
      name: String(r['Shareholder'] ?? `Holder ${i + 1}`),
      ownershipType: String(r['Ownership Type'] ?? 'shareholder'),
      blackOwnership: bo,
      blackWomenOwnership: num(r['BWO%']),
      votingRightsPercent: bo,
      economicInterestPercent: bo,
      isDesignatedGroup: bdg > 0,
      blackNewEntrant: bne > 0,
      shares: num(r['Number of Share']),
      shareValue: num(r['Share Value']),
      outstandingDebt: num(r['Outstaning Debt']),
      loanDate: optStr(r['Loan Date']),
    };
  });
  const ownership: OwnershipData = {
    id: 'own',
    clientId: 'parity',
    shareholders,
    companyValue: num(valuation['Company Asset Value']),
    outstandingDebt: shareholders.reduce((a, s) => a + (s.outstandingDebt ?? 0), 0),
    yearsHeld: 0,
    ownershipScorePoints: 0,
    ownershipScorePercent: 0,
    netValuePoints: 0,
    netValuePercent: 0,
    // The loan term the net value graduates by runs to the data date.
    valuationDate: optStr(valuation['Date']) ?? optStr(C('E4')),
  };

  // Management control
  const employees: Employee[] = rows(c, 'tblMCData').map((r, i) => ({
    id: `e${i + 1}`,
    name: String(r['Full Name *'] ?? `Employee ${i + 1}`),
    gender: String(r['Gender *']) as Employee['gender'],
    race: String(r['Race *']) as Employee['race'],
    designation: DESIGNATION[String(r['Designation *'])] ?? (String(r['Designation *']) as Employee['designation']),
    isDisabled: yes(r['Disabled *']),
    isForeign: yes(r['Foreign *']),
  }));
  const management: ManagementData = {
    id: 'mc',
    clientId: 'parity',
    employees,
    // 'MC Toolkit'!C8 asks whether to DISTINGUISH other executives from senior
    // management; "No" combines the two bands.
    combineExcoSenior: String(cell('MC Toolkit!C8') ?? 'Yes') === 'No',
  };

  // Skills
  const trainingPrograms: TrainingProgram[] = rows(c, 'tblSkillsData').map((r, i) => {
    const course = num(r['Course Cost']);
    const travel = num(r['Travel Cost']);
    const accom = num(r['Accommodation Cost']);
    const catering = num(r['Catering Cost']);
    const stationery = num(r['Stationery Cost']);
    const facility = num(r['Training Facility Cost']);
    const salary = num(r['Salary Cost (category BCD only)']);
    const other = num(r['Other Costs']);
    return {
      id: `t${i + 1}`,
      programName: String(r['Training Program Name *'] ?? ''),
      categoryCode: String(r['Category *']) as TrainingProgram['categoryCode'],
      learnerName: String(r['Learner Name *'] ?? ''),
      gender: String(r['Gender *']) as TrainingProgram['gender'],
      race: String(r['Race *']) as TrainingProgram['race'],
      isDisabled: yes(r['Disabled?*']),
      isForeign: yes(r['Foreign?*']),
      employmentStatus: yes(r['Employed?']) ? 'Permanent' : 'Unemployed',
      managementPosition: optStr(r['Management Position *']),
      isYesEmployee: yes(r['Y.E.S. Employee?']),
      isCompleted: yes(r['Completed?']),
      isAbsorbed: yes(r['Absorbed?']),
      transactionDate: String(r['Data Date'] ?? ''),
      startDate: optStr(r['Start Date (format: dd/mm/yyyy)']),
      endDate: optStr(r['End Date (format: dd/mm/yyyy)']),
      courseCost: course,
      travelCost: travel,
      accommodationCost: accom,
      cateringCost: catering,
      stationeryCost: stationery,
      facilityCost: facility,
      salaryCost: salary,
      otherCosts: other,
      totalCost: course + travel + accom + catering + stationery + facility + salary + other,
      isAbet: yes(r['ABET']),
      isMandatory: yes(r['Mandatory Training?']),
      isBursary: false,
    };
  });
  const skills: SkillsData = {
    id: 'sk',
    clientId: 'parity',
    leviableAmount: leviable,
    trainingPrograms,
    yesCandidatesCount: trainingPrograms.filter((t) => t.isYesEmployee).length,
    yesAbsorbedCount: trainingPrograms.filter((t) => t.isYesEmployee && t.isAbsorbed).length,
    // Headcount as the workbook derives it ('Client Information'!E16, the
    // named range Headcount): every MC row but non-executive directors.
    headcount: employees.filter((e) => e.designation !== 'Board').length,
    trainingManagerSalary: num(cell('Skills Toolkit!D8')),
    trainingOverheadCost: num(cell('Skills Toolkit!D9')),
    // 'Client Information'!I20:I23: current-year payroll per management level.
    payrollByLevel: {
      execSenior: num(C('I20')),
      middle: num(C('I21')),
      junior: num(C('I22')),
      nonManagement: num(C('I23')),
    },
  };
  if (num(cell('Skills Toolkit!D8')) > 0 || num(cell('Skills Toolkit!D9')) > 0) {
    unrepresented.push('Training manager salary / overhead: the toolkit shares them out by typed workforce demographics (Employee Demographics row 5)');
  }

  // Procurement
  const tmps = rows(c, 'tblInclusions').reduce((a, r) => a + num(r['Amount']), 0)
    - rows(c, 'tblExclusions').reduce((a, r) => a + num(r['Amount']), 0);
  const suppliers: Supplier[] = rows(c, 'tblPPData').map((r, i) => {
    const lvlRaw = r['B-BBEE Level'];
    const lvl = typeof lvlRaw === 'number' ? lvlRaw : /non/i.test(String(lvlRaw)) ? 0 : num(lvlRaw);
    return {
      id: `s${i + 1}`,
      name: String(r['Supplier Name *'] ?? ''),
      beeLevel: lvl as Supplier['beeLevel'],
      blackOwnership: num(r['Current Black ownership']),
      blackWomenOwnership: num(r['Current Black Female ownership']),
      youthOwnership: 0,
      disabledOwnership: 0,
      designatedGroupOwnership: num(r['Black Designated Group  ownership']),
      enterpriseType: SIZE[String(r['Current Company Size *'])] ?? 'generic',
      isEmpoweringSupplier: yes(r['Empowering Supplier? (Yes/No)']),
      isSupplierDevRecipient: yes(r['Supplier development recipient? (Yes/No)']),
      hasThreeYearContract: yes(r['3 year contract in place? (Yes/No)3']),
      isFirstTimeSupplier: yes(r['First-time supplier? (Yes/No)']),
      isStockBroker: yes(r['Stock broker? (Yes/No)']),
      isFundManager: yes(r['Fund manager? (Yes/No)']),
      isIntermediary: yes(r['Intermediary? (Yes/No)']),
      spend: num(r['Spend *']),
    };
  });
  const bufferCell = cell('Procurement Scorecard!F7');
  const tradeValue = cell('Procurement Scorecard!E5');
  const procurement: ProcurementData = {
    id: 'pp',
    clientId: 'parity',
    tmps,
    tmpsManualOverride: true,
    tmpsSource: 'manual',
    ...(bufferCell != null && bufferCell !== '' ? { tmpsBuffer: num(bufferCell) } : {}),
    ...(tradeValue != null && tradeValue !== '' ? { allocatedTradeValue: num(tradeValue) } : {}),
    measurementPeriodEnd: String(C('E4') ?? '') || undefined,
    suppliers,
  };

  // Enterprise and supplier development
  const esdRows = rows(c, 'tblESDData');
  const optNum = (v: unknown) => (v == null || v === '' ? undefined : num(v));
  const contributions: Contribution[] = esdRows.map((r, i) => ({
    id: `c${i + 1}`,
    beneficiary: String(r['Beneficiary Name'] ?? ''),
    description: String(r['Contribution Description*'] ?? ''),
    type: fscContributionKey(String(r['Contribution Type'] ?? '')) as Contribution['type'],
    amount: num(r['Amount']),
    category: String(r['Pillar']) === 'Supplier Development' ? 'supplier_development' : 'enterprise_development',
    blackBenefitPercent: num(r['Current Black ownership %']) * 100,
    transactionDate: optStr(r['Date of Transaction * (format: dd/mm/yyyy)']),
    beneficiaryCurrentSize: SIZE[String(r['Current Size'])],
    beneficiaryBlackOwnership: optNum(r['Current Black ownership %']),
    primeRate: optNum(r['Prime Rate']),
    actualInterestRate: optNum(r['Actual Interest Rate']),
    invoiceDate: optStr(r['Invoice date (format: dd/mm/yyyy)']),
    paymentDate: optStr(r['Payment date (format: dd/mm/yyyy)']),
    supportsBlackFinancialIntermediary: yes(r['Stock brokers, Fund managers or Intermediaries? (Yes/No)']),
  }));
  const esd: ESDData = {
    id: 'esd',
    clientId: 'parity',
    contributions,
    graduationBonus: esdRows.some((r) => yes(r['Graduated to Supplier Development?'])),
    jobsCreatedBonus: esdRows.some((r) => yes(r['At least 1 job created?'])),
    measurementPeriodEnd: String(C('E4') ?? '') || undefined,
  };

  // Socio-economic development and consumer education (one table, by Pillar)
  const sed: SEDData = {
    id: 'sed',
    clientId: 'parity',
    contributions: rows(c, 'tblSEDnCEData').map((r, i) => ({
      id: `sed${i + 1}`,
      beneficiary: String(r['Beneficiary Name *'] ?? ''),
      description: String(r['Description of Spend *'] ?? ''),
      type: fscContributionKey(String(r['Contribution Type *'] ?? '')) as Contribution['type'],
      amount: num(r['Amount']),
      category: 'socio_economic',
      sedPillar: SED_PILLAR[String(r['Pillar'] ?? '')] ?? 'sed',
      blackBenefitPercent: num(r['% of Spend Benefiting Black Individuals *']) * 100,
      transactionDate: optStr(r['Date of Transaction * (format: dd/mm/yyyy)']),
    })),
  };

  // Empowerment financing (banks / long-term insurers)
  const efSheet = subSector === 'Banks' ? 'EF & ESD Scorecard - Banks' : 'EF & ESD Scorecard - Long Term';
  const E = (ref: string) => optNum(cell(`${efSheet}!${ref}`));
  const tfTransactions = rows(c, 'tblTransactionFinancingData').map((r) => ({ value: num(r['Value']) }));
  const empowermentFinancing: EmpowermentFinancingData = subSector === 'Banks'
    ? { id: 'ef', clientId: 'parity', balanceSheetExposure: E('C5'), additionalTiExposure: E('C6'), newLoansExposure: E('C7'), tfPortfolioValue: E('C9'), tfTransactions }
    : subSector === 'LTI'
      ? { id: 'ef', clientId: 'parity', qualifyingExposure: E('C5'), targetedInvestmentPortion: E('C6'), tfPortfolioValue: E('C8'), tfTransactions }
      : { id: 'ef', clientId: 'parity' };

  // Access to financial services (banks): coverage shares and a point of
  // presence. Electronic access and active accounts are entered as a share
  // and a count the toolkit has no target for; nothing here can judge them.
  const A = (ref: string) => cell(`AFS Scorecard - Banks!${ref}`);
  const L = (ref: string) => cell(`AFS Scorecard - Long Term!${ref}`);
  const afs: AfsData = subSector === 'Banks'
    ? {
        id: 'afs', clientId: 'parity',
        transactionPointCoverage: num(A('K8')) * 100,
        servicePointCoverage: num(A('K9')) * 100,
        salesPointCoverage: num(A('K10')) * 100,
        hasPointOfPresence: yes(A('K12')),
      }
    : subSector === 'LTI'
      ? {
          id: 'afs', clientId: 'parity',
          appropriateProductsDenominator: num(L('E9')),
          appropriateProductsNumerator: num(L('E10')),
          saiaCommunicatedPolicies: num(L('E12')),
          marketPenetrationPolicies: num(L('E13')),
          creditLifePolicies: num(L('E14')),
          transactionalAccessCoverage: num(L('E16')) * 100,
        }
      : { id: 'afs', clientId: 'parity' };
  if (subSector === 'Banks' && (A('K11') != null || A('K13') != null)) {
    unrepresented.push('AFS electronic access (a share) and active accounts (a count): the toolkit gives no target for either');
  }

  return {
    state: {
      client,
      ownership,
      management,
      skills,
      procurement,
      esd,
      sed,
      afs,
      empowermentFinancing,
    },
    unrepresented,
  };
}
