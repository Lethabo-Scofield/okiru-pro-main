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

/**
 * Provenance for EVERY cell a document run wrote, not only the first cell of
 * each reading.
 *
 * `placed` holds one entry per reading, against the first cell it filled —
 * right for counting readings, but a monthly grid or a dashboard is ONE
 * reading behind many cells, so its other cells were written with no record
 * and showed no source. `cellSources` (from the mapper: `section!cell` → the
 * files that proposed that cell's value) fills in the rest. A cell `placed`
 * already covers keeps that record; the patches say what value was written.
 */
export function provenanceForRun(
  placed: Parameters<typeof provenanceCells>[0],
  patches: Record<string, { cells: Record<string, string | number | boolean | null> }>,
  cellSources: Record<string, string[]> | undefined,
  now: Date = new Date(),
): Record<string, string> {
  const out = provenanceCells(placed, now);
  if (!cellSources) return out;
  // The document id a file was read as, from the readings that carry one.
  const docOfFile = new Map<string, string>();
  for (const p of placed) if (p.sourceFile && p.documentId && !docOfFile.has(p.sourceFile)) docOfFile.set(p.sourceFile, p.documentId);
  const day = now.toISOString().slice(0, 10);
  for (const [key, sources] of Object.entries(cellSources)) {
    if (out[key]) continue;
    const bang = key.indexOf("!");
    if (bang <= 0) continue;
    const sectionId = key.slice(0, bang);
    const cellRef = key.slice(bang + 1);
    if (sectionId === ESG_PROVENANCE_SECTION) continue;
    const value = patches[sectionId]?.cells?.[cellRef];
    if (value === undefined) continue; // not written (a derived cell, or held back by a section's focus)
    const file = (sources ?? []).find(Boolean) ?? "";
    if (!file) continue;
    const record: StoredRecord = { f: file.slice(0, MAX_FILE_NAME), d: docOfFile.get(file) ?? "", t: day, v: value ?? null };
    out[key] = JSON.stringify(record);
  }
  return out;
}

/**
 * A cell the documents disagree about. Nothing is written to the cell itself
 * — it is left blank rather than guessed — so the disagreement is recorded
 * beside it, under the same `section!cell` key a placement would use. A later
 * document that settles the cell replaces this record with its own.
 */
export interface EsgConflictRecord {
  sectionId: string;
  cellRef: string;
  /** ISO date the disagreement was found. */
  foundAt: string;
  candidates: Array<{ value: string | number | boolean | null; sources: string[] }>;
}

interface StoredConflict {
  k: "conflict";
  t: string;
  c: Array<{ v: string | number | boolean | null; f: string[] }>;
}

/** The provenance cells recording cells the documents disagree about. Only real cells: a field-level dispute has nowhere to sit. */
export function conflictCells(
  conflicts: ReadonlyArray<{ sectionId: string; cellRef: string; candidates: ReadonlyArray<{ value: unknown; sources: string[] }> }>,
  now: Date = new Date(),
): Record<string, string> {
  const day = now.toISOString().slice(0, 10);
  const out: Record<string, string> = {};
  for (const conflict of conflicts) {
    if (!conflict.sectionId || !conflict.cellRef || conflict.sectionId === ESG_PROVENANCE_SECTION) continue;
    const record: StoredConflict = {
      k: "conflict",
      t: day,
      c: conflict.candidates.slice(0, 6).map((candidate) => ({
        v: candidate.value == null || typeof candidate.value === "object" ? null : (candidate.value as string | number | boolean),
        f: candidate.sources.slice(0, 4).map((s) => s.slice(0, MAX_FILE_NAME)),
      })),
    };
    out[`${conflict.sectionId}!${conflict.cellRef}`] = JSON.stringify(record);
  }
  return out;
}

/** Every cell the documents disagreed about, as recorded beside the workbook. */
export function readConflicts(
  workbook: { sections?: Record<string, { cells?: Record<string, unknown> } | undefined> } | null | undefined,
): EsgConflictRecord[] {
  const cells = workbook?.sections?.[ESG_PROVENANCE_SECTION]?.cells ?? {};
  const out: EsgConflictRecord[] = [];
  for (const [key, raw] of Object.entries(cells)) {
    const bang = key.indexOf("!");
    if (bang <= 0 || typeof raw !== "string") continue;
    try {
      const r = JSON.parse(raw) as Partial<StoredConflict>;
      if (r?.k !== "conflict" || !Array.isArray(r.c)) continue;
      out.push({
        sectionId: key.slice(0, bang),
        cellRef: key.slice(bang + 1),
        foundAt: String(r.t ?? ""),
        candidates: r.c.map((c) => ({ value: (c?.v ?? null) as EsgConflictRecord["candidates"][number]["value"], sources: Array.isArray(c?.f) ? c.f.map(String) : [] })),
      });
    } catch {
      // not a record
    }
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
      const r = JSON.parse(raw) as Partial<StoredRecord> & { k?: string };
      // A disagreement is not a placement: no document stands behind the cell.
      if (r?.k === "conflict") continue;
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
