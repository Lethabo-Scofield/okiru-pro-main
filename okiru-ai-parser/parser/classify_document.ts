import type { DocumentClassification, DocumentClassificationCandidate } from '../schemas/document_types.js';
import type { RawExtractionInput } from '../schemas/parser_output.js';
import type { DocumentKnowledge, DocumentTypeNode, FieldKnowledge, OntologyRepository } from '../graph/ontology_models.js';
import { defaultDocumentKnowledge } from '../graph/ontology_queries.js';

const PASS_CONFIDENCE = 0.85;
const REVIEW_CONFIDENCE = 0.6;
const AMBIGUITY_MARGIN = 0.15;

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function includesNormalized(text: string, term: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  return normalizedTerm.length > 0 && normalizeForMatch(text).includes(normalizedTerm);
}

function importantTokens(...values: string[]): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'each', 'all', 'per', 'copy', 'document', 'documents',
    'certificate', 'certificates', 'signed', 'valid', 'current', 'where', 'applicable',
    'inspection', 'inspect', 'attached', 'return', 'json', 'fields', 'list', 'bool',
    'date', 'value', 'values', 'entity', 'name',
  ]);
  return Array.from(new Set(values
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stop.has(token))))
    .slice(0, 32);
}

function tokenCoverage(text: string, tokens: string[]): { score: number; matched: string[] } {
  if (tokens.length === 0) return { score: 0, matched: [] };
  const normalizedText = normalizeForMatch(text);
  const matched = tokens.filter((token) => normalizedText.includes(token));
  return { score: matched.length / tokens.length, matched };
}

function safeRegexTest(regexSource: string | undefined, text: string): boolean {
  if (!regexSource) return false;
  try {
    return new RegExp(regexSource, 'i').test(text);
  } catch {
    return false;
  }
}

function fieldEvidence(text: string, fields: FieldKnowledge[]): { score: number; matched: string[]; reasons: string[] } {
  const expected = fields.filter((field) => field.field.required);
  const targetFields = expected.length > 0 ? expected : fields;
  if (targetFields.length === 0) return { score: 0, matched: [], reasons: [] };

  const matched = new Set<string>();
  const reasons: string[] = [];

  for (const fieldKnowledge of targetFields) {
    const fieldName = fieldKnowledge.field.name;
    const label = fieldName.replace(/_/g, ' ');
    const patternHit = fieldKnowledge.patterns.some((pattern) => {
      if (pattern.regex && safeRegexTest(pattern.regex, text)) return true;
      if (pattern.name && includesNormalized(text, pattern.name)) return true;
      return false;
    });
    if (patternHit || includesNormalized(text, label)) {
      matched.add(fieldName);
      reasons.push(`expected field matched: ${fieldName}`);
    }
  }

  return {
    score: matched.size / targetFields.length,
    matched: Array.from(matched),
    reasons,
  };
}

function scoreCandidate(text: string, doc: DocumentTypeNode, knowledge: DocumentKnowledge | null): DocumentClassificationCandidate {
  const aliases = [doc.name, ...doc.aliases].filter(Boolean);
  const reasons: string[] = [];
  const matchedEvidence = new Set<string>();

  const exactAliasMatches = aliases.filter((alias) => includesNormalized(text, alias));
  for (const alias of exactAliasMatches) matchedEvidence.add(alias);
  if (exactAliasMatches.length > 0) reasons.push(`exact alias/name matched: ${exactAliasMatches[0]}`);

  const nameTokens = tokenCoverage(text, importantTokens(doc.name));
  for (const token of nameTokens.matched) matchedEvidence.add(token);
  if (nameTokens.matched.length > 0) reasons.push(`document-name tokens matched: ${nameTokens.matched.join(', ')}`);

  const descriptionTokens = tokenCoverage(text, importantTokens(doc.description));
  for (const token of descriptionTokens.matched) matchedEvidence.add(token);

  const fields = fieldEvidence(text, knowledge?.fields ?? []);
  for (const field of fields.matched) matchedEvidence.add(field);
  reasons.push(...fields.reasons.slice(0, 8));

  const genericBeeSignals = tokenCoverage(text, [
    'b-bbee',
    'bbbee',
    'bee',
    'status',
    'level',
    'black',
    'ownership',
    'expiry',
    'certificate',
  ]);
  for (const token of genericBeeSignals.matched) matchedEvidence.add(token);

  const exactAliasScore = exactAliasMatches.length > 0 ? 0.6 : 0;
  const nameScore = nameTokens.score * 0.2;
  const descriptionScore = descriptionTokens.score * 0.08;
  const fieldScore = fields.score * 0.28;
  const genericScore = genericBeeSignals.score * 0.06;
  const confidence = Math.min(0.99, exactAliasScore + nameScore + descriptionScore + fieldScore + genericScore);

  return {
    document_type: doc.name,
    pillar: doc.pillar_code,
    confidence,
    matched_evidence: Array.from(matchedEvidence).slice(0, 24),
    reasons: reasons.slice(0, 12),
  };
}

function classifyStatus(best: DocumentClassificationCandidate | undefined, second: DocumentClassificationCandidate | undefined): Pick<DocumentClassification, 'status' | 'reason' | 'margin'> {
  if (!best || best.confidence <= 0) {
    return { status: 'unsupported', reason: 'No ontology document type matched the uploaded evidence', margin: 0 };
  }

  const margin = best.confidence - (second?.confidence ?? 0);

  if (best.confidence < REVIEW_CONFIDENCE) {
    return { status: 'low_confidence', reason: 'Best document-type confidence is below review threshold', margin };
  }

  if (best.confidence < PASS_CONFIDENCE) {
    return { status: 'ambiguous', reason: 'Best document-type confidence requires human review', margin };
  }

  if (second && second.confidence >= REVIEW_CONFIDENCE && margin < AMBIGUITY_MARGIN) {
    return {
      status: 'ambiguous',
      reason: `Top document-type candidates are too close (${best.document_type} vs ${second.document_type})`,
      margin,
    };
  }

  return { status: 'classified', reason: 'Document type classified with sufficient confidence and margin', margin };
}

export async function classifyDocument(
  input: RawExtractionInput,
  repository: OntologyRepository,
): Promise<DocumentClassification> {
  const fallbackKnowledge = defaultDocumentKnowledge();
  const fallbackByName = new Map(fallbackKnowledge.map((knowledge) => [knowledge.document.name.toLowerCase(), knowledge]));
  const documentTypesByName = new Map<string, DocumentTypeNode>();
  for (const doc of await repository.listDocumentTypes()) {
    documentTypesByName.set(doc.name.toLowerCase(), doc);
  }
  for (const knowledge of fallbackKnowledge) {
    documentTypesByName.set(knowledge.document.name.toLowerCase(), knowledge.document);
  }
  const documentTypes = Array.from(documentTypesByName.values());
  const text = `${input.filename}\n${input.raw_text}`;

  const candidates: DocumentClassificationCandidate[] = [];
  for (const doc of documentTypes) {
    const knowledge = await repository.getDocumentKnowledge(doc.name) ?? fallbackByName.get(doc.name.toLowerCase()) ?? null;
    candidates.push(scoreCandidate(text, doc, knowledge));
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const second = candidates[1];
  const status = classifyStatus(best, second);

  return {
    document_type: best?.document_type ?? 'Unsupported',
    pillar: best?.pillar ?? 'Unknown',
    confidence: best?.confidence ?? 0,
    matched_evidence: best?.matched_evidence ?? [],
    candidates: candidates.slice(0, 5),
    ...status,
  };
}
