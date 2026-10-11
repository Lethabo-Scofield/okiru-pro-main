/**
 * Other documents in the review: a document none of the listed types fits (a
 * lease, a bank letter) is shown as what it is — "Other document — <label>" —
 * with the details read from it, and a suggestion is only a suggestion.
 * Every name and figure here is invented.
 */
import { describe, expect, it } from "vitest";
import { buildDocumentReview, otherDetailsOf, ruleLeftTypeOpen } from "../documentReview";
import { buildEsgDocumentReview } from "@/components/esg/esgDocumentReview";
import type { ParserCaseLike } from "../parserWorkbookMap";
import type { EsgInjectionResult, EsgParserCaseLike } from "@/components/esg/esgParserInjection";

const LEASE_OPEN = {
  other: true,
  label: "Lease agreement",
  couldEvidence: [],
  identity: {
    title: "LEASE AGREEMENT",
    issuedBy: "KESTRELVALE PROPERTY HOLDINGS (PTY) LTD",
    aboutEntity: "BAOBAB ENGINEERING (PTY) LTD",
    documentDate: "14 February 2025",
    period: null,
    referenceNumbers: ["LA-2207"],
  },
  facts: [
    { label: "Monthly rental", value: "R 18 500.00", unit: "R per month", page: 1, quote: "Monthly rental: R 18 500.00 excluding VAT" },
    { label: "Lessee", value: "BAOBAB ENGINEERING (PTY) LTD", unit: null, page: 1, quote: "BAOBAB ENGINEERING (PTY) LTD (\"the Lessee\")" },
  ],
  dropped: 0,
  proposals: [{ fact: 1, calculatorKey: "ownership.entity_name", status: "suggested" }],
};

const CASE = {
  documents_detected: [
    {
      filename: "premises-lease.pdf",
      document_type: "Other document",
      status: "failed",
      validation: { errors: ["Read as none of the listed document types (an Other document): this does not match any candidate"], warnings: [], missing_fields: [] },
    },
    { filename: "training.pdf", document_type: "Attendance registers — internal training", status: "passed" },
  ],
  ai_entities: {
    extractions: [
      {
        documentId: "open_read",
        documentName: "Other document — Lease agreement",
        sourceFile: "premises-lease.pdf",
        values: [],
        exceptions: ["Read as an Other document: it is none of the listed document types."],
        open: LEASE_OPEN,
      },
      {
        documentId: "skills_development__attendance_registers_internal_training",
        documentName: "Attendance registers — internal training",
        sourceFile: "training.pdf",
        values: [{ field: "event_name", value: "Forklift refresher" }],
        open: { other: false, identity: {}, facts: [{ label: "Venue", value: "Depot 4 training room", quote: "Venue: Depot 4 training room" }] },
      },
    ],
  },
} as unknown as ParserCaseLike;

describe("Other documents in the B-BBEE review", () => {
  const docs = buildDocumentReview({ parserCase: CASE });
  const byName = Object.fromEntries(docs.map((d) => [d.filename, d]));

  it("names it for what it is and shows what was read, without calling it unread or in trouble", () => {
    const lease = byName["premises-lease.pdf"];
    expect(lease.documentType).toBe("Other document — Lease agreement");
    expect(lease.otherDocument).toBe(true);
    expect(lease.state).toBe("read");
    expect(lease.problems).toEqual([]);
    expect(lease.notFound).toEqual([]);
    expect(lease.summary).toBe("7 details read · none scored");
    expect(lease.otherDetails?.map((d) => [d.label, d.value])).toEqual([
      ["Title", "LEASE AGREEMENT"],
      ["Issued by", "KESTRELVALE PROPERTY HOLDINGS (PTY) LTD"],
      ["About", "BAOBAB ENGINEERING (PTY) LTD"],
      ["Date", "14 February 2025"],
      ["Reference", "LA-2207"],
      ["Monthly rental", "R 18 500.00 R per month"],
      ["Lessee", "BAOBAB ENGINEERING (PTY) LTD"],
    ]);
    expect(lease.otherDetails?.[5].source).toBe("Monthly rental: R 18 500.00 excluding VAT (page 1)");
  });

  it("a suggested workbook input is a suggestion on the detail, never a value taken", () => {
    const lease = byName["premises-lease.pdf"];
    expect(lease.otherDetails?.find((d) => d.label === "Lessee")?.suggested).toBe("Ownership entity name");
    expect(lease.values).toEqual([]);
  });

  it("a listed document keeps its type and values, with its other details beside them", () => {
    const training = byName["training.pdf"];
    expect(training.documentType).toBe("Attendance registers — internal training");
    expect(training.otherDocument).toBeUndefined();
    expect(training.values.map((v) => v.label)).toEqual(["Event name"]);
    expect(training.otherDetails).toEqual([{ label: "Venue", value: "Depot 4 training room", source: "Venue: Depot 4 training room" }]);
  });

  it("a type the rule layer read stays that type when the AI read it as an Other document; its details sit beside it", () => {
    const typedCase = {
      documents_detected: [{ filename: "letter.pdf", document_type: "Share Certificate", status: "review_required" }],
      ai_entities: {
        extractions: [{
          documentId: "open_read",
          documentName: "Other document — Covering letter",
          sourceFile: "letter.pdf",
          values: [],
          open: { other: true, identity: { title: "COVERING LETTER" }, facts: [] },
        }],
      },
    } as unknown as ParserCaseLike;
    const [letter] = buildDocumentReview({ parserCase: typedCase });
    expect(letter.documentType).toBe("Share Certificate");
    expect(letter.otherDocument).toBeUndefined();
    expect(letter.otherDetails?.map((d) => [d.label, d.value])).toEqual([["Title", "COVERING LETTER"]]);
  });

  it("ruleLeftTypeOpen: failed, empty or an open type only", () => {
    expect(ruleLeftTypeOpen("failed", "Share Certificate")).toBe(true);
    expect(ruleLeftTypeOpen("review_required", "Unknown")).toBe(true);
    expect(ruleLeftTypeOpen("failed", "Other document — Lease agreement")).toBe(true);
    expect(ruleLeftTypeOpen("passed", "")).toBe(true);
    expect(ruleLeftTypeOpen("passed", "Share Certificate")).toBe(false);
  });

  it("an Other document with nothing read is still explained as unread", () => {
    const bare = otherDetailsOf([{ documentName: "Other document", sourceFile: "x.pdf", open: { other: true, identity: {}, facts: [] } }], () => true);
    expect(bare).toEqual({ otherDocument: "Other document", details: [] });
  });
});

describe("Other documents in the ESG review", () => {
  const parserCase = {
    documents: [{ file_name: "policy-schedule.pdf" }],
    ai_entities: {
      extractions: [{
        documentId: "open_read",
        documentName: "Other document — Insurance schedule",
        sourceFile: "policy-schedule.pdf",
        values: [],
        exceptions: ["Read as an Other document: it is none of the listed document types, so it was read for what it states."],
        open: {
          other: true,
          identity: { issuedBy: "Thornveld Mutual Insurance Ltd", referenceNumbers: ["PM-55120"] },
          facts: [{ label: "Rooftop solar installation capacity", value: "150", unit: "kWp", quote: "Rooftop solar installation capacity 150 kWp" }],
          proposals: [{ fact: 0, calculatorKey: "energy.solar_capacity_kwp" }],
        },
      }],
    },
  } as unknown as EsgParserCaseLike;
  const injection: EsgInjectionResult = { implemented: true, patches: {}, placed: [], unplaced: [], conflicts: [], valuesRead: 0 };

  it("names it, lists its details with the suggestion, and raises no trouble for being an Other document", () => {
    const [doc] = buildEsgDocumentReview({ parserCase, injection, uploadNames: ["policy-schedule.pdf"] });
    expect(doc.documentType).toBe("Other document — Insurance schedule");
    expect(doc.state).toBe("read");
    expect(doc.problems).toEqual([]);
    expect(doc.summary).toBe("3 details read · none scored");
    expect(doc.otherDetails?.map((d) => [d.label, d.value, d.suggested])).toEqual([
      ["Issued by", "Thornveld Mutual Insurance Ltd", undefined],
      ["Reference", "PM-55120", undefined],
      ["Rooftop solar installation capacity", "150 kWp", "Energy solar capacity kwp"],
    ]);
  });
});
