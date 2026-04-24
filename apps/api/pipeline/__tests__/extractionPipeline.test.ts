import { describe, it, expect } from 'vitest';
import type { LLMExtractionResult } from '../extraction/llmExtractor.js';
import type { ParseResult } from '../excelParser.js';
import {
  mapExtractedEntitiesToToolkitInput,
  validateMinimumFields,
  runExtractionPipeline,
  runExtractionPipelineFromParseResult,
} from '../extractionPipeline.js';
import { buildPipelineResult } from '../buildResult.js';

const LAKE_NPAT = 33_862_998;
const LAKE_REVENUE = 274_953_097;
const LAKE_LEVIABLE = 2_069_572;
const LAKE_TMPS = 133_730_345.99;

function makeLLMResult(
  entityName: string,
  value: string | number | null,
  confidence = 0.9,
): LLMExtractionResult {
  return {
    entityName,
    extractedValue: value,
    rawLLMResponse: String(value),
    confidence,
    sourcePageId: 'page-1',
    structuralVerification: true,
    method: 'llm',
  };
}

function mockValidEntities(): LLMExtractionResult[] {
  return [
    makeLLMResult('Total Revenue', LAKE_REVENUE),
    makeLLMResult('NPAT', LAKE_NPAT),
    makeLLMResult('Leviable Amount', LAKE_LEVIABLE),
    makeLLMResult('TMPS', LAKE_TMPS),
    makeLLMResult('Financial Year End', '2026-02-28'),

    makeLLMResult('Shareholder Name', 'Lake Family Trust'),
    makeLLMResult('Black Ownership Percentage', '100'),
    makeLLMResult('Black Women Ownership Percentage', '50'),
    makeLLMResult('Shareholding Percentage', '100'),

    makeLLMResult('Employee Name', 'Director A'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Board'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Director B'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'White'),
    makeLLMResult('Employee Designation', 'Board'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Exec A'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Executive Director'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Exec B'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Executive Director'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'OEM A'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'White'),
    makeLLMResult('Employee Designation', 'Senior Management'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Sen A'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Senior'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Sen B'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'White'),
    makeLLMResult('Employee Designation', 'Senior'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Mid A'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Middle'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Mid B'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'Indian'),
    makeLLMResult('Employee Designation', 'Middle'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Jun A'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Junior'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Jun B'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Junior'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Employee Name', 'Jun C'),
    makeLLMResult('Employee Gender', 'Male'),
    makeLLMResult('Employee Race', 'White'),
    makeLLMResult('Employee Designation', 'Junior'),
    makeLLMResult('Employee Disability Status', 'No'),

    makeLLMResult('Supplier Name', 'EME supplier (bulk TMPS)'),
    makeLLMResult('Supplier BEE Level', 1),
    makeLLMResult('Supplier Black Ownership', '100'),
    makeLLMResult('Supplier Spend', 133_696_348.453),

    makeLLMResult('Supplier Name', 'QSE supplier'),
    makeLLMResult('Supplier BEE Level', 4),
    makeLLMResult('Supplier Black Ownership', '100'),
    makeLLMResult('Supplier Spend', 2_233_217.8945),

    makeLLMResult('ESD Beneficiary', 'SD beneficiary (EME)'),
    makeLLMResult('ESD Amount', 250_000),
    makeLLMResult('ESD Category', 'Supplier Development'),

    makeLLMResult('ESD Beneficiary', 'ED beneficiary (EME)'),
    makeLLMResult('ESD Amount', 160_000),
    makeLLMResult('ESD Category', 'Enterprise Development'),

    makeLLMResult('SED Beneficiary', 'Operation Smile South Africa'),
    makeLLMResult('SED Amount', 27_500),
  ];
}

function mockIncompleteEntities(): LLMExtractionResult[] {
  return [
    makeLLMResult('Shareholder Name', 'Lake Family Trust'),
    makeLLMResult('Employee Name', 'Director A'),
    makeLLMResult('Employee Gender', 'Female'),
    makeLLMResult('Employee Race', 'African'),
    makeLLMResult('Employee Designation', 'Board'),
  ];
}

function buildManualParseResult(): ParseResult {
  return {
    success: true,
    client: {
      name: 'Silver Lake Trading 447 (Pty) Ltd',
      industrySector: 'Retail',
      applicableScorecard: 'RCOGP',
      financialYear: '2026-02-28',
      revenue: LAKE_REVENUE,
      npat: LAKE_NPAT,
      leviableAmount: LAKE_LEVIABLE,
      payroll: LAKE_LEVIABLE,
      tmps: LAKE_TMPS,
      tmpsInclusions: LAKE_TMPS,
      tmpsExclusions: 0,
    },
    shareholders: [
      {
        name: 'Lake Family Trust',
        blackOwnership: 1,
        blackWomenOwnership: 0.5,
        shares: 1,
        shareValue: 0,
      },
    ],
    employees: [
      { name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false },
      { name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false },
      { name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive', isDisabled: false },
      { name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive', isDisabled: false },
      { name: 'OEM A', gender: 'Male', race: 'White', designation: 'Senior Management', isDisabled: false },
      { name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior Management', isDisabled: false },
      { name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior Management', isDisabled: false },
      { name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle Management', isDisabled: false },
      { name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle Management', isDisabled: false },
      { name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior Management', isDisabled: false },
      { name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior Management', isDisabled: false },
      { name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior Management', isDisabled: false },
    ],
    trainingPrograms: [],
    suppliers: [
      { name: 'EME supplier', beeLevel: 1, blackOwnership: 1, spend: 133_696_348.453, enterpriseType: 'eme' },
      { name: 'QSE supplier', beeLevel: 4, blackOwnership: 1, spend: 2_233_217.8945, enterpriseType: 'qse' },
    ],
    esdContributions: [
      { beneficiary: 'SD beneficiary', type: 'direct_cost', amount: 250_000, category: 'Supplier Development' },
      { beneficiary: 'ED beneficiary', type: 'direct_cost', amount: 160_000, category: 'Enterprise Development' },
    ],
    sedContributions: [
      { beneficiary: 'Operation Smile', type: 'grant', amount: 27_500, category: 'SED' },
    ],
    sheetsFound: ['manual_input'],
    sheetsMatched: [{ sheetName: 'manual_input', matchedTo: 'manual', confidence: 1.0 }],
    errors: [],
    warnings: [],
    logs: [],
    stats: { totalSheets: 1, matchedSheets: 1, entitiesExtracted: 0, confidence: 1.0 },
  };
}

describe('Extracted Entities → Scorecard Pipeline', () => {

  describe('Test 1: Valid Extracted Entities', () => {
    it('generates a scorecard for valid entities', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      expect(result.success).toBe(true);
      expect(result.scorecard).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('correctly maps entities to toolkit structure', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      expect(result.mapped).toBeDefined();
      const { foundation, pillars } = result.mapped!;

      expect(foundation.financials.totalRevenue).toBe(LAKE_REVENUE);
      expect(foundation.financials.npat).toBe(LAKE_NPAT);
      expect(foundation.financials.leviableAmount).toBe(LAKE_LEVIABLE);
      expect(foundation.financials.tmps).toBe(LAKE_TMPS);

      expect(pillars.ownership.shareholders).toHaveLength(1);
      expect(pillars.ownership.shareholders[0].name).toBe('Lake Family Trust');
      expect(pillars.ownership.shareholders[0].blackOwnership).toBe(1);

      expect(pillars.management.employees).toHaveLength(12);
      expect(pillars.procurement.suppliers).toHaveLength(2);
      expect(pillars.esd.contributions).toHaveLength(2);
      expect(pillars.sed.contributions).toHaveLength(1);
    });

    it('clientInfoToToolkitClient produces valid output via mapping', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      const ci = result.mapped!.foundation.clientInfo;
      expect(ci.companyName).toBe('Silver Lake Trading 447 (Pty) Ltd');
      expect(ci.industry).toBe('Retail');
      expect(ci.annualTurnover).toBe(LAKE_REVENUE);
    });

    it('produces a scorecard with non-zero total', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      expect(result.scorecard).toBeDefined();
      expect(result.scorecard!.scorecard.pillars.totalPoints).toBeGreaterThan(0);
    });
  });

  describe('Test 2: Missing Required Fields', () => {
    it('fails validation when required fields are missing', () => {
      const entities = mockIncompleteEntities();
      const result = runExtractionPipeline(entities);

      expect(result.success).toBe(false);
      expect(result.scorecard).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validation errors include missing revenue and NPAT', () => {
      const entities = mockIncompleteEntities();
      const result = runExtractionPipeline(entities);

      expect(result.validation).toBeDefined();
      expect(result.validation!.valid).toBe(false);
      expect(result.validation!.errors.some(e => e.includes('revenue'))).toBe(true);
      expect(result.validation!.errors.some(e => e.includes('NPAT'))).toBe(true);
    });

    it('fails when NPAT is zero (parser default for missing)', () => {
      const entities = [
        makeLLMResult('Total Revenue', 100_000_000),
        makeLLMResult('Leviable Amount', 5_000_000),
        makeLLMResult('TMPS', 50_000_000),
      ];
      const result = runExtractionPipeline(entities, { clientName: 'Test Co' });

      expect(result.success).toBe(false);
      expect(result.validation!.errors.some(e => e.includes('NPAT'))).toBe(true);
      expect(result.scorecard).toBeUndefined();
    });

    it('calculateFromPillarData equivalent is NOT called (no scorecard)', () => {
      const entities = mockIncompleteEntities();
      const result = runExtractionPipeline(entities);

      expect(result.scorecard).toBeUndefined();
    });

    it('does not generate a scorecard on validation failure', () => {
      const entities = mockIncompleteEntities();
      const result = runExtractionPipeline(entities);

      expect(result.success).toBe(false);
      expect(result.scorecard).toBeUndefined();
    });
  });

  describe('Test 3: Exact Parity with Manual Flow', () => {
    it('extracted pipeline output matches manual pipeline output for same data', () => {
      const manualParseResult = buildManualParseResult();
      const extractedResult = runExtractionPipelineFromParseResult(manualParseResult);
      const extractedScorecard = extractedResult.scorecard!;

      const manualDirect = buildPipelineResult(manualParseResult, 'manual-input');

      expect(extractedScorecard.scorecard.pillars.ownership)
        .toBeCloseTo(manualDirect.scorecard.pillars.ownership, 2);
      expect(extractedScorecard.scorecard.pillars.managementControl)
        .toBeCloseTo(manualDirect.scorecard.pillars.managementControl, 2);
      expect(extractedScorecard.scorecard.pillars.skillsDevelopment)
        .toBeCloseTo(manualDirect.scorecard.pillars.skillsDevelopment, 2);
      expect(extractedScorecard.scorecard.pillars.preferentialProcurement)
        .toBeCloseTo(manualDirect.scorecard.pillars.preferentialProcurement, 2);
      expect(extractedScorecard.scorecard.pillars.totalPoints)
        .toBeCloseTo(manualDirect.scorecard.pillars.totalPoints, 2);
      expect(extractedScorecard.scorecard.beeLevel)
        .toBe(manualDirect.scorecard.beeLevel);
    });

    it('financial data is identical between extracted and manual paths', () => {
      const manualParseResult = buildManualParseResult();
      const result = runExtractionPipelineFromParseResult(manualParseResult);

      expect(result.mapped!.foundation.financials.totalRevenue).toBe(LAKE_REVENUE);
      expect(result.mapped!.foundation.financials.npat).toBe(LAKE_NPAT);
      expect(result.mapped!.foundation.financials.leviableAmount).toBe(LAKE_LEVIABLE);
    });

    it('employee mapping preserves all demographic fields', () => {
      const manualParseResult = buildManualParseResult();
      const result = runExtractionPipelineFromParseResult(manualParseResult);

      const employees = result.mapped!.pillars.management.employees;
      expect(employees).toHaveLength(12);

      const boardMembers = employees.filter(e => e.designation === 'Board');
      expect(boardMembers).toHaveLength(2);

      const africanEmployees = employees.filter(e => e.race === 'African');
      expect(africanEmployees.length).toBeGreaterThan(0);
    });
  });

  describe('Test 4: No Mock Usage', () => {
    it('system never loads "Thandani Transport" mock data', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      expect(result.mapped!.foundation.clientInfo.companyName).not.toContain('Thandani');
      expect(JSON.stringify(result.scorecard)).not.toContain('Thandani');
    });

    it('extracted data flows through without fallback to mock', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Test Company ABC',
        industrySector: 'Manufacturing',
      });

      expect(result.mapped!.foundation.clientInfo.companyName).toBe('Test Company ABC');
      expect(result.mapped!.foundation.clientInfo.industry).toBe('Manufacturing');
    });

    it('pipeline uses only provided entity data for scoring', () => {
      const singleShareholder = [
        makeLLMResult('Total Revenue', 100_000_000),
        makeLLMResult('NPAT', 10_000_000),
        makeLLMResult('Leviable Amount', 5_000_000),
        makeLLMResult('TMPS', 50_000_000),
        makeLLMResult('Shareholder Name', 'Custom Owner'),
        makeLLMResult('Black Ownership Percentage', '75'),
        makeLLMResult('Shareholding Percentage', '100'),
      ];

      const result = runExtractionPipeline(singleShareholder, {
        clientName: 'Custom Company',
      });

      expect(result.success).toBe(true);
      expect(result.mapped!.pillars.ownership.shareholders).toHaveLength(1);
      expect(result.mapped!.pillars.ownership.shareholders[0].name).toBe('Custom Owner');
      expect(result.mapped!.pillars.management.employees).toHaveLength(0);
    });
  });

  describe('Test 5: Store Hydration', () => {
    it('store state matches manual hydration structure', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      const { pillars, foundation } = result.mapped!;

      expect(foundation.clientInfo).toHaveProperty('companyName');
      expect(foundation.clientInfo).toHaveProperty('sectorCode');
      expect(foundation.clientInfo).toHaveProperty('industry');
      expect(foundation.clientInfo).toHaveProperty('annualTurnover');
      expect(foundation.clientInfo).toHaveProperty('financialYearEnd');

      expect(foundation.financials).toHaveProperty('totalRevenue');
      expect(foundation.financials).toHaveProperty('npat');
      expect(foundation.financials).toHaveProperty('leviableAmount');
      expect(foundation.financials).toHaveProperty('tmps');
      expect(foundation.financials).toHaveProperty('currentMargin');
      expect(foundation.financials).toHaveProperty('deemedNpat');
      expect(foundation.financials).toHaveProperty('deemedNpatUsed');
    });

    it('pillar data correctly populated for all pillars', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Silver Lake Trading 447 (Pty) Ltd',
        industrySector: 'Retail',
      });

      const { pillars } = result.mapped!;

      expect(pillars.ownership).toHaveProperty('shareholders');
      expect(pillars.ownership).toHaveProperty('companyValue');
      expect(pillars.ownership.shareholders.length).toBeGreaterThan(0);

      expect(pillars.management).toHaveProperty('employees');
      expect(pillars.management.employees.length).toBeGreaterThan(0);

      expect(pillars.skills).toHaveProperty('leviableAmount');
      expect(pillars.skills).toHaveProperty('trainingPrograms');
      expect(pillars.skills.leviableAmount).toBe(LAKE_LEVIABLE);

      expect(pillars.procurement).toHaveProperty('tmps');
      expect(pillars.procurement).toHaveProperty('suppliers');
      expect(pillars.procurement.tmps).toBe(LAKE_TMPS);
      expect(pillars.procurement.suppliers.length).toBeGreaterThan(0);

      expect(pillars.esd).toHaveProperty('contributions');
      expect(pillars.esd).toHaveProperty('graduationBonus');
      expect(pillars.esd.contributions.length).toBeGreaterThan(0);

      expect(pillars.sed).toHaveProperty('contributions');
      expect(pillars.sed.contributions.length).toBeGreaterThan(0);

      expect(pillars.yes).toHaveProperty('totalEmployees');
      expect(pillars.yes).toHaveProperty('candidates');
      expect(pillars.yes).toHaveProperty('yesTierAchieved');
    });

    it('all pillar records have correct id and clientId defaults', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Test Company',
      });

      const { pillars } = result.mapped!;

      expect(pillars.ownership.id).toBe('');
      expect(pillars.ownership.clientId).toBe('');
      expect(pillars.management.id).toBe('');
      expect(pillars.management.clientId).toBe('');
      expect(pillars.skills.id).toBe('');
      expect(pillars.procurement.id).toBe('');
      expect(pillars.esd.id).toBe('');
      expect(pillars.sed.id).toBe('');
      expect(pillars.yes.id).toBe('');
    });

    it('employee records have all required fields for store hydration', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Test Company',
      });

      const employees = result.mapped!.pillars.management.employees;
      for (const emp of employees) {
        expect(emp).toHaveProperty('id');
        expect(emp).toHaveProperty('name');
        expect(emp).toHaveProperty('gender');
        expect(emp).toHaveProperty('race');
        expect(emp).toHaveProperty('designation');
        expect(emp).toHaveProperty('isDisabled');
        expect(emp).toHaveProperty('isForeign');
        expect(typeof emp.id).toBe('string');
        expect(typeof emp.name).toBe('string');
      }
    });

    it('supplier records have all required fields for store hydration', () => {
      const entities = mockValidEntities();
      const result = runExtractionPipeline(entities, {
        clientName: 'Test Company',
      });

      const suppliers = result.mapped!.pillars.procurement.suppliers;
      for (const sup of suppliers) {
        expect(sup).toHaveProperty('id');
        expect(sup).toHaveProperty('name');
        expect(sup).toHaveProperty('beeLevel');
        expect(sup).toHaveProperty('enterpriseType');
        expect(sup).toHaveProperty('blackOwnership');
        expect(sup).toHaveProperty('spend');
        expect(sup).toHaveProperty('isEmpoweringSupplier');
      }
    });
  });
});

describe('mapExtractedEntitiesToToolkitInput — Unit Tests', () => {
  it('maps financials correctly from ParseResult', () => {
    const parseResult = buildManualParseResult();
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

    expect(mapped.foundation.financials.totalRevenue).toBe(LAKE_REVENUE);
    expect(mapped.foundation.financials.npat).toBe(LAKE_NPAT);
    expect(mapped.foundation.financials.leviableAmount).toBe(LAKE_LEVIABLE);
    expect(mapped.foundation.financials.tmps).toBe(LAKE_TMPS);
  });

  it('computes deemed NPAT correctly', () => {
    const parseResult = buildManualParseResult();
    parseResult.client.npat = 100;
    parseResult.client.industrySector = 'Retail';
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

    expect(mapped.foundation.financials.isBelowQuarter).toBe(true);
    expect(mapped.foundation.financials.deemedNpatUsed).toBe(true);
    expect(mapped.foundation.financials.deemedNpat).toBe(LAKE_REVENUE * 0.04);
  });

  it('maps shareholders with correct black ownership percentages', () => {
    const parseResult = buildManualParseResult();
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

    expect(mapped.pillars.ownership.shareholders[0].blackOwnership).toBe(1);
    expect(mapped.pillars.ownership.shareholders[0].blackWomenOwnership).toBe(0.5);
  });

  it('maps ESD contributions distinguishing SD from ED by category', () => {
    const parseResult = buildManualParseResult();
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

    const esdContribs = mapped.pillars.esd.contributions;
    expect(esdContribs).toHaveLength(2);

    const sdContrib = esdContribs.find(c => c.category === 'supplier_development');
    const edContrib = esdContribs.find(c => c.category === 'enterprise_development');
    expect(sdContrib).toBeDefined();
    expect(sdContrib!.amount).toBe(250_000);
    expect(edContrib).toBeDefined();
    expect(edContrib!.amount).toBe(160_000);
  });
});

describe('validateMinimumFields — Unit Tests', () => {
  it('passes for complete valid data', () => {
    const parseResult = buildManualParseResult();
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('fails when revenue is zero', () => {
    const parseResult = buildManualParseResult();
    parseResult.client.revenue = 0;
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('revenue'))).toBe(true);
  });

  it('fails when leviable amount is zero', () => {
    const parseResult = buildManualParseResult();
    parseResult.client.leviableAmount = 0;
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('leviable'))).toBe(true);
  });

  it('fails when company name is missing', () => {
    const parseResult = buildManualParseResult();
    parseResult.client.name = '';
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('company name'))).toBe(true);
  });

  it('warns when no shareholders found', () => {
    const parseResult = buildManualParseResult();
    parseResult.shareholders = [];
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.valid).toBe(true);
    expect(validation.warnings.some(w => w.includes('shareholder'))).toBe(true);
  });

  it('warns when TMPS is 0 but suppliers exist', () => {
    const parseResult = buildManualParseResult();
    parseResult.client.tmps = 0;
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);
    const validation = validateMinimumFields(mapped);

    expect(validation.warnings.some(w => w.includes('TMPS'))).toBe(true);
  });
});

describe('Determinism — same input produces identical output', () => {
  it('mapping output is deterministic across runs', () => {
    const parseResult = buildManualParseResult();
    const mapped1 = mapExtractedEntitiesToToolkitInput(parseResult);
    const mapped2 = mapExtractedEntitiesToToolkitInput(parseResult);

    expect(JSON.stringify(mapped1)).toBe(JSON.stringify(mapped2));
  });

  it('ESD/SED contribution dates are stable (not runtime-dependent)', () => {
    const parseResult = buildManualParseResult();
    const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

    for (const c of mapped.pillars.esd.contributions) {
      expect(c.transactionDate).toBe('1970-01-01');
    }
    for (const c of mapped.pillars.sed.contributions) {
      expect(c.transactionDate).toBe('1970-01-01');
    }
  });

  it('full pipeline output is deterministic', () => {
    const entities = mockValidEntities();
    const opts = { clientName: 'Test Co', industrySector: 'Retail' };
    const result1 = runExtractionPipeline(entities, opts);
    const result2 = runExtractionPipeline(entities, opts);

    expect(result1.success).toBe(result2.success);
    expect(result1.scorecard!.scorecard.pillars.totalPoints)
      .toBe(result2.scorecard!.scorecard.pillars.totalPoints);
    expect(result1.scorecard!.scorecard.beeLevel)
      .toBe(result2.scorecard!.scorecard.beeLevel);
  });
});
