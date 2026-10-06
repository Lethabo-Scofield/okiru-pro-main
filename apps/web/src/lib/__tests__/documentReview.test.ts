import { describe, expect, it } from "vitest";
import { buildDocumentReview, reviewCounts } from "../documentReview";
import type { ParserCaseLike } from "../parserWorkbookMap";

const CASE = {
  documents_detected: [
    { filename: "shareholders.pdf", document_type: "Share register", status: "passed" },
    {
      filename: "blurry-id.jpg",
      document_type: "Unknown",
      status: "failed",
      validation: { errors: ["Best document-type confidence is below review threshold"], warnings: [], missing_fields: [] },
    },
    {
      filename: "certificate.pdf",
      document_type: "B-BBEE Certificate",
      status: "review_required",
      validation: { errors: ["Certificate expired on 2025-01-31"], warnings: [], missing_fields: ["signed_date"] },
    },
    {
      filename: "scan.pdf",
      document_type: "Payroll",
      status: "failed",
      validation: { errors: ["OCR produced no text layer for this scanned document"], warnings: [], missing_fields: [] },
    },
  ],
  fields_extracted: {
    "certificate.pdf": { bee_level: { normalized_value: 2, raw_value: "Level 2", source: { text_snippet: "B-BBEE Level 2 Contributor" } } },
  },
  ai_entities: {
    extractions: [
      {
        sourceFile: "shareholders.pdf",
        element: "OWNERSHIP",
        values: [
          { field: "shareholder_name", value: "T Dlamini", evidence: "Thandi Dlamini — 51 ordinary shares" },
          { field: "voting_rights_percentage", value: 51 },
        ],
      },
    ],
  },
} as unknown as ParserCaseLike;

describe("buildDocumentReview", () => {
  const docs = buildDocumentReview({
    parserCase: CASE,
    sections: { ownership: { rows: [{ name: "T Dlamini", _sourceFiles: ["shareholders.pdf"] }] } },
    rejected: [{ field: "economicInterest", value: "-", detail: '"-" is not a number', sourceFile: "shareholders.pdf" }],
    failedFiles: ["corrupt.xlsx"],
  });
  const byName = Object.fromEntries(docs.map((d) => [d.filename, d]));

  it("puts what needs the user first", () => {
    expect(docs.map((d) => d.state)).toEqual(["not-read", "not-read", "not-read", "needs-look", "read"]);
    expect(reviewCounts(docs)).toEqual({ read: 1, "needs-look": 1, "not-read": 3 });
  });

  it("explains an unread document in plain English, never with the parser's message", () => {
    const blurry = byName["blurry-id.jpg"];
    expect(blurry.problems[0].headline).toBe(
      "We couldn't tell what kind of document this is, so we didn't know what to look for in it.",
    );
    expect(JSON.stringify(blurry)).not.toMatch(/review threshold/);
    expect(byName["scan.pdf"].problems[0].headline).toBe("This looks like a scan or photo we couldn't read clearly.");
    expect(byName["scan.pdf"].problems[0].replace).toBe(true);
  });

  it("gives a file the parser could not open its own row, instead of dropping it", () => {
    expect(byName["corrupt.xlsx"].state).toBe("not-read");
    expect(byName["corrupt.xlsx"].problems[0].headline).toBe("We couldn't open this file.");
  });

  it("shows what was taken from a document, with the text it came from", () => {
    const shareholders = byName["shareholders.pdf"];
    expect(shareholders.state).toBe("read");
    expect(shareholders.values).toEqual(
      expect.arrayContaining([
        { label: "Shareholder name", value: "T Dlamini", source: "Thandi Dlamini — 51 ordinary shares" },
        { label: "Voting rights percentage", value: "51" },
      ]),
    );
    // Read but not placed — kept, with the reason, so it can be placed by hand.
    expect(shareholders.unplaced).toEqual([{ label: "Economic Interest", value: "-", source: '"-" is not a number' }]);
  });

  it("flags real trouble on a document that did give us something", () => {
    const cert = byName["certificate.pdf"];
    expect(cert.state).toBe("needs-look");
    expect(cert.problems[0].headline).toBe("This document has expired.");
    expect(cert.problems[0].detail).toBe("Certificate expired on 2025-01-31");
    expect(cert.values).toEqual([{ label: "Bee level", value: "2", source: "B-BBEE Level 2 Contributor" }]);
    expect(cert.notFound).toEqual(["Signed Date"]);
  });
});
