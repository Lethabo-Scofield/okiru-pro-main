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
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: Classify all sheets using AI
// ────────────────────────────────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are a B-BBEE (Broad-Based Black Economic Empowerment) data analyst.
Given sample content from spreadsheet sheets, classify each sheet into ONE of these categories:

- "employees" — Contains employee/staff data (names, race, gender, job level/designation, disability status). Used for Management Control & Employment Equity scoring.
- "shareholders" — Contains shareholder/ownership data (names, ownership %, share values, voting rights). Used for Ownership scoring.
- "suppliers" — Contains supplier/vendor/procurement data (names, spend amounts, BEE levels, enterprise types). Used for Preferential Procurement scoring.
- "contributions" — Contains ESD (Enterprise & Supplier Development) or SED (Socio-Economic Development) contribution data (beneficiaries, amounts, types).
- "trainingPrograms" — Contains skills/training/learning programme data (learner names, costs, categories, qualifications).
- "ownershipFinancials" — Contains company valuation, outstanding debt, years held — specifically for ownership Net Value calculation.
- "financials" — Contains income statement, revenue, NPAT, payroll, TMPS figures.
- "irrelevant" — Cover pages, instructions, disclaimers, summary dashboards, or data not useful for B-BBEE scoring.

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
    `### Sheet ${i + 1}: "${s.sheetName}"\n\`\`\`\n${s.sampleText.substring(0, 3000)}\n\`\`\``
  ).join('\n\n');

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: `Classify these ${sheetSamples.length} sheets:\n\n${sheetDescriptions}` },
      ],
      { temperature: 0, maxTokens: 2000, responseFormat: { type: 'json_object' } }
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
      type: 'employees',
      namePatterns: [/employee/i, /staff/i, /mc\s*data/i, /management/i, /ee\s*report/i, /personnel/i, /hr\s*data/i, /workforce/i, /headcount/i],
      textPatterns: [/designation|job\s*level|race|gender|disabled|african|coloured|indian|white|board|executive|senior|middle|junior/i],
    },
    {
      type: 'shareholders',
      namePatterns: [/owner/i, /sharehold/i, /equity/i, /voting/i],
      textPatterns: [/black\s*own|voting\s*right|economic\s*interest|shareholder|share\s*value|designated\s*group|new\s*entrant/i],
    },
    {
      type: 'suppliers',
      namePatterns: [/procure/i, /supplier/i, /vendor/i, /spend/i],
      textPatterns: [/bee\s*level|supplier\s*spend|eme|qse|black\s*owned|procurement|recognition|empowering/i],
    },
    {
      type: 'contributions',
      namePatterns: [/esd/i, /sed/i, /enterprise/i, /socio/i, /development/i, /contrib/i],
      textPatterns: [/enterprise\s*development|supplier\s*development|socio.*economic|contribution|beneficiary|benefit\s*factor/i],
    },
    {
      type: 'trainingPrograms',
      namePatterns: [/skill/i, /train/i, /learn/i, /bursary/i, /education/i],
      textPatterns: [/training\s*(cost|spend|programme)|learner|bursary|skills\s*development|leviable|absorb/i],
    },
    {
      type: 'financials',
      namePatterns: [/financ/i, /income/i, /balance/i, /revenue/i, /profit/i, /general\s*info/i],
      textPatterns: [/total\s*revenue|npat|net\s*profit|leviable|payroll|turnover|tmps/i],
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
Map job levels: Directors/Board of Directors → "Board", CEO/MD/CFO/COO/CIO → "Executive", Executive Director → "Executive Director", GM/Executive Management → "Other Executive Management", Senior Manager → "Senior", Manager/Professional → "Middle", Supervisor/Foreman → "Junior", Operator/Clerk → "Semi-skilled", Labourer/Cleaner → "Unskilled", Engineer/Technician/IT → "Skilled Technical"
Return ONLY valid JSON: {"employees": [...]}`,

  shareholders: `Extract ALL shareholders/owners from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "name": string, "blackOwnership": number (percentage 0-100), "blackWomenOwnership": number (percentage 0-100), "shares": number, "shareValue": number (in Rands), "yearsHeld": number, "isDesignatedGroup": boolean, "blackNewEntrant": boolean }
If a percentage is shown as 0.25 (decimal), multiply by 100 to get 25%.
Return ONLY valid JSON: {"shareholders": [...]}`,

  suppliers: `Extract ALL suppliers/vendors from this B-BBEE procurement data. Return a JSON array.
Each object MUST have: { "name": string, "spend": number (annual spend in Rands), "beeLevel": number (1-8, 0 for non-compliant), "blackOwnership": number (0-100), "blackWomenOwnership": number (0-100), "enterpriseType": string (generic/eme/qse), "isDesignatedGroup": boolean, "isBlackOwned51": boolean, "isBlackWomanOwned30": boolean, "isEME": boolean, "isQSE": boolean, "isForeignSupplier": boolean }
Derive: isBlackOwned51 = blackOwnership >= 51, isBlackWomanOwned30 = blackWomenOwnership >= 30, isEME = turnover < R10M, isQSE = turnover R10M-R50M.
Return ONLY valid JSON: {"suppliers": [...]}`,

  contributions: `Extract ALL ESD/SED contributions from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "beneficiary": string, "type": string (grant/loan/guarantee/direct_cost/mentorship/incubation), "amount": number (in Rands), "category": string (sd/ed/sed), "benefitFactor": number (default 1.0) }
Categories: "sd" = Supplier Development, "ed" = Enterprise Development, "sed" = Socio-Economic Development.
Return ONLY valid JSON: {"contributions": [...]}`,

  trainingPrograms: `Extract ALL training/skills programmes from this B-BBEE spreadsheet data. Return a JSON array.
Each object MUST have: { "name": string (programme name), "category": string (A/B/C/D/E — A=Bursaries/Scholarships, B=Internships, C=Learnerships, D=Work-Integrated Learning, E=Other), "cost": number (total cost in Rands), "race": string (African/Coloured/Indian/White), "gender": string (Male/Female), "isDisabled": boolean, "isBursary": boolean }
If category is "A" or text mentions bursary/scholarship, set isBursary=true.
Return ONLY valid JSON: {"trainingPrograms": [...]}`,

  ownershipFinancials: `Extract ownership valuation data from this B-BBEE spreadsheet. Return a JSON object.
Must have: { "companyValue": number (total company/enterprise value in Rands), "outstandingDebt": number (attributable to black shareholders in Rands), "yearsHeld": number (years black ownership has been held) }
Return ONLY valid JSON: {"ownershipFinancials": {...}}`,
};

/**
 * Run AI-powered table extraction on classified sheets.
 * Sends sheet content to LLM with pillar-specific prompts.
 */
export async function extractTablesFromClassifiedSheets(
  classifiedSheets: ClassifiedSheet[],
  maxChunksPerTable: number = 15
): Promise<ExtractedTables> {
  const tables: ExtractedTables = {};

  if (!isLLMAvailable()) {
    console.warn('[aiTableClassifier] LLM unavailable, cannot extract tables');
    return tables;
  }

  // Group sheets by pillar type, prioritizing data-rich sheets (more chunks = more rows)
  const sheetsByType = new Map<PillarTableType, ClassifiedSheet[]>();
  for (const sheet of classifiedSheets) {
    if (sheet.pillarType === 'irrelevant' || sheet.pillarType === 'financials') continue;
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

  // Build samples for classification (first 3 chunks per sheet for better context)
  const sheetSamples: Array<{ sheetName: string; sampleText: string }> = [];
  for (const [sheetName, texts] of sheetChunks.entries()) {
    sheetSamples.push({
      sheetName,
      sampleText: texts.slice(0, 3).join('\n\n'),
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
