/**
 * The template has one job beyond looking like a form: what a client fills in
 * has to come back through the front door. So these tests generate it, fill a
 * row in, and run it through the real importer.
 *
 * That round trip is the whole point of generating the file from the column
 * definitions instead of shipping a static workbook. A static one drifts — and
 * the drift only shows up as a client's import silently losing a pillar.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  TEMPLATE_CHOICES,
  buildInformationRequestTemplate,
  buildSectionTemplate,
  templateFileName,
} from "@/lib/informationRequestTemplate";
import { normalizeExcelBuffer } from "@/lib/workbookExcelNormalizer";

function toBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Sheets that carry guidance rather than client data. */
const NON_DATA_SHEETS = new Set(["Instructions", "Lists"]);

describe("information request template", () => {
  it("offers a template for every sector, and one per FSC sub-sector", () => {
    const sectors = new Set(TEMPLATE_CHOICES.map((c) => c.spec.sectorCode));
    expect([...sectors].sort()).toEqual(
      ["AGRI", "CONSTRUCTION", "FSC", "ICT", "RCOGP", "TRANSPORT"].sort(),
    );
    // The sub-sector decides whether there is an AFS pillar at all, so Banks and
    // Short-Term Insurers cannot share one file.
    const fsc = TEMPLATE_CHOICES.filter((c) => c.spec.sectorCode === "FSC");
    expect(fsc.map((c) => c.spec.fscSubSector)).toEqual([
      "Others",
      "Banks",
      "Long-Term Insurers",
      "Short-Term Insurers",
    ]);
  });

  it.each(TEMPLATE_CHOICES)("$label — every data sheet is one the importer knows", (choice) => {
    const wb = buildInformationRequestTemplate(choice.spec);
    const result = normalizeExcelBuffer(toBuffer(wb));

    const dataSheets = wb.SheetNames.filter((n) => !NON_DATA_SHEETS.has(n));
    expect(dataSheets.length).toBeGreaterThan(4);
    for (const sheet of dataSheets) {
      expect(result.mappedSheets[sheet], `"${sheet}" was not recognised`).toBeTruthy();
    }
  });

  it.each(TEMPLATE_CHOICES)("$label — opens with Instructions and carries the pillars", (choice) => {
    const wb = buildInformationRequestTemplate(choice.spec);
    expect(wb.SheetNames[0]).toBe("Instructions");
    for (const sheet of ["Ownership", "Management Control", "Skills Development", "Procurement"]) {
      expect(wb.SheetNames).toContain(sheet);
    }
  });

  it("puts the register's headings on row 2, under a single-cell title", () => {
    const wb = buildInformationRequestTemplate({ sectorCode: "RCOGP" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Ownership"], {
      header: 1,
      defval: "",
    }) as unknown[][];

    // One value on the title row: a second would be read as the heading row by
    // an importer that cannot recognise the real one.
    expect(rows[0].filter((c) => String(c ?? "").trim() !== "")).toHaveLength(1);
    expect(rows[1].filter((c) => String(c ?? "").trim() !== "").length).toBeGreaterThan(4);
  });

  it("marks required columns with * and still recognises them", () => {
    const wb = buildInformationRequestTemplate({ sectorCode: "RCOGP" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Management Control"], {
      header: 1,
      defval: "",
    }) as unknown[][];
    const headers = (rows[1] as unknown[]).map((h) => String(h ?? ""));

    expect(headers).toContain("Race *");
    expect(headers).toContain("Gender *");
    expect(headers.some((h) => h.endsWith(" *"))).toBe(true);
  });

  /**
   * The round trip, end to end: fill the file in the way the instructions
   * describe and confirm the rows arrive where the scorer reads them.
   */
  it("a filled-in template imports back into the right sections", () => {
    const wb = buildInformationRequestTemplate({ sectorCode: "RCOGP" });

    const fill = (sheet: string, values: unknown[]) => {
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
      rows.push(values);
      wb.Sheets[sheet] = XLSX.utils.aoa_to_sheet(rows);
    };

    const headerOf = (sheet: string): string[] =>
      ((XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "" })[1] ??
        []) as unknown[]).map((h) => String(h ?? ""));

    const put = (sheet: string, values: Record<string, unknown>) => {
      const headers = headerOf(sheet);
      const row = headers.map((h) => {
        const key = Object.keys(values).find((k) => h.toLowerCase().startsWith(k.toLowerCase()));
        return key ? values[key] : "";
      });
      fill(sheet, row);
    };

    put("Ownership", { Shareholder: "Nomsa Khumalo", Race: "African", Gender: "Female" });
    put("Management Control", {
      "First Name": "Thandi",
      Surname: "Mokoena",
      Race: "African",
      Gender: "Female",
      Designation: "Senior Manager",
    });

    const result = normalizeExcelBuffer(toBuffer(wb));

    const ownership = result.sections.ownership?.rows ?? [];
    expect(ownership).toHaveLength(1);
    expect(ownership[0].shareholderName).toBe("Nomsa Khumalo");
    expect(ownership[0].race).toBe("African");

    const mc = result.sections["management-control"]?.rows ?? [];
    expect(mc).toHaveLength(1);
    expect(mc[0].name).toBe("Thandi");
    expect(mc[0].surname).toBe("Mokoena");
    expect(mc[0].designation).toBe("Senior Manager");
  });

  it("gives FSC Banks an AFS sheet and gives nobody else one", () => {
    const banks = buildInformationRequestTemplate({ sectorCode: "FSC", fscSubSector: "Banks" });
    expect(banks.SheetNames).toContain("AFS Additions");

    const generic = buildInformationRequestTemplate({ sectorCode: "RCOGP" });
    expect(generic.SheetNames).not.toContain("AFS Additions");

    const fscOther = buildInformationRequestTemplate({ sectorCode: "FSC", fscSubSector: "Others" });
    expect(fscOther.SheetNames).not.toContain("AFS Additions");
  });

  it("asks ICT its own SED question and does not ask it of anyone else", () => {
    const headersFor = (spec: Parameters<typeof buildInformationRequestTemplate>[0]) => {
      const wb = buildInformationRequestTemplate(spec);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Social Development"], {
        header: 1,
        defval: "",
      }) as unknown[][];
      // SED is a register for most sectors and a hybrid under FSC, so find the
      // row that actually carries the headings.
      return rows.flat().map((c) => String(c ?? ""));
    };

    expect(headersFor({ sectorCode: "ICT" }).some((h) => h.includes("ICT"))).toBe(true);
    expect(headersFor({ sectorCode: "RCOGP" }).some((h) => h.includes("ICT"))).toBe(false);
  });

  it("lists the allowed values for every dropdown column", () => {
    const wb = buildInformationRequestTemplate({ sectorCode: "RCOGP" });
    expect(wb.SheetNames).toContain("Lists");

    const text = XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets["Lists"], { header: 1, defval: "" })
      .flat()
      .map((c) => String(c ?? ""))
      .join(" | ");

    expect(text).toContain("African");
    expect(text).toContain("Senior Manager");
  });

  it("names the file after the sector, and the client when there is one", () => {
    expect(templateFileName({ sectorCode: "FSC", fscSubSector: "Banks" })).toBe(
      "B-BBEE Information Request - FSC Banks.xlsx",
    );
    expect(
      templateFileName({ sectorCode: "ICT", companyName: "Acme (Pty) Ltd" }),
    ).toBe("B-BBEE Information Request - Acme (Pty) Ltd - ICT.xlsx");
  });

  describe("single-pillar template", () => {
    it("carries the same headings as that pillar's sheet in the full workbook", () => {
      const full = buildInformationRequestTemplate({ sectorCode: "RCOGP" });
      const fullHeaders = (
        XLSX.utils.sheet_to_json<unknown[]>(full.Sheets["Procurement"], {
          header: 1,
          defval: "",
        })[1] as unknown[]
      ).map((h) => String(h ?? ""));

      const one = buildSectionTemplate("procurement", { sectorCode: "RCOGP" });
      expect(one).not.toBeNull();
      const oneHeaders = (
        XLSX.utils.sheet_to_json<unknown[]>(one!.workbook.Sheets["Procurement"], {
          header: 1,
          defval: "",
        })[1] as unknown[]
      ).map((h) => String(h ?? ""));

      expect(oneHeaders).toEqual(fullHeaders);
    });

    it("is named for the pillar", () => {
      const one = buildSectionTemplate("skills-development", { sectorCode: "RCOGP" });
      expect(one?.fileName).toBe("Skills Development template.xlsx");
    });
  });
});
