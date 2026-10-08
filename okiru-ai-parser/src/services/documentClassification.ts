/**
 * Pass A — model classification. "What IS this document?"
 *
 * Routing used to be BM25 token-matching (specRetrieval) plus sheet-name and
 * content regexes (elementFromHint / elementFromContent). That is the exact
 * "character classifier" failure the schema-driven approach exists to end: a
 * financial statement that contains the words "procurement spend" was routed to
 * the supplier-spend specs and extracted nothing, because a keyword counter
 * cannot tell what a document is FOR.
 *
 * This asks the model instead — the one question it is uniquely good at:
 * "reading the whole document at once, which scorecard element is this evidence
 * for?" The answer is a MAPPING (an element + a human label + a confidence),
 * never a value. Code still decides what scores. The model's element becomes the
 * routing signal; BM25 remains as recall/fallback, so this only ever ADDS
 * precision and can never route worse than before:
 *   - no model configured           → null, caller falls back to BM25
 *   - the call fails                 → null, caller falls back to BM25
 *   - low confidence / OTHER         → null, caller falls back to BM25
 *
 * A workbook SHEET already states its element in its name (authoritative and
 * free), so the caller only pays for this on ANONYMOUS documents — a scanned
 * certificate, an AFS PDF, a share register with no sheet name — which is
 * exactly where keyword routing was weakest.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import type { VerificationElement } from '../../schemas/verification_document_matrix.js';
import type { EsgElement } from '../../schemas/esg_document_matrix.js';
import type { ExtractionDomain, RoutableElement } from './extractionDomain.js';
import { parseModelJson } from './aiExtraction.js';
import { extractionDomain, type DomainDocument } from './extractionDomain.js';
import { skillMenuLines } from './skills.js';

const logger = createLogger('DocumentClassification');

/** The element a document serves, plus the non-element outcomes. */
export type ClassifiedElement = VerificationElement | EsgElement | 'FINANCIALS' | 'OTHER';

const ELEMENT_KEYS: ClassifiedElement[] = [
  'OWNERSHIP',
  'MANAGEMENT_CONTROL',
  'SKILLS_DEVELOPMENT',
  'ESD',
  'SED',
  'FINANCIALS',
  'OTHER',
];

/**
 * The ESG menu. `FINANCIAL` is a real ESG element (the denominators every ESG
 * ratio divides by), not the B-BBEE `FINANCIALS` escape hatch — so ESG has only
 * ONE non-element outcome, `OTHER`.
 */
const ESG_ELEMENT_KEYS: ClassifiedElement[] = [
  'GHG_ENERGY',
  'FLEET',
  'WASTE',
  'WATER',
  'ISO_ENVIRONMENTAL',
  'EMPLOYMENT_EQUITY',
  'HEALTH_SAFETY',
  'TRAINING',
  'COMMUNITY_CSI',
  'SUPPLIER_ESG',
  'BOARD_GOVERNANCE',
  'ETHICS_COMPLIANCE',
  'RISK_ASSURANCE',
  'FINANCIAL',
  'OTHER',
];

export interface DocumentClassificationResult {
  element: ClassifiedElement;
  /** A short human label for the document ("Share register", "AFS extract"). */
  documentType: string;
  /** 0..1 — the caller ignores anything below CONFIDENCE_FLOOR. */
  confidence: number;
  /**
   * The document type, when the model recognised one of the types the domain's
   * skills describe (their "is / is not" lines are on the menu): the skill id.
   * The caller turns it into the spec to extract with (specForSkill), so the
   * extraction no longer depends on keyword retrieval for that document.
   */
  skillId?: string;
}

/**
 * The skills menu appended to Pass A's system prompt: one entry per skill, with
 * what the type is, what it is NOT, and what to look for. Empty when the domain
 * has no skills (ESG today, or PARSER_SKILLS=off), so the prompt is unchanged.
 */
export function skillsMenu(domain: ExtractionDomain): string {
  const skills = extractionDomain(domain).skills()?.skills ?? [];
  if (skills.length === 0) return '';
  return [
    '',
    'DOCUMENT TYPES an expert has written a reading guide for. When the document is clearly ONE of',
    'these, also return its id as "document_type_id"; otherwise "document_type_id": null.',
    ...skills.map((skill) => `- ${skill.id}:\n${skillMenuLines(skill)}`),
    'The id must be copied exactly from this list. A type that is only similar is not it.',
    '"element" is always one of the ELEMENT keys above and "document_type" a short label: a type id goes ONLY in "document_type_id".',
  ].join('\n');
}

/** The JSON contract line both domain prompts state. */
const CONTRACT = 'Return ONLY JSON: {"element": <KEY>, "document_type": "<short label>", "confidence": <0..1>}.';
/** The same contract when a skills menu follows: the fourth key is part of the ONE shape asked for. */
const CONTRACT_WITH_TYPE_ID = 'Return ONLY JSON: {"element": <KEY>, "document_type": "<short label>", "document_type_id": <an id from DOCUMENT TYPES below, or null>, "confidence": <0..1>}.';

/**
 * Pass A's system prompt for a domain. With no skills (ESG today, or
 * PARSER_SKILLS=off) it is the domain prompt exactly as before; with a skills
 * menu the contract line names "document_type_id" too — a menu that asks for a
 * key the contract line leaves out gets the id back in the wrong key.
 */
export function passASystemPrompt(domain: ExtractionDomain): string {
  const base = domain === 'esg' ? ESG_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const menu = skillsMenu(domain);
  if (!menu) return base;
  return base.replace(CONTRACT, CONTRACT_WITH_TYPE_ID) + menu;
}

/**
 * The menu, with the DESCRIPTIONS that activate meaning-based routing — the same
 * mechanism as a schema field description. Each line tells the model what kinds
 * of evidence belong to that element regardless of how the document words itself.
 */
const SYSTEM_PROMPT = [
  'You are a B-BBEE verification analyst. Classify ONE client document into the',
  'scorecard ELEMENT it is primarily evidence FOR. Read the whole document — its',
  'layout, headings and tables — and judge by MEANING, never by a single keyword.',
  '',
  CONTRACT,
  '',
  'ELEMENT keys and what belongs to each:',
  '- OWNERSHIP: shareholders, share register / certificate, voting & economic rights, CIPC / MOI / COR forms, beneficial interest.',
  '- MANAGEMENT_CONTROL: directors and employees, employment equity, occupational levels, board composition, EEA2 / EEA4 reports, headcount / payroll registers.',
  '- SKILLS_DEVELOPMENT: training, learnerships / apprenticeships, WSP / ATR, SETA, bursaries, the leviable amount / SDL return (EMP201).',
  '- ESD: suppliers and preferential procurement spend, enterprise & supplier development, supplier B-BBEE certificates / affidavits, spend schedules, creditor ledgers.',
  '- SED: socio-economic development, CSI, community / charitable / public-benefit beneficiaries.',
  '- FINANCIALS: annual financial statements, income statement / P&L, revenue / turnover, NPBT / NPAT, annual payroll totals, total measured procurement spend. A financial statement is FINANCIALS even when it lists procurement spend.',
  '- OTHER: not B-BBEE scorecard evidence (a cover letter, an unrelated invoice, junk).',
  '',
  'Rules:',
  '- Choose the SINGLE best element. If the document genuinely carries several (a full information-gathering workbook), pick the one it is MOST about and set confidence below 0.5.',
  '- confidence is how sure you are (0..1). Ambiguous or mixed → below 0.5.',
  '- Never invent content; classify only from what the document shows.',
].join('\n');

/**
 * The ESG menu, written to the same rule: each line says what KIND of evidence
 * belongs to an element regardless of how the document words itself.
 *
 * The combined municipal account is called out explicitly. Forcing a
 * water-and-electricity statement into one element is how the kilolitres get
 * lost, so the model is told to report low confidence instead — which drops the
 * override and lets both specs through (specRetrieval pins them).
 */
const ESG_SYSTEM_PROMPT = [
  'You are an ESG assurance analyst. Classify ONE client document into the ESG',
  'data ELEMENT it is primarily evidence FOR. Read the whole document — its',
  'layout, headings and tables — and judge by MEANING, never by a single keyword.',
  '',
  CONTRACT,
  '',
  'ELEMENT keys and what belongs to each:',
  '- GHG_ENERGY: electricity and utility accounts, solar generation, generator diesel, LPG, carbon tax returns, SBTi / net-zero targets, anything measured in kWh or tCO2e.',
  '- FLEET: vehicle registers, fuel card statements, telematics and driver debrief reports — per-vehicle and per-trip evidence.',
  '- WASTE: waste contractor reports, manifests, safe disposal certificates, recycling and diversion tonnages.',
  '- WATER: municipal water and sanitation accounts, kilolitres withdrawn, boreholes and alternative sources.',
  '- ISO_ENVIRONMENTAL: ISO 14001 certificates, environmental policy, aspects and impacts registers, environmental legal registers.',
  '- EMPLOYMENT_EQUITY: EEA2 / EEA4 returns, EE plans and forum minutes, headcount by race, gender and occupational level.',
  '- HEALTH_SAFETY: ISO 45001, injury statistics, LTIFR / TRIFR, safety committees, induction and OHS appointment registers.',
  '- TRAINING: WSP / ATR and SETA submissions, SDL and leviable payroll certificates, OFO training intervention registers.',
  '- COMMUNITY_CSI: CSI / SED spend records, beneficiary confirmations, NPO / PBO registrations, section 18A receipts.',
  '- SUPPLIER_ESG: supplier self-assessment questionnaires and supplier code-of-conduct acknowledgements — evidence ABOUT A SUPPLIER, not about this entity.',
  '- BOARD_GOVERNANCE: board charters and composition, committee terms of reference and minutes, King application registers, integrated annual reports.',
  '- ETHICS_COMPLIANCE: ethics and whistleblower policies and registers, anti-corruption training, POPIA / PAIA, regulatory penalties.',
  '- RISK_ASSURANCE: risk registers, IFRS S1 / S2 (ISSB) readiness assessments, external assurance statements.',
  '- FINANCIAL: annual financial statements and management accounts, revenue / NPAT / payroll, the entity\'s own B-BBEE certificate or affidavit.',
  '- OTHER: not ESG evidence (a cover letter, an unrelated invoice, junk).',
  '',
  'Rules:',
  '- Choose the SINGLE best element. If the document genuinely carries several, pick the one it is MOST about and set confidence below 0.5.',
  '- A COMBINED municipal account billing both electricity and water is two elements at once: set confidence below 0.5 so neither is discarded.',
  '- confidence is how sure you are (0..1). Ambiguous or mixed → below 0.5.',
  '- Never invent content; classify only from what the document shows.',
].join('\n');

/** Anonymous documents get a slightly larger window than one page — identity can
 *  sit in a letterhead, a title block or the first table. The whole document is
 *  not needed to know WHAT it is. */
const CLASSIFY_CHARS = 8000;

/** Below this the model is not sure enough to override BM25 — fall back. */
export const CONFIDENCE_FLOOR = 0.55;

/** Small content-hash cache so a re-uploaded document is not re-classified. */
const cache = new Map<string, DocumentClassificationResult | null>();
function cacheKey(filename: string, content: string, domain: ExtractionDomain): string {
  // Cheap, stable, collision-safe enough for a per-process cache.
  let h = 0;
  const s = `${filename} ${content}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  // The B-BBEE key is unprefixed so its cache behaviour is byte-identical; ESG
  // gets its own namespace because the SAME document classifies differently
  // against the two menus.
  return domain === 'esg' ? `esg:${h}:${content.length}` : `${h}:${content.length}`;
}

function normaliseElement(raw: unknown, keys: ClassifiedElement[]): ClassifiedElement | null {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (keys as string[]).includes(v) ? (v as ClassifiedElement) : null;
}

/** Whether Pass A runs. On by default; PARSER_MODEL_CLASSIFY=false disables it. */
export function modelClassificationEnabled(): boolean {
  return process.env.PARSER_MODEL_CLASSIFY !== 'false';
}

/**
 * Classify one document. Returns null (→ caller falls back to BM25) when the
 * model is unavailable, the call fails, the reply is unusable, or the model is
 * not confident enough to override keyword routing.
 */
export async function classifyDocument(
  model: ExtractionModel,
  input: { filename: string; markdown?: string; raw_text?: string },
  options: { domain?: ExtractionDomain } = {},
): Promise<DocumentClassificationResult | null> {
  if (!modelClassificationEnabled()) return null;
  const domain = options.domain ?? 'bbbee';
  const content = String(input.markdown?.trim() || input.raw_text || '').slice(0, CLASSIFY_CHARS);
  if (content.trim().length < 20) return null;

  const key = cacheKey(input.filename, content, domain);
  if (cache.has(key)) return cache.get(key) ?? null;

  const user = `DOCUMENT: ${input.filename}\n\n${content}`;
  let reply: string;
  try {
    reply = await model.complete(passASystemPrompt(domain), user);
  } catch (err) {
    logger.warn('Document classification failed — falling back to BM25 routing', {
      file: input.filename, reason: (err as Error).message,
    });
    cache.set(key, null);
    return null;
  }

  const parsed = parseModelJson(reply);
  const elementKeys = domain === 'esg' ? ESG_ELEMENT_KEYS : ELEMENT_KEYS;
  // Only an id from the menu counts: an invented or misspelled one is no type.
  const menu = extractionDomain(domain).skills()?.skills ?? [];
  const menuSkill = (raw: unknown) => {
    const id = String(raw ?? '').trim();
    return id ? menu.find((s) => s.id === id) ?? null : null;
  };
  // The id belongs in document_type_id. A reply that put it in document_type
  // (exactly a menu id, never a label that only resembles one) or in element
  // still named the type; in element it also names the element: the skill's own.
  const skillInElement = menuSkill(parsed?.element);
  const skill = menuSkill(parsed?.document_type_id) ?? menuSkill(parsed?.document_type) ?? skillInElement;
  const element = normaliseElement(parsed?.element, elementKeys)
    ?? (skillInElement ? normaliseElement(skillInElement.element, elementKeys) : null);
  if (!parsed || !element) {
    cache.set(key, null);
    return null;
  }
  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  const documentType = String(parsed.document_type ?? '').trim().slice(0, 80) || element;

  const skillId = skill?.id;
  const result: DocumentClassificationResult = { element, documentType, confidence, ...(skillId ? { skillId } : {}) };
  cache.set(key, result);
  logger.info('Document classified by model', { file: input.filename, element, confidence, documentType });
  return result;
}

/**
 * The routing element from a classification: a real scorecard element the spec
 * router can use, or null when the model chose FINANCIALS / OTHER or was not
 * confident enough to override BM25.
 */
export function routingElement(cls: DocumentClassificationResult | null): RoutableElement | null {
  if (!cls || cls.confidence < CONFIDENCE_FLOOR) return null;
  // 'FINANCIALS' (plural) is the B-BBEE non-element bucket. ESG's 'FINANCIAL'
  // (singular) is a real element and routes normally.
  if (cls.element === 'FINANCIALS' || cls.element === 'OTHER') return null;
  return cls.element;
}

/**
 * The ONE spec to extract a document with when Pass A named its type (a skill
 * id), or null to leave the choice to retrieval. One spec, not every spec the
 * skill reads: a payroll read three times under three matrix specs is three
 * paid calls for the same values. Preference: the skill's spec in the element
 * Pass A routed to, then its first matrix spec, then the type the skill itself
 * declares (a new type, or a canonical type no matrix spec covers).
 */
export function specForSkill(
  cls: DocumentClassificationResult | null,
  domain: ExtractionDomain = 'bbbee',
): DomainDocument | null {
  if (!cls?.skillId || cls.confidence < CONFIDENCE_FLOOR) return null;
  const definition = extractionDomain(domain);
  const skill = definition.skills()?.skills.find((s) => s.id === cls.skillId);
  if (!skill) return null;
  const specs = skill.appliesTo
    .map((id) => definition.matrix.find((doc) => doc.id === id) ?? null)
    .filter((doc): doc is DomainDocument => doc !== null);
  const element = routingElement(cls);
  return specs.find((doc) => doc.element === element) ?? specs[0] ?? definition.findDocumentById(skill.id);
}

/** Test seam: clear the per-process classification cache. */
export function resetClassificationCacheForTest(): void {
  cache.clear();
}
