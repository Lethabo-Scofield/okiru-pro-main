/**
 * Map resolved entities onto calculator keys — the step that turns extraction
 * into a score.
 *
 * Extraction produces the expert's field names (`entity_name`,
 * `sum_of_leviable_amount`, `black_ownership_percentage`). The scorecard consumes
 * an allowlisted set of calculator keys (`ownership.entity_name`,
 * `skills.total_spend`, ...). This is the deliberate, auditable bridge between
 * them.
 *
 * FOUR RULES, ALL ABOUT NOT CORRUPTING A SCORE
 *
 * 1. NOTHING IS INFERRED. Mappings are declared below, one line per field. A
 *    field with no declared mapping does not reach the calculator — it is
 *    reported as unmapped. Guessing that `total_shares_in_issue` means
 *    `ownership.black_ownership` is how a wrong B-BBEE level gets certified.
 *
 * 2. CONFLICTED FIELDS NEVER MAP. If two files disagree on NPAT, the case does
 *    not yet know what NPAT is, so nothing is scored from it. It goes to review.
 *    A silently broken tie is indistinguishable from a fact.
 *
 * 3. CONTEXT DECIDES. `entity_name` on a supplier's certificate is
 *    `supplier.name`; on the client's own CIPC record it is
 *    `ownership.entity_name`. The same field name means different things
 *    depending on which document produced it, so mappings may be scoped by the
 *    matrix element.
 *
 * 4. THE ALLOWLIST IS FINAL. Every candidate goes through admitCalculatorEntry,
 *    so a mapping error cannot inject an arbitrary calculator path.
 */
import { createLogger } from '../logger.js';
import {
  admitCalculatorEntry,
  calculatorKeySpec,
  CALCULATOR_KEY_ALLOWLIST,
} from '../../schemas/calculator_allowlist.js';
import type { ExtractionModel } from './aiExtraction.js';
import { proposeFieldMappings, type MappableKey } from './semanticFieldMapping.js';
import type { CaseEntities } from './entityResolution.js';
import { findDocumentById, type VerificationElement } from '../../schemas/verification_document_matrix.js';

const logger = createLogger('EntityCalculatorMapping');

interface FieldMapping {
  /** Extracted field name, as the expert's prompt names it. */
  field: string;
  /** Allowlisted calculator key it feeds. */
  calculatorKey: string;
  /**
   * Restrict to fields that came from these elements. Omit for unambiguous
   * fields whose meaning does not change with the document.
   */
  elements?: VerificationElement[];
  /** How to turn the extracted value into the calculator's runtime type. */
  coerce: 'text' | 'number' | 'percentage' | 'money' | 'bee_level' | 'iso_date';
}

/**
 * The mapping table.
 *
 * Deliberately conservative: only fields whose meaning is unambiguous and whose
 * target key already exists in the allowlist. Most of the 109 documents carry
 * evidence an auditor needs but the scorecard does not consume directly (a WSP
 * submission acknowledgement proves compliance; no calculator key takes it), so
 * partial coverage here is correct, not a gap to be filled by guessing.
 */
const FIELD_MAPPINGS: FieldMapping[] = [
  // ── The measured entity ──
  { field: 'entity_name', calculatorKey: 'ownership.entity_name', elements: ['OWNERSHIP', 'SKILLS_DEVELOPMENT'], coerce: 'text' },
  { field: 'measured_entity_name', calculatorKey: 'ownership.entity_name', coerce: 'text' },

  // ── Ownership ──
  { field: 'black_ownership', calculatorKey: 'ownership.black_ownership', elements: ['OWNERSHIP'], coerce: 'percentage' },
  { field: 'black_ownership_percentage', calculatorKey: 'ownership.black_ownership', elements: ['OWNERSHIP'], coerce: 'percentage' },
  { field: 'black_women_ownership', calculatorKey: 'ownership.black_women_ownership', elements: ['OWNERSHIP'], coerce: 'percentage' },
  { field: 'black_women_ownership_percentage', calculatorKey: 'ownership.black_women_ownership', elements: ['OWNERSHIP'], coerce: 'percentage' },

  // ── Management control ──
  { field: 'black_representation_percentage', calculatorKey: 'management.black_representation', elements: ['MANAGEMENT_CONTROL'], coerce: 'percentage' },
  { field: 'black_women_representation_percentage', calculatorKey: 'management.black_women_representation', elements: ['MANAGEMENT_CONTROL'], coerce: 'percentage' },

  // ── Skills development ──
  // The Leviable Amount is the DENOMINATOR (the SDL payroll base), not spend.
  // It was previously mapped to skills.total_spend — the numerator — which
  // would have reported training spend as 100% of payroll and scored the pillar
  // full marks on an EMP201 alone. It has its own key since Phase 1b; the wrong
  // mapping is removed rather than left to shadow the right one.
  { field: 'total_training_spend', calculatorKey: 'skills.total_spend', elements: ['SKILLS_DEVELOPMENT'], coerce: 'money' },
  { field: 'black_training_spend', calculatorKey: 'skills.black_spend', elements: ['SKILLS_DEVELOPMENT'], coerce: 'money' },

  // ── Supplier evidence (ESD / procurement) ──
  { field: 'supplier_name', calculatorKey: 'supplier.name', coerce: 'text' },
  // A sworn EME/QSE affidavit names the supplier `supplier_entity`; a
  // verification certificate states the level as `certificate_recognition_level`.
  // Both are the expert's own field names (matrix-verified) — without these the
  // two most common supplier evidence documents produced nameless / level-less
  // supplier records.
  { field: 'supplier_entity', calculatorKey: 'supplier.name', elements: ['ESD'], coerce: 'text' },
  { field: 'bee_status_level', calculatorKey: 'supplier.bee_level', elements: ['ESD'], coerce: 'bee_level' },
  { field: 'bee_level', calculatorKey: 'supplier.bee_level', elements: ['ESD'], coerce: 'bee_level' },
  { field: 'certificate_recognition_level', calculatorKey: 'supplier.bee_level', elements: ['ESD'], coerce: 'bee_level' },
  { field: 'certificate_expiry_date', calculatorKey: 'supplier.certificate_expiry', elements: ['ESD'], coerce: 'iso_date' },
  { field: 'expiry_date', calculatorKey: 'supplier.certificate_expiry', elements: ['ESD'], coerce: 'iso_date' },
  { field: 'total_claimed_spend', calculatorKey: 'supplier.spend', elements: ['ESD'], coerce: 'money' },

  // ── Socio-economic development ──
  { field: 'beneficiary_name', calculatorKey: 'sed.beneficiary_name', elements: ['SED'], coerce: 'text' },
  { field: 'total_sed_contributions', calculatorKey: 'sed.contribution', elements: ['SED'], coerce: 'money' },
  { field: 'contribution_amount', calculatorKey: 'sed.contribution', elements: ['SED'], coerce: 'money' },
  // Proof-of-payment (cash grant / donation) names its figure `amount_paid`.
  { field: 'amount_paid', calculatorKey: 'sed.contribution', elements: ['SED'], coerce: 'money' },

  // ────────────────────────────────────────────────────────────────────────
  // Mapped onto the keys derived in Phase 1b, using the field names the
  // EXPERT'S PROMPTS actually ask for (verified against the 109-document
  // matrix, not invented). Before this, these extracted correctly and reported
  // `no_mapping` because the allowlist had nowhere to put them.
  // ────────────────────────────────────────────────────────────────────────

  // ── DENOMINATORS. Each one zeroes an entire pillar when absent, however many
  //    rows were extracted: Thandanani held all 23 supplier rows and scored 0
  //    for Procurement because TMPS was missing.
  { field: 'total_pre_exclusions_tmps', calculatorKey: 'procurement.tmps', elements: ['ESD'], coerce: 'money' },
  // The Finance sheet's own stated post-exclusion TMPS — the labelled figure,
  // read deterministically. Listed BEFORE nothing in particular: resolution
  // between this and the model-computed field happens downstream, where the
  // labelled source is preferred.
  { field: 'total_measured_procurement_spend', calculatorKey: 'procurement.tmps', elements: ['ESD'], coerce: 'money' },
  { field: 'sum_of_leviable_amount', calculatorKey: 'skills.leviable_amount', elements: ['SKILLS_DEVELOPMENT'], coerce: 'money' },
  { field: 'total_entity_value', calculatorKey: 'ownership.company_value', elements: ['OWNERSHIP'], coerce: 'money' },
  { field: 'current_year_revenue', calculatorKey: 'entity.revenue', coerce: 'money' },
  { field: 'current_year_npat', calculatorKey: 'entity.npat', coerce: 'money' },

  // ── Share register: a TABLE, one row per holder ──
  { field: 'holder_name', calculatorKey: 'ownership.shareholder_name', elements: ['OWNERSHIP'], coerce: 'text' },
  { field: 'total_shares_in_issue', calculatorKey: 'ownership.total_shares_in_issue', elements: ['OWNERSHIP'], coerce: 'number' },
  { field: 'number_of_shares', calculatorKey: 'ownership.shares_held', elements: ['OWNERSHIP'], coerce: 'number' },
  { field: 'total_economic_interest_received', calculatorKey: 'ownership.economic_interest', elements: ['OWNERSHIP'], coerce: 'percentage' },
  { field: 'declared_race', calculatorKey: 'ownership.race', elements: ['OWNERSHIP'], coerce: 'text' },

  // ── Employee register ──
  { field: 'employee_name', calculatorKey: 'management.employee_name', elements: ['MANAGEMENT_CONTROL'], coerce: 'text' },
  { field: 'id_number', calculatorKey: 'management.id_number', elements: ['MANAGEMENT_CONTROL'], coerce: 'text' },
  { field: 'derived_gender', calculatorKey: 'management.gender', elements: ['MANAGEMENT_CONTROL'], coerce: 'text' },

  // ── Skills ──
  { field: 'learner_name', calculatorKey: 'skills.learner_name', elements: ['SKILLS_DEVELOPMENT'], coerce: 'text' },
  { field: 'total_skills_dev_spend', calculatorKey: 'skills.total_spend', elements: ['SKILLS_DEVELOPMENT'], coerce: 'money' },

  // ── Procurement / ESD ──
  { field: 'claimed_spend_ex_vat', calculatorKey: 'procurement.supplier_spend', elements: ['ESD'], coerce: 'money' },
  { field: 'amount_ex_vat', calculatorKey: 'procurement.supplier_spend', elements: ['ESD'], coerce: 'money' },
  { field: 'contribution_value', calculatorKey: 'esd.contribution', elements: ['ESD'], coerce: 'money' },
  { field: 'contribution_type', calculatorKey: 'esd.contribution_type', elements: ['ESD'], coerce: 'text' },
];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "R 4 157 140", "1,250.50", 51 → number. Null when it is not a number. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  // Negative values appear in brackets in financial statements: (4 157 140).
  const negative = /^\(.*\)$/.test(value.trim());
  const cleaned = value.replace(/[()]/g, '').replace(/[R$€£\s,%]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

/** "15 March 2026", "2026-03-14", "14/03/2027" → ISO. Null if unparseable. */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return Number.isNaN(new Date(text).getTime()) ? null : text;
  }

  const longForm = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (longForm) {
    const month = MONTHS[longForm[2].slice(0, 3).toLowerCase()];
    if (month) return `${longForm[3]}-${month}-${longForm[1].padStart(2, '0')}`;
  }

  // Day-first: South African documents are dd/mm/yyyy, never mm/dd/yyyy.
  const slashed = text.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${slashed[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

/** "Level 4 Contributor", "4", 4 → 4. Null outside 1-8. */
function toBeeLevel(value: unknown): number | null {
  const direct = toNumber(value);
  if (direct !== null) return Number.isInteger(direct) && direct >= 1 && direct <= 8 ? direct : null;

  if (typeof value !== 'string') return null;
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  const match = value.toLowerCase().match(/level\s*(\d+|one|two|three|four|five|six|seven|eight)/);
  if (!match) return null;
  const level = words[match[1]] ?? Number(match[1]);
  return Number.isInteger(level) && level >= 1 && level <= 8 ? level : null;
}

function coerce(mapping: FieldMapping, value: unknown): unknown {
  switch (mapping.coerce) {
    case 'text':
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    case 'number':
    case 'money':
      return toNumber(value);
    case 'percentage': {
      const parsed = toNumber(value);
      if (parsed === null) return null;
      // A ratio written as 0.3215 is the same claim as 32.15%. Percentages here
      // are 0-100, and a genuine 0.32% ownership stake is not a thing anyone
      // scores, so treating sub-1 values as ratios is safe and catches a common
      // spreadsheet representation.
      const percentage = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
      return percentage >= 0 && percentage <= 100 ? Number(percentage.toFixed(4)) : null;
    }
    case 'bee_level':
      return toBeeLevel(value);
    case 'iso_date':
      return toIsoDate(value);
    default:
      return null;
  }
}

export interface MappedCalculatorEntry {
  key: string;
  value: unknown;
  sourceField: string;
  sourceFiles: string[];
  agreementCount: number;
  /**
   * True when the destination was decided by the semantic pass rather than by a
   * declared mapping. The value itself is still the grounded, extracted one —
   * but a human chose none of these, so the UI marks them for review.
   */
  viaSemanticMapping?: boolean;
}

export interface CalculatorMappingResult {
  /** Ready for the calculator: allowlisted key → typed value. */
  payload: Record<string, unknown>;
  /** Provenance for every mapped key. */
  entries: MappedCalculatorEntry[];
  /** Extracted but not mapped, with why — the honest coverage report. */
  unmapped: Array<{ field: string; reason: 'no_mapping' | 'conflicted' | 'uncoercible' | 'rejected_by_allowlist' }>;
  /** Fields held back for human review because sources disagreed. */
  needsReview: Array<{ field: string; values: unknown[]; sources: string[] }>;
}

/**
 * Map a resolved case onto a calculator payload.
 *
 * `documentElements` maps a matrix document id → its element, so a field can be
 * scoped to the context it came from.
 */
export function mapEntitiesToCalculator(
  entities: CaseEntities,
  fieldElements: Map<string, Set<VerificationElement>>,
): CalculatorMappingResult {
  const payload: Record<string, unknown> = {};
  const entries: MappedCalculatorEntry[] = [];
  const unmapped: CalculatorMappingResult['unmapped'] = [];
  const needsReview: CalculatorMappingResult['needsReview'] = [];

  for (const resolved of Object.values(entities.fields)) {
    // Rule 2: a contested value is not a fact yet.
    if (resolved.conflicted) {
      needsReview.push({
        field: resolved.field,
        values: [resolved.value, ...resolved.alternatives.map((alt) => alt.value)],
        sources: [...resolved.sources, ...resolved.alternatives.flatMap((alt) => alt.sources)],
      });
      unmapped.push({ field: resolved.field, reason: 'conflicted' });
      continue;
    }

    const elements = fieldElements.get(resolved.field) ?? new Set<VerificationElement>();
    const mapping = FIELD_MAPPINGS.find((candidate) =>
      candidate.field === resolved.field
      && (!candidate.elements || candidate.elements.some((element) => elements.has(element))));

    if (!mapping) {
      unmapped.push({ field: resolved.field, reason: 'no_mapping' });
      continue;
    }

    const value = coerce(mapping, resolved.value);
    if (value === null) {
      unmapped.push({ field: resolved.field, reason: 'uncoercible' });
      continue;
    }

    // Rule 4: the allowlist is the last word, whatever the table above says.
    const admission = admitCalculatorEntry(mapping.calculatorKey, value);
    if (!admission.accepted) {
      logger.warn('Mapped value rejected by calculator allowlist', {
        key: mapping.calculatorKey,
        field: resolved.field,
        reason: admission.reason,
      });
      unmapped.push({ field: resolved.field, reason: 'rejected_by_allowlist' });
      continue;
    }

    // First mapping wins; a later field must not silently overwrite a key that
    // more documents corroborated.
    const existing = entries.find((entry) => entry.key === mapping.calculatorKey);
    if (existing && existing.agreementCount >= resolved.agreementCount) continue;
    if (existing) entries.splice(entries.indexOf(existing), 1);

    payload[mapping.calculatorKey] = value;
    entries.push({
      key: mapping.calculatorKey,
      value,
      sourceField: resolved.field,
      sourceFiles: resolved.sources,
      agreementCount: resolved.agreementCount,
    });
  }

  return { payload, entries, unmapped, needsReview };
}

/**
 * The keys the semantic pass is allowed to choose from, described in the
 * allowlist's own words so the model is never told about a key the code would
 * then reject.
 */
function mappableKeys(): MappableKey[] {
  return CALCULATOR_KEY_ALLOWLIST.map((spec) => ({ key: spec.key, description: spec.description }));
}

/**
 * How to coerce a value whose destination the semantic pass chose.
 *
 * There is no declared `coerce` for these, so it is derived from the key's own
 * allowlist spec. A key whose description says "percentage" gets percentage
 * handling, which is what keeps a 0-1 ratio from being scored as a fraction of
 * a percent.
 */
function coercionForKey(key: string): FieldMapping['coerce'] {
  const spec = calculatorKeySpec(key);
  if (!spec) return 'text';
  if (spec.type === 'iso_date') return 'iso_date';
  if (spec.type === 'string') return 'text';
  return /percentage|percent|%/i.test(spec.description) ? 'percentage' : 'number';
}

/**
 * Declared mapping first, semantic placement for the leftovers.
 *
 * Runs `mapEntitiesToCalculator` unchanged, then offers ONLY the fields it
 * reported `no_mapping` to the model. A proposal has to survive the same
 * coercion and the same allowlist as any declared mapping, and can never
 * displace a key a declared mapping already filled.
 *
 * With no model this is `mapEntitiesToCalculator` exactly.
 */
export async function mapEntitiesToCalculatorWithSemantics(
  entities: CaseEntities,
  fieldElements: Map<string, Set<VerificationElement>>,
  model: ExtractionModel | null,
): Promise<CalculatorMappingResult> {
  const base = mapEntitiesToCalculator(entities, fieldElements);

  const orphans = base.unmapped.filter((u) => u.reason === 'no_mapping').map((u) => u.field);
  if (orphans.length === 0 || !model) return base;

  const proposals = await proposeFieldMappings(model, orphans, mappableKeys(), {
    context: 'a B-BBEE verification evidence pack',
  });
  if (Object.keys(proposals).length === 0) return base;

  const payload = { ...base.payload };
  const entries = [...base.entries];
  const unmapped: CalculatorMappingResult['unmapped'] = [];

  for (const orphan of base.unmapped) {
    const key = orphan.reason === 'no_mapping' ? proposals[orphan.field] : undefined;
    const resolved = key ? entities.fields[orphan.field] : undefined;
    if (!key || !resolved) {
      unmapped.push(orphan);
      continue;
    }

    const value = coerce({ field: orphan.field, calculatorKey: key, coerce: coercionForKey(key) }, resolved.value);
    if (value === null) {
      unmapped.push({ field: orphan.field, reason: 'uncoercible' });
      continue;
    }

    const admission = admitCalculatorEntry(key, value);
    if (!admission.accepted) {
      unmapped.push({ field: orphan.field, reason: 'rejected_by_allowlist' });
      continue;
    }

    // A declared mapping already owns this key: the human's answer stands and
    // the inferred one is reported as unplaced rather than silently dropped.
    if (entries.some((entry) => entry.key === key)) {
      unmapped.push(orphan);
      continue;
    }

    payload[key] = value;
    entries.push({
      key,
      value,
      sourceField: orphan.field,
      sourceFiles: resolved.sources,
      agreementCount: resolved.agreementCount,
      viaSemanticMapping: true,
    });
  }

  logger.info('Semantic pass placed fields the declared table did not cover', {
    orphans: orphans.length,
    placed: entries.length - base.entries.length,
  });

  return { ...base, payload, entries, unmapped };
}

/** Build the field → elements index from the per-document extractions. */
export function fieldElementIndex(
  extractions: Array<{ documentId: string; values: Array<{ field: string }> }>,
): Map<string, Set<VerificationElement>> {
  const index = new Map<string, Set<VerificationElement>>();
  for (const extraction of extractions) {
    const doc = findDocumentById(extraction.documentId);
    if (!doc) continue;
    for (const value of extraction.values) {
      const set = index.get(value.field) ?? new Set<VerificationElement>();
      set.add(doc.element);
      index.set(value.field, set);
    }
  }
  return index;
}

/** Keys the calculator understands but nothing in the case supplied. */
export function unfilledCalculatorKeys(payload: Record<string, unknown>): string[] {
  return CALCULATOR_KEYS.filter((key) => !(key in payload));
}

const CALCULATOR_KEYS = Array.from(new Set(FIELD_MAPPINGS.map((mapping) => mapping.calculatorKey)))
  .filter((key) => calculatorKeySpec(key) !== undefined);
