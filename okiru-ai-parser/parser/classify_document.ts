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

/**
 * How many document types claim each alias.
 *
 * An alias only one type claims is decisive: a page containing "COR14.3" or
 * "EMP201" IS that document. An alias many types share ("SETA", "AFS") barely
 * narrows anything. Weighting both the same made specific statutory documents
 * score like generic ones and land under the review threshold.
 */
function buildAliasFrequency(docs: DocumentTypeNode[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const alias of [doc.name, ...doc.aliases].filter(Boolean)) {
      const key = alias.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  return frequency;
}

function scoreCandidate(
  text: string,
  doc: DocumentTypeNode,
  knowledge: DocumentKnowledge | null,
  aliasFrequency?: Map<string, number>,
): DocumentClassificationCandidate {
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

  // WEIGHTING — the alias is ONE signal, not a master key.
  //
  // It used to be worth 0.6 on its own, which outweighed every substantive
  // signal combined (0.2 + 0.08 + 0.28 + 0.06 = 0.62). That made confidence a
  // measure of "does this document contain our label string" rather than "does
  // it contain the evidence this document type is made of". Real documents
  // title themselves "B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE", never the
  // literal alias "B-BBEE Certificate", so the 0.6 never fired and genuine
  // certificates capped out around 0.39 — under REVIEW_CONFIDENCE, classified
  // low_confidence, and returned to the user as a hard `failed` (HTTP 422).
  //
  // Field evidence (certificate number, status level, black ownership %,
  // expiry) is what actually identifies a document, so it now carries the most
  // weight and can reach confidence on its own. This does NOT loosen any
  // safety gate: the calculator payload still requires status 'passed', which
  // still requires confidence >= PASS_CONFIDENCE and clean validation. The
  // effect is that a real certificate becomes 'review_required' (read, flagged
  // for a human) instead of 'failed' (discarded).
  // An alias no other document type claims is decisive evidence; a shared one is
  // only a hint. Without this, "EMP201" (claimed by exactly one document) counted
  // the same as "AFS" (claimed by many), and specific statutory documents scored
  // like generic ones — landing just under REVIEW_CONFIDENCE and being reported
  // to the user as unreadable.
  const isDistinctive = exactAliasMatches.some(
    (alias) => (aliasFrequency?.get(alias.toLowerCase().trim()) ?? 1) === 1,
  );
  const exactAliasScore = exactAliasMatches.length > 0 ? (isDistinctive ? 0.5 : 0.34) : 0;
  const nameScore = nameTokens.score * 0.22;
  const descriptionScore = descriptionTokens.score * 0.06;
  const fieldScore = fields.score * 0.32;
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

  // The specific diagnosis comes first. "Too close to call between X and Y" is
  // actionable — it tells a reviewer exactly what to disambiguate — whereas
  // "below pass threshold" only restates the number. Checking the generic case
  // first shadowed the specific one for every document under PASS_CONFIDENCE,
  // which is precisely the band where candidates are most likely to be close.
  // Closeness is what MARGIN measures, so the runner-up needs no separate
  // absolute floor. It used to also require second >= REVIEW_CONFIDENCE, a
  // threshold calibrated against the old alias-dominated scores; once evidence
  // carries the weight, scores sit lower and that floor silently disabled the
  // check. It is also near-redundant: best is already >= REVIEW_CONFIDENCE
  // here, so a runner-up within AMBIGUITY_MARGIN is a credible alternative by
  // construction.
  if (second && margin < AMBIGUITY_MARGIN) {
    return {
      status: 'ambiguous',
      reason: `Top document-type candidates are too close (${best.document_type} vs ${second.document_type})`,
      margin,
    };
  }

  if (best.confidence < PASS_CONFIDENCE) {
    return { status: 'ambiguous', reason: 'Best document-type confidence requires human review', margin };
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

  const aliasFrequency = buildAliasFrequency(documentTypes);
  const candidates: DocumentClassificationCandidate[] = [];
  for (const doc of documentTypes) {
    const knowledge = await repository.getDocumentKnowledge(doc.name) ?? fallbackByName.get(doc.name.toLowerCase()) ?? null;
    candidates.push(scoreCandidate(text, doc, knowledge, aliasFrequency));
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
