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
  confidence: number;
  sourceSnippet: string;
  rawResponse: string;
}

export function buildExtractionPrompt(request: LLMExtractionRequest): string {
  const aliasStr = request.aliases.length > 0 ? `Also known as: ${request.aliases.join(', ')}.` : '';
  const examplesStr = request.positiveExamples.length > 0
    ? `Examples of valid values: ${request.positiveExamples.join(', ')}.`
    : '';

  return `Extract the following entity from the provided text.

Entity: ${request.entityName}
Type: ${request.entityType}
Definition: ${request.definition}
${aliasStr}
${examplesStr}

Look in these sections: ${request.zones.join(', ')}

Text:
${request.sourceText}

Return the extracted value as JSON: { "value": <extracted_value_or_null>, "confidence": <0_to_1>, "snippet": "<relevant_text_snippet>" }`;
}

export class LLMExtractor {
  async extractBatch(requests: LLMExtractionRequest[]): Promise<LLMExtractionResult[]> {
    const results: LLMExtractionResult[] = [];

    for (const request of requests) {
      try {
        const prompt = buildExtractionPrompt(request);

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          results.push({
            entityName: request.entityName,
            extractedValue: null,
            confidence: 0,
            sourceSnippet: '',
            rawResponse: 'GROQ_API_KEY not configured',
          });
          continue;
        }

        const { default: Groq } = await import('groq-sdk');
        const groq = new Groq({ apiKey });
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);

        results.push({
          entityName: request.entityName,
          extractedValue: parsed.value ?? null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          sourceSnippet: parsed.snippet || '',
          rawResponse: raw,
        });
      } catch (error: any) {
        results.push({
          entityName: request.entityName,
          extractedValue: null,
          confidence: 0,
          sourceSnippet: '',
          rawResponse: `Error: ${error.message}`,
        });
      }
    }

    return results;
  }
}
