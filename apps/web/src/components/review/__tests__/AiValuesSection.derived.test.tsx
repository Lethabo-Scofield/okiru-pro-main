/**
 * @vitest-environment jsdom
 *
 * A figure the parser worked out from printed ones (an EMP201 total, a leviable
 * amount from the SDL) is shown as derived, never as an AI read, and a
 * correction to it never calls it something the AI read. Values are invented.
 */
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { AiValuesSection } from "../AiValuesSection";
import type { ParserAiValue } from "@/lib/parserDocuments";

const derived: ParserAiValue = {
  key: "ai.emp201.derived_leviable_amount",
  field: "derived_leviable_amount",
  value: 12000,
  layer: "derived",
  confidence: null,
  documentId: "emp201",
  documentName: "EMP201",
  element: null,
  sourceFile: "Invented EMP201.pdf",
  page: null,
  cell: null,
  quote: "derived: SDL 120 x 100",
  grounded: null,
};

describe("AiValuesSection — derived figures", () => {
  it("badges a derived figure as derived, not as an AI read", () => {
    render(<AiValuesSection values={[derived]} corrections={new Map()} onSave={async () => {}} />);
    const badge = screen.getByTestId("layer-derived");
    expect(badge).toHaveTextContent(/derived/i);
    expect(badge).not.toHaveTextContent(/^AI$/);
  });

  it("names a corrected derived figure as worked out, not as read", () => {
    const corrections = new Map([[derived.key, { value: 13000, original: 12000 }]]);
    render(<AiValuesSection values={[derived]} corrections={corrections as never} onSave={async () => {}} />);
    const note = screen.getByTestId(`field-${derived.key}-corrected`);
    expect(note).toHaveTextContent(/worked out/i);
    expect(note).not.toHaveTextContent(/the AI read/);
  });
});
