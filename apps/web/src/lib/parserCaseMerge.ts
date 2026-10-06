/**
 * Fold a newly-read parser case into what was already read.
 *
 * "Add documents" only ever pays for and reads the NEW files, so everything
 * the earlier rounds produced must survive the merge: detections, fields,
 * supplier rows, the calculator payload — and the AI-entity extractions, which
 * is where most register rows (shareholders, employees, suppliers) come from.
 *
 * Rules:
 * - Per-document results are keyed by filename / source file. A file read
 *   again in the new round replaces its own earlier result and nothing else.
 * - The cross-document resolved fields (`ai_entities.fields`, e.g. the entity
 *   name) were reconciled over the WHOLE earlier batch; a round that read two
 *   new files cannot outvote that, so earlier values win and the new round
 *   only fills keys the earlier batch did not have.
 * - Nothing is ever deleted by a merge.
 */
import type { ParserCaseLike } from "@/lib/parserWorkbookMap";

type AiExtraction = { documentId?: unknown; sourceFile?: unknown; [key: string]: unknown };
type AiEntities = { fields?: Record<string, unknown>; extractions?: AiExtraction[]; [key: string]: unknown };
type CaseWithAi = ParserCaseLike & { ai_entities?: AiEntities | null };

function byName<T extends { filename?: string }>(earlier: T[] = [], fresh: T[] = []): T[] {
  const out = new Map<string, T>();
  for (const item of earlier) out.set(String(item.filename), item);
  for (const item of fresh) out.set(String(item.filename), item);
  return Array.from(out.values());
}

function mergeAiEntities(earlier: AiEntities | null | undefined, fresh: AiEntities | null | undefined): AiEntities | undefined {
  if (!earlier) return fresh ?? undefined;
  if (!fresh) return earlier;
  const freshFiles = new Set((fresh.extractions ?? []).map((e) => String(e.sourceFile ?? "")));
  return {
    ...earlier,
    ...fresh,
    fields: { ...(fresh.fields ?? {}), ...(earlier.fields ?? {}) },
    extractions: [
      ...(earlier.extractions ?? []).filter((e) => !freshFiles.has(String(e.sourceFile ?? ""))),
      ...(fresh.extractions ?? []),
    ],
  };
}

export function mergeParserCases(earlier: ParserCaseLike | null, fresh: ParserCaseLike): ParserCaseLike {
  if (!earlier) return fresh;
  const freshFiles = new Set((fresh.documents_detected ?? []).map((d) => d.filename));
  const merged: CaseWithAi = {
    ...earlier,
    ...fresh,
    documents_detected: byName(earlier.documents_detected, fresh.documents_detected),
    documents_needing_review: byName(earlier.documents_needing_review, fresh.documents_needing_review),
    fields_extracted: { ...(earlier.fields_extracted ?? {}), ...(fresh.fields_extracted ?? {}) },
    calculator_payload: { ...(earlier.calculator_payload ?? {}), ...(fresh.calculator_payload ?? {}) },
    supplier_rows: [
      // Keep earlier suppliers, drop any whose source file was re-read.
      ...(earlier.supplier_rows ?? []).filter((r) => !freshFiles.has(r.source_file)),
      ...(fresh.supplier_rows ?? []),
    ],
  };
  const ai = mergeAiEntities((earlier as CaseWithAi).ai_entities, (fresh as CaseWithAi).ai_entities);
  if (ai) merged.ai_entities = ai;
  return merged;
}
