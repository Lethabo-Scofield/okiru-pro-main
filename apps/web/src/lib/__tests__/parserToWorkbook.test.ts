/**
 * The wiring that closes the loop: parser extractions → workbook rows + meta.
 *
 * The properties that matter: a document that describes many people becomes many
 * ROWS (not one flattened row), entity-level values land in META rather than a
 * grid row, values that cannot be placed are reported, and required-field gaps
 * are surfaced.
 */
import { describe, expect, it } from "vitest";
import {
  entityMatchKey,
  linkWorkbookRows,
  mergeWorkbookSections,
  normaliseEntityName,
  parserExtractionsToWorkbook,
  toWorkbookSections,
} from "../parserToWorkbook";
import type { ParserExtraction, WorkbookRow } from "../parserToWorkbook";

function extraction(over: Partial<ParserExtraction> & { values: ParserExtraction["values"] }): ParserExtraction {
  return { documentId: "doc", sourceFile: "evidence.pdf", ...over };
}

describe("scalar values become one row", () => {
  it("turns a certificate's fields into a single procurement row", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [
          { field: "supplier_name", value: "Dynamic Maintenance Products" },
          { field: "bee_level", value: "4" },
          { field: "claimed_spend_ex_vat", value: "R 4 876.00" },
        ],
      }),
    ]);

    expect(result.rows.procurement).toHaveLength(1);
    const row = result.rows.procurement![0];
    expect(row.supplierName).toBe("Dynamic Maintenance Products");
    // bbbeeLevel is a dropdown of level STRINGS ("1".."8"), so it stays "4" —
    // the workbook stores the option, and matching to the option is the point.
    expect(row.bbbeeLevel).toBe("4");
    expect(row.spend).toBeCloseTo(4876, 2);
  });

  it("keeps provenance on the row", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "cert.pdf", values: [{ field: "supplier_name", value: "Alpha" }] }),
    ]);
    expect(result.rows.procurement![0]._sourceFiles).toEqual(["cert.pdf"]);
  });
});

describe("a table becomes many rows", () => {
  it("expands a share register into one row per shareholder", () => {
    // The failure this prevents: flattening twelve shareholders into one row
    // scores a fraction of the ownership.
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        values: [
          {
            field: "holdings_table",
            value: [
              { holder_name: "V Naidoo", number_of_shares: 60 },
              { holder_name: "N Dlamini", number_of_shares: 40 },
            ],
          },
        ],
      }),
    ]);

    expect(result.rows.ownership).toHaveLength(2);
    expect(result.rows.ownership!.map((r) => r.shareholderName)).toEqual(["V Naidoo", "N Dlamini"]);
    expect(result.rows.ownership!.map((r) => r.numberOfShares)).toEqual([60, 40]);
  });

  it("expands an employee register and lands the occupational level Management Control scores", () => {
    // The whole MC chain in one row: the register's occupational level must reach
    // a cell the scorecard can group by. "Executive Management" → the workbook's
    // "Top Management" option → (downstream) the Executive band.
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "MANAGEMENT_CONTROL",
        values: [
          {
            field: "employee_rows",
            value: [
              { employee_name: "V Lutchman", race: "Indian", gender: "Male", occupational_level: "Executive Management" },
            ],
          },
        ],
      }),
    ]);

    const row = result.rows["management-control"]![0];
    expect(row.name).toBe("V Lutchman");
    expect(row.race).toBe("Indian");
    expect(row.occupationalLevel).toBe("Top Management");
    // The scoring band is NOT forced into the cell — that is the projection's job.
    expect(result.rejected.map((r) => r.field)).not.toContain("occupationalLevel");
  });

  it("expands an SED beneficiary schedule with amounts routed to the SED pillar", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "SED",
        values: [
          {
            field: "beneficiary_rows",
            value: [
              { beneficiary_name: "Essentially Edenvale", contribution_value: "R 16 700", contribution_type: "Grant Contribution" },
            ],
          },
        ],
      }),
    ]);

    const row = result.rows.sed![0];
    expect(row.beneficiaryName).toBe("Essentially Edenvale");
    expect(row.amount).toBeCloseTo(16700, 2);
    expect(row.contributionType).toBe("Grant Contribution");
    // Nothing leaked into ESD.
    expect(result.rows.esd ?? []).toHaveLength(0);
  });

  it("expands a learner schedule and keeps the per-learner spend", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "SKILLS_DEVELOPMENT",
        values: [
          {
            field: "learner_rows",
            value: [
              { learner_name: "T Nkosi", race: "African", gender: "Female", category_code: "B", total_cost: "12000" },
            ],
          },
        ],
      }),
    ]);

    const row = result.rows["skills-development"]![0];
    expect(row.learnerName).toBe("T Nkosi");
    expect(row.race).toBe("African");
    expect(row.categoryCode).toBe("B");
    expect(row.totalCost).toBeCloseTo(12000, 2);
    // total_cost used to be dropped as unmapped.
    expect(result.coverage.unmapped).not.toContain("total_cost");
  });
});

describe("entity-level values go to meta, not a row", () => {
  it("routes TMPS to financial-information meta", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [{ field: "total_pre_exclusions_tmps", value: "R 1 030 806.68" }],
      }),
    ]);

    // TMPS is the procurement DENOMINATOR — one number, not a supplier row.
    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(1030806.68, 2);
    expect(result.rows.procurement ?? []).toHaveLength(0);
  });

  it("keeps the first meta value when two documents disagree", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
    ]);

    expect(result.meta["financial-information"]?.revenue).toBe(10826271);
  });
});

describe("nothing is forced", () => {
  it("reports a value that cannot satisfy its column", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        values: [
          { field: "holder_name", value: "T Nkosi" },
          { field: "declared_race", value: "Klingon" }, // not a dropdown option
        ],
      }),
    ]);

    expect(result.rows.ownership![0].shareholderName).toBe("T Nkosi");
    expect(result.rows.ownership![0].race).toBeUndefined();
    expect(result.rejected.map((r) => r.field)).toContain("race");
    expect(result.rejected[0].sourceFile).toBe("evidence.pdf");
  });

  it("reports a parser field it has no mapping for", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ values: [{ field: "hpcsa_number", value: "PS0123456" }] }),
    ]);
    expect(result.coverage.unmapped).toContain("hpcsa_number");
  });
});

describe("required-field hunting is surfaced", () => {
  it("flags a supplier row with spend but no name", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ element: "ESD", values: [{ field: "claimed_spend_ex_vat", value: 1000 }] }),
    ]);

    const columns = result.coverage.gaps.map((g) => g.column);
    expect(columns).toContain("supplierName");
    expect(result.coverage.complete).toBe(false);
  });
});

describe("shaping for the workbook", () => {
  it("produces the { rows, meta } shape the workbook consumes", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ element: "ESD", values: [
        { field: "supplier_name", value: "Alpha" },
        { field: "total_pre_exclusions_tmps", value: 1000000 },
      ] }),
    ]);

    const sections = toWorkbookSections(result);
    expect(sections.procurement.rows.length).toBeGreaterThan(0);
    expect(sections["financial-information"].meta?.tmps).toBe(1000000);
  });

  it("handles an empty case without throwing", () => {
    const result = parserExtractionsToWorkbook([]);
    expect(result.rows).toEqual({});
    expect(result.coverage.complete).toBe(true);
  });
});

describe("cross-document row linking", () => {
  let seq = 0;
  /** Rows default to the SAME source file — the common case within one sheet. */
  const row = (cells: Record<string, unknown>, sources: string[] = ["wb.xlsm › Procurement"]): WorkbookRow =>
    ({ _id: `r${(seq += 1)}`, ...cells, _sourceFiles: sources });
  const link = (input: Parameters<typeof linkWorkbookRows>[0]) => linkWorkbookRows(input);

  it("normalises legal suffixes, case and ampersands — never fuzzily", () => {
    expect(normaliseEntityName("Thandanani Packers & Hauliers cc"))
      .toBe(normaliseEntityName("THANDANANI PACKERS AND HAULIERS"));
    expect(normaliseEntityName("Alpha (Pty) Ltd")).toBe(normaliseEntityName("alpha"));
    // Initials are NOT expanded — guessing identity is how someone else's
    // certificate lands on the wrong supplier.
    expect(normaliseEntityName("S. Nhlanhla")).not.toBe(normaliseEntityName("Sandile Nhlanhla"));
  });

  it("links a supplier's certificate to their schedule row — one complete row", () => {
    const linked = link({
      procurement: [
        row({ supplierName: "Dynamic Maintenance (Pty) Ltd", spend: 4876 }, ["workbook.xlsm › Procurement"]),
        row({ supplierName: "DYNAMIC MAINTENANCE", bbbeeLevel: "4", empoweringSupplier: "Yes" }, ["dynamic-cert.pdf"]),
      ],
    });

    expect(linked.rows.procurement).toHaveLength(1);
    const merged = linked.rows.procurement![0];
    expect(merged.spend).toBe(4876);
    expect(merged.bbbeeLevel).toBe("4");
    expect(merged.empoweringSupplier).toBe("Yes");
    expect(merged._sourceFiles).toEqual(["workbook.xlsm › Procurement", "dynamic-cert.pdf"]);
  });

  it("keeps two spend lines from the SAME document separate — even when equal", () => {
    // Within one document, two lines are two transactions; thirteen monthly
    // R500 donations are thirteen contributions. Deduplicating equal figures
    // deletes money.
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", spend: 1000 }),
        row({ supplierName: "Alpha", spend: 2500 }),
        row({ supplierName: "Alpha", spend: 1000 }),
      ],
    });
    expect(linked.rows.procurement).toHaveLength(3);
    const linkedSed = link({
      sed: Array.from({ length: 13 }, () => row({ beneficiaryName: "Essentially Edenvale", amount: 500 })),
    });
    expect(linkedSed.rows.sed).toHaveLength(13);
  });

  it("matches a ledger's spelling of a supplier to the schedule's", () => {
    // Real filings: the schedule says "BP Edenvale" and "Subbiah Enterprises";
    // the ledgers are filed as "B P EDENVALE" and "SUBBIAH ENTERPRISE".
    expect(entityMatchKey("B P EDENVALE")).toBe(entityMatchKey("BP Edenvale"));
    expect(entityMatchKey("SUBBIAH ENTERPRISE")).toBe(entityMatchKey("Subbiah Enterprises"));
    // Still not fuzzy: initials are not expanded into names.
    expect(entityMatchKey("S. Nhlanhla")).not.toBe(entityMatchKey("Sandile Nhlanhla"));
    expect(entityMatchKey("TST Truck")).not.toBe(entityMatchKey("TST Truc Chassis"));
  });

  it("a supplier's ledger corroborates the schedule instead of doubling it", () => {
    // Different DOCUMENTS reporting the same supplier's spend are the same fact
    // stated twice. Counting both would report R2.04m for a supplier the client
    // claimed R412,797 for.
    const linked = link({
      procurement: [
        row({ supplierName: "BP Edenvale", spend: 412797.4 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "B P EDENVALE", spend: 1628821.85 }, ["B P EDENVALE LEDGER.xlsx"]),
      ],
    });

    expect(linked.rows.procurement).toHaveLength(1);
    // The LOWER figure is scored: never inflate a claim on our own judgement.
    expect(linked.rows.procurement![0].spend).toBeCloseTo(412797.4, 2);
    // …and the gap is reported, because the client is under-claiming.
    expect(linked.reconciliation).toHaveLength(1);
    expect(linked.reconciliation[0].message).toContain("B P EDENVALE LEDGER.xlsx");
    expect(linked.reconciliation[0].message).toContain("1,628,821.85");
  });

  it("says nothing when two documents agree", () => {
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", spend: 1000 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "Alpha", spend: "R 1,000.00" }, ["ALPHA LEDGER.xlsx"]),
      ],
    });
    expect(linked.rows.procurement).toHaveLength(1);
    expect(linked.reconciliation).toEqual([]);
  });

  it("a certificate qualifies EVERY spend line of its supplier", () => {
    // The certificate merges into one row; its level and empowering status are
    // the supplier's identity, so they propagate to the other spend lines too.
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", spend: 1000 }),
        row({ supplierName: "Alpha", spend: 1000 }),
        row({ supplierName: "ALPHA (Pty) Ltd", bbbeeLevel: "2", empoweringSupplier: "Yes" }),
      ],
    });
    expect(linked.rows.procurement).toHaveLength(2);
    expect(linked.rows.procurement![0].bbbeeLevel).toBe("2");
    expect(linked.rows.procurement![1].bbbeeLevel).toBe("2");
    expect(linked.rows.procurement![1].empoweringSupplier).toBe("Yes");
    // Per-line evidence never propagates: both rows keep their own spend.
    expect(linked.rows.procurement!.map((r) => r.spend)).toEqual([1000, 1000]);
  });

  it("never overwrites an existing value when filling blanks", () => {
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", bbbeeLevel: "2" }),
        row({ supplierName: "Alpha", bbbeeLevel: "5", spend: 700 }),
      ],
    });
    expect(linked.rows.procurement).toHaveLength(1);
    expect(linked.rows.procurement![0].bbbeeLevel).toBe("2");
    expect(linked.rows.procurement![0].spend).toBe(700);
  });

  it("keys employees on name AND surname", () => {
    const linked = link({
      "management-control": [
        row({ name: "V", surname: "Naidoo", race: "Indian" }),
        row({ name: "V", surname: "Naidoo", gender: "Male" }),
        row({ name: "V", surname: "Lutchman" }),
      ],
    });
    expect(linked.rows["management-control"]).toHaveLength(2);
    expect(linked.rows["management-control"]![0].gender).toBe("Male");
  });

  it("leaves nameless rows and single-row sections untouched", () => {
    const nameless = [row({ spend: 500 }), row({ spend: 700 })];
    const linked = link({ procurement: nameless, sed: [row({ beneficiaryName: "OUTA" })] });
    expect(linked.rows.procurement).toHaveLength(2);
    expect(linked.rows.sed).toHaveLength(1);
  });

  it("links end-to-end through parserExtractionsToWorkbook", () => {
    // The real shape of the evidence: the workbook schedule (a table) plus the
    // supplier's certificate (a scalar document) in one upload.
    const result = parserExtractionsToWorkbook([
      {
        documentId: "sheet_table__esd",
        sourceFile: "wb.xlsm › Procurement",
        element: "ESD",
        values: [{
          field: "supplier_rows",
          value: [
            { supplier_name: "Outsurance Ltd", claimed_spend_ex_vat: "12000" },
            { supplier_name: "BP Edenvale", claimed_spend_ex_vat: "8000" },
          ],
        }],
      },
      {
        documentId: "esd__valid_b_bbee_verification_certificate_per_sampled_supplier",
        sourceFile: "Outsurance bbbee-certificate-2024.pdf",
        element: "ESD",
        values: [
          { field: "supplier_name", value: "OUTSURANCE" },
          { field: "certificate_recognition_level", value: "2" },
          { field: "empowering_supplier", value: "Yes" },
        ],
      },
    ]);

    expect(result.rows.procurement).toHaveLength(2);
    const outsurance = result.rows.procurement!.find((r) => String(r.supplierName).toLowerCase().startsWith("outsurance"))!;
    expect(outsurance.spend).toBeCloseTo(12000, 2);
    expect(outsurance.bbbeeLevel).toBe("2");
    expect(outsurance._sourceFiles).toContain("Outsurance bbbee-certificate-2024.pdf");
  });
});

describe("merging the legacy and AI-entity section shapes", () => {
  it("prefers the AI-entity rows over the legacy rows for the same section", () => {
    // The parser returns both: the legacy path emits one synthetic aggregate
    // ownership row; the AI-entity path emits the real share register. Adding
    // both would score the register PLUS a phantom 100% holder.
    const legacy = {
      ownership: { rows: [{ shareholderName: "Measured entity — aggregate black shareholding", votingRights: 100 }] },
      procurement: { rows: [{ supplierName: "Alpha", spend: 1000 }] },
    };
    const injected = {
      ownership: { rows: [{ shareholderName: "V Naidoo", votingRights: 60 }, { shareholderName: "N Dlamini", votingRights: 40 }] },
    };

    const merged = mergeWorkbookSections(legacy, injected);
    // Ownership is the AI-entity register only — the synthetic aggregate is gone.
    expect(merged.ownership.rows).toHaveLength(2);
    expect(merged.ownership.rows!.map((r) => (r as Record<string, unknown>).shareholderName))
      .toEqual(["V Naidoo", "N Dlamini"]);
    // Procurement was untouched by the AI-entity path, so its legacy rows survive.
    expect(merged.procurement.rows).toHaveLength(1);
  });

  it("keeps legacy rows for a section the AI-entity path left empty (meta only)", () => {
    const legacy = { sed: { rows: [{ beneficiaryName: "Essentially Edenvale", amount: 16700 }] } };
    const injected = { "financial-information": { rows: [], meta: { tmps: 1030806.68 } } };

    const merged = mergeWorkbookSections(legacy, injected);
    expect(merged.sed.rows).toHaveLength(1);
    expect(merged["financial-information"].meta?.tmps).toBeCloseTo(1030806.68, 2);
    expect(merged["financial-information"].rows ?? []).toHaveLength(0);
  });

  it("lets the legacy (deterministic) value win a meta conflict", () => {
    const legacy = { "financial-information": { rows: [], meta: { tmps: 1030806.68 } } };
    const injected = { "financial-information": { rows: [], meta: { tmps: 8100064 } } };

    const merged = mergeWorkbookSections(legacy, injected);
    expect(merged["financial-information"].meta?.tmps).toBeCloseTo(1030806.68, 2);
  });
});
