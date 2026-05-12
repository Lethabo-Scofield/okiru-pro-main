/**
 * LLM Certificate Extractor
 *
 * Stage 2 of the certificate extraction pipeline.
 * Uses GPT-4o-mini via Azure OpenAI to extract structured data from B-BBEE certificate text.
 * Falls back to the regex-based extractCertificateData() when Azure OpenAI is not configured
 * or the LLM call fails.
 */

import { createLogger } from '../logger.js';
import { extractCertificateData, type ExtractedCertificateData } from './certificateExtractor.js';
import {
  getAzureFastChatClient,
  isAzureOpenAIConfigured,
} from '../../pipeline/extraction/azureOpenAIClient.js';

const logger = createLogger('LLMExtractor');

/** Raw JSON shape returned by the LLM. */
interface LLMExtractionOutput {
  supplierName: unknown;
  vatNumber: unknown;
  companySize: unknown;
  bbbeeLevel: unknown;
  bbbeeScore: unknown;
  blackOwnership: unknown;
  blackWomenOwnership: unknown;
  verificationAgency: unknown;
  certificateNumber: unknown;
  issueDate: unknown;
  expiryDate: unknown;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured data from South African B-BBEE (Broad-Based Black Economic Empowerment) certificates.

Extract the following fields from the certificate text provided. Return ONLY a valid JSON object with exactly these fields:

- supplierName: The exact registered company name as it appears on the certificate
- vatNumber: 10-digit South African VAT registration number (digits only, no spaces/dashes)
- companySize: One of "EME", "QSE", "Generic Enterprise", or "Large Enterprise" — null if not found
- bbbeeLevel: Integer 1–8 representing the B-BBEE contributor level — null if not found
- bbbeeScore: Numeric overall B-BBEE score (e.g. 95.76) — null if not found
- blackOwnership: Percentage 0–100 of black ownership — null if not found
- blackWomenOwnership: Percentage 0–100 of black women ownership — null if not found
- verificationAgency: Full name of the SANAS-accredited verification agency that issued the certificate
- certificateNumber: The certificate reference number (e.g. "VER/2024/001234")
- issueDate: Date certificate was issued in ISO format YYYY-MM-DD — null if not found
- expiryDate: Date certificate expires in ISO format YYYY-MM-DD — null if not found

South African B-BBEE certificate patterns to recognise:
- "BBBEE Status Level Contributor: 1" or "Level 2 B-BBEE Contributor"
- "VAT Registration No: 4890123456" or "VAT No: 4890123456"
- "Black Ownership: 51.00%" or "Black Economic Interest: 75%"
- "Black Women Ownership: 26.00%"
- "Qualifying Small Enterprise (QSE)" or "Exempted Micro Enterprise (EME)"
- "Valid until: 31 December 2025" or "Expiry Date: 2025-12-31"
- "Certificate No: VER/2024/001234"
- "Issued by: [Agency Name] Verification (Pty) Ltd"

Rules:
- Return null for any field you cannot determine with confidence
- vatNumber: return only the 10 digits, strip spaces and dashes
- Percentages: return as a number (e.g. 51.0, not "51%")
- Dates: convert to YYYY-MM-DD ISO format
- Return ONLY the JSON object — no explanation, no markdown fencing`;

/**
 * Extract certificate fields using GPT-4o-mini.
 * Falls back to regex extractor if Azure OpenAI is not configured or the call fails.
 */
export async function extractCertificateWithLLM(
  text: string,
  fileName: string,
): Promise<ExtractedCertificateData> {
  if (!isAzureOpenAIConfigured()) {
    logger.debug('Azure OpenAI not configured — using regex extractor', { fileName });
    return extractCertificateData(text, fileName);
  }

  if (!text.trim()) {
    logger.warn('Empty text passed to LLM extractor — using regex extractor', { fileName });
    return extractCertificateData(text, fileName);
  }

  try {
    const llmRaw = await callLLM(text, fileName);
    const result = validateAndMerge(llmRaw, text, fileName);
    logger.info('LLM extraction succeeded', {
      fileName,
      supplierName: result.supplierName,
      vatNumber: result.vatNumber,
      bbbeeLevel: result.bbbeeLevel,
      companySize: result.companySize,
    });
    return result;
  } catch (err: any) {
    logger.warn('LLM extraction failed — falling back to regex extractor', {
      fileName,
      error: err.message,
    });
    return extractCertificateData(text, fileName);
  }
}

async function callLLM(text: string, fileName: string): Promise<LLMExtractionOutput> {
  const client = getAzureFastChatClient();
  if (!client) throw new Error('Azure OpenAI fast client unavailable');

  // Keep well within GPT-4o-mini context limits (~12 k chars ≈ 3 k tokens)
  const truncated =
    text.length > 12_000 ? text.slice(0, 12_000) + '\n…[truncated]' : text;

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract B-BBEE certificate data from this document (filename: ${fileName}):\n\n${truncated}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(raw) as LLMExtractionOutput;
  } catch {
    throw new Error(`LLM returned non-JSON: ${raw.slice(0, 120)}`);
  }
}

/**
 * Validate each LLM field, apply range/type checks, and merge with regex fallback
 * values for any field the LLM left null.
 */
function validateAndMerge(
  llm: LLMExtractionOutput,
  rawText: string,
  fileName: string,
): ExtractedCertificateData {
  const regex = extractCertificateData(rawText, fileName);

  function parseIsoDate(s: unknown): Date | null {
    if (typeof s !== 'string' || !s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const yr = d.getFullYear();
    if (yr < 2010 || yr > 2040) return null;
    return d;
  }

  function validatePct(v: unknown): number | null {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return Math.round(n * 100) / 100;
  }

  function validateLevel(v: unknown): number | null {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1 || n > 8) return null;
    return n;
  }

  function validateScore(v: unknown): number | null {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n) || n < 0 || n > 130) return null;
    return n;
  }

  function validateVat(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const digits = v.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 12) return null;
    return digits;
  }

  function validateStr(v: unknown): string | null {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  }

  const VALID_SIZES = ['EME', 'QSE', 'Generic Enterprise', 'Large Enterprise'] as const;
  type CompanySize = (typeof VALID_SIZES)[number];

  const llmSize = validateStr(llm.companySize);
  const companySize: CompanySize | null =
    llmSize && (VALID_SIZES as readonly string[]).includes(llmSize)
      ? (llmSize as CompanySize)
      : null;

  return {
    supplierName: validateStr(llm.supplierName) ?? regex.supplierName,
    vatNumber: validateVat(llm.vatNumber) ?? regex.vatNumber,
    companySize: companySize ?? regex.companySize,
    bbbeeLevel: validateLevel(llm.bbbeeLevel) ?? regex.bbbeeLevel,
    bbbeeScore: validateScore(llm.bbbeeScore) ?? regex.bbbeeScore,
    blackOwnership: validatePct(llm.blackOwnership) ?? regex.blackOwnership,
    blackWomenOwnership: validatePct(llm.blackWomenOwnership) ?? regex.blackWomenOwnership,
    verificationAgency: validateStr(llm.verificationAgency) ?? regex.verificationAgency,
    certificateNumber:
      validateStr(llm.certificateNumber)?.toUpperCase() ?? regex.certificateNumber,
    expiryDate: parseIsoDate(llm.expiryDate) ?? regex.expiryDate,
    issueDate: parseIsoDate(llm.issueDate) ?? regex.issueDate,
  };
}
