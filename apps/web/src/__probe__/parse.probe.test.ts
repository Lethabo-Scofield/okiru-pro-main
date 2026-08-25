import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEsgWorkbookXlsx } from "../lib/esg/esgWorkbookImport";

describe("probe", () => {
  it("parses the SG workbook", () => {
    const buf = readFileSync("C:/Users/Administrator/Documents/okiru-private-data/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx");
    const preview = parseEsgWorkbookXlsx(buf) as any;
    const secs = preview.sections ?? {};
    console.log("SECTIONS:", Object.keys(secs).length);
    for (const [k, v] of Object.entries<any>(secs)) {
      const n = Object.keys(v.cells ?? {}).length;
      if (n) console.log(`  ${k}: ${n} cells`);
    }
    const e = secs["e-data"]?.cells ?? {};
    console.log("E-DATA KEYS:", Object.keys(e).slice(0, 20).join(", "));
  });
});
