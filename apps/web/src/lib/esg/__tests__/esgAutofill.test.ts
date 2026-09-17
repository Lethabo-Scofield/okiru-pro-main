import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { suggestEsgAutofillPatches } from "../esgAutofill";

describe("suggestEsgAutofillPatches", () => {
  it("suggests SDL from payroll", () => {
    // Leviable payroll is S_Data!B43 and the SDL levy is S_Data!B44
    // (=IFERROR(B43*0.01,0)). This previously read B70 (blank) and wrote B71, which is
    // the Community table's "Month" column header.
    const wb = buildSgConsumerGoldenWorkbook();
    wb.sections["s-data"] = {
      cells: { ...(wb.sections["s-data"]?.cells ?? {}), B43: 1_000_000, B44: 0 },
    };
    const patches = suggestEsgAutofillPatches(wb);
    const sdl = patches.find((p) => p.sectionId === "s-data" && p.cells.B44 != null);
    expect(sdl?.cells.B44).toBe(10_000);
  });
});
