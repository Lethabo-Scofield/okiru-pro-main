/**
 * Where the company's name comes from when there is no company yet.
 *
 * The ESG flow used to ask for a name FIRST — before a single document had been
 * read — which is the one moment nobody can answer it well: the evidence pack
 * says "SG Consumer Goods (Pty) Ltd" and the person typing says "SG". So the
 * name now comes OUT of what was provided, and is shown back for correction
 * before anything is created.
 *
 * This is the ESG sibling of `pickEntityName` in
 * `scorecard/DocumentUploadStart` — same cascade, same regexes, same rule that a
 * low-confidence guess the user can correct beats a blank box. It is a separate
 * file rather than an import because that one is module-private to the B-BBEE
 * component and reads a B-BBEE case shape; the differences are the ESG parser's
 * dotted calculator keys (`entity.name`) and the `.xlsx` import preview, which
 * has no equivalent on that side.
 *
 * HARD RULE: never invent a name. Every function here returns "" rather than a
 * filename, a placeholder or a guess with no evidence behind it — an empty box
 * the user fills in is honest; "Untitled Company" is not.
 */

import type { EsgParserCaseLike, EsgSectionPatches } from "./esgParserInjection";

/** A value that is real text, not an HTML artifact or an empty placeholder. */
function cleanText(v: unknown): string {
  const s = String(v ?? "").trim();
  return /<\/?[a-z]/i.test(s) || s.length < 2 ? "" : s;
}

/**
 * Field keys that name the entity, however a document (or the ESG parser's
 * calculator layer, which speaks dotted keys) labels it.
 */
const ENTITY_NAME_KEY =
  /^(entity[._]name|measured_?entity(_name)?|company[._]?name|trading_name|legal_name|business_name|registered_name|name_of_(measured_)?entity)$/i;

/** In-text labels that precede a company name on letterheads, profiles, headers. */
const ENTITY_NAME_LABEL =
  /(?:measured\s*entity|company\s*name|registered\s*name|trading\s*(?:as|name)|name\s*of\s*(?:the\s*)?(?:measured\s*)?entity|entity\s*name)\s*[:\-]\s*(.+)/i;

/** Words that are the LABEL of a name cell, never the name itself. */
const LABEL_WORD =
  /^(entity|entity name|company|company name|measured entity|registered name|trading name|name|field|cell ref|value|value \(fill in\)|notes)$/i;

/** Trim a captured name to something that looks like a company, not a sentence. */
function tidyEntityName(raw: string): string {
  let s = cleanText(String(raw).split(/\s{2,}|\||\t|;/)[0]); // stop at column / gap
  s = s.replace(/^(the\s+)?(measured\s+entity|company)\s*[:\-]?\s*/i, "").trim();
  // Keep it to a plausible name length; a whole paragraph is not a name.
  if (s.length > 90) s = s.slice(0, 90).trim();
  return s.length >= 2 ? s : "";
}

/**
 * The entity's name as the ESG parser reported it, from the richest source
 * available and then, as a low-confidence fallback, from any string in the case
 * that is labelled like a company name.
 */
export function pickEsgEntityName(caseResult: EsgParserCaseLike | null): string {
  if (!caseResult) return "";
  const ai = caseResult.ai_entities;

  // 1. The clean resolved field (highest confidence).
  const resolved = cleanText(
    ai?.fields?.entity_name?.value ?? ai?.fields?.company_name?.value,
  );
  if (resolved) return resolved;

  // 2. Any resolved field whose KEY names the entity.
  for (const [key, field] of Object.entries(ai?.fields ?? {})) {
    if (ENTITY_NAME_KEY.test(key)) {
      const candidate = cleanText((field as { value?: unknown } | null)?.value);
      if (candidate) return candidate;
    }
  }

  // 3. The parser's own calculator mapping — `entity.name` is an allowlisted key.
  const payload = (ai?.calculator as { payload?: Record<string, unknown> } | null)?.payload;
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (ENTITY_NAME_KEY.test(key)) {
      const candidate = cleanText(value);
      if (candidate) return candidate;
    }
  }

  // 4. Named fields inside the per-document extractions.
  for (const extraction of ai?.extractions ?? []) {
    for (const value of extraction?.values ?? []) {
      if (ENTITY_NAME_KEY.test(String(value?.field ?? ""))) {
        const candidate = cleanText(value?.value);
        if (candidate) return candidate;
      }
    }
  }

  // 5. LOW-CONFIDENCE FALLBACK: scan every string in the case for a labelled
  // company name ("Measured Entity: …", "Company Name: …", "Trading as …").
  const seen = new Set<unknown>();
  const stack: unknown[] = [caseResult];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (typeof value === "string") {
        const match = value.match(ENTITY_NAME_LABEL);
        if (match) {
          const candidate = tidyEntityName(match[1]);
          if (candidate) return candidate;
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return "";
}

/** Cell refs sort by column, so `C5` reads after `A5` in the same row. */
function refParts(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) };
}

type SectionCells = Record<string, { cells: Record<string, unknown> }>;

/**
 * The entity name carried by workbook sections — either the parser's mapped
 * patches or an `.xlsx` import preview.
 *
 * Two shapes, because the workbook has two: the section editor addresses the
 * cover by semantic key (`entity`), while a sheet read out of a spreadsheet is
 * addressed by cell reference. So we take the semantic key when it is there,
 * and otherwise look for a row whose first cell LABELS the entity and read the
 * first value to its right that is not itself a label — which is exactly the
 * layout of the template we hand out ("Cell Ref | Field | Value (fill in)").
 */
export function esgEntityNameFromSections(sections: SectionCells | EsgSectionPatches): string {
  const cover =
    (sections as SectionCells)["company-reporting-setup"] ?? (sections as SectionCells).cover;
  const cells = cover?.cells;
  if (!cells) return "";

  const direct = cleanText(cells.entity);
  if (direct && !LABEL_WORD.test(direct)) return direct;

  // Group by row so a label can be paired with the value beside it.
  type RowCell = { col: number; value: unknown };
  const rows: Record<number, RowCell[]> = {};
  for (const [ref, value] of Object.entries(cells)) {
    const parts = refParts(ref);
    if (!parts) continue;
    (rows[parts.row] ??= []).push({ col: parts.col, value });
  }

  for (const row of Object.values(rows)) {
    row.sort((a, b) => a.col - b.col);
    const labelAt = row.findIndex((cell) => {
      const text = String(cell.value ?? "").trim();
      return ENTITY_NAME_KEY.test(text) || LABEL_WORD.test(text);
    });
    if (labelAt === -1) continue;
    // Only rows that actually name the ENTITY — "Notes" is a label too.
    const labelText = String(row[labelAt]!.value ?? "").trim();
    if (!ENTITY_NAME_KEY.test(labelText) && !/entity|company/i.test(labelText)) continue;
    for (const cell of row.slice(labelAt + 1)) {
      const text = cleanText(cell.value);
      if (!text || LABEL_WORD.test(text) || ENTITY_NAME_KEY.test(text)) continue;
      return tidyEntityName(text);
    }
  }

  return "";
}

/**
 * The name to offer at the review step, in confidence order: what the parser
 * resolved, then what it mapped into the cover sheet. "" when neither knows —
 * which the review step renders as an empty, required field.
 */
export function esgProposedEntityName(
  caseResult: EsgParserCaseLike | null,
  patches?: EsgSectionPatches,
): string {
  return pickEsgEntityName(caseResult) || (patches ? esgEntityNameFromSections(patches) : "");
}
