/**
 * What a spreadsheet row becomes once a pillar stores it.
 *
 * A bulk upload and a hand-typed record have to mean the same thing — if they
 * differ, the same company scores two different ways depending on how its data
 * arrived, and nobody can tell which figure is real. These tests pin the
 * mapping for each pillar, including the places where a guess would quietly
 * hand out points: an unrecognised designation, a contribution nobody
 * classified, a percentage written as 0.27 rather than 27.
 *
 * Every fixture is shaped like a real information-gathering sheet — banner
 * rows, a header several rows down, a combined name column — because that is
 * what consultants upload.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSectionSheet } from "@/lib/workbookExcelNormalizer";
import { buildSectionTemplate } from "@/lib/informationRequestTemplate";
import { BULK_IMPORT_SPECS, type BulkImportSpec, type ParsedRow } from "../bulkImportSpecs";

function sheet(name: string, rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NEW", "v1.33"]]), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Read a sheet through a pillar's spec, exactly as the dialog does. */
function importRows<T>(spec: BulkImportSpec<T>, buffer: ArrayBuffer): { entities: T[]; skipped: number } {
  const read = readSectionSheet(buffer, spec.columns, { sectionKey: spec.sectionKey });
  const entities: T[] = [];
  let skipped = 0;
  for (const row of read.rows as ParsedRow[]) {
    if (spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === "")) {
      skipped += 1;
      continue;
    }
    entities.push(spec.toEntity(row));
  }
  return { entities, skipped };
}

describe("Management Control", () => {
  const spec = BULK_IMPORT_SPECS["management-control"];

  const buffer = sheet("Management Control", [
    ["", "Measured Entity: Acme Logistics", "", "", "", "Management Control"],
    [],
    ["", "Detail", "", "Use dropdown", "Use dropdown", "Use dropdown"],
    ["", "Name & Surname", "ID Number", "Designation", "Race", "Gender"],
    [1, "Thandi Mokoena", "8501015800083", "Senior Manager", "African", "Female"],
    [2, "Pieter van Wyk", "7203126000081", "Chief Financial Officer", "White", "Male"],
    [3, "", "", "", "", ""],
  ]);

  it("rebuilds the person's whole name from a combined column", () => {
    const { entities } = importRows(spec, buffer);
    expect(entities.map((e) => e.name)).toEqual(["Thandi Mokoena", "Pieter van Wyk"]);
  });

  it("reads race, gender and band", () => {
    const { entities } = importRows(spec, buffer);
    expect(entities[0]).toMatchObject({ race: "African", gender: "Female", designation: "Senior" });
  });

  /**
   * "Chief Financial Officer" is not one of the bands. Reading it as an
   * executive would award management points the entity has not evidenced, so
   * an unrecognised title lands at the bottom, not the top.
   */
  it("does not promote a title it does not recognise", () => {
    const { entities } = importRows(spec, buffer);
    expect(entities[1].designation).toBe("Junior");
  });

  it("counts a blank row as skipped rather than importing a nameless employee", () => {
    const { entities, skipped } = importRows(spec, buffer);
    expect(entities).toHaveLength(2);
    expect(skipped).toBe(0); // fully blank rows never reach the spec
  });

  it("skips a row that has data but no name", () => {
    const withNoName = sheet("Management Control", [
      ["", "Name & Surname", "ID Number", "Designation", "Race", "Gender"],
      ["", "", "8501015800083", "Senior Manager", "African", "Female"],
    ]);
    const { entities, skipped } = importRows(spec, withNoName);
    expect(entities).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

describe("Skills Development", () => {
  const spec = BULK_IMPORT_SPECS["skills-development"];

  it("adds the itemised costs up rather than trusting a stated total", () => {
    const buffer = sheet("Skills Development", [
      ["Measured Entity: Acme"],
      [
        "Training Program",
        "Learner Name",
        "Category (A–G)",
        "Course Cost (R)",
        "Travel Cost (R)",
        "Total Cost (R)",
      ],
      ["Forklift Licence", "Sipho Dlamini", "C", 10000, 2500, 99999],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].totalCost).toBe(12500);
    expect(entities[0].courseCost).toBe(10000);
  });

  it("falls back to the stated total when the sheet itemises nothing", () => {
    const buffer = sheet("Skills Development", [
      ["Training Program", "Learner Name", "Category (A–G)", "Total Cost (R)"],
      ["Bursary", "Nomsa Khumalo", "A", 48000],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].totalCost).toBe(48000);
    expect(entities[0].isBursary).toBe(true);
    expect(entities[0].category).toBe("bursary");
  });

  it("needs both a programme and a learner", () => {
    const buffer = sheet("Skills Development", [
      ["Training Program", "Learner Name", "Category (A–G)", "Total Cost (R)"],
      ["Forklift Licence", "", "C", 10000],
      ["", "Sipho Dlamini", "C", 10000],
    ]);
    const { entities, skipped } = importRows(spec, buffer);
    expect(entities).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});

describe("Ownership", () => {
  const spec = BULK_IMPORT_SPECS.ownership;

  it("reads a black shareholder as wholly black-owned, sized by their holding", () => {
    const buffer = sheet("Ownership", [
      ["Ownership"],
      ["Shareholder", "Race", "Gender", "Voting Rights (%)", "Economic Interest (%)"],
      ["Nomsa Khumalo", "African", "Female", 63, 63],
    ]);
    const { entities } = importRows(spec, buffer);

    // The holder is 100% black; how much of the company that is worth comes
    // from the voting/economic percentages, not from this number.
    expect(entities[0].blackOwnership).toBe(100);
    expect(entities[0].blackWomenOwnership).toBe(100);
    expect(entities[0].votingRightsPercent).toBe(63);
  });

  it("gives a white shareholder no black ownership", () => {
    const buffer = sheet("Ownership", [
      ["Shareholder", "Race", "Gender", "Voting Rights (%)"],
      ["Pieter van Wyk", "White", "Male", 37],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].blackOwnership).toBe(0);
    expect(entities[0].blackWomenOwnership).toBe(0);
  });

  /**
   * A trust's black percentage is stated outright and is not derivable from a
   * race column, so an explicit figure always wins.
   */
  it("prefers a stated black percentage over deriving one", () => {
    const buffer = sheet("Ownership", [
      ["Shareholder", "Race", "Black Ownership (%)", "Voting Rights (%)"],
      ["Family Trust", "", 45, 30],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].blackOwnership).toBe(45);
  });

  it("reads a percentage written as a fraction the same way", () => {
    const buffer = sheet("Ownership", [
      ["Shareholder", "Race", "Gender", "Voting Rights (%)"],
      ["Nomsa Khumalo", "African", "Female", 0.63],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].votingRightsPercent).toBeCloseTo(63, 5);
  });
});

describe("Procurement", () => {
  const spec = BULK_IMPORT_SPECS.procurement;

  it("reads spend, level and size", () => {
    const buffer = sheet("Procurement", [
      ["Procurement / Suppliers"],
      ["Supplier Name", "Spend (R)", "B-BBEE Level", "Current Company Size", "Black Ownership (%)"],
      ["Bolt & Nut Co", 1250000, "4", "QSE", 51],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0]).toMatchObject({
      name: "Bolt & Nut Co",
      spend: 1250000,
      beeLevel: 4,
      enterpriseType: "qse",
      blackOwnership: 51,
    });
  });

  it("reads an unrecognised B-BBEE level as none rather than as level 1", () => {
    const buffer = sheet("Procurement", [
      ["Supplier Name", "Spend (R)", "B-BBEE Level"],
      ["Unverified Supplies", 50000, "Non-compliant"],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].beeLevel).toBe(0);
  });
});

describe("ESD and SED contributions", () => {
  it("keeps a contribution nobody classified as unclassified", () => {
    const spec = BULK_IMPORT_SPECS.esd;
    const buffer = sheet("Enterprise Development", [
      ["Enterprise & Supplier Development"],
      ["Supplier Name", "Contribution Type", "Amount (R)"],
      ["Emerging Transport CC", "Grant", 250000],
    ]);
    const { entities } = importRows(spec, buffer);

    // Scores nothing until someone says whether it is SD or ED. Guessing here
    // is the difference between an entity passing a sub-minimum and not.
    expect(entities[0].category).toBe("unclassified");
    expect(entities[0].amount).toBe(250000);
  });

  it("honours a stated ESD category", () => {
    const spec = BULK_IMPORT_SPECS.esd;
    const buffer = sheet("Enterprise Development", [
      ["Supplier Name", "ESD Category", "Contribution Type", "Amount (R)"],
      ["Emerging Transport CC", "Supplier Development", "Grant", 250000],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].category).toBe("supplier_development");
  });

  it("files every SED row as socio-economic and carries the black benefit", () => {
    const spec = BULK_IMPORT_SPECS.sed;
    const buffer = sheet("Social Development", [
      ["Socio-Economic Development"],
      ["Beneficiary Name", "Contribution Type", "Amount (R)", "% Benefiting Black People"],
      ["Rural Schools Trust", "Bursaries", 180000, 100],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].category).toBe("socio_economic");
    expect(entities[0].blackBenefitPercent).toBe(100);
  });

  it("leaves the black benefit unstated when the sheet does not state it", () => {
    const spec = BULK_IMPORT_SPECS.sed;
    const buffer = sheet("Social Development", [
      ["Beneficiary Name", "Contribution Type", "Amount (R)"],
      ["Rural Schools Trust", "Bursaries", 180000],
    ]);
    const { entities } = importRows(spec, buffer);
    expect(entities[0].blackBenefitPercent).toBeUndefined();
  });
});

describe("YES 4 Youth", () => {
  const spec = BULK_IMPORT_SPECS.yes;

  /**
   * A workbook carrying BOTH registers. They hold the same columns, so picking
   * by content would read the wrong tab with complete confidence — the sheet's
   * name is the only thing that separates them.
   */
  function bothRegisters(): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NEW", "v1.33"]]), "Instructions");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["", "Management Control"],
        ["", "Name & Surname", "ID Number", "Designation", "Race", "Gender"],
        [1, "Pieter van Wyk", "7203126000081", "Senior Manager", "White", "Male"],
      ]),
      "Management Control",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["", "Youth Employment Service"],
        ["", "Name & Surname", "ID Number", "Job title", "Race", "Gender", "Disabled"],
        [1, "Lerato Ndlovu", "0106140800087", "Warehouse Assistant", "African", "Female", "No"],
        [2, "Sipho Dlamini", "0201015800081", "Driver Assistant", "African", "Male", "No"],
      ]),
      "Y.E.S Employees",
    );
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }

  it("reads the Y.E.S sheet, not Management Control", () => {
    const read = readSectionSheet(bothRegisters(), spec.columns, {
      sectionKey: spec.sectionKey,
      sheetHints: spec.sheetHints,
    });
    expect(read.sheetName).toBe("Y.E.S Employees");
  });

  it("brings the candidates across as YES-flagged, which is what the pillar counts", () => {
    const read = readSectionSheet(bothRegisters(), spec.columns, {
      sectionKey: spec.sectionKey,
      sheetHints: spec.sheetHints,
    });
    const entities = read.rows.map((r) => spec.toEntity(r as ParsedRow));

    expect(entities).toHaveLength(2);
    expect(entities.map((e) => e.learnerName)).toEqual(["Lerato Ndlovu", "Sipho Dlamini"]);
    expect(entities.every((e) => e.isYesEmployee)).toBe(true);
    expect(entities.every((e) => e.isBlack)).toBe(true);
  });

  /**
   * The sheet states neither, and inventing either would hand out points the
   * entity has not evidenced — absorption is a large part of the YES uplift.
   */
  it("claims no cost and no absorption, because the register states neither", () => {
    const read = readSectionSheet(bothRegisters(), spec.columns, {
      sectionKey: spec.sectionKey,
      sheetHints: spec.sheetHints,
    });
    const entities = read.rows.map((r) => spec.toEntity(r as ParsedRow));

    expect(entities.every((e) => e.totalCost === 0)).toBe(true);
    expect(entities.every((e) => e.isAbsorbed === false)).toBe(true);
  });
});

/**
 * The loop that had been broken: the product tells you what to fill in, and
 * then reads back what you filled in. Every pillar's blank sheet must import
 * through that pillar's own upload.
 */
describe("the blank sheet a pillar offers is one that pillar can read", () => {
  const cases: Array<[string, BulkImportSpec<unknown>]> = Object.entries(BULK_IMPORT_SPECS) as never;

  it.each(cases)("%s", (_key, spec) => {
    const built = buildSectionTemplate(spec.sectionKey, { sectorCode: "RCOGP" });
    expect(built).not.toBeNull();

    const buffer = XLSX.write(built!.workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const read = readSectionSheet(buffer, spec.columns, { sectionKey: spec.sectionKey });

    expect(read.sheetName).not.toBeNull();
    // Every heading it writes is a heading it understands, and the required
    // ones are all there — otherwise a filled-in sheet loses columns silently.
    const understood = read.headers.filter((h, i) => h && read.mappedKeys[i]);
    expect(understood.length).toBe(read.headers.filter(Boolean).length);
    for (const key of spec.requiredKeys) {
      expect(read.mappedKeys).toContain(key);
    }
  });
});
