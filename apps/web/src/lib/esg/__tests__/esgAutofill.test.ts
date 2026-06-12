import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { suggestEsgAutofillPatches } from "../esgAutofill";

describe("suggestEsgAutofillPatches", () => {
  it("suggests SDL from payroll", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    wb.sections["s-data"] = {
      cells: { ...(wb.sections["s-data"]?.cells ?? {}), B70: 1_000_000, B71: 0 },
    };
    const patches = suggestEsgAutofillPatches(wb);
    const sdl = patches.find((p) => p.sectionId === "s-data" && p.cells.B71 != null);
    expect(sdl?.cells.B71).toBe(10_000);
  });
});
