/** Server-side sample-workbook cells — v1.7 calculator parity. */
export { SG_CONSUMER_GOLDEN_CELLS } from "../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

import { SG_CONSUMER_GOLDEN_CELLS } from "../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { ESG_SECTION_IDS } from "../src/lib/esg/esgSections";

/**
 * The parity fixture is a real client's workbook. Its NUMBERS are what make
 * demo seeding useful (they reproduce the reference scorecard exactly), but the
 * client's name must never be stamped into another company's workbook — so
 * identifying labels are replaced on the way out. Numeric cells are untouched,
 * which is what the golden calculator tests assert on.
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
