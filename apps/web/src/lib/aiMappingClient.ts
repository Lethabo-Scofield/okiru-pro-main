/**
 * Client wrappers around the AI mapping endpoints.
 *
 * Both wrappers run the deterministic engine first (tabularNormalize) and only
 * call the server LLM when the deterministic header match is incomplete or
 * low-confidence. They always degrade gracefully: a network/AI failure returns
 * the deterministic result so data is never lost.
 */
import type { ColumnDef } from "@/components/workbook/sections";
import {
  buildDeterministicMapping,
  columnsToTargetFields,
  normalizeMatrix,
  type ColumnMapping,
  type NormalizationResult,
} from "@/lib/tabularNormalize";

const AI_CONFIDENCE_FLOOR = 0.75;

export interface NormalizePasteResult {
  result: NormalizationResult;
  usedAi: boolean;
  notes: string[];
}

export interface NormalizePasteOptions {
  hasHeaderRow?: boolean;
  startColIndex?: number;
  /** Set false to skip the network call entirely (deterministic only). */
  useAi?: boolean;
  signal?: AbortSignal;
  /** Cap on sample rows sent to the LLM for context. */
  sampleRows?: number;
}

/** Should we ask the LLM to help map headers the deterministic pass missed? */
function deterministicNeedsHelp(mapping: ColumnMapping[]): boolean {
  return mapping.some(
    (m) =>
      (m.sourceHeader.trim() && !m.targetKey) ||
      (m.targetKey && m.confidence > 0 && m.confidence < AI_CONFIDENCE_FLOOR),
  );
}

/**
 * Normalize pasted/imported tabular data against a section's columns. Returns a
 * full NormalizationResult (mapping + normalized rows + per-cell flags).
 */
export async function normalizePaste(
  matrix: unknown[][],
  columns: ColumnDef[],
  apiBase: string,
  options: NormalizePasteOptions = {},
): Promise<NormalizePasteResult> {
  const deterministic = normalizeMatrix(matrix, columns, {
    hasHeaderRow: options.hasHeaderRow,
    startColIndex: options.startColIndex,
  });

  // Positional (header-less) pastes and exact matches need no AI.
  if (!deterministic.headerRowDetected || options.useAi === false) {
    return { result: deterministic, usedAi: false, notes: [] };
  }
  if (!deterministicNeedsHelp(deterministic.mapping)) {
    return { result: deterministic, usedAi: false, notes: [] };
  }

  const headers = deterministic.mapping.map((m) => m.sourceHeader);
  const sampleLimit = options.sampleRows ?? 5;
  const sampleRows = matrix
    .slice(1, 1 + sampleLimit)
    .map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));

  try {
    const res = await fetch(`${apiBase}/api/workbook/normalize-paste`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        headers,
        sampleRows,
        targetFields: columnsToTargetFields(columns),
        currentMapping: deterministic.mapping,
      }),
    });
    if (!res.ok) {
      return {
        result: deterministic,
        usedAi: false,
        notes: ["AI mapping unavailable — used name matching only."],
      };
    }
    const data = (await res.json()) as { mapping?: ColumnMapping[]; notes?: string[] };
    if (!data.mapping?.length) {
      return { result: deterministic, usedAi: false, notes: data.notes ?? [] };
    }
    const merged = mergeMappings(deterministic.mapping, data.mapping);
    const result = normalizeMatrix(matrix, columns, {
      hasHeaderRow: true,
      mappingOverride: merged,
    });
    return { result, usedAi: true, notes: data.notes ?? ["AI mapping applied."] };
  } catch {
    return {
      result: deterministic,
      usedAi: false,
      notes: ["AI mapping request failed — used name matching only."],
    };
  }
}

/**
 * Merge AI mapping into deterministic mapping. Deterministic high-confidence
 * matches win; AI only fills gaps and low-confidence slots. A target key is
 * never assigned to two source columns.
 */
function mergeMappings(deterministic: ColumnMapping[], ai: ColumnMapping[]): ColumnMapping[] {
  const aiByIndex = new Map(ai.map((m) => [m.sourceIndex, m] as const));
  const claimed = new Set<string>();
  for (const m of deterministic) {
    if (m.targetKey && m.confidence >= AI_CONFIDENCE_FLOOR) claimed.add(m.targetKey);
  }
  return deterministic.map((m) => {
    if (m.targetKey && m.confidence >= AI_CONFIDENCE_FLOOR) return m;
    const aiMatch = aiByIndex.get(m.sourceIndex);
    if (aiMatch?.targetKey && !claimed.has(aiMatch.targetKey)) {
      claimed.add(aiMatch.targetKey);
      return { ...m, targetKey: aiMatch.targetKey, confidence: aiMatch.confidence || 0.7, method: "ai" as const };
    }
    return m;
  });
}

export interface SheetSummary {
  name: string;
  headers: string[];
  sampleRows?: string[][];
}

export interface SectionSummary {
  key: string;
  label: string;
  fields: { key: string; label: string }[];
}

export interface ImportMapResult {
  /** sheetName → sectionKey (or null if unrecognized). */
  sheetToSection: Record<string, string | null>;
  usedAi: boolean;
  notes: string[];
}

/**
 * Map each sheet of a full workbook to a scorecard section. Deterministic name
 * matching first; AI for the leftovers when configured.
 */
export async function importMapSheets(
  sheets: SheetSummary[],
  sections: SectionSummary[],
  apiBase: string,
  options: { useAi?: boolean; signal?: AbortSignal } = {},
): Promise<ImportMapResult> {
  const sectionFields = sections.map((s) => ({
    key: s.key,
    label: s.label,
    aliases: [s.label],
  }));
  const sheetToSection: Record<string, string | null> = {};
  const unresolved: SheetSummary[] = [];

  for (const sheet of sheets) {
    const det = buildDeterministicMapping([sheet.name], sectionFields)[0];
    if (det?.targetKey && det.confidence >= AI_CONFIDENCE_FLOOR) {
      sheetToSection[sheet.name] = det.targetKey;
    } else {
      sheetToSection[sheet.name] = det?.targetKey ?? null;
      unresolved.push(sheet);
    }
  }

  if (unresolved.length === 0 || options.useAi === false) {
    return { sheetToSection, usedAi: false, notes: [] };
  }

  try {
    const res = await fetch(`${apiBase}/api/workbook/import-map`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        sheets: unresolved.map((s) => ({
          name: s.name,
          headers: s.headers,
          sampleRows: (s.sampleRows ?? []).slice(0, 3),
        })),
        sections,
      }),
    });
    if (!res.ok) return { sheetToSection, usedAi: false, notes: ["AI sheet mapping unavailable."] };
    const data = (await res.json()) as { sheetToSection?: Record<string, string | null>; notes?: string[] };
    for (const [name, key] of Object.entries(data.sheetToSection ?? {})) {
      if (sheetToSection[name] == null) sheetToSection[name] = key;
    }
    return { sheetToSection, usedAi: true, notes: data.notes ?? ["AI sheet mapping applied."] };
  } catch {
    return { sheetToSection, usedAi: false, notes: ["AI sheet mapping request failed."] };
  }
}
