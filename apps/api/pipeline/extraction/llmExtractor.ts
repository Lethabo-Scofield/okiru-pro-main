/**
 * LLM-based value extraction using Azure OpenAI gpt-4o.
 *
 * Anti-hallucination controls: structural verification, JSON schema, temperature 0,
 * explicit null instruction, and dual extraction agreement scoring.
 */

import dotenv from 'dotenv';
dotenv.config();

import { isAzureOpenAIConfigured, fastChatCompletion } from './azureOpenAIClient.js';
import { extractPageEntities, normalizeEntityValue, DEFAULT_BBBEE_PATTERNS } from './nerEngine.js';

export interface LLMExtractionRequest {
  entityName: string;
  entityType: string;
  definition: string;
  aliases: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  zones: string[];
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
  pillarCode: string;
  sourceText: string;
  sourcePageId: string;
}

export interface LLMExtractionResult {
  entityName: string;
  extractedValue: string | number | null;
  rawLLMResponse: string;
  confidence: number; // 0-1 scale
  sourcePageId: string;
  structuralVerification: boolean; // value appears in source text
  method: 'llm' | 'rule_based' | 'dual_agree' | 'llm_fallback';
  reasoning?: string;
}

export interface LLMExtractorConfig {
  model?: string;       // default: AZURE_OPENAI_DEPLOYMENT env var or 'gpt-4o'
  temperature?: number; // default 0
  maxTokens?: number;   // default 500
}

const DEFAULT_CONFIG = {
  azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
  temperature: 0,
  maxTokens: 500,
};

// ---------------------------------------------------------------------------
// Pillar code → human-readable name map
// ---------------------------------------------------------------------------
const PILLAR_LABELS: Record<string, string> = {
  clientInfo:        'Client Information',
  ownership:         'Ownership',
  managementControl: 'Management Control',
  skillsDevelopment: 'Skills Development',
  enterpriseSupplierDevelopment: 'Enterprise & Supplier Development',
  socioEconomicDevelopment: 'Socio-Economic Development',
  employmentEquity:  'Employment Equity',
};

// ---------------------------------------------------------------------------
// Semantic format hints per field category
// ---------------------------------------------------------------------------
function buildFormatHint(entityName: string, aliases: string[]): string {
  const n = [entityName, ...aliases].join(' ').toLowerCase();

  if (/\b(registration|reg\b|cipc|ck\s*number)\b/.test(n))
    return 'FORMAT: Must be a South African CIPC registration number — pattern YYYY/NNNNNN/NN (e.g. "2012/123456/07"). Job titles, person names, and text words are NEVER valid.';
  if (/\bvat\b/.test(n))
    return 'FORMAT: Must be a 10-digit SARS VAT number starting with 4, 5, or 6 (e.g. "4012345678"). Text words are NEVER valid.';
  if (/bee\s*level|b-?bbee\s*level/i.test(n))
    return 'FORMAT: Must be a level number 1–8 or "Non-Compliant". Text descriptions are not valid.';

  // ── Company / organisation name ────────────────────────────────────────
  if (/company.*(name|reg)|entity.*name|registered.*name|business.*name|trading.*name|measured.*entity/i.test(n))
    return 'FORMAT: Must be a legal company or organisation name (e.g. "Okiru Trading (Pty) Ltd", "ABC Construction CC"). ' +
           'NEVER a job title (Executive, Director, Manager, CEO, Board, Senior, Junior), ' +
           'race category (Black, African, White, Coloured, Indian), BEE level, or currency value. ' +
           'Look for text ending in (Pty) Ltd, CC, NPC, Inc., SOC Ltd, or similar legal suffixes.';

  // ── Person name ────────────────────────────────────────────────────────
  if (/shareholder.*name|director.*name|employee.*name|learner.*name|person.*name|participant.*name|contact.*name/i.test(n))
    return 'FORMAT: Must be a full person name — first name + surname (e.g. "Sipho Dlamini", "Priya Naidoo"). ' +
           'NEVER a race category (Black, African, White, Coloured, Indian), ' +
           'job title (Executive, Director, Manager, Board, Senior), or BEE level.';

  // ── Supplier / vendor name ─────────────────────────────────────────────
  if (/supplier.*name|vendor.*name|esd.*beneficiary|sed.*beneficiary/i.test(n))
    return 'FORMAT: Must be a company or person name. ' +
           'NEVER a race word, job title, BEE level, or currency amount.';

  // ── Gender ────────────────────────────────────────────────────────────
  if (/\bgender\b|\bsex\b/i.test(n))
    return 'FORMAT: Must be exactly "Male" or "Female". Race categories (Black, African, etc.) are NEVER valid gender values.';

  // ── Race ──────────────────────────────────────────────────────────────
  if (/\brace\b|\bethnicity\b/i.test(n))
    return 'FORMAT: Must be one of: African, Coloured, Indian, White, Black. Person names are NEVER valid race values.';

  return '';
}

/**
 * Build a structured extraction prompt with anti-hallucination controls
 * and full template metadata context.
 */
export function buildExtractionPrompt(req: LLMExtractionRequest): string {
  const aliasesStr   = req.aliases.length    ? req.aliases.join(', ')    : 'none';
  const zonesStr     = req.zones.length      ? req.zones.join(', ')      : 'any';
  const mustStr      = (req.mustHave   ?? []).length ? (req.mustHave   ?? []).join(', ') : '';
  const niceStr      = (req.niceToHave ?? []).length ? (req.niceToHave ?? []).join(', ') : '';
  const excludeStr   = (req.exclude    ?? []).length ? (req.exclude    ?? []).join(', ') : '';
  const positiveStr  = req.positiveExamples.length > 0 ? req.positiveExamples.map(e => `"${e}"`).join(', ') : 'none';
  const negativeStr  = req.negativeExamples.length > 0 ? req.negativeExamples.map(e => `"${e}"`).join(', ') : 'none';
  const pillarLabel  = PILLAR_LABELS[req.pillarCode ?? ''] ?? req.pillarCode ?? 'General';
  const formatHint   = buildFormatHint(req.entityName, req.aliases);

  const lines: string[] = [
    `## B-BBEE Field: ${req.entityName}`,
    `- Pillar: ${pillarLabel}`,
    `- Type: ${req.entityType}`,
    `- Definition: ${req.definition}`,
    `- Also look for these labels in the document: ${aliasesStr}`,
    `- Relevant document sections: ${zonesStr}`,
  ];

  if (mustStr)     lines.push(`- MUST appear near these keywords: ${mustStr}`);
  if (niceStr)     lines.push(`- Likely near these keywords: ${niceStr}`);
  if (excludeStr)  lines.push(`- IGNORE values near these keywords (wrong field): ${excludeStr}`);
  if (positiveStr !== 'none') lines.push(`- Example valid values: ${positiveStr}`);
  if (negativeStr !== 'none') lines.push(`- DO NOT extract these (negative examples): ${negativeStr}`);
  if (formatHint)  lines.push(`- ${formatHint}`);

  // Detect if this is a row-level entity (multiple values expected across spreadsheet rows)
  const isRowLevel = /shareholder|employee|learner|director|participant|supplier|vendor|beneficiary|training|skill/i
    .test([req.entityName, ...req.aliases].join(' '));

  lines.push(
    ``,
    `## Source Text`,
    `\`\`\``,
    req.sourceText,
    `\`\`\``,
    ``,
    `## Task`,
    `Extract the value for "${req.entityName}" from the Source Text above.`,
    ``,
  );

  if (isRowLevel) {
    lines.push(
      `The source data comes from spreadsheet rows. Look for the FIRST valid, non-empty value that matches this field.`,
      `Spreadsheet rows are formatted as "Row N: Column: Value, Column: Value, ...".`,
      `Key-value data is formatted as "Label: Value".`,
      ``,
    );
  }

  lines.push(
    `Return JSON only: {"value": <extracted_value_or_null>, "reasoning": "<one sentence>", "source_quote": "<exact text from document>"}`,
    ``,
    `CRITICAL RULES:`,
    `1. The value MUST appear verbatim in the Source Text — never invent or infer.`,
    `2. If the value is not clearly present, return null.`,
    `3. Do not confuse nearby values — each field has a specific type (see FORMAT above).`,
    `4. Data may be from spreadsheet cells: look for "Label: Value" patterns and column headers.`,
    `5. For numeric fields, extract the raw number (without currency symbols or formatting) if possible.`,
  );

  return lines.join('\n');
}

/**
 * Generate number format variants for matching (e.g. "1,000" → "1000", "1 000").
 */
function numberVariants(val: string | number): string[] {
  const str = String(val).trim();
  const variants: string[] = [str, str.toLowerCase()];
  const noSeparators = str.replace(/[\s,]/g, '');
  if (noSeparators !== str) variants.push(noSeparators);
  return variants;
}

/**
 * Verify that the extracted value appears in the source text (anti-hallucination).
 */
export function structuralVerify(
  extractedValue: string | number | null,
  sourceText: string,
): boolean {
  if (extractedValue === null) return true;
  const strVal = String(extractedValue).trim();
  if (!strVal) return true;

  const sourceLower = sourceText.toLowerCase();
  const sourceNormalized = sourceText.replace(/[\s]+/g, ' ').toLowerCase();

  if (sourceLower.includes(strVal.toLowerCase())) return true;

  const valCollapsed = strVal.replace(/\s+/g, ' ').trim();
  if (sourceNormalized.includes(valCollapsed.toLowerCase())) return true;

  const numMatch = strVal.match(/^-?[\d\s,.]+%?$/);
  if (numMatch) {
    for (const v of numberVariants(extractedValue)) {
      if (sourceLower.includes(v)) return true;
    }
    const sourceNoSep = sourceText.replace(/[\s,]/g, '').toLowerCase();
    const valNoSep = strVal.replace(/[\s,]/g, '').toLowerCase();
    if (sourceNoSep.includes(valNoSep)) return true;
  }

  return false;
}

// Log LLM configuration status on module load
console.log(`[LLMExtractor] Provider: Azure OpenAI — configured:${isAzureOpenAIConfigured()}`);

/**
 * Check if the LLM provider (Azure OpenAI) is available.
 */
export function isAvailable(): boolean {
  return isAzureOpenAIConfigured();
}

/**
 * Check which LLM provider is being used.
 */
export function getPreferredProvider(): 'azure' | 'none' {
  return isAzureOpenAIConfigured() ? 'azure' : 'none';
}

export class LLMExtractor {
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(partial?: LLMExtractorConfig) {
    this.model = partial?.model ?? DEFAULT_CONFIG.azureDeployment;
    this.temperature = partial?.temperature ?? DEFAULT_CONFIG.temperature;
    this.maxTokens = partial?.maxTokens ?? DEFAULT_CONFIG.maxTokens;
  }

  /**
   * Get the provider being used.
   */
  getProvider(): 'azure' | 'none' {
    return isAzureOpenAIConfigured() ? 'azure' : 'none';
  }

  /**
   * Call Azure OpenAI fast tier (GPT-4o-mini) for per-entity extraction.
   */
  private async callLLM(prompt: string): Promise<{ response: string; provider: 'azure' }> {
    const response = await fastChatCompletion(
      [
        {
          role: 'system',
          content: 'You are a precise B-BBEE data extraction assistant. Extract ONLY the requested value from the provided text. If the value is not clearly present, return null. Never guess or infer values. Respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      {
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json_object' },
      }
    );
    return { response, provider: 'azure' };
  }

  ruleBasedExtract(req: LLMExtractionRequest): LLMExtractionResult {
    // Detect field semantic type from entity name / aliases
    const nameAndAliases = [req.entityName, ...req.aliases].join(' ').toLowerCase();

    const isRegistrationField   = /\b(registration|reg\b|cipc|ck\s*number)\b/.test(nameAndAliases);
    const isVatField            = /\bvat\b/.test(nameAndAliases);
    const isGenderField         = /\bgender\b|\bsex\b/.test(nameAndAliases);
    const isRaceField           = /\brace\b|\bethnicity\b/.test(nameAndAliases) && !isGenderField;
    const isDesignationField    = /\bdesignation\b|\boccupational\s*level\b|\bmanagement\s*level\b/.test(nameAndAliases) && !isGenderField && !isRaceField;

    // Company / org name: matches "company name", "entity name", "registered name", "trading name", etc.
    // Must be checked BEFORE isPersonField so the word "name" doesn't bleed into it.
    const isCompanyNameField    = !isRegistrationField && !isVatField && !isGenderField && !isRaceField && !isDesignationField &&
      /company.*(name|reg)|entity.*name|registered.*name|business.*name|trading.*name|measured.*entity/i.test(nameAndAliases);

    // Person name: shareholder, employee, learner, director, participant, contact — but NOT "company name" or plain "name"
    const isPersonNameField     = !isGenderField && !isRaceField && !isDesignationField && !isCompanyNameField &&
      /\b(shareholder|employee|learner|director|participant|person|contact)\b.*\bname\b|\bname\b.*(shareholder|employee|learner|director|participant|person|contact)/.test(nameAndAliases);

    const fieldTypeToNERType: Record<string, string> = {
      currency:   'MONEY',
      percentage: 'PERCENT',
      count:      'FINANCIAL_NUMBER',
      date:       'DATE',
      bee_level:  'BEE_LEVEL',
      string: isRegistrationField ? 'REGISTRATION_NUMBER'
            : isVatField          ? 'VAT_NUMBER'
            : isGenderField       ? 'GENDER'
            : isRaceField         ? 'RACE_GROUP'
            : isDesignationField  ? 'DESIGNATION'
            : 'ORG',    // company names and person names both use ORG as primary NER
    };

    const targetNERType = fieldTypeToNERType[req.entityType] || 'FINANCIAL_NUMBER';
    const nerResult = extractPageEntities(req.sourceText, req.sourcePageId, 'rule', undefined, true);
    const allKeywords = [
      req.entityName.toLowerCase(),
      ...req.aliases.map(a => a.toLowerCase()),
    ];

    let bestMatch: { value: string | number; snippet: string; score: number } | null = null;

    const candidates = nerResult.entities.filter(e => e.entityType === targetNERType);

    for (const candidate of candidates) {
      const contextStart = Math.max(0, candidate.spanStart - 200);
      const contextEnd = Math.min(req.sourceText.length, candidate.spanEnd + 200);
      const context = req.sourceText.slice(contextStart, contextEnd).toLowerCase();

      let score = 0;
      for (const kw of allKeywords) {
        const words = kw.split(/\s+/);
        for (const w of words) {
          if (w.length >= 3 && context.includes(w)) {
            score += 1;
          }
        }
      }

      for (const kw of (req.positiveExamples || [])) {
        if (context.includes(kw.toLowerCase())) {
          score += 2;
        }
      }

      let isExcluded = false;
      for (const neg of (req.negativeExamples || [])) {
        if (candidate.originalText.toLowerCase() === neg.toLowerCase()) {
          isExcluded = true;
          break;
        }
      }
      if (isExcluded) continue;

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        let value: string | number = candidate.normalizedValue;
        if (req.entityType === 'currency' || req.entityType === 'count') {
          const origLower = candidate.originalText.toLowerCase();
          const numStr = value.replace(/[^0-9.\-]/g, '');
          let parsed = parseFloat(numStr);
          if (!isNaN(parsed)) {
            if (/million|m\b/i.test(origLower)) parsed *= 1_000_000;
            else if (/billion|b\b/i.test(origLower)) parsed *= 1_000_000_000;
            else if (/thousand|k\b/i.test(origLower)) parsed *= 1_000;
            value = parsed;
          }
        } else if (req.entityType === 'percentage') {
          const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
          if (!isNaN(parsed)) value = parsed;
        }

        bestMatch = {
          value,
          snippet: req.sourceText.slice(contextStart, contextEnd).trim().substring(0, 200),
          score,
        };
      }
    }

    if (req.entityType === 'string' && !bestMatch) {
      // Strict semantic-type fallback: each field class uses ONLY its own NER type(s).
      // DESIGNATION is NEVER valid for company names or person names — only designation fields.
      const allowedFallbackTypes = isGenderField      ? ['GENDER']
                                 : isRaceField         ? ['RACE_GROUP']
                                 : isDesignationField  ? ['DESIGNATION']
                                 : isCompanyNameField  ? ['ORG']
                                 : isPersonNameField   ? ['ORG']
                                 : ['ORG', 'REGISTRATION_NUMBER', 'VAT_NUMBER'];

      for (const candidate of nerResult.entities) {
        if (allowedFallbackTypes.includes(candidate.entityType)) {
          const contextStart = Math.max(0, candidate.spanStart - 200);
          const contextEnd = Math.min(req.sourceText.length, candidate.spanEnd + 200);
          const context = req.sourceText.slice(contextStart, contextEnd).toLowerCase();

          let score = 0;
          for (const kw of allKeywords) {
            const words = kw.split(/\s+/);
            for (const w of words) {
              if (w.length >= 3 && context.includes(w)) score += 1;
            }
          }

          if (score > 0 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = {
              value: candidate.originalText,
              snippet: req.sourceText.slice(contextStart, contextEnd).trim().substring(0, 200),
              score,
            };
          }
        }
      }
    }

    if (bestMatch) {
      return {
        entityName: req.entityName,
        extractedValue: bestMatch.value,
        rawLLMResponse: `rule_based: matched "${bestMatch.value}" with score ${bestMatch.score}`,
        confidence: Math.min(0.7, 0.3 + bestMatch.score * 0.1),
        sourcePageId: req.sourcePageId,
        structuralVerification: true,
        method: 'rule_based',
        reasoning: `Rule-based extraction matched ${targetNERType} pattern near keywords`,
      };
    }

    return {
      entityName: req.entityName,
      extractedValue: null,
      rawLLMResponse: 'rule_based: no match found',
      confidence: 0.3,
      sourcePageId: req.sourcePageId,
      structuralVerification: true,
      method: 'rule_based',
      reasoning: 'No matching pattern found in source text via rule-based extraction',
    };
  }

  /**
   * Extract a single value using LLM (Azure OpenAI GPT-4o-mini preferred, Groq fallback).
   * Falls back to rule-based extraction if no LLM provider is available.
   */
  async extract(req: LLMExtractionRequest): Promise<LLMExtractionResult> {
    if (!isAvailable()) {
      return this.ruleBasedExtract(req);
    }

    const prompt = buildExtractionPrompt(req);
    let rawLLMResponse: string;
    let provider: string;
    try {
      const result = await this.callLLM(prompt);
      rawLLMResponse = result.response;
      provider = result.provider;
    } catch (llmError: any) {
      console.warn(`[LLMExtractor] LLM call failed for ${req.entityName}, falling back to rule-based: ${llmError.message}`);
      return this.ruleBasedExtract(req);
    }

    let parsed: { value?: unknown; reasoning?: string; source_quote?: string };
    try {
      parsed = JSON.parse(rawLLMResponse) as {
        value?: unknown;
        reasoning?: string;
        source_quote?: string;
      };
    } catch {
      return {
        entityName: req.entityName,
        extractedValue: null,
        rawLLMResponse,
        confidence: 0.1,
        sourcePageId: req.sourcePageId,
        structuralVerification: true,
        method: 'llm',
        reasoning: 'Failed to parse LLM JSON response',
      };
    }

    // Normalise the LLM's returned value.
    // Guard: JSON null, undefined, empty string, and common null-sentinel strings
    // ("null", "Null", "N/A", "none", "not found", etc.) all map to JS null.
    const NULL_SENTINELS = /^(null|n\/a|none|not\s+found|not\s+available|unknown|-)$/i;
    const rawVal = parsed.value;
    const extractedValue: string | number | null =
      rawVal === null || rawVal === undefined || rawVal === ''
        ? null
        : typeof rawVal === 'number'
          ? rawVal
          : NULL_SENTINELS.test(String(rawVal).trim())
            ? null
            : String(rawVal);

    const verified = structuralVerify(extractedValue, req.sourceText);

    let confidence: number;
    if (extractedValue === null) {
      confidence = 0.7;
    } else if (verified) {
      confidence = 0.85;
    } else {
      confidence = 0.2;
    }

    return {
      entityName: req.entityName,
      extractedValue,
      rawLLMResponse,
      confidence,
      sourcePageId: req.sourcePageId,
      structuralVerification: verified,
      method: provider === 'azure' ? 'llm' : 'llm_fallback',
      reasoning: parsed.reasoning,
    };
  }

  /**
   * Extract multiple values concurrently (up to 5 at a time).
   */
  async extractBatch(
    requests: LLMExtractionRequest[],
  ): Promise<LLMExtractionResult[]> {
    const BATCH_SIZE = 5;
    const results: LLMExtractionResult[] = [];
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((r) => this.extract(r)),
      );
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          results.push(s.value);
        } else {
          results.push({
            entityName: 'unknown',
            extractedValue: null,
            rawLLMResponse: '',
            confidence: 0,
            sourcePageId: 'unknown',
            structuralVerification: false,
            method: 'llm',
            reasoning: String(s.reason),
          });
        }
      }
    }
    return results;
  }

  /**
   * Dual extraction: run LLM and compare with a rule-based value for higher confidence.
   * Disagreement is flagged for human review.
   */
  async dualExtract(
    req: LLMExtractionRequest,
    ruleBasedValue: string | number | null,
  ): Promise<LLMExtractionResult> {
    const llmResult = await this.extract(req);
    const llmVal = llmResult.extractedValue;
    const ruleVal = ruleBasedValue;

    const valuesEqual =
      llmVal === ruleVal ||
      (llmVal != null &&
        ruleVal != null &&
        String(llmVal).trim().toLowerCase() === String(ruleVal).trim().toLowerCase());

    const bothNull = llmVal == null && ruleVal == null;

    if (bothNull || valuesEqual) {
      return {
        ...llmResult,
        extractedValue: llmVal ?? ruleVal,
        confidence: 0.95,
        method: 'dual_agree',
      };
    }

    if (llmVal == null && ruleVal != null) {
      return {
        ...llmResult,
        extractedValue: ruleVal,
        confidence: 0.75,
        method: 'rule_based',
      };
    }

    if (llmVal != null && ruleVal == null) {
      return { ...llmResult, method: 'llm_fallback' };
    }

    // Both have values but disagree — flag for review
    return {
      ...llmResult,
      confidence: Math.min(llmResult.confidence, 0.75) * 0.5,
      method: 'llm',
      reasoning: `LLM/rule mismatch: LLM="${llmVal}" rule="${ruleVal}". ${llmResult.reasoning ?? ''}`.trim(),
    };
  }
}

// ---------------------------------------------------------------------------
// Groq Post-Extraction Verification
// ---------------------------------------------------------------------------

export interface GroqVerificationEntry {
  entityName: string;
  definition: string;
  extractedValue: string;
  sourceSnippet: string;
  fieldType?: string;   // currency | percentage | string | count | date | bee_level
  pillar?: string;      // Ownership | Management Control | Skills Development | etc.
}

export interface GroqVerificationResult {
  entityName: string;
  valid: boolean;
  reason: string;
  correctedValue: string | null;
}

// ---------------------------------------------------------------------------
// Semantic type hints — tells Groq EXACTLY what kind of value is expected
// and what values are NEVER valid for this field.
// ---------------------------------------------------------------------------
const RACE_WORDS = 'African, Coloured, Indian, White, Black, Zulu, Xhosa';
const JOB_TITLES = 'Executive, Director, Manager, CEO, CFO, COO, CTO, Board, Senior, Junior, Middle, Managing';
const BEE_LEVELS = 'Level 1, Level 2, … Level 8, Non-Compliant';

function getSemanticHint(entityName: string, fieldType: string, pillar: string): string {
  const n = entityName.toLowerCase();

  // ── Company / entity name ─────────────────────────────────────────────
  if (/company.*(name|reg)|entity.*name|registered.*name|trading.*name|measured.*entity/i.test(n)) {
    return `EXPECTS: Legal company or organisation name (e.g. "Okiru Trading (Pty) Ltd").
INVALID if: job title (${JOB_TITLES}), race word (${RACE_WORDS}), ID number, currency, or any single generic word.`;
  }

  // ── Person names (shareholder, director, employee, learner, beneficiary) ──
  if (/shareholder.*name|director.*name|employee.*name|learner.*name|person.*name|beneficiary/i.test(n)) {
    return `EXPECTS: Full person name — first name + surname (e.g. "Sipho Dlamini").
INVALID if: race category (${RACE_WORDS}), job title/level (${JOB_TITLES}), B-BBEE level (${BEE_LEVELS}), or any single common English word.`;
  }

  // ── Supplier / vendor names ────────────────────────────────────────────
  if (/supplier.*name|vendor.*name|esd.*beneficiary|sed.*beneficiary/i.test(n)) {
    return `EXPECTS: Company or person name (e.g. "ABC Supplies (Pty) Ltd" or "John Mokoena").
INVALID if: race word (${RACE_WORDS}), job title (${JOB_TITLES}), BEE level (${BEE_LEVELS}), or currency amount.`;
  }

  // ── Registration / CIPC number ────────────────────────────────────────
  if (/registration|reg.*num|cipc|ck.*num/i.test(n)) {
    return `EXPECTS: South African CIPC company registration number in format YYYY/NNNNNN/NN (e.g. "2012/123456/07").
INVALID if: any word, person name, job title, race word, or number that does NOT match YYYY/NNNNNN/NN.`;
  }

  // ── VAT number ────────────────────────────────────────────────────────
  if (/\bvat\b.*num|\bvat\b.*reg/i.test(n)) {
    return `EXPECTS: 10-digit SARS VAT registration number starting with 4, 5, or 6 (e.g. "4012345678").
INVALID if: any word, name, job title, or non-matching number.`;
  }

  // ── Race / ethnicity ──────────────────────────────────────────────────
  if (/\brace\b|\bethnicity\b/i.test(n)) {
    return `EXPECTS: Exactly one of: African, Coloured, Indian, White, Black.
INVALID if: person name, job title, or any other word.`;
  }

  // ── Gender ────────────────────────────────────────────────────────────
  if (/\bgender\b|\bsex\b/i.test(n)) {
    return `EXPECTS: "Male" or "Female".
INVALID if: race category, person name, job title, or any other word.`;
  }

  // ── Designation / management level ───────────────────────────────────
  if (/designation|management.*level|occupational.*level/i.test(n)) {
    return `EXPECTS: One of: Board, Executive Management, Senior Management, Middle Management, Junior Management, Semi-skilled, Unskilled.
INVALID if: person name, race word, or currency.`;
  }

  // ── Currency / monetary fields ────────────────────────────────────────
  if (fieldType === 'currency') {
    return `EXPECTS: Monetary amount in South African Rand (e.g. "R 5,400,000" or "R5400000").
INVALID if: text word, person name, race word, or non-monetary number.`;
  }

  // ── Percentage fields ─────────────────────────────────────────────────
  if (fieldType === 'percentage') {
    return `EXPECTS: Percentage value (e.g. "51%" or "51.00%"). INVALID if: text word, name, or non-percentage value.`;
  }

  // ── BEE level ─────────────────────────────────────────────────────────
  if (fieldType === 'bee_level' || /bee.*level|b-?bbee.*level/i.test(n)) {
    return `EXPECTS: B-BBEE level 1–8 or "Non-Compliant". INVALID if: text word, name, currency, or non-level number.`;
  }

  return ''; // no specific hint needed
}

/**
 * Build a compact batch verification prompt with semantic type awareness.
 * Each entry asks Groq: "Is this extracted value correct for this field?"
 */
function buildVerificationPrompt(entries: GroqVerificationEntry[]): string {
  const lines: string[] = [
    'You are verifying B-BBEE document extraction results.',
    'For each entry below, decide if the extracted value is the correct answer for that field.',
    'Return ONLY a JSON array with one object per entry (same order):',
    '[{"valid": true/false, "reason": "<one sentence>", "corrected_value": null_or_string}, ...]',
    '',
    'General rules:',
    '- "valid": true  → extracted value appears in the source context AND is the correct type/format for the field.',
    '- "valid": false → value is the wrong type (e.g. a job title extracted as a company name, or a race word extracted as a person\'s name), does not appear in the context, or violates the field\'s EXPECTS/INVALID constraints listed below.',
    '- "corrected_value": if the correct answer IS clearly visible in the context, provide it verbatim; otherwise null.',
    '- Never invent values. If unsure, set valid: false, corrected_value: null.',
    '',
  ];

  entries.forEach((e, i) => {
    const hint = getSemanticHint(e.entityName, e.fieldType ?? '', e.pillar ?? '');
    lines.push(`--- Entry ${i + 1} ---`);
    lines.push(`Field:      ${e.entityName}`);
    lines.push(`Definition: ${e.definition}`);
    if (hint) lines.push(`Validation: ${hint}`);
    lines.push(`Extracted:  "${e.extractedValue}"`);
    lines.push(`Context:    """${e.sourceSnippet.replace(/\n+/g, ' ').substring(0, 300)}"""`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Send a batch of extracted values to Azure OpenAI fast tier (GPT-4o-mini) for verification.
 * Returns one GroqVerificationResult per entry (or a "could not verify" fallback on error).
 * Fail-safe: any error treats all entries as valid so extraction is never blocked.
 */
export async function groqVerifyBatch(
  entries: GroqVerificationEntry[],
  _unused?: string,
): Promise<GroqVerificationResult[]> {
  if (!isAzureOpenAIConfigured() || entries.length === 0) {
    return entries.map(e => ({
      entityName: e.entityName,
      valid: true,
      reason: 'Verification skipped — Azure OpenAI not configured',
      correctedValue: null,
    }));
  }

  const prompt = buildVerificationPrompt(entries);

  let content: string;
  try {
    content = await fastChatCompletion(
      [
        {
          role: 'system',
          content: 'You are a precise B-BBEE audit verification assistant. Verify extracted values and return only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0, maxTokens: 800 },
    );
  } catch (err: any) {
    console.warn('[LLMVerify] Azure OpenAI error — treating all as valid:', err?.message ?? err);
    return entries.map(e => ({ entityName: e.entityName, valid: true, reason: 'Verification error', correctedValue: null }));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.warn('[LLMVerify] Could not parse JSON response — treating all as valid');
    return entries.map(e => ({ entityName: e.entityName, valid: true, reason: 'Verification parse error', correctedValue: null }));
  }

  // Normalise: Azure may wrap array as {"results": [...]} due to json_object mode
  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const arrKey = Object.keys(obj).find(k => Array.isArray(obj[k]));
    arr = arrKey ? (obj[arrKey] as unknown[]) : [];
  } else {
    arr = [];
  }

  return entries.map((e, i) => {
    const item = arr[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object') {
      return { entityName: e.entityName, valid: true, reason: 'No verification result returned', correctedValue: null };
    }
    return {
      entityName: e.entityName,
      valid: item.valid !== false,
      reason: typeof item.reason === 'string' ? item.reason : '',
      correctedValue: typeof item.corrected_value === 'string' ? item.corrected_value : null,
    };
  });
}
