/**
 * TEST FIXTURE — a full, de-identified ESG workbook for report and export tests.
 *
 * It used to back an admin "Load sample data" button that REPLACED every
 * section of a real company's workbook. The button and its route are gone;
 * only tests import this now, so it lives with the fixtures and never ships.
 */
export { SG_CONSUMER_GOLDEN_CELLS } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

import { SG_CONSUMER_GOLDEN_CELLS } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { ESG_SECTION_IDS } from "../esgSections";

/**
 * The parity fixture is a real client's workbook. Its NUMBERS reproduce the
 * reference scorecard exactly, but the client's name must never appear in a
 * test artefact that could be mistaken for another company's — so identifying
 * labels are replaced. Numeric cells are untouched.
 */
// The names are the fixture's own — its declared entity and each name that
// entity lists ("A / B") — so no client name is spelled out here.
const IDENTIFYING_TEXT = identifyingText(SG_CONSUMER_GOLDEN_CELLS);

function identifyingText(fixture: Record<string, Record<string, unknown>>): RegExp | null {
  const names = new Set<string>();
  for (const cells of Object.values(fixture)) {
    const entity = cells?.entity;
    if (typeof entity !== "string" || !entity.trim()) continue;
    names.add(entity.trim());
    for (const part of entity.split("/")) if (part.trim()) names.add(part.trim());
  }
  if (!names.size) return null;
  const pattern = Array.from(names)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"))
    .join("|");
  return new RegExp(pattern, "gi");
}

function deidentify(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cleaned = (IDENTIFYING_TEXT ? value.replace(IDENTIFYING_TEXT, "Sample Company") : value).replace(/\s{2,}/g, " ").trim();
  return cleaned.length ? cleaned : "Sample Company";
}

export function buildGoldenSections(): Record<string, { cells: Record<string, unknown> }> {
  const sections: Record<string, { cells: Record<string, unknown> }> = {};
  for (const id of ESG_SECTION_IDS) {
    const cells = SG_CONSUMER_GOLDEN_CELLS[id];
    if (!cells) continue;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cells)) out[key] = deidentify(value);
    sections[id] = { cells: out };
  }
  return sections;
}
