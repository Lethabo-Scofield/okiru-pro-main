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
const IDENTIFYING_TEXT = /SG\s*Consumer(\s*\/\s*SuperGroup[^,;]*)?|SuperGroup[^,;]*/gi;

function deidentify(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(IDENTIFYING_TEXT, "Sample Company").replace(/\s{2,}/g, " ").trim();
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
