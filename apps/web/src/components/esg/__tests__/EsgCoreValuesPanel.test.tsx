// @vitest-environment jsdom
/**
 * E4 — the core values on one panel, each followed from the documents behind
 * it to the result.
 */
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EsgCoreValuesPanel } from "../EsgCoreValuesPanel";
import { computeEsgCoreValues } from "../../../../EsgToolkit/src/lib/calculators/coreValues";
import { ESG_PROVENANCE_SECTION, provenanceCells } from "@/lib/esg/esgProvenance";

afterEach(() => cleanup());

const DIESEL = { sourceFile: "DIESEL LOG - Mar 2026.xlsx", documentId: "doc-diesel" };

function workbook(diesel: Record<string, number>) {
  return {
    companyId: "co1",
    sections: {
      "e-data": { cells: { s1a_C14: 1200, s1a_D14: 1350, s2_C41: 41_000, ...diesel } },
      [ESG_PROVENANCE_SECTION]: {
        cells: provenanceCells([
          { sectionId: "e-data", cellRef: "s1a_C14", value: 1200, ...DIESEL },
          { sectionId: "e-data", cellRef: "s1a_D14", value: 1350, ...DIESEL },
        ]),
      },
    },
    updatedAt: "2026-10-07T00:00:00.000Z",
  } as never;
}

describe("computeEsgCoreValues", () => {
  it("returns the ten core values the client signs off, in order", () => {
    expect(computeEsgCoreValues(workbook({})).map((v) => v.id)).toEqual([
      "scope1", "scope2", "scope3", "intensity", "carbon-tax", "nz-gap", "overall", "waste", "ltifr", "renewable",
    ]);
  });

  it("traces Scope 1 to the diesel report that filled it", () => {
    const scope1 = computeEsgCoreValues(workbook({})).find((v) => v.id === "scope1")!;
    expect(scope1.sources).toEqual([{ ...DIESEL, cells: 2, editedSince: 0 }]);
    expect(scope1.rule).toMatch(/emission factor/);
    expect(scope1.value).not.toBe("—");
  });

  it("says when a value is still waiting for data, and for what", () => {
    const waste = computeEsgCoreValues(workbook({})).find((v) => v.id === "waste")!;
    expect(waste.value).toBe("—");
    expect(waste.missing).toMatch(/diversion rate/);
  });
});

describe("EsgCoreValuesPanel", () => {
  it("opens a value onto its chain: documents, inputs, rule, result", () => {
    render(<EsgCoreValuesPanel workbook={workbook({})} />);
    const row = screen.getByTestId("esg-core-scope1");
    expect(row).toHaveTextContent("1 document");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const chain = screen.getByTestId("esg-core-chain-scope1");
    expect(chain).toHaveTextContent("DIESEL LOG - Mar 2026.xlsx");
    expect(chain).toHaveTextContent("2 values");
    expect(chain).toHaveTextContent(/emission factor/);
    expect(chain).toHaveTextContent(/Result/);
  });

  it("says a hand edit happened instead of pretending the document still stands behind it", () => {
    render(<EsgCoreValuesPanel workbook={workbook({ s1a_D14: 999 })} />);
    fireEvent.click(screen.getByTestId("esg-core-scope1"));
    expect(screen.getByTestId("esg-core-chain-scope1")).toHaveTextContent("1 value · 1 edited by hand since");
  });
});
