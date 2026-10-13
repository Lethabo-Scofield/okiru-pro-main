/**
 * The template in parts (C3): the whole workbook, each pillar, each sheet.
 *
 * Every part is a file someone will fill in and import, so each one gets its
 * own round trip: a blank file imports nothing but its own furniture and
 * touches no section it does not carry, and a filled one brings every answer
 * back to the address the app reads.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildEsgWorkbookTemplateXlsx, ESG_BULK_TEMPLATE_SHEETS } from "../esgWorkbookTemplate";
import {
  ESG_TEMPLATE_GROUPS,
  ESG_TEMPLATE_WHOLE,
  esgTemplateHref,
  esgTemplatePart,
  type EsgTemplateSheet,
} from "../esgTemplateParts";
import { parseEsgWorkbookXlsx, type EsgImportPreview } from "../esgWorkbookImport";
import { ESG_GRID_SECTIONS, type EsgGridSectionId } from "../esgGridSections";
import { esgColumnRef } from "../esgGridRows";
import { ESG_INPUT_SECTIONS } from "../esgSections";

function fill(book: XLSX.WorkBook, sheetName: string, ref: string, value: string | number): void {
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error(`template has no sheet ${sheetName}`);
  sheet[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
  const range = XLSX.utils.decode_range(String(sheet["!ref"] ?? "A1"));
  const cell = XLSX.utils.decode_cell(ref);
  range.e.r = Math.max(range.e.r, cell.r);
  range.e.c = Math.max(range.e.c, cell.c);
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

/** One register row, typed the way a client would type it. */
function fillRegisterRow(book: XLSX.WorkBook, id: EsgGridSectionId): void {
  const def = ESG_GRID_SECTIONS[id];
  def.columns.forEach((col, idx) => {
    const value =
      col.type === "select" && col.options?.length
        ? String(col.options[0])
        : col.type === "number"
          ? 1
          : col.type === "date"
            ? "2026-01-31"
            : `Sample ${col.label}`;
    fill(book, def.sheet, `${esgColumnRef(id, idx)}${def.startRow}`, value);
  });
}

const rows = (preview: EsgImportPreview, id: string) => Number(preview.sections[id]?.cells?._row_count ?? 0);

/** For each sheet: an answer a client would give, and where it must come back. */
const PROBES: Record<EsgTemplateSheet, { fill: (book: XLSX.WorkBook) => void; check: (p: EsgImportPreview) => void }> = {
  Cover: {
    fill: (book) => {
      const cover = book.Sheets.Cover!;
      const row = Object.keys(cover).find(
        (ref) => ref.startsWith("A") && String(cover[ref].v).toLowerCase().includes("entity"),
      );
      if (!row) throw new Error("Cover has no Entity label");
      fill(book, "Cover", `B${row.slice(1)}`, "Acme Distribution (Pty) Ltd");
    },
    check: (p) => expect(p.sections["company-reporting-setup"]?.cells.entity).toBe("Acme Distribution (Pty) Ltd"),
  },
  Assumptions: {
    fill: (book) => fill(book, "Assumptions", "B43", 0.05),
    check: (p) => expect(p.sections.assumptions?.cells.B43).toBe(0.05),
  },
  E_Data: {
    fill: (book) => fill(book, "E_Data", "B92", 412_000),
    check: (p) => expect(p.sections["e-data"]?.cells.B92).toBe(412_000),
  },
  S_Data: {
    // The sheet carries three sections; the file has to bring back all three.
    fill: (book) => {
      fill(book, "S_Data", "B5", 3);
      fillRegisterRow(book, "s-data-ofo");
      fillRegisterRow(book, "s-data-csi");
    },
    check: (p) => {
      expect(p.sections["s-data"]?.cells.B5).toBe(3);
      expect(rows(p, "s-data-ofo")).toBe(1);
      expect(rows(p, "s-data-csi")).toBe(1);
    },
  },
  G_Data: {
    fill: (book) => fill(book, "G_Data", "B12", "Yes"),
    check: (p) => expect(p.sections["g-data"]?.cells.B12).toBe("Yes"),
  },
  EE_Scorecard: {
    fill: (book) => fill(book, "EE_Scorecard", "B5", 0.62),
    check: (p) => expect(p.sections.ee?.cells.B5).toBe(0.62),
  },
  Waste_Register: {
    fill: (book) => fillRegisterRow(book, "waste"),
    check: (p) => expect(rows(p, "waste")).toBe(1),
  },
  Fleet_Register: {
    fill: (book) => fillRegisterRow(book, "fleet"),
    check: (p) => expect(rows(p, "fleet")).toBe(1),
  },
  Driver_Debrief: {
    fill: (book) => fillRegisterRow(book, "driver-debrief"),
    check: (p) => expect(rows(p, "driver-debrief")).toBe(1),
  },
  ISO_Tracker: {
    fill: (book) => fillRegisterRow(book, "iso-tracker"),
    check: (p) => expect(rows(p, "iso-tracker")).toBe(1),
  },
  King5_Scorecard: {
    fill: (book) => fillRegisterRow(book, "king5"),
    check: (p) => expect(rows(p, "king5")).toBe(1),
  },
  IFRS_S1_S2: {
    fill: (book) => fillRegisterRow(book, "ifrs"),
    check: (p) => expect(rows(p, "ifrs")).toBe(1),
  },
  GARP_GRAP: {
    fill: (book) => fillRegisterRow(book, "garp"),
    check: (p) => expect(rows(p, "garp")).toBe(1),
  },
  SAQ_Supplier: {
    fill: (book) => fillRegisterRow(book, "saq"),
    check: (p) => expect(rows(p, "saq")).toBe(1),
  },
};

const DATA_SHEETS = ESG_BULK_TEMPLATE_SHEETS.filter((s) => s !== "Instructions");

const EVERY_PART = [
  ESG_TEMPLATE_WHOLE,
  ...ESG_TEMPLATE_GROUPS.map((g) => g.id),
  ...ESG_TEMPLATE_GROUPS.flatMap((g) => g.sheets.map((s) => s.id)),
];

/** The input sections a sheet feeds — `S_Data` feeds three. */
const sectionsOn = (sheet: string) => ESG_INPUT_SECTIONS.filter((s) => s.sheet === sheet).map((s) => s.id);

describe("esgTemplateParts — the catalogue", () => {
  it("puts every template sheet in exactly one pillar", () => {
    const listed = ESG_TEMPLATE_GROUPS.flatMap((g) => g.sheets.map((s) => s.sheet));
    expect([...listed].sort()).toEqual([...DATA_SHEETS].sort());
  });

  it("names each sheet part after an input section that lives on that sheet", () => {
    for (const part of ESG_TEMPLATE_GROUPS.flatMap((g) => g.sheets)) {
      expect(sectionsOn(part.sheet)).toContain(part.id);
    }
  });

  it("files each sheet under the pillar it scores in", () => {
    const pillarOf = (sheet: string) => ESG_TEMPLATE_GROUPS.find((g) => g.sheets.some((s) => s.sheet === sheet))?.id;
    expect(pillarOf("ISO_Tracker")).toBe("environmental");
    expect(pillarOf("Driver_Debrief")).toBe("social");
    expect(pillarOf("SAQ_Supplier")).toBe("social");
    expect(pillarOf("GARP_GRAP")).toBe("governance");
    expect(pillarOf("Cover")).toBe("setup");
  });

  it("keeps the whole workbook's link and file name, and refuses a part that names nothing", () => {
    expect(esgTemplatePart(undefined)?.fileName).toBe("esg-bulk-input-template.xlsx");
    expect(esgTemplatePart("")?.id).toBe(ESG_TEMPLATE_WHOLE);
    expect(esgTemplatePart("social")?.fileName).toBe("esg-template-social.xlsx");
    expect(esgTemplatePart("fleet")?.sheets.map((s) => s.sheet)).toEqual(["Fleet_Register"]);
    expect(esgTemplatePart("../etc/passwd")).toBeNull();
    expect(esgTemplateHref("")).toBe("/api/esg/workbook/template");
    expect(esgTemplateHref("", ESG_TEMPLATE_WHOLE)).toBe("/api/esg/workbook/template");
    expect(esgTemplateHref("https://okiru.pro", "iso-tracker")).toBe(
      "https://okiru.pro/api/esg/workbook/template?part=iso-tracker",
    );
  });
});

describe.each(EVERY_PART)("the %s template", (partId) => {
  const part = esgTemplatePart(partId)!;
  const carried = new Set<string>(part.sheets.map((s) => s.sheet));
  const inScope = new Set(part.sheets.flatMap((s) => sectionsOn(s.sheet)));

  it("carries its own sheets in workbook order, after the instructions", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(partId), { type: "buffer" });
    expect(book.SheetNames).toEqual(["Instructions", ...DATA_SHEETS.filter((s) => carried.has(s))]);

    // The cover note describes this file, not the fifteen-sheet one.
    const notes = Object.entries(book.Sheets.Instructions!)
      .filter(([ref]) => !ref.startsWith("!"))
      .map(([, cell]) => String(cell.v))
      .join("\n");
    for (const sheet of DATA_SHEETS) {
      expect(`${sheet}:${notes.includes(`  ${sheet} `)}`).toBe(`${sheet}:${carried.has(sheet)}`);
    }
  });

  it("imports back blank as nothing: no rows, no hints, no stray sheets, nothing outside itself", () => {
    const preview = parseEsgWorkbookXlsx(buildEsgWorkbookTemplateXlsx(partId));
    expect(preview.unmatchedSheets).toEqual([]);
    for (const id of Object.keys(preview.sections)) {
      expect(`${id}:${inScope.has(id)}`).toBe(`${id}:true`);
      expect(`${id}:${rows(preview, id)}`).toBe(`${id}:0`);
      const hints = Object.values(preview.sections[id]!.cells).filter(
        (v) => typeof v === "string" && v.toLowerCase().startsWith("choose one"),
      );
      expect(hints).toEqual([]);
    }
  });

  it("brings every answer back to the address the app reads", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(partId), { type: "buffer" });
    for (const sheet of part.sheets) PROBES[sheet.sheet].fill(book);
    const preview = parseEsgWorkbookXlsx(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
    for (const sheet of part.sheets) PROBES[sheet.sheet].check(preview);
    expect(Object.keys(preview.sections).filter((id) => !inScope.has(id))).toEqual([]);
  });
});
