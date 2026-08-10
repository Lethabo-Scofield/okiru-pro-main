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
  entityMatchKeySorted,
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

  it("lands an Enterprise Development contribution in the ESD grid, NOT as a phantom procurement supplier", () => {
    // The dangerous bug: an ED grant routed as a supplier is counted as
    // procurement spend (inflating TMPS + Preferential Procurement) while ESD
    // loses the contribution. The contribution shape's first field
    // (beneficiary_name) must route the whole table to the `esd` section.
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [
          {
            field: "esd_contribution_rows",
            value: [
              {
                beneficiary_name: "Lerato Startup Cleaning Co-op",
                contribution_value: 40000,
                contribution_type: "Grant",
                beneficiary_black_ownership: 100,
                description_of_contribution: "Cash grant to black-owned EME supplier",
              },
            ],
          },
        ],
      }),
    ]);

    expect(result.rows.esd ?? []).toHaveLength(1);
    expect((result.rows.procurement ?? [])).toHaveLength(0);
    const row = result.rows.esd![0];
    expect(row.supplierName).toBe("Lerato Startup Cleaning Co-op");
    expect(row.amount).toBe(40000);
    expect(row.currentBlackOwnership).toBe(100);
    // "Grant" is normalised to the ESD dropdown option "Grant Contribution".
    expect(String(row.contributionType)).toContain("Grant");
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
    // The completion pass applies the W3 name/surname split (same rule as the
    // excel importer): last whitespace token is the surname.
    expect(row.name).toBe("V");
    expect(row.surname).toBe("Lutchman");
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

  it("withholds a meta value when two documents disagree, and says so", () => {
    // This used to keep whichever figure arrived first and drop the other
    // without a word. Arrival order is not evidence, and one entity-level
    // number wrong by an order of magnitude moves the whole scorecard.
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
    ]);

    expect(result.meta["financial-information"]?.revenue).toBeUndefined();
    expect(result.metaConflicts).toHaveLength(1);
    const conflict = result.metaConflicts[0];
    expect(conflict.column).toBe("revenue");
    expect(conflict.candidates.map((c) => Number(c.value)).sort((a, b) => a - b))
      .toEqual([9500000, 10826271]);
    expect(conflict.candidates.flatMap((c) => c.sources).sort()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("records corroboration when two documents state the same figure", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
    ]);

    expect(result.meta["financial-information"]?.revenue).toBe(10826271);
    expect(result.metaConflicts).toHaveLength(0);
    expect(result.metaCorroboration).toHaveLength(1);
    expect(result.metaCorroboration[0].agreementCount).toBe(2);
    expect(result.metaCorroboration[0].sources.sort()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("keeps a contested figure out even when a third document mentions it", () => {
    // Once withheld the cell is empty — and an empty cell must not read as an
    // opening for the next document to fill.
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
      extraction({ sourceFile: "c.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 7000000 }] }),
    ]);

    expect(result.meta["financial-information"]?.revenue).toBeUndefined();
    expect(result.metaConflicts[0].candidates).toHaveLength(3);
  });

  it("folds a third document agreeing with one side into that side", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
      extraction({ sourceFile: "c.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
    ]);

    const conflict = result.metaConflicts[0];
    expect(conflict.candidates).toHaveLength(2);
    expect(conflict.candidates.find((c) => Number(c.value) === 9500000)?.sources.sort())
      .toEqual(["b.pdf", "c.pdf"]);
  });

  it("does not call labelled-beats-computed a conflict", () => {
    // A stated total on the Finance sheet outranks a model-computed one by
    // rule. That disagreement is already settled, so it must NOT be put to the
    // user as a choice — asking them to re-decide what we already know is how a
    // review queue fills with noise nobody reads.
    const result = parserExtractionsToWorkbook([
      extraction({
        documentId: "sheet_financials",
        sourceFile: "wb.xlsm › Finance",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 4674994.56 }],
      }),
      extraction({
        documentId: "esd__audited_financial_statements",
        sourceFile: "afs.pdf",
        element: "ESD",
        values: [{ field: "total_pre_exclusions_tmps", value: 8100064 }],
      }),
    ]);

    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(4674994.56, 2);
    expect(result.metaConflicts).toHaveLength(0);
  });

  it("lets a LABELLED reading replace a model-computed one, whatever the order", () => {
    // The model-computed TMPS summed the exclusions back in (8,100,064); the
    // Finance sheet's own stated total is 4,674,994.56. A stated total beats a
    // computed one even when it arrives second.
    const result = parserExtractionsToWorkbook([
      extraction({
        documentId: "esd__audited_financial_statements_or_signed_management_accounts_w",
        sourceFile: "wb.xlsm › Finance",
        element: "ESD",
        values: [{ field: "total_pre_exclusions_tmps", value: 8100064 }],
      }),
      extraction({
        documentId: "sheet_financials",
        sourceFile: "wb.xlsm › Finance",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 4674994.56 }],
      }),
    ]);

    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(4674994.56, 2);
  });

  it("never lets a computed value overwrite a labelled one", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        documentId: "sheet_financials",
        sourceFile: "wb.xlsm › Finance",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 4674994.56 }],
      }),
      extraction({
        documentId: "esd__audited_financial_statements_or_signed_management_accounts_w",
        sourceFile: "other.xlsm › Finance",
        element: "ESD",
        values: [{ field: "total_pre_exclusions_tmps", value: 8100064 }],
      }),
    ]);

    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(4674994.56, 2);
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
    // Word order is not identity — the SORTED twin handles surname-first.
    expect(entityMatchKeySorted("Chiyangwa, Jeffrey")).toBe(entityMatchKeySorted("Jeffrey Chiyangwa"));
    expect(entityMatchKeySorted("Venugopal Lutchman, Naidoo")).toBe(entityMatchKeySorted("Naidoo Venugopal Lutchman"));
    // Still not fuzzy: initials are not expanded into names, on either form.
    expect(entityMatchKey("S. Nhlanhla")).not.toBe(entityMatchKey("Sandile Nhlanhla"));
    expect(entityMatchKeySorted("S. Nhlanhla")).not.toBe(entityMatchKeySorted("Sandile Nhlanhla"));
    expect(entityMatchKey("TST Truck")).not.toBe(entityMatchKey("TST Truc Chassis"));
  });

  it("a supplier's ledger corroborates the schedule instead of doubling it", () => {
    // Different DOCUMENTS reporting the same supplier's spend are the same fact
    // stated twice. Counting both would report R2.04m for a supplier the client
    // claimed R412,797 for. Precedence follows the EVIDENCE CLASS: verification
    // methodology ranks the accounting record above a client-prepared schedule,
    // so the ledger's figure is scored — and the gap is still reported.
    const linked = link({
      procurement: [
        row({ supplierName: "BP Edenvale", spend: 412797.4 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "B P EDENVALE", spend: 1628821.85 }, ["B P EDENVALE LEDGER.xlsx"]),
      ],
    });

    expect(linked.rows.procurement).toHaveLength(1);
    expect(linked.rows.procurement![0].spend).toBeCloseTo(1628821.85, 2);
    expect(linked.reconciliation).toHaveLength(1);
    expect(linked.reconciliation[0].message).toContain("B P EDENVALE LEDGER.xlsx");
    expect(linked.reconciliation[0].message).toContain("accounting record");
  });

  it("the ledger wins even when it is LOWER — precedence is the source, not the direction", () => {
    // A schedule over-claiming against its own ledger is exactly the case that
    // gets a certificate revoked.
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", spend: 900000 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "Alpha", spend: 250000 }, ["ALPHA LEDGER.xlsx"]),
      ],
    });
    expect(linked.rows.procurement![0].spend).toBe(250000);
  });

  it("between two documents of the same class, the LOWER figure is kept", () => {
    const linked = link({
      procurement: [
        row({ supplierName: "Alpha", spend: 500 }, ["a.xlsm › Procurement"]),
        row({ supplierName: "Alpha", spend: 700 }, ["b.xlsm › Procurement"]),
      ],
    });
    expect(linked.rows.procurement![0].spend).toBe(500);
  });

  it("warns when a ledger matched nothing — the double-count risk", () => {
    // Matching is exact by design, so "TST TRUCK" never becomes "TST Truc
    // Chassis". Rather than guess, both rows survive and the risk is stated.
    const linked = link({
      procurement: [
        row({ supplierName: "TST Truc Chassis", spend: 50271.3 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "TST TRUCK", spend: 107605.5 }, ["TST TRUCK LEDGER.xlsx"]),
      ],
    });

    expect(linked.rows.procurement).toHaveLength(2);
    const warning = linked.reconciliation.find((f) => f.message.includes("counted twice"));
    expect(warning).toBeDefined();
    expect(warning!.message).toContain("TST TRUCK LEDGER.xlsx");
  });

  it("does not warn about a ledger that DID link", () => {
    const linked = link({
      procurement: [
        row({ supplierName: "BP Edenvale", spend: 412797.4 }, ["wb.xlsm › Procurement"]),
        row({ supplierName: "B P EDENVALE", spend: 1628821.85 }, ["B P EDENVALE LEDGER.xlsx"]),
      ],
    });
    expect(linked.reconciliation.some((f) => f.message.includes("counted twice"))).toBe(false);
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

describe("completion pass — derivable required fields are filled, never fabricated", () => {
  // The 64-file Thandanani pack produced 339 "Required" validation issues,
  // most of them derivable from values already on the row.
  it("splits a full name into name + surname on management rows (comma form honoured)", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "MANAGEMENT_CONTROL",
        values: [
          { field: "employee_name", value: "Venugopal Lutchman, Naidoo" },
          { field: "occupational_level", value: "Top Management" },
        ],
      }),
    ]);
    const row = result.rows["management-control"]![0];
    expect(row.name).toBe("Venugopal Lutchman");
    expect(row.surname).toBe("Naidoo");
  });

  it("does NOT guess a supplier's size — an unknown size stays blank (purity rule)", () => {
    // Defaulting to "Generic" wrote a value the evidence did not contain and
    // moved the procurement score. Unknown stays unknown; reconcileEntity flags
    // it as a coverage gap instead.
    const result = parserExtractionsToWorkbook([
      extraction({ values: [{ field: "supplier_name", value: "Alpha" }, { field: "bee_level", value: "2" }] }),
    ]);
    expect(String(result.rows.procurement![0].currentSize ?? "")).toBe("");
  });

  it("composes sed descriptionOfSpend from the row's own type + beneficiary", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "SED",
        values: [
          { field: "beneficiary_name", value: "OUTA" },
          { field: "contribution_type", value: "Grant Contribution" },
          { field: "contribution_amount", value: "400" },
        ],
      }),
    ]);
    const row = result.rows.sed![0];
    expect(row.descriptionOfSpend).toBe("Grant Contribution — OUTA");
  });

  it("drops identity-less ownership fragments (a totals line is not a shareholder)", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        values: [{
          field: "share_register",
          value: [
            { shareholder_name: "V Naidoo", shares_held: 100 },
            { shares_held: 100 }, // register totals line — no identity
          ],
        }],
      }),
    ]);
    expect(result.rows.ownership).toHaveLength(1);
    expect(result.rows.ownership![0].shareholderName).toBe("V Naidoo");
  });
});

describe("no nameless people on the grid", () => {
  it("adopts the name from an exact 13-digit ID match elsewhere in the pack", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        sourceFile: "share_certs.pdf",
        element: "OWNERSHIP",
        values: [{
          field: "share_register",
          value: [{ id_number: "9001010001087", shares_held: 40 }],
        }],
      }),
      extraction({
        sourceFile: "id_register.xlsx",
        element: "MANAGEMENT_CONTROL",
        values: [{
          field: "employee_register",
          value: [{ employee_name: "Nomvula Dlamini", id_number: "9001010001087", occupational_level: "Top Management" }],
        }],
      }),
    ]);
    expect(result.rows.ownership).toHaveLength(1);
    expect(result.rows.ownership![0].shareholderName).toBe("Nomvula Dlamini");
  });

  it("parks an unresolvable nameless owner for review instead of creating it", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        sourceFile: "share_certs.pdf",
        element: "OWNERSHIP",
        values: [{
          field: "share_register",
          value: [
            { shareholder_name: "V Naidoo", shares_held: 60 },
            { id_number: "9001015001087", shares_held: 40 }, // ID never named anywhere
          ],
        }],
      }),
    ]);
    expect(result.rows.ownership).toHaveLength(1);
    expect(result.rows.ownership![0].shareholderName).toBe("V Naidoo");
    const parked = result.rejected.find((r) => r.field === "shareholderName");
    expect(parked).toBeDefined();
    expect(parked!.detail).toContain("9001015001087");
    expect(parked!.detail).toMatch(/parked for review/i);
  });
});

describe("same-document exact duplicates collapse to one", () => {
  it("collapses a verbatim duplicate emission and reports the collapse", () => {
    const entry = {
      beneficiary_name: "Essentially Edenvale",
      contribution_type: "Grant Contribution",
      percent_black_beneficiaries: "100%",
      contribution_amount: "500",
    };
    const result = parserExtractionsToWorkbook([
      extraction({
        sourceFile: "sed_register.xlsx",
        element: "SED",
        values: [
          { field: "contribution_register", value: [entry, { ...entry }] },
        ],
      }),
    ]);
    expect(result.rows.sed).toHaveLength(1);
    const finding = result.reconciliation.find((f) => f.section === "sed");
    expect(finding?.message).toMatch(/collapsed to one/i);
  });

  it("keeps same-document rows that differ in any cell (real repeated donations)", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        sourceFile: "sed_register.xlsx",
        element: "SED",
        values: [{
          field: "contribution_register",
          value: [
            { beneficiary_name: "OUTA", contribution_amount: "500", transaction_date: "2026-01-31" },
            { beneficiary_name: "OUTA", contribution_amount: "500", transaction_date: "2026-02-28" },
          ],
        }],
      }),
    ]);
    expect(result.rows.sed).toHaveLength(2);
  });
});

describe("ledger-block attribute inheritance (same beneficiary only)", () => {
  it("inherits contributionType + % black to continuation rows of the same beneficiary", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "SED",
        values: [{
          field: "contribution_register",
          value: [
            // Two GENUINE contributions to the same beneficiary — distinct dates
            // keep them from being exact-duplicates (the continuation still
            // inherits the header's type/%-black).
            { beneficiary_name: "Essentially Edenvale", contribution_type: "Grant Contribution", percent_black_beneficiaries: "100%", contribution_amount: "500", transaction_date: "2026-01-31" },
            { beneficiary_name: "Essentially Edenvale", contribution_amount: "500", transaction_date: "2026-02-28" },
            { beneficiary_name: "Other Org", contribution_amount: "900" },
          ],
        }],
      }),
    ]);
    const rows = result.rows.sed!;
    const continuation = rows.find((r) => r.beneficiaryName === "Essentially Edenvale" && r !== rows[0]);
    expect(continuation?.contributionType).toBe("Grant Contribution");
    // A DIFFERENT beneficiary must not inherit anything.
    const other = rows.find((r) => r.beneficiaryName === "Other Org");
    expect(other?.contributionType).toBeUndefined();
  });
});

describe("the parser's resolver decides entity-level figures", () => {
  // The resolver saw every document at once. This loop sees one at a time, so
  // where the resolver has an opinion it is strictly better informed — and it
  // was being thrown away entirely before.
  const resolvedField = (
    over: Partial<import("../parserToWorkbook").ResolvedFieldInfo> = {},
  ): import("../parserToWorkbook").ResolvedFieldInfo => ({
    field: "current_year_revenue",
    value: 10826271,
    sources: ["a.pdf"],
    agreementCount: 1,
    conflicted: false,
    alternatives: [],
    ...over,
  });

  it("uses the resolver's value over anything decided document-by-document", () => {
    const result = parserExtractionsToWorkbook(
      [extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 111 }] })],
      { resolved: { current_year_revenue: resolvedField({ value: 10826271 }) } },
    );
    expect(result.meta["financial-information"]?.revenue).toBe(10826271);
  });

  it("carries the resolver's corroboration through", () => {
    const result = parserExtractionsToWorkbook(
      [extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] })],
      {
        resolved: {
          current_year_revenue: resolvedField({ agreementCount: 3, sources: ["a.pdf", "b.pdf", "c.pdf"] }),
        },
      },
    );
    expect(result.metaCorroboration[0].agreementCount).toBe(3);
    expect(result.metaCorroboration[0].sources).toHaveLength(3);
  });

  it("scores nothing from a field the resolver marked conflicted", () => {
    const result = parserExtractionsToWorkbook(
      [extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] })],
      {
        resolved: {
          current_year_revenue: resolvedField({
            conflicted: true,
            alternatives: [{ value: 9500000, sources: ["b.pdf"] }],
          }),
        },
      },
    );
    expect(result.meta["financial-information"]?.revenue).toBeUndefined();
    expect(result.metaConflicts).toHaveLength(1);
    expect(result.metaConflicts[0].candidates.map((c) => c.value)).toEqual([10826271, 9500000]);
  });

  it("does not record corroboration for a single-source value", () => {
    const result = parserExtractionsToWorkbook(
      [extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] })],
      { resolved: { current_year_revenue: resolvedField({ agreementCount: 1 }) } },
    );
    expect(result.metaCorroboration).toHaveLength(0);
  });
});
