/**
 * The three ICT Generic toolkit answers reach the live scorer from where the
 * app captures them, the workbook, and not only from the parity case adapter:
 *  - SED "ICT-Specific?" → isSectorSpecificInitiative. ICT SED counts
 *    sector-specific initiatives only, so an explicit No removes a row; a
 *    blank cell, or a row imported from a sheet without the column, still
 *    counts (the importer used to stamp No on every row it brought in);
 *  - Procurement "First-time Supplier?" → isFirstTimeSupplier (the 1.2
 *    recognition factor for a first-time ≥51% black-owned QSE/EME);
 *  - Skills "Disabled learners measured against EAP targets?" (the
 *    verification agent's sign-off, 'Skills Toolkit'!D9) → disabledSpendUsesEap.
 *
 * Path under test: workbook → projectWorkbookToClient (the submit projection)
 * → the client record GET /data returns → loadClientData → the calculator.
 * Invented companies and figures only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    api: {
      ...(actual.api as object),
      getClientData: vi.fn(),
      updateClient: vi.fn().mockResolvedValue({}),
      updateProcurement: vi.fn().mockResolvedValue({}),
    },
    invalidateClientData: vi.fn(),
  };
});

import { api } from '../api';
import { useBbeeStore } from '../store';
import { projectWorkbookToClient, type WorkbookData } from '../../../../server/workbookRoutes';
import { getSection } from '@/components/workbook/sections';
import { mapExtractedToWorkbookSections } from '@/lib/excelImport';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')));
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface WbOpts {
  sector?: string;
  sedAnswers?: Array<boolean | '' | 'absent'>;
  firstTime?: boolean | '';
  disabledEap?: boolean;
}

function workbook(o: WbOpts = {}): WorkbookData {
  const sedAnswers = o.sedAnswers ?? [true, false, '', 'absent'];
  return {
    companyId: 'ict-answers',
    sections: {
      'company-information': { meta: { industrySector: o.sector ?? 'ICT', scorecardType: 'Generic' } },
      'financial-information': { meta: { revenue: 400_000_000, npat: 100_000_000, payroll: 20_000_000 } },
      'skills-development': { meta: o.disabledEap === undefined ? {} : { disabledSpendUsesEap: o.disabledEap }, rows: [] },
      procurement: {
        rows: [
          // A large non-compliant supplier keeps every procurement line below its cap.
          { _id: 'p1', supplierName: 'Invented Bulk Supplier', currentSize: 'Generic', bbbeeLevel: 'Non-compliant', spend: 10_000_000 },
          {
            _id: 'p2', supplierName: 'Invented Small Supplier', currentSize: 'QSE', bbbeeLevel: '1',
            currentBlackOwnership: 60, currentBlackFemaleOwnership: 10, empoweringSupplier: true, spend: 500_000,
            ...(o.firstTime === undefined ? {} : { firstTimeSupplier: o.firstTime }),
          },
        ],
      },
      sed: {
        rows: sedAnswers.map((a, i) => ({
          _id: `s${i + 1}`,
          beneficiaryName: `Invented Beneficiary ${i + 1}`,
          descriptionOfSpend: `Invented programme ${i + 1}`,
          contributionType: 'Grant Contribution',
          percentBenefitingBlack: 100,
          amount: (i + 1) * 100_000,
          dateOfTransaction: '2025-06-01',
          ...(a === 'absent' ? {} : { ictSpecificInitiative: a }),
        })),
      },
    },
  } as unknown as WorkbookData;
}

/** The client record GET /api/clients/:id/data returns after a workbook submit. */
function payload(wb: WorkbookData) {
  const p = projectWorkbookToClient(wb);
  return {
    client: {
      id: 'ict-answers', name: 'Invented ICT Client', sectorCode: 'ICT', scorecardType: 'Generic', companySize: 'Generic',
      revenue: 400_000_000, npat: 100_000_000, leviableAmount: 20_000_000,
      // The submit route copies these skills extras into client.financials.
      financials: p.financials.disabledSpendUsesEap === undefined ? {} : { disabledSpendUsesEap: p.financials.disabledSpendUsesEap },
    },
    ownership: { shareholders: [], companyValue: 0, outstandingDebt: 0 },
    management: { employees: [] },
    skills: { leviableAmount: 20_000_000, trainingPrograms: [] },
    procurement: { tmps: 0, suppliers: p.suppliers },
    esd: { contributions: [] },
    sed: { contributions: p.sedContributions },
    financialYears: [],
    scenarios: [],
  };
}

async function load(wb: WorkbookData) {
  vi.mocked(api.getClientData).mockResolvedValue(payload(wb) as never);
  useBbeeStore.setState({ pendingWrites: 0, saveError: null, activeClientId: null } as never);
  await useBbeeStore.getState().loadClientData('ict-answers');
  return useBbeeStore.getState();
}

const sedLine = (s: ReturnType<typeof useBbeeStore.getState>) =>
  (s.scorecard.socioEconomicDevelopment.subLines ?? []).find((l) => l.name === 'Annual value of all SED contributions');

describe('ICT SED: "ICT-Specific?" reaches the calculator as an answer, never as a default', () => {
  it('projects Yes / No and keeps a blank or missing answer unset', () => {
    const p = projectWorkbookToClient(workbook());
    expect(p.sedContributions.map((c) => c.isSectorSpecificInitiative)).toEqual([true, false, undefined, undefined]);
  });

  it('an explicit No removes the row from the score; blank and missing answers still count', async () => {
    const withNo = await load(workbook({ sedAnswers: [true, false, '', 'absent'] }));
    expect(withNo.sed.contributions.map((c) => c.isSectorSpecificInitiative)).toEqual([true, false, undefined, undefined]);
    const withNoScore = withNo.scorecard.socioEconomicDevelopment.score;
    expect(sedLine(withNo)?.note).toMatch(/not a sector-specific initiative/);

    const allCount = await load(workbook({ sedAnswers: [true, '', '', 'absent'] }));
    // 1 + 3 + 4 of 10 parts against 1 + 2 + 3 + 4: R200 000 of R1m less.
    expect(withNoScore).toBeGreaterThan(0);
    expect(withNoScore).toBeCloseTo(allCount.scorecard.socioEconomicDevelopment.score * 0.8, 2);
    expect(sedLine(allCount)?.note ?? '').not.toMatch(/not a sector-specific initiative/);
  });

  it('a stored ictSpecificInitiative:false (the api schema default) is not read as an answer', async () => {
    const wb = workbook({ sedAnswers: ['', ''] });
    const p = payload(wb);
    // As the per-entity collection returns a Toolkit-added row: defaulted, never asked.
    p.sed.contributions = p.sed.contributions.map((c) => ({ ...c, ictSpecificInitiative: false, isSectorSpecificInitiative: undefined }));
    vi.mocked(api.getClientData).mockResolvedValue(p as never);
    useBbeeStore.setState({ pendingWrites: 0, saveError: null, activeClientId: null } as never);
    await useBbeeStore.getState().loadClientData('ict-answers');
    const s = useBbeeStore.getState();
    expect(s.scorecard.socioEconomicDevelopment.score).toBeGreaterThan(0);
    expect(sedLine(s)?.note ?? '').not.toMatch(/not a sector-specific initiative/);
  });

  it('the importer brings in the sheet\'s own answer, and no answer when the sheet has no such column', () => {
    const sheet = (rows: unknown[][]) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Socioeconomic Development');
      return wb;
    };
    const withColumn = mapExtractedToWorkbookSections({} as never, sheet([
      ['Beneficiary Name *', 'Description of Spend *', 'ICT Specific Initiative?', 'Contribution Type *', 'Amount *'],
      ['Invented A', 'Coding club', 'Yes', 'Grant Contribution', 50_000],
      ['Invented B', 'Sports day', 'No', 'Grant Contribution', 60_000],
      ['Invented C', 'Bursaries', '', 'Grant Contribution', 70_000],
      ['Invented D', 'Library', 'N/A', 'Grant Contribution', 80_000],
    ]));
    expect(withColumn.sed?.rows?.map((r) => (r as Record<string, unknown>).ictSpecificInitiative))
      .toEqual([true, false, undefined, undefined]);

    const withoutColumn = mapExtractedToWorkbookSections({} as never, sheet([
      ['Beneficiary Name *', 'Description of Spend *', 'Contribution Type *', 'Amount *'],
      ['Invented E', 'Coding club', 'Grant Contribution', 50_000],
    ]));
    const row = withoutColumn.sed?.rows?.[0] as Record<string, unknown>;
    expect(row.beneficiaryName).toBe('Invented E');
    expect('ictSpecificInitiative' in row).toBe(false);
  });
});

describe('ICT procurement: "First-time Supplier?" earns the 1.2 factor', () => {
  it('a first-time ≥51% black-owned QSE scores more than the same supplier without the answer', async () => {
    const yes = await load(workbook({ firstTime: true }));
    expect(yes.procurement.suppliers.find((s) => s.name === 'Invented Small Supplier')?.isFirstTimeSupplier).toBe(true);
    const yesScore = yes.scorecard.procurement.score;
    const no = await load(workbook({ firstTime: '' }));
    expect(no.procurement.suppliers.find((s) => s.name === 'Invented Small Supplier')?.isFirstTimeSupplier).toBe(false);
    expect(yesScore).toBeGreaterThan(no.scorecard.procurement.score);
  });
});

describe('ICT skills: the EAP-split sign-off reaches the Skills data', () => {
  it('ticked in the workbook, the store measures disabled spend by EAP group', async () => {
    expect(projectWorkbookToClient(workbook({ disabledEap: true })).financials.disabledSpendUsesEap).toBe(true);
    expect((await load(workbook({ disabledEap: true }))).skills.disabledSpendUsesEap).toBe(true);
  });

  it('unticked or never set, one pool against the whole target', async () => {
    expect((await load(workbook({ disabledEap: false }))).skills.disabledSpendUsesEap).toBe(false);
    expect(projectWorkbookToClient(workbook()).financials.disabledSpendUsesEap).toBeUndefined();
    expect((await load(workbook())).skills.disabledSpendUsesEap).toBe(false);
  });
});

describe('the new capture fields are shown only where ICT Generic scores them', () => {
  const procurementKeys = (sector: string, card: string) => getSection('procurement', sector, card)!.columns!.map((c) => c.key);
  const skillsMetaKeys = (sector: string, card: string) => getSection('skills-development', sector, card)!.meta!.map((f) => f.key);

  it('ICT Generic shows both', () => {
    expect(procurementKeys('ICT', 'Generic')).toContain('firstTimeSupplier');
    expect(skillsMetaKeys('ICT', 'Generic')).toContain('disabledSpendUsesEap');
  });

  it.each([['RCOGP', 'Generic'], ['RCOGP', 'QSE'], ['ICT', 'QSE'], ['TRANSPORT', 'Generic'], ['AGRI', 'Generic']])(
    '%s %s shows neither (nothing there reads them)', (sector, card) => {
      expect(procurementKeys(sector, card)).not.toContain('firstTimeSupplier');
      expect(skillsMetaKeys(sector, card)).not.toContain('disabledSpendUsesEap');
    },
  );

  it('the importer (no sector) still recognises both columns', () => {
    expect(getSection('procurement')!.columns!.map((c) => c.key)).toContain('firstTimeSupplier');
    expect(getSection('skills-development')!.meta!.map((f) => f.key)).toContain('disabledSpendUsesEap');
  });
});
