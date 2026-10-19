/**
 * Toolkit parity, ICT Generic: turn a case written in the Empower ICT Generic
 * toolkit's own vocabulary (sheet cells + table rows, see
 * docs/toolkits/parity/gen_case_ict_generic.py) into the inputs our live
 * scorecard takes. The SAME case is filled into the real workbook and
 * recalculated by Excel (docs/toolkits/parity/toolkit_oracle.py), so any
 * difference in a scorecard line is a difference in the arithmetic, or a field
 * this adapter cannot express in our model — reported, never papered over.
 *
 * Where the ICT template's input sheets differ from RCOGP Generic's:
 *  - Skills Data: "Employed?" (Yes / No) instead of an employment status, no
 *    bursary or Y.E.S. columns, and 'Skills Toolkit'!D9 — whether disabled
 *    spend is measured against the EAP split;
 *  - Procurement Data: "First-time supplier?", no flow-through ownership and
 *    no first-procurement date or size;
 *  - ESD Data: jobs created and the beneficiary's workforce per row, an
 *    "ICT Company?" answer, no first-assistance facts;
 *  - SED Data: "ICT Specific Initiative?";
 *  - no "combine other executive and senior management" choice.
 */
import type {
  Client, OwnershipData, ManagementData, SkillsData, ProcurementData, ESDData, SEDData,
  AfsData, EmpowermentFinancingData, Employee, TrainingProgram, Supplier, Contribution, Shareholder,
} from '../../lib/types';
import { resolveNpatForTargets } from '@/lib/npatDeemedCalculation';
import type { AdaptedCase, ToolkitCase } from './caseAdapter';

export type { ToolkitCase, AdaptedCase } from './caseAdapter';

const cell = (c: ToolkitCase, ref: string) => c.cells[ref];
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const yes = (v: unknown): boolean => String(v ?? '').trim().toLowerCase() === 'yes';
const rows = (c: ToolkitCase, t: string) => c.tables[t] ?? [];
const optStr = (v: unknown) => (v == null || v === '' ? undefined : String(v));
const optNum = (v: unknown) => (v == null || v === '' ? undefined : num(v));

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

export function adaptIctGenericCase(c: ToolkitCase): AdaptedCase {
  const unrepresented: string[] = [];
  const C = (ref: string) => cell(c, `Client Information!${ref}`);

  let leviable = 0;
  for (let i = 4; i <= 15; i++) leviable += num(C(`G${i}`)) * 100;

  const history = [4, 5, 6].map((r, i) => ({
    id: `fy${i}`,
    year: String(2025 - i),
    revenue: num(cell(c, `Financials!E${r}`)),
    npat: num(cell(c, `Financials!C${r}`)),
  }));

  const npatResolved = resolveNpatForTargets({
    currentRevenue: num(C('C18')),
    currentNpat: num(C('C19')),
    industryNormPercent: num(C('C10')) * 100,
    priorYears: history.filter((h) => h.revenue !== 0 || h.npat !== 0)
      .map((h) => ({ yearLabel: h.year, revenue: h.revenue, npat: h.npat })),
    deemedNpatOverride: C('C24'),
  });

  const client: Client = {
    id: 'parity',
    name: String(C('C3') ?? 'Parity case'),
    registrationNumber: '',
    physicalAddress: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    sectorCode: 'ICT',
    industry: '',
    financialYear: '2026',
    measurementPeriodStart: String(C('C4') ?? ''),
    measurementPeriodEnd: String(C('D4') ?? ''),
    revenue: num(C('C18')),
    npat: npatResolved.effectiveNpat,
    leviableAmount: leviable,
    companySize: 'Generic',
    scorecardType: 'Generic',
    annualTurnover: num(C('C18')),
    numberOfEmployees: rows(c, 'tblMCData').length,
    eapProvince: String(C('C8') ?? 'National') as Client['eapProvince'],
    eapYear: num(C('C7')) || undefined,
    industryNorm: num(C('C10')) || undefined,
    financialHistory: history,
  };

  // Ownership (identical input sheet to RCOGP Generic)
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

  // Management control — no combine option in this template.
  const employees: Employee[] = rows(c, 'tblMCData').map((r, i) => {
    const vr = r['Voting Rights (Directors only) *'];
    return {
      id: `e${i + 1}`,
      name: String(r['Full Name *'] ?? `Employee ${i + 1}`),
      gender: String(r['Gender *']) as Employee['gender'],
      race: String(r['Race *']) as Employee['race'],
      designation: DESIGNATION[String(r['Designation *'])] ?? (String(r['Designation *']) as Employee['designation']),
      isDisabled: yes(r['Disabled *']),
      isForeign: yes(r['Foreign *']),
      ...(vr != null && vr !== '' ? { votingRightsPercent: num(vr) * 100 } : {}),
    };
  });
  const management: ManagementData = { id: 'mc', clientId: 'parity', employees, combineExcoSenior: false };

  // Skills
  const trainingPrograms: TrainingProgram[] = rows(c, 'tblSkillsData').map((r, i) => {
    const course = num(r['Course Cost']);
    const travel = num(r['Travel Cost']);
    const accom = num(r['Accommodation Cost']);
    const catering = num(r['Catering Cost']);
    const stationery = num(r['Stationery Cost']);
    const facility = num(r['Training Facility Cost']);
    const salary = num(r['Salary Cost (stipend and category B,C,D only)']);
    const other = num(r['Other Costs']);
    const employed = String(r['Employed?'] ?? '').trim();
    if (employed !== 'Yes' && employed !== 'No') unrepresented.push(`Skills row ${i + 1}: "Employed?" is "${employed}"`);
    return {
      id: `t${i + 1}`,
      programName: String(r['Training Program Name *'] ?? ''),
      categoryCode: String(r['Category *']) as TrainingProgram['categoryCode'],
      learnerName: String(r['Learner Name *'] ?? ''),
      gender: String(r['Gender *']) as TrainingProgram['gender'],
      race: String(r['Race *']) as TrainingProgram['race'],
      isDisabled: yes(r['Disabled?*']),
      isForeign: yes(r['Foreign?*']),
      // Toolkit "Employed?" Yes / No.
      employmentStatus: employed === 'No' ? 'Unemployed' : 'Permanent',
      isYesEmployee: false,
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
    yesCandidatesCount: 0,
    yesAbsorbedCount: 0,
    // Toolkit headcount ('Client Information'!D14): every MC row in the period
    // except non-executive directors.
    headcount: employees.filter((e) => e.designation !== 'Board').length,
    trainingManagerSalary: num(cell(c, 'Skills Toolkit!D6')),
    trainingOverheadCost: num(cell(c, 'Skills Toolkit!D7')),
    disabledSpendUsesEap: yes(cell(c, 'Skills Toolkit!D9')),
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
  const bufferCell = cell(c, 'Procurement Scorecard!D4');
  const procurement: ProcurementData = {
    id: 'pp',
    clientId: 'parity',
    tmps,
    tmpsManualOverride: true,
    tmpsSource: 'manual',
    ...(bufferCell != null && bufferCell !== '' ? { tmpsBuffer: num(bufferCell) } : {}),
    measurementPeriodEnd: String(C('D4') ?? '') || undefined,
    suppliers,
  };

  // Enterprise and supplier development
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
  // Jobs created, per beneficiary: up to 10% of its workforce earns the lower
  // tier, 11% or more the upper one ('ESD Data' computed columns).
  const jobRatios = esdRows.map((r) => {
    const workforce = num(r['Total Workforce']);
    return workforce > 0 ? num(r['Number of jobs Created']) / workforce : 0;
  }).filter((x) => x > 0);
  const esd: ESDData = {
    id: 'esd',
    clientId: 'parity',
    contributions,
    graduationBonus: esdRows.some((r) => yes(r['Graduated to Supplier Development?'])),
    jobsCreatedBonus: jobRatios.length > 0,
    ...(jobRatios.length > 0 ? { jobsCreatedPercent: Math.max(...jobRatios) } : {}),
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
      isSectorSpecificInitiative: yes(r['ICT Specific Initiative?']),
    })),
  };

  return {
    state: {
      client,
      ownership,
      management,
      skills,
      procurement,
      esd,
      sed,
      afs: { id: 'afs', clientId: 'parity' } as AfsData,
      empowermentFinancing: { id: 'ef', clientId: 'parity' } as EmpowermentFinancingData,
    },
    unrepresented,
  };
}
