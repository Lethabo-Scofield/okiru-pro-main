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
import type { VerificationDocument, VerificationElement } from '../../schemas/verification_document_matrix.js';
import type { EsgDocument, EsgElement } from '../../schemas/esg_document_matrix.js';
import {
  extractionDomain,
  type DomainDocument,
  type ExtractionDomain,
  type RoutableElement,
} from './extractionDomain.js';

/** Split into lowercase alphanumeric terms, dropping the very short. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3);
}

/** The searchable text of a spec — everything that says what it is FOR. */
function specText(spec: DomainDocument): string {
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
  spec: DomainDocument;
  termFreq: Map<string, number>;
  length: number;
}

interface SpecIndex {
  docs: IndexedSpec[];
  idf: Map<string, number>;
  avgLength: number;
}

/**
 * Built once PER DOMAIN — both matrices are static, and their IDF statistics
 * must stay separate: "certificate" is common across 109 B-BBEE specs and rare
 * across 40 ESG ones, and mixing them would mis-weight both.
 */
const indexes = new Map<ExtractionDomain, SpecIndex>();

function buildIndex(domain: ExtractionDomain): SpecIndex {
  const docs: IndexedSpec[] = extractionDomain(domain).matrix.map((spec) => {
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

function getIndex(domain: ExtractionDomain): SpecIndex {
  let built = indexes.get(domain);
  if (!built) {
    built = buildIndex(domain);
    indexes.set(domain, built);
  }
  return built;
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

/**
 * Sheet-name / filename → element, per domain, in PRIORITY ORDER.
 *
 * The B-BBEE chain is unchanged, comments included: its ordering encodes real
 * misroutes that were found and fixed on client packs.
 */
const BBBEE_HINTS: Array<{ element: VerificationElement; pattern: RegExp }> = [
  // Management Control is tested BEFORE Ownership: an "Employment Equity" sheet
  // is people, but the bare `equity` in the ownership pattern used to claim it
  // first — routing the employee register to shareholder extraction, which
  // found nothing, and costing the whole EE pillar its rows.
  { element: 'MANAGEMENT_CONTROL', pattern: /(management control|employment equity|directors|ee profile|workforce|employees|board|eea\s*[124]\b|pay\s*roll|salary)/ },
  { element: 'OWNERSHIP', pattern: /(ownership|shareholding|share register|share certificate|securities|equity|cipc|cor\s*14|cor\s*39|\bmoi\b|bi register|beneficial interest)/ },
  { element: 'SKILLS_DEVELOPMENT', pattern: /(skills|training|learnership|wsp|atr|leviable|bursar|emp\s*201|\bseta\b|\bsdl\b)/ },
  { element: 'ESD', pattern: /(procurement|supplier|enterprise (&|and) supplier|enterprise development|esd|preferential|ledger)/ },
  { element: 'SED', pattern: /(socio.?economic|social development|\bsed\b|csi|beneficiar)/ },
];

/**
 * The ESG routing vocabulary — fourteen elements, ordered so the SPECIFIC wins.
 *
 * The ordering here is the whole safety story, and the case it exists for is the
 * combined municipal account: WATER is tested first and its pattern demands
 * water words, so an electricity-only bill cannot fall into it and a water bill
 * cannot be claimed by the far bigger GHG_ENERGY vocabulary. FLEET precedes
 * GHG_ENERGY so a fuel-card statement is fleet evidence rather than stationary
 * fuel, and HEALTH_SAFETY precedes ISO_ENVIRONMENTAL so ISO 45001 lands beside
 * LTIFR rather than beside the EMS.
 *
 * A hint here is a BOOST, never a filter (see `rankSpecsForDocument`), so a
 * document that carries two elements is not narrowed to one by its name alone.
 */
const ESG_HINTS: Array<{ element: EsgElement; pattern: RegExp }> = [
  { element: 'WATER', pattern: /(water bill|water account|water invoice|water and sanitation|water & sanitation|sanitation|sewerage|kilolitre|\bkl\b|water meter|water consumption|borehole|rand water|umgeni water|johannesburg water)/ },
  { element: 'WASTE', pattern: /(waste|recycl|landfill|disposal certificate|waste manifest|diversion|skip collection|oricol)/ },
  { element: 'FLEET', pattern: /(fleet|vehicle register|vehicle asset|fuel card|fuel statement|telematics|driver debrief|odometer|licence disc|horse and trailer)/ },
  { element: 'GHG_ENERGY', pattern: /(electricity|eskom|city power|\bkwh\b|kilowatt|utility statement|municipal account|solar|photovoltaic|\bpv\b|inverter|generator|diesel bowser|\blpg\b|carbon tax|\bsbti\b|science.?based target|net.?zero|scope\s*[123]\b|\bghg\b|emission)/ },
  { element: 'HEALTH_SAFETY', pattern: /(iso\s*45001|health (and|&) safety|\bohs\b|\bltifr\b|\btrifr\b|injury|incident statistic|safety committee|induction register|\bhira\b|occupational health)/ },
  { element: 'ISO_ENVIRONMENTAL', pattern: /(iso\s*14001|environmental policy|environmental management system|aspects (and|&) impacts|legal register|\bnema\b|\bnemwa\b|\bems\b)/ },
  { element: 'EMPLOYMENT_EQUITY', pattern: /(employment equity|\beea\s*[124]\b|ee plan|ee forum|occupational level|workforce profile|ee scorecard)/ },
  { element: 'TRAINING', pattern: /(\bwsp\b|\batr\b|skills development|\bseta\b|\bsdl\b|\bofo\b|learnership|training register|training intervention|leviable)/ },
  { element: 'COMMUNITY_CSI', pattern: /(\bcsi\b|socio.?economic|community investment|social investment|beneficiar|\bnpo\b|\bpbo\b|section\s*18a|donation)/ },
  { element: 'SUPPLIER_ESG', pattern: /(supplier self.?assessment|\bsaq\b|supplier questionnaire|supplier scorecard|code of conduct|supplier esg)/ },
  { element: 'BOARD_GOVERNANCE', pattern: /(board charter|board composition|directors register|committee|terms of reference|king\s*i?v\b|king\s*5|integrated (annual )?report|company secretary|governance register)/ },
  { element: 'ETHICS_COMPLIANCE', pattern: /(ethic|whistleblow|anti.?corruption|\bpopia\b|\bpaia\b|information officer|penalt|sanction|conflict of interest|gift register)/ },
  { element: 'RISK_ASSURANCE', pattern: /(risk register|ifrs\s*s[12]\b|\bissb\b|\btcfd\b|assurance statement|external assurance|scenario analysis|\bgarp\b)/ },
  { element: 'FINANCIAL', pattern: /(annual financial statement|\bafs\b|income statement|statement of comprehensive income|management accounts|b-?bbee certificate|sworn affidavit|trial balance)/ },
];

/** Map a workbook sheet name (or filename fragment) to a scorecard element. */
export function elementFromHint(hint: string | undefined): VerificationElement | null;
export function elementFromHint(hint: string | undefined, domain: 'bbbee'): VerificationElement | null;
export function elementFromHint(hint: string | undefined, domain: 'esg'): EsgElement | null;
export function elementFromHint(hint: string | undefined, domain: ExtractionDomain): RoutableElement | null;
export function elementFromHint(
  hint: string | undefined,
  domain: ExtractionDomain = 'bbbee',
): RoutableElement | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  const hints: Array<{ element: RoutableElement; pattern: RegExp }> = domain === 'esg' ? ESG_HINTS : BBBEE_HINTS;
  for (const { element, pattern } of hints) {
    if (pattern.test(h)) return element;
  }
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

/**
 * The ESG equivalent, held to the same "only near-unambiguous phrases" bar.
 *
 * The combined municipal account is the reason this stays strict: a statement
 * that bills kWh AND kilolitres trips BOTH the GHG_ENERGY and WATER signals, so
 * `hits.size !== 1` and no element is asserted. That is the correct answer — the
 * document is genuinely two elements — and it leaves the wide BM25 net (plus the
 * combined-utility pins below) to surface both specs instead of one boost
 * burying the other's fields.
 */
const ESG_CONTENT_SIGNALS: Array<{ element: EsgElement; pattern: RegExp }> = [
  { element: 'GHG_ENERGY', pattern: /kwh consumed|units consumed|notified maximum demand|electricity charge|kilowatt.?hour|carbon tax|scope 2/gi },
  { element: 'WATER', pattern: /kilolitre|sanitation charge|sewerage charge|water meter reading|water consumption charge/gi },
  { element: 'FLEET', pattern: /vehicle registration|licence disc|odometer|fuel card|telematics|litres per 100km/gi },
  { element: 'WASTE', pattern: /waste manifest|safe disposal certificate|landfill|diversion rate|waste stream/gi },
  { element: 'ISO_ENVIRONMENTAL', pattern: /iso 14001|aspects and impacts|environmental management system/gi },
  { element: 'EMPLOYMENT_EQUITY', pattern: /\beea[24]\b|employment equity act|occupational level/gi },
  { element: 'HEALTH_SAFETY', pattern: /\bltifr\b|\btrifr\b|lost time injur|iso 45001|disabling injury/gi },
  { element: 'TRAINING', pattern: /workplace skills plan|annual training report|skills development levies|\bofo code\b/gi },
  { element: 'COMMUNITY_CSI', pattern: /socio-?economic development|public benefit organisation|section 18a|npo registration/gi },
  { element: 'SUPPLIER_ESG', pattern: /supplier self-?assessment|supplier questionnaire|code of conduct acknowledg/gi },
  { element: 'BOARD_GOVERNANCE', pattern: /king iv|king v |apply and explain|board charter|lead independent director/gi },
  { element: 'ETHICS_COMPLIANCE', pattern: /whistleblow|information officer|\bpopia\b|anti-?corruption/gi },
  { element: 'RISK_ASSURANCE', pattern: /ifrs s1|ifrs s2|risk register|external assurance|\bissb\b/gi },
  { element: 'FINANCIAL', pattern: /annual financial statements|statement of comprehensive income|profit after tax/gi },
];

export function elementFromContent(text: string | undefined): VerificationElement | null;
export function elementFromContent(text: string | undefined, domain: 'bbbee'): VerificationElement | null;
export function elementFromContent(text: string | undefined, domain: 'esg'): EsgElement | null;
export function elementFromContent(text: string | undefined, domain: ExtractionDomain): RoutableElement | null;
export function elementFromContent(
  text: string | undefined,
  domain: ExtractionDomain = 'bbbee',
): RoutableElement | null {
  if (!text) return null;
  const sample = text.slice(0, 6000);
  const signals: Array<{ element: RoutableElement; pattern: RegExp }> =
    domain === 'esg' ? ESG_CONTENT_SIGNALS : CONTENT_SIGNALS;
  const hits = new Map<RoutableElement, number>();
  for (const { element, pattern } of signals) {
    const count = (sample.match(pattern) ?? []).length;
    if (count > 0) hits.set(element, (hits.get(element) ?? 0) + count);
  }
  if (hits.size !== 1) return null;
  const [element, count] = Array.from(hits.entries())[0];
  return count >= 2 ? element : null;
}

/**
 * COMBINED MUNICIPAL ACCOUNTS — one statement, two elements.
 *
 * A South African municipal account routinely bills electricity, water and
 * sanitation on one page. Ranking picks the best few specs, and on a combined
 * bill the electricity vocabulary is far denser than the water vocabulary
 * (tariff blocks, maximum demand, meter readings), so the water spec loses and
 * the kilolitres are never extracted — the exact failure the matrix author
 * flagged.
 *
 * So when BOTH utilities are evidenced in one document, both specs are PINNED
 * into the candidate set regardless of score, element boost or a confident Pass-A
 * classification. Each spec's own prompt then refuses to carry the other's
 * figures across ("never carry an electricity figure into a water field on a
 * combined account"), so the result is one document yielding WATER fields and
 * GHG_ENERGY fields rather than one of the two silently scoring zero.
 */
const COMBINED_UTILITY_SIGNALS: Array<{ specId: string; pattern: RegExp }> = [
  {
    specId: 'ghg_energy__municipal_electricity_bill',
    pattern: /\bkwh\b|kilowatt|electricity|maximum demand|\bkva\b/i,
  },
  {
    specId: 'water__municipal_water_bill',
    pattern: /\bkl\b|kilolitre|water consumption|water meter|sanitation|sewerage/i,
  },
];

/** Spec ids that must appear in the candidate set whatever the ranking says. */
function pinnedSpecIds(domain: ExtractionDomain, haystack: string): string[] {
  if (domain !== 'esg') return [];
  const matched = COMBINED_UTILITY_SIGNALS.filter((s) => s.pattern.test(haystack));
  // One utility is an ordinary bill and needs no help. Two on one document is
  // the combined account.
  return matched.length >= 2 ? matched.map((s) => s.specId) : [];
}

export interface SpecCandidate {
  spec: VerificationDocument;
  score: number;
}

/** The ESG matrix's candidates — same shape, its own document type. */
export interface EsgSpecCandidate {
  spec: EsgDocument;
  score: number;
}

export interface RankOptions {
  limit?: number;
  elementHint?: string;
  elementOverride?: RoutableElement;
  /** Which matrix to rank against. Defaults to the B-BBEE matrix. */
  domain?: ExtractionDomain;
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
  options?: RankOptions & { domain?: 'bbbee' },
): SpecCandidate[];
export function rankSpecsForDocument(
  text: string,
  filename: string,
  options: RankOptions & { domain: 'esg' },
): EsgSpecCandidate[];
export function rankSpecsForDocument(
  text: string,
  filename: string,
  options: RankOptions,
): Array<{ spec: DomainDocument; score: number }>;
export function rankSpecsForDocument(
  text: string,
  filename: string,
  options: RankOptions = {},
): Array<{ spec: DomainDocument; score: number }> {
  const domain = options.domain ?? 'bbbee';
  const { docs, idf, avgLength } = getIndex(domain);
  const queryTerms = tokenize(`${filename} ${text}`);
  // A model classification (Pass A) is authoritative where present: it read the
  // whole document and judged its element by meaning, which is strictly better
  // than the keyword regexes below. It only arrives when confident, so it never
  // overrides with a guess. Absent it, the keyword chain stands.
  const hintElement = options.elementOverride
    ?? elementFromHint(options.elementHint, domain)
    ?? elementFromHint(filename, domain)
    ?? elementFromContent(text, domain);

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

  const ranked = pool
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // PINS last, so nothing above changed: on a combined municipal account both
  // the electricity and the water spec are in the candidate set even if the
  // element boost, the pool filter or the limit would have dropped one. Empty
  // for B-BBEE, so this is a no-op there.
  const pins = pinnedSpecIds(domain, `${filename}\n${text}`);
  if (pins.length === 0) return ranked;

  const present = new Set(ranked.map((c) => c.spec.id));
  const missing = docs
    .filter(({ spec }) => pins.includes(spec.id) && !present.has(spec.id))
    .map(({ spec, termFreq, length }) => ({
      spec,
      score: bm25(queryTerms, { spec, termFreq, length }, idf, avgLength),
    }));
  return [...ranked, ...missing];
}

/** Convenience: just the spec ids, in rank order. */
export function selectSpecIds(
  text: string,
  filename: string,
  options: RankOptions = {},
): string[] {
  return rankSpecsForDocument(text, filename, options).map((c) => c.spec.id);
}
