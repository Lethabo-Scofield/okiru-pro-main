import type { DocumentClassification } from '../schemas/document_types.js';
import type { RawExtractionInput } from '../schemas/parser_output.js';
import type { OntologyRepository } from '../graph/ontology_models.js';

function scoreEvidence(text: string, terms: string[]): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = terms.filter((term) => lower.includes(term.toLowerCase()));
  return { score: matched.length / Math.max(terms.length, 1), matched };
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function importantTokens(...values: string[]): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'each', 'all', 'per', 'copy', 'document', 'documents',
    'certificate', 'certificates', 'signed', 'valid', 'current', 'where', 'applicable',
  ]);
  const tokens = values
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
  return Array.from(new Set(tokens)).slice(0, 24);
}

export async function classifyDocument(
  input: RawExtractionInput,
  repository: OntologyRepository,
): Promise<DocumentClassification> {
  const documentTypes = await repository.listDocumentTypes();
  const text = `${input.filename}\n${input.raw_text}`;

  let best: DocumentClassification = {
    document_type: 'Unsupported',
    pillar: 'Unknown',
    confidence: 0,
    matched_evidence: [],
  };

  for (const doc of documentTypes) {
    const aliases = [doc.name, ...doc.aliases];
    const aliasScore = scoreEvidence(text, aliases);
    const normalizedText = normalizeForMatch(text);
    const hasExactAlias = aliases.some((alias) => normalizedText.includes(normalizeForMatch(alias)));
    const nameTokenScore = scoreEvidence(text, importantTokens(doc.name));
    const descriptionTokenScore = scoreEvidence(text, importantTokens(doc.description));
    const keywordScore = scoreEvidence(text, [
      'B-BBEE',
      'BEE',
      'Status Level',
      'Certificate Number',
      'Black Ownership',
      'Expiry Date',
      'Enterprise Name',
    ]);
    const exactAliasScore = hasExactAlias ? 0.6 : aliasScore.score * 0.35;
    const confidence = Math.min(0.99, exactAliasScore + nameTokenScore.score * 0.3 + descriptionTokenScore.score * 0.15 + keywordScore.score * 0.1);
    if (confidence > best.confidence) {
      best = {
        document_type: doc.name,
        pillar: doc.pillar_code,
        confidence,
        matched_evidence: Array.from(new Set([...aliasScore.matched, ...nameTokenScore.matched, ...descriptionTokenScore.matched, ...keywordScore.matched])),
      };
    }
  }

  return best;
}
