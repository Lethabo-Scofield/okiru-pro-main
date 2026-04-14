/**
 * AI Table Classifier — Sheet-Name-Agnostic Table Extraction
 *
 * Instead of matching sheet names against hardcoded patterns like "mc data",
 * "ownership", "procurement", this module:
 *   1. Sends a sample of every sheet to the LLM
 *   2. Asks the LLM to classify which B-BBEE pillar each sheet belongs to
 *   3. Then runs targeted extraction on correctly classified sheets
 *
 * This means the system works regardless of how a company names their sheets.
 */

import { chatCompletion, isAzureOpenAIConfigured as isLLMAvailable } from './azureOpenAIClient.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type PillarTableType =
  | 'employees'
  | 'shareholders'
  | 'suppliers'
  | 'contributions'
  | 'trainingPrograms'
  | 'ownershipFinancials'
  | 'financials'
  | 'irrelevant';

export interface SheetClassification {
  sheetName: string;
  pillarType: PillarTableType;
  confidence: number;
  reason: string;
}

export interface ClassifiedSheet {
  sheetName: string;
  texts: string[];
  pillarType: PillarTableType;
}

export interface ExtractedTables {
  shareholders?: Array<Record<string, any>>;
  employees?: Array<Record<string, any>>;
  suppliers?: Array<Record<string, any>>;
  contributions?: Array<Record<string, any>>;
  trainingPrograms?: Array<Record<string, any>>;
  ownershipFinancials?: Array<Record<string, any>>;
  financials?: Array<Record<string, any>>;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: Classify all sheets using AI
// ────────────────────────────────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are a B-BBEE (Broad-Based Black Economic Empowerment) data analyst specializing in BBBEE toolkits.
Given sample content from spreadsheet sheets, classify each sheet into ONE of these categories:

- "employees" — Contains employee/staff data: individual names with race, gender, job level/designation, disability status. Common sheet names: "MC Scorecard", "MC Data", "Employee Data", "EE Report", "Management Control". Look for columns like Name, Race, Gender, Designation, Disabled.
- "shareholders" — Contains shareholder/ownership data: names with ownership percentages, share values, voting rights, economic interest. Common sheet names: "Ownership Data", "Ownership Calcs", "Empower - Ownership", "Share Register".
- "suppliers" — Contains supplier/vendor/procurement data: supplier names with spend amounts, BEE levels, enterprise types (EME/QSE). Common sheet names: "PP Scorecard", "Procurement", "Supplier Data", "Vendor List".
- "contributions" — Contains ESD/SED contribution data: beneficiaries with amounts, contribution types, categories (SD/ED/SED). Common sheet names: "ESD Scorecard", "SED Report", "SD Scorecard", "ED Scorecard", "Enterprise Development", "Supplier Development", "Socio-Economic Development".
- "trainingPrograms" — Contains skills/training data: learner names with programme details, costs, categories, qualifications, absorption status. Common sheet names: "Skills Scorecard", "Training Data", "Empower Skills", "Employees Training".
- "ownershipFinancials" — Contains company valuation, outstanding debt, years held for ownership Net Value calculation. Often found in "Ownership Calcs", "Ownership Data", or "Empower - Ownership" sheets.
- "financials" — Contains financial figures: revenue/turnover, NPAT, payroll/leviable amount, TMPS, headcount, industry norms. Common sheet names: "Client Information", "Financials", "General Info", "Summary Scorecard", "Industry Norms". IMPORTANT: "Client Information" sheets typically contain the core financial data needed for scoring.
- "irrelevant" — Cover pages, instructions, disclaimers, scenario planning (unless it contains actual data), strategy action items, ROI analysis, or chart-only dashboards.

IMPORTANT RULES:
1. A sheet named "Client Information" or "General Info" is almost always "financials" — it contains revenue, NPAT, headcount, payroll, and industry norm data.
2. A "Summary Scorecard" sheet may contain Actual scores — classify it as "financials" if it has NPAT, revenue, or headcount values.
3. "MC Scorecard" sheets contain individual employee data — classify as "employees".
4. If a sheet contains BOTH ownership data AND financial valuation data, prefer "shareholders" (the ownershipFinancials can be extracted from entities).
5. Sheets with "Empower" prefix may contain various types — read the content carefully.
6. "Ownership Calcs" or "Ownership Data" typically contain shareholder details → "shareholders".

Return valid JSON only: { "classifications": [ { "sheetName": "...", "pillarType": "...", "confidence": 0.0-1.0, "reason": "..." } ] }`;

export async function classifySheets(
  sheetSamples: Array<{ sheetName: string; sampleText: string }>
): Promise<SheetClassification[]> {
  if (!isLLMAvailable() || sheetSamples.length === 0) {
    return sheetSamples.map(s => ({
      sheetName: s.sheetName,
      pillarType: 'irrelevant' as const,
      confidence: 0,
      reason: 'LLM unavailable',
    }));
  }

  const sheetDescriptions = sheetSamples.map((s, i) =>
    `### Sheet ${i + 1}: "${s.sheetName}"\n\`\`\`\n${s.sampleText.substring(0, 4000)}\n\`\`\``
  ).join('\n\n');

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: `Classify these ${sheetSamples.length} sheets:\n\n${sheetDescriptions}` },
      ],
      { temperature: 0, maxTokens: 4000, responseFormat: { type: 'json_object' } }
    );

    const parsed = JSON.parse(response);
    const classifications: SheetClassification[] = parsed.classifications || [];

    // Validate and fill missing
    for (const sample of sheetSamples) {
      if (!classifications.find(c => c.sheetName === sample.sheetName)) {
        classifications.push({
          sheetName: sample.sheetName,
          pillarType: fallbackClassify(sample.sheetName, sample.sampleText),
          confidence: 0.3,
          reason: 'LLM did not classify this sheet, using fallback',
        });
      }
    }

    return classifications;
  } catch (err) {
    console.warn('[aiTableClassifier] LLM classification failed, using fallback:', err);
    return sheetSamples.map(s => ({
      sheetName: s.sheetName,
      pillarType: fallbackClassify(s.sheetName, s.sampleText),
      confidence: 0.3,
      reason: 'LLM failed, using keyword fallback',
    }));
  }
}

/**
 * Keyword-based fallback when LLM is unavailable.
 * More comprehensive than the old hardcoded patterns.
 */
function fallbackClassify(sheetName: string, sampleText: string): PillarTableType {
  const name = sheetName.toLowerCase();
  const text = sampleText.toLowerCase();

  const patterns: Array<{ type: PillarTableType; namePatterns: RegExp[]; textPatterns: RegExp[] }> = [
    {
      type: 'financials',
      namePatterns: [/^client\s*info/i, /^general\s*info/i, /^financ/i, /^income/i, /^balance/i, /^revenue/i, /^profit/i, /industry\s*norm/i],
      textPatterns: [/total\s*revenue|npat|net\s*profit|leviable|payroll|turnover|tmps|total\s*measured\s*procurement|applicable\s*employee\s*headcount/i],
    },
    {
      type: 'employees',
      namePatterns: [/employee/i, /staff/i, /mc\s*scorecard/i, /mc\s*data/i, /management\s*control/i, /ee\s*report/i, /personnel/i, /hr\s*data/i, /workforce/i, /headcount/i],
      textPatterns: [/designation|job\s*level|race|gender|disabled|african|coloured|indian|white|board|executive|senior|middle|junior/i],
    },
    {
      type: 'shareholders',
      namePatterns: [/owner.*data/i, /owner.*calc/i, /sharehold/i, /equity/i, /voting/i, /empower.*owner/i, /share\s*register/i],
      textPatterns: [/black\s*own|voting\s*right|economic\s*interest|shareholder|share\s*value|designated\s*group|new\s*entrant/i],
    },
    {
      type: 'suppliers',
      namePatterns: [/procure/i, /^pp\s/i, /pp\s*scorecard/i, /supplier/i, /vendor/i],
      textPatterns: [/bee\s*level|supplier\s*spend|eme|qse|black\s*owned|procurement|recognition|empowering/i],
    },
    {
      type: 'contributions',
      namePatterns: [/esd/i, /^sed\b/i, /sed\s*report/i, /^sd\s/i, /^ed\s/i, /enterprise\s*dev/i, /supplier\s*dev/i, /socio/i, /contrib/i],
      textPatterns: [/enterprise\s*development|supplier\s*development|socio.*economic|contribution|beneficiary|benefit\s*factor/i],
    },
    {
      type: 'trainingPrograms',
      namePatterns: [/skill/i, /train/i, /learn/i, /bursary/i, /education/i, /empower.*skill/i],
      textPatterns: [/training\s*(cost|spend|programme)|learner|bursary|skills\s*development|leviable|absorb/i],
    },
    {
      type: 'ownershipFinancials',
      namePatterns: [/valuation/i, /net\s*value/i],
      textPatterns: [/company\s*value|outstanding\s*debt|carrying\s*value|net\s*value|years\s*held/i],
    },
  ];

  for (const p of patterns) {
    if (p.namePatterns.some(re => re.test(name))) return p.type;
  }
  for (const p of patterns) {
    if (p.textPatterns.some(re => re.test(text))) return p.type;
  }

  return 'irrelevant';
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Extract tables from classified sheets
// ────────────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPTS: Record<string, string> = {
  employees: `Extract ALL employees/staff members from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "name": string, "race": string (one of: African, Coloured, Indian, White), "gender": string (Male or Female), "designation": string (one of: Board, Executive, Executive Director, Other Executive Management, Senior, Middle, Junior, Semi-skilled, Unskilled, Skilled Technical), "isDisabled": boolean, "isForeign": boolean }

DESIGNATION MAPPING (use exactly these values):
- Directors/Board of Directors/Non-Exec Director/Chairperson → "Board"
- CEO/MD/CFO/COO/CIO/Managing Director → "Executive"
- Executive Director → "Executive Director"
- GM/General Manager/Executive Management → "Other Executive Management"
- Senior Manager/Head of Department/HOD → "Senior"
- Manager/Professional/Specialist/Professionally Qualified → "Middle"
- Supervisor/Foreman/Team Leader/Junior Management → "Junior"
- Operator/Clerk/Admin/Secretary → "Semi-skilled"
- Labourer/Cleaner/General Worker → "Unskilled"
- Engineer/Technician/IT/Artisan → "Skilled Technical"

RACE MAPPING: Black/Black African → "African", Coloured → "Coloured", Indian/Asian → "Indian", White/Caucasian → "White"

IMPORTANT RULES:
1. Extract EVERY individual employee row — each person must be a separate object.
2. If data shows headcount by designation/race/gender (matrix format), expand each cell into individual employee records. E.g., "Board: 1 African Female" → create one employee object.
3. In MC Scorecards, look for "Manual Input" sections, Quarter data, or "Input" rows with employee details.
4. In EE Reports, expand headcount matrices into individual records.
5. Do NOT skip any employee — even if partial data, create an entry with best available info.
Return ONLY valid JSON: {"employees": [...]}`,

  shareholders: `Extract ALL shareholders/owners from this B-BBEE ownership data. Return a JSON array.
Each object MUST have: { "name": string, "blackOwnership": number (0-1 as decimal or 0-100 as percentage — normalize to 0-1 decimal), "blackWomenOwnership": number (0-1 decimal), "shares": number, "shareValue": number (in Rands), "yearsHeld": number, "isDesignatedGroup": boolean, "blackNewEntrant": boolean, "votingRightsPercent": number (0-1 decimal), "economicInterestPercent": number (0-1 decimal) }

IMPORTANT RULES:
1. If percentages shown as whole numbers (e.g. "100%", "50"), normalize to decimals (1.0, 0.5).
2. "isDesignatedGroup" = true ONLY if specifically identified as: black youth (under 35), black disabled person, black military veteran, or black person in rural/underdeveloped area. Regular black shareholders are NOT designated group.
3. "blackNewEntrant" = true if identified as a first-time black equity participant or new entrant.
4. Look for: ownership schedules, share registers, ESOP data, trust structures, flowthrough structures.
5. Extract voting rights and economic interest percentages separately — they may differ from ownership %.
6. For trusts (e.g. "Lake Family Trust"), extract the trust as a single shareholder entity.
7. If "Company Value" or "Outstanding Debt" appears, include it but the main focus is individual shareholder records.
Return ONLY valid JSON: {"shareholders": [...]}`,

  suppliers: `Extract ALL suppliers/vendors from this B-BBEE procurement data. Return a JSON array.
Each object MUST have: { "name": string, "spend": number (annual spend in Rands), "beeLevel": number (1-8, 0 for non-compliant), "blackOwnership": number (0-100 percentage), "blackWomenOwnership": number (0-100 percentage), "enterpriseType": string (generic/eme/qse), "isDesignatedGroup": boolean, "isBlackOwned51": boolean, "isBlackWomanOwned30": boolean, "isEME": boolean, "isQSE": boolean, "isForeignSupplier": boolean }

IMPORTANT RULES:
1. Derive: isBlackOwned51 = blackOwnership >= 51, isBlackWomanOwned30 = blackWomenOwnership >= 30.
2. EME = Exempted Micro Enterprise (turnover < R10M). QSE = Qualifying Small Enterprise (R10M-R50M).
3. If "Recognition Level" column exists, that IS the beeLevel (Level 1 = 1, etc.).
4. In PP Scorecards, supplier data may be in summary format — extract each supplier row.
5. "Imports" or "Foreign suppliers" should have isForeignSupplier = true.
6. If a spend amount appears negative or as a credit, still include it with the actual value.
Return ONLY valid JSON: {"suppliers": [...]}`,

  contributions: `Extract ALL ESD (Enterprise & Supplier Development) and SED (Socio-Economic Development) contributions from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "beneficiary": string, "type": string, "amount": number (in Rands), "category": string (sd/ed/sed), "benefitFactor": number (default 1.0) }

CATEGORY MAPPING:
- "sd" = Supplier Development (contributions to develop existing suppliers)
- "ed" = Enterprise Development (contributions to develop small/new enterprises)
- "sed" = Socio-Economic Development (donations, CSI, community projects)

TYPE VALUES: grant, direct_cost, loan, interest_free_loan, standard_loan, guarantee, mentorship, incubation, professional_services_free, employee_time, equity_investment

IMPORTANT RULES:
1. SD and ED contributions use NPAT-based targets. SED contributions are separate.
2. If the sheet covers multiple categories, classify each contribution correctly.
3. In combined ESD/SED sheets, look for section headers to determine category.
4. Monthly amounts should be annualized (sum all months).
5. "Value Short" or negative values indicate shortfalls — still extract the actual amounts.
Return ONLY valid JSON: {"contributions": [...]}`,

  trainingPrograms: `Extract ALL training/skills development programmes from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "name": string (learner or programme name), "learnerName": string, "category": string (A/B/C/D/E/F), "cost": number (total cost in Rands), "race": string (African/Coloured/Indian/White), "gender": string (Male/Female), "isDisabled": boolean, "isBlack": boolean, "isBursary": boolean, "isAbsorbed": boolean }

CATEGORY CODES: A=Bursaries/Scholarships, B=Internships/Learnerships, C=Short Courses/Workshops, D=Other Accredited Training, E=Non-accredited/Informal, F=External Unaccredited

IMPORTANT RULES:
1. Each learner should be a separate record.
2. isBlack = true if race is African, Coloured, or Indian.
3. isBursary = true if category is "A" or text mentions bursary/scholarship.
4. isAbsorbed = true if the learner was subsequently employed.
5. Include monthly stipend and course cost in the total cost.
6. In Skills Scorecards, look for "Actual" values and individual learner rows.
Return ONLY valid JSON: {"trainingPrograms": [...]}`,

  ownershipFinancials: `Extract ownership valuation data from this B-BBEE spreadsheet. Return a JSON object.
Must have: { "companyValue": number (total company/enterprise value in Rands), "outstandingDebt": number (BEE-attributable debt in Rands), "yearsHeld": number (years black ownership has been held) }
Look for: "Company Value to use", "Outstanding Debts", "Years Held", "Transaction Age", "Ownership Calcs" sections.
Return ONLY valid JSON: {"ownershipFinancials": {...}}`,

  financials: `Extract financial data from this B-BBEE spreadsheet. Return a JSON object with all available fields.
Must have: { "revenue": number (total annual revenue/turnover in Rands), "npat": number (Net Profit After Tax in Rands), "leviableAmount": number (total payroll/leviable amount in Rands), "tmps": number (Total Measured Procurement Spend in Rands), "headcount": number (total employee headcount), "deemedNpat": number (deemed NPAT if applicable, 0 if not), "industryNormPercent": number (industry norm percentage if shown, 0 if not), "companyValue": number (company value if shown, 0 if not), "outstandingDebt": number (outstanding BEE debt if shown, 0 if not), "yearsHeld": number (ownership years held if shown, 0 if not) }

IMPORTANT RULES:
1. Revenue is often labeled "Total Revenue", "Turnover", "Annual Turnover", or "Sales Revenue".
2. NPAT is "Net Profit After Tax" — NOT "NPAT Margin" (which is a percentage). Extract the Rand amount.
3. Leviable Amount may be labeled "Total Payroll", "Leviable Payroll", "Total Remuneration", or "Staff Costs".
4. TMPS is "Total Measured Procurement Spend" or "TMPS Inclusions".
5. Headcount is "Total Employees", "Applicable Employee Headcount", or "Number of Employees".
6. In "Client Information" sheets, these values are typically in key-value pair format (label: value).
7. If "Deemed NPAT" appears, extract it separately from regular NPAT.
8. Set fields to 0 if not found — do NOT guess or invent values.
Return ONLY valid JSON: {"financials": {...}}`,
};

/**
 * Run AI-powered table extraction on classified sheets.
 * Sends sheet content to LLM with pillar-specific prompts.
 */
export async function extractTablesFromClassifiedSheets(
  classifiedSheets: ClassifiedSheet[],
  maxChunksPerTable: number = 25
): Promise<ExtractedTables> {
  const tables: ExtractedTables = {};

  if (!isLLMAvailable()) {
    console.warn('[aiTableClassifier] LLM unavailable, cannot extract tables');
    return tables;
  }

  // Group sheets by pillar type, prioritizing data-rich sheets (more chunks = more rows)
  const sheetsByType = new Map<PillarTableType, ClassifiedSheet[]>();
  for (const sheet of classifiedSheets) {
    if (sheet.pillarType === 'irrelevant') continue;
    const existing = sheetsByType.get(sheet.pillarType) || [];
    existing.push(sheet);
    sheetsByType.set(sheet.pillarType, existing);
  }

  const byType = new Map<PillarTableType, string[]>();
  for (const [pillarType, sheets] of sheetsByType.entries()) {
    // Sort sheets by content volume — sheets with more chunks (more rows) come first
    sheets.sort((a, b) => b.texts.length - a.texts.length);
    const texts: string[] = [];
    for (const sheet of sheets) {
      texts.push(...sheet.texts.slice(0, maxChunksPerTable));
    }
    byType.set(pillarType, texts);
  }

  const extractionPromises = Array.from(byType.entries()).map(
    async ([pillarType, texts]) => {
      const prompt = EXTRACTION_PROMPTS[pillarType];
      if (!prompt) return;

      const combinedText = texts.join('\n\n---\n\n');
      if (combinedText.length < 50) return;

      try {
        const response = await chatCompletion(
          [
            {
              role: 'system',
              content: 'You are a B-BBEE data extraction assistant. Extract structured data from spreadsheet content. Return valid JSON only. Never invent data — only extract what is clearly present in the source data. If no data is found, return an empty array.',
            },
            {
              role: 'user',
              content: `${prompt}\n\n## Spreadsheet Data:\n\`\`\`\n${combinedText.substring(0, 40000)}\n\`\`\``,
            },
          ],
          { temperature: 0, maxTokens: 16000, responseFormat: { type: 'json_object' } }
        );

        const parsed = JSON.parse(response);
        const key = pillarType as keyof ExtractedTables;

        if (key === 'ownershipFinancials') {
          const data = parsed.ownershipFinancials || parsed;
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            (tables as any)[key] = [data];
          } else if (Array.isArray(data)) {
            (tables as any)[key] = data;
          }
        } else {
          const arr = parsed[key] || parsed.results || parsed.data || (Array.isArray(parsed) ? parsed : []);
          if (Array.isArray(arr) && arr.length > 0) {
            (tables as any)[key] = arr;
          }
        }

        console.log(`[aiTableClassifier] Extracted ${key}: ${(tables as any)[key]?.length || 0} rows (from ${texts.length} chunks, ${combinedText.length} chars)`);
      } catch (err) {
        console.warn(`[aiTableClassifier] Table extraction failed for ${pillarType}:`, err);
      }
    }
  );

  await Promise.all(extractionPromises);
  return tables;
}

// ────────────────────────────────────────────────────────────────────────────
// Unified entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Smart table extraction pipeline:
 * 1. Takes all sheet chunks grouped by sheet name
 * 2. Classifies each sheet using AI
 * 3. Extracts structured tables from relevant sheets
 */
export async function smartExtractTables(
  sheetChunks: Map<string, string[]>
): Promise<{ tables: ExtractedTables; classifications: SheetClassification[] }> {
  console.log(`[aiTableClassifier] Starting smart classification for ${sheetChunks.size} sheets`);

  const sheetSamples: Array<{ sheetName: string; sampleText: string }> = [];
  for (const [sheetName, texts] of sheetChunks.entries()) {
    const first3 = texts.slice(0, 3);
    const mid = texts.length > 6 ? [texts[Math.floor(texts.length / 2)]] : [];
    const sampleChunks = [...first3, ...mid];
    sheetSamples.push({
      sheetName,
      sampleText: sampleChunks.join('\n\n'),
    });
  }

  // Step 1: Classify
  const classifications = await classifySheets(sheetSamples);

  console.log('[aiTableClassifier] Classifications:');
  for (const c of classifications) {
    console.log(`  ${c.sheetName} → ${c.pillarType} (${(c.confidence * 100).toFixed(0)}%) — ${c.reason}`);
  }

  // Step 2: Build classified sheets with full text
  const classifiedSheets: ClassifiedSheet[] = classifications
    .filter(c => c.pillarType !== 'irrelevant')
    .map(c => ({
      sheetName: c.sheetName,
      texts: sheetChunks.get(c.sheetName) || [],
      pillarType: c.pillarType,
    }));

  // Step 3: Extract tables
  const tables = await extractTablesFromClassifiedSheets(classifiedSheets);

  return { tables, classifications };
}
