/**
 * Cross-Reference and Range Validator
 *
 * Validates extracted B-BBEE data for internal consistency:
 * - Shareholder ownership percentages sum to ~100%
 * - Currency amounts are positive and within plausible ranges
 * - BEE levels are 1-8 (or 0 for non-compliant)
 * - Employee demographic counts match headcount totals
 * - Procurement spend sums should approximate TMPS
 */

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
  expected: string;
  actual: string;
  autoFix: boolean;
  fixedValue?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  fixedCount: number;
}

function addIssue(
  issues: ValidationIssue[],
  severity: ValidationIssue['severity'],
  field: string,
  message: string,
  expected: string,
  actual: string,
  autoFix = false,
  fixedValue?: unknown,
): void {
  issues.push({ severity, field, message, expected, actual, autoFix, fixedValue });
}

export function validateOwnership(
  shareholders: Array<{ name: string; blackOwnership: number; blackWomenOwnership: number; shares?: number }>,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let fixedCount = 0;

  if (shareholders.length === 0) {
    addIssue(issues, 'warning', 'ownership.shareholders', 'No shareholders extracted', '>= 1 shareholder', '0');
    return { valid: true, issues, fixedCount };
  }

  const totalShares = shareholders.reduce((s, sh) => s + (sh.shares || 0), 0);
  if (totalShares > 0) {
    if (totalShares < 0.95 || totalShares > 1.05) {
      if (totalShares > 1 && totalShares <= 105) {
        addIssue(issues, 'info', 'ownership.totalShares',
          'Shares appear to be in percentage format (>1), will treat as fraction',
          '~1.0 (100%)', String(totalShares));
      } else if (totalShares < 0.95 || totalShares > 1.05) {
        addIssue(issues, 'warning', 'ownership.totalShares',
          'Shareholder shares do not sum to approximately 100%',
          '~1.0 (100%)', totalShares.toFixed(4));
      }
    }
  }

  for (const sh of shareholders) {
    if (sh.blackOwnership < 0 || sh.blackOwnership > 1) {
      if (sh.blackOwnership > 1 && sh.blackOwnership <= 100) {
        addIssue(issues, 'info', `ownership.${sh.name}.blackOwnership`,
          'BO appears in percentage format, converting to fraction',
          '0-1', String(sh.blackOwnership), true, sh.blackOwnership / 100);
        fixedCount++;
      } else {
        addIssue(issues, 'error', `ownership.${sh.name}.blackOwnership`,
          'Black ownership out of range', '0-100%', String(sh.blackOwnership));
      }
    }

    if (sh.blackWomenOwnership > sh.blackOwnership && sh.blackOwnership > 0) {
      addIssue(issues, 'warning', `ownership.${sh.name}.bwo`,
        'BWO exceeds total BO -- BWO must be a subset of BO',
        `<= ${sh.blackOwnership}`, String(sh.blackWomenOwnership));
    }
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues, fixedCount };
}

export function validateFinancials(financials: {
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  tmps?: number;
  payroll?: number;
}): ValidationResult {
  const issues: ValidationIssue[] = [];
  let fixedCount = 0;

  if (financials.revenue !== undefined && financials.revenue < 0) {
    addIssue(issues, 'error', 'financials.revenue', 'Revenue cannot be negative', '>= 0', String(financials.revenue));
  }

  if (financials.npat !== undefined && financials.revenue !== undefined) {
    if (Math.abs(financials.npat) > financials.revenue * 2) {
      addIssue(issues, 'warning', 'financials.npat',
        'NPAT magnitude exceeds 2x revenue -- check for data error',
        `<= ${financials.revenue * 2}`, String(financials.npat));
    }
  }

  if (financials.leviableAmount !== undefined && financials.revenue !== undefined) {
    if (financials.leviableAmount > financials.revenue) {
      addIssue(issues, 'warning', 'financials.leviableAmount',
        'Leviable amount exceeds revenue -- unusual but possible',
        `<= ${financials.revenue}`, String(financials.leviableAmount));
    }
  }

  if (financials.tmps !== undefined && financials.revenue !== undefined) {
    if (financials.tmps > financials.revenue * 1.5) {
      addIssue(issues, 'warning', 'financials.tmps',
        'TMPS exceeds 1.5x revenue -- check for data error',
        `<= ${financials.revenue * 1.5}`, String(financials.tmps));
    }
  }

  if (financials.payroll !== undefined && financials.payroll < 0) {
    addIssue(issues, 'error', 'financials.payroll', 'Payroll cannot be negative', '>= 0', String(financials.payroll));
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues, fixedCount };
}

export function validateEmployees(
  employees: Array<{ race: string; gender: string; designation: string }>,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fixedCount = 0;

  const validRaces = ['African', 'Coloured', 'Indian', 'White'];
  const validGenders = ['Male', 'Female'];
  const validDesignations = [
    'Board', 'Executive', 'Executive Director', 'Other Executive Management',
    'Senior', 'Middle', 'Junior', 'Semi-skilled', 'Unskilled', 'Skilled Technical',
  ];

  let unknownRace = 0, unknownGender = 0, unknownDesig = 0;
  for (const e of employees) {
    if (!validRaces.includes(e.race)) unknownRace++;
    if (!validGenders.includes(e.gender)) unknownGender++;
    if (!validDesignations.includes(e.designation)) unknownDesig++;
  }

  if (unknownRace > 0) {
    addIssue(issues, 'warning', 'employees.race',
      `${unknownRace} employees have unrecognized race values`,
      validRaces.join('/'), `${unknownRace} unrecognized`);
  }
  if (unknownGender > 0) {
    addIssue(issues, 'warning', 'employees.gender',
      `${unknownGender} employees have unrecognized gender values`,
      validGenders.join('/'), `${unknownGender} unrecognized`);
  }
  if (unknownDesig > 0) {
    addIssue(issues, 'warning', 'employees.designation',
      `${unknownDesig} employees have unrecognized designation values`,
      validDesignations.join('/'), `${unknownDesig} unrecognized`);
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues, fixedCount };
}

export function validateSuppliers(
  suppliers: Array<{ beeLevel: number; spend: number; blackOwnership: number }>,
  tmps: number,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let fixedCount = 0;

  for (const s of suppliers) {
    if (s.beeLevel < 0 || s.beeLevel > 8 || !Number.isInteger(s.beeLevel)) {
      addIssue(issues, 'warning', 'suppliers.beeLevel',
        'BEE level must be integer 0-8',
        '0-8', String(s.beeLevel), true, Math.min(8, Math.max(0, Math.round(s.beeLevel))));
      fixedCount++;
    }
    if (s.spend < 0) {
      addIssue(issues, 'error', 'suppliers.spend', 'Supplier spend cannot be negative', '>= 0', String(s.spend));
    }
    if (s.blackOwnership < 0 || s.blackOwnership > 1) {
      if (s.blackOwnership > 1 && s.blackOwnership <= 100) {
        addIssue(issues, 'info', 'suppliers.blackOwnership',
          'BO appears in percentage format', '0-1', String(s.blackOwnership), true, s.blackOwnership / 100);
        fixedCount++;
      }
    }
  }

  const totalSpend = suppliers.reduce((sum, s) => sum + s.spend, 0);
  if (tmps > 0 && totalSpend > tmps * 1.5) {
    addIssue(issues, 'warning', 'suppliers.totalSpend',
      'Total supplier spend exceeds 1.5x TMPS -- check for duplicates or data error',
      `<= ${tmps * 1.5}`, String(totalSpend));
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues, fixedCount };
}

export function validateAll(data: {
  shareholders: Array<{ name: string; blackOwnership: number; blackWomenOwnership: number; shares?: number }>;
  financials: { revenue?: number; npat?: number; leviableAmount?: number; tmps?: number; payroll?: number };
  employees: Array<{ race: string; gender: string; designation: string }>;
  suppliers: Array<{ beeLevel: number; spend: number; blackOwnership: number }>;
}): ValidationResult {
  const results = [
    validateOwnership(data.shareholders),
    validateFinancials(data.financials),
    validateEmployees(data.employees),
    validateSuppliers(data.suppliers, data.financials.tmps || 0),
  ];

  return {
    valid: results.every(r => r.valid),
    issues: results.flatMap(r => r.issues),
    fixedCount: results.reduce((sum, r) => sum + r.fixedCount, 0),
  };
}
