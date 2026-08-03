/**
 * Document verdicts (flow step 8) — the honest ledger on the predicted
 * scorecard page.
 *
 * After a paid extraction the user is owed a straight answer per document:
 * did we actually get entities out of it, did we get something we don't trust,
 * or did we get nothing at all? That verdict is what a requote is argued from —
 * "Ownership scored 0 because no document covered it, add one and we'll price
 * just that file" — rather than an upsell.
 *
 *   found    — real values extracted and mapped
 *   confused — something was read but it conflicts / is below confidence /
 *              is missing fields the document type should have carried
 *   none     — unreadable or irrelevant; nothing usable came out
 *
 * Deliberately conservative: anything the parser flagged for review is
 * `confused`, never `found`. We would rather under-claim than tell a user we
 * read something we didn't.
 */
import type { ParserCaseLike } from './parserWorkbookMap';

export type EntityVerdict = 'found' | 'confused' | 'none';

export interface DocumentVerdict {
  filename: string;
  documentType: string;
  verdict: EntityVerdict;
  /** Plain summary of what we took, e.g. "Level 2 · 51% black · expires 2027-01-31". */
  summary: string;
  /** Named things we could not read out of this document. */
  gaps: string[];
  confidence: number | null;
}

export interface VerdictReport {
  verdicts: DocumentVerdict[];
  counts: { found: number; confused: number; none: number };
  /** True when at least one document yielded usable entities. */
  anyUsable: boolean;
}

function humanizeField(f: string): string {
  return f.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function fieldValue(fields: Record<string, { normalized_value?: unknown; raw_value?: unknown }> | undefined, key: string): string {
  const f = fields?.[key];
  return str(f?.normalized_value ?? f?.raw_value);
}

/**
 * A short, human summary of what a document actually gave us. Built from the
 * fields the parser extracted — never invented.
 */
function summarise(
  parserCase: ParserCaseLike,
  filename: string,
  documentType: string,
): string {
  const fields = parserCase.fields_extracted?.[filename];
  const bits: string[] = [];

  const level = fieldValue(fields, 'bee_level');
  const black = fieldValue(fields, 'black_ownership');
  const blackWomen = fieldValue(fields, 'black_women_ownership');
  const expiry = fieldValue(fields, 'expiry_date') || fieldValue(fields, 'signed_date');
  const supplier = fieldValue(fields, 'supplier_name');
  const entity = fieldValue(fields, 'entity_name');

  if (level) bits.push(`Level ${level}`);
  if (black) bits.push(`${black}% black`);
  if (blackWomen) bits.push(`${blackWomen}% black women`);
  if (expiry) bits.push(`expires ${expiry}`);
  if (!bits.length && (supplier || entity)) bits.push(supplier || entity);

  // A spend schedule's value is its rows, not a single field.
  const rowsFromThisFile = (parserCase.supplier_rows ?? []).filter((r) => r.source_file === filename);
  if (rowsFromThisFile.length) {
    const spend = rowsFromThisFile.reduce(
      (sum, r) => sum + (Number(String(r.spend_amount ?? 0).replace(/[^0-9.]/g, '')) || 0),
      0,
    );
    bits.push(`${rowsFromThisFile.length} supplier${rowsFromThisFile.length === 1 ? '' : 's'}`);
    if (spend > 0) {
      bits.push(spend >= 1_000_000 ? `R${(spend / 1_000_000).toFixed(1)}M` : `R${Math.round(spend).toLocaleString()}`);
    }
  }

  if (!bits.length) return documentType || 'no readable values';
  return bits.join(' · ');
}

/**
 * A note about the parser's own CLASSIFICATION confidence — not something it
 * failed to READ out of the document. Showing "Couldn't read: Best document-type
 * confidence is below review threshold" on a sheet that extracted 13 managers is
 * both wrong and alarming: the values were read fine; the parser was only unsure
 * what to *call* the document. These are filtered out of the read-gap list.
 */
export function isClassificationNote(t: string): boolean {
  return /\b(document.?type|classification|candidates are too close|confidence (is )?(below|requires))\b/i.test(t)
    || /below (the )?review threshold|requires human review/i.test(t);
}

/**
 * Internal plumbing terms that must never surface to a user as a "gap". These
 * are workbook-internal section/validation names (Reconcile, Underlying, the
 * Ownership-chain sheets, dropdown/schema checks) — "Couldn't read Reconcile,
 * Underlying" is meaningless to a client and reads as a broken product.
 */
export function isInternalJargon(t: string): boolean {
  return /\b(reconcile|underlying|worksheet|dropdown|schema|ownership.chain|not found in the source)\b/i.test(t)
    && !/\b(certificate|shareholder|supplier|manager|employee|spend|level|ownership %|black)\b/i.test(t);
}

/** Everything the parser could not READ out of this document (not how it was classified). */
function gapsFor(parserCase: ParserCaseLike, filename: string): string[] {
  const detected = (parserCase.documents_detected ?? []).find((d) => d.filename === filename);
  const review = (parserCase.documents_needing_review ?? []).find((r) => r.filename === filename);

  const out = new Set<string>();
  for (const f of detected?.validation?.missing_fields ?? []) {
    if (!isInternalJargon(f)) out.add(humanizeField(f));
  }
  for (const raw of [
    ...(detected?.validation?.errors ?? []),
    ...(detected?.validation?.warnings ?? []),
    ...(review?.reasons ?? []),
  ]) {
    const t = str(raw);
    if (!t || isClassificationNote(t) || isInternalJargon(t)) continue;
    const m = /^(.*)\smissing$/i.exec(t);
    if (m) { if (!isInternalJargon(m[1])) out.add(humanizeField(m[1])); }
    else out.add(t);
  }
  return Array.from(out);
}

/** Minimal shape of the merged workbook section patches (rows carry provenance). */
export interface SectionPatchLike {
  rows?: unknown[];
}

/**
 * A document is "confused" (rather than "found") only on GENUINE trouble — a
 * conflict, an expired certificate, a misread identifier, a hallucinated value,
 * or an outright extraction error. A merely-missing OPTIONAL field is a gap we
 * list, not a reason to tell the user the document didn't work.
 *
 * The distinction matters because the deterministic parser flags almost every
 * document `review_required` (its classifier is conservative), so gating
 * "found" on "nothing flagged" made EVERY document confused/none even as their
 * data scored real points — the "0 found / 87 score" contradiction the user hit.
 */
const HARD_TROUBLE = /\b(expired|conflict|conflicting|misread|checksum|not found in the source document|failed (its|validation)|unsupported|could not|unreadable|hallucinat)/i;

function hasHardTrouble(parserCase: ParserCaseLike, filename: string): boolean {
  const detected = (parserCase.documents_detected ?? []).find((d) => d.filename === filename);
  const review = (parserCase.documents_needing_review ?? []).find((r) => r.filename === filename);
  const texts = [
    ...(detected?.validation?.errors ?? []),
    ...(review?.reasons ?? []),
  ];
  return texts.some((t) => HARD_TROUBLE.test(str(t)));
}

/** Files the AI-entity path pulled ANY value from — credits meta-only docs (CIPC, AFS). */
function aiValueFiles(parserCase: ParserCaseLike): Set<string> {
  const out = new Set<string>();
  const extractions = (parserCase as { ai_entities?: { extractions?: Array<{ sourceFile?: unknown; values?: unknown[] }> } })
    .ai_entities?.extractions ?? [];
  for (const e of extractions) {
    const name = str(e.sourceFile);
    if (name && Array.isArray(e.values) && e.values.length > 0) out.add(name);
  }
  return out;
}

const SECTION_NOUN: Record<string, [string, string]> = {
  ownership: ['shareholder', 'shareholders'],
  'management-control': ['manager', 'managers'],
  'skills-development': ['learner', 'learners'],
  procurement: ['supplier', 'suppliers'],
  esd: ['ESD contribution', 'ESD contributions'],
  sed: ['SED beneficiary', 'SED beneficiaries'],
  'employment-equity': ['employee', 'employees'],
};

/** filename → section → row count, read from each row's own `_sourceFiles` provenance. */
function sectionRowsByFile(
  sections?: Record<string, SectionPatchLike>,
): Map<string, Map<string, number>> {
  const byFile = new Map<string, Map<string, number>>();
  if (!sections) return byFile;
  for (const [key, patch] of Object.entries(sections)) {
    for (const row of patch?.rows ?? []) {
      const src = (row as { _sourceFiles?: unknown } | null)?._sourceFiles;
      if (!Array.isArray(src)) continue;
      for (const f of src) {
        const name = str(f);
        if (!name) continue;
        let m = byFile.get(name);
        if (!m) {
          m = new Map();
          byFile.set(name, m);
        }
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    }
  }
  return byFile;
}

function sectionBitsFor(counts: Map<string, number> | undefined): string[] {
  if (!counts) return [];
  const bits: string[] = [];
  for (const [section, n] of counts) {
    if (n <= 0) continue;
    const noun = SECTION_NOUN[section];
    if (noun) bits.push(`${n} ${n === 1 ? noun[0] : noun[1]}`);
    else if (section !== 'company-information' && section !== 'financial-information') bits.push(`${n} row${n === 1 ? '' : 's'}`);
  }
  return bits;
}

/**
 * Assess every document in a resolved case.
 *
 * `sections` is the MERGED workbook patch (legacy mapper + AI-entity rows).
 * The AI path attributes its rows via `_sourceFiles` on the row itself — a
 * document whose only yield is section rows used to show as "nothing" here
 * while its data was busy scoring 87 points on the next page.
 */
export function assessDocuments(
  parserCase: ParserCaseLike,
  sections?: Record<string, SectionPatchLike>,
): VerdictReport {
  const detected = [...(parserCase.documents_detected ?? [])];
  const rowsByFile = sectionRowsByFile(sections);
  const aiFiles = aiValueFiles(parserCase);

  // Files the AI-entity path read that the deterministic case never detected
  // still deserve a verdict — synthesize an entry for them.
  const known = new Set(detected.map((d) => str(d.filename)));
  for (const filename of new Set([...rowsByFile.keys(), ...aiFiles])) {
    if (!known.has(filename)) detected.push({ filename, document_type: 'Extracted schedule' });
  }

  const verdicts: DocumentVerdict[] = detected.map((doc) => {
    const filename = str(doc.filename);
    const documentType = str(doc.document_type) || 'Unrecognised document';
    const fields = parserCase.fields_extracted?.[filename] ?? {};
    const extractedCount = Object.keys(fields).length;
    const suppliedRows = (parserCase.supplier_rows ?? []).filter((r) => r.source_file === filename).length;
    const sectionCounts = rowsByFile.get(filename);
    const sectionRowCount = sectionCounts
      ? Array.from(sectionCounts.values()).reduce((a, b) => a + b, 0)
      : 0;
    const gaps = gapsFor(parserCase, filename);
    // Yield = anything that reached the workbook: deterministic fields, supplier
    // rows, section rows, OR AI-entity values (which carry meta like company
    // name / NPAT that never becomes a grid row but is real, scored data).
    const yieldedSomething =
      extractedCount > 0 || suppliedRows > 0 || sectionRowCount > 0 || aiFiles.has(filename);

    let verdict: EntityVerdict;
    if (!yieldedSomething) {
      // Nothing usable reached the workbook.
      verdict = 'none';
    } else if (hasHardTrouble(parserCase, filename)) {
      // We got data, but something needs a human: a conflict, an expired
      // certificate, a misread ID, a value we could not ground. Never "found".
      verdict = 'confused';
    } else {
      // Usable data reached the workbook and nothing is genuinely wrong with it.
      // Missing optional fields are listed as gaps, not a downgrade — a document
      // that produced twenty rows "worked", even if it lacks a signed date.
      verdict = 'found';
    }

    const baseSummary = summarise(parserCase, filename, documentType);
    const rowBits = sectionBitsFor(sectionCounts);
    const summary =
      verdict === 'none'
        ? 'nothing readable in this document'
        : rowBits.length
          ? (baseSummary === documentType || baseSummary === 'no readable values'
              ? rowBits.join(' · ')
              : `${baseSummary} · ${rowBits.join(' · ')}`)
          : baseSummary;

    return {
      filename,
      documentType,
      verdict,
      summary,
      gaps,
      confidence: typeof doc.overall_confidence === 'number' ? doc.overall_confidence : null,
    };
  });

  const counts = {
    found: verdicts.filter((v) => v.verdict === 'found').length,
    confused: verdicts.filter((v) => v.verdict === 'confused').length,
    none: verdicts.filter((v) => v.verdict === 'none').length,
  };

  return { verdicts, counts, anyUsable: counts.found + counts.confused > 0 };
}
