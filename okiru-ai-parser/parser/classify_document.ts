import type { DocumentClassification, DocumentClassificationCandidate } from '../schemas/document_types.js';
import type { RawExtractionInput } from '../schemas/parser_output.js';
import type { DocumentKnowledge, DocumentTypeNode, FieldKnowledge, OntologyRepository } from '../graph/ontology_models.js';
import { defaultDocumentKnowledge } from '../graph/ontology_queries.js';
import { elementFromHint } from '../src/services/specRetrieval.js';

/**
 * A workbook sheet states its own element in its NAME. A sheet titled
 * "Procurement" IS preferential-procurement evidence, "Ownership" IS ownership
 * — that is not a guess, it is what the tab says it is. The content-matching
 * classifier below is blind to this: fed the sheet's data (supplier rows, ID
 * numbers) it matched the generic B-BBEE vocabulary to affidavit specs and
 * scored a "Procurement" sheet as a "Sworn Affidavit" — 0 of 53 sheets passed
 * on the real Thandanani pack. So when a document is a named workbook sheet, its
 * element is authoritative and the specs of that element's pillar are lifted to
 * a passing confidence. elementFromHint owns the sheet-name → element mapping
 * (shared with extraction retrieval, so the two never diverge).
 */
const ELEMENT_TO_PILLAR: Record<string, string> = {
  OWNERSHIP: 'OWN',
  MANAGEMENT_CONTROL: 'MAC',
  SKILLS_DEVELOPMENT: 'SKL',
  ESD: 'ESD',
  SED: 'SED',
};

/** The sheet name from a split-workbook filename ("File.xlsx › Procurement"). */
function sheetNameOf(input: RawExtractionInput): string {
  const meta = (input.metadata ?? {}) as { sheet_name?: unknown };
  if (typeof meta.sheet_name === 'string' && meta.sheet_name.trim()) return meta.sheet_name.trim();
  const f = input.filename ?? '';
  const marker = f.indexOf('›');
  return marker >= 0 ? f.slice(marker + 1).trim() : '';
}

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

/**
 * How much text counts as the document's "header".
 *
 * A document declares what it IS at the top — a title, a letterhead, a form
 * name. Evidence found there identifies the document; the same word found on
 * page 40 of a workbook is incidental. Measured on the real Thandanani pack,
 * matching anywhere in the body made every large file score 0.99 as a B-BBEE
 * certificate, because a BEE workbook contains every BEE term somewhere.
 */
const HEADER_CHARS = 1200;

/** Matches deep in the body still count, but they cannot carry a document alone. */
const BODY_MATCH_WEIGHT = 0.3;

interface MatchRegions {
  /** Filename + opening of the document, normalised. */
  header: string;
  /** The whole document, normalised. */
  full: string;
}

function matchRegions(filename: string, text: string): MatchRegions {
  return {
    header: normalizeForMatch(`${filename}\n${text.slice(0, HEADER_CHARS)}`),
    full: normalizeForMatch(`${filename}\n${text}`),
  };
}

/**
 * Position-aware coverage: a token in the header scores 1, the same token only
 * in the body scores BODY_MATCH_WEIGHT.
 */
function tokenCoverage(regions: MatchRegions, tokens: string[]): { score: number; matched: string[] } {
  if (tokens.length === 0) return { score: 0, matched: [] };

  let weight = 0;
  const matched: string[] = [];
  for (const token of tokens) {
    if (regions.header.includes(token)) {
      weight += 1;
      matched.push(token);
    } else if (regions.full.includes(token)) {
      weight += BODY_MATCH_WEIGHT;
      matched.push(token);
    }
  }
  return { score: weight / tokens.length, matched };
}

function safeRegexTest(regexSource: string | undefined, text: string): boolean {
  if (!regexSource) return false;
  try {
    return new RegExp(regexSource, 'i').test(text);
  } catch {
    return false;
  }
}

function fieldEvidence(
  regions: MatchRegions,
  rawText: string,
  fields: FieldKnowledge[],
): { score: number; matched: string[]; reasons: string[] } {
  const expected = fields.filter((field) => field.field.required);
  const targetFields = expected.length > 0 ? expected : fields;
  if (targetFields.length === 0) return { score: 0, matched: [], reasons: [] };

  const matched = new Set<string>();
  const reasons: string[] = [];
  let weight = 0;

  for (const fieldKnowledge of targetFields) {
    const fieldName = fieldKnowledge.field.name;
    const label = normalizeForMatch(fieldName.replace(/_/g, ' '));

    // A labelled regex hit is strong evidence wherever it appears — it matches
    // a shaped value ("Certificate Number: BEE/2026/00184"), not a bare word.
    const patternHit = fieldKnowledge.patterns.some((pattern) => {
      if (pattern.regex && safeRegexTest(pattern.regex, rawText)) return true;
      if (pattern.name && regions.header.includes(normalizeForMatch(pattern.name))) return true;
      return false;
    });

    if (patternHit || (label && regions.header.includes(label))) {
      matched.add(fieldName);
      weight += 1;
      reasons.push(`expected field matched: ${fieldName}`);
    } else if (label && regions.full.includes(label)) {
      // Present, but only deep in the body — corroborating, not identifying.
      matched.add(fieldName);
      weight += BODY_MATCH_WEIGHT;
    }
  }

  return {
    score: weight / targetFields.length,
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
  filename: string,
  doc: DocumentTypeNode,
  knowledge: DocumentKnowledge | null,
  aliasFrequency?: Map<string, number>,
): DocumentClassificationCandidate {
  const aliases = [doc.name, ...doc.aliases].filter(Boolean);
  const reasons: string[] = [];
  const matchedEvidence = new Set<string>();
  const regions = matchRegions(filename, text);

  // An alias in the header is the document naming itself. The same alias buried
  // in a 300-page pack is a mention, not an identity.
  const exactAliasMatches = aliases.filter((alias) => regions.header.includes(normalizeForMatch(alias)));
  const bodyAliasMatches = exactAliasMatches.length === 0
    ? aliases.filter((alias) => regions.full.includes(normalizeForMatch(alias)))
    : [];
  for (const alias of [...exactAliasMatches, ...bodyAliasMatches]) matchedEvidence.add(alias);
  if (exactAliasMatches.length > 0) reasons.push(`exact alias/name matched: ${exactAliasMatches[0]}`);

  const nameTokens = tokenCoverage(regions, importantTokens(doc.name));
  for (const token of nameTokens.matched) matchedEvidence.add(token);
  if (nameTokens.matched.length > 0) reasons.push(`document-name tokens matched: ${nameTokens.matched.join(', ')}`);

  const descriptionTokens = tokenCoverage(regions, importantTokens(doc.description));
  for (const token of descriptionTokens.matched) matchedEvidence.add(token);

  const fields = fieldEvidence(regions, text, knowledge?.fields ?? []);
  for (const field of fields.matched) matchedEvidence.add(field);
  reasons.push(...fields.reasons.slice(0, 8));

  const genericBeeSignals = tokenCoverage(regions, [
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
  const exactAliasScore = exactAliasMatches.length > 0
    ? (isDistinctive ? 0.5 : 0.34)
    // Body-only alias mentions get the same discount as body-only tokens: a
    // pack that merely *refers* to a share register is not a share register.
    : bodyAliasMatches.length > 0 ? 0.34 * BODY_MATCH_WEIGHT : 0;
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

/**
 * How many candidates may clear the review threshold before we conclude the
 * upload is a compendium rather than one document.
 */
const COMPENDIUM_CANDIDATES = 4;

function classifyStatus(
  best: DocumentClassificationCandidate | undefined,
  second: DocumentClassificationCandidate | undefined,
  allCandidates: DocumentClassificationCandidate[] = [],
): Pick<DocumentClassification, 'status' | 'reason' | 'margin'> {
  if (!best || best.confidence <= 0) {
    return { status: 'unsupported', reason: 'No ontology document type matched the uploaded evidence', margin: 0 };
  }

  const margin = best.confidence - (second?.confidence ?? 0);

  // A workbook or strategy pack contains the evidence for MANY document types
  // at once, so many candidates clear the bar together. Naming one of them is
  // guessing; the honest answer is that this upload is not a single document.
  // (Measured: the 24MB Thandanani toolkit scored 0.99 as a "B-BBEE
  // Certificate" with four other types also above threshold.)
  const plausible = allCandidates.filter((candidate) => candidate.confidence >= REVIEW_CONFIDENCE);
  if (plausible.length >= COMPENDIUM_CANDIDATES) {
    return {
      status: 'compendium',
      reason: `This upload matches ${plausible.length} document types (${plausible.slice(0, 3).map((c) => c.document_type).join(', ')}…). `
        + 'It looks like a workbook or pack containing several documents rather than one document.',
      margin,
    };
  }

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
  const text = input.raw_text;

  const aliasFrequency = buildAliasFrequency(documentTypes);
  const candidates: DocumentClassificationCandidate[] = [];
  for (const doc of documentTypes) {
    const knowledge = await repository.getDocumentKnowledge(doc.name) ?? fallbackByName.get(doc.name.toLowerCase()) ?? null;
    candidates.push(scoreCandidate(text, input.filename ?? '', doc, knowledge, aliasFrequency));
  }

  // SHEET-NAME AUTHORITY: a named workbook sheet states its own element. Lift the
  // specs of that element's pillar so the sheet classifies as what it plainly is
  // — not as whatever affidavit its generic B-BBEE content happens to match.
  // Additive (not a flat floor) so the best-scoring spec of the right pillar
  // still wins; content stays the tiebreak, the sheet name only fixes the pillar.
  const hintElement = elementFromHint(sheetNameOf(input));
  const hintPillar = hintElement ? ELEMENT_TO_PILLAR[hintElement] : null;
  if (hintPillar) {
    for (const candidate of candidates) {
      if (candidate.pillar === hintPillar) {
        candidate.confidence = Math.min(0.99, candidate.confidence + 0.5);
        candidate.reasons = [`sheet name states this is ${hintElement} evidence`, ...candidate.reasons].slice(0, 12);
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const second = candidates[1];
  const status = classifyStatus(best, second, candidates);

  return {
    document_type: best?.document_type ?? 'Unsupported',
    pillar: best?.pillar ?? 'Unknown',
    confidence: best?.confidence ?? 0,
    matched_evidence: best?.matched_evidence ?? [],
    candidates: candidates.slice(0, 5),
    ...status,
  };
}
