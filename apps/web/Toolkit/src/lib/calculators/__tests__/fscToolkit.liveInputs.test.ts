/**
 * FSC on the toolkit method, for a record as the live app holds it today.
 *
 * The FSC toolkit method reads inputs no screen or import fills yet
 * (docs/toolkits/parity/findings/fsc.md, "Inputs the live app does not capture
 * yet"): each management level's payroll and each trainee's management
 * position, the allocated trade value and the supplier flags, the ED
 * stock-broker flag, the SED & CE Pillar column, loan dates, long-term
 * insurers' credit-life policies and short-term insurers' qualifying policies.
 * The parity cases carry all of them, so the parity gate alone cannot see what
 * an incomplete record scores. Here every Excel-scored case is scored again
 * with those fields removed, holding instead what the live app does capture
 * (consumer education and Fundisa as the SED page's aggregate figures, the
 * build form's stock-broker spend), and checked against:
 *  - the same case with every input (what does not depend on a missing input
 *    must not move), and
 *  - the scorer FSC used before the toolkit method (config without
 *    `fscToolkit`): skills falls back to it, and no priority element may fail
 *    only because an input is missing.
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { calculateScorecard } from '../../store';
import { adaptFscToolkitCase } from '../../../test/parity/caseAdapter.fsc';
import type { AdaptedCase, ToolkitCase } from '../../../test/parity/caseAdapter';
import { fscConfigFor } from '../../parity/toolkitParity.fsc';
import {
  fscEsd, fscFlaggedStockbrokerSpend, fscOwnership, fscSedCe, fscSkillsInputGaps,
  type FscSubSector,
} from '../fscToolkit';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '../../sectors/fsc-generic';
import { FSC_BANKS_CALCULATOR_CONFIG } from '../../sectors/fsc-banks';
import type { CalculatorConfig } from '../../../../../shared/schema';
import type { Contribution, OwnershipData, ScorecardResult, Shareholder, SkillsData, TrainingProgram } from '../../types';
import {
  benefitFactorFor, canonicalContributionType, TOOLKIT_BENEFIT_FACTORS_SED,
} from '../../../../../../api/pipeline/rules/benefitFactors';

const EXPECTED_DIR = path.resolve(__dirname, '../../../../../../../docs/toolkits/parity/expected/fsc');
const files = existsSync(EXPECTED_DIR) ? readdirSync(EXPECTED_DIR).filter((f) => f.endsWith('.json')).sort() : [];
const TOLERANCE = 0.005;

type State = AdaptedCase['state'];

/**
 * The case as the live app would hold it: every FSC-only field removed;
 * consumer education and Fundisa as the SED page's aggregate figures
 * (recognised amounts), and the stock-broker ED spend as the build form's one figure.
 */
function asTheLiveAppHoldsIt(state: State, cfg: CalculatorConfig, sub: FscSubSector): State {
  const x = JSON.parse(JSON.stringify(state)) as State;
  for (const h of x.ownership.shareholders) delete h.loanDate;
  delete x.skills.payrollByLevel;
  for (const t of x.skills.trainingPrograms) delete t.managementPosition;
  delete x.procurement.allocatedTradeValue;
  for (const s of x.procurement.suppliers) {
    delete s.isFirstTimeSupplier; delete s.isStockBroker; delete s.isFundManager; delete s.isIntermediary;
  }
  const broker = fscFlaggedStockbrokerSpend(state.esd, Number(state.client.npat) || 0, cfg, sub);
  for (const c of x.esd.contributions) delete c.supportsBlackFinancialIntermediary;
  if (broker != null) x.esd.stockbrokerSpend = broker;
  let ce = 0;
  let fundisa = 0;
  const sedRows: Contribution[] = [];
  for (const c of x.sed.contributions) {
    const { factor, recognised } = benefitFactorFor(canonicalContributionType(c.type), TOOLKIT_BENEFIT_FACTORS_SED);
    const amount = recognised ? (Number(c.amount) || 0) * factor : 0;
    if (c.sedPillar === 'consumer_education') ce += amount;
    else if (c.sedPillar === 'fundisa') fundisa += amount;
    else { delete c.sedPillar; sedRows.push(c); }
  }
  x.sed.contributions = sedRows;
  if (ce > 0) x.sed.ceSpend = ce;
  if (fundisa > 0) x.sed.fundisaSpend = fundisa;
  for (const k of ['creditLifePolicies', 'stiPolicies', 'stiProductLines', 'stiExempt', 'stiPersonalTargetPolicies', 'stiCommercialTargetPolicies'] as const) {
    delete x.afs[k];
  }
  return x;
}

const score = (state: State, cfg: CalculatorConfig) =>
  calculateScorecard({ ...state, scorecard: {} as ScorecardResult, calculatorConfig: cfg });
const pillarScore = (r: ScorecardResult, k: keyof ScorecardResult) => Number((r[k] as { score?: number } | undefined)?.score ?? 0);
/** A sub-minimum fails only on an explicit false (undefined = the element has none). */
const fails = (r: ScorecardResult, k: keyof ScorecardResult) => (r[k] as { subMinimumMet?: boolean } | undefined)?.subMinimumMet === false;

describe('an FSC record without the toolkit-only inputs does not collapse', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('has Excel-scored cases to strip', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of files) {
    it(file.replace(/\.json$/, ''), () => {
      const ex = JSON.parse(readFileSync(path.join(EXPECTED_DIR, file), 'utf8')) as { sampleCase: ToolkitCase };
      const { state } = adaptFscToolkitCase(ex.sampleCase);
      const sub = (state.client.fscSubSector ?? 'Others') as FscSubSector;
      const cfg = fscConfigFor(sub);
      const before: CalculatorConfig = { ...cfg, fscToolkit: undefined };
      const live = asTheLiveAppHoldsIt(state, cfg, sub);

      const full = score(state, cfg);
      const ours = score(live, cfg);
      const old = score(live, before);

      // The complete case is scored the toolkit's way; the stripped one is not.
      expect(fscSkillsInputGaps(state.skills)).toEqual([]);
      expect(fscSkillsInputGaps(live.skills).length).toBeGreaterThan(0);

      // Skills: scored on the leviable amount, exactly as before, and it says why.
      expect(ours.skillsDevelopment.score).toBeCloseTo(old.skillsDevelopment.score, 6);
      expect(ours.skillsDevelopment.subMinimumMet).toBe(old.skillsDevelopment.subMinimumMet);
      expect((ours.skillsDevelopment.subLines ?? []).map((l) => [l.name, Number(l.score)]))
        .toEqual((old.skillsDevelopment.subLines ?? []).map((l) => [l.name, Number(l.score)]));
      expect(ours.skillsDevelopment.coverageNotes?.join(' ')).toMatch(/payroll of each management level/);

      // Nothing else that the live app captures may move: ownership (a loan
      // date never changes the net value — Formula A is never below Formula
      // B), management control, SD, ED (with the captured stock-broker spend),
      // SED & consumer education (as aggregates), empowerment financing.
      const same: Array<keyof ScorecardResult> = ['ownership', 'managementControl', 'supplierDevelopment', 'enterpriseDevelopment', 'socioEconomicDevelopment', 'empowermentFinancing'];
      const moved = same.filter((k) => Math.abs(pillarScore(ours, k) - pillarScore(full, k)) > TOLERANCE)
        .map((k) => `${String(k)}: ${pillarScore(full, k)} with every input, ${pillarScore(ours, k)} without`);
      expect(moved).toEqual([]);

      // Access to financial services: banks need nothing new; long-term
      // insurers lose at most the 0.25 credit-life points; short-term insurers
      // without qualifying policies keep the older calculator.
      const afs = (r: ScorecardResult) => pillarScore(r, 'accessToFinancialServices');
      if (sub === 'Banks') expect(afs(ours)).toBeCloseTo(afs(full), 6);
      if (sub === 'LTI') expect(afs(full) - afs(ours)).toBeGreaterThanOrEqual(-1e-9);
      if (sub === 'LTI') expect(afs(full) - afs(ours)).toBeLessThanOrEqual(0.25 + 1e-9);
      if (sub === 'STI') expect(afs(ours)).toBeCloseTo(afs(old), 6);

      // Procurement: only the two FSC bonus lines and the first-time 1.2
      // factor need inputs the app lacks; the bonus lines say so.
      const pp = (r: ScorecardResult, name: string) => Number(r.procurement.subLines?.find((l) => l.name === name)?.score ?? NaN);
      expect(pp(ours, 'Spend from intermediated black professional service providers')).toBe(0);
      expect(pp(ours, 'Spend from black stock brokers or fund managers')).toBe(0);
      expect(ours.procurement.coverageNotes?.join(' ')).toMatch(/allocated trade value/);
      const firstTimeOnly = state.procurement.suppliers.some((s) => (s.enterpriseType === 'qse' || s.enterpriseType === 'eme')
        && (Number(s.blackOwnership) || 0) >= 0.51 && s.isFirstTimeSupplier && !s.isSupplierDevRecipient && !s.hasThreeYearContract);
      if (!firstTimeOnly) {
        const base = (r: ScorecardResult) => (r.procurement.subLines ?? []).slice(0, 5).map((l) => Number(l.score));
        base(ours).forEach((v, i) => expect(v).toBeCloseTo(base(full)[i], 6));
      }

      // No priority element fails, and no level is discounted, only because an
      // input is missing: whatever fails here fails with every input, or
      // failed on the scorer used before.
      const priority: Array<keyof ScorecardResult> = ['ownership', 'skillsDevelopment', 'supplierDevelopment', 'enterpriseDevelopment',
        sub === 'Banks' || sub === 'LTI' ? 'empowermentFinancing' : 'procurement'];
      const onlyHere = priority.filter((k) => fails(ours, k) && !fails(full, k) && !fails(old, k === 'empowermentFinancing' ? 'procurement' : k));
      expect(onlyHere).toEqual([]);
      if (ours.isDiscounted) expect(full.isDiscounted || old.isDiscounted).toBe(true);
    });
  }
});

describe('FSC toolkit method, element by element, when an input is missing', () => {
  const program = (i: number, position: string | undefined, extra: Partial<TrainingProgram> = {}): TrainingProgram => ({
    id: `t${i}`, programName: 'Course', categoryCode: 'B', learnerName: `Learner ${i}`, gender: 'Female', race: 'African',
    isDisabled: false, employmentStatus: 'Permanent', managementPosition: position, courseCost: 50_000, totalCost: 50_000,
    isBursary: false, transactionDate: '2025-06-30',
    ...extra,
  } as TrainingProgram);
  const skills = (programs: TrainingProgram[], payroll?: SkillsData['payrollByLevel']): SkillsData => ({
    id: 'sk', clientId: 'c', leviableAmount: 10_000_000, trainingPrograms: programs, payrollByLevel: payroll,
  } as SkillsData);
  const payroll = { execSenior: 1_000_000, middle: 2_000_000, junior: 3_000_000, nonManagement: 4_000_000 };

  it('skills is measured per level only with every level payroll and every position', () => {
    expect(fscSkillsInputGaps(skills([program(1, 'Middle Management'), program(2, 'Unemployed')], payroll))).toEqual([]);
    // Case and spacing of the toolkit's own position names do not matter.
    expect(fscSkillsInputGaps(skills([program(1, ' middle management ')], payroll))).toEqual([]);
    expect(fscSkillsInputGaps(skills([program(1, 'Middle Management')]))).toEqual(['the payroll of each management level']);
    expect(fscSkillsInputGaps(skills([program(1, 'Middle Management')], { execSenior: 0, middle: 0, junior: 0, nonManagement: 0 })))
      .toEqual(['the payroll of each management level']);
    expect(fscSkillsInputGaps(skills([program(1, 'Middle Management'), program(2, undefined), program(3, 'Manager')], payroll)))
      .toEqual(['the management position of 2 of 3 training rows']);
    expect(fscSkillsInputGaps(skills([program(1, undefined)])))
      .toEqual(['the payroll of each management level', 'the management position of every training row']);
  });

  it('the net value line never scores above its own weighting (6 for banks and insurers, 8 for Others)', () => {
    // One indebted black holder (60% of the value, debt 10% of the company)
    // and one unencumbered black holder (20%): unencumbered 20% ÷ 25% × the
    // weighting, plus Formula B at its cap — over the weighting either way.
    const holders: Shareholder[] = [
      { id: 'a', name: 'Indebted Trust', blackOwnership: 1, blackWomenOwnership: 0.5, shares: 60, shareValue: 60, outstandingDebt: 10, loanDate: '2022-03-01' },
      { id: 'b', name: 'Free Holdings', blackOwnership: 1, blackWomenOwnership: 0.5, shares: 20, shareValue: 20 },
      { id: 'c', name: 'Other Investors', blackOwnership: 0, blackWomenOwnership: 0, shares: 20, shareValue: 20 },
    ] as Shareholder[];
    const data = { id: 'o', clientId: 'c', shareholders: holders, companyValue: 100 } as OwnershipData;
    const netValue = (sub: FscSubSector, cfg: CalculatorConfig) =>
      fscOwnership(data, cfg, sub, '2026-02-28').lines.find((l) => l.name === 'Net value')!;
    for (const sub of ['Banks', 'LTI', 'STI'] as const) {
      const nv = netValue(sub, FSC_BANKS_CALCULATOR_CONFIG);
      expect(nv.weighting).toBe(6);
      expect(nv.score).toBeCloseTo(6, 9);
    }
    const others = netValue('Others', FSC_GENERIC_CALCULATOR_CONFIG);
    expect(others.weighting).toBe(8);
    expect(others.score).toBeCloseTo(8, 9);
  });

  it('additional consumer education captured as its own figure still counts', () => {
    const npat = 100_000_000;
    const line = (r: ReturnType<typeof fscSedCe>, name: string) => r.lines.find((l) => l.name === name)!.score;
    // Base consumer education at its 0.4% target, the additional 0.1% captured apart.
    const apart = fscSedCe({ id: 's', clientId: 'c', contributions: [], ceSpend: 400_000, ceBonusSpend: 100_000 }, npat, false);
    expect(line(apart, 'Consumer Education contributions')).toBeCloseTo(2, 9);
    expect(line(apart, 'Additional Consumer Education contributions')).toBeCloseTo(1, 9);
    // The toolkit's way: all consumer education in one figure, the excess is the bonus.
    const whole = fscSedCe({ id: 's', clientId: 'c', contributions: [], ceSpend: 500_000 }, npat, false);
    expect(line(whole, 'Additional Consumer Education contributions')).toBeCloseTo(1, 9);
    // Both: the excess is not counted twice (the line caps anyway, so check below the cap).
    const both = fscSedCe({ id: 's', clientId: 'c', contributions: [], ceSpend: 450_000, ceBonusSpend: 50_000 }, npat, false);
    expect(line(both, 'Additional Consumer Education contributions')).toBeCloseTo(0.5, 9);
  });

  it('the ED stock-broker bonus counts the flagged rows, or the spend captured as one figure', () => {
    const npat = 100_000_000;
    const cfg = FSC_GENERIC_CALCULATOR_CONFIG;
    const base = { id: 'e', clientId: 'c', graduationBonus: false, jobsCreatedBonus: false, measurementPeriodEnd: '2026-02-28' };
    const row = (supports: boolean): Contribution => ({
      id: 'r', beneficiary: 'Ubuntu Brokers', description: 'Grant', type: 'grant', amount: 250_000,
      category: 'enterprise_development', blackBenefitPercent: 100, transactionDate: '2025-09-30',
      beneficiaryCurrentSize: 'qse', beneficiaryBlackOwnership: 1, supportsBlackFinancialIntermediary: supports,
    } as Contribution);
    // No row flagged: the captured figure (0.5% of NPAT) earns the full 2 points.
    expect(fscEsd({ ...base, contributions: [row(false)], stockbrokerSpend: 500_000 }, npat, cfg).stockbrokerBonus).toBeCloseTo(2, 2);
    // A flagged row is what counts once rows carry the flag (R250,000 → 1 point).
    expect(fscEsd({ ...base, contributions: [row(true)], stockbrokerSpend: 500_000 }, npat, cfg).stockbrokerBonus).toBeCloseTo(1, 2);
    expect(fscEsd({ ...base, contributions: [row(false)] }, npat, cfg).stockbrokerBonus).toBe(0);
  });
});
