import type { DocumentClassification } from '../schemas/document_types.js';
import type { RawExtractionInput } from '../schemas/parser_output.js';
import type { OntologyRepository } from '../graph/ontology_models.js';

function scoreEvidence(text: string, terms: string[]): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = terms.filter((term) => lower.includes(term.toLowerCase()));
  return { score: matched.length / Math.max(terms.length, 1), matched };
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
    const hasExactAlias = aliases.some((alias) => text.toLowerCase().includes(alias.toLowerCase()));
    const keywordScore = scoreEvidence(text, [
      'B-BBEE',
      'BEE',
      'Status Level',
      'Certificate Number',
      'Black Ownership',
      'Expiry Date',
      'Enterprise Name',
    ]);
    const exactAliasScore = hasExactAlias ? 0.45 : aliasScore.score * 0.35;
    const confidence = Math.min(0.99, exactAliasScore + keywordScore.score * 0.55);
    if (confidence > best.confidence) {
      best = {
        document_type: doc.name,
        pillar: doc.pillar_code,
        confidence,
        matched_evidence: Array.from(new Set([...aliasScore.matched, ...keywordScore.matched])),
      };
    }
  }

  return best;
}
