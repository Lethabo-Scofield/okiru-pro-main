/**
 * Turn the verification document matrix into parser ontology entries.
 *
 * The hand-authored ontology knows 7 document types; a verification asks for 109.
 * Everything else a client uploads classified as "unsupported / low confidence",
 * which the service reports as a hard failure — so a folder of perfectly good
 * evidence came back as nothing.
 *
 * TWO RULES GOVERN THIS MERGE:
 *
 * 1. The 7 canonical types stay authoritative. They carry regex patterns and
 *    `calculator_key` mappings — they are the only types that can currently
 *    produce a calculator payload. A matrix entry that would compete with one of
 *    them is dropped rather than allowed to win classification and silently cost
 *    us a scoring input.
 *
 * 2. Matrix fields are declared but NOT required. The deterministic extractor has
 *    no patterns for them, so marking them required would report every field of
 *    every document as missing — noise, not signal. They describe the shape the
 *    AI extraction path fills, and become enforceable when it does.
 */
import type { DocumentKnowledge, ExtractionFieldNode } from './ontology_models.js';
import type { ParserDataType } from '../schemas/document_types.js';
import {
  VERIFICATION_DOCUMENT_MATRIX,
  type VerificationDocument,
  type VerificationElement,
} from '../schemas/verification_document_matrix.js';

const GRAPH_VERSION = 'matrix-v3';

/**
 * Matrix elements are the amended five. Sectors on the legacy seven-element
 * framework (Transport) split Management Control and Employment Equity, so the
 * pillar a document belongs to is sector-dependent; this is the amended-codes
 * default and callers targeting a legacy sector must remap MANAGEMENT_CONTROL.
 */
const ELEMENT_TO_PILLAR: Record<VerificationElement, string> = {
  OWNERSHIP: 'OWN',
  MANAGEMENT_CONTROL: 'MAC',
  SKILLS_DEVELOPMENT: 'SKL',
  ESD: 'ESD',
  SED: 'SED',
};

/** Best-effort type from the field's name. Only affects validation coercion. */
function inferDataType(fieldName: string): ParserDataType {
  if (/_date$|^date_|_on$/.test(fieldName)) return 'date';
  if (/^is_|^has_|_present$|_ok$|_valid$|^.*_bool$/.test(fieldName)) return 'boolean';
  if (/percentage|_pct$|_percent$/.test(fieldName)) return 'percentage';
  if (/amount|spend|value|total|sum|npat|cost|balance/.test(fieldName)) return 'money';
  if (/count|number_of|_size$|shares/.test(fieldName)) return 'number';
  return 'string';
}

function toFields(doc: VerificationDocument): ExtractionFieldNode[] {
  return doc.expectedFields.map((name) => ({
    name,
    data_type: inferDataType(name),
    // See rule 2 above — declared, not enforced, until AI extraction fills them.
    required: false,
    description: `${name.replace(/_/g, ' ')} (from: ${doc.name})`,
    graph_version: GRAPH_VERSION,
  }));
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Build ontology entries for every matrix document that does not collide with a
 * canonical type.
 *
 * Collision = the matrix document shares a normalised alias with a canonical
 * one. Example: the matrix's "Valid B-BBEE verification certificate per sampled
 * supplier" collides with the canonical "B-BBEE Certificate", which owns the
 * supplier.* calculator keys — so the canonical one keeps it.
 */
export function matrixDocumentKnowledge(canonical: DocumentKnowledge[]): DocumentKnowledge[] {
  const claimed = new Set<string>();
  for (const known of canonical) {
    claimed.add(normalise(known.document.name));
    for (const alias of known.document.aliases) claimed.add(normalise(alias));
  }

  const built: DocumentKnowledge[] = [];
  for (const doc of VERIFICATION_DOCUMENT_MATRIX) {
    const aliases = doc.aliases.filter((alias) => !claimed.has(normalise(alias)));
    // Nothing distinctive left, or the document itself is already covered.
    if (aliases.length === 0 || claimed.has(normalise(doc.name))) continue;

    built.push({
      document: {
        name: doc.name,
        // The document's own name, NOT the auditor's test narrative. Classifier
        // confidence scores description tokens as matched/total, so a 300-word
        // narrative dilutes the score of every document that carries one — the
        // opposite of what a longer description intuitively suggests. The
        // auditor narrative stays available via the matrix itself.
        description: doc.name,
        aliases,
        // "Required" here means required for a complete verification of that
        // element, which is what the matrix describes.
        required: true,
        pillar_code: ELEMENT_TO_PILLAR[doc.element],
        graph_version: GRAPH_VERSION,
      },
      fields: toFields(doc).map((field) => ({
        field,
        rules: [],
        patterns: [],
        calculator_requirements: [],
      })),
    });
  }
  return built;
}

/** The extraction instruction and output schema for a document, by name. */
export function extractionSpecFor(documentName: string): VerificationDocument | null {
  const target = normalise(documentName);
  return (
    VERIFICATION_DOCUMENT_MATRIX.find((doc) => normalise(doc.name) === target)
    ?? VERIFICATION_DOCUMENT_MATRIX.find((doc) => doc.aliases.some((a) => normalise(a) === target))
    ?? null
  );
}
