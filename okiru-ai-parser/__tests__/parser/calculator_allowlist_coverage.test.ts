/**
 * Drift guard: the allowlist must keep up with what the scorecard consumes.
 *
 * The allowlist began as a gate on what the PARSER may emit, not a description
 * of what the CALCULATORS read. The two drifted, and the consequence was silent:
 * the scanned Thandanani share register extracted total_shares_in_issue,
 * share_classes and holdings_table, and every one reported `no_mapping` because
 * there was nowhere for them to land. Extraction quality could not have fixed
 * that — the ceiling was here.
 *
 * A hand-maintained list drifts again the moment a calculator gains an input.
 * These tests pin the coverage so the next gap fails a build instead of quietly
 * capping a score.
 */
import { describe, expect, it } from 'vitest';
import {
  CALCULATOR_KEY_ALLOWLIST,
  admitCalculatorEntry,
  isAllowedCalculatorKey,
} from '../../schemas/calculator_allowlist.js';

/**
 * What the Toolkit calculators actually read, transcribed from their source.
 * Grouped by the pillar that consumes them.
 *
 * When a calculator gains an input, add it here FIRST — the test then fails
 * until the allowlist carries a key for it. That is the point.
 */
const CALCULATOR_INPUTS: Record<string, string[]> = {
  // ownership.ts — data.shareholders[], data.companyValue
  ownership: [
    'ownership.shareholder_name',
    'ownership.voting_rights',
    'ownership.economic_interest',
    'ownership.company_value',
    'ownership.black_ownership',
    'ownership.black_women_ownership',
  ],
  // management.ts — data.employees[]
  management: [
    'management.employee_name',
    'management.designation',
    'management.race',
    'management.gender',
    'management.is_disabled',
    'management.black_representation',
  ],
  // skills.ts — data.trainingPrograms[], data.leviableAmount, data.headcount
  skills: [
    'skills.leviable_amount',
    'skills.group_leviable_amount',
    'skills.category_code',
    'skills.total_cost',
    'skills.employment_status',
    'skills.absorbed',
    'skills.total_spend',
  ],
  // procurement.ts — data.suppliers[], data.tmps
  procurement: [
    'procurement.tmps',
    'procurement.supplier_name',
    'procurement.supplier_spend',
    'procurement.supplier_bee_level',
    'procurement.supplier_black_ownership',
    'procurement.supplier_black_women_ownership',
    'procurement.supplier_enterprise_type',
  ],
  // esd-sed.ts — data.contributions[]
  esd: [
    'esd.beneficiary_name',
    'esd.contribution',
    'esd.contribution_type',
    'esd.category',
  ],
  sed: [
    'sed.beneficiary_name',
    'sed.contribution',
    'sed.contribution_type',
  ],
  // Entity-level denominators and eligibility.
  entity: [
    'entity.revenue',
    'entity.npat',
    'entity.payroll',
  ],
};

describe('every calculator input has a key', () => {
  for (const [pillar, keys] of Object.entries(CALCULATOR_INPUTS)) {
    it(`${pillar}: all inputs are allowlisted`, () => {
      const missing = keys.filter((key) => !isAllowedCalculatorKey(key));
      expect(missing, `no allowlist key for: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('covers the denominators, which score nothing when absent', () => {
    // Each of these is a DENOMINATOR: without it the whole pillar scores 0
    // however many rows were extracted. Thandanani lost 25 Procurement points
    // to a missing TMPS while holding all 23 supplier rows.
    for (const denominator of ['procurement.tmps', 'skills.leviable_amount', 'ownership.company_value']) {
      expect(isAllowedCalculatorKey(denominator), `missing denominator: ${denominator}`).toBe(true);
    }
  });

  it('covers the share-register columns that previously had nowhere to land', () => {
    for (const key of ['ownership.shareholder_name', 'ownership.voting_rights', 'ownership.economic_interest', 'ownership.total_shares_in_issue']) {
      expect(isAllowedCalculatorKey(key), `missing: ${key}`).toBe(true);
    }
  });
});

describe('the gate still holds', () => {
  it('refuses a key that is not on the list', () => {
    // Widening the list must not weaken it — an arbitrary calculator path is
    // still refused.
    expect(admitCalculatorEntry('ownership.__proto__', 'x').accepted).toBe(false);
    expect(admitCalculatorEntry('scores.final_level', 1).accepted).toBe(false);
    expect(admitCalculatorEntry('', 'x').accepted).toBe(false);
  });

  it('still enforces the declared runtime type', () => {
    expect(admitCalculatorEntry('procurement.tmps', 'not a number').accepted).toBe(false);
    expect(admitCalculatorEntry('procurement.tmps', 1030806.68).accepted).toBe(true);
    expect(admitCalculatorEntry('ownership.shareholder_name', 42).accepted).toBe(false);
    expect(admitCalculatorEntry('entity.financial_year_end', '28 February 2025').accepted).toBe(false);
    expect(admitCalculatorEntry('entity.financial_year_end', '2025-02-28').accepted).toBe(true);
  });

  it('still refuses empty values', () => {
    expect(admitCalculatorEntry('ownership.shareholder_name', '').accepted).toBe(false);
    expect(admitCalculatorEntry('procurement.tmps', null).accepted).toBe(false);
  });
});

describe('the list itself is well formed', () => {
  it('has no duplicate keys', () => {
    const keys = CALCULATOR_KEY_ALLOWLIST.map((spec) => spec.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it('describes every key, so the mapping layer can be reviewed by a human', () => {
    for (const spec of CALCULATOR_KEY_ALLOWLIST) {
      expect(spec.description.trim().length, `no description for ${spec.key}`).toBeGreaterThan(10);
    }
  });

  it('namespaces every key to a pillar', () => {
    for (const spec of CALCULATOR_KEY_ALLOWLIST) {
      expect(spec.key, `un-namespaced key: ${spec.key}`).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});
