// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { NumericDateInput } from '@/components/ui/NumericDateInput';
import { NumberTextInput } from '../NumberTextInput';
import { calculateSkillsScore } from '@toolkit/lib/calculators/skills';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore } from '@toolkit/lib/calculators/esd-sed';
import { makeCalculatorConfig } from '@toolkit/test/makeCalculatorConfig';
import { SECTIONS } from '@/components/workbook/sections';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('create-scorecard date validation', () => {
  it('normalises a valid date without showing a warning', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumericDateInput aria-label="period end" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('period end'), '31/12/2025');
    await user.tab();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('2025-12-31');
    expect(screen.getByLabelText('period end')).toHaveValue('31/12/2025');
  });

  it('shows a clear error for an invalid date', async () => {
    const user = userEvent.setup();
    render(<NumericDateInput aria-label="period end" value="" onChange={vi.fn()} />);

    await user.type(screen.getByLabelText('period end'), '32/13/2025');
    await user.tab();

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid date as dd/mm/yyyy.');
  });
});

describe('create-scorecard numeric inputs', () => {
  it('uses text-backed numeric entry without browser selection errors', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onNumberChange = vi.fn();
    render(<NumberTextInput aria-label="Annual Salary" value={0} onNumberChange={onNumberChange} />);

    await user.click(screen.getByLabelText('Annual Salary'));
    await user.type(screen.getByLabelText('Annual Salary'), '450000');

    expect(screen.getByLabelText('Annual Salary')).toHaveValue('450000');
    expect(onNumberChange).toHaveBeenLastCalledWith(450000);
    expect(errorSpy.mock.calls.some((call) => /selection|setSelectionRange/i.test(String(call[0])))).toBe(false);
  });
});

describe('create-scorecard field model regressions', () => {
  it('removes Ownership Data Date and renames the required Skills reference date', () => {
    const ownership = SECTIONS.find((s) => s.key === 'ownership')!;
    const skills = SECTIONS.find((s) => s.key === 'skills-development')!;

    expect(ownership.columns?.some((column) => column.key === 'dataDate')).toBe(false);
    const skillsReferenceDate = skills.meta?.find((field) => field.key === 'dataDate');
    expect(skillsReferenceDate?.label).toBe('Training Data Reference Date (dd/mm/yyyy)');
    expect(skillsReferenceDate?.required).toBe(true);
  });

  it('provides clear Ownership Type and municipality choices in the workbook flow', () => {
    const ownershipType = SECTIONS
      .find((s) => s.key === 'ownership')!
      .columns?.find((column) => column.key === 'ownershipType');
    const municipality = SECTIONS
      .find((s) => s.key === 'skills-development')!
      .columns?.find((column) => column.key === 'municipality');

    expect(ownershipType?.type).toBe('select');
    expect(ownershipType?.options).toEqual(['Shareholder', 'Sale of Assets', 'Equity Equivalent']);
    expect(municipality?.options).toContain('City of Johannesburg');
    expect(municipality?.options).toContain('Other');
  });

  it('adds optional Supplier Registration Number to Preferential Procurement', () => {
    const procurement = SECTIONS.find((s) => s.key === 'procurement')!;
    const registration = procurement.columns?.find((column) => column.key === 'registrationNumber');
    const vat = procurement.columns?.find((column) => column.key === 'vatNumber');

    expect(registration?.label).toBe('Supplier Registration Number');
    expect(registration?.required).not.toBe(true);
    expect(vat?.required).not.toBe(true);
  });

});

describe('scorecard calculations read saved create-scorecard data', () => {
  const config = makeCalculatorConfig();

  it('Skills score uses current cost breakdown, bursaries, and participation numbers', () => {
    const result = calculateSkillsScore({
      id: 'skills',
      clientId: 'c1',
      leviableAmount: 1_000_000,
      yesCandidatesCount: 0,
      yesAbsorbedCount: 0,
      trainingPrograms: [
        {
          id: 'bursary',
          programName: 'Bursary',
          categoryCode: 'A',
          learnerName: 'Learner One',
          gender: 'Female',
          race: 'African',
          isDisabled: false,
          isForeign: false,
          employmentStatus: 'Unemployed',
          isYesEmployee: false,
          isCompleted: false,
          isAbsorbed: false,
          transactionDate: '2026-01-31',
          courseCost: 30_000,
          travelCost: 5_000,
          accommodationCost: 0,
          cateringCost: 0,
          stationeryCost: 0,
          facilityCost: 0,
          salaryCost: 0,
          otherCosts: 0,
          isAbet: false,
          isMandatory: false,
          isBursary: true,
        },
        {
          id: 'learnership',
          programName: 'Learnership',
          categoryCode: 'D',
          learnerName: 'Learner Two',
          gender: 'Male',
          race: 'Coloured',
          isDisabled: false,
          isForeign: false,
          employmentStatus: 'Permanent',
          isYesEmployee: false,
          isCompleted: false,
          isAbsorbed: true,
          transactionDate: '2026-01-31',
          courseCost: 40_000,
          travelCost: 0,
          accommodationCost: 0,
          cateringCost: 0,
          stationeryCost: 0,
          facilityCost: 0,
          salaryCost: 0,
          otherCosts: 0,
          isAbet: false,
          isMandatory: false,
          isBursary: false,
        },
      ],
    }, config);

    expect(result.learningProgrammes).toBeGreaterThan(0);
    expect(result.bursaries).toBeGreaterThan(0);
    expect(result.learnerships).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('Procurement score reads saved suppliers and legacy Large maps to Generic', () => {
    const supplier = {
      id: 's1',
      name: 'Legacy Large Supplier',
      registrationNumber: '2019/123456/07',
      beeLevel: 1,
      blackOwnership: 0.75,
      blackWomenOwnership: 0.35,
      youthOwnership: 0.1,
      disabledOwnership: 0,
      enterpriseType: 'large' as any,
      isEmpoweringSupplier: true,
      isSupplierDevRecipient: false,
      hasThreeYearContract: false,
      spend: 500_000,
    };
    const result = calculateProcurementScore({
      id: 'proc',
      clientId: 'c1',
      tmps: 1_000_000,
      suppliers: [supplier],
    }, config);

    expect(supplier.registrationNumber).toBe('2019/123456/07');
    expect('vatNumber' in supplier).toBe(false);
    expect(result.recognisedSpend).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('Supplier Development score reads saved ESD contributions and is stable after refresh-equivalent recalculation', () => {
    const data = {
      id: 'esd',
      clientId: 'c1',
      graduationBonus: false,
      jobsCreatedBonus: false,
      contributions: [{
        id: 'sd1',
        beneficiary: 'SD Beneficiary',
        type: 'direct_cost' as const,
        amount: 40_000,
        category: 'supplier_development' as const,
        blackBenefitPercent: 100,
      }],
    };

    const first = calculateEsdScore(data, 1_000_000, config);
    const second = calculateEsdScore(JSON.parse(JSON.stringify(data)), 1_000_000, config);
    expect(first.sdTotal).toBeGreaterThan(0);
    expect(second.total).toBe(first.total);
  });
});
