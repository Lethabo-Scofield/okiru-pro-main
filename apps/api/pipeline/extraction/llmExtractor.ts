/**
 * LLM-based value extraction using Groq llama-3.3-70b-versatile.
 * Matches the same model used by apps/web/server/routes.ts for consistency.
 * Anti-hallucination controls: structural verification, JSON schema, temperature 0,
 * explicit null instruction, and dual extraction agreement scoring.
 */

export interface LLMExtractionRequest {
  entityName: string;
  entityType: string;
  definition: string;
  aliases: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  zones: string[];
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
  apiKey?: string;
  model?: string;       // default llama-3.3-70b-versatile
  temperature?: number; // default 0
  maxTokens?: number;   // default 500
  timeoutMs?: number;   // default 30000
}

const DEFAULT_CONFIG = {
  model: 'llama-3.3-70b-versatile',
  temperature: 0,
  maxTokens: 500,
  timeoutMs: 30000,
};

/**
 * Build a structured extraction prompt with anti-hallucination controls.
 */
export function buildExtractionPrompt(req: LLMExtractionRequest): string {
  const aliasesStr = req.aliases.length ? req.aliases.join(', ') : 'none';
  const positiveStr = req.positiveExamples.length > 0
    ? req.positiveExamples.map((e) => `"${e}"`).join(', ')
    : 'none';
  const negativeStr = req.negativeExamples.length > 0
    ? req.negativeExamples.map((e) => `"${e}"`).join(', ')
    : 'none';
  const zonesStr = req.zones.length ? req.zones.join(', ') : 'any';

  return [
    `## Entity to Extract`,
    `- Name: ${req.entityName}`,
    `- Type: ${req.entityType}`,
    `- Definition: ${req.definition}`,
    `- Aliases (also look for these): ${aliasesStr}`,
    `- Positive examples: ${positiveStr}`,
    `- Negative examples (DO NOT extract these): ${negativeStr}`,
    `- Relevant zones/sections: ${zonesStr}`,
    ``,
    `## Source Text`,
    `\`\`\``,
    req.sourceText,
    `\`\`\``,
    ``,
    `## Instructions`,
    `Extract the value for "${req.entityName}" from the source text above.`,
    ``,
    `Return JSON only: {"value": <extracted_value_or_null>, "reasoning": "<brief_explanation>", "source_quote": "<exact_quote_from_text>"}`,
    ``,
    `CRITICAL: The extracted value MUST appear verbatim in the source text. If you cannot find it exactly, return null. Never guess or infer values.`,
  ].join('\n');
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

/**
 * Check if Groq API key is configured.
 */
export function isAvailable(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export class LLMExtractor {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(partial?: LLMExtractorConfig) {
    this.apiKey = partial?.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.model = partial?.model ?? DEFAULT_CONFIG.model;
    this.temperature = partial?.temperature ?? DEFAULT_CONFIG.temperature;
    this.maxTokens = partial?.maxTokens ?? DEFAULT_CONFIG.maxTokens;
    this.timeoutMs = partial?.timeoutMs ?? DEFAULT_CONFIG.timeoutMs;
  }

  /**
   * Call Groq chat completions API.
   */
  private async callGroq(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not set');
    }

    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const body = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise B-BBEE data extraction assistant. Extract ONLY the requested value from the provided text. If the value is not clearly present, return null. Never guess or infer values. Respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (content == null) {
        throw new Error('Groq API returned empty response');
      }
      return content;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Extract a single value using Groq LLM.
   */
  async extract(req: LLMExtractionRequest): Promise<LLMExtractionResult> {
    const prompt = buildExtractionPrompt(req);
    const rawLLMResponse = await this.callGroq(prompt);

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

    const extractedValue =
      parsed.value === undefined || parsed.value === ''
        ? null
        : (typeof parsed.value === 'number' || typeof parsed.value === 'string'
            ? parsed.value
            : String(parsed.value)) as string | number | null;

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
      method: 'llm',
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
