/**
 * LLM-based value extraction layer with anti-hallucination controls.
 * Uses raw fetch to OpenAI API (no openai npm package).
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
  apiKey: string;
  baseUrl: string; // default https://api.openai.com/v1
  model: string; // default gpt-4o-mini
  temperature: number; // default 0
  maxTokens: number; // default 500
  timeoutMs: number; // default 30000
}

const DEFAULT_CONFIG: Required<LLMExtractorConfig> = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0,
  maxTokens: 500,
  timeoutMs: 30000,
};

/**
 * Build a structured extraction prompt with anti-hallucination controls.
 */
export function buildExtractionPrompt(req: LLMExtractionRequest): string {
  const aliasesStr = req.aliases.length ? req.aliases.join(', ') : 'none';
  const positiveStr =
    req.positiveExamples.length > 0
      ? req.positiveExamples.map((e) => `"${e}"`).join(', ')
      : 'none';
  const negativeStr =
    req.negativeExamples.length > 0
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
    `- Negative examples: ${negativeStr}`,
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
    `CRITICAL: The extracted value MUST appear verbatim in the source text. If you cannot find it exactly, return null.`,
  ].join('\n');
}

/**
 * Generate number format variants for matching (e.g. "1,000" -> "1000", "1 000").
 */
function numberVariants(val: string | number): string[] {
  const str = String(val).trim();
  const variants: string[] = [str, str.toLowerCase()];
  // Remove commas and spaces (thousand separators)
  const noSeparators = str.replace(/[\s,]/g, '');
  if (noSeparators !== str) variants.push(noSeparators);
  return variants;
}

/**
 * Verify that the extracted value appears in the source text (anti-hallucination).
 */
export function structuralVerify(
  extractedValue: string | number | null,
  sourceText: string
): boolean {
  if (extractedValue === null) return true;

  const strVal = String(extractedValue).trim();
  if (!strVal) return true;

  const sourceLower = sourceText.toLowerCase();
  const sourceNormalized = sourceText.replace(/[\s]+/g, ' ').toLowerCase();

  // Case-insensitive exact substring
  if (sourceLower.includes(strVal.toLowerCase())) return true;

  // Flexible whitespace: collapse internal spaces in value
  const valCollapsed = strVal.replace(/\s+/g, ' ').trim();
  if (sourceNormalized.includes(valCollapsed.toLowerCase())) return true;

  // For numbers: check variants (1,000 vs 1000 vs 1 000)
  const numMatch = strVal.match(/^-?[\d\s,\.]+%?$/);
  if (numMatch) {
    const variants = numberVariants(extractedValue);
    for (const v of variants) {
      if (sourceLower.includes(v)) return true;
    }
    // Also try with all separators removed from source
    const sourceNoSep = sourceText.replace(/[\s,]/g, '').toLowerCase();
    const valNoSep = strVal.replace(/[\s,]/g, '').toLowerCase();
    if (sourceNoSep.includes(valNoSep)) return true;
  }

  return false;
}

/**
 * Check if the OpenAI API is available (API key configured).
 */
export function isAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export class LLMExtractor {
  private config: Required<LLMExtractorConfig>;

  constructor(partial?: Partial<LLMExtractorConfig>) {
    const apiKey =
      partial?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.config = { ...DEFAULT_CONFIG, ...partial, apiKey };
  }

  /**
   * Call OpenAI chat completions API via raw fetch.
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const { apiKey, baseUrl, model, temperature, maxTokens, timeoutMs } =
      this.config;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise B-BBEE data extraction assistant. Extract ONLY the requested value from the provided text. If the value is not clearly present, return null. Never guess or infer values.',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (content == null) {
        throw new Error('OpenAI API returned empty response');
      }
      return content;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Extract a single value using the LLM.
   */
  async extract(req: LLMExtractionRequest): Promise<LLMExtractionResult> {
    const prompt = buildExtractionPrompt(req);
    const rawLLMResponse = await this.callOpenAI(prompt);

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
    requests: LLMExtractionRequest[]
  ): Promise<LLMExtractionResult[]> {
    const BATCH_SIZE = 5;
    const results: LLMExtractionResult[] = [];
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((r) => this.extract(r))
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
   * Dual extraction: compare LLM with rule-based value for higher confidence.
   */
  async dualExtract(
    req: LLMExtractionRequest,
    ruleBasedValue: string | number | null
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
      return {
        ...llmResult,
        method: 'llm_fallback',
      };
    }

    // Disagree: both have values but they differ
    return {
      ...llmResult,
      confidence: Math.min(llmResult.confidence, 0.75) * 0.5,
      method: 'llm',
      reasoning: `LLM/rule mismatch: LLM="${llmVal}" rule="${ruleVal}". ${llmResult.reasoning ?? ''}`.trim(),
    };
  }
}
