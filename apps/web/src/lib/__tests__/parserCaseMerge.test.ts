import { describe, expect, it } from "vitest";
import { mergeParserCases } from "../parserCaseMerge";
import type { ParserCaseLike } from "../parserWorkbookMap";

type AiCase = ParserCaseLike & {
  ai_entities?: { fields?: Record<string, unknown>; extractions?: Array<{ sourceFile?: string; element?: string; values?: unknown[] }> };
};

const firstRound: AiCase = {
  documents_detected: [{ filename: "shareholders.pdf", document_type: "Share register", status: "passed" }],
  supplier_rows: [{ supplier_name: "Acme", source_file: "ledger.xlsx" }],
  calculator_payload: { "ownership.entity_name": "Silver Lake" },
  ai_entities: {
    fields: { entity_name: { value: "Silver Lake Trading 447" } },
    extractions: [
      { sourceFile: "shareholders.pdf", element: "OWNERSHIP", values: [{ field: "shareholder_name", value: "T Dlamini" }] },
      { sourceFile: "ledger.xlsx", element: "PROCUREMENT", values: [] },
    ],
  },
};

describe("mergeParserCases — adding a forgotten document", () => {
  it("keeps every earlier AI extraction when a new document is read", () => {
    // The earlier merge spread the new round over the old, and ai_entities with
    // it: the shareholder register read in round one vanished in round two.
    const secondRound: AiCase = {
      documents_detected: [{ filename: "payroll.xlsx", document_type: "Payroll", status: "passed" }],
      ai_entities: { extractions: [{ sourceFile: "payroll.xlsx", element: "MANAGEMENT", values: [] }] },
    };
    const merged = mergeParserCases(firstRound, secondRound) as AiCase;
    expect(merged.ai_entities?.extractions?.map((e) => e.sourceFile)).toEqual([
      "shareholders.pdf",
      "ledger.xlsx",
      "payroll.xlsx",
    ]);
    expect(merged.documents_detected?.map((d) => d.filename)).toEqual(["shareholders.pdf", "payroll.xlsx"]);
    expect(merged.supplier_rows).toHaveLength(1);
  });

  it("lets a re-read document replace only its own earlier result", () => {
    const reread: AiCase = {
      documents_detected: [{ filename: "ledger.xlsx", document_type: "Supplier ledger", status: "passed" }],
      supplier_rows: [{ supplier_name: "Acme (Pty) Ltd", source_file: "ledger.xlsx" }],
      ai_entities: { extractions: [{ sourceFile: "ledger.xlsx", element: "PROCUREMENT", values: [{ field: "spend", value: 10 }] }] },
    };
    const merged = mergeParserCases(firstRound, reread) as AiCase;
    expect(merged.supplier_rows?.map((r) => r.supplier_name)).toEqual(["Acme (Pty) Ltd"]);
    const ledger = merged.ai_entities?.extractions?.filter((e) => e.sourceFile === "ledger.xlsx");
    expect(ledger).toHaveLength(1);
    expect(ledger?.[0].values).toHaveLength(1);
    expect(merged.ai_entities?.extractions?.some((e) => e.sourceFile === "shareholders.pdf")).toBe(true);
  });

  it("does not let two new files outvote the name resolved from the whole first batch", () => {
    const secondRound: AiCase = {
      ai_entities: {
        fields: { entity_name: { value: "SLT Holdings" }, vat_number: { value: "4123456789" } },
        extractions: [],
      },
    };
    const merged = mergeParserCases(firstRound, secondRound) as AiCase;
    expect(merged.ai_entities?.fields?.entity_name).toEqual({ value: "Silver Lake Trading 447" });
    expect(merged.ai_entities?.fields?.vat_number).toEqual({ value: "4123456789" });
  });

  it("is the new round itself when nothing was read before", () => {
    const fresh: AiCase = { documents_detected: [{ filename: "a.pdf" }] };
    expect(mergeParserCases(null, fresh)).toBe(fresh);
  });
});
