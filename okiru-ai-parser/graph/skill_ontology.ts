/**
 * THE SKILLS AS ONTOLOGY (Step 2.8): the typed fields and new document types
 * the per-document-type skills declare, made real document types and fields
 * for classification and the deterministic reader.
 *
 * The generated matrix is "do not edit", and the hand-authored canonical types
 * own the calculator keys, so the skills are a SUPPLEMENT merged on top:
 *
 *  1. A matrix type a skill reads gains the skill's document-level fields it
 *     does not already declare (the payroll's period and totals, the AFS's
 *     gross profit and accounting officer, the CIPC enterprise status...).
 *     Each is declared, never required, read only where the document LABELS it
 *     with the field's own name, and NOT identifying: a field
 *     every document of the type prints is no evidence of which type a
 *     document is, so classification scores stay what they were.
 *  2. A type the matrix does not have, declared by a skill's `newType` (the
 *     beneficial interest register, the company profile), becomes a document
 *     type with its own name and aliases and the same kind of fields. Its
 *     pillar is the skill's element.
 *  3. When a new type is a narrower kind of an existing umbrella type
 *     (`narrows`), the umbrella gives up the aliases the new type now owns, so
 *     a beneficial interest register is no longer also an "Ownership
 *     Confirmation" by name.
 *
 * Nothing here carries a calculator key: these fields are read and reported,
 * and reach a score only through the mapping tables, which say so explicitly.
 * With PARSER_SKILLS=off the supplement is empty and every type is as before.
 */
import { createLogger } from '../src/logger.js';
import { activeSkills, normaliseTypeLabel, type Skill, type SkillField, type SkillFieldType } from '../src/services/skills.js';
import type { ParserDataType } from '../schemas/document_types.js';
import type { DocumentKnowledge, FieldKnowledge } from './ontology_models.js';
import { MATRIX_GRAPH_VERSION } from './matrix_ontology.js';

const logger = createLogger('SkillOntology');

const GRAPH_VERSION = 'skills-v1';

const DATA_TYPE: Record<SkillFieldType, ParserDataType> = {
  text: 'string',
  date: 'date',
  money: 'money',
  percent: 'percentage',
  count: 'number',
  // An ESG quantity in a unit (kWh, litres); no B-BBEE skill declares one.
  number: 'number',
  // Identifiers are text; their check digits are verified by checksums.ts.
  regno: 'string',
  idno: 'string',
  bool: 'boolean',
  level: 'bee_level',
};

const ELEMENT_TO_PILLAR: Record<string, string> = {
  OWNERSHIP: 'OWN',
  MANAGEMENT_CONTROL: 'MAC',
  SKILLS_DEVELOPMENT: 'SKL',
  ESD: 'ESD',
  SED: 'SED',
  FINANCIALS: 'FIN',
  OTHER: 'OTH',
};

/**
 * A skill field as an ontology field: declared, not required, labelled-only,
 * not identifying, and read only under ITS OWN NAME as a printed label
 * ("Gross profit: …" for gross_profit; extract_fields' form-label read, with
 * its whole-word, same-line and type guards).
 *
 * The skill's other wordings are deliberately NOT patterns here. On the real
 * evidence pack they read a CIPC disclosure's column headers as an auditor's
 * name, a status column's "= Resign" as the enterprise status, and a page
 * number as the accounting officer: a model reading the wording in context
 * tells those apart, a label regex does not. The wordings reach the model
 * through the skill's prompt instead.
 */
export function skillFieldKnowledge(skill: Skill, field: SkillField): FieldKnowledge {
  return {
    field: {
      name: field.name,
      data_type: DATA_TYPE[field.type],
      required: false,
      identifying: false,
      labelled_only: true,
      separator_required: true,
      description: `${field.description} (skill ${skill.id})`,
      graph_version: GRAPH_VERSION,
    },
    rules: [],
    patterns: [],
    calculator_requirements: [],
  };
}
/**
 * The skill's document-level fields a type does not already declare. Row
 * columns are left to the table readers: one value per document is not a row.
 */
export function skillFieldSupplement(skill: Skill, alreadyDeclared: Iterable<string>): FieldKnowledge[] {
  const declared = new Set(alreadyDeclared);
  return skill.fields
    .filter((field) => !field.rowLevel && !declared.has(field.name))
    .map((field) => skillFieldKnowledge(skill, field));
}

/** A skill's `newType` as a document type, or null when it declares none. */
export function skillTypeKnowledge(skill: Skill): DocumentKnowledge | null {
  if (!skill.newType) return null;
  return {
    document: {
      name: skill.newType.name,
      // The name, not the prose: classifier confidence scores description
      // tokens as matched/total (matrix_ontology.ts keeps matrix types the same way).
      description: skill.newType.name,
      aliases: [...skill.newType.aliases],
      required: false,
      pillar_code: ELEMENT_TO_PILLAR[skill.element] ?? 'OTH',
      graph_version: GRAPH_VERSION,
    },
    fields: skillFieldSupplement(skill, []),
  };
}

/**
 * The knowledge with the skills merged in (see the header). Pure apart from
 * reading the skills; a skills directory that cannot be read leaves the
 * knowledge exactly as it was (the server's boot check is the loud one).
 */
export function withSkillSupplement(knowledge: DocumentKnowledge[]): DocumentKnowledge[] {
  let skills: Skill[];
  try {
    skills = activeSkills('bbbee')?.skills ?? [];
  } catch (err) {
    logger.warn('Skills could not be read for the ontology; types are left as they were', { reason: (err as Error).message });
    return knowledge;
  }
  if (skills.length === 0) return knowledge;

  const registry = activeSkills('bbbee')!;
  const newTypes = skills.map(skillTypeKnowledge).filter((k): k is DocumentKnowledge => k !== null);
  // Labels an umbrella type gives up to the narrower new types that own them.
  const ceded = new Map<string, Set<string>>();
  for (const skill of skills) {
    if (!skill.newType?.narrows) continue;
    const set = ceded.get(skill.newType.narrows) ?? new Set<string>();
    for (const label of [skill.newType.name, ...skill.newType.aliases]) set.add(normaliseTypeLabel(label));
    ceded.set(skill.newType.narrows, set);
  }

  const supplemented = knowledge.map((known) => {
    const lost = ceded.get(known.document.name);
    const aliases = lost
      ? known.document.aliases.filter((alias) => !lost.has(normaliseTypeLabel(alias)))
      : known.document.aliases;
    // Matrix types only. A canonical type (the B-BBEE certificate, the
    // affidavit) owns calculator keys and passes only when every field it
    // declares is read safely, so a field added to it would hold back the
    // payload of every certificate that does not print it.
    const skill = isCanonical(known) ? null : registry.skillFor(known.document.name);
    const extra = skill ? skillFieldSupplement(skill, known.fields.map((f) => f.field.name)) : [];
    if (!lost && extra.length === 0) return known;
    return {
      document: { ...known.document, aliases },
      fields: [...known.fields, ...extra],
    };
  });
  const taken = new Set(supplemented.map((known) => known.document.name.toLowerCase()));
  return [...supplemented, ...newTypes.filter((known) => !taken.has(known.document.name.toLowerCase()))];
}

/** A hand-authored canonical type: everything that is not a matrix type (matrix_ontology.ts stamps those). */
function isCanonical(known: DocumentKnowledge): boolean {
  return known.document.graph_version !== MATRIX_GRAPH_VERSION;
}

/** The skill fields a workbook row's matrix document gains (ontology_loader). */
export function skillFieldsForSpec(specId: string, alreadyDeclared: Iterable<string>): FieldKnowledge[] {
  try {
    const skill = activeSkills('bbbee')?.skillFor(specId) ?? null;
    return skill ? skillFieldSupplement(skill, alreadyDeclared) : [];
  } catch {
    return [];
  }
}
