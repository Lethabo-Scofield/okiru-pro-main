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

/** Everything the parser could not read out of this document. */
function gapsFor(parserCase: ParserCaseLike, filename: string): string[] {
  const detected = (parserCase.documents_detected ?? []).find((d) => d.filename === filename);
  const review = (parserCase.documents_needing_review ?? []).find((r) => r.filename === filename);

  const out = new Set<string>();
  for (const f of detected?.validation?.missing_fields ?? []) out.add(humanizeField(f));
  for (const raw of [
    ...(detected?.validation?.errors ?? []),
    ...(detected?.validation?.warnings ?? []),
    ...(review?.reasons ?? []),
  ]) {
    const t = str(raw);
    if (!t) continue;
    const m = /^(.*)\smissing$/i.exec(t);
    if (m) out.add(humanizeField(m[1]));
    else out.add(t);
  }
  return Array.from(out);
}

/**
 * Assess every document in a resolved case.
 */
export function assessDocuments(parserCase: ParserCaseLike): VerdictReport {
  const detected = parserCase.documents_detected ?? [];

  const verdicts: DocumentVerdict[] = detected.map((doc) => {
    const filename = str(doc.filename);
    const documentType = str(doc.document_type) || 'Unrecognised document';
    const fields = parserCase.fields_extracted?.[filename] ?? {};
    const extractedCount = Object.keys(fields).length;
    const suppliedRows = (parserCase.supplier_rows ?? []).filter((r) => r.source_file === filename).length;
    const gaps = gapsFor(parserCase, filename);
    const yieldedSomething = extractedCount > 0 || suppliedRows > 0;

    let verdict: EntityVerdict;
    if (doc.status === 'failed' || !yieldedSomething) {
      // Nothing usable came out — either it failed classification or it simply
      // carried no values we could take.
      verdict = 'none';
    } else if (doc.status === 'passed' && gaps.length === 0) {
      verdict = 'found';
    } else {
      // Read something, but the parser flagged it. Never claim 'found' here.
      verdict = 'confused';
    }

    return {
      filename,
      documentType,
      verdict,
      summary: verdict === 'none' ? 'nothing readable in this document' : summarise(parserCase, filename, documentType),
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
