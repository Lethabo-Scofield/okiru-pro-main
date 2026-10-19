/**
 * Toolkit parity, RCOGP QSE: turn a case written in the Empower RCOGP QSE
 * toolkit's own vocabulary (docs/toolkits/parity/gen_case_rcogp_qse.py) into
 * the inputs our live scorecard takes. The SAME case is filled into the real
 * QSE workbook and recalculated by Excel, so a difference in a scorecard line
 * is a difference in the arithmetic, or an input this adapter cannot express
 * in our model — and the second kind is reported, never papered over.
 *
 * Where the QSE template keeps its inputs (it differs from the Generic one):
 *   Client Information C3 name, C4/D4 the financial year, C8 industry norm,
 *   C14 total payroll, C16 revenue, C17 NPAT, C22 deemed NPAT (manual),
 *   G4:G15 monthly SDL; Financials rows 4-7 the prior years (NPAT C, revenue E);
 *   Skills Toolkit D6/D7 training-manager salary and training overheads;
 *   Procurement Scorecard D4 the TMPS buffer.
 */
import type {
  Client, OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData,
  AfsData, EmpowermentFinancingData, Employee, TrainingProgram, Supplier, Contribution, Shareholder,
} from '../../lib/types';
import { resolveNpatForTargets } from '@/lib/npatDeemedCalculation';
import type { AdaptedCase, ToolkitCase } from './caseAdapter';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const yes = (v: unknown): boolean => String(v ?? '').trim().toLowerCase() === 'yes';
const blank = (v: unknown): boolean => v === undefined || v === null || v === '';
const rows = (c: ToolkitCase, t: string) => c.tables[t] ?? [];
const optStr = (v: unknown) => (blank(v) ? undefined : String(v));
const optNum = (v: unknown) => (blank(v) ? undefined : num(v));

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

/** Toolkit contribution-type label → the benefit-factor key our ESD/SED tables use. */
function contributionKey(label: string): string {
  const l = label.toLowerCase();
  if (l.startsWith('grant')) return 'grant';
  if (l.startsWith('direct cost')) return 'direct_cost';
  if (l.startsWith('discounts')) return 'discounts';
  if (l.startsWith('overhead')) return 'overhead_costs';
  if (l.startsWith('interest free') || l.startsWith('interest-free')) return 'interest_free_loan';
  if (l.startsWith('standard loa')) return 'standard_loan';
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

export function adaptRcogpQseToolkitCase(c: ToolkitCase): AdaptedCase {
  const unrepresented: string[] = [];
  const C = (ref: string) => c.cells[`Client Information!${ref}`];

  // Financials!I3: the larger of the SDL-derived leviable amount and the total payroll.
  let sdlLeviable = 0;
  for (let i = 4; i <= 15; i++) sdlLeviable += num(C(`G${i}`)) * 100;
  const leviable = Math.max(sdlLeviable, num(C('C14')));

  // Financials rows 4-7: up to four prior years; a blank row is no year at all
  // (its AVERAGE ignores blanks).
  const history = [4, 5, 6, 7]
    .filter((r) => !blank(c.cells[`Financials!C${r}`]) || !blank(c.cells[`Financials!E${r}`]))
    .map((r, i) => ({
      id: `fy${i}`,
      year: String(2025 - i),
      revenue: num(c.cells[`Financials!E${r}`]),
      npat: num(c.cells[`Financials!C${r}`]),
    }));

  // client.npat is the NPAT the targets are set on: the app resolves the
  // deemed NPAT when the workbook is submitted, so the adapter does the same.
  const npatResolved = resolveNpatForTargets({
    currentRevenue: num(C('C16')),
    currentNpat: num(C('C17')),
    industryNormPercent: num(C('C8')) * 100,
    priorYears: history.map((h) => ({ yearLabel: h.year, revenue: h.revenue, npat: h.npat })),
    deemedNpatOverride: C('C22'),
  });

  const priorLevel = c.cells['YES!C17'];
  const client: Client = {
    id: 'parity',
    name: String(C('C3') ?? 'Parity case'),
    registrationNumber: '',
    physicalAddress: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    sectorCode: 'RCOGP',
    industry: '',
    financialYear: '2026',
    measurementPeriodStart: String(C('C4') ?? ''),
    measurementPeriodEnd: String(C('D4') ?? ''),
    revenue: num(C('C16')),
    npat: npatResolved.effectiveNpat,
    leviableAmount: leviable,
    companySize: 'QSE',
    scorecardType: 'QSE',
    annualTurnover: num(C('C16')),
    numberOfEmployees: rows(c, 'tblMCData').length,
    eapProvince: 'National' as Client['eapProvince'],
    industryNorm: num(C('C8')) || undefined,
    financialHistory: history,
    ...(typeof priorLevel === 'number' ? { beeCertificateLevel: priorLevel as Client['beeCertificateLevel'] } : {}),
  };

  // Ownership — the same register as the Generic template.
  const valuation = rows(c, 'tblCompanyValuation')[0] ?? {};
  const shareholders: Shareholder[] = rows(c, 'tblOwnershipData').map((r, i) => {
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
  };

  // Management control — the QSE toolkit reads the gender as entered (MC Toolkit).
  const employees: Employee[] = rows(c, 'tblMCData').map((r, i) => ({
    id: `e${i + 1}`,
    name: String(r['Full Name *'] ?? `Employee ${i + 1}`),
    gender: String(r['Gender *']) as Employee['gender'],
    race: String(r['Race *']) as Employee['race'],
    designation: DESIGNATION[String(r['Designation *'])] ?? (String(r['Designation *']) as Employee['designation']),
    isDisabled: yes(r['Disabled *']),
    isForeign: yes(r['Foreign *']),
  }));
  const management: ManagementData = { id: 'mc', clientId: 'parity', employees, combineExcoSenior: false };

  // Skills — "Employed?" (Yes/No) is the QSE template's employment column.
  const trainingPrograms: TrainingProgram[] = rows(c, 'tblSkillsData').map((r, i) => {
    const cost = (k: string) => num(r[k]);
    const parts = ['Course Cost', 'Travel Cost', 'Accommodation Cost', 'Catering Cost', 'Stationery Cost',
      'Training Facility Cost', 'Salary Cost (stipend and category B,C,D only)', 'Other Costs'];
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
      isYesEmployee: false,
      isCompleted: yes(r['Completed?']),
      isAbsorbed: yes(r['Absorbed?']),
      transactionDate: String(r['Data Date'] ?? ''),
      startDate: optStr(r['Start Date (format: dd/mm/yyyy)']),
      endDate: optStr(r['End Date (format: dd/mm/yyyy)']),
      courseCost: cost('Course Cost'),
      travelCost: cost('Travel Cost'),
      accommodationCost: cost('Accommodation Cost'),
      cateringCost: cost('Catering Cost'),
      stationeryCost: cost('Stationery Cost'),
      facilityCost: cost('Training Facility Cost'),
      salaryCost: cost('Salary Cost (stipend and category B,C,D only)'),
      otherCosts: cost('Other Costs'),
      totalCost: parts.reduce((a, k) => a + cost(k), 0),
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
    yesCandidatesCount: 0,
    yesAbsorbedCount: 0,
    // Every MC row except non-executive directors ('Employee Demographics').
    headcount: employees.filter((e) => e.designation !== 'Board').length,
    trainingManagerSalary: num(c.cells['Skills Toolkit!D6']),
    trainingOverheadCost: num(c.cells['Skills Toolkit!D7']),
  };

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
      spend: num(r['Spend *']),
    };
  });
  const bufferCell = c.cells['Procurement Scorecard!D4'];
  const procurement: ProcurementData = {
    id: 'pp',
    clientId: 'parity',
    tmps,
    tmpsManualOverride: true,
    tmpsSource: 'manual',
    ...(!blank(bufferCell) ? { tmpsBuffer: num(bufferCell) } : {}),
    measurementPeriodEnd: String(C('D4') ?? '') || undefined,
    suppliers,
  };

  // Enterprise and supplier development — no first-assistance columns in this template.
  const esdRows = rows(c, 'tblESDData');
  const contributions: Contribution[] = esdRows.map((r, i) => ({
    id: `c${i + 1}`,
    beneficiary: String(r['Beneficiary Name'] ?? ''),
    description: String(r['Contribution Description*'] ?? ''),
    type: contributionKey(String(r['Contribution Type'] ?? '')) as Contribution['type'],
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
  }));
  const esd: ESDData = {
    id: 'esd',
    clientId: 'parity',
    contributions,
    // 'ESD Scorecard'!J9 counts Enterprise Development rows only; J10 any row.
    graduationBonus: esdRows.some((r) => String(r['Pillar']) === 'Enterprise Development' && yes(r['Graduated to Supplier Development?'])),
    jobsCreatedBonus: esdRows.some((r) => yes(r['At least 1 job created?'])),
    measurementPeriodEnd: String(C('D4') ?? '') || undefined,
  };

  // Socio-economic development
  const sed: SEDData = {
    id: 'sed',
    clientId: 'parity',
    contributions: rows(c, 'tblSED').map((r, i) => ({
      id: `sed${i + 1}`,
      beneficiary: String(r['Beneficiary Name *'] ?? ''),
      description: String(r['Description of Spend *'] ?? ''),
      type: contributionKey(String(r['Contribution Type *'] ?? '')) as Contribution['type'],
      amount: num(r['Amount']),
      category: 'socio_economic',
      blackBenefitPercent: num(r['% of Spend Benefiting Black Individuals *']) * 100,
      transactionDate: optStr(r['Date of Transaction * (format: dd/mm/yyyy)']),
    })),
  };

  // The YES sheet's reward is a planning projection off a chosen tier; our
  // YES result is built from YES youth on the training register, which this
  // template does not carry.
  if (!blank(c.cells['YES!C22'])) unrepresented.push('YES tier chosen on the YES sheet (not a scored line)');

  return {
    state: {
      client, ownership, management, skills, procurement, esd, sed,
      afs: { id: 'afs', clientId: 'parity' } as AfsData,
      empowermentFinancing: { id: 'ef', clientId: 'parity' } as EmpowermentFinancingData,
    },
    unrepresented,
  };
}
