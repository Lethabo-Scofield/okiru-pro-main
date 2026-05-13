/**
 * Excel-extraction LLM reconciliation pass.
 *
 * Stage 2 of the toolkit-Excel import pipeline:
 *   1. Rule-based parser produces a `PipelineResult` from `excelParser.ts`.
 *   2. We give the LLM the rule-based result + compact per-sheet snippets
 *      (headers + first N rows) and ask it to identify any obvious mistakes
 *      or missing fields (e.g. "Registration Number" appears in the sheet
 *      but the parser didn't pick it up).
 *   3. The LLM returns *only the corrections it is confident about*.
 *      We merge those over the rule-based result.
 *
 * If Azure OpenAI is not configured (or the LLM fails), we return the
 * rule-based result unchanged and set `reconciliationApplied: false`.
 */
import { createLogger } from '../logger.js';
import {
  fastChatCompletion,
  isAzureOpenAIConfigured,
} from '../../pipeline/extraction/azureOpenAIClient.js';
import type { PipelineResult } from '../../pipeline/types.js';
import type { SheetSnippet } from '../../pipeline/excelParser.js';

const logger = createLogger('ExtractionReconciler');

const SYSTEM_PROMPT = `You are an expert at reading South African B-BBEE toolkit workbooks.

You receive (a) a rule-based extraction of a B-BBEE workbook (JSON) and (b) per-sheet samples (headers + first rows). Your job is to spot fields the rule-based parser missed or got wrong, and return ONLY the corrections you are highly confident about.

Important rules:
- Return ONLY a JSON object with the keys listed in the schema below — no markdown, no commentary.
- If a field looks correct already, OMIT it from your response. Do not echo unchanged values.
- Only correct a field if you have direct textual evidence in the sheet samples.
- All percentages are 0–100 (NOT fractions).
- Dates: return YYYY-MM-DD strings.
- VAT numbers: return digits only, exactly 10 digits.
- Registration numbers: keep the exact format as it appears (e.g. "2020/123456/07", "1998/004562/06", "CK 2005/12345/23").
- Sector code MUST be one of: RCOGP, ICT, FSC, AGRI, TRANSPORT, CONSTRUCTION, TOURISM, MINING, PROPERTY, CAS, FORESTRY, MAC.
- Applicable scorecard MUST be one of: EME, QSE, Generic.
- Province MUST be one of: National, Gauteng, Western Cape, Eastern Cape, KZN, Free State, Limpopo, Mpumalanga, North West, Northern Cape.

JSON schema for your response (every field is optional — only include fields you want to correct):

{
  "client": {
    "name": string,
    "tradeName": string,
    "address": string,
    "postalAddress": string,
    "registrationNumber": string,
    "vatNumber": string,
    "taxNumber": string,
    "financialYearEnd": string,
    "measurementPeriodStart": string,
    "measurementPeriodEnd": string,
    "industrySector": string,
    "sectorCode": string,
    "applicableScorecard": string,
    "eapProvince": string,
    "numberOfEmployees": number,
    "contactPerson": string,
    "contactEmail": string,
    "contactPhone": string,
    "certificateNumber": string,
    "certificateExpiry": string,
    "certificateLevel": number,
    "verificationAgency": string
  },
  "financials": {
    "revenue": number,
    "npat": number,
    "leviableAmount": number,
    "payroll": number,
    "tmps": number,
    "tmpsInclusions": number,
    "tmpsExclusions": number
  },
  "notes": [string]   // 1–5 short notes about what you changed (or why nothing)
}`;

interface LLMReconciliationPatch {
  client?: Partial<{
    name: unknown;
    tradeName: unknown;
    address: unknown;
    postalAddress: unknown;
    registrationNumber: unknown;
    vatNumber: unknown;
    taxNumber: unknown;
    financialYearEnd: unknown;
    measurementPeriodStart: unknown;
    measurementPeriodEnd: unknown;
    industrySector: unknown;
    sectorCode: unknown;
    applicableScorecard: unknown;
    eapProvince: unknown;
    numberOfEmployees: unknown;
    contactPerson: unknown;
    contactEmail: unknown;
    contactPhone: unknown;
    certificateNumber: unknown;
    certificateExpiry: unknown;
    certificateLevel: unknown;
    verificationAgency: unknown;
  }>;
  financials?: Partial<{
    revenue: unknown;
    npat: unknown;
    leviableAmount: unknown;
    payroll: unknown;
    tmps: unknown;
    tmpsInclusions: unknown;
    tmpsExclusions: unknown;
  }>;
  notes?: unknown;
}

function asString(v: unknown, maxLen = 200): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function asPositiveNumber(v: unknown, max = 1e12): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

function asIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  if (y < 1990 || y > 2100) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function asVatNumber(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('4')) return digits;
  if (digits.length === 10) return digits;
  return undefined;
}

const SECTOR_CODES = ['RCOGP', 'ICT', 'FSC', 'AGRI', 'TRANSPORT', 'CONSTRUCTION', 'TOURISM', 'MINING', 'PROPERTY', 'CAS', 'FORESTRY', 'MAC'];
const SCORECARD_TYPES = ['EME', 'QSE', 'Generic'];
const PROVINCES = ['National', 'Gauteng', 'Western Cape', 'Eastern Cape', 'KZN', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'];

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = asString(v);
  if (!s) return undefined;
  const match = allowed.find((opt) => opt.toLowerCase() === s.toLowerCase());
  return match;
}

function asLevel(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n < 1 || n > 8) return undefined;
  return Math.round(n);
}

/**
 * Build a compact LLM prompt body from the rule-based result + sheet snippets.
 * The model's job is to find corrections, so we want to keep the payload
 * well under context budgets.
 */
function buildPrompt(result: PipelineResult, snippets: SheetSnippet[]): string {
  const rb = {
    client: {
      name: result.client.name || null,
      registrationNumber: result.client.registrationNumber || null,
      vatNumber: result.client.vatNumber || null,
      taxNumber: result.client.taxNumber || null,
      address: result.client.address || null,
      postalAddress: result.client.postalAddress || null,
      financialYearEnd: result.client.financialYearEnd || null,
      industrySector: result.client.industrySector || null,
      sectorCode: result.client.sectorCode || null,
      applicableScorecard: result.client.applicableScorecard || null,
      eapProvince: result.client.eapProvince || null,
      numberOfEmployees: result.client.numberOfEmployees ?? null,
      contactPerson: result.client.contactPerson || null,
      contactEmail: result.client.contactEmail || null,
      contactPhone: result.client.contactPhone || null,
      certificateNumber: result.client.certificateNumber || null,
      certificateExpiry: result.client.certificateExpiry || null,
      certificateLevel: result.client.certificateLevel ?? null,
      verificationAgency: result.client.verificationAgency || null,
    },
    financials: {
      revenue: result.financials.revenue || null,
      npat: result.financials.npat || null,
      leviableAmount: result.financials.leviableAmount || null,
      payroll: result.financials.payroll || null,
      tmps: result.financials.tmps || null,
      tmpsInclusions: result.financials.tmpsInclusions || null,
      tmpsExclusions: result.financials.tmpsExclusions || null,
    },
  };

  // Snippets — soft-cap to ~12 sheets and budget by row count.
  const sheetsForLLM = snippets.slice(0, 12).map((s) => ({
    sheet: s.sheetName,
    matched_to: s.matchedTo,
    headers: s.headers.slice(0, 20),
    rows: s.rows.slice(0, 8).map((r) => r.slice(0, 20)),
  }));

  return JSON.stringify(
    {
      rule_based_extraction: rb,
      sheet_samples: sheetsForLLM,
    },
    null,
    0,
  );
}

export interface ReconcileResult {
  result: PipelineResult;
  reconciliationApplied: boolean;
  reconciliationNotes: string[];
}

/**
 * Run the LLM reconciliation pass. Always returns a `PipelineResult`;
 * if Azure OpenAI is unavailable or the call fails, the input is returned
 * with `reconciliationApplied = false`.
 */
export async function reconcileExtraction(
  result: PipelineResult,
  snippets: SheetSnippet[],
): Promise<ReconcileResult> {
  if (!isAzureOpenAIConfigured()) {
    logger.debug('Azure OpenAI not configured — skipping reconciliation');
    return {
      result,
      reconciliationApplied: false,
      reconciliationNotes: ['Azure OpenAI not configured — LLM reconciliation skipped.'],
    };
  }
  if (!snippets || snippets.length === 0) {
    return { result, reconciliationApplied: false, reconciliationNotes: [] };
  }

  let raw: string;
  try {
    raw = await fastChatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(result, snippets) },
      ],
      {
        temperature: 0,
        maxTokens: 1500,
        responseFormat: { type: 'json_object' },
      },
    );
  } catch (err: any) {
    logger.warn('LLM reconciliation call failed — returning rule-based result', {
      error: err?.message,
    });
    return {
      result,
      reconciliationApplied: false,
      reconciliationNotes: [`LLM call failed (${err?.message ?? 'unknown'}) — rule-based result kept.`],
    };
  }

  let patch: LLMReconciliationPatch;
  try {
    patch = JSON.parse(raw);
  } catch {
    logger.warn('LLM returned non-JSON — keeping rule-based result', { rawPreview: raw.slice(0, 120) });
    return {
      result,
      reconciliationApplied: false,
      reconciliationNotes: ['LLM returned non-JSON — rule-based result kept.'],
    };
  }

  const notes: string[] = [];
  if (Array.isArray(patch.notes)) {
    for (const n of patch.notes) {
      const s = asString(n, 200);
      if (s) notes.push(s);
    }
  }

  const merged: PipelineResult = {
    ...result,
    client: { ...result.client },
    financials: { ...result.financials },
  };
  const changes: string[] = [];

  const clientPatch = patch.client ?? {};
  const apply = <K extends keyof PipelineResult['client']>(
    key: K,
    val: PipelineResult['client'][K] | undefined,
    isImportant: boolean,
  ) => {
    if (val === undefined) return;
    const current = merged.client[key];
    if (current && !isImportant) return; // only override when missing for low-priority fields
    if (current === val) return;
    merged.client[key] = val;
    changes.push(`client.${String(key)} ← LLM`);
  };

  apply('name', asString(clientPatch.name, 200) as any, false);
  apply('tradeName', asString(clientPatch.tradeName, 200) as any, false);
  apply('address', asString(clientPatch.address, 300) as any, false);
  apply('postalAddress', asString(clientPatch.postalAddress, 300) as any, false);
  apply(
    'registrationNumber',
    (() => {
      const s = asString(clientPatch.registrationNumber, 40);
      if (!s) return undefined;
      // require at least one digit
      return /\d/.test(s) ? s : undefined;
    })() as any,
    true, // important — registration number is high-value
  );
  apply('vatNumber', asVatNumber(clientPatch.vatNumber) as any, true);
  apply('taxNumber', asString(clientPatch.taxNumber, 40) as any, true);
  apply('financialYearEnd', asIsoDate(clientPatch.financialYearEnd) as any, false);
  apply('measurementPeriodStart', asIsoDate(clientPatch.measurementPeriodStart) as any, false);
  apply('measurementPeriodEnd', asIsoDate(clientPatch.measurementPeriodEnd) as any, false);
  apply('industrySector', asString(clientPatch.industrySector, 80) as any, false);
  apply('sectorCode', asEnum(clientPatch.sectorCode, SECTOR_CODES) as any, false);
  apply('applicableScorecard', asEnum(clientPatch.applicableScorecard, SCORECARD_TYPES) as any, false);
  apply('eapProvince', asEnum(clientPatch.eapProvince, PROVINCES) as any, false);
  apply('numberOfEmployees', asPositiveNumber(clientPatch.numberOfEmployees, 1_000_000) as any, false);
  apply('contactPerson', asString(clientPatch.contactPerson, 100) as any, false);
  apply('contactEmail', (() => {
    const s = asString(clientPatch.contactEmail, 200);
    return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined;
  })() as any, false);
  apply('contactPhone', asString(clientPatch.contactPhone, 40) as any, false);
  apply('certificateNumber', asString(clientPatch.certificateNumber, 80) as any, false);
  apply('certificateExpiry', asIsoDate(clientPatch.certificateExpiry) as any, false);
  apply('certificateLevel', asLevel(clientPatch.certificateLevel) as any, false);
  apply('verificationAgency', asString(clientPatch.verificationAgency, 120) as any, false);

  const finPatch = patch.financials ?? {};
  const applyFin = <K extends keyof PipelineResult['financials']>(key: K, val: number | undefined) => {
    if (val === undefined) return;
    if (merged.financials[key] && (merged.financials[key] as number) > 0) return; // never overwrite a non-zero number
    (merged.financials[key] as any) = val;
    changes.push(`financials.${String(key)} ← LLM`);
  };
  applyFin('revenue', asPositiveNumber(finPatch.revenue, 1e15));
  applyFin('npat', asPositiveNumber(finPatch.npat, 1e15));
  applyFin('leviableAmount', asPositiveNumber(finPatch.leviableAmount, 1e15));
  applyFin('payroll', asPositiveNumber(finPatch.payroll, 1e15));
  applyFin('tmps', asPositiveNumber(finPatch.tmps, 1e15));
  applyFin('tmpsInclusions', asPositiveNumber(finPatch.tmpsInclusions, 1e15));
  applyFin('tmpsExclusions', asPositiveNumber(finPatch.tmpsExclusions, 1e15));

  const reconciliationApplied = changes.length > 0;
  const reconciliationNotes = [
    ...notes,
    ...(reconciliationApplied ? [`Applied ${changes.length} field correction(s): ${changes.join(', ')}`] : []),
  ];

  if (reconciliationApplied) {
    logger.info('Reconciliation applied', { changes });
  }

  return { result: merged, reconciliationApplied, reconciliationNotes };
}
