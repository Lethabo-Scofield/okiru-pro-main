/**
 * Which document each workbook value came from (E4).
 *
 * A document upload placed values into the workbook and then forgot where they
 * came from: the injection knew each cell's file and document, wrote the cell,
 * and dropped the rest. So "Scope 1 = 1,234 tCO₂e" could be traced to the cells
 * it was computed from, but not to the diesel reports that filled those cells —
 * the one link an assurer asks for first.
 *
 * Now every value a document places is recorded beside the workbook in its own
 * section, `provenance`: keyed `section!cell`, holding the file, the document,
 * the day, and the value as placed. Keeping the value is what lets the record
 * stay honest after someone edits the cell by hand — the current value no
 * longer matches, and the chain says "edited since" instead of claiming the
 * document still stands behind it.
 *
 * It is written in the same request as the values themselves, through the same
 * import endpoint, and merges cell by cell like any other section: a later
 * upload of the same cell replaces its record, nothing else is touched.
 */

export const ESG_PROVENANCE_SECTION = "provenance";

export interface EsgPlacementRecord {
  sectionId: string;
  cellRef: string;
  sourceFile: string;
  documentId: string;
  /** ISO date the value was placed. */
  placedAt: string;
  /** The value as the document placed it. */
  placedValue: string | number | boolean | null;
}

/** What a stored record holds, kept short: a section holds at most 4,000 characters a cell. */
interface StoredRecord {
  f: string;
  d: string;
  t: string;
  v: string | number | boolean | null;
}

const MAX_FILE_NAME = 200;

/** The provenance cells for values a document run placed. */
export function provenanceCells(
  placed: ReadonlyArray<{
    sectionId: string;
    cellRef: string;
    sourceFile: string;
    documentId: string;
    value: string | number | boolean | null;
  }>,
  now: Date = new Date(),
): Record<string, string> {
  const day = now.toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  for (const p of placed) {
    if (!p.sectionId || !p.cellRef || p.sectionId === ESG_PROVENANCE_SECTION) continue;
    const record: StoredRecord = {
      f: (p.sourceFile || "").slice(0, MAX_FILE_NAME),
      d: p.documentId || "",
      t: day,
      v: p.value ?? null,
    };
    out[`${p.sectionId}!${p.cellRef}`] = JSON.stringify(record);
  }
  return out;
}

/** Every provenance record the workbook holds. */
export function readProvenance(
  workbook: { sections?: Record<string, { cells?: Record<string, unknown> } | undefined> } | null | undefined,
): EsgPlacementRecord[] {
  const cells = workbook?.sections?.[ESG_PROVENANCE_SECTION]?.cells ?? {};
  const out: EsgPlacementRecord[] = [];
  for (const [key, raw] of Object.entries(cells)) {
    const bang = key.indexOf("!");
    if (bang <= 0 || typeof raw !== "string") continue;
    try {
      const r = JSON.parse(raw) as Partial<StoredRecord>;
      out.push({
        sectionId: key.slice(0, bang),
        cellRef: key.slice(bang + 1),
        sourceFile: String(r.f ?? ""),
        documentId: String(r.d ?? ""),
        placedAt: String(r.t ?? ""),
        placedValue: (r.v ?? null) as EsgPlacementRecord["placedValue"],
      });
    } catch {
      // A record that does not parse is not evidence of anything.
    }
  }
  return out;
}

/** Whether the cell still holds what the document placed. */
export function stillAsPlaced(record: EsgPlacementRecord, current: unknown): boolean {
  if (current == null || current === "") return false;
  const a = typeof current === "number" ? current : Number(String(current).replace(/[\s,]/g, ""));
  const b = typeof record.placedValue === "number" ? record.placedValue : Number(String(record.placedValue ?? "").replace(/[\s,]/g, ""));
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
  return String(current).trim() === String(record.placedValue ?? "").trim();
}

export interface EsgSourceDocument {
  sourceFile: string;
  documentId: string;
  /** Cells this document filled that still hold its value. */
  cells: number;
  /** Cells it filled that have been changed by hand since. */
  editedSince: number;
}

/**
 * The documents behind a set of cells — "which files does Scope 1 rest on?".
 *
 * `matches` picks the cells (a section — `*` for any — and optionally a
 * cell-name prefix such as the `s1a_` monthly diesel grid, or exact cells).
 * Documents are listed largest first.
 */
export function sourcesFor(
  workbook: { sections?: Record<string, { cells?: Record<string, unknown> } | undefined> } | null | undefined,
  matches: ReadonlyArray<{ section: string; prefix?: string; cells?: readonly string[] }>,
): EsgSourceDocument[] {
  const byDoc = new Map<string, EsgSourceDocument>();
  for (const record of readProvenance(workbook)) {
    const hit = matches.some(
      (m) =>
        (m.section === "*" || m.section === record.sectionId) &&
        (m.cells ? m.cells.includes(record.cellRef) : m.prefix ? record.cellRef.startsWith(m.prefix) : true),
    );
    if (!hit) continue;
    const key = record.documentId || record.sourceFile;
    const doc = byDoc.get(key) ?? { sourceFile: record.sourceFile, documentId: record.documentId, cells: 0, editedSince: 0 };
    const current = workbook?.sections?.[record.sectionId]?.cells?.[record.cellRef];
    if (stillAsPlaced(record, current)) doc.cells += 1;
    else doc.editedSince += 1;
    byDoc.set(key, doc);
  }
  return Array.from(byDoc.values()).sort((a, b) => b.cells - a.cells || a.sourceFile.localeCompare(b.sourceFile));
}
