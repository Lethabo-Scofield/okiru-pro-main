/**
 * The ESG parser→workbook seam is a CONTRACT, and these are the terms.
 *
 * The mapping itself is another agent's job. What must be true today, and must
 * stay true after they implement it, is that this layer never invents a cell:
 * a value that was not extracted is never written, an empty patch set never
 * reaches the workbook API, and the counts the UI shows always reconcile to
 * what the parser actually returned.
 *
 * If someone implements the mapping and these still pass, the honesty
 * guarantees survived the change.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyEsgParserResult,
  collectEsgExtractedValues,
  esgCaseFileNames,
  esgPatchCellCount,
  persistEsgSectionPatches,
  type EsgParserCaseLike,
} from "../esgParserInjection";

/** The ESG parser's own result shape — `documents`, not `documents_detected`. */
const CASE: EsgParserCaseLike = {
  status: "resolved",
  case_id: "esg-case-1",
  domain: "esg",
  documents: [{ file_name: "city-power-oct.pdf" }, { file_name: "unreadable-scan.pdf" }],
  ai_entities: {
    extractions: [
      {
        documentId: "ghg_energy__municipal_electricity_bill",
        documentName: "Municipal electricity bill / utility statement",
        sourceFile: "city-power-oct.pdf",
        element: "GHG_ENERGY",
        values: [
          {
            field: "site_name",
            value: "ISANDO",
            sourceFile: "city-power-oct.pdf",
            sourceDocumentId: "ghg_energy__municipal_electricity_bill",
          },
          {
            field: "electricity_kwh",
            value: 35332,
            sourceFile: "city-power-oct.pdf",
            sourceDocumentId: "ghg_energy__municipal_electricity_bill",
          },
          // The parser reports absent data as null. That is not a reading.
          { field: "max_demand_kva", value: null },
          { field: "meter_number", value: "   " },
        ],
        missingFields: ["max_demand_kva"],
        unexpectedFields: [],
        exceptions: [],
      },
      {
        documentId: "unknown",
        sourceFile: "unreadable-scan.pdf",
        element: "",
        values: [],
      },
    ],
  },
};

describe("applyEsgParserResult — the mapping layer", () => {
  it("writes NOTHING when the case carries no calculator mapping at all", () => {
    const result = applyEsgParserResult(CASE);

    // The layer exists…
    expect(result.implemented).toBe(true);
    // …but this case reached us with no `ai_entities.calculator`, and the only
    // way to place anything from raw field names would be to keep a second
    // field→key table on the client. A half-mapping would silently score wrong
    // cells, so nothing is written.
    expect(result.patches).toEqual({});
    expect(esgPatchCellCount(result.patches)).toBe(0);
    expect(result.placed).toEqual([]);
  });

  it("still reports every real value it read, with its provenance", () => {
    const result = applyEsgParserResult(CASE);

    expect(result.valuesRead).toBe(2);
    expect(result.unplaced.map((v) => v.field).sort()).toEqual(["electricity_kwh", "site_name"]);

    const kwh = result.unplaced.find((v) => v.field === "electricity_kwh");
    expect(kwh?.value).toBe(35332);
    expect(kwh?.sourceFile).toBe("city-power-oct.pdf");
    expect(kwh?.element).toBe("GHG_ENERGY");
    // Never a bare "unknown error" — the user is told why it is not in a cell.
    expect(kwh?.reason).toMatch(/not built yet/i);
  });

  it("never counts a null, an empty string or whitespace as a value read", () => {
    const values = collectEsgExtractedValues(CASE);
    expect(values.some((v) => v.field === "max_demand_kva")).toBe(false);
    expect(values.some((v) => v.field === "meter_number")).toBe(false);
  });

  it("reconciles: every value read appears in exactly one bucket", () => {
    const result = applyEsgParserResult(CASE);
    expect(result.placed.length + result.unplaced.length + result.conflicts.length).toBe(
      result.valuesRead,
    );
  });

  it("keeps the per-value provenance the parser stamps on each reading", () => {
    const kwh = applyEsgParserResult(CASE).unplaced.find((v) => v.field === "electricity_kwh");
    expect(kwh?.documentId).toBe("ghg_energy__municipal_electricity_bill");
  });

  it("survives an empty, malformed or absent case without inventing anything", () => {
    for (const input of [null, {}, { ai_entities: {} }, { ai_entities: { extractions: [] } }]) {
      const result = applyEsgParserResult(input as EsgParserCaseLike | null);
      expect(result.valuesRead).toBe(0);
      expect(result.patches).toEqual({});
      expect(result.unplaced).toEqual([]);
    }
  });
});

/**
 * The same case, as the parser ACTUALLY sends it once its calculator half has
 * run: matrix field names already resolved to allowlisted keys, with the files
 * that agreed on each.
 */
const MAPPED_CASE: EsgParserCaseLike = {
  status: "resolved",
  case_id: "esg-case-2",
  domain: "esg",
  documents: [{ file_name: "board-pack.pdf" }, { file_name: "ee-plan.pdf" }],
  ai_entities: {
    extractions: [
      {
        documentId: "board_governance__board_charter_and_composition",
        sourceFile: "board-pack.pdf",
        element: "BOARD_GOVERNANCE",
        values: [
          { field: "board_members_total", value: 8, sourceFile: "board-pack.pdf" },
          { field: "board_black_percent", value: 62.5, sourceFile: "board-pack.pdf" },
          { field: "ghg_verified_scope1_tco2e", value: 412.4, sourceFile: "board-pack.pdf" },
        ],
      },
      {
        documentId: "employment_equity__ee_plan",
        sourceFile: "ee-plan.pdf",
        element: "EMPLOYMENT_EQUITY",
        values: [
          { field: "ee_plan_submitted_to_doel", value: "Partial", sourceFile: "ee-plan.pdf" },
          { field: "entity_name", value: "Lake Trading", sourceFile: "ee-plan.pdf" },
        ],
      },
    ],
    calculator: {
      payload: {},
      rows: [],
      entries: [
        { key: "board.members_total", value: 8, sourceField: "board_members_total", sourceFiles: ["board-pack.pdf"] },
        { key: "board.black_percent", value: 62.5, sourceField: "board_black_percent", sourceFiles: ["board-pack.pdf"] },
        { key: "emissions.scope1_total_tco2e", value: 412.4, sourceField: "ghg_verified_scope1_tco2e", sourceFiles: ["board-pack.pdf"] },
        { key: "ee.plan_submitted", value: "Partial", sourceField: "ee_plan_submitted_to_doel", sourceFiles: ["ee-plan.pdf"] },
      ],
      unmapped: [],
      // The parser withholds a contested field BEFORE mapping it, so it never
      // becomes an entry — it arrives only as a review item.
      needsReview: [
        { field: "entity_name", values: ["Lake Trading", "Lake Trading (Pty) Ltd"], sources: ["ee-plan.pdf", "afs.pdf"] },
      ],
    },
  },
};

describe("applyEsgParserResult — with the parser's calculator mapping", () => {
  it("writes each mapped value to the cell the workbook actually uses", () => {
    const result = applyEsgParserResult(MAPPED_CASE);

    expect(result.implemented).toBe(true);
    expect(result.patches["g-data"].cells.B5).toBe(8);
    // UNIT: G_Data!B8 is a FRACTION — it is banded against Assumptions!B50
    // (0.6), so a printed 62.5 would beat the target outright.
    expect(result.patches["g-data"].cells.B8).toBe(0.625);
    // "Partial" survives as a value in its own right, never rounded to a boolean.
    expect(result.patches.ee.cells.B9).toBe("Partial");
  });

  it("never writes a cell esgDeriveSummary computes, and says why", () => {
    const result = applyEsgParserResult(MAPPED_CASE);

    // A verified Scope 1 total is real evidence — and E_Data!L79 is a roll-up
    // of the monthly grids. Writing it would freeze a stale number into the score.
    expect(result.patches["e-data"]).toBeUndefined();
    const scope1 = result.unplaced.find((v) => v.field === "ghg_verified_scope1_tco2e");
    expect(scope1?.reason).toMatch(/calculates this itself \(E_Data!L79\)/);
  });

  it("keeps a contested figure out of the patches and names both candidates", () => {
    const result = applyEsgParserResult(MAPPED_CASE);

    expect(result.patches["company-reporting-setup"]).toBeUndefined();
    const conflict = result.conflicts.find((c) => c.cellRef === "entity_name");
    expect(conflict?.candidates.map((c) => c.value)).toEqual([
      "Lake Trading",
      "Lake Trading (Pty) Ltd",
    ]);
    // And it is not ALSO reported as unplaced — exactly one bucket per reading.
    expect(result.unplaced.some((v) => v.field === "entity_name")).toBe(false);
    expect(result.placed.some((v) => v.field === "entity_name")).toBe(false);
  });

  it("reconciles: every reading lands in exactly one bucket", () => {
    const result = applyEsgParserResult(MAPPED_CASE);

    const conflictedReadings = result.conflicts.reduce(
      (sum, conflict) =>
        sum + new Set(conflict.candidates.flatMap((c) => c.sources)).size,
      0,
    );
    expect(result.valuesRead).toBe(5);
    // `entity_name` was read once here but is contested against a file outside
    // this case's extractions, so the conflict accounts for it.
    expect(result.placed.length + result.unplaced.length).toBe(4);
    expect(conflictedReadings).toBeGreaterThan(0);
  });

  it("carries each reading's own provenance onto the cell it filled", () => {
    const placed = applyEsgParserResult(MAPPED_CASE).placed;
    const boardSize = placed.find((v) => v.field === "board_members_total");

    expect(boardSize).toMatchObject({
      sectionId: "g-data",
      cellRef: "B5",
      value: 8,
      sourceFile: "board-pack.pdf",
    });
  });
});

describe("esgCaseFileNames — the one place that knows how the parser names files", () => {
  it("reads the ESG shape (documents + unreadable_files)", () => {
    expect(esgCaseFileNames(CASE).sort()).toEqual(["city-power-oct.pdf", "unreadable-scan.pdf"]);
    expect(
      esgCaseFileNames({
        documents: [{ file_name: "a.pdf" }],
        unreadable_files: [{ file_name: "b.pdf", reason: "no text layer" }],
      }),
    ).toEqual(["a.pdf", "b.pdf"]);
  });

  it("still reads the B-BBEE shape, so a contract change cannot silently blank it", () => {
    expect(
      esgCaseFileNames({
        documents_detected: [{ filename: "c.pdf", status: "passed" }],
      }),
    ).toEqual(["c.pdf"]);
  });

  it("falls back to extraction provenance when no file list is sent at all", () => {
    expect(
      esgCaseFileNames({
        ai_entities: { extractions: [{ sourceFile: "d.pdf", values: [] }] },
      }),
    ).toEqual(["d.pdf"]);
  });

  it("is empty, not noisy, for a null case", () => {
    expect(esgCaseFileNames(null)).toEqual([]);
  });
});

describe("persistEsgSectionPatches", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("does not call the workbook API when there is nothing to write", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(persistEsgSectionPatches("company-1", {})).resolves.toBe(false);
    await expect(
      persistEsgSectionPatches("company-1", { "e-data": { cells: {} } }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes through the SAME import endpoint the .xlsx path confirms with", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      persistEsgSectionPatches("company-1", { "e-data": { cells: { B14: 35332 } } }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/esg/workbook/company-1/import");
    expect(init.method).toBe("POST");
    // confirm:true is what the server requires to actually save, and `sections`
    // is the shape EsgImportPreview already carries.
    expect(JSON.parse(String(init.body))).toEqual({
      confirm: true,
      sections: { "e-data": { cells: { B14: 35332 } } },
    });
  });

  it("surfaces a failed write rather than pretending the workbook was filled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "Workbook is locked" }),
      })) as unknown as typeof fetch,
    );

    await expect(
      persistEsgSectionPatches("company-1", { "e-data": { cells: { B14: 1 } } }),
    ).rejects.toThrow(/locked/i);
  });
});
