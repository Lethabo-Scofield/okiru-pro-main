/** Server-side golden demo cells — SG Consumer v1.7 parity. */
export { SG_CONSUMER_GOLDEN_CELLS } from "../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

import { SG_CONSUMER_GOLDEN_CELLS } from "../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { ESG_SECTION_IDS } from "../src/lib/esg/esgSections";

export function buildGoldenSections(): Record<string, { cells: Record<string, unknown> }> {
  const sections: Record<string, { cells: Record<string, unknown> }> = {};
  for (const id of ESG_SECTION_IDS) {
    const cells = SG_CONSUMER_GOLDEN_CELLS[id];
    if (cells) sections[id] = { cells: { ...cells } };
  }
  return sections;
}
