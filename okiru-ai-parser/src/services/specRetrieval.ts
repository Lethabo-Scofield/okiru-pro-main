/**
 * Which of the 109 document specs is a document worth extracting against?
 *
 * The old answer — "does any alias appear as a substring" — is the brittle
 * string-matching that made Phase 4 misfire: a clean per-sheet "Ownership"
 * document did not contain the literal alias of any ownership spec, so it
 * matched nothing and extracted nothing. Substring presence is not relevance.
 *
 * This replaces it with real lexical retrieval — BM25 over each spec's
 * searchable text (name, aliases, description, expected fields, auditor tests,
 * worked example) — plus an ELEMENT signal. When a document is a workbook sheet
 * named "Ownership" or "Preferential Procurement", the sheet name is a near-
 * certain statement of which element it serves, so specs of that element are
 * boosted. The AI still gets the final say (it returns not_this_document for a
 * wrong spec cheaply), so retrieval only has to get the RIGHT specs into the
 * candidate set — precision comes from the model, recall from here.
 *
 * BM25 because it needs no model, no embeddings service, and no training: it is
 * a deterministic ranking that rewards rare, discriminating terms ("leviable",
 * "COR14.3", "beneficiary") over common ones. Exactly right for routing 109
 * short, keyword-dense specs.
 */
import {
  VERIFICATION_DOCUMENT_MATRIX,
  type VerificationDocument,
  type VerificationElement,
} from '../../schemas/verification_document_matrix.js';

/** Split into lowercase alphanumeric terms, dropping the very short. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3);
}

/** The searchable text of a spec — everything that says what it is FOR. */
function specText(spec: VerificationDocument): string {
  return [
    spec.name,
    spec.aliases.join(' '),
    spec.auditorTests,
    spec.expectedFields.join(' '),
    spec.exampleData,
  ].join(' ');
}

const K1 = 1.5;
const B = 0.75;

interface IndexedSpec {
  spec: VerificationDocument;
  termFreq: Map<string, number>;
  length: number;
}

/** Built once — the matrix is static. */
let index: {
  docs: IndexedSpec[];
  idf: Map<string, number>;
  avgLength: number;
} | null = null;

function buildIndex(): NonNullable<typeof index> {
  const docs: IndexedSpec[] = VERIFICATION_DOCUMENT_MATRIX.map((spec) => {
    const terms = tokenize(specText(spec));
    const termFreq = new Map<string, number>();
    for (const term of terms) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    return { spec, termFreq, length: terms.length };
  });

  // Document frequency → inverse document frequency.
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.termFreq.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    // BM25 idf, floored at a small positive so a term in every spec still
    // contributes a little rather than going negative.
    idf.set(term, Math.max(0.01, Math.log((n - df + 0.5) / (df + 0.5) + 1)));
  }

  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, n);
  return { docs, idf, avgLength };
}

function getIndex(): NonNullable<typeof index> {
  index ??= buildIndex();
  return index;
}

/** BM25 score of a query's terms against one indexed spec. */
function bm25(queryTerms: string[], doc: IndexedSpec, idf: Map<string, number>, avgLength: number): number {
  let score = 0;
  const seen = new Set<string>();
  for (const term of queryTerms) {
    if (seen.has(term)) continue;
    seen.add(term);
    const tf = doc.termFreq.get(term);
    if (!tf) continue;
    const termIdf = idf.get(term) ?? 0;
    const denom = tf + K1 * (1 - B + B * (doc.length / avgLength));
    score += termIdf * ((tf * (K1 + 1)) / denom);
  }
  return score;
}

/** Map a workbook sheet name (or filename fragment) to a scorecard element. */
export function elementFromHint(hint: string | undefined): VerificationElement | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  // Management Control is tested BEFORE Ownership: an "Employment Equity" sheet
  // is people, but the bare `equity` in the ownership pattern used to claim it
  // first — routing the employee register to shareholder extraction, which
  // found nothing, and costing the whole EE pillar its rows.
  if (/(management control|employment equity|directors|ee profile|workforce|employees|board|eea\s*[124]\b|pay\s*roll|salary)/.test(h)) return 'MANAGEMENT_CONTROL';
  if (/(ownership|shareholding|share register|share certificate|securities|equity|cipc|cor\s*14|cor\s*39|\bmoi\b|bi register|beneficial interest)/.test(h)) return 'OWNERSHIP';
  if (/(skills|training|learnership|wsp|atr|leviable|bursar|emp\s*201|\bseta\b|\bsdl\b)/.test(h)) return 'SKILLS_DEVELOPMENT';
  if (/(procurement|supplier|enterprise (&|and) supplier|enterprise development|esd|preferential|ledger)/.test(h)) return 'ESD';
  if (/(socio.?economic|social development|\bsed\b|csi|beneficiar)/.test(h)) return 'SED';
  return null;
}

/**
 * Element from a document's CONTENT — the fallback for anonymous files.
 *
 * A scan named `0862_251204095622_001.pdf` says nothing; its text usually does.
 * This is deliberately narrow: only phrases that are near-unambiguous statements
 * of an element count, and a hint is returned ONLY on a clear winner (two or
 * more hits, no other element scoring at all). Anything murkier returns null
 * and the document takes the wide-net BM25 path — a wrong element boost narrows
 * the candidate specs, which is worse than no boost.
 */
const CONTENT_SIGNALS: Array<{ element: VerificationElement; pattern: RegExp }> = [
  { element: 'OWNERSHIP', pattern: /share register|share certificate|securities register|certificate of incorporation|memorandum of incorporation/gi },
  { element: 'MANAGEMENT_CONTROL', pattern: /\beea[124]\b|employment equity act|occupational level/gi },
  { element: 'SKILLS_DEVELOPMENT', pattern: /workplace skills plan|annual training report|learnership agreement|skills development levies/gi },
  { element: 'ESD', pattern: /accounts payable|detailed ledger|remittance advice|supplier statement/gi },
  { element: 'SED', pattern: /socio-?economic development|public benefit organisation/gi },
];

export function elementFromContent(text: string | undefined): VerificationElement | null {
  if (!text) return null;
  const sample = text.slice(0, 6000);
  const hits = new Map<VerificationElement, number>();
  for (const { element, pattern } of CONTENT_SIGNALS) {
    const count = (sample.match(pattern) ?? []).length;
    if (count > 0) hits.set(element, (hits.get(element) ?? 0) + count);
  }
  if (hits.size !== 1) return null;
  const [element, count] = Array.from(hits.entries())[0];
  return count >= 2 ? element : null;
}

export interface SpecCandidate {
  spec: VerificationDocument;
  score: number;
}

/**
 * Rank the specs for a document.
 *
 * `elementHint` (usually the sheet name) boosts specs of that element, because a
 * sheet named "Ownership" is ownership evidence far more reliably than any term
 * match can establish. The boost is additive and bounded, so it lifts the right
 * element's specs into the candidate set without letting a mislabelled sheet
 * bury genuine BM25 evidence.
 */
export function rankSpecsForDocument(
  text: string,
  filename: string,
  options: { limit?: number; elementHint?: string; elementOverride?: VerificationElement } = {},
): SpecCandidate[] {
  const { docs, idf, avgLength } = getIndex();
  const queryTerms = tokenize(`${filename} ${text}`);
  // A model classification (Pass A) is authoritative where present: it read the
  // whole document and judged its element by meaning, which is strictly better
  // than the keyword regexes below. It only arrives when confident, so it never
  // overrides with a guess. Absent it, the keyword chain stands.
  const hintElement = options.elementOverride
    ?? elementFromHint(options.elementHint)
    ?? elementFromHint(filename)
    ?? elementFromContent(text);

  const ELEMENT_BOOST = 4; // enough to guarantee the element's specs are seen

  const scored = docs.map(({ spec, termFreq, length }) => {
    let score = bm25(queryTerms, { spec, termFreq, length }, idf, avgLength);
    if (hintElement && spec.element === hintElement) score += ELEMENT_BOOST;
    return { spec, score };
  });

  // A confident model classification (Pass A) is AUTHORITATIVE, not advisory: the
  // model read the whole document and decided its element, so its specs are the
  // only candidates — misleading keywords in the body ("procurement spend" in an
  // AFS) must not pull in another element's specs. BM25 still RANKS within the
  // element (recall from here, precision from the model). The keyword `elementHint`
  // stays a boost, not a filter, because a sheet name is strong but the content
  // can still legitimately carry a second element.
  const pool = options.elementOverride
    ? scored.filter((c) => c.spec.element === options.elementOverride)
    : scored;

  // A reliable element hint narrows hard: the top few specs of the right element
  // are almost always the answer, and every extra candidate is a wasted model
  // call. Without a hint, cast a slightly wider net.
  const limit = options.limit ?? (hintElement ? 3 : 5);

  return pool
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Convenience: just the spec ids, in rank order. */
export function selectSpecIds(
  text: string,
  filename: string,
  options: { limit?: number; elementHint?: string } = {},
): string[] {
  return rankSpecsForDocument(text, filename, options).map((c) => c.spec.id);
}
