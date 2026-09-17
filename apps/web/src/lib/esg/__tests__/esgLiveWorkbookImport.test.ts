/**
 * Importing the workbook AS THE CLIENT ACTUALLY BUILDS IT.
 *
 * Every fixture here is copied from `Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`
 * — the real Super Group workbook — not from an idealised layout. The live
 * sheets interleave the registers with banners ("FLEET SUMMARY"), the sheet's
 * own TOTAL rows, transposed monthly matrices (the Cority % block), repeated
 * header rows and "→ ADD NEW" instructions, all inside the register's column
 * window. The import used to swallow every one of them as data:
 *
 *   - "FLEET SUMMARY" became a vehicle with registration "FLEET SUMMARY";
 *   - the waste TOTAL row doubled every kilogram;
 *   - the Cority matrix became waste streams whose Waste Type was 0.111;
 *   - E_Data landed under sheet addresses (`C14`) no grid ever reads, so the
 *     sidebar counted 788 cells while every monthly grid rendered empty.
 *
 * These tests pin the whole contract: registers hold ONLY register rows, the
 * companion structures are carried to the cells the derive layer reads, and
 * E_Data / headcount data lands where the app can actually see it.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { readEsgGridRows } from "../esgGridRows";
import type { EsgGridSectionId } from "../esgGridSections";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import { hydrateEsgSectionCells } from "../esgSheetStructure";
import { esgRegisterRowProblems } from "../esgValidationRules";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

function sheetFrom(cells: Record<string, string | number>): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  let maxRow = 0;
  let maxCol = 0;
  for (const [ref, v] of Object.entries(cells)) {
    sheet[ref] = { t: typeof v === "number" ? "n" : "s", v };
    const { r, c } = XLSX.utils.decode_cell(ref);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return sheet;
}

function workbookFrom(sheets: Record<string, Record<string, string | number>>): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, cells] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, sheetFrom(cells), name);
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function rowsOf(preview: ReturnType<typeof parseEsgWorkbookXlsx>, sectionId: EsgGridSectionId) {
  return readEsgGridRows(
    preview.sections[sectionId]?.cells as Record<string, unknown> | undefined,
    sectionId,
  );
}

/* ------------------------------------------------------------------ *
 * Waste_Register — the sheet from the screenshot
 * ------------------------------------------------------------------ */

// Rows 1–20 of the live sheet: 4 real streams, the Oricol TOTAL, the Cority
// matrix (header row 12, % values row 13), and the scorecard block.
const LIVE_WASTE_SHEET: Record<string, string | number> = {
  A1: "WASTE REGISTER — Oricol + Cority",
  A3: "WASTE STREAMS — Mar-26",
  A4: "Month", B4: "Depot", C4: "Waste Type", D4: "Total kg",
  E4: "Recycled kg", F4: "Landfill kg", G4: "Diverted %", H4: "Landfill tCO₂e",
  A5: "Mar-26", B5: "CPT", C5: "Commercial/Industrial (landfill)", D5: 2000, E5: 0, F5: 2000, G5: 0, H5: 1.16,
  A6: "Mar-26", B6: "CPT", C6: "Commercial/Industrial (recycled)", D6: 6580, E6: 6580, F6: 0, G6: 1, H6: 0,
  A7: "Mar-26", B7: "CPT", C7: "Paper/Cardboard K4", D7: 1100, E7: 1100, F7: 0, G7: 1, H7: 0,
  A8: "Mar-26", B8: "CPT", C8: "LDPE Shrinkwrap", D8: 880, E8: 880, F8: 0, G8: 1, H8: 0,
  A9: "Mar-26", B9: "ALL", C9: "TOTAL (Oricol Big Number)", D9: 22470, E9: 20470, F9: 2000, G9: "91.1%", H9: 1.16,
  A11: "CORITY CARDBOARD RECYCLING",
  A12: "Month", B12: "Jul-25", C12: "Aug-25", D12: "Sep-25", E12: "Oct-25", F12: "Nov-25", G12: "Dec-25", H12: "Jan-26",
  A13: "% Recycled (all depots)", B13: 0.107, C13: 0.162, D13: 0.111, E13: 0.089, F13: 0.264, G13: 0.107, H13: 0.046,
  A15: "WASTE SCORECARD — targets",
  A16: "Oricol CPT diversion", B16: 0.911, C16: "≥90%", D16: "✓ Met", E16: 5,
  A17: "Average monthly % recycled", B17: 0.124, C17: "≥25%", E17: 4,
  A19: "Waste contractor score", B19: "IMS-T-149 Oricol", C19: "≥80%", E19: 3,
  A20: "ISO 14001 waste assessment", C20: "Yes", E20: 3,
};

describe("Waste_Register — the live sheet imports as 4 streams, not 11 rows of furniture", () => {
  const preview = parseEsgWorkbookXlsx(workbookFrom({ Waste_Register: LIVE_WASTE_SHEET }));
  const rows = rowsOf(preview, "waste");

  it("imports exactly the four real waste streams", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.wasteType)).toEqual([
      "Commercial/Industrial (landfill)",
      "Commercial/Industrial (recycled)",
      "Paper/Cardboard K4",
      "LDPE Shrinkwrap",
    ]);
  });

  it("skips the sheet's own TOTAL row — importing it doubles every kilogram", () => {
    expect(rows.some((r) => String(r.wasteType ?? "").startsWith("TOTAL"))).toBe(false);
    expect(rows.some((r) => r.depot === "ALL")).toBe(false);
  });

  it("does not turn the Cority matrix or banners into waste streams", () => {
    // "CORITY CARDBOARD RECYCLING" (banner), "Month | Jul-25 …" (header echo)
    // and "% Recycled … | 0.107 …" (transposed matrix) are structure, not rows.
    expect(rows.some((r) => String(r.month ?? "").includes("CORITY"))).toBe(false);
    expect(rows.some((r) => r.month === "Month")).toBe(false);
    expect(rows.some((r) => typeof r.wasteType === "number")).toBe(false);
  });

  it("carries the Cority monthly percentages to the cells the derive layer reads", () => {
    const cells = preview.sections.waste?.cells ?? {};
    expect(cells.B13).toBe(0.107); // deriveCority reads waste!B13:J13
    expect(cells.F13).toBe(0.264);
  });

  it("carries the scorecard inputs (diversion, ISO 14001 answer) through", () => {
    const cells = preview.sections.waste?.cells ?? {};
    expect(cells.B16).toBe(0.911);
    expect(cells.C20).toBe("Yes");
  });

  it("imported rows pass the register hygiene rule", () => {
    const wb = { companyId: "t", sections: preview.sections, updatedAt: "" } as unknown as EsgWorkbookData;
    expect(esgRegisterRowProblems(wb, "waste")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Fleet_Register — banner terminates before the summary matrix
 * ------------------------------------------------------------------ */

describe("Fleet_Register — the FLEET SUMMARY block is not a set of vehicles", () => {
  const sheet: Record<string, string | number> = {
    A3: "Reg", B3: "Depot", C3: "Model/Category",
    A4: "JR45DZGP", B4: "SGTSPFMCG", C4: "11-Seater Bus", D4: 3445,
    A5: "KY75THGP", B5: "SGTSPFMCG", C5: "HINO 1627 8T", D5: 16000,
    A6: "KY82RLGP", B6: "SGTBLOEM", C6: "HINO 614 2.5T", D6: 5500,
    A21: "FLEET SUMMARY",
    A22: "Depot", B22: "Total Vehicles", C22: "32T Scania",
    A23: "SGTBLOEM", B23: 16, C23: 2,
    A24: "SGTCPT", B24: 14, C24: 2,
    A28: "TOTAL", B28: 134, C28: 19,
    A30: "EV FLEET TRANSITION OPTIONS",
    A31: "EV Model", B31: "Range (km)",
    A32: "MAXUS eDeliver 3", B32: 330, C32: 900,
  };
  const preview = parseEsgWorkbookXlsx(workbookFrom({ Fleet_Register: sheet }));
  const rows = rowsOf(preview, "fleet");

  it("imports only the vehicles above the banner", () => {
    expect(rows.map((r) => r.reg)).toEqual(["JR45DZGP", "KY75THGP", "KY82RLGP"]);
  });

  it("never manufactures a vehicle out of a depot summary or an EV catalogue", () => {
    const regs = rows.map((r) => String(r.reg ?? ""));
    expect(regs).not.toContain("FLEET SUMMARY");
    expect(regs).not.toContain("SGTBLOEM");
    expect(regs).not.toContain("TOTAL");
    expect(regs).not.toContain("MAXUS eDeliver 3");
  });
});

/* ------------------------------------------------------------------ *
 * Driver_Debrief — the "add new" instruction row
 * ------------------------------------------------------------------ */

describe("Driver_Debrief — instruction rows are not debriefs", () => {
  const sheet: Record<string, string | number> = {
    A3: "Date", B3: "Depot", C3: "Driver Name",
    A4: "2026-04-01", B4: "SGTPE", C4: "Hubrey Malgas", D4: "KZ00LRGP", E4: "010426EJ002", F4: 1, G4: 1, H4: 1,
    A5: "2026-04-01", B5: "SGTPE", C5: "James Jantjies", D5: "LC22HRGP", E5: "010426EL003", F5: 0.85, G5: 7, H5: 6,
    A6: "→ ADD NEW DEBRIEFS BELOW THIS LINE",
  };
  const preview = parseEsgWorkbookXlsx(workbookFrom({ Driver_Debrief: sheet }));
  const rows = rowsOf(preview, "driver-debrief");

  it("stops at the instruction row", () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.driver)).toEqual(["Hubrey Malgas", "James Jantjies"]);
  });
});

/* ------------------------------------------------------------------ *
 * King5 / GARP / SAQ — found by the hygiene rules on the first live run
 * ------------------------------------------------------------------ */

describe("King5_Scorecard — exactly 17 principles, never the TOTAL block", () => {
  const sheet: Record<string, string | number> = { A3: "#", B3: "Principle", C3: "Status" };
  for (let i = 1; i <= 17; i++) {
    sheet[`A${3 + i}`] = i;
    sheet[`B${3 + i}`] = `[Chapter ${i}] Principle ${i}`;
    sheet[`C${3 + i}`] = "Applied";
    sheet[`D${3 + i}`] = 6;
  }
  // The sheet's own TOTAL rows, inside the column window (live rows 21–22).
  sheet.A21 = "KING V TOTAL SCORE";
  sheet.E21 = 87;
  sheet.G21 = "Max theoretical: 170";
  sheet.E22 = 0.794;
  const preview = parseEsgWorkbookXlsx(workbookFrom({ King5_Scorecard: sheet }));
  const rows = rowsOf(preview, "king5");

  it("imports the 17 principles and stops", () => {
    expect(rows).toHaveLength(17);
    expect(rows.some((r) => String(r.num ?? "").includes("TOTAL"))).toBe(false);
  });
});

describe("GARP_GRAP — the sheet starts at column B, and so must the import", () => {
  const preview = parseEsgWorkbookXlsx(
    workbookFrom({
      GARP_GRAP: {
        B4: "Risk / Requirement", C4: "Description", E4: "Severity", F4: "Control Status",
        B5: "Climate Physical Risk", C5: "Flooding (DBN 2022)", D5: "E_Data",
        E5: "High", F5: "Effective", G5: "Flood response plan", I5: 4,
      },
    }),
  );
  const rows = rowsOf(preview, "garp");

  it("reads each field from its declared column — Control Status is F, not Severity", () => {
    expect(rows).toHaveLength(1);
    expect(rows[0].risk).toBe("Climate Physical Risk");
    expect(rows[0].severity).toBe("High");
    expect(rows[0].controlStatus).toBe("Effective"); // was "High" when read positionally
    expect(rows[0].likelihood).toBe(4);
  });
});

describe("SAQ_Supplier — a banner with a [Source: …] annotation still ends the register", () => {
  const preview = parseEsgWorkbookXlsx(
    workbookFrom({
      SAQ_Supplier: {
        A4: "Supplier Name", B4: "On-Time Del",
        A5: "Fuel Supplier — ENGEN", B5: 3, C5: 3,
        A6: "Waste Contractor — Oricol", B6: 3, C6: 3,
        A7: "SANULAC / LACTALIS SUSTAINABILITY DATA  [Source: Maxine/Sanulac Sustainability report.xlsx]",
        A8: "Depot", B8: "Period", C8: "Elec kWh",
        A9: "Gauteng (JHB)", B9: "H1 2025", C9: 5701,
      },
    }),
  );
  const rows = rowsOf(preview, "saq");

  it("imports the two suppliers and none of the sustainability table below", () => {
    expect(rows.map((r) => r.supplier)).toEqual(["Fuel Supplier — ENGEN", "Waste Contractor — Oricol"]);
  });
});

/* ------------------------------------------------------------------ *
 * S_Data — headcount matrix, OFO register, CSI register with TOTAL
 * ------------------------------------------------------------------ */

describe("S_Data — every structure on the sheet lands where the app reads it", () => {
  const sheet: Record<string, string | number> = {
    A4: "Occupational Level", B4: "Af M", C4: "Col M",
    // Headcount matrix B5:K11 — nonzero test values.
    B5: 1, C5: 0, F5: 2, // Top management: 1 Af M, 2 Af F
    B8: 40, G8: 12, // Skilled technical
    K11: 3, // Non-permanent For F
    A57: "OFO CODES — TRAINING",
    A58: "OFO Code", B58: "Occupation", C58: "Learners (#)",
    A59: "911101", B59: "Heavy Motor Vehicle Drivers", C59: 77, D59: "Fatigue Risk Mgmt",
    A60: "334101", B60: "SHEQ Officers", C60: 5, D60: "ISO 14001",
    G61: "Add more rows below this line",
    A70: "COMMUNITY & SOCIAL INVESTMENT",
    A71: "Initiative", B71: "Month", C71: "Beneficiaries",
    A72: "Mandela Day", B72: "Jul-25", C72: "Community service", D72: 15000,
    A73: "CHOC Foundation", B73: "Ongoing", C73: "Childhood cancer", D73: 25000,
    A82: "TOTAL CSI/SED SPEND", D82: 40000,
  };
  const preview = parseEsgWorkbookXlsx(workbookFrom({ S_Data: sheet }));

  it("translates the headcount matrix to the hc_ cells the EE scorecard reads", () => {
    const cells = preview.sections["s-data"]?.cells ?? {};
    expect(cells.hc_0_0).toBe(1); // Top management Af M
    expect(cells.hc_0_4).toBe(2); // Top management Af F (col F → index 4)
    expect(cells.hc_3_0).toBe(40); // Skilled technical Af M (row 8 → level index 3)
    expect(cells.hc_6_9).toBe(3); // Non-permanent For F
  });

  it("imports the OFO register and stops at the instruction row", () => {
    const rows = rowsOf(preview, "s-data-ofo");
    expect(rows.map((r) => r.ofoCode)).toEqual(["911101", "334101"]);
  });

  it("imports CSI initiatives without the TOTAL row that doubles the spend", () => {
    const rows = rowsOf(preview, "s-data-csi");
    expect(rows.map((r) => r.initiative)).toEqual(["Mandela Day", "CHOC Foundation"]);
    const spend = rows.reduce((a, r) => a + Number(r.spend ?? 0), 0);
    expect(spend).toBe(40000); // not 80000
  });
});

/* ------------------------------------------------------------------ *
 * E_Data — sheet addresses become the cells the grids display
 * ------------------------------------------------------------------ */

describe("E_Data — imported data is structured into the monthly grids, not just held", () => {
  const sheet: Record<string, string | number> = {
    B4: 2.68, // diesel EF
    A13: "Depot/Source", B13: "Unit", C13: "Jul-25",
    A14: "SG Consumer – BLOEM", B14: "litres", C14: 17639.52, D14: 5922,
    A15: "SG Consumer – CPT", B15: "litres", C15: 6789, N15: "Mariette/STATS/Diesel.xlsx",
    A17: "SG Consumer – ISANDO", B17: "litres", C17: 35757.98,
    A41: "SG Consumer – BLOEM", C41: 20495,
    A44: "SG Consumer – ISANDO", C44: 147015,
    // Solar block in the live sheet's own scrambled order: ISANDO first.
    A50: "Solar – ISANDO (JHB)", C50: 1200,
    A51: "Solar – DBN (EDGE)", C51: 800,
    A58: "SG Consumer – BLOEM", C58: 45.57,
    A67: "% Waste Recycled (all depots)", C67: 10.65,
  };
  const preview = parseEsgWorkbookXlsx(workbookFrom({ E_Data: sheet }));
  const cells = preview.sections["e-data"]?.cells ?? {};

  it("places diesel per depot into the s1a grid cells", () => {
    expect(cells.s1a_C14).toBe(17639.52); // BLOEM
    expect(cells.s1a_D14).toBe(5922);
    expect(cells.s1a_C15).toBe(6789); // CPT
    expect(cells.s1a_C17).toBe(35757.98); // ISANDO
  });

  it("matches solar rows by depot NAME — the live sheet scrambles the order", () => {
    // ISANDO is index 3 on the app's depot axis, so its solar lands at row 17,
    // not row 14 where ordinal mapping would mis-attribute it to BLOEM.
    expect(cells.solar_C17).toBe(1200);
    expect(cells.solar_C16).toBe(800); // DBN → index 2
    expect(cells.solar_C14).toBeUndefined();
  });

  it("places electricity, water and the Cority waste row", () => {
    expect(cells.s2_C14).toBe(20495);
    expect(cells.s2_C17).toBe(147015);
    expect(cells.water_C14).toBe(45.57);
    expect(cells.waste_C14).toBe(10.65);
  });

  it("carries the source file column into the grid's Source field", () => {
    expect(cells.s1a_src_1).toBe("Mariette/STATS/Diesel.xlsx");
  });

  it("keeps the raw sheet cells too — the GHG page and derive fallbacks read them", () => {
    expect(cells.C14).toBe(17639.52);
    expect(cells.B4).toBe(2.68);
  });
});

/* ------------------------------------------------------------------ *
 * Hydration — workbooks imported BEFORE this fix
 * ------------------------------------------------------------------ */

describe("workbooks that already hold sheet addresses display and score without re-import", () => {
  it("hydrates an e-data section for the editor", () => {
    const cells = hydrateEsgSectionCells("e-data", { A14: "BLOEM", C14: 100, C41: 500 });
    expect(cells.s1a_C14).toBe(100);
    expect(cells.s2_C14).toBe(500);
  });

  it("a typed value always beats the translation", () => {
    const cells = hydrateEsgSectionCells("e-data", { C14: 100, s1a_C14: 999 });
    expect(cells.s1a_C14).toBe(999);
  });

  it("derive sees sheet-address data — an imported workbook scores immediately", () => {
    const wb = {
      companyId: "t",
      updatedAt: "",
      sections: {
        "e-data": { cells: { A14: "SG Consumer – BLOEM", C14: 100, D14: 50 } },
        "s-data": { cells: { B5: 4, F5: 6 } },
      },
    } as unknown as EsgWorkbookData;
    const derived = deriveEsgSummaryCells(wb);
    const e = derived.sections?.["e-data"]?.cells ?? {};
    const s = derived.sections?.["s-data"]?.cells ?? {};
    expect(e.L19).toBe(150); // Σ s1a — only reachable via translation
    expect(s.L5).toBe(10); // headcount row total from hc_ cells
  });
});

/* ------------------------------------------------------------------ *
 * Register hygiene — the rule that was missing
 * ------------------------------------------------------------------ */

describe("register hygiene names what is wrong instead of ignoring it", () => {
  const wb = (cells: Record<string, unknown>): EsgWorkbookData =>
    ({
      companyId: "t",
      updatedAt: "",
      sections: { fleet: { cells } },
    }) as unknown as EsgWorkbookData;

  it("flags a row missing its required column", () => {
    const problems = esgRegisterRowProblems(wb({ B4: "CPT", C4: "HINO" }), "fleet");
    expect(problems.some((p) => /Reg missing/.test(p))).toBe(true);
  });

  it("flags a dropdown value outside its vocabulary", () => {
    const problems = esgRegisterRowProblems(
      wb({ A4: "JR45DZGP", P4: "Maybe" }), // isEv is Yes/No
      "fleet",
    );
    expect(problems.some((p) => /Electric \(EV\)/.test(p) && /Maybe/.test(p))).toBe(true);
  });

  it("passes a clean register and an empty one", () => {
    expect(esgRegisterRowProblems(wb({ A4: "JR45DZGP", P4: "Yes" }), "fleet")).toEqual([]);
    expect(esgRegisterRowProblems(wb({}), "fleet")).toEqual([]);
  });
});
